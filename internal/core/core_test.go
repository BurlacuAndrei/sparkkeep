package core

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"sparkkeep/internal/analyze"
	"sparkkeep/internal/asr"
	"sparkkeep/internal/capture"
	"sparkkeep/internal/config"
	"sparkkeep/internal/port"
	"sparkkeep/internal/research"
)

// --- stubs -----------------------------------------------------------------

// stubStore is an in-memory port.Store.
type stubStore struct {
	cards      map[int64]port.Card
	researches map[int64]port.Research
	nextCard   int64
	nextRes    int64
}

func newStubStore() *stubStore {
	return &stubStore{cards: map[int64]port.Card{}, researches: map[int64]port.Research{}}
}

func (s *stubStore) CreateCard(_ context.Context, c port.Card) (port.Card, error) {
	s.nextCard++
	c.ID = s.nextCard
	c.CreatedAt = time.Now().UTC()
	c.UpdatedAt = c.CreatedAt
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

func (s *stubStore) ListCards(context.Context, port.CardFilter) ([]port.Card, error) {
	return nil, nil
}

func (s *stubStore) UpdateCard(_ context.Context, id int64, p port.CardPatch) (port.Card, error) {
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

func (s *stubStore) SetCardTags(_ context.Context, id int64, tags []string) error {
	c, ok := s.cards[id]
	if !ok {
		return port.ErrNotFound
	}
	c.Tags = tags
	s.cards[id] = c
	return nil
}

func (s *stubStore) ListTags(context.Context) ([]port.Tag, error) {
	return nil, nil
}

func (s *stubStore) CreateResearch(_ context.Context, cardID int64, query string) (port.Research, error) {
	s.nextRes++
	r := port.Research{ID: s.nextRes, CardID: cardID, Status: "queued", Query: query, CreatedAt: time.Now().UTC()}
	s.researches[r.ID] = r
	return r, nil
}

func (s *stubStore) HasActiveResearch(_ context.Context, cardID int64) (bool, error) {
	for _, r := range s.researches {
		if r.CardID == cardID && (r.Status == "queued" || r.Status == "running") {
			return true, nil
		}
	}
	return false, nil
}

func (s *stubStore) SetResearch(_ context.Context, id int64, status, findings, errMsg string) (port.Research, error) {
	r, ok := s.researches[id]
	if !ok {
		return port.Research{}, port.ErrNotFound
	}
	r.Status, r.Findings, r.Error = status, findings, errMsg
	s.researches[id] = r
	return r, nil
}

func (s *stubStore) GetResearch(_ context.Context, id int64) (port.Research, error) {
	r, ok := s.researches[id]
	if !ok {
		return port.Research{}, port.ErrNotFound
	}
	return r, nil
}

func (s *stubStore) ListResearch(context.Context) ([]port.Research, error) {
	return nil, nil
}

func (s *stubStore) Close() error { return nil }

// stubChannel records notifications; when err is set Notify returns it.
type stubChannel struct {
	notifies []port.Notification
	err      error
}

func (c *stubChannel) Notify(_ context.Context, n port.Notification) error {
	c.notifies = append(c.notifies, n)
	return c.err
}

// stubFetcher is a scriptable capture.Fetcher.
type stubFetcher struct {
	recognize func(raw string) capture.Share
	fetch     func(s capture.Share) capture.Fetched
	mediaMeta func(s capture.Share) capture.Fetched
	subtitles func(s capture.Share) string
}

func (f stubFetcher) Recognize(raw string) capture.Share        { return f.recognize(raw) }
func (f stubFetcher) Fetch(s capture.Share) capture.Fetched     { return f.fetch(s) }
func (f stubFetcher) MediaMeta(s capture.Share) capture.Fetched { return f.mediaMeta(s) }
func (f stubFetcher) Subtitles(s capture.Share) string {
	if f.subtitles == nil {
		return ""
	}
	return f.subtitles(s)
}

// textFetcher recognizes via the real capturer and returns caption-as-text
// fetches (no HTTP anywhere).
func textFetcher() capture.Fetcher {
	return stubFetcher{
		recognize: capture.Recognize,
		fetch: func(s capture.Share) capture.Fetched {
			return capture.Fetched{Kind: s.Kind, URL: s.URL, Caption: s.Caption, Text: s.Caption}
		},
		mediaMeta: func(s capture.Share) capture.Fetched {
			return capture.Fetched{Kind: s.Kind, URL: s.URL, Caption: s.Caption, Text: s.Caption}
		},
	}
}

// llmStub answers /chat/completions with a canned content (200) or a bare
// status, for the strict-JSON Analyze path.
func llmStub(status int, content string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if status != http.StatusOK {
			w.WriteHeader(status)
			return
		}
		fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`, strconv.Quote(content))
	}))
}

// researchLLM answers Ask calls: query-build gets a one-line query, the
// synthesis prompt is echoed back so the report carries "## Findings".
func researchLLM() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var req struct {
			Messages []struct {
				Content string `json:"content"`
			} `json:"messages"`
		}
		_ = json.Unmarshal(body, &req)
		last := ""
		if n := len(req.Messages); n > 0 {
			last = req.Messages[n-1].Content
		}
		content := last
		if strings.Contains(last, "web search query") {
			content = "cli-fi reading list"
		}
		fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`, strconv.Quote(content))
	}))
}

// analyzeClient returns a real client pointed at the stub server.
func analyzeClient(llm *httptest.Server) *analyze.Client {
	return analyze.New(config.Config{LLMBase: llm.URL, LLMModel: "stub"}, llm.Client())
}

// baseSvc returns a Service wired to the stubs; tests override Fetcher and
// Runner as needed.
func baseSvc(t *testing.T, st port.Store, ch *stubChannel, llm *httptest.Server) *Service {
	t.Helper()
	ac := analyzeClient(llm)
	return &Service{
		Store:   st,
		Channel: ch,
		Fetcher: capture.Capture{},
		Analyze: ac,
		Vision:  ac,
		ASR:     asr.New(config.Config{}),
		Runner:  research.New(config.Config{}, ac),
		Logf:    t.Logf,
	}
}

// promptSpy records the last curator prompt it was sent and answers with a
// one-card analysis.
type promptSpy struct {
	mu     sync.Mutex
	prompt string
}

func (p *promptSpy) server(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Messages []struct {
				Role    string          `json:"role"`
				Content json.RawMessage `json:"content"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		for _, m := range body.Messages {
			if m.Role != "user" {
				continue
			}
			var text string
			if json.Unmarshal(m.Content, &text) == nil {
				p.mu.Lock()
				p.prompt = text
				p.mu.Unlock()
			}
		}
		io.WriteString(w, `{"choices":[{"message":{"content":`+
			`"{\"executive_summary\":\"s\",\"value_proposition\":\"v\",`+
			`\"proposed_actions\":[\"a\"],\"cards\":[{\"title\":\"t\",`+
			`\"summary\":\"s\",\"horizon\":\"short-term\",\"tags\":[],\"links\":[]}]}"`+
			`}}]}`)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func (p *promptSpy) last() string {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.prompt
}

// fakeVision returns a canned image digest.
type fakeVision struct{ digest string }

func (f *fakeVision) Describe(ctx context.Context, img capture.File, hint string) (string, error) {
	return f.digest, nil
}

// fakeASR returns a canned transcript.
type fakeASR struct{ text string }

func (f *fakeASR) Transcribe(ctx context.Context, ffile capture.File) (string, error) {
	return f.text, nil
}

// --- Capture ----------------------------------------------------------------

func TestCaptureTextSingleIdea(t *testing.T) {
	llm := llmStub(http.StatusOK, `[{"title":"Do X","summary":"do it soon","horizon":"lifetime","tags":["go","x"],"links":[]}]`)
	defer llm.Close()
	st := newStubStore()
	ch := &stubChannel{}
	s := baseSvc(t, st, ch, llm)
	s.Fetcher = textFetcher()

	ids, err := s.Capture(context.Background(), "a cool idea")
	if err != nil {
		t.Fatalf("Capture err: %v", err)
	}
	if len(ids) != 1 {
		t.Fatalf("ids = %v, want one card", ids)
	}
	c, err := st.GetCard(context.Background(), ids[0])
	if err != nil {
		t.Fatalf("GetCard: %v", err)
	}
	if c.Title != "Do X" || c.Horizon != port.HorizonLifetime {
		t.Fatalf("card = %+v", c)
	}
	if len(c.Tags) != 2 || c.Tags[0] != "go" || c.Tags[1] != "x" {
		t.Fatalf("tags = %v", c.Tags)
	}
	if len(ch.notifies) != 1 || ch.notifies[0].Kind != "created" || ch.notifies[0].Card.ID != ids[0] {
		t.Fatalf("notifies = %+v", ch.notifies)
	}
}

func TestCaptureBriefing(t *testing.T) {
	briefingJSON := `{
		"executive_summary": "Action Engine V2 transforms bookmarks into actions.",
		"value_proposition": "Automated briefings and next steps.",
		"proposed_actions": ["Review queue", "Archive old notes"],
		"cards": [
			{"title":"Action Engine","summary":"V2 engine","horizon":"short-term","tags":["v2"],"links":[]}
		]
	}`
	llm := llmStub(http.StatusOK, briefingJSON)
	defer llm.Close()
	st := newStubStore()
	ch := &stubChannel{}
	s := baseSvc(t, st, ch, llm)
	s.Fetcher = textFetcher()

	ids, err := s.Capture(context.Background(), "https://sparkkeep.local")
	if err != nil {
		t.Fatalf("Capture err: %v", err)
	}
	if len(ids) != 1 {
		t.Fatalf("ids = %v, want 1", ids)
	}
	c, err := st.GetCard(context.Background(), ids[0])
	if err != nil {
		t.Fatalf("GetCard: %v", err)
	}
	if c.ExecutiveSummary != "Action Engine V2 transforms bookmarks into actions." {
		t.Errorf("c.ExecutiveSummary = %q", c.ExecutiveSummary)
	}
	if c.ValueProposition != "Automated briefings and next steps." {
		t.Errorf("c.ValueProposition = %q", c.ValueProposition)
	}
	if len(c.ProposedActions) != 2 || c.ProposedActions[0] != "Review queue" {
		t.Errorf("c.ProposedActions = %+v", c.ProposedActions)
	}
	if len(ch.notifies) != 1 || ch.notifies[0].Card.ExecutiveSummary != c.ExecutiveSummary {
		t.Errorf("notified card missing briefing: %+v", ch.notifies)
	}
}

func TestCaptureMultiIdeaSplits(t *testing.T) {
	llm := llmStub(http.StatusOK, `[{"title":"A","summary":"a","horizon":"short-term","tags":[],"links":[]},{"title":"B","summary":"b","horizon":"short-term","tags":[],"links":[]},{"title":"C","summary":"c","horizon":"short-term","tags":[],"links":[]}]`)
	defer llm.Close()
	st := newStubStore()
	ch := &stubChannel{}
	s := baseSvc(t, st, ch, llm)
	s.Fetcher = textFetcher()

	ids, err := s.Capture(context.Background(), "three ideas")
	if err != nil {
		t.Fatalf("Capture err: %v", err)
	}
	if len(ids) != 3 {
		t.Fatalf("ids = %v, want three cards", ids)
	}
	if len(ch.notifies) != 3 {
		t.Fatalf("notifies = %d, want 3", len(ch.notifies))
	}
	for _, n := range ch.notifies {
		if n.Kind != "created" {
			t.Fatalf("notify kind = %q, want created", n.Kind)
		}
	}
}

func TestCaptureAnalysisFailDegrades(t *testing.T) {
	llm := llmStub(http.StatusInternalServerError, "")
	defer llm.Close()
	st := newStubStore()
	ch := &stubChannel{}
	s := baseSvc(t, st, ch, llm)
	s.Fetcher = textFetcher()

	ids, err := s.Capture(context.Background(), "unlucky post")
	if err != nil {
		t.Fatalf("Capture err = %v, want nil (pipeline must survive LLM failure)", err)
	}
	if len(ids) != 1 {
		t.Fatalf("ids = %v, want one degradation card", ids)
	}
	c, _ := st.GetCard(context.Background(), ids[0])
	if c.Title != "Analysis failed" {
		t.Fatalf("title = %q, want Analysis failed", c.Title)
	}
	if len(ch.notifies) != 1 || ch.notifies[0].Kind != "analysis_failed" {
		t.Fatalf("notifies = %+v", ch.notifies)
	}
}

// TestCaptureZeroIdeasDegrades pins the reachable behavior for an empty
// model answer: analyze (task 030) maps `[]` to ErrInvalidResponse, so the
// spec's "Analyze success with zero ideas" short-circuit in Capture is dead
// code with the shipped client. The observable outcome is the graceful
// degradation card, not a hard error.
func TestCaptureZeroIdeasDegrades(t *testing.T) {
	llm := llmStub(http.StatusOK, `[]`)
	defer llm.Close()
	st := newStubStore()
	ch := &stubChannel{}
	s := baseSvc(t, st, ch, llm)
	s.Fetcher = textFetcher()

	ids, err := s.Capture(context.Background(), "nothing to see")
	if err != nil {
		t.Fatalf("Capture err = %v, want nil", err)
	}
	if len(ids) != 1 {
		t.Fatalf("ids = %v, want degradation card", ids)
	}
}

func TestCaptureTextIsSourceNote(t *testing.T) {
	llm := llmStub(http.StatusOK, `[{"title":"T","summary":"s","horizon":"short-term","tags":[],"links":[]}]`)
	defer llm.Close()
	st := newStubStore()
	ch := &stubChannel{}
	s := baseSvc(t, st, ch, llm)
	s.Fetcher = textFetcher()

	raw := "some pasted caption, not a url"
	ids, err := s.Capture(context.Background(), raw)
	if err != nil {
		t.Fatalf("Capture err: %v", err)
	}
	c, _ := st.GetCard(context.Background(), ids[0])
	if c.SourceNote != raw {
		t.Fatalf("SourceNote = %q, want %q", c.SourceNote, raw)
	}
	if c.SourceURL != "" {
		t.Fatalf("SourceURL = %q, want empty", c.SourceURL)
	}
}

func TestCaptureNotifyErrorStillStores(t *testing.T) {
	llm := llmStub(http.StatusOK, `[{"title":"A","summary":"a","horizon":"short-term","tags":[],"links":[]},{"title":"B","summary":"b","horizon":"short-term","tags":[],"links":[]}]`)
	defer llm.Close()
	st := newStubStore()
	ch := &stubChannel{err: errors.New("transport exploded")}
	s := baseSvc(t, st, ch, llm)
	s.Fetcher = textFetcher()

	ids, err := s.Capture(context.Background(), "still persists")
	if err != nil {
		t.Fatalf("Capture err = %v, want nil despite notify errors", err)
	}
	if len(ids) != 2 {
		t.Fatalf("ids = %v, want two cards stored", ids)
	}
}

func TestCaptureDuplicateLinkSkipsAndNotifies(t *testing.T) {
	llm := llmStub(http.StatusOK, `[{"title":"Dup","summary":"s","horizon":"short-term","tags":[],"links":[]}]`)
	defer llm.Close()
	st := newStubStore()
	ch := &stubChannel{}
	s := baseSvc(t, st, ch, llm)
	s.Fetcher = textFetcher()

	raw := "https://example.com/same-post"
	first, err := s.Capture(context.Background(), raw)
	if err != nil || len(first) != 1 {
		t.Fatalf("first Capture = %v, %v; want one id", first, err)
	}
	created := len(ch.notifies)

	second, err := s.Capture(context.Background(), raw)
	if err != nil {
		t.Fatalf("second Capture err: %v", err)
	}
	if len(second) != 0 {
		t.Fatalf("second Capture ids = %v, want none", second)
	}
	if len(ch.notifies) != created+1 {
		t.Fatalf("notifies = %d, want %d (one duplicate notice)", len(ch.notifies), created+1)
	}
	n := ch.notifies[len(ch.notifies)-1]
	if n.Kind != "duplicate" || n.Card.ID != first[0] {
		t.Fatalf("last notify = %+v, want duplicate for card %d", n, first[0])
	}
}

func TestCaptureDifferentLinksBothCreate(t *testing.T) {
	llm := llmStub(http.StatusOK, `[{"title":"Idea","summary":"s","horizon":"short-term","tags":[],"links":[]}]`)
	defer llm.Close()
	st := newStubStore()
	ch := &stubChannel{}
	s := baseSvc(t, st, ch, llm)
	s.Fetcher = textFetcher()

	if ids, err := s.Capture(context.Background(), "https://example.com/one"); err != nil || len(ids) != 1 {
		t.Fatalf("first = %v, %v", ids, err)
	}
	if ids, err := s.Capture(context.Background(), "https://example.com/two"); err != nil || len(ids) != 1 {
		t.Fatalf("second = %v, %v; want a new card for a different link", ids, err)
	}
}

func TestCaptureTextSharesNeverDedup(t *testing.T) {
	llm := llmStub(http.StatusOK, `[{"title":"Note","summary":"s","horizon":"short-term","tags":[],"links":[]}]`)
	defer llm.Close()
	st := newStubStore()
	ch := &stubChannel{}
	s := baseSvc(t, st, ch, llm)
	s.Fetcher = textFetcher()

	if ids, err := s.Capture(context.Background(), "just a thought"); err != nil || len(ids) != 1 {
		t.Fatalf("first = %v, %v", ids, err)
	}
	if ids, err := s.Capture(context.Background(), "just a thought"); err != nil || len(ids) != 1 {
		t.Fatalf("second = %v, %v; text shares have no source_url, must not dedup", ids, err)
	}
}

// --- Retry ------------------------------------------------------------------

func TestRetrySuccessUpdatesCard(t *testing.T) {
	fail := llmStub(http.StatusInternalServerError, "")
	defer fail.Close()
	st := newStubStore()
	ch := &stubChannel{}
	s1 := baseSvc(t, st, ch, fail)
	s1.Fetcher = textFetcher()

	raw := "retry me"
	ids, err := s1.Capture(context.Background(), raw)
	if err != nil {
		t.Fatalf("Capture err: %v", err)
	}
	before, err := st.GetCard(context.Background(), ids[0])
	if err != nil || before.Title != "Analysis failed" {
		t.Fatalf("failed card = %+v, err %v", before, err)
	}

	work := llmStub(http.StatusOK, `[{"title":"Fixed","summary":"now works","horizon":"short-term","tags":["t"],"links":[]}]`)
	defer work.Close()
	s2 := baseSvc(t, st, ch, work)
	s2.Fetcher = textFetcher()

	updated, err := s2.Retry(context.Background(), ids[0])
	if err != nil {
		t.Fatalf("Retry err: %v", err)
	}
	if updated.Title != "Fixed" || updated.Summary != "now works" || updated.Horizon != port.HorizonShortTerm {
		t.Fatalf("updated card = %+v", updated)
	}
	if len(updated.Tags) != 1 || updated.Tags[0] != "t" {
		t.Fatalf("updated tags = %v", updated.Tags)
	}
	if n := len(ch.notifies); n == 0 || ch.notifies[n-1].Kind != "done" {
		t.Fatalf("notifies = %+v, want last done", ch.notifies)
	}
	origCard, err := st.GetCard(context.Background(), ids[0])
	if err != nil {
		t.Fatalf("get original card: %v", err)
	}
	if origCard.Status != port.StatusDismissed {
		t.Fatalf("original card status = %q, want %q", origCard.Status, port.StatusDismissed)
	}
}

// --- Research ---------------------------------------------------------------

func TestResearchSuccessNotifyDone(t *testing.T) {
	src := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "source text here")
	}))
	defer src.Close()
	search := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"results":[{"url":%q}]}`, src.URL)
	}))
	defer search.Close()
	llm := researchLLM()
	defer llm.Close()

	st := newStubStore()
	st.cards[7] = port.Card{ID: 7, Title: "T", Summary: "S"}
	ch := &stubChannel{}
	s := baseSvc(t, st, ch, llm)
	r := research.New(config.Config{SearchURL: search.URL}, analyzeClient(llm))
	r.Timeout = 5 * time.Second
	s.Runner = r

	if err := s.Research(context.Background(), 7); err != nil {
		t.Fatalf("Research err: %v", err)
	}
	row, err := st.GetResearch(context.Background(), 1)
	if err != nil {
		t.Fatalf("GetResearch: %v", err)
	}
	if row.Status != "done" || strings.TrimSpace(row.Findings) == "" {
		t.Fatalf("row = %+v", row)
	}
	n := ch.notifies[len(ch.notifies)-1]
	if n.Kind != "research_done" || n.Text != "Research complete" {
		t.Fatalf("notify = %+v", n)
	}
	if n.Res == nil || n.Res.Status != "done" {
		t.Fatalf("notify.Res = %+v, want done row", n.Res)
	}
}

func TestResearchFailNotifyFailed(t *testing.T) {
	llm := llmStub(http.StatusInternalServerError, "")
	defer llm.Close()
	st := newStubStore()
	st.cards[7] = port.Card{ID: 7, Title: "T", Summary: "S"}
	ch := &stubChannel{}
	s := baseSvc(t, st, ch, llm)

	if err := s.Research(context.Background(), 7); err == nil {
		t.Fatal("Research err = nil, want run error")
	}
	row, err := st.GetResearch(context.Background(), 1)
	if err != nil {
		t.Fatalf("GetResearch: %v", err)
	}
	if row.Status != "failed" || row.Error == "" {
		t.Fatalf("row = %+v", row)
	}
	n := ch.notifies[len(ch.notifies)-1]
	if n.Kind != "research_failed" || n.Text == "" {
		t.Fatalf("notify = %+v", n)
	}
	if n.Res == nil || n.Res.Status != "failed" {
		t.Fatalf("notify.Res = %+v, want failed row", n.Res)
	}
}

func TestResearchBlockedWhileActive(t *testing.T) {
	llm := llmStub(http.StatusInternalServerError, "")
	defer llm.Close()
	st := newStubStore()
	st.cards[7] = port.Card{ID: 7, Title: "T", Summary: "S"}
	if _, err := st.CreateResearch(context.Background(), 7, "q"); err != nil {
		t.Fatalf("seed research: %v", err)
	}
	ch := &stubChannel{}
	s := baseSvc(t, st, ch, llm)

	if err := s.Research(context.Background(), 7); !errors.Is(err, port.ErrResearchActive) {
		t.Fatalf("Research err = %v, want ErrResearchActive", err)
	}
	if len(st.researches) != 1 {
		t.Fatalf("research rows = %d, want 1 (no second row)", len(st.researches))
	}
	if len(ch.notifies) != 0 {
		t.Fatalf("notifies = %+v, want none", ch.notifies)
	}
}

func TestResearchAllowedAfterFinished(t *testing.T) {
	src := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "source text here")
	}))
	defer src.Close()
	search := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"results":[{"url":%q}]}`, src.URL)
	}))
	defer search.Close()
	llm := researchLLM()
	defer llm.Close()

	st := newStubStore()
	st.cards[7] = port.Card{ID: 7, Title: "T", Summary: "S"}
	ch := &stubChannel{}
	s := baseSvc(t, st, ch, llm)
	r := research.New(config.Config{SearchURL: search.URL}, analyzeClient(llm))
	s.Runner = r

	if err := s.Research(context.Background(), 7); err != nil {
		t.Fatalf("first Research: %v", err)
	}
	// finished (done) row must not block a later pass
	if err := s.Research(context.Background(), 7); err != nil {
		t.Fatalf("second Research after done: %v", err)
	}
	if len(st.researches) != 2 {
		t.Fatalf("research rows = %d, want 2", len(st.researches))
	}
}

// --- fetchContent merge ------------------------------------------------------

// A plain Fetch layered over empty MediaMeta must not lose extraction
// warnings, a transcript, or an image digest: those are the fields the
// analyzer qualifies the card from.
func TestFetchContentMergeKeepsNotes(t *testing.T) {
	share := capture.Share{Kind: capture.KindLink, URL: "https://example.com/x"}
	s := &Service{Fetcher: stubFetcher{
		recognize: func(string) capture.Share { return share },
		// MediaMeta came back with no description and no text, which is what
		// triggers the merge in fetchContent.
		mediaMeta: func(capture.Share) capture.Fetched {
			return capture.Fetched{Kind: capture.KindLink, URL: share.URL, Notes: []string{"yt-dlp: gated, no metadata"}}
		},
		fetch: func(capture.Share) capture.Fetched {
			return capture.Fetched{
				Kind:        capture.KindLink,
				URL:         share.URL,
				Text:        "extracted body",
				Transcript:  "spoken words",
				ImageDigest: "sha256:abc",
				Notes:       []string{"login wall, fell back to plain fetch"},
			}
		},
	}}

	f := s.fetchContent(share)
	if f.Text != "extracted body" || f.Transcript != "spoken words" || f.ImageDigest != "sha256:abc" {
		t.Errorf("merged content lost: %+v", f)
	}
	want := []string{"yt-dlp: gated, no metadata", "login wall, fell back to plain fetch"}
	if len(f.Notes) != len(want) {
		t.Fatalf("Notes = %q, want %q", f.Notes, want)
	}
	for i, n := range want {
		if f.Notes[i] != n {
			t.Errorf("Notes[%d] = %q, want %q", i, f.Notes[i], n)
		}
	}
}

func TestCaptureShareAudioTranscribes(t *testing.T) {
	spy := &promptSpy{}
	s := baseSvc(t, newStubStore(), &stubChannel{}, spy.server(t))
	s.Fetcher = stubFetcher{}
	s.ASR = &fakeASR{text: "the spoken words of the voice note"}
	s.UploadDir = ""

	ids, err := s.CaptureShare(context.Background(), capture.Share{
		Kind:    capture.KindAudio,
		Caption: "my idea",
		Files:   []capture.File{{Name: "v.ogg", Mime: "audio/ogg", Data: []byte("OggS")}},
	})
	if err != nil {
		t.Fatalf("CaptureShare: %v", err)
	}
	if len(ids) != 1 {
		t.Fatalf("ids = %v, want one card", ids)
	}
	if !strings.Contains(spy.last(), "the spoken words of the voice note") {
		t.Errorf("transcript never reached the prompt:\n%s", spy.last())
	}
}

func TestCaptureShareImageUsesVision(t *testing.T) {
	spy := &promptSpy{}
	s := baseSvc(t, newStubStore(), &stubChannel{}, spy.server(t))
	s.Fetcher = stubFetcher{}
	s.Vision = &fakeVision{digest: "a chart of quarterly revenue by quarter"}

	_, err := s.CaptureShare(context.Background(), capture.Share{
		Kind:  capture.KindImage,
		Files: []capture.File{{Name: "c.png", Mime: "image/png", Data: []byte("\x89PNG")}},
	})
	if err != nil {
		t.Fatalf("CaptureShare: %v", err)
	}
	if !strings.Contains(spy.last(), "quarterly revenue") {
		t.Errorf("image digest never reached the prompt:\n%s", spy.last())
	}
}

func TestCaptureShareVideoWithoutFFmpegStillCreatesCard(t *testing.T) {
	spy := &promptSpy{}
	s := baseSvc(t, newStubStore(), &stubChannel{}, spy.server(t))
	s.Fetcher = stubFetcher{}
	s.FFmpegBin = ""

	ids, err := s.CaptureShare(context.Background(), capture.Share{
		Kind:  capture.KindVideo,
		Files: []capture.File{{Name: "v.mp4", Mime: "video/mp4", Data: []byte("\x00\x00\x00\x20ftyp")}},
	})
	if err != nil {
		t.Fatalf("CaptureShare: %v", err)
	}
	if len(ids) != 1 {
		t.Fatalf("ids = %v, want the card to still be created", ids)
	}
	if !strings.Contains(spy.last(), "video: audio extraction unavailable") {
		t.Errorf("missing ffmpeg note in prompt:\n%s", spy.last())
	}
}

// Review Focus: a YouTube link with no subtitles must still produce a card
// carrying the note, never a fabricated transcript and never an empty card.
func TestCaptureShareVideoNoSubtitlesNotesAndKeepsTitle(t *testing.T) {
	spy := &promptSpy{}
	s := baseSvc(t, newStubStore(), &stubChannel{}, spy.server(t))
	s.Fetcher = stubFetcher{
		mediaMeta: func(sh capture.Share) capture.Fetched {
			return capture.Fetched{
				Kind: sh.Kind, URL: sh.URL,
				Title: "A talk about Go", Description: "the description",
			}
		},
		subtitles: func(capture.Share) string { return "" },
	}
	ids, err := s.CaptureShare(context.Background(),
		capture.Share{Kind: capture.KindLink, URL: "https://www.youtube.com/watch?v=abc"})
	if err != nil {
		t.Fatalf("CaptureShare: %v", err)
	}
	if len(ids) != 1 {
		t.Fatalf("ids = %v, want a card despite no subtitles", ids)
	}
	p := spy.last()
	if !strings.Contains(p, "no transcript available") {
		t.Errorf("missing transcript note:\n%s", p)
	}
	if !strings.Contains(p, "A talk about Go") {
		t.Errorf("title was dropped:\n%s", p)
	}
	if strings.Contains(p, "TRANSCRIPT: the actual") {
		t.Error("a transcript was fabricated")
	}
}

// Review Focus: an unreachable whisper degrades to a note, not a failure.
func TestCaptureShareAudioASRFailureNotes(t *testing.T) {
	spy := &promptSpy{}
	s := baseSvc(t, newStubStore(), &stubChannel{}, spy.server(t))
	s.Fetcher = stubFetcher{}
	s.ASR = &fakeASR{text: ""}
	ids, err := s.CaptureShare(context.Background(), capture.Share{
		Kind:  capture.KindAudio,
		Files: []capture.File{{Name: "v.ogg", Mime: "audio/ogg", Data: []byte("OggS")}},
	})
	if err != nil {
		t.Fatalf("CaptureShare: %v", err)
	}
	if len(ids) != 1 {
		t.Fatalf("ids = %v, want the card to still be created", ids)
	}
	if !strings.Contains(spy.last(), "audio not transcribed") {
		t.Errorf("missing ASR note:\n%s", spy.last())
	}
}

func TestPersistUploadDeduplicatesByContent(t *testing.T) {
	dir := t.TempDir()
	s := &Service{UploadDir: dir, Logf: t.Logf}
	f := capture.File{Name: "photo.jpg", Mime: "image/jpeg", Data: []byte("same-bytes")}
	a := s.persistUpload(f)
	b := s.persistUpload(capture.File{Name: "other-name.jpg", Mime: "image/jpeg", Data: []byte("same-bytes")})
	if a == "" || a != b {
		t.Errorf("persistUpload names %q and %q for identical content, want one name", a, b)
	}
	if a == "" {
		t.Fatal("no name returned")
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Errorf("wrote %d files, want 1", len(entries))
	}
}
