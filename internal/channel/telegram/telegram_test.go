package telegram

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"sparkkeep/internal/analyze"
	"sparkkeep/internal/capture"
	"sparkkeep/internal/config"
	"sparkkeep/internal/core"
	"sparkkeep/internal/port"
	"sparkkeep/internal/research"
)

const jsonIdea = `[{"title":"T","summary":"s","horizon":"short-term","tags":[],"links":[]}]`

// --- fake Bot API server -----------------------------------------------------

// fakeBot emulates the Bot API: it records every request and serves queued
// getUpdates batches; once the queue is dry, getUpdates blocks until the
// request context is cancelled. sendMessage returns a monotonically
// increasing message_id (used to link reactions to cards).
type fakeBot struct {
	mu      sync.Mutex
	calls   []call
	updates [][]update
	block   chan struct{}
	msgID   int64
}

type call struct {
	path string
	body string
}

func newFakeBot(t *testing.T, updates [][]update) *fakeBot {
	t.Helper()
	return &fakeBot{updates: updates, block: make(chan struct{})}
}

func (f *fakeBot) handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		f.mu.Lock()
		f.calls = append(f.calls, call{path: r.URL.Path, body: string(body)})
		f.mu.Unlock()
		switch strings.TrimPrefix(r.URL.Path, "/botTOKEN/") {
		case "getUpdates":
			f.serveUpdates(w, r)
		case "sendMessage":
			f.mu.Lock()
			f.msgID++
			id := f.msgID
			f.mu.Unlock()
			fmt.Fprintf(w, `{"ok":true,"result":{"message_id":%d}}`, id)
		default:
			fmt.Fprint(w, `{"ok":true,"result":{}}`)
		}
	})
}

func (f *fakeBot) serveUpdates(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	var batch []update
	if len(f.updates) > 0 {
		batch = f.updates[0]
		f.updates = f.updates[1:]
	}
	f.mu.Unlock()
	if batch == nil {
		select {
		case <-r.Context().Done():
		case <-f.block:
		}
	}
	b, _ := json.Marshal(batch)
	fmt.Fprintf(w, `{"ok":true,"result":%s}`, b)
}

// saw reports whether a method (path suffix) was called.
func (f *fakeBot) saw(method string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, c := range f.calls {
		if strings.HasSuffix(c.path, "/"+method) {
			return true
		}
	}
	return false
}

// lastBody returns the body of the most recent call to method.
func (f *fakeBot) lastBody(method string) string {
	f.mu.Lock()
	defer f.mu.Unlock()
	for i := len(f.calls) - 1; i >= 0; i-- {
		if strings.HasSuffix(f.calls[i].path, "/"+method) {
			return f.calls[i].body
		}
	}
	return ""
}

// --- stub Store ---------------------------------------------------------------

// stubStore is an in-memory port.Store; maps are mutex-guarded because the
// research callback path runs in a goroutine.
type stubStore struct {
	mu         sync.Mutex
	cards      map[int64]port.Card
	researches map[int64]port.Research
	nextCard   int64
	nextRes    int64
}

func newStubStore() *stubStore {
	return &stubStore{cards: map[int64]port.Card{}, researches: map[int64]port.Research{}}
}

func (s *stubStore) CreateCard(_ context.Context, c port.Card) (port.Card, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextCard++
	c.ID = s.nextCard
	c.CreatedAt = time.Now().UTC()
	c.UpdatedAt = c.CreatedAt
	s.cards[c.ID] = c
	return c, nil
}

func (s *stubStore) GetCard(_ context.Context, id int64) (port.Card, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c, ok := s.cards[id]
	if !ok {
		return port.Card{}, port.ErrNotFound
	}
	return c, nil
}

func (s *stubStore) GetCardBySourceURL(_ context.Context, url string) (port.Card, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
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

func (s *stubStore) ListCards(context.Context, port.CardFilter) ([]port.Card, error) { return nil, nil }

func (s *stubStore) UpdateCard(_ context.Context, id int64, p port.CardPatch) (port.Card, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c, ok := s.cards[id]
	if !ok {
		return port.Card{}, port.ErrNotFound
	}
	if p.Status != nil {
		c.Status = *p.Status
	}
	if p.Horizon != nil {
		c.Horizon = *p.Horizon
	}
	if p.Note != nil {
		c.SourceNote = *p.Note
	}
	c.UpdatedAt = time.Now().UTC()
	s.cards[id] = c
	return c, nil
}

func (s *stubStore) SetCardTags(context.Context, int64, []string) error { return nil }
func (s *stubStore) ListTags(context.Context) ([]port.Tag, error)       { return nil, nil }

func (s *stubStore) CreateResearch(_ context.Context, cardID int64, query string) (port.Research, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextRes++
	r := port.Research{ID: s.nextRes, CardID: cardID, Status: "queued", Query: query, CreatedAt: time.Now().UTC()}
	s.researches[r.ID] = r
	return r, nil
}

func (s *stubStore) HasActiveResearch(_ context.Context, cardID int64) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, r := range s.researches {
		if r.CardID == cardID && (r.Status == "queued" || r.Status == "running") {
			return true, nil
		}
	}
	return false, nil
}

func (s *stubStore) SetResearch(_ context.Context, id int64, status, findings, errMsg string) (port.Research, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.researches[id]
	if !ok {
		return port.Research{}, port.ErrNotFound
	}
	r.Status, r.Findings, r.Error = status, findings, errMsg
	s.researches[id] = r
	return r, nil
}

func (s *stubStore) GetResearch(_ context.Context, id int64) (port.Research, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.researches[id]
	if !ok {
		return port.Research{}, port.ErrNotFound
	}
	return r, nil
}

func (s *stubStore) ListResearch(context.Context) ([]port.Research, error) { return nil, nil }
func (s *stubStore) Close() error                                          { return nil }

func (s *stubStore) researchRows() []port.Research {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]port.Research, 0, len(s.researches))
	for _, r := range s.researches {
		out = append(out, r)
	}
	return out
}

// --- stub core ----------------------------------------------------------------

// recLLM records every chat/completions request body and answers with a
// canned model content.
func recLLM(content string) (*httptest.Server, *[]string) {
	var bodies []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		bodies = append(bodies, string(b))
		fmt.Fprintf(w, `{"choices":[{"message":{"content":%v}}]}`, strconv.Quote(content))
	}))
	return srv, &bodies
}

// stubService returns a core.Service with stubbed analyze + research clients
// pointed at the recording LLM server, so Capture/Research run end-to-end
// against fake HTTP.
func stubService(t *testing.T, llm *httptest.Server, st *stubStore) *core.Service {
	t.Helper()
	ac := analyze.New(config.Config{LLMBase: llm.URL, LLMModel: "stub"}, llm.Client())
	return &core.Service{
		Store:   st,
		Fetcher: capture.Capture{},
		Analyze: ac,
		Runner:  research.New(config.Config{}, ac),
		Logf:    t.Logf,
	}
}

func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("condition not met in time")
}

func ownerMsg(id int64) *message {
	return &message{Chat: &chat{ID: 1}, Text: "hello", MessageID: id}
}

// --- inbound: messages ---------------------------------------------------------

func TestOwnerIgnore(t *testing.T) {
	llm, bodies := recLLM(jsonIdea)
	defer llm.Close()
	st := newStubStore()
	a := &Adapter{Token: "TOKEN", OwnerID: 1, Service: stubService(t, llm, st), Store: st, Logf: t.Logf}
	a.handleUpdate(update{ID: 1, Msg: &message{Chat: &chat{ID: 2}, Text: "hi"}})
	if len(*bodies) != 0 {
		t.Fatalf("Capture called %d times, want 0", len(*bodies))
	}
}

func TestMessageCapturesText(t *testing.T) {
	llm, bodies := recLLM(jsonIdea)
	defer llm.Close()
	st := newStubStore()
	a := &Adapter{Token: "TOKEN", OwnerID: 1, Service: stubService(t, llm, st), Store: st, Logf: t.Logf}
	a.handleUpdate(update{ID: 1, Msg: ownerMsg(10)})
	if n := len(*bodies); n != 1 {
		t.Fatalf("Capture called %d times, want 1", n)
	}
	if !strings.Contains((*bodies)[0], "hello") {
		t.Fatalf("capture payload missing text: %s", (*bodies)[0])
	}
}

func TestPhotoWithCaptionFallsToText(t *testing.T) {
	llm, bodies := recLLM(jsonIdea)
	defer llm.Close()
	st := newStubStore()
	a := &Adapter{Token: "TOKEN", OwnerID: 1, Service: stubService(t, llm, st), Store: st, Logf: t.Logf}
	a.handleUpdate(update{ID: 1, Msg: &message{
		Chat:    &chat{ID: 1},
		Caption: "x",
		Photo:   []photoSize{{FileID: "p1"}},
	}})
	if n := len(*bodies); n != 1 || !strings.Contains((*bodies)[0], "x") {
		t.Fatalf("want one capture with caption, bodies=%q", *bodies)
	}
}

func TestNoTextNoAction(t *testing.T) {
	llm, bodies := recLLM(jsonIdea)
	defer llm.Close()
	st := newStubStore()
	a := &Adapter{Token: "TOKEN", OwnerID: 1, Service: stubService(t, llm, st), Store: st, Logf: t.Logf}
	a.handleUpdate(update{ID: 1, Msg: &message{Chat: &chat{ID: 1}, Photo: []photoSize{{FileID: "p1"}}}})
	if len(*bodies) != 0 {
		t.Fatalf("Capture called %d times, want 0", len(*bodies))
	}
}

// --- inbound: callbacks --------------------------------------------------------

func TestCallbackDoing(t *testing.T) {
	bot := newFakeBot(t, nil)
	srv := httptest.NewServer(bot.handler())
	defer srv.Close()
	st := newStubStore()
	st.cards[5] = port.Card{ID: 5, Title: "T"}
	a := &Adapter{Token: "TOKEN", OwnerID: 1, Store: st, Logf: t.Logf, baseURL: srv.URL}
	a.handleUpdate(update{ID: 2, CB: &callbackQuery{
		ID: "cq1", From: &user{ID: 1}, Data: "5:doing",
		Message: &message{MessageID: 50, Chat: &chat{ID: 1}},
	}})
	if got := st.cards[5].Status; got != port.StatusDoing {
		t.Fatalf("card status = %q, want doing", got)
	}
	if !bot.saw("answerCallbackQuery") {
		t.Fatalf("expected answerCallbackQuery; calls=%+v", bot.calls)
	}
}

func TestCallbackResearch(t *testing.T) {
	llm, _ := recLLM("cli-fi reading list")
	defer llm.Close()
	bot := newFakeBot(t, nil)
	srv := httptest.NewServer(bot.handler())
	defer srv.Close()
	st := newStubStore()
	st.cards[5] = port.Card{ID: 5, Title: "T", Summary: "S"}
	a := &Adapter{Token: "TOKEN", OwnerID: 1, Service: stubService(t, llm, st), Store: st, Logf: t.Logf, baseURL: srv.URL}
	a.handleUpdate(update{ID: 2, CB: &callbackQuery{ID: "cq1", From: &user{ID: 1}, Data: "5:research"}})
	waitFor(t, func() bool {
		for _, r := range st.researchRows() {
			if r.CardID == 5 {
				return true
			}
		}
		return false
	})
}

func TestCallbackResearchActiveAcksWithNotice(t *testing.T) {
	llm, _ := recLLM("cli-fi reading list")
	defer llm.Close()
	bot := newFakeBot(t, nil)
	srv := httptest.NewServer(bot.handler())
	defer srv.Close()
	st := newStubStore()
	st.cards[5] = port.Card{ID: 5, Title: "T", Summary: "S"}
	st.researches[1] = port.Research{ID: 1, CardID: 5, Status: "queued", CreatedAt: time.Now().UTC()}
	st.nextRes = 1
	a := &Adapter{Token: "TOKEN", OwnerID: 1, Service: stubService(t, llm, st), Store: st, Logf: t.Logf, baseURL: srv.URL}
	a.handleUpdate(update{ID: 2, CB: &callbackQuery{ID: "cq1", From: &user{ID: 1}, Data: "5:research"}})

	if !bot.saw("answerCallbackQuery") {
		t.Fatalf("expected answerCallbackQuery; calls=%+v", bot.calls)
	}
	if body := bot.lastBody("answerCallbackQuery"); !strings.Contains(body, "already running") {
		t.Fatalf("ack = %s, want notice about already running", body)
	}
	time.Sleep(100 * time.Millisecond) // give any (wrong) goroutine time to insert
	if rows := st.researchRows(); len(rows) != 1 {
		t.Fatalf("research rows = %d, want 1 (no second row)", len(rows))
	}
}

// --- inbound: reactions ---------------------------------------------------------

func TestReactionStarLifetime(t *testing.T) {
	bot := newFakeBot(t, nil)
	srv := httptest.NewServer(bot.handler())
	defer srv.Close()
	st := newStubStore()
	st.cards[7] = port.Card{ID: 7}
	a := &Adapter{Token: "TOKEN", OwnerID: 1, Store: st, Logf: t.Logf, baseURL: srv.URL}
	if err := a.Notify(context.Background(), port.Notification{Kind: "created", Card: st.cards[7]}); err != nil {
		t.Fatalf("Notify err: %v", err)
	}
	react := func(emoji string) {
		a.handleUpdate(update{ID: 3, Reaction: &messageReaction{
			MessageID:   1, // the id the fake bot returned for the Notify message
			NewReaction: []emojiReaction{{Type: "emoji", Emoji: emoji}},
		}})
	}
	react("⭐")
	if got := st.cards[7].Horizon; got != port.HorizonLifetime {
		t.Fatalf("horizon = %q, want lifetime", got)
	}
	react("⚡")
	if got := st.cards[7].Horizon; got != port.HorizonShortTerm {
		t.Fatalf("horizon = %q, want short-term", got)
	}
}

// --- outbound -------------------------------------------------------------------

func TestCardButtonsIncludeDismiss(t *testing.T) {
	bot := newFakeBot(t, nil)
	srv := httptest.NewServer(bot.handler())
	defer srv.Close()
	a := &Adapter{Token: "TOKEN", OwnerID: 1, Logf: t.Logf, baseURL: srv.URL}
	if err := a.Notify(context.Background(), port.Notification{
		Kind: "created",
		Card: port.Card{ID: 5, Title: "T", Summary: "S", Horizon: port.HorizonLifetime},
	}); err != nil {
		t.Fatalf("Notify err: %v", err)
	}
	body := bot.lastBody("sendMessage")
	for _, want := range []string{`"5:dismiss"`, `"Not interested"`} {
		if !strings.Contains(body, want) {
			t.Fatalf("sendMessage body missing %s: %s", want, body)
		}
	}
}

func TestCallbackDismiss(t *testing.T) {
	bot := newFakeBot(t, nil)
	srv := httptest.NewServer(bot.handler())
	defer srv.Close()
	st := newStubStore()
	st.cards[5] = port.Card{ID: 5, Title: "T"}
	a := &Adapter{Token: "TOKEN", OwnerID: 1, Store: st, Logf: t.Logf, baseURL: srv.URL}
	a.handleUpdate(update{ID: 2, CB: &callbackQuery{
		ID: "cq1", From: &user{ID: 1}, Data: "5:dismiss",
		Message: &message{MessageID: 50, Chat: &chat{ID: 1}},
	}})
	if got := st.cards[5].Status; got != port.StatusDismissed {
		t.Fatalf("card status = %q, want dismissed", got)
	}
	if !bot.saw("editMessageReplyMarkup") {
		t.Fatalf("expected keyboard cleared; calls=%+v", bot.calls)
	}
}

func TestNotifyDuplicateSendsNotice(t *testing.T) {
	bot := newFakeBot(t, nil)
	srv := httptest.NewServer(bot.handler())
	defer srv.Close()
	a := &Adapter{Token: "TOKEN", OwnerID: 1, Logf: t.Logf, baseURL: srv.URL}
	if err := a.Notify(context.Background(), port.Notification{
		Kind: "duplicate",
		Card: port.Card{ID: 5, Title: "Existing"},
		Text: "Already captured: Existing",
	}); err != nil {
		t.Fatalf("Notify err: %v", err)
	}
	body := bot.lastBody("sendMessage")
	if !strings.Contains(body, "Already captured") {
		t.Fatalf("sendMessage missing duplicate notice: %s", body)
	}
}

func TestResearchMessageHasButtons(t *testing.T) {
	bot := newFakeBot(t, nil)
	srv := httptest.NewServer(bot.handler())
	defer srv.Close()
	a := &Adapter{Token: "TOKEN", OwnerID: 1, Logf: t.Logf, baseURL: srv.URL}
	if err := a.Notify(context.Background(), port.Notification{
		Kind: "research_done", Text: "Research complete",
		Res: &port.Research{ID: 7, CardID: 5},
	}); err != nil {
		t.Fatalf("Notify err: %v", err)
	}
	body := bot.lastBody("sendMessage")
	for _, want := range []string{`"5:dismiss"`, `"5:doing"`, "/api/v1/research/7"} {
		if !strings.Contains(body, want) {
			t.Fatalf("sendMessage body missing %s: %s", want, body)
		}
	}
}

func TestNotifySendsKeyboard(t *testing.T) {
	bot := newFakeBot(t, nil)
	srv := httptest.NewServer(bot.handler())
	defer srv.Close()
	a := &Adapter{Token: "TOKEN", OwnerID: 1, Logf: t.Logf, baseURL: srv.URL}
	if err := a.Notify(context.Background(), port.Notification{
		Kind: "created",
		Card: port.Card{ID: 5, Title: "T", Summary: "S", Horizon: port.HorizonLifetime, Tags: []string{"a", "b"}},
	}); err != nil {
		t.Fatalf("Notify err: %v", err)
	}
	body := bot.lastBody("sendMessage")
	for _, want := range []string{`"5:doing"`, `"5:done"`, `"5:research"`, `"5:shelve"`,
		`"Doing"`, `"Done"`, `"Research"`, `"Shelve"`} {
		if !strings.Contains(body, want) {
			t.Fatalf("sendMessage body missing %s: %s", want, body)
		}
	}
}

func TestNotifyResearchLink(t *testing.T) {
	bot := newFakeBot(t, nil)
	srv := httptest.NewServer(bot.handler())
	defer srv.Close()
	a := &Adapter{Token: "TOKEN", OwnerID: 1, Logf: t.Logf, baseURL: srv.URL}
	if err := a.Notify(context.Background(), port.Notification{
		Kind: "research_done", Text: "Research complete",
		Res: &port.Research{ID: 7},
	}); err != nil {
		t.Fatalf("Notify err: %v", err)
	}
	body := bot.lastBody("sendMessage")
	if !strings.Contains(body, "/api/v1/research/7") {
		t.Fatalf("sendMessage missing research link: %s", body)
	}
	if !strings.Contains(body, "Research complete") {
		t.Fatalf("sendMessage missing summary: %s", body)
	}
}

// --- long-poll loop ---------------------------------------------------------------

func TestRunPollLoopNoPanic(t *testing.T) {
	bot := newFakeBot(t, [][]update{{{
		ID: 1, Msg: &message{Chat: &chat{ID: 999}, Text: "ignored"},
	}}})
	srv := httptest.NewServer(bot.handler())
	defer srv.Close()
	offset := filepath.Join(t.TempDir(), "offset.json")
	a := &Adapter{
		Token:   "TOKEN",
		OwnerID: 1,
		Service: &core.Service{Logf: t.Logf},
		Store:   newStubStore(),
		Logf:    t.Logf,
		baseURL: srv.URL,
		offsetP: offset,
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- a.Run(ctx) }()

	waitFor(t, func() bool {
		b, err := os.ReadFile(offset)
		return err == nil && strings.Contains(string(b), `"offset":1`)
	})
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Run err = %v, want nil", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("Run did not return after cancel")
	}
}
