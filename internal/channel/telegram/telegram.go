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
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"runtime/debug"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"sparkkeep/internal/capture"
	"sparkkeep/internal/i18n"
	"sparkkeep/internal/port"
)

const apiBase = "https://api.telegram.org"

var _ port.Channel = (*Adapter)(nil)
var _ port.ChannelAdapter = (*Adapter)(nil)

// Service abstracts the orchestration methods consumed by the Telegram adapter.
type Service interface {
	CaptureShare(ctx context.Context, share capture.Share) ([]int64, error)
	ForceCapture(ctx context.Context, captureID int64) (*port.Card, error)
	Retry(ctx context.Context, cardID int64) ([]port.Card, error)
	GoResearch(ctx context.Context, cardID int64, playbookID ...*int64)
	SendMorningDigest(ctx context.Context) error
	GetSetting(ctx context.Context, key string) (string, error)
	SetSetting(ctx context.Context, key, value string) error
	GetCard(ctx context.Context, id int64) (port.Card, error)
	ListCards(ctx context.Context, f port.CardFilter) ([]port.Card, error)
	UpdateCard(ctx context.Context, id int64, patch port.CardPatch) (port.Card, error)
	SetCardTags(ctx context.Context, id int64, tags []string) error
	RecordChannelMessage(ctx context.Context, channel, messageID string, cardID int64) error
	GetCardIDByChannelMessage(ctx context.Context, channel, messageID string) (int64, error)
	HasActiveResearch(ctx context.Context, cardID int64) (bool, error)
	ListPlaybooks(ctx context.Context) ([]port.Playbook, error)
	GetPlaybook(ctx context.Context, id int64) (port.Playbook, error)
}

// Adapter implements port.Channel (outbound Notify) and the long-poll Run
// loop. Service is injected; all operations go through Service.
type Adapter struct {
	Token     string
	OwnerID   int64 // configured TG_CHAT_ID; everyone else is ignored
	PublicURL string
	Locale    string
	Service   Service
	Logf      func(format string, args ...any)

	// Scheduled weekly digest: pushed once per DigestPushDay/DigestPushHour
	// (local time, 0=Sunday) when DigestPushEnabled.
	DigestPushEnabled bool
	DigestPushDay     time.Weekday
	DigestPushHour    int
	BaseURL           string // optional: httptest server in tests or custom proxy, else apiBase

	// MediaGroupWait configures the buffer delay for album aggregation (default: 600ms).
	MediaGroupWait time.Duration

	baseURL      string           // unexported: httptest server in tests, else apiBase
	httpc        *http.Client     // unexported: default client unless tests override
	msgCard      map[int64]int64  // bot message_id → card_id, for reactions
	researchMsgs map[int64]msgRef // card_id → original message, for restoring buttons
	mediaGroups  map[string]*mediaGroupBuffer
	mediaGroupMu sync.Mutex
	msgMu        sync.Mutex
	offsetP      string        // unexported: offset file override for tests
	sem          chan struct{} // concurrency limiter

	lastDigestSent string     // "2006-01-02" of the last scheduled digest
	digestMu       sync.Mutex // guards lastDigestSent
}

type mediaGroupBuffer struct {
	chatID   int64
	groupID  string
	messages []*message
	timer    *time.Timer
	firstMsg *message
}

func (a *Adapter) locale(ctx context.Context) string {
	if a.Locale != "" {
		return a.Locale
	}
	if a.Service != nil {
		if loc, err := a.Service.GetSetting(ctx, "interface_locale"); err == nil && strings.TrimSpace(loc) != "" {
			return strings.TrimSpace(loc)
		}
	}
	return "en"
}

func (a *Adapter) helpText(ctx context.Context) string {
	return i18n.GetMessages(a.locale(ctx)).HelpText
}

// ID implements port.ChannelAdapter.
func (a *Adapter) ID() string {
	return "telegram"
}

// Name implements port.ChannelAdapter.
func (a *Adapter) Name() string {
	return "Telegram"
}

// Start implements port.ChannelAdapter.
func (a *Adapter) Start(ctx context.Context) error {
	return a.Run(ctx)
}

// Capabilities implements port.ChannelAdapter.
func (a *Adapter) Capabilities() port.ChannelCapabilities {
	return port.ChannelCapabilities{
		SupportsInlineButtons: true,
		SupportsReactions:     true,
		SupportsThreads:       true,
		MarkdownFlavor:        "telegram",
		MaxTextLength:         4096,
	}
}

// Run blocks long-polling getUpdates until ctx is cancelled. Each update is
// dispatched to its own goroutine; after each batch the confirmed offset is
// persisted so a restart resumes with only unconfirmed updates.
func (a *Adapter) Run(ctx context.Context) error {
	if a.sem == nil {
		a.sem = make(chan struct{}, 3)
	}
	if a.DigestPushEnabled {
		go a.runDigestScheduler(ctx)
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
				defer func() {
					if r := recover(); r != nil {
						a.logf("telegram: panic in handleUpdate: %v\n%s", r, debug.Stack())
					}
				}()
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

type placeholderContextKey struct{}

type placeholderState struct {
	mu        sync.Mutex
	chatID    int64
	messageID int64
	consumed  bool
}

func (p *placeholderState) claim() (int64, int64, bool) {
	if p == nil {
		return 0, 0, false
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.consumed || p.messageID == 0 {
		return 0, 0, false
	}
	p.consumed = true
	return p.chatID, p.messageID, true
}

// Notify implements port.Channel: kind → message shape.
func (a *Adapter) Notify(ctx context.Context, n port.Notification) error {
	state, _ := ctx.Value(placeholderContextKey{}).(*placeholderState)
	loc := a.locale(ctx)
	switch n.Kind {
	case "created":
		if state != nil {
			if chatID, msgID, ok := state.claim(); ok {
				return a.editMessageText(ctx, chatID, msgID, cardCaption(n.Card, loc), n.Card.ID, cardButtons(n.Card.ID, false, loc))
			}
		}
		return a.sendCard(ctx, n.Card)
	case "analysis_failed":
		m := i18n.GetMessages(loc)
		if state != nil {
			if chatID, msgID, ok := state.claim(); ok {
				return a.editMessageText(ctx, chatID, msgID, m.AnalysisFailed, n.Card.ID, cardButtons(n.Card.ID, true, loc))
			}
		}
		return a.sendFailed(ctx, n.Card)
	case "duplicate":
		if state != nil {
			if chatID, msgID, ok := state.claim(); ok {
				return a.editMessageText(ctx, chatID, msgID, n.Text, n.Card.ID, nil)
			}
		}
		_, err := a.sendMessage(ctx, n.Text, 0, nil)
		return err
	case "research_done", "research_failed":
		return a.sendResearch(ctx, n)
	case "morning_digest":
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

type msgRef struct {
	chatID int64
	msgID  int64
}

func (a *Adapter) trackResearchMessage(cardID, chatID, msgID int64) {
	a.msgMu.Lock()
	defer a.msgMu.Unlock()
	if a.researchMsgs == nil {
		a.researchMsgs = make(map[int64]msgRef)
	}
	a.researchMsgs[cardID] = msgRef{chatID: chatID, msgID: msgID}
}

func (a *Adapter) popResearchMessage(cardID int64) (msgRef, bool) {
	a.msgMu.Lock()
	defer a.msgMu.Unlock()
	ref, ok := a.researchMsgs[cardID]
	if ok {
		delete(a.researchMsgs, cardID)
	}
	return ref, ok
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

func (a *Adapter) targetChatID(ctx context.Context) int64 {
	chatID := a.OwnerID
	if a.Service != nil {
		if dbIDStr, err := a.Service.GetSetting(ctx, "tg_chat_id"); err == nil && dbIDStr != "" {
			if parsed, err := strconv.ParseInt(dbIDStr, 10, 64); err == nil {
				chatID = parsed
			}
		}
	}
	return chatID
}

func (a *Adapter) sendChatAction(ctx context.Context, chatID int64, action string) error {
	if chatID == 0 {
		chatID = a.targetChatID(ctx)
	}
	_, err := a.call(ctx, "sendChatAction", map[string]any{
		"chat_id": chatID,
		"action":  action,
	})
	return err
}

func (a *Adapter) editMessageText(ctx context.Context, chatID int64, messageID int64, text string, cardID int64, buttons [][]button) error {
	if chatID == 0 {
		chatID = a.targetChatID(ctx)
	}
	msg := map[string]any{
		"chat_id":    chatID,
		"message_id": messageID,
		"text":       text,
		"parse_mode": "Markdown",
	}
	if len(buttons) > 0 {
		msg["reply_markup"] = map[string]any{"inline_keyboard": buttons}
	}
	if _, err := a.call(ctx, "editMessageText", msg); err != nil {
		return err
	}
	if cardID > 0 {
		a.recordMsgCard(messageID, cardID)
	}
	return nil
}

func escapeMarkdown(s string) string {
	repl := strings.NewReplacer(
		"_", `\_`,
		"*", `\*`,
		"[", `\[`,
		"`", `\`+"`",
	)
	return repl.Replace(s)
}

func placeholderLabel(share capture.Share, m *message) string {
	target := strings.TrimSpace(share.URL)
	if target == "" && len(share.Files) > 0 {
		target = strings.TrimSpace(share.Files[0].Name)
	}
	if target == "" {
		target = strings.TrimSpace(share.Caption)
	}
	if target == "" && m != nil {
		target = strings.TrimSpace(m.Text)
	}
	if idx := strings.IndexAny(target, "\r\n"); idx != -1 {
		target = strings.TrimSpace(target[:idx])
	}
	r := []rune(target)
	if len(r) > 60 {
		target = string(r[:57]) + "..."
	}
	return target
}

// sendMessage posts a Markdown text message with an optional inline keyboard
// and returns the bot message id. cardID>0 records message_id→card so the
// "reaction on a card message" refinement can find the card.
func (a *Adapter) sendMessage(ctx context.Context, text string, cardID int64, buttons [][]button) (int64, error) {
	return a.sendMessageReply(ctx, text, 0, cardID, buttons)
}

func (a *Adapter) sendMessageReply(ctx context.Context, text string, replyTo int64, cardID int64, buttons [][]button) (int64, error) {
	chatID := a.targetChatID(ctx)

	msg := map[string]any{
		"chat_id":    chatID,
		"text":       text,
		"parse_mode": "Markdown",
	}
	if replyTo > 0 {
		msg["reply_to_message_id"] = replyTo
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
	a.recordMsgCard(sent.MessageID, cardID)
	return sent.MessageID, nil
}

// sendCard renders a created card as caption text + the four action buttons.
func (a *Adapter) sendCard(ctx context.Context, c port.Card) error {
	loc := a.locale(ctx)
	_, err := a.sendMessage(ctx, cardCaption(c, loc), c.ID, cardButtons(c.ID, false, loc))
	return err
}

// cardCaption formats a card as Markdown for Telegram:
// [<TYPE>] *<Title>*
//
// <TLDR>
//
// • <claim 1>
// • <claim 2>
// • <claim 3>
//
// *Worth researching:* <Level> — <Reason>
//
// [<Horizon>]
// #tag1 #tag2
func cardCaption(c port.Card, loc ...string) string {
	locale := "en"
	if len(loc) > 0 && loc[0] != "" {
		locale = loc[0]
	}
	m := i18n.GetMessages(locale)

	var b strings.Builder
	title := strings.TrimSpace(c.Title)
	if c.Type != "" {
		fmt.Fprintf(&b, "[%s] *%s*", strings.ToUpper(strings.TrimSpace(c.Type)), title)
	} else {
		fmt.Fprintf(&b, "*%s*", title)
	}

	body := strings.TrimSpace(c.TLDR)
	if body == "" {
		body = strings.TrimSpace(c.ExecutiveSummary)
	}
	if body == "" {
		body = strings.TrimSpace(c.Summary)
	}
	if body != "" {
		b.WriteString("\n\n" + body)
	}

	var claims []string
	for _, cl := range c.Claims {
		if cl = strings.TrimSpace(cl); cl != "" {
			claims = append(claims, "• "+cl)
			if len(claims) == 3 {
				break
			}
		}
	}
	if len(claims) > 0 {
		b.WriteString("\n\n" + strings.Join(claims, "\n"))
	} else if len(c.ProposedActions) > 0 {
		var bullets []string
		for _, a := range c.ProposedActions {
			if a = strings.TrimSpace(a); a != "" {
				bullets = append(bullets, "• "+a)
			}
		}
		if len(bullets) > 0 {
			b.WriteString("\n\n*" + m.NextActions + ":*\n" + strings.Join(bullets, "\n"))
		}
	}

	if c.Worthiness.Level != "" {
		lvl := strings.TrimSpace(c.Worthiness.Level)
		switch strings.ToLower(lvl) {
		case "high":
			lvl = "High"
		case "med", "medium":
			lvl = "Medium"
		case "low":
			lvl = "Low"
		}
		reason := strings.TrimSpace(c.Worthiness.Reason)
		if reason != "" {
			fmt.Fprintf(&b, "\n\n*%s:* %s — %s", m.WorthResearching, lvl, reason)
		} else {
			fmt.Fprintf(&b, "\n\n*%s:* %s", m.WorthResearching, lvl)
		}
	}

	if h := strings.TrimSpace(c.Horizon); h != "" {
		fmt.Fprintf(&b, "\n\n[%s]", h)
	}
	if len(c.Tags) > 0 {
		var tags []string
		for _, t := range c.Tags {
			if t = strings.TrimSpace(t); t != "" {
				tags = append(tags, "#"+t)
			}
		}
		if len(tags) > 0 {
			b.WriteString("\n" + strings.Join(tags, " "))
		}
	}

	return safeTruncate(b.String(), 4000)
}

func safeTruncate(text string, maxRunes int) string {
	r := []rune(text)
	if len(r) <= maxRunes {
		return text
	}
	truncated := string(r[:maxRunes-1]) + "…"
	if strings.Count(truncated, "*")%2 != 0 {
		truncated += "*"
	}
	if strings.Count(truncated, "_")%2 != 0 {
		truncated += "_"
	}
	if strings.Count(truncated, "`")%2 != 0 {
		truncated += "`"
	}
	return truncated
}

// sendFailed renders the analysis-failure card: same buttons plus Retry.
func (a *Adapter) sendFailed(ctx context.Context, c port.Card) error {
	loc := a.locale(ctx)
	m := i18n.GetMessages(loc)
	_, err := a.sendMessage(ctx, m.AnalysisFailed, c.ID, cardButtons(c.ID, true, loc))
	return err
}

func cardButtons(id int64, retry bool, loc ...string) [][]button {
	locale := "en"
	if len(loc) > 0 && loc[0] != "" {
		locale = loc[0]
	}
	b := i18n.GetButtons(locale)

	btns := [][]button{
		{
			{Text: b.DeepResearch, CallbackData: fmt.Sprintf("%d:research", id)},
			{Text: "▾", CallbackData: fmt.Sprintf("%d:pb_menu", id)},
		},
		{
			{Text: b.Short, CallbackData: fmt.Sprintf("%d:commit:short-term", id)},
			{Text: b.Medium, CallbackData: fmt.Sprintf("%d:commit:medium-term", id)},
			{Text: b.Long, CallbackData: fmt.Sprintf("%d:commit:long-term", id)},
		},
		{
			{Text: b.Discard, CallbackData: fmt.Sprintf("%d:dismiss", id)},
		},
	}
	if retry {
		btns[2] = append(btns[2], button{Text: b.Retry, CallbackData: fmt.Sprintf("%d:retry", id)})
	}
	return btns
}

// ActionButtons renders standard action buttons with canonical callback prefixes.
func ActionButtons(id int64, loc ...string) [][]button {
	locale := "en"
	if len(loc) > 0 && loc[0] != "" {
		locale = loc[0]
	}
	b := i18n.GetButtons(locale)
	return [][]button{
		{
			{Text: b.Research, CallbackData: fmt.Sprintf("research:%d", id)},
			{Text: b.Playbook, CallbackData: fmt.Sprintf("pb:%d", id)},
		},
		{
			{Text: b.Do, CallbackData: fmt.Sprintf("do:%d", id)},
			{Text: b.Keep, CallbackData: fmt.Sprintf("keep:%d", id)},
			{Text: b.Shelve, CallbackData: fmt.Sprintf("shelve:%d", id)},
		},
		{
			{Text: b.Dismiss, CallbackData: fmt.Sprintf("dismiss:%d", id)},
		},
	}
}

// sendResearch renders a research outcome as summary text + a public link to
// the report row (/api/v1/research/{id}?t={share_token}), base from
// SPARKKEEP_PUBLIC_URL.
func (a *Adapter) sendResearch(ctx context.Context, n port.Notification) error {
	base := a.PublicURL
	if base == "" {
		base = "http://localhost:8080"
	}
	link := strings.TrimRight(base, "/") + "/api/v1/research/"
	loc := a.locale(ctx)
	m := i18n.GetMessages(loc)

	var (
		buttons [][]button
		cardID  int64
	)
	if n.Res != nil {
		link += strconv.FormatInt(n.Res.ID, 10)
		if n.Res.ShareToken != "" {
			link += "?t=" + url.QueryEscape(n.Res.ShareToken)
		}
		cardID = n.Res.CardID
		buttons = cardButtons(cardID, false, loc)
	}

	card := n.Card
	if card.ID == 0 && cardID != 0 && a.Service != nil {
		if c, err := a.Service.GetCard(ctx, cardID); err == nil {
			card = c
		}
	}

	var b strings.Builder
	if n.Kind == "research_done" {
		if n.Res != nil && n.Res.Result != nil && n.Res.Result.Verdict != nil && n.Res.Result.Verdict.Recommendation != "" {
			verd := n.Res.Result.Verdict
			rec := strings.ToUpper(verd.Recommendation[:1]) + strings.ToLower(verd.Recommendation[1:])
			fmt.Fprintf(&b, "%s\n*%s:* %s · *%s:* %s", m.ResearchCompleteHeader, m.Verdict, rec, m.Confidence, verd.Confidence)
			if card.ExecutiveSummary != "" {
				b.WriteString("\n\n" + card.ExecutiveSummary)
			} else if card.TLDR != "" {
				b.WriteString("\n\n" + card.TLDR)
			}
			if len(verd.NextActions) > 0 {
				fmt.Fprintf(&b, "\n\n*%s:*", m.NextActions)
				limit := 3
				if len(verd.NextActions) < limit {
					limit = len(verd.NextActions)
				}
				for i := 0; i < limit; i++ {
					act := strings.TrimSpace(verd.NextActions[i])
					if act != "" {
						b.WriteString("\n• " + act)
					}
				}
			}
		} else {
			text := n.Text
			if text == "" {
				text = m.ResearchComplete
			}
			b.WriteString(text)
		}
	} else if n.Kind == "research_failed" {
		failedStep := ""
		if n.Res != nil {
			for _, st := range n.Res.Steps {
				if st.Status == "failed" {
					failedStep = st.ID
					break
				}
			}
		}
		if failedStep != "" {
			fmt.Fprintf(&b, "%s\n"+m.ResearchFailedStep, m.ResearchFailedHeader, failedStep)
		} else {
			b.WriteString(m.ResearchFailedHeader)
		}
		if n.Text != "" && n.Text != failedStep {
			b.WriteString("\n" + n.Text)
		}
	} else {
		text := n.Text
		if text == "" {
			text = m.ResearchUpdate
		}
		b.WriteString(text)
	}

	b.WriteString("\n\n" + link)
	_, err := a.sendMessage(ctx, b.String(), cardID, buttons)
	if orig, ok := a.popResearchMessage(cardID); ok {
		if n.Kind == "research_failed" {
			isFailed := card.Title == "Analysis failed" || strings.Contains(card.Title, "failed")
			a.editReplyMarkupWithButtons(ctx, orig.chatID, orig.msgID, cardButtons(cardID, isFailed))
		} else {
			a.editReplyMarkup(ctx, orig.chatID, orig.msgID)
		}
	}
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
	MediaGroupID   string      `json:"media_group_id"`
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

// handleMessage funnels text, links and media into CaptureShare. Bot commands
// (/digest, /help) answer from the store instead of capturing. A message with
// neither text nor a downloadable payload is dropped; so is anything from a
// chat that is not the owner. A reply to one of the bot's own card messages is
// the organize-by-reply signal instead of a new share.
func (a *Adapter) handleMessage(m *message) {
	if m.Chat == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	ownerID := a.OwnerID
	if a.Service != nil {
		if dbIDStr, err := a.Service.GetSetting(ctx, "tg_chat_id"); err == nil && dbIDStr != "" {
			if parsed, err := strconv.ParseInt(dbIDStr, 10, 64); err == nil {
				ownerID = parsed
			}
		}
	}

	// Intercept /start <magic_token> for dynamic linking
	if strings.HasPrefix(m.Text, "/start ") {
		token := strings.TrimSpace(strings.TrimPrefix(m.Text, "/start "))
		if a.Service != nil {
			masterToken, err := a.Service.GetSetting(ctx, "auth_token")
			if err == nil && masterToken != "" && token == masterToken {
				if err := a.Service.SetSetting(ctx, "tg_chat_id", strconv.FormatInt(m.Chat.ID, 10)); err == nil {
					_, _ = a.sendMessage(ctx, "✅ *Successfully linked!* You can now send me links, files, and notes.", 0, nil)
					return
				}
			}
		}
	}

	if m.Chat.ID != ownerID {
		return // owner lock: single-user bot ignores everyone else
	}

	if m.MediaGroupID != "" {
		a.bufferMediaGroup(m)
		return
	}

	switch commandOf(m.Text) {
	case "digest", "weekly":
		a.sendDigest(ctx)
		return
	case "morning", "research":
		a.sendMorningDigest(ctx)
		return
	case "inbox":
		a.sendInbox(ctx)
		return
	case "help", "start":
		if _, err := a.sendMessage(ctx, a.helpText(ctx), 0, nil); err != nil {
			a.logf("telegram: help: sendMessage: %v", err)
		}
		return
	}
	if m.ReplyToMessage != nil {
		// A reply to a card the bot posted organizes that card. A reply to
		// anything else (or to a card evicted from the tracked map) falls
		// through, so the message is never lost.
		if cardID := a.cardForMsg(m.ReplyToMessage.MessageID); cardID > 0 {
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
	share.SourceChannel = "telegram"
	if m.Chat != nil {
		share.SourceChannelChatID = strconv.FormatInt(m.Chat.ID, 10)
	}
	share.SourceChannelMsgID = strconv.FormatInt(m.MessageID, 10)

	_ = a.sendChatAction(ctx, m.Chat.ID, "typing")
	label := placeholderLabel(share, m)
	var placeholderText string
	if label != "" {
		placeholderText = fmt.Sprintf("📥 Processing %s...", escapeMarkdown(label))
	} else {
		placeholderText = "📥 Processing..."
	}
	placeholderMsgID, err := a.sendMessageReply(ctx, placeholderText, m.MessageID, 0, nil)
	if err != nil {
		a.logf("telegram: send placeholder: %v", err)
	}

	state := &placeholderState{
		chatID:    m.Chat.ID,
		messageID: placeholderMsgID,
	}
	ctx = context.WithValue(ctx, placeholderContextKey{}, state)

	if a.Service != nil {
		if _, err := a.Service.CaptureShare(ctx, share); err != nil {
			a.logf("telegram: capture: %v", err)
			msg := "❌ Failed to process: " + escapeMarkdown(err.Error())
			var buttons [][]button
			if errors.Is(err, port.ErrNoiseGateDiscarded) {
				reason := "engagement bait or promotional hype with zero technical substance"
				var capID int64
				var nge *port.NoiseGateError
				if errors.As(err, &nge) {
					if nge.Reason != "" {
						reason = nge.Reason
					}
					capID = nge.CaptureID
				}
				msg = fmt.Sprintf("🚫 Filtered: Discarded engagement bait (%s)", escapeMarkdown(reason))
				if capID > 0 {
					buttons = [][]button{{
						{Text: "📥 Keep Anyway", CallbackData: fmt.Sprintf("force_capture:%d", capID)},
					}}
				}
			}
			if chatID, msgID, ok := state.claim(); ok {
				_ = a.editMessageText(ctx, chatID, msgID, msg, 0, buttons)
			} else if errors.Is(err, port.ErrNoiseGateDiscarded) {
				_, _ = a.sendMessageReply(ctx, msg, m.MessageID, 0, buttons)
			}
		} else {
			if chatID, msgID, ok := state.claim(); ok {
				_ = a.editMessageText(ctx, chatID, msgID, "No actionable content found.", 0, nil)
			}
		}
	}
}

func (a *Adapter) bufferMediaGroup(m *message) {
	a.mediaGroupMu.Lock()
	defer a.mediaGroupMu.Unlock()
	if a.mediaGroups == nil {
		a.mediaGroups = make(map[string]*mediaGroupBuffer)
	}
	key := fmt.Sprintf("%d:%s", m.Chat.ID, m.MediaGroupID)
	buf, exists := a.mediaGroups[key]
	waitDur := a.MediaGroupWait
	if waitDur <= 0 {
		waitDur = 600 * time.Millisecond
	}
	if exists {
		buf.messages = append(buf.messages, m)
		if buf.timer != nil {
			buf.timer.Stop()
		}
		buf.timer = time.AfterFunc(waitDur, func() {
			a.flushMediaGroup(key)
		})
		return
	}
	buf = &mediaGroupBuffer{
		chatID:   m.Chat.ID,
		groupID:  m.MediaGroupID,
		messages: []*message{m},
		firstMsg: m,
	}
	buf.timer = time.AfterFunc(waitDur, func() {
		a.flushMediaGroup(key)
	})
	a.mediaGroups[key] = buf
}

func (a *Adapter) flushMediaGroup(key string) {
	a.mediaGroupMu.Lock()
	buf, ok := a.mediaGroups[key]
	if !ok {
		a.mediaGroupMu.Unlock()
		return
	}
	delete(a.mediaGroups, key)
	a.mediaGroupMu.Unlock()

	a.processMediaGroup(buf)
}

func (a *Adapter) processMediaGroup(buf *mediaGroupBuffer) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	var allFiles []capture.File
	var captions []string

	for i, m := range buf.messages {
		if c := strings.TrimSpace(m.Caption); c != "" {
			if !slices.Contains(captions, c) {
				captions = append(captions, c)
			}
		}
		if text := strings.TrimSpace(m.Text); text != "" {
			if !slices.Contains(captions, text) {
				captions = append(captions, text)
			}
		}
		if fID, name, mime, ok := firstMedia(m); ok {
			data, err := a.downloadFile(fID)
			if err != nil {
				a.logf("telegram: download media group %s (%d): %v", fID, i, err)
				continue
			}
			allFiles = append(allFiles, capture.File{
				Name: name,
				Mime: mime,
				Data: data,
			})
		}
	}

	if len(allFiles) == 0 && len(captions) == 0 {
		return
	}

	mergedCaption := strings.Join(captions, "\n")
	kind := capture.KindImage
	for _, f := range allFiles {
		if capture.KindForMime(f.Mime) != capture.KindImage {
			kind = capture.KindFile
			break
		}
	}

	share := capture.Share{
		Kind:                kind,
		Caption:             mergedCaption,
		Files:               allFiles,
		SourceChannel:       "telegram",
		SourceChannelChatID: strconv.FormatInt(buf.chatID, 10),
		SourceChannelMsgID:  strconv.FormatInt(buf.firstMsg.MessageID, 10),
	}

	_ = a.sendChatAction(ctx, buf.chatID, "typing")
	label := placeholderLabel(share, buf.firstMsg)
	var placeholderText string
	if label != "" {
		placeholderText = fmt.Sprintf("📥 Processing %s...", escapeMarkdown(label))
	} else {
		placeholderText = "📥 Processing album..."
	}
	placeholderMsgID, err := a.sendMessageReply(ctx, placeholderText, buf.firstMsg.MessageID, 0, nil)
	if err != nil {
		a.logf("telegram: send placeholder for media group: %v", err)
	}

	state := &placeholderState{
		chatID:    buf.chatID,
		messageID: placeholderMsgID,
	}
	ctx = context.WithValue(ctx, placeholderContextKey{}, state)

	if a.Service != nil {
		if _, err := a.Service.CaptureShare(ctx, share); err != nil {
			a.logf("telegram: capture media group: %v", err)
			msg := "❌ Failed to process: " + escapeMarkdown(err.Error())
			var buttons [][]button
			if errors.Is(err, port.ErrNoiseGateDiscarded) {
				reason := "engagement bait or promotional hype with zero technical substance"
				var capID int64
				var nge *port.NoiseGateError
				if errors.As(err, &nge) {
					if nge.Reason != "" {
						reason = nge.Reason
					}
					capID = nge.CaptureID
				}
				msg = fmt.Sprintf("🚫 Filtered: Discarded engagement bait (%s)", escapeMarkdown(reason))
				if capID > 0 {
					buttons = [][]button{{
						{Text: "📥 Keep Anyway", CallbackData: fmt.Sprintf("force_capture:%d", capID)},
					}}
				}
			}
			if chatID, msgID, ok := state.claim(); ok {
				_ = a.editMessageText(ctx, chatID, msgID, msg, 0, buttons)
			} else if errors.Is(err, port.ErrNoiseGateDiscarded) {
				_, _ = a.sendMessageReply(ctx, msg, buf.firstMsg.MessageID, 0, buttons)
			}
		} else {
			if chatID, msgID, ok := state.claim(); ok {
				_ = a.editMessageText(ctx, chatID, msgID, "No actionable content found.", 0, nil)
			}
		}
	}
}

// --- commands ----------------------------------------------------------------

// commandOf returns the bare command of a bot message ("/digest@my_bot notes"
// → "digest"), or "" when the text is not a command.
func commandOf(text string) string {
	fields := strings.Fields(text)
	if len(fields) == 0 || !strings.HasPrefix(fields[0], "/") {
		return ""
	}
	return strings.ToLower(strings.SplitN(strings.TrimPrefix(fields[0], "/"), "@", 2)[0])
}

// helpText is the /help (and /start) answer: what can be shared and what the
// digest does. Markdown, so every * is balanced.
const helpText = "👋 *Sparkkeep* — send me anything and it becomes a card.\n\n" +
	"*What to share:*\n" +
	"• A link → fetched and analyzed\n" +
	"• A photo, video or file → analyzed from the media\n" +
	"• A voice note → transcribed, then analyzed\n" +
	"• Plain text → captured as a note\n\n" +
	"*What you can do:*\n" +
	"• Tap Doing / Done / Shelve on a card\n" +
	"• Reply to a card with text or #tags to update it in place\n" +
	"• /digest — the last 7 days: counts by status and your 5 most recent sparks\n" +
	"• /morning — instant morning research digest\n" +
	"• /inbox — review inbox cards"

// digestDays is the window the /digest command reports on.
const digestDays = 7

// digestRecentLimit caps the "Recent Sparks" list so a busy week doesn't
// produce an unreadable wall of text.
const digestRecentLimit = 5

// sendDigest answers /digest with the last 7 days of captures: one line per
// status, then the most recent titles. Dismissed cards are left out — "not
// interested" isn't part of the week's wins.
func (a *Adapter) sendDigest(ctx context.Context) {
	if a.Service == nil {
		return
	}
	cards, err := a.Service.ListCards(ctx, port.CardFilter{Since: time.Now().UTC().AddDate(0, 0, -digestDays)})
	if err != nil {
		a.logf("telegram: digest: ListCards: %v", err)
		return
	}
	var inbox, doing, done, shelved int
	recent := make([]port.Card, 0, len(cards))
	for _, c := range cards {
		if c.Status == port.StatusDismissed {
			continue
		}
		recent = append(recent, c)
		switch c.Status {
		case port.StatusInProgress, port.StatusToDo:
			doing++
		case port.StatusDone:
			done++
		case port.StatusShelved:
			shelved++
		default:
			inbox++
		}
	}
	loc := a.locale(ctx)
	m := i18n.GetMessages(loc)

	var b strings.Builder
	fmt.Fprintf(&b, "%s\n%s\n\n%s\n%s\n%s\n%s",
		m.WeeklyDigestTitle,
		fmt.Sprintf(m.WeeklyDigestSummary, digestDays, len(recent)),
		fmt.Sprintf(m.StatusInbox, inbox),
		fmt.Sprintf(m.StatusDoing, doing),
		fmt.Sprintf(m.StatusDone, done),
		fmt.Sprintf(m.StatusShelved, shelved),
	)
	if len(recent) > 0 {
		slices.SortFunc(recent, func(x, y port.Card) int { return y.CreatedAt.Compare(x.CreatedAt) })
		b.WriteString("\n\n" + m.RecentSparks)
		for i, c := range recent[:min(digestRecentLimit, len(recent))] {
			fmt.Fprintf(&b, "\n%d. %s [%s]", i+1, strings.TrimSpace(c.Title), c.Horizon)
		}
	}
	if a.PublicURL != "" {
		fmt.Fprintf(&b, "\n\n"+m.OpenDashboard, strings.TrimRight(a.PublicURL, "/"))
	}
	if _, err := a.sendMessage(ctx, b.String(), 0, nil); err != nil {
		a.logf("telegram: digest: sendMessage: %v", err)
	}
}

// sendInbox answers /inbox with pending cards in port.StatusInbox.
func (a *Adapter) sendInbox(ctx context.Context) {
	if a.Service == nil {
		return
	}
	cards, err := a.Service.ListCards(ctx, port.CardFilter{Status: port.StatusInbox})
	if err != nil {
		a.logf("telegram: inbox: ListCards: %v", err)
		return
	}
	loc := a.locale(ctx)
	m := i18n.GetMessages(loc)
	if len(cards) == 0 {
		if _, err := a.sendMessage(ctx, m.NoInboxCards, 0, nil); err != nil {
			a.logf("telegram: inbox: sendMessage: %v", err)
		}
		return
	}
	var b strings.Builder
	fmt.Fprintf(&b, m.InboxHeader, len(cards))
	limit := 10
	if len(cards) < limit {
		limit = len(cards)
	}
	for i, c := range cards[:limit] {
		title := strings.TrimSpace(c.Title)
		if title == "" {
			title = "(untitled)"
		}
		fmt.Fprintf(&b, "\n%d. %s", i+1, title)
		if c.Horizon != "" {
			fmt.Fprintf(&b, " [%s]", c.Horizon)
		}
	}
	if a.PublicURL != "" {
		fmt.Fprintf(&b, "\n\n"+m.OpenDashboard, strings.TrimRight(a.PublicURL, "/"))
	}
	if _, err := a.sendMessage(ctx, b.String(), 0, nil); err != nil {
		a.logf("telegram: inbox: sendMessage: %v", err)
	}
}

// sendMorningDigest delegates morning research digest generation and broadcast to Service.
func (a *Adapter) sendMorningDigest(ctx context.Context) {
	if a.Service == nil {
		return
	}
	if err := a.Service.SendMorningDigest(ctx); err != nil {
		a.logf("telegram: morning digest: %v", err)
	}
}

// runDigestScheduler steps digestTick once a minute until ctx is cancelled —
// a minute of slack is irrelevant for a weekly push.
func (a *Adapter) runDigestScheduler(ctx context.Context) {
	for sleepCtx(ctx, time.Minute) {
		a.digestTick(ctx, time.Now())
	}
}

// digestTick is one scheduler step: on the configured weekday and hour it
// sends the digest, at most once per calendar day (the minute ticker would
// otherwise fire 60 times an hour). Split from the loop so a test can step it
// with a chosen time.
func (a *Adapter) digestTick(ctx context.Context, now time.Time) {
	if now.Weekday() != a.DigestPushDay || now.Hour() != a.DigestPushHour {
		return
	}
	today := now.Format("2006-01-02")
	a.digestMu.Lock()
	if a.lastDigestSent == today {
		a.digestMu.Unlock()
		return
	}
	a.lastDigestSent = today
	a.digestMu.Unlock()

	a.logf("telegram: sent scheduled weekly digest")
	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	a.sendDigest(ctx)
}

// hashtagRe matches the "#tag" tokens of an organize-by-reply message.
var hashtagRe = regexp.MustCompile(`#[a-zA-Z0-9_]+`)

// organizeReply applies an organize-by-reply message to a card: its hashtags
// merge into the card's tags and the remaining text is appended to the note,
// then a one-line confirmation is sent back. Store failures are logged, not
// fatal — the message is never worth losing the reply thread over.
func (a *Adapter) organizeReply(ctx context.Context, cardID int64, raw string) {
	text := strings.TrimSpace(raw)
	if text == "" || a.Service == nil {
		return
	}
	card, err := a.Service.GetCard(ctx, cardID)
	if err != nil {
		a.logf("telegram: organize reply: GetCard(%d): %v", cardID, err)
		return
	}
	if rest := strings.TrimSpace(hashtagRe.ReplaceAllString(text, "")); rest != "" {
		note := rest
		if old := strings.TrimSpace(card.SourceNote); old != "" {
			note = old + "\n" + rest
		}
		if _, err := a.Service.UpdateCard(ctx, cardID, port.CardPatch{Note: &note}); err != nil {
			a.logf("telegram: organize reply: UpdateCard(%d): %v", cardID, err)
		}
	}
	tags := mergeTags(card.Tags, hashtagRe.FindAllString(text, -1))
	if len(tags) > len(card.Tags) {
		if err := a.Service.SetCardTags(ctx, cardID, tags); err != nil {
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
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	if strings.HasPrefix(cb.Data, "force_capture:") {
		capIDStr := strings.TrimPrefix(cb.Data, "force_capture:")
		capID, err := strconv.ParseInt(capIDStr, 10, 64)
		if err == nil {
			a.handleForceCapture(ctx, capID, cb)
			return
		}
	}

	id, action, ok := parseCallback(cb.Data)
	if !ok {
		return
	}
	loc := a.locale(ctx)
	b := i18n.GetButtons(loc)
	m := i18n.GetMessages(loc)

	switch {
	case action == "dismiss":
		a.setStatus(ctx, id, port.StatusDismissed, cb)
	case action == "shelve":
		a.setStatus(ctx, id, port.StatusShelved, cb)
	case action == "keep":
		a.setStatus(ctx, id, port.StatusInbox, cb)
	case action == "do":
		status := port.StatusInProgress
		horizon := port.HorizonShortTerm
		if a.Service != nil {
			if _, err := a.Service.UpdateCard(ctx, id, port.CardPatch{Horizon: &horizon, Status: &status}); err != nil {
				a.logf("telegram: UpdateCard do (%d): %v", id, err)
			}
		}
		a.ackCallback(cb.ID, b.Do)
		if cb.Message != nil && cb.Message.Chat != nil {
			a.editReplyMarkup(ctx, cb.Message.Chat.ID, cb.Message.MessageID)
		}
	case strings.HasPrefix(action, "status:"):
		status := strings.TrimPrefix(action, "status:")
		a.setStatus(ctx, id, status, cb)
	case strings.HasPrefix(action, "commit:"):
		horizon := strings.TrimPrefix(action, "commit:")
		status := port.StatusToDo
		if a.Service != nil {
			if _, err := a.Service.UpdateCard(ctx, id, port.CardPatch{Status: &status, Horizon: &horizon}); err != nil {
				a.logf("telegram: UpdateCard commit (%d, %s): %v", id, horizon, err)
			}
		}
		a.ackCallback(cb.ID, fmt.Sprintf(m.CommittedTo, horizon))
		// Optionally edit the message to remove buttons or show updated status
		if cb.Message != nil {
			_ = a.editMessageText(ctx, cb.Message.Chat.ID, cb.Message.MessageID, cb.Message.Text, id, nil)
		}
	case action == "retry":
		a.ackCallback(cb.ID, "")
		if _, err := a.Service.Retry(ctx, id); err != nil {
			a.logf("telegram: retry %d: %v", id, err)
		}
	case action == "pb_menu" || action == "pb":
		a.handlePlaybookMenu(ctx, id, cb)
	case action == "pb_back":
		a.handlePlaybookBack(ctx, id, cb)
	case strings.HasPrefix(action, "research"):
		a.handleResearchCallback(ctx, id, action, cb)
	}
}

func (a *Adapter) handlePlaybookMenu(ctx context.Context, cardID int64, cb *callbackQuery) {
	if a.Service == nil || cb.Message == nil || cb.Message.Chat == nil {
		a.ackCallback(cb.ID, "")
		return
	}
	loc := a.locale(ctx)
	b := i18n.GetButtons(loc)
	m := i18n.GetMessages(loc)

	pbs, err := a.Service.ListPlaybooks(ctx)
	if err != nil {
		a.ackCallback(cb.ID, m.FailedToLoadPlaybooks)
		return
	}
	var rows [][]button
	limit := 6
	if len(pbs) < limit {
		limit = len(pbs)
	}
	for i := 0; i < limit; i++ {
		pb := pbs[i]
		name := pb.Name
		if len(name) > 28 {
			name = name[:25] + "..."
		}
		rows = append(rows, []button{
			{
				Text:         "📖 " + name,
				CallbackData: fmt.Sprintf("%d:research:%d", cardID, pb.ID),
			},
		})
	}
	rows = append(rows, []button{
		{Text: b.Back, CallbackData: fmt.Sprintf("%d:pb_back", cardID)},
	})
	a.ackCallback(cb.ID, "")
	a.editReplyMarkupWithButtons(ctx, cb.Message.Chat.ID, cb.Message.MessageID, rows)
}

func (a *Adapter) handlePlaybookBack(ctx context.Context, cardID int64, cb *callbackQuery) {
	a.ackCallback(cb.ID, "")
	if cb.Message != nil && cb.Message.Chat != nil {
		loc := a.locale(ctx)
		a.editReplyMarkupWithButtons(ctx, cb.Message.Chat.ID, cb.Message.MessageID, cardButtons(cardID, false, loc))
	}
}

func (a *Adapter) handleResearchCallback(ctx context.Context, cardID int64, action string, cb *callbackQuery) {
	loc := a.locale(ctx)
	m := i18n.GetMessages(loc)

	parts := strings.Split(action, ":")
	var explicitPID *int64
	if len(parts) == 2 {
		pid, err := strconv.ParseInt(parts[1], 10, 64)
		if err == nil {
			if a.Service != nil {
				if _, gerr := a.Service.GetPlaybook(ctx, pid); gerr != nil {
					a.ackCallback(cb.ID, "Playbook no longer exists")
					return
				}
			}
			explicitPID = &pid
		}
	}

	if a.Service != nil {
		if active, err := a.Service.HasActiveResearch(ctx, cardID); err != nil {
			a.logf("telegram: HasActiveResearch(%d): %v", cardID, err)
		} else if active {
			a.ackCallback(cb.ID, m.ResearchAlreadyRunning)
			return
		}
	}

	a.ackCallback(cb.ID, "")
	if cb.Message != nil && cb.Message.Chat != nil {
		a.editReplyMarkupWithButtons(ctx, cb.Message.Chat.ID, cb.Message.MessageID, [][]button{{{Text: m.Researching, CallbackData: "ignore"}}})
		a.trackResearchMessage(cardID, cb.Message.Chat.ID, cb.Message.MessageID)
	}
	a.Service.GoResearch(context.WithoutCancel(ctx), cardID, explicitPID)
}

func (a *Adapter) handleForceCapture(ctx context.Context, captureID int64, cb *callbackQuery) {
	if a.Service == nil {
		a.ackCallback(cb.ID, "")
		return
	}
	loc := a.locale(ctx)
	m := i18n.GetMessages(loc)

	card, err := a.Service.ForceCapture(ctx, captureID)
	if err != nil {
		a.logf("telegram: ForceCapture(%d): %v", captureID, err)
		a.ackCallback(cb.ID, m.FailedToCreateCard)
		return
	}
	a.ackCallback(cb.ID, m.CardSaved)
	if cb.Message != nil && cb.Message.Chat != nil && card != nil {
		_ = a.editMessageText(ctx, cb.Message.Chat.ID, cb.Message.MessageID, cardCaption(*card, loc), card.ID, cardButtons(card.ID, false, loc))
	}
}

func parseCallback(data string) (id int64, action string, ok bool) {
	parts := strings.SplitN(data, ":", 2)
	if len(parts) == 2 {
		if pid, err := strconv.ParseInt(parts[0], 10, 64); err == nil && pid > 0 {
			return pid, parts[1], true
		}
	}

	all := strings.Split(data, ":")
	if len(all) >= 2 {
		if cid, err := strconv.ParseInt(all[1], 10, 64); err == nil && cid > 0 {
			if len(all) == 2 {
				return cid, all[0], true
			}
			return cid, all[0] + ":" + strings.Join(all[2:], ":"), true
		}
	}
	return 0, "", false
}

// setStatus persists a status change, answers the callback, clears the
// button keyboard and, for doing/done, sends the "done" summary.
func (a *Adapter) setStatus(ctx context.Context, id int64, status string, cb *callbackQuery) {
	if a.Service != nil {
		_, err := a.Service.UpdateCard(ctx, id, port.CardPatch{Status: &status})
		if err != nil {
			a.logf("telegram: UpdateCard(%d, %s): %v", id, status, err)
		}
	}
	a.ackCallback(cb.ID, "")
	if (status == port.StatusInProgress || status == port.StatusDone || status == port.StatusDismissed) && cb.Message != nil && cb.Message.MessageID != 0 && cb.Message.Chat != nil {
		a.editReplyMarkup(ctx, cb.Message.Chat.ID, cb.Message.MessageID)
	}
	if status == port.StatusDone && a.Service != nil {
		if card, gerr := a.Service.GetCard(ctx, id); gerr == nil {
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

// editReplyMarkupWithButtons updates the inline keyboard with new buttons.
func (a *Adapter) editReplyMarkupWithButtons(ctx context.Context, chatID, msgID int64, btns [][]button) {
	if _, err := a.call(ctx, "editMessageReplyMarkup", map[string]any{
		"chat_id":    chatID,
		"message_id": msgID,
		"reply_markup": map[string]any{
			"inline_keyboard": btns,
		},
	}); err != nil {
		a.logf("telegram: editMessageReplyMarkup: %v", err)
	}
}

// editReplyMarkup clears the inline keyboard once an action is taken so the
// buttons can't be re-pressed.
func (a *Adapter) editReplyMarkup(ctx context.Context, chatID, msgID int64) {
	a.editReplyMarkupWithButtons(ctx, chatID, msgID, [][]button{})
}

// handleReaction refines a card's horizon from an emoji on its bot message:
// ⭐ → lifetime, ⚡ → short-term. ponytail: passive hard-coded map; new
// reactions become a config map addition later.
func (a *Adapter) handleReaction(r *messageReaction) {
	var horizon string
	for _, re := range r.NewReaction {
		switch re.Emoji {
		case "⭐":
			horizon = port.HorizonLongTerm
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
	cardID := a.cardForMsg(r.MessageID)
	if cardID == 0 {
		return
	}
	if a.Service != nil {
		if _, err := a.Service.UpdateCard(context.Background(), cardID, port.CardPatch{Horizon: &horizon}); err != nil {
			a.logf("telegram: reaction update card %d: %v", cardID, err)
		}
	}
}

// maxTrackedMessages bounds the in-memory message→card map so it doesn't
// grow without limit over months of use.
const maxTrackedMessages = 500

func (a *Adapter) recordMsgCard(msgID, cardID int64) {
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

	if a.Service != nil {
		if err := a.Service.RecordChannelMessage(context.Background(), a.ID(), strconv.FormatInt(msgID, 10), cardID); err != nil {
			a.logf("telegram: record channel message %d -> %d: %v", msgID, cardID, err)
		}
	}
}

func (a *Adapter) cardForMsg(msgID int64) int64 {
	if msgID == 0 {
		return 0
	}
	a.msgMu.Lock()
	if a.msgCard != nil {
		if cardID, ok := a.msgCard[msgID]; ok && cardID > 0 {
			a.msgMu.Unlock()
			return cardID
		}
	}
	a.msgMu.Unlock()

	if a.Service != nil {
		cardID, err := a.Service.GetCardIDByChannelMessage(context.Background(), a.ID(), strconv.FormatInt(msgID, 10))
		if err == nil && cardID > 0 {
			a.msgMu.Lock()
			if a.msgCard == nil {
				a.msgCard = map[int64]int64{}
			}
			if len(a.msgCard) >= maxTrackedMessages {
				for k := range a.msgCard {
					delete(a.msgCard, k)
					break
				}
			}
			a.msgCard[msgID] = cardID
			a.msgMu.Unlock()
			return cardID
		}
	}
	return 0
}

func (a *Adapter) trackMessage(msgID, cardID int64) {
	a.recordMsgCard(msgID, cardID)
}

func (a *Adapter) cardForMessage(msgID int64) int64 {
	return a.cardForMsg(msgID)
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
	if a.BaseURL != "" {
		return a.BaseURL
	}
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
