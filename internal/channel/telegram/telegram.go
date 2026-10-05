// Package telegram is the first port.Channel implementation: a stdlib
// long-poll Telegram adapter (no bot library). Inbound: owner messages →
// core.Service.CaptureShare (text, links and downloaded media),
// inline-button callback queries → status/research/retry, emoji reactions →
// horizon refinement, replies to a card message → tag/note appending
// (organize-by-reply). Outbound: Notify renders created cards as caption text
// + inline keyboard and research reports as a public-URL link. Config is
// passed field-by-field (Token, OwnerID) so the loop is easy to wire in tests.
package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"sparkkeep/internal/capture"
	"sparkkeep/internal/core"
	"sparkkeep/internal/port"
)

const apiBase = "https://api.telegram.org"

var _ port.Channel = (*Adapter)(nil)

// Adapter implements port.Channel (outbound Notify) and the long-poll Run
// loop. Service and Store are injected; callback/reaction handling uses the
// injected Store directly, inbound messages go through Service.Capture.
type Adapter struct {
	Token     string
	OwnerID   int64 // configured TG_CHAT_ID; everyone else is ignored
	PublicURL string
	Service   *core.Service
	Store     port.Store
	Logf      func(format string, args ...any)

	baseURL string          // unexported: httptest server in tests, else apiBase
	httpc   *http.Client    // unexported: default client unless tests override
	msgCard map[int64]int64 // bot message_id → card_id, for reactions
	msgMu   sync.Mutex
	offsetP string        // unexported: offset file override for tests
	sem     chan struct{} // concurrency limiter
}

// Run blocks long-polling getUpdates until ctx is cancelled. Each update is
// dispatched to its own goroutine; after each batch the confirmed offset is
// persisted so a restart resumes with only unconfirmed updates.
func (a *Adapter) Run(ctx context.Context) error {
	if a.sem == nil {
		a.sem = make(chan struct{}, 3)
	}
	offset := a.readOffset()
	for {
		if ctx.Err() != nil {
			return nil
		}
		params := url.Values{}
		params.Set("timeout", "25")
		if offset > 0 {
			params.Set("offset", strconv.FormatInt(offset+1, 10))
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet,
			fmt.Sprintf("%s/bot%s/getUpdates?%s", a.apiBase(), a.Token, params.Encode()), nil)
		if err != nil {
			return err
		}
		resp, err := a.httpClient().Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			a.logf("telegram: getUpdates: %v", err)
			if !sleepCtx(ctx, 3*time.Second) {
				return nil
			}
			continue
		}
		body, rerr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if rerr != nil {
			a.logf("telegram: read getUpdates body: %v", rerr)
			continue
		}
		if resp.StatusCode != http.StatusOK {
			a.logf("telegram: getUpdates status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
			if !sleepCtx(ctx, 3*time.Second) {
				return nil
			}
			continue
		}
		var batch struct {
			OK     bool     `json:"ok"`
			Result []update `json:"result"`
		}
		if err := json.Unmarshal(body, &batch); err != nil || !batch.OK {
			a.logf("telegram: bad getUpdates payload: %v", err)
			if !sleepCtx(ctx, 3*time.Second) {
				return nil
			}
			continue
		}
		if len(batch.Result) == 0 {
			continue
		}
		var wg sync.WaitGroup
		for _, u := range batch.Result {
			if u.ID > offset {
				offset = u.ID
			}
			wg.Add(1)
			go func(u update) {
				defer wg.Done()
				select {
				case a.sem <- struct{}{}:
					defer func() { <-a.sem }()
					a.handleUpdate(u)
				case <-ctx.Done():
					return
				}
			}(u)
		}
		wg.Wait()
		a.writeOffset(offset)
	}
}

// Notify implements port.Channel: kind → message shape.
func (a *Adapter) Notify(ctx context.Context, n port.Notification) error {
	switch n.Kind {
	case "created":
		return a.sendCard(ctx, n.Card)
	case "analysis_failed":
		return a.sendFailed(ctx, n.Card)
	case "research_done", "research_failed":
		return a.sendResearch(ctx, n)
	case "duplicate":
		_, err := a.sendMessage(ctx, n.Text, 0, nil)
		return err
	default: // done / retry / hello: plain card summary
		_, err := a.sendMessage(ctx, fmt.Sprintf("%s\n%s", n.Card.Title, n.Card.Summary), 0, nil)
		return err
	}
}

// --- outbound ---------------------------------------------------------------

type button struct {
	Text         string `json:"text"`
	CallbackData string `json:"callback_data,omitempty"`
}

// call POSTs a JSON body to a bot method and returns the result payload; a
// Telegram-side rejection surfaces as a non-nil error.
func (a *Adapter) call(ctx context.Context, method string, body any) (json.RawMessage, error) {
	b, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		fmt.Sprintf("%s/bot%s/%s", a.apiBase(), a.Token, method), bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := a.httpClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var out struct {
		OK          bool            `json:"ok"`
		Description string          `json:"description"`
		Result      json.RawMessage `json:"result"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("telegram: %s: bad response: %w", method, err)
	}
	if !out.OK {
		return nil, fmt.Errorf("telegram: %s: %s", method, out.Description)
	}
	return out.Result, nil
}

// sendMessage posts a Markdown text message with an optional inline keyboard
// and returns the bot message id. cardID>0 records message_id→card so the
// "reaction on a card message" refinement can find the card.
func (a *Adapter) sendMessage(ctx context.Context, text string, cardID int64, buttons [][]button) (int64, error) {
	msg := map[string]any{
		"chat_id":    a.OwnerID,
		"text":       text,
		"parse_mode": "Markdown",
	}
	if len(buttons) > 0 {
		msg["reply_markup"] = map[string]any{"inline_keyboard": buttons}
	}
	res, err := a.call(ctx, "sendMessage", msg)
	if err != nil {
		return 0, err
	}
	var sent struct {
		MessageID int64 `json:"message_id"`
	}
	if err := json.Unmarshal(res, &sent); err != nil {
		return 0, fmt.Errorf("telegram: sendMessage result: %w", err)
	}
	a.trackMessage(sent.MessageID, cardID)
	return sent.MessageID, nil
}

// sendCard renders a created card as caption text + the four action buttons.
func (a *Adapter) sendCard(ctx context.Context, c port.Card) error {
	_, err := a.sendMessage(ctx, cardCaption(c), c.ID, cardButtons(c.ID, false))
	return err
}

// cardCaption formats a card as Markdown: bold title, executive summary (or
// the plain summary), the proposed actions as a "Next Steps" bullet list, then
// horizon and tags. Parts are trimmed and blank actions dropped so a padded
// field can't leave a stray empty line in the caption.
func cardCaption(c port.Card) string {
	body := c.Summary
	if c.ExecutiveSummary != "" {
		body = c.ExecutiveSummary
	}
	var bullets []string
	for _, a := range c.ProposedActions {
		if a = strings.TrimSpace(a); a != "" {
			bullets = append(bullets, "• "+a)
		}
	}
	var b strings.Builder
	fmt.Fprintf(&b, "*%s*\n\n%s", strings.TrimSpace(c.Title), strings.TrimSpace(body))
	if len(bullets) > 0 {
		b.WriteString("\n\n*Next Steps:*\n" + strings.Join(bullets, "\n"))
	}
	fmt.Fprintf(&b, "\n\n[%s]", strings.TrimSpace(c.Horizon))
	if len(c.Tags) > 0 {
		b.WriteString("\n#" + strings.Join(c.Tags, " #"))
	}
	return b.String()
}

// sendFailed renders the analysis-failure card: same buttons plus Retry.
func (a *Adapter) sendFailed(ctx context.Context, c port.Card) error {
	_, err := a.sendMessage(ctx, "Analysis failed", c.ID, cardButtons(c.ID, true))
	return err
}

func cardButtons(id int64, retry bool) [][]button {
	btns := [][]button{{
		{Text: "Doing", CallbackData: fmt.Sprintf("%d:doing", id)},
		{Text: "Done", CallbackData: fmt.Sprintf("%d:done", id)},
		{Text: "Research", CallbackData: fmt.Sprintf("%d:research", id)},
		{Text: "Shelve", CallbackData: fmt.Sprintf("%d:shelve", id)},
	}, {
		{Text: "Not interested", CallbackData: fmt.Sprintf("%d:dismiss", id)},
	}}
	if retry {
		btns[0] = append(btns[0], button{Text: "Retry", CallbackData: fmt.Sprintf("%d:retry", id)})
	}
	return btns
}

// sendResearch renders a research outcome as summary text + a dashboard link
// to the report row (/api/v1/research/{id}), base from SPARKKEEP_PUBLIC_URL.
func (a *Adapter) sendResearch(ctx context.Context, n port.Notification) error {
	text := n.Text
	if text == "" {
		text = "Research failed"
	}
	base := a.PublicURL
	if base == "" {
		base = "http://localhost:8080"
	}
	link := strings.TrimRight(base, "/") + "/api/v1/research/"
	var (
		buttons [][]button
		cardID  int64
	)
	if n.Res != nil {
		link += strconv.FormatInt(n.Res.ID, 10)
		cardID = n.Res.CardID
		buttons = cardButtons(cardID, false)
	}
	_, err := a.sendMessage(ctx, text+"\n"+link, cardID, buttons)
	return err
}

// --- inbound ----------------------------------------------------------------

// update mirrors the subset of the Telegram Update object the bot consumes.
type update struct {
	ID       int64            `json:"update_id"`
	Msg      *message         `json:"message"`
	CB       *callbackQuery   `json:"callback_query"`
	Reaction *messageReaction `json:"message_reaction"`
}

type message struct {
	MessageID      int64       `json:"message_id"`
	Chat           *chat       `json:"chat"`
	Text           string      `json:"text"`
	Caption        string      `json:"caption"`
	ReplyToMessage *message    `json:"reply_to_message"` // organize-by-reply target
	Photo          []photoSize `json:"photo"`
	Voice          *voiceNote  `json:"voice"`
	Audio          *audioFile  `json:"audio"`
	Document       *document   `json:"document"`
	Video          *videoFile  `json:"video"`
}

type photoSize struct {
	FileID string `json:"file_id"`
}

type voiceNote struct {
	FileID   string `json:"file_id"`
	MimeType string `json:"mime_type"`
	Duration int    `json:"duration"`
}

type audioFile struct {
	FileID   string `json:"file_id"`
	MimeType string `json:"mime_type"`
}

type document struct {
	FileID   string `json:"file_id"`
	FileName string `json:"file_name"`
	MimeType string `json:"mime_type"`
}

type videoFile struct {
	FileID   string `json:"file_id"`
	MimeType string `json:"mime_type"`
	Duration int    `json:"duration"`
}

type chat struct {
	ID int64 `json:"id"`
}

type callbackQuery struct {
	ID      string   `json:"id"`
	From    *user    `json:"from"`
	Data    string   `json:"data"`
	Message *message `json:"message"`
}

type user struct {
	ID int64 `json:"id"`
}

type messageReaction struct {
	Chat        *chat           `json:"chat"`
	MessageID   int64           `json:"message_id"`
	NewReaction []emojiReaction `json:"new_reaction"`
}

type emojiReaction struct {
	Type  string `json:"type"`
	Emoji string `json:"emoji"`
}

func (a *Adapter) handleUpdate(u update) {
	switch {
	case u.Msg != nil:
		a.handleMessage(u.Msg)
	case u.CB != nil:
		a.handleCallback(u.CB)
	case u.Reaction != nil:
		a.handleReaction(u.Reaction)
	}
}

// handleMessage funnels text, links and media into CaptureShare. A message
// with neither text nor a downloadable payload is dropped; so is anything
// from a chat that is not the owner. A reply to one of the bot's own card
// messages is the organize-by-reply signal instead of a new share.
func (a *Adapter) handleMessage(m *message) {
	if m.Chat == nil || m.Chat.ID != a.OwnerID {
		return // owner lock: single-user bot ignores everyone else
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	if m.ReplyToMessage != nil {
		// A reply to a card the bot posted organizes that card. A reply to
		// anything else (or to a card evicted from the tracked map) falls
		// through, so the message is never lost.
		if cardID := a.cardForMessage(m.ReplyToMessage.MessageID); cardID > 0 {
			raw := m.Text
			if raw == "" {
				raw = m.Caption
			}
			a.organizeReply(ctx, cardID, raw)
			return
		}
	}
	share, ok := ShareFromUpdate(m, func(fileID string) ([]byte, error) {
		data, err := a.downloadFile(fileID)
		if err != nil {
			// Telegram file_ids expire after ~an hour, so this is the
			// expected failure path, not an edge case: log it, because
			// ShareFromUpdate reports it only as "drop the update".
			a.logf("telegram: download %s: %v", fileID, err)
		}
		return data, err
	})
	if !ok {
		return
	}
	if _, err := a.Service.CaptureShare(ctx, share); err != nil {
		a.logf("telegram: capture: %v", err)
	}
}

// hashtagRe matches the "#tag" tokens of an organize-by-reply message.
var hashtagRe = regexp.MustCompile(`#[a-zA-Z0-9_]+`)

// organizeReply applies an organize-by-reply message to a card: its hashtags
// merge into the card's tags and the remaining text is appended to the note,
// then a one-line confirmation is sent back. Store failures are logged, not
// fatal — the message is never worth losing the reply thread over.
func (a *Adapter) organizeReply(ctx context.Context, cardID int64, raw string) {
	text := strings.TrimSpace(raw)
	if text == "" {
		return
	}
	card, err := a.Store.GetCard(ctx, cardID)
	if err != nil {
		a.logf("telegram: organize reply: GetCard(%d): %v", cardID, err)
		return
	}
	if rest := strings.TrimSpace(hashtagRe.ReplaceAllString(text, "")); rest != "" {
		note := rest
		if old := strings.TrimSpace(card.SourceNote); old != "" {
			note = old + "\n" + rest
		}
		if _, err := a.Store.UpdateCard(ctx, cardID, port.CardPatch{Note: &note}); err != nil {
			a.logf("telegram: organize reply: UpdateCard(%d): %v", cardID, err)
		}
	}
	tags := mergeTags(card.Tags, hashtagRe.FindAllString(text, -1))
	if len(tags) > len(card.Tags) {
		if err := a.Store.SetCardTags(ctx, cardID, tags); err != nil {
			a.logf("telegram: organize reply: SetCardTags(%d): %v", cardID, err)
		}
	}
	confirm := fmt.Sprintf("Updated card #%d", cardID)
	if len(tags) > 0 {
		confirm += "\n#" + strings.Join(tags, " #")
	}
	if _, err := a.sendMessage(ctx, confirm, 0, nil); err != nil {
		a.logf("telegram: organize reply: sendMessage: %v", err)
	}
}

// mergeTags appends the lowercased, "#"-stripped hashTags to existing,
// preserving order and dropping duplicates (comparison is case-insensitive).
func mergeTags(existing, hashTags []string) []string {
	out := append([]string{}, existing...)
	seen := make(map[string]bool, len(out))
	for _, t := range out {
		seen[strings.ToLower(t)] = true
	}
	for _, raw := range hashTags {
		tag := strings.ToLower(strings.TrimPrefix(raw, "#"))
		if tag == "" || seen[tag] {
			continue
		}
		seen[tag] = true
		out = append(out, tag)
	}
	return out
}

// ShareFromUpdate maps a Telegram message to a capture.Share, downloading
// the first media payload when bytesFn is non-nil. ok is false when the
// message carries neither text nor media, which is the only case the caller
// should drop.
//
// A photo is the largest of Photo's sizes; Telegram orders them ascending, so
// the last entry is the full-resolution original.
func ShareFromUpdate(m *message, bytesFn func(string) ([]byte, error)) (capture.Share, bool) {
	caption := m.Caption
	text := m.Text

	if f, name, mime, ok := firstMedia(m); ok {
		var data []byte
		if bytesFn != nil {
			var err error
			data, err = bytesFn(f)
			if err != nil {
				return capture.Share{}, false
			}
		}
		return capture.Share{
			Kind:    capture.KindForMime(mime),
			Caption: caption,
			Files:   []capture.File{{Name: name, Mime: mime, Data: data}},
		}, true
	}

	raw := text
	if raw == "" {
		raw = caption
	}
	if strings.TrimSpace(raw) == "" {
		return capture.Share{}, false
	}
	return capture.Recognize(raw), true
}

// firstMedia returns the file id, filename, and mime of the first media
// payload on the message, preferring video then document then audio then
// photo, since a reel arrives as video and a saved file as a document.
func firstMedia(m *message) (fileID, name, mime string, ok bool) {
	switch {
	case m.Video != nil:
		return m.Video.FileID, "video.mp4", orMime(m.Video.MimeType, "video/mp4"), true
	case m.Document != nil:
		name = m.Document.FileName
		if name == "" {
			name = "document"
		}
		return m.Document.FileID, name, orMime(m.Document.MimeType, "application/octet-stream"), true
	case m.Voice != nil:
		return m.Voice.FileID, "voice.ogg", orMime(m.Voice.MimeType, "audio/ogg"), true
	case m.Audio != nil:
		return m.Audio.FileID, "audio.m4a", orMime(m.Audio.MimeType, "audio/mpeg"), true
	case len(m.Photo) > 0:
		last := m.Photo[len(m.Photo)-1]
		return last.FileID, "photo.jpg", "image/jpeg", true
	}
	return "", "", "", false
}

func orMime(v, def string) string {
	if strings.TrimSpace(v) == "" {
		return def
	}
	return v
}

// maxTelegramFile caps a downloaded Telegram payload. Telegram bots accept
// up to 20MB via getFile; the cap keeps a malformed response from exhausting
// memory.
const maxTelegramFile = 20 << 20

// downloadFile fetches a file's bytes through the getFile endpoint. The URL
// it returns is only valid briefly, so it is fetched immediately.
func (a *Adapter) downloadFile(fileID string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	raw, err := a.call(ctx, "getFile", map[string]any{"file_id": fileID})
	if err != nil {
		return nil, err
	}
	var meta struct {
		FilePath string `json:"file_path"`
	}
	if err := json.Unmarshal(raw, &meta); err != nil {
		return nil, err
	}
	if meta.FilePath == "" {
		return nil, fmt.Errorf("telegram: getFile returned no path for %s", fileID)
	}
	durl := fmt.Sprintf("%s/file/bot%s/%s", a.apiBase(), a.Token, meta.FilePath)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, durl, nil)
	if err != nil {
		return nil, err
	}
	resp, err := a.httpClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("telegram: download %s: status %d", meta.FilePath, resp.StatusCode)
	}
	// Reject oversized files rather than truncating: a partial image/audio
	// handed to Vision/ASR is worse than a clean drop. Read one byte past the
	// limit to detect the overage.
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxTelegramFile+1))
	if err != nil {
		return nil, err
	}
	if len(data) > maxTelegramFile {
		return nil, fmt.Errorf("telegram: %s exceeds %d bytes", meta.FilePath, maxTelegramFile)
	}
	return data, nil
}

// handleCallback maps `<card_id>:<action>` data to store updates / research:
// doing|done|shelve → status change (+ Notify done), research → goroutine
// Research run, retry → Service.Retry.
func (a *Adapter) handleCallback(cb *callbackQuery) {
	if cb.From == nil || cb.From.ID != a.OwnerID {
		return
	}
	id, action, ok := parseCallback(cb.Data)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	switch action {
	case "doing":
		a.setStatus(ctx, id, port.StatusDoing, cb)
	case "done":
		a.setStatus(ctx, id, port.StatusDone, cb)
	case "shelve":
		a.setStatus(ctx, id, port.StatusShelved, cb)
	case "dismiss":
		a.setStatus(ctx, id, port.StatusDismissed, cb)
	case "research":
		if active, err := a.Store.HasActiveResearch(ctx, id); err != nil {
			a.logf("telegram: HasActiveResearch(%d): %v", id, err)
		} else if active {
			a.ackCallback(cb.ID, "Research already running")
			return
		}
		a.ackCallback(cb.ID, "")
		a.Service.GoResearch(ctx, id)
	case "retry":
		a.ackCallback(cb.ID, "")
		if _, err := a.Service.Retry(ctx, id); err != nil {
			a.logf("telegram: retry %d: %v", id, err)
		}
	}
}

func parseCallback(data string) (id int64, action string, ok bool) {
	parts := strings.SplitN(data, ":", 2)
	if len(parts) != 2 {
		return 0, "", false
	}
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil || id <= 0 {
		return 0, "", false
	}
	return id, parts[1], true
}

// setStatus persists a status change, answers the callback, clears the
// button keyboard and, for doing/done, sends the "done" summary.
func (a *Adapter) setStatus(ctx context.Context, id int64, status string, cb *callbackQuery) {
	_, err := a.Store.UpdateCard(ctx, id, port.CardPatch{Status: &status})
	if err != nil {
		a.logf("telegram: UpdateCard(%d, %s): %v", id, status, err)
	}
	a.ackCallback(cb.ID, "")
	if (status == port.StatusDoing || status == port.StatusDone || status == port.StatusDismissed) && cb.Message != nil && cb.Message.MessageID != 0 && cb.Message.Chat != nil {
		a.editReplyMarkup(ctx, cb.Message.Chat.ID, cb.Message.MessageID)
	}
	if status == port.StatusDoing || status == port.StatusDone {
		if card, gerr := a.Store.GetCard(ctx, id); gerr == nil {
			if nerr := a.Notify(ctx, port.Notification{Kind: "done", Card: card}); nerr != nil {
				a.logf("telegram: notify done: %v", nerr)
			}
		}
	}
}

// ackCallback stops Telegram's button-spinner even when the action itself is
// handled async (research) or fails. text (optional) shows as a toast next
// to the button; empty sends a bare ack.
func (a *Adapter) ackCallback(id, text string) {
	if id == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	body := map[string]any{"callback_query_id": id}
	if text != "" {
		body["text"] = text
	}
	if _, err := a.call(ctx, "answerCallbackQuery", body); err != nil {
		a.logf("telegram: answerCallbackQuery: %v", err)
	}
}

// editReplyMarkup clears the inline keyboard once an action is taken so the
// buttons can't be re-pressed.
func (a *Adapter) editReplyMarkup(ctx context.Context, chatID, msgID int64) {
	if _, err := a.call(ctx, "editMessageReplyMarkup", map[string]any{
		"chat_id":    chatID,
		"message_id": msgID,
		"reply_markup": map[string]any{
			"inline_keyboard": [][]button{},
		},
	}); err != nil {
		a.logf("telegram: editMessageReplyMarkup: %v", err)
	}
}

// handleReaction refines a card's horizon from an emoji on its bot message:
// ⭐ → lifetime, ⚡ → short-term. ponytail: passive hard-coded map; new
// reactions become a config map addition later.
func (a *Adapter) handleReaction(r *messageReaction) {
	var horizon string
	for _, re := range r.NewReaction {
		switch re.Emoji {
		case "⭐":
			horizon = port.HorizonLifetime
		case "⚡":
			horizon = port.HorizonShortTerm
		}
		if horizon != "" {
			break
		}
	}
	if horizon == "" {
		return
	}
	cardID := a.cardForMessage(r.MessageID)
	if cardID == 0 {
		return
	}
	if _, err := a.Store.UpdateCard(context.Background(), cardID, port.CardPatch{Horizon: &horizon}); err != nil {
		a.logf("telegram: reaction update card %d: %v", cardID, err)
	}
}

// maxTrackedMessages bounds the in-memory message→card map so it doesn't
// grow without limit over months of use.
const maxTrackedMessages = 500

func (a *Adapter) trackMessage(msgID, cardID int64) {
	if msgID == 0 || cardID == 0 {
		return
	}
	a.msgMu.Lock()
	if a.msgCard == nil {
		a.msgCard = map[int64]int64{}
	}
	if len(a.msgCard) >= maxTrackedMessages {
		// Evict one arbitrary entry to stay within budget.
		for k := range a.msgCard {
			delete(a.msgCard, k)
			break
		}
	}
	a.msgCard[msgID] = cardID
	a.msgMu.Unlock()
}

func (a *Adapter) cardForMessage(msgID int64) int64 {
	a.msgMu.Lock()
	defer a.msgMu.Unlock()
	if a.msgCard == nil {
		return 0
	}
	return a.msgCard[msgID]
}

// --- offset persistence -----------------------------------------------------

// offsetFile is the getUpdates offset stash: SPARKKEEP_OFFSET_FILE or
// sparkkeep_otg_offset.json next to the DB (cwd default).
func (a *Adapter) offsetFile() string {
	if a.offsetP != "" {
		return a.offsetP
	}
	if v := os.Getenv("SPARKKEEP_OFFSET_FILE"); v != "" {
		return v
	}
	return "sparkkeep_otg_offset.json"
}

func (a *Adapter) readOffset() int64 {
	b, err := os.ReadFile(a.offsetFile())
	if err != nil {
		return 0
	}
	var o struct {
		Offset int64 `json:"offset"`
	}
	if json.Unmarshal(b, &o) != nil {
		return 0
	}
	return o.Offset
}

// writeOffset persists the confirmed offset after each successful batch.
// ponytail: no atomic rename; offset lost = duplicate replies, a crash
// mid-batch can still dup — acceptable for a personal bot.
func (a *Adapter) writeOffset(offset int64) {
	b, _ := json.Marshal(struct {
		Offset int64 `json:"offset"`
	}{Offset: offset})
	if err := os.WriteFile(a.offsetFile(), b, 0o644); err != nil {
		a.logf("telegram: write offset: %v", err)
	}
}

// --- plumbing ----------------------------------------------------------------

func (a *Adapter) apiBase() string {
	if a.baseURL != "" {
		return a.baseURL
	}
	return apiBase
}

func (a *Adapter) httpClient() *http.Client {
	if a.httpc != nil {
		return a.httpc
	}
	return http.DefaultClient
}

func (a *Adapter) logf(format string, args ...any) {
	if a.Logf != nil {
		a.Logf(format, args...)
	}
}

func sleepCtx(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}
