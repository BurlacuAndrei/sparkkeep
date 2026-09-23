// Package telegram is the first port.Channel implementation: a stdlib
// long-poll Telegram adapter (no bot library). Inbound: owner messages →
// core.Service.Capture, inline-button callback queries → status/research/
// retry, emoji reactions → horizon refinement. Outbound: Notify renders
// created cards as caption text + inline keyboard and research reports as a
// public-URL link. Config is passed field-by-field (Token, OwnerID) so the
// loop is easy to wire in tests.
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
	"strconv"
	"strings"
	"sync"
	"time"

	"sparkkeep/internal/core"
	"sparkkeep/internal/port"
)

const apiBase = "https://api.telegram.org"

var _ port.Channel = (*Adapter)(nil)

// Adapter implements port.Channel (outbound Notify) and the long-poll Run
// loop. Service and Store are injected; callback/reaction handling uses the
// injected Store directly, inbound messages go through Service.Capture.
type Adapter struct {
	Token   string
	OwnerID int64 // configured TG_CHAT_ID; everyone else is ignored
	Service *core.Service
	Store   port.Store
	Logf    func(format string, args ...any)

	baseURL string          // unexported: httptest server in tests, else apiBase
	httpc   *http.Client    // unexported: default client unless tests override
	msgCard map[int64]int64 // bot message_id → card_id, for reactions
	msgMu   sync.Mutex
	offsetP string // unexported: offset file override for tests
}

// Run blocks long-polling getUpdates until ctx is cancelled. Each update is
// dispatched to its own goroutine; after each batch the confirmed offset is
// persisted so a restart resumes with only unconfirmed updates.
func (a *Adapter) Run(ctx context.Context) error {
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
			continue
		}
		var batch struct {
			OK     bool     `json:"ok"`
			Result []update `json:"result"`
		}
		if err := json.Unmarshal(body, &batch); err != nil || !batch.OK {
			a.logf("telegram: bad getUpdates payload: %v", err)
			continue
		}
		if len(batch.Result) == 0 {
			continue
		}
		maxID := offset
		for _, u := range batch.Result {
			if u.ID > maxID {
				maxID = u.ID
			}
			go a.handleUpdate(u)
		}
		offset = maxID
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
	caption := fmt.Sprintf("%s\n\n%s\n[%s]", c.Title, c.Summary, c.Horizon)
	if len(c.Tags) > 0 {
		caption += "\n#" + strings.Join(c.Tags, " #")
	}
	_, err := a.sendMessage(ctx, caption, c.ID, cardButtons(c.ID, false))
	return err
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
	base := os.Getenv("SPARKKEEP_PUBLIC_URL")
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
	MessageID int64       `json:"message_id"`
	Chat      *chat       `json:"chat"`
	Text      string      `json:"text"`
	Caption   string      `json:"caption"`
	Photo     []photoSize `json:"photo"`
}

type photoSize struct {
	FileID string `json:"file_id"`
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

// handleMessage funnels anything with text/caption into Capture. Photos and
// stickers without a caption have nothing to analyze and are dropped; so is
// anything from a chat that is not the owner.
func (a *Adapter) handleMessage(m *message) {
	if m.Chat == nil || m.Chat.ID != a.OwnerID {
		return // owner lock: single-user bot ignores everyone else
	}
	raw := m.Text
	if raw == "" {
		raw = m.Caption
	}
	if strings.TrimSpace(raw) == "" {
		return
	}
	if _, err := a.Service.Capture(context.Background(), raw); err != nil {
		a.logf("telegram: capture: %v", err)
	}
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
	ctx := context.Background()
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
		a.ackCallback(cb.ID)
		go func() {
			if err := a.Service.Research(ctx, id); err != nil {
				a.logf("telegram: research %d: %v", id, err)
			}
		}()
	case "retry":
		a.ackCallback(cb.ID)
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
	a.ackCallback(cb.ID)
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
// handled async (research) or fails.
func (a *Adapter) ackCallback(id string) {
	if id == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := a.call(ctx, "answerCallbackQuery", map[string]any{"callback_query_id": id}); err != nil {
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

func (a *Adapter) trackMessage(msgID, cardID int64) {
	if msgID == 0 || cardID == 0 {
		return
	}
	a.msgMu.Lock()
	if a.msgCard == nil {
		a.msgCard = map[int64]int64{}
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
