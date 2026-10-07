package telegram

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"sparkkeep/internal/analyze"
	"sparkkeep/internal/capture"
	"sparkkeep/internal/config"
	"sparkkeep/internal/core"
	"sparkkeep/internal/port"
)

// stubStore embeds the interface so only the methods these tests exercise are
// implemented; anything else panics instead of pretending to work.
type stubStore struct {
	port.Store
	cards      map[int64]port.Card
	captures   map[int64]port.Capture
	researches map[int64]port.Research
	nextCard   int64
	nextCap    int64
	nextRes    int64
}

func newStubStore() *stubStore {
	return &stubStore{cards: map[int64]port.Card{}, captures: map[int64]port.Capture{}, researches: map[int64]port.Research{}}
}

func (s *stubStore) CreateCard(_ context.Context, c port.Card) (port.Card, error) {
	s.nextCard++
	c.ID = s.nextCard
	s.cards[c.ID] = c
	return c, nil
}

func (s *stubStore) GetCard(_ context.Context, id int64) (port.Card, error) {
	c, ok := s.cards[id]
	if !ok {
		return port.Card{}, port.ErrNotFound
	}
	return c, nil
}

func (s *stubStore) GetCardBySourceURL(_ context.Context, url string) (port.Card, error) {
	url = strings.TrimSpace(url)
	if url == "" {
		return port.Card{}, port.ErrNotFound
	}
	for _, c := range s.cards {
		if c.SourceURL == url {
			return c, nil
		}
	}
	return port.Card{}, port.ErrNotFound
}

func (s *stubStore) CreateCapture(_ context.Context, c port.Capture) (port.Capture, error) {
	if c.SourceURL != "" {
		for _, existing := range s.captures {
			if existing.SourceURL == c.SourceURL {
				return port.Capture{}, fmt.Errorf("UNIQUE constraint failed: idx_captures_source")
			}
		}
	}
	s.nextCap++
	c.ID = s.nextCap
	s.captures[c.ID] = c
	return c, nil
}

func (s *stubStore) GetCapture(_ context.Context, id int64) (port.Capture, error) {
	c, ok := s.captures[id]
	if !ok {
		return port.Capture{}, port.ErrNotFound
	}
	return c, nil
}

func (s *stubStore) GetCaptureBySourceURL(_ context.Context, url string) (port.Capture, error) {
	url = strings.TrimSpace(url)
	if url == "" {
		return port.Capture{}, port.ErrNotFound
	}
	for _, c := range s.captures {
		if c.SourceURL == url {
			return c, nil
		}
	}
	return port.Capture{}, port.ErrNotFound
}

func (s *stubStore) UpdateCapture(_ context.Context, c port.Capture) (port.Capture, error) {
	if _, ok := s.captures[c.ID]; !ok {
		return port.Capture{}, port.ErrNotFound
	}
	s.captures[c.ID] = c
	return c, nil
}

func (s *stubStore) UpdateCard(_ context.Context, id int64, p port.CardPatch) (port.Card, error) {
	c, ok := s.cards[id]
	if !ok {
		return port.Card{}, port.ErrNotFound
	}
	if p.Note != nil {
		c.SourceNote = *p.Note
	}
	if p.SourceURL != nil {
		c.SourceURL = *p.SourceURL
	}
	s.cards[id] = c
	return c, nil
}

func (s *stubStore) SetCardTags(_ context.Context, id int64, tags []string) error {
	c, ok := s.cards[id]
	if !ok {
		return port.ErrNotFound
	}
	c.Tags = tags
	s.cards[id] = c
	return nil
}

func (s *stubStore) ListCards(_ context.Context, f port.CardFilter) ([]port.Card, error) {
	var out []port.Card
	for _, c := range s.cards {
		if !f.Since.IsZero() && c.CreatedAt.Before(f.Since) {
			continue
		}
		out = append(out, c)
	}
	return out, nil
}

// stubTelegram points the adapter built by build at a stub Telegram API
// server, runs fn against it and returns the text of every message it posted.
func stubTelegram(t *testing.T, build func() *Adapter, fn func(a *Adapter)) []string {
	t.Helper()
	var sent []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var msg struct {
			Text string `json:"text"`
		}
		if err := json.NewDecoder(r.Body).Decode(&msg); err != nil {
			t.Errorf("decode sendMessage body: %v", err)
		}
		sent = append(sent, msg.Text)
		_, _ = w.Write([]byte(`{"ok":true,"result":{"message_id":7}}`))
	}))
	defer srv.Close()
	a := build()
	a.baseURL = srv.URL
	fn(a)
	return sent
}

// captureSendMessage runs fn against an Adapter wired to a stub Telegram API
// server and returns the text of the message it posted.
func captureSendMessage(t *testing.T, fn func(a *Adapter)) string {
	t.Helper()
	sent := stubTelegram(t, func() *Adapter { return &Adapter{Token: "tok", OwnerID: 1} }, fn)
	if len(sent) != 1 {
		t.Fatalf("posted %d messages, want 1", len(sent))
	}
	return sent[0]
}

// llmStub answers the analyze client's /chat/completions call with one card,
// so a reply that wrongly falls through to capture is visible as a new card.
func llmStub(t *testing.T, content string) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`, strconv.Quote(content))
	}))
	t.Cleanup(srv.Close)
	return srv
}

// stubService is a capture pipeline that never touches the network: a text
// share is echoed by the fetcher, the analyzer answers from llmStub.
func stubService(t *testing.T, st port.Store, llm *httptest.Server) *core.Service {
	t.Helper()
	ac := analyze.New(config.Config{LLMBase: llm.URL, LLMModel: "stub"}, llm.Client())
	return &core.Service{Store: st, Fetcher: capture.Capture{}, Analyze: ac, Logf: t.Logf}
}

func TestSendCardIncludesProposedActions(t *testing.T) {
	sent := captureSendMessage(t, func(a *Adapter) {
		err := a.sendCard(context.Background(), port.Card{
			ID:               7,
			Title:            "  Watch the talk  ",
			ExecutiveSummary: "Three takeaways.\n",
			Horizon:          port.HorizonShortTerm,
			Tags:             []string{"talks", "ml"},
			ProposedActions:  []string{" Read the paper ", "", "   ", "Share with the team"},
		})
		if err != nil {
			t.Errorf("sendCard: %v", err)
		}
	})
	want := "*Watch the talk*\n\nThree takeaways.\n\n*Next Steps:*\n" +
		"• Read the paper\n• Share with the team\n\n[short-term]\n#talks #ml"
	if sent != want {
		t.Errorf("caption =\n%q\nwant\n%q", sent, want)
	}
}

func TestSendCardNoProposedActions(t *testing.T) {
	sent := captureSendMessage(t, func(a *Adapter) {
		err := a.sendCard(context.Background(), port.Card{
			ID:              7,
			Title:           "Watch the talk",
			Summary:         "Plain summary.",
			Horizon:         port.HorizonLifetime,
			ProposedActions: []string{"", "  "},
		})
		if err != nil {
			t.Errorf("sendCard: %v", err)
		}
	})
	want := "*Watch the talk*\n\nPlain summary.\n\n[lifetime]"
	if sent != want {
		t.Errorf("caption =\n%q\nwant\n%q", sent, want)
	}
}

// Replying to a card message with "#tags + note" must merge the tags, append
// the note, and never capture a new card.
func TestOrganizeReplyUpdatesCardInPlace(t *testing.T) {
	st := newStubStore()
	st.cards[1] = port.Card{ID: 1, Title: "Watch the talk", Tags: []string{"ml"}, SourceNote: "first note"}
	svc := stubService(t, st, llmStub(t, `[{"title":"New","summary":"s","horizon":"short-term","tags":[],"links":[]}]`))

	sent := stubTelegram(t, func() *Adapter {
		a := &Adapter{Token: "tok", OwnerID: 1, Store: st, Service: svc}
		a.trackMessage(500, 1) // card 1 went out as bot message 500
		return a
	}, func(a *Adapter) {
		a.handleMessage(&message{
			MessageID:      501,
			Chat:           &chat{ID: 1},
			Text:           "#AI #ML reading list for later",
			ReplyToMessage: &message{MessageID: 500},
		})
	})

	if len(st.cards) != 1 {
		t.Fatalf("cards = %d, want 1 (an organized reply must not capture)", len(st.cards))
	}
	c := st.cards[1]
	if want := []string{"ml", "ai"}; !slices.Equal(c.Tags, want) {
		t.Errorf("tags = %v, want %v", c.Tags, want)
	}
	if want := "first note\nreading list for later"; c.SourceNote != want {
		t.Errorf("SourceNote = %q, want %q", c.SourceNote, want)
	}
	if want := []string{"Updated card #1\n#ml #ai"}; !slices.Equal(sent, want) {
		t.Errorf("sent = %v, want %v", sent, want)
	}
}

// A reply to a message that is not a tracked card is a normal share: it must
// fall through to CaptureShare instead of being swallowed.
func TestOrganizeReplyUntrackedFallsThroughToCapture(t *testing.T) {
	st := newStubStore()
	st.cards[1] = port.Card{ID: 1, Title: "Existing"}
	st.nextCard = 1
	svc := stubService(t, st, llmStub(t, `[{"title":"New","summary":"s","horizon":"short-term","tags":[],"links":[]}]`))

	sent := stubTelegram(t, func() *Adapter {
		return &Adapter{Token: "tok", OwnerID: 1, Store: st, Service: svc}
	}, func(a *Adapter) {
		a.handleMessage(&message{
			MessageID:      502,
			Chat:           &chat{ID: 1},
			Text:           "a brand new thought",
			ReplyToMessage: &message{MessageID: 999},
		})
	})

	if len(st.cards) != 2 {
		t.Fatalf("cards = %d, want 2 (untracked reply must capture)", len(st.cards))
	}
	if got := st.cards[2].Title; got != "New" {
		t.Errorf("captured title = %q, want New", got)
	}
	if len(sent) != 0 {
		t.Errorf("sent = %v, want no organize confirmation", sent)
	}
}

// /digest reports the last 7 days by status plus the most recent titles, and
// must never capture itself as a card.
func TestDigestCommandSendsCountsWithoutCapturing(t *testing.T) {
	st := newStubStore()
	now := time.Now().UTC()
	st.cards = map[int64]port.Card{
		1: {ID: 1, Title: "Inbox one", Status: port.StatusInbox, Horizon: port.HorizonShortTerm, CreatedAt: now.Add(-6 * 24 * time.Hour)},
		2: {ID: 2, Title: "Inbox two", Status: port.StatusInbox, Horizon: port.HorizonShortTerm, CreatedAt: now.Add(-3 * 24 * time.Hour)},
		3: {ID: 3, Title: "WIP talk", Status: port.StatusDoing, Horizon: port.HorizonShortTerm, CreatedAt: now.Add(-2 * 24 * time.Hour)},
		4: {ID: 4, Title: "Finished book", Status: port.StatusDone, Horizon: port.HorizonLifetime, CreatedAt: now.Add(-time.Hour)},
		5: {ID: 5, Title: "Old shelved", Status: port.StatusShelved, Horizon: port.HorizonShortTerm, CreatedAt: now.Add(-30 * 24 * time.Hour)},
	}
	st.nextCard = 5
	svc := stubService(t, st, llmStub(t, `[{"title":"New","summary":"s","horizon":"short-term","tags":[],"links":[]}]`))

	sent := stubTelegram(t, func() *Adapter {
		return &Adapter{Token: "tok", OwnerID: 1, Store: st, Service: svc, PublicURL: "https://spark.example/"}
	}, func(a *Adapter) {
		a.handleMessage(&message{MessageID: 600, Chat: &chat{ID: 1}, Text: "/digest"})
	})

	if len(st.cards) != 5 {
		t.Fatalf("cards = %d, want 5 (/digest must not capture)", len(st.cards))
	}
	if len(sent) != 1 {
		t.Fatalf("sent %d messages, want 1 digest: %v", len(sent), sent)
	}
	want := "📊 *Sparkkeep Weekly Digest*\nLast 7 days: 4 cards captured\n\n" +
		"• 📥 Inbox: 2\n• ⚡ Doing: 1\n• ✅ Done: 1\n• 📦 Shelved: 0\n\n" +
		"*Recent Sparks:*\n" +
		"1. Finished book [lifetime]\n2. WIP talk [short-term]\n3. Inbox two [short-term]\n4. Inbox one [short-term]\n\n" +
		"Open dashboard: https://spark.example"
	if sent[0] != want {
		t.Errorf("digest =\n%q\nwant\n%q", sent[0], want)
	}
}

// The scheduled push fires exactly once at the configured weekday/hour, stays
// quiet for the rest of that day, and fires again the following week.
func TestDigestScheduler_TriggersAtScheduledTime(t *testing.T) {
	st := newStubStore()
	sent := stubTelegram(t, func() *Adapter {
		return &Adapter{Token: "tok", OwnerID: 1, Store: st, DigestPushDay: time.Wednesday, DigestPushHour: 19}
	}, func(a *Adapter) {
		wednesday := time.Date(2026, 10, 7, 0, 0, 0, 0, time.Local)
		at := func(day time.Weekday, hour int) time.Time {
			return wednesday.AddDate(0, 0, int(day)-int(wednesday.Weekday())).
				Add(time.Duration(hour) * time.Hour)
		}
		ctx := context.Background()
		a.digestTick(ctx, at(time.Wednesday, 19)) // on time: fires
		a.digestTick(ctx, at(time.Wednesday, 19)) // same minute again: suppressed
		a.digestTick(ctx, at(time.Wednesday, 19).Add(30*time.Minute))
		a.digestTick(ctx, at(time.Thursday, 19))                   // wrong day: silent
		a.digestTick(ctx, at(time.Wednesday, 20))                  // wrong hour: silent
		a.digestTick(ctx, at(time.Wednesday, 19).AddDate(0, 0, 7)) // next week: fires
	})

	if len(sent) != 2 {
		t.Fatalf("sent %d digests, want 2 (one per week): %v", len(sent), sent)
	}
}

// /help answers with the how-to text and never captures.
func TestHelpCommandSendsHelpWithoutCapturing(t *testing.T) {
	st := newStubStore()
	svc := stubService(t, st, llmStub(t, `[{"title":"New","summary":"s","horizon":"short-term","tags":[],"links":[]}]`))

	sent := stubTelegram(t, func() *Adapter {
		return &Adapter{Token: "tok", OwnerID: 1, Store: st, Service: svc}
	}, func(a *Adapter) {
		a.handleMessage(&message{MessageID: 601, Chat: &chat{ID: 1}, Text: "/start"})
	})

	if len(st.cards) != 0 {
		t.Fatalf("cards = %d, want 0 (/help must not capture)", len(st.cards))
	}
	if len(sent) != 1 || sent[0] != helpText {
		t.Errorf("sent = %v, want the help text", sent)
	}
}

func TestParseCallback(t *testing.T) {
	tests := []struct {
		input      string
		wantID     int64
		wantAction string
		wantOK     bool
	}{
		{"42:doing", 42, "doing", true},
		{"1:retry", 1, "retry", true},
		{"invalid", 0, "", false},
		{"abc:doing", 0, "", false},
		{"-5:doing", 0, "", false},
		{"0:doing", 0, "", false},
	}

	for _, tt := range tests {
		id, action, ok := parseCallback(tt.input)
		if ok != tt.wantOK || id != tt.wantID || action != tt.wantAction {
			t.Errorf("parseCallback(%q) = (%d, %q, %v); want (%d, %q, %v)",
				tt.input, id, action, ok, tt.wantID, tt.wantAction, tt.wantOK)
		}
	}
}

func TestOffsetHandling(t *testing.T) {
	dir := t.TempDir()
	filePath := dir + "/test_offset.json"

	a := &Adapter{offsetP: filePath}
	// Initial read should be 0
	if off := a.readOffset(); off != 0 {
		t.Fatalf("expected 0 initial offset, got %d", off)
	}

	// Write offset and read back
	a.writeOffset(12345)
	if off := a.readOffset(); off != 12345 {
		t.Fatalf("expected 12345 offset, got %d", off)
	}

	// Custom environment variable test
	t.Setenv("SPARKKEEP_OFFSET_FILE", dir+"/env_offset.json")
	aEnv := &Adapter{}
	if aEnv.offsetFile() != dir+"/env_offset.json" {
		t.Fatalf("expected env offset file, got %q", aEnv.offsetFile())
	}
}

func TestNotifyVariants(t *testing.T) {
	card := port.Card{
		ID:      10,
		Title:   "Notify Card",
		Summary: "Summary text",
	}

	// 1. Notify duplicate
	sent := stubTelegram(t, func() *Adapter {
		return &Adapter{Token: "tok", OwnerID: 1}
	}, func(a *Adapter) {
		err := a.Notify(context.Background(), port.Notification{
			Kind: "duplicate",
			Card: card,
			Text: "Already captured: Notify Card",
		})
		if err != nil {
			t.Fatalf("Notify duplicate: %v", err)
		}
	})
	if len(sent) != 1 || sent[0] != "Already captured: Notify Card" {
		t.Fatalf("unexpected duplicate sent: %v", sent)
	}

	// 2. Notify default (e.g. done)
	sent = stubTelegram(t, func() *Adapter {
		return &Adapter{Token: "tok", OwnerID: 1}
	}, func(a *Adapter) {
		err := a.Notify(context.Background(), port.Notification{
			Kind: "done",
			Card: card,
		})
		if err != nil {
			t.Fatalf("Notify done: %v", err)
		}
	})
	if len(sent) != 1 || !slices.Contains(sent, "Notify Card\nSummary text") {
		t.Fatalf("unexpected done sent: %v", sent)
	}
}

func TestTelegramNotificationCounts(t *testing.T) {
	st := newStubStore()
	llmJSON := `[
		{"title":"Card One","summary":"First card","horizon":"short-term","tags":[],"links":[]},
		{"title":"Card Two","summary":"Second card","horizon":"short-term","tags":[],"links":[]},
		{"title":"Card Three","summary":"Third card","horizon":"short-term","tags":[],"links":[]}
	]`
	llm := llmStub(t, llmJSON)
	svc := stubService(t, st, llm)

	var adapter *Adapter
	sent := stubTelegram(t, func() *Adapter {
		adapter = &Adapter{Token: "tok", OwnerID: 1, Store: st, Service: svc}
		svc.Channel = adapter
		return adapter
	}, func(a *Adapter) {
		// First share of a URL yielding 3 cards
		a.handleMessage(&message{
			MessageID: 100,
			Chat:      &chat{ID: 1},
			Text:      "https://example.com/multi-tool-post",
		})
	})

	if len(st.cards) != 3 {
		t.Fatalf("stored cards = %d, want 3", len(st.cards))
	}
	if len(sent) != 3 {
		t.Fatalf("sent notifications = %d, want 3", len(sent))
	}

	// Capture the same URL again
	dupSent := stubTelegram(t, func() *Adapter {
		return adapter
	}, func(a *Adapter) {
		a.handleMessage(&message{
			MessageID: 101,
			Chat:      &chat{ID: 1},
			Text:      "https://example.com/multi-tool-post",
		})
	})

	if len(st.cards) != 3 {
		t.Fatalf("stored cards after duplicate = %d, want 3 (no new cards)", len(st.cards))
	}
	if len(dupSent) != 1 {
		t.Fatalf("sent notifications on duplicate = %d, want 1", len(dupSent))
	}
	if !strings.Contains(dupSent[0], "Already captured") {
		t.Errorf("duplicate message text = %q, want 'Already captured...'", dupSent[0])
	}
}

func TestTelegramRetryCallback(t *testing.T) {
	st := newStubStore()
	capID := int64(1)
	st.captures[capID] = port.Capture{ID: capID, Text: "Page text to retry"}
	_, err := st.CreateCard(context.Background(), port.Card{
		ID:         1,
		CaptureID:  &capID,
		Title:      "Analysis failed",
		Status:     port.StatusInbox,
		SourceNote: "https://example.com/retry",
	})
	if err != nil {
		t.Fatalf("CreateCard: %v", err)
	}

	llmJSON := `[{"title":"Retried Successfully","summary":"Retried card summary","horizon":"short-term","tags":[],"links":[]}]`
	llm := llmStub(t, llmJSON)
	svc := stubService(t, st, llm)

	sent := stubTelegram(t, func() *Adapter {
		adapter := &Adapter{Token: "tok", OwnerID: 1, Store: st, Service: svc}
		svc.Channel = adapter
		return adapter
	}, func(a *Adapter) {
		a.handleCallback(&callbackQuery{
			ID:   "cb1",
			From: &user{ID: 1},
			Data: "1:retry",
			Message: &message{
				MessageID: 10,
				Chat:      &chat{ID: 1},
			},
		})
	})

	var cardMsg string
	for _, m := range sent {
		if strings.Contains(m, "Retried Successfully") {
			cardMsg = m
			break
		}
	}
	if cardMsg == "" {
		t.Fatalf("expected notification to contain retried card, got: %v", sent)
	}
}
