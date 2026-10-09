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
	captures   map[int64]port.Capture
	researches map[int64]port.Research
	settings   map[string]string
	nextCard   int64
	nextCap    int64
	nextRes    int64
}

func newStubStore() *stubStore {
	return &stubStore{
		cards:      map[int64]port.Card{},
		captures:   map[int64]port.Capture{},
		researches: map[int64]port.Research{},
		settings:   map[string]string{},
	}
}

func (s *stubStore) CreateCard(_ context.Context, c port.Card) (port.Card, error) {
	s.nextCard++
	c.ID = s.nextCard
	if c.References == nil {
		c.References = []port.Reference{}
	}
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
	if p.SourceURL != nil {
		c.SourceURL = *p.SourceURL
	}
	if p.CaptureID != nil {
		c.CaptureID = p.CaptureID
	}
	if p.References != nil {
		c.References = *p.References
	}
	if p.ProposedActions != nil {
		c.ProposedActions = *p.ProposedActions
		if p.ActionsSource == nil {
			c.ActionsSource = "user"
		}
	}
	if p.ActionsSource != nil {
		c.ActionsSource = *p.ActionsSource
	}
	if p.ResearchVerdict != nil {
		c.ResearchVerdict = *p.ResearchVerdict
	}
	if p.ResearchConfidence != nil {
		c.ResearchConfidence = *p.ResearchConfidence
	}
	if p.SuggestedHorizon != nil {
		c.SuggestedHorizon = *p.SuggestedHorizon
	}
	if p.SuggestedTags != nil {
		c.SuggestedTags = *p.SuggestedTags
	}
	c.UpdatedAt = time.Now().UTC()
	s.cards[id] = c
	return c, nil
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
	c.CreatedAt = time.Now().UTC()
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

func (s *stubStore) SetCardTags(_ context.Context, id int64, tags []string) error {
	c, ok := s.cards[id]
	if !ok {
		return port.ErrNotFound
	}
	c.Tags = tags
	s.cards[id] = c
	return nil
}

func (s *stubStore) SetCardReferences(_ context.Context, id int64, refs []port.Reference) error {
	c, ok := s.cards[id]
	if !ok {
		return port.ErrNotFound
	}
	c.References = refs
	s.cards[id] = c
	return nil
}

func (s *stubStore) ListTags(context.Context) ([]port.Tag, error) {
	return nil, nil
}

func (s *stubStore) CreateResearch(_ context.Context, cardID int64, query string, playbookID ...*int64) (port.Research, error) {
	s.nextRes++
	var pid *int64
	if len(playbookID) > 0 {
		pid = playbookID[0]
	}
	r := port.Research{ID: s.nextRes, CardID: cardID, Status: "queued", Query: query, PlaybookID: pid, CreatedAt: time.Now().UTC()}
	s.researches[r.ID] = r
	return r, nil
}

func (s *stubStore) CreatePlaybook(_ context.Context, pb port.Playbook) (port.Playbook, error) {
	return pb, nil
}
func (s *stubStore) GetPlaybook(_ context.Context, id int64) (port.Playbook, error) {
	return port.Playbook{ID: id, Name: "Default", IsBuiltin: true}, nil
}
func (s *stubStore) ListPlaybooks(_ context.Context) ([]port.Playbook, error) {
	return []port.Playbook{{ID: 1, Name: "Default", IsBuiltin: true}}, nil
}
func (s *stubStore) UpdatePlaybook(_ context.Context, pb port.Playbook) (port.Playbook, error) {
	return pb, nil
}
func (s *stubStore) DeletePlaybook(_ context.Context, id int64) error {
	return nil
}
func (s *stubStore) DuplicatePlaybook(_ context.Context, id int64) (port.Playbook, error) {
	return port.Playbook{ID: 2, Name: "Copy"}, nil
}
func (s *stubStore) GetDefaultPlaybook(_ context.Context) (port.Playbook, error) {
	return port.Playbook{ID: 1, Name: "Default", IsBuiltin: true}, nil
}
func (s *stubStore) ResolvePlaybook(_ context.Context, cardID int64, explicitPlaybookID ...*int64) (port.Playbook, error) {
	if len(explicitPlaybookID) > 0 && explicitPlaybookID[0] != nil {
		return s.GetPlaybook(context.Background(), *explicitPlaybookID[0])
	}
	return s.GetDefaultPlaybook(context.Background())
}

func (s *stubStore) HasActiveResearch(_ context.Context, cardID int64) (bool, error) {
	for _, r := range s.researches {
		if r.CardID == cardID && (r.Status == "queued" || r.Status == "running") {
			return true, nil
		}
	}
	return false, nil
}

func (s *stubStore) SetResearchFeedback(_ context.Context, id int64, rating, comment string) error {
	r, ok := s.researches[id]
	if !ok {
		return port.ErrNotFound
	}
	r.FeedbackRating = &rating
	r.FeedbackComment = &comment
	s.researches[id] = r
	return nil
}

func (s *stubStore) GetPipelineMetrics(_ context.Context) (port.PipelineMetrics, error) {
	return port.PipelineMetrics{
		RunsByPlaybook: make(map[string]int),
		TriageByStatus: make(map[string]int),
	}, nil
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

func (s *stubStore) UpdateResearchProgress(_ context.Context, id int64, status, query string, steps []port.ResearchStep, sources []port.Source, plan *port.ResearchPlan, result *port.ResearchResult, tokens int) error {
	r, ok := s.researches[id]
	if !ok {
		return port.ErrNotFound
	}
	r.Status = status
	if query != "" {
		r.Query = query
	}
	r.Steps = steps
	r.Sources = sources
	r.Plan = plan
	r.Result = result
	r.Tokens = tokens
	s.researches[id] = r
	return nil
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

func (s *stubStore) ListResearchByCard(_ context.Context, cardID int64) ([]port.Research, error) {
	var out []port.Research
	for _, r := range s.researches {
		if r.CardID == cardID {
			out = append(out, r)
		}
	}
	return out, nil
}

func (s *stubStore) GetResearchFindings(_ context.Context, id int64) (string, error) {
	r, ok := s.researches[id]
	if !ok {
		return "", port.ErrNotFound
	}
	return r.Findings, nil
}

func (s *stubStore) ShelveStale(context.Context, int) (int64, error) { return 0, nil }

func (s *stubStore) GetSetting(_ context.Context, key string) (string, error) {
	if s.settings != nil {
		if v, ok := s.settings[key]; ok {
			return v, nil
		}
	}
	return "", port.ErrNotFound
}

func (s *stubStore) SetSetting(_ context.Context, key, val string) error {
	if s.settings == nil {
		s.settings = map[string]string{}
	}
	s.settings[key] = val
	return nil
}

func (s *stubStore) ListSettings(context.Context) (map[string]string, error) {
	if s.settings == nil {
		return map[string]string{}, nil
	}
	out := make(map[string]string, len(s.settings))
	for k, v := range s.settings {
		out[k] = v
	}
	return out, nil
}

func (s *stubStore) RecoverInterruptedResearch(_ context.Context) (int, error) {
	n := 0
	for id, r := range s.researches {
		if r.Status == "running" {
			r.Status = "failed"
			r.Error = "interrupted by server restart"
			s.researches[id] = r
			n++
		}
	}
	return n, nil
}

func (s *stubStore) GetNextQueuedResearch(_ context.Context, asOf time.Time) (*port.Research, error) {
	var best *port.Research
	for _, r := range s.researches {
		if r.Status != "queued" {
			continue
		}
		if r.ScheduledFor != nil && r.ScheduledFor.After(asOf) {
			continue
		}
		if best == nil || r.ID < best.ID {
			curr := r
			best = &curr
		}
	}
	return best, nil
}

func (s *stubStore) CountQueuedAhead(_ context.Context, researchID int64) (int, error) {
	target, ok := s.researches[researchID]
	if !ok {
		return 0, nil
	}
	n := 0
	for _, r := range s.researches {
		if r.Status == "queued" && r.ID < target.ID {
			n++
		}
	}
	return n, nil
}

func (s *stubStore) BatchQueueResearch(ctx context.Context, cardIDs []int64, playbookID *int64, scheduledFor *time.Time, batchID string) ([]port.Research, error) {
	var queued []port.Research
	for _, cid := range cardIDs {
		active, _ := s.HasActiveResearch(ctx, cid)
		if active {
			continue
		}
		r, err := s.CreateResearch(ctx, cid, "", playbookID)
		if err != nil {
			return nil, err
		}
		r.ScheduledFor = scheduledFor
		if batchID != "" {
			r.BatchID = &batchID
		}
		s.researches[r.ID] = r
		queued = append(queued, r)
	}
	return queued, nil
}

func (s *stubStore) FindCardsForRule(ctx context.Context, filter port.ResearchRuleFilter, maxCards int, asOf time.Time) ([]port.Card, error) {
	if maxCards <= 0 {
		maxCards = 10
	}
	var res []port.Card
	for _, c := range s.cards {
		if len(res) >= maxCards {
			break
		}
		active, _ := s.HasActiveResearch(ctx, c.ID)
		if active {
			continue
		}
		if filter.Status != "" && !strings.EqualFold(c.Status, filter.Status) {
			continue
		}
		if filter.Worthiness != "" && !strings.EqualFold(c.Worthiness.Level, filter.Worthiness) {
			continue
		}
		if filter.Type != "" && !strings.EqualFold(c.Type, filter.Type) {
			continue
		}
		res = append(res, c)
	}
	return res, nil
}

func (s *stubStore) ListCompletedResearchSince(_ context.Context, since time.Time) ([]port.Research, error) {
	var res []port.Research
	for _, r := range s.researches {
		if r.Status == "done" || r.Status == "failed" {
			if r.CreatedAt.After(since) || r.CreatedAt.Equal(since) {
				res = append(res, r)
			}
		}
	}
	return res, nil
}

func (s *stubStore) AddCardComment(_ context.Context, cardID int64, content string) (port.CardComment, error) {
	return port.CardComment{ID: 1, CardID: cardID, Content: content, CreatedAt: time.Now().UTC()}, nil
}

func (s *stubStore) ListCardComments(_ context.Context, cardID int64) ([]port.CardComment, error) {
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
	recognize    func(raw string) capture.Share
	fetch        func(s capture.Share) capture.Fetched
	fetchWithCtx func(ctx context.Context, s capture.Share) capture.Fetched
	mediaMeta    func(s capture.Share) capture.Fetched
	subtitles    func(s capture.Share) string
}

func (f stubFetcher) Recognize(raw string) capture.Share    { return f.recognize(raw) }
func (f stubFetcher) Fetch(s capture.Share) capture.Fetched { return f.fetch(s) }
func (f stubFetcher) FetchWithContext(ctx context.Context, s capture.Share) capture.Fetched {
	if f.fetchWithCtx != nil {
		return f.fetchWithCtx(ctx, s)
	}
	return f.fetch(s)
}
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
	if c.Title != "Do X" || c.Horizon != port.HorizonLongTerm {
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

func TestCaptureMultiCardSplitStoresAllLinkedToCapture(t *testing.T) {
	llmJSON := `[
		{"title":"Tool 1","summary":"First tool","horizon":"short-term","tags":[],"links":[]},
		{"title":"Tool 2","summary":"Second tool","horizon":"medium-term","tags":[],"links":[]},
		{"title":"Tool 3","summary":"Third tool","horizon":"long-term","tags":[],"links":[]}
	]`
	llm := llmStub(http.StatusOK, llmJSON)
	defer llm.Close()
	st := newStubStore()
	ch := &stubChannel{}
	s := baseSvc(t, st, ch, llm)

	ctx := context.Background()
	url := "https://example.com/10-tools-post"
	ids, err := s.Capture(ctx, url)
	if err != nil {
		t.Fatalf("Capture err: %v", err)
	}
	if len(ids) != 3 {
		t.Fatalf("Capture returned %d ids, want 3", len(ids))
	}
	if len(st.cards) != 3 {
		t.Fatalf("stored cards = %d, want 3", len(st.cards))
	}
	if len(ch.notifies) != 3 {
		t.Fatalf("notifications = %d, want 3", len(ch.notifies))
	}
	for _, n := range ch.notifies {
		if n.Kind != "created" {
			t.Errorf("notification kind = %q, want 'created'", n.Kind)
		}
	}

	// Verify all cards have the same capture_id and source_url
	var firstCapID *int64
	for _, id := range ids {
		c := st.cards[id]
		if c.SourceURL != url {
			t.Errorf("card %d source_url = %q, want %q", id, c.SourceURL, url)
		}
		if c.CaptureID == nil {
			t.Errorf("card %d capture_id is nil, want non-nil", id)
		} else if firstCapID == nil {
			firstCapID = c.CaptureID
		} else if *c.CaptureID != *firstCapID {
			t.Errorf("card %d capture_id = %d, want %d", id, *c.CaptureID, *firstCapID)
		}
	}

	if len(st.captures) != 1 {
		t.Fatalf("captures count = %d, want 1", len(st.captures))
	}
	capRow := st.captures[*firstCapID]
	if capRow.SourceURL != url {
		t.Errorf("capture source_url = %q, want %q", capRow.SourceURL, url)
	}

	// Now re-capture the same URL → duplicate path once
	dupIDs, err := s.Capture(ctx, url)
	if err != nil {
		t.Fatalf("repeat Capture err: %v", err)
	}
	if len(dupIDs) != 0 {
		t.Fatalf("repeat Capture ids = %v, want 0", dupIDs)
	}
	if len(st.cards) != 3 {
		t.Fatalf("cards after repeat capture = %d, want 3 (no new cards)", len(st.cards))
	}
	if len(ch.notifies) != 4 {
		t.Fatalf("notifications after repeat = %d, want 4 (3 created + 1 duplicate)", len(ch.notifies))
	}
	lastNotify := ch.notifies[len(ch.notifies)-1]
	if lastNotify.Kind != "duplicate" {
		t.Errorf("last notification kind = %q, want 'duplicate'", lastNotify.Kind)
	}
}

func TestCaptureFailurePersistsCapture(t *testing.T) {
	fail := llmStub(http.StatusInternalServerError, "")
	defer fail.Close()
	st := newStubStore()
	ch := &stubChannel{}
	s := baseSvc(t, st, ch, fail)

	url := "https://example.com/fail-post"
	ids, err := s.Capture(context.Background(), url)
	if err != nil {
		t.Fatalf("Capture err: %v", err)
	}
	if len(ids) != 1 {
		t.Fatalf("failCard returned %d ids, want 1", len(ids))
	}
	failedCard := st.cards[ids[0]]
	if failedCard.Title != "Analysis failed" {
		t.Errorf("card title = %q, want 'Analysis failed'", failedCard.Title)
	}
	if failedCard.CaptureID == nil {
		t.Fatalf("failed card capture_id is nil, want persisted capture")
	}
	savedCap, err := st.GetCapture(context.Background(), *failedCard.CaptureID)
	if err != nil {
		t.Fatalf("GetCapture: %v", err)
	}
	if savedCap.SourceURL != url {
		t.Errorf("saved capture source_url = %q, want %q", savedCap.SourceURL, url)
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

// Re-sharing a link with a fresh caption appends the caption to the existing
// card's note and resurfaces a shelved/dismissed card back to the inbox,
// instead of silently dropping the new text on the floor.
func TestCaptureDuplicateLinkWithCaptionAppendsNote(t *testing.T) {
	llm := llmStub(http.StatusOK, `[{"title":"Dup","summary":"s","horizon":"short-term","tags":[],"links":[]}]`)
	defer llm.Close()
	st := newStubStore()
	ch := &stubChannel{}
	s := baseSvc(t, st, ch, llm)
	s.Fetcher = textFetcher()

	ctx := context.Background()
	url := "https://example.com/same-post"
	ids, err := s.Capture(ctx, url)
	if err != nil || len(ids) != 1 {
		t.Fatalf("first Capture = %v, %v; want one id", ids, err)
	}
	id := ids[0]
	shelved := port.StatusShelved
	if _, err := st.UpdateCard(ctx, id, port.CardPatch{Status: &shelved}); err != nil {
		t.Fatalf("shelve card: %v", err)
	}

	note := "worth another look"
	if ids, err := s.Capture(ctx, url+" "+note); err != nil || len(ids) != 0 {
		t.Fatalf("re-capture = %v, %v; want no new card", ids, err)
	}

	c, err := st.GetCard(ctx, id)
	if err != nil {
		t.Fatalf("GetCard: %v", err)
	}
	if !strings.Contains(c.SourceNote, note) {
		t.Errorf("SourceNote = %q, want it to contain %q", c.SourceNote, note)
	}
	if c.Status != port.StatusInbox {
		t.Errorf("status = %q, want %q (resurfaced)", c.Status, port.StatusInbox)
	}
	n := ch.notifies[len(ch.notifies)-1]
	if n.Kind != "duplicate" || !strings.Contains(n.Text, "note added") {
		t.Errorf("notify = %+v, want duplicate mentioning the appended note", n)
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

	updatedCards, err := s2.Retry(context.Background(), ids[0])
	if err != nil {
		t.Fatalf("Retry err: %v", err)
	}
	if len(updatedCards) != 1 {
		t.Fatalf("updatedCards len = %d, want 1", len(updatedCards))
	}
	updated := updatedCards[0]
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

func TestRetrySuccessWithSourceURL(t *testing.T) {
	st := newStubStore()
	failedCard, err := st.CreateCard(context.Background(), port.Card{
		Title:      "Analysis failed",
		Summary:    "Analysis failed, see source.",
		SourceURL:  "https://example.com/unique-retry-target",
		SourceNote: "https://example.com/unique-retry-target",
		Status:     port.StatusInbox,
	})
	if err != nil {
		t.Fatalf("CreateCard: %v", err)
	}

	work := llmStub(http.StatusOK, `[{"title":"Retried Success","summary":"retried summary","horizon":"short-term","tags":["fixed"],"links":["https://example.com/unique-retry-target"]}]`)
	defer work.Close()

	ch := &stubChannel{}
	s := baseSvc(t, st, ch, work)
	s.Fetcher = textFetcher()

	updatedCards, err := s.Retry(context.Background(), failedCard.ID)
	if err != nil {
		t.Fatalf("Retry with SourceURL failed: %v", err)
	}
	if len(updatedCards) != 1 {
		t.Fatalf("updatedCards len = %d, want 1", len(updatedCards))
	}
	updated := updatedCards[0]
	if updated.Title != "Retried Success" {
		t.Errorf("updated title = %q, want Retried Success", updated.Title)
	}
	if updated.SourceURL != "https://example.com/unique-retry-target" {
		t.Errorf("updated SourceURL = %q, want https://example.com/unique-retry-target", updated.SourceURL)
	}

	orig, err := st.GetCard(context.Background(), failedCard.ID)
	if err != nil {
		t.Fatalf("GetCard orig: %v", err)
	}
	if orig.Status != port.StatusDismissed {
		t.Errorf("orig status = %q, want dismissed", orig.Status)
	}
	if orig.SourceURL != "" {
		t.Errorf("orig SourceURL = %q, want empty to prevent unique constraint conflict", orig.SourceURL)
	}
}

func TestRetryLinkUsesStoredCaptureText(t *testing.T) {
	st := newStubStore()
	ch := &stubChannel{}

	pageText := "Detailed article content explaining an awesome new open-source database engine."
	pageTitle := "Awesome DB Article"
	pageURL := "https://example.com/awesome-db"

	cap, err := st.CreateCapture(context.Background(), port.Capture{
		Kind:        "link",
		SourceURL:   pageURL,
		Title:       pageTitle,
		Description: "A great article",
		Text:        pageText,
	})
	if err != nil {
		t.Fatalf("CreateCapture: %v", err)
	}

	failedCard, err := st.CreateCard(context.Background(), port.Card{
		CaptureID:  &cap.ID,
		Title:      "Analysis failed",
		Summary:    "Analysis failed, see source.",
		Status:     port.StatusInbox,
		SourceURL:  pageURL,
		SourceNote: pageURL,
	})
	if err != nil {
		t.Fatalf("CreateCard: %v", err)
	}

	var reqBody string
	var reqMu sync.Mutex
	llmSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		reqMu.Lock()
		reqBody = string(b)
		reqMu.Unlock()
		fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`,
			strconv.Quote(`[{"title":"Awesome DB","summary":"Novel database engine","horizon":"short-term","tags":["database"],"links":["https://example.com/awesome-db"]}]`))
	}))
	defer llmSrv.Close()

	fetcherCalled := false
	s := baseSvc(t, st, ch, llmSrv)
	s.Fetcher = stubFetcher{
		recognize: func(raw string) capture.Share {
			fetcherCalled = true
			return capture.Recognize(raw)
		},
		fetch: func(s capture.Share) capture.Fetched {
			fetcherCalled = true
			return capture.Fetched{}
		},
	}

	cards, err := s.Retry(context.Background(), failedCard.ID)
	if err != nil {
		t.Fatalf("Retry: %v", err)
	}
	if fetcherCalled {
		t.Fatalf("fetcher was called, but capture had usable content; should not refetch")
	}
	if len(cards) != 1 {
		t.Fatalf("created cards len = %d, want 1", len(cards))
	}

	reqMu.Lock()
	body := reqBody
	reqMu.Unlock()

	// Acceptance criteria: assert LLM request body contains the page text, not "Analysis failed"
	if !strings.Contains(body, pageText) {
		t.Errorf("LLM request body does not contain page text. Got body:\n%s", body)
	}
	if strings.Contains(body, "Analysis failed") {
		t.Errorf("LLM request body should not contain 'Analysis failed', but found it. Got body:\n%s", body)
	}

	if cards[0].Title != "Awesome DB" {
		t.Errorf("card title = %q, want 'Awesome DB'", cards[0].Title)
	}
	if cards[0].CaptureID == nil || *cards[0].CaptureID != cap.ID {
		t.Errorf("card CaptureID = %v, want %d", cards[0].CaptureID, cap.ID)
	}

	orig, err := st.GetCard(context.Background(), failedCard.ID)
	if err != nil {
		t.Fatalf("GetCard: %v", err)
	}
	if orig.Status != port.StatusDismissed {
		t.Errorf("orig status = %q, want dismissed", orig.Status)
	}
}

func TestRetryMultiIdea(t *testing.T) {
	st := newStubStore()
	ch := &stubChannel{}

	cap, err := st.CreateCapture(context.Background(), port.Capture{
		Kind:      "link",
		SourceURL: "https://example.com/multi-tools",
		Title:     "Three Cool Tools",
		Text:      "Review of Tool 1, Tool 2, and Tool 3 for developers.",
	})
	if err != nil {
		t.Fatalf("CreateCapture: %v", err)
	}

	failedCard, err := st.CreateCard(context.Background(), port.Card{
		CaptureID:  &cap.ID,
		Title:      "Analysis failed",
		Status:     port.StatusInbox,
		SourceURL:  cap.SourceURL,
		SourceNote: cap.SourceURL,
	})
	if err != nil {
		t.Fatalf("CreateCard: %v", err)
	}

	llmJSON := `[
		{"title":"Tool 1","summary":"first tool","horizon":"short-term","tags":["t1"],"links":["https://example.com/tool1"]},
		{"title":"Tool 2","summary":"second tool","horizon":"medium-term","tags":["t2"],"links":["https://example.com/tool2"]},
		{"title":"Tool 3","summary":"third tool","horizon":"long-term","tags":["t3"],"links":["https://example.com/tool3"]}
	]`
	work := llmStub(http.StatusOK, llmJSON)
	defer work.Close()

	s := baseSvc(t, st, ch, work)
	cards, err := s.Retry(context.Background(), failedCard.ID)
	if err != nil {
		t.Fatalf("Retry: %v", err)
	}

	// Acceptance criteria: Multi-idea retry yields N cards
	if len(cards) != 3 {
		t.Fatalf("cards len = %d, want 3", len(cards))
	}
	for i, c := range cards {
		if c.CaptureID == nil || *c.CaptureID != cap.ID {
			t.Errorf("card %d captureID = %v, want %d", i, c.CaptureID, cap.ID)
		}
		stored, err := st.GetCard(context.Background(), c.ID)
		if err != nil || stored.Title != c.Title {
			t.Errorf("stored card %d mismatch: %+v, %v", i, stored, err)
		}
	}

	// Notifications: one "done" per created card
	doneCount := 0
	for _, n := range ch.notifies {
		if n.Kind == "done" {
			doneCount++
		}
	}
	if doneCount != 3 {
		t.Errorf("done notifications = %d, want 3", doneCount)
	}

	orig, _ := st.GetCard(context.Background(), failedCard.ID)
	if orig.Status != port.StatusDismissed {
		t.Errorf("original status = %q, want dismissed", orig.Status)
	}
}

func TestRetryContentMissingRefetchesURL(t *testing.T) {
	st := newStubStore()
	ch := &stubChannel{}

	targetURL := "https://example.com/empty-capture-refetch"
	cap, err := st.CreateCapture(context.Background(), port.Capture{
		Kind:      "link",
		SourceURL: targetURL,
		// All content fields empty (Text, Transcript, ImageDigest, Description)
	})
	if err != nil {
		t.Fatalf("CreateCapture: %v", err)
	}

	failedCard, err := st.CreateCard(context.Background(), port.Card{
		CaptureID:  &cap.ID,
		Title:      "Analysis failed",
		Status:     port.StatusInbox,
		SourceURL:  targetURL,
		SourceNote: targetURL,
	})
	if err != nil {
		t.Fatalf("CreateCard: %v", err)
	}

	var reqBody string
	var reqMu sync.Mutex
	llmSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		reqMu.Lock()
		reqBody = string(b)
		reqMu.Unlock()
		fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`,
			strconv.Quote(`[{"title":"Refetched Article","summary":"Freshly fetched content","horizon":"short-term","tags":[],"links":[]}]`))
	}))
	defer llmSrv.Close()

	fetcherCalled := false
	s := baseSvc(t, st, ch, llmSrv)
	s.Fetcher = stubFetcher{
		recognize: capture.Recognize,
		fetch: func(sh capture.Share) capture.Fetched {
			fetcherCalled = true
			return capture.Fetched{
				Kind:  "link",
				URL:   sh.URL,
				Title: "Freshly Fetched Headline",
				Text:  "Freshly fetched body text from website.",
			}
		},
		mediaMeta: func(sh capture.Share) capture.Fetched {
			return capture.Fetched{}
		},
	}

	cards, err := s.Retry(context.Background(), failedCard.ID)
	if err != nil {
		t.Fatalf("Retry: %v", err)
	}
	if !fetcherCalled {
		t.Fatalf("fetcher was not called; expected refetch because capture content was empty")
	}
	if len(cards) != 1 {
		t.Fatalf("cards len = %d, want 1", len(cards))
	}

	// Verify stored capture was updated
	updatedCap, err := st.GetCapture(context.Background(), cap.ID)
	if err != nil {
		t.Fatalf("GetCapture: %v", err)
	}
	if updatedCap.Text != "Freshly fetched body text from website." {
		t.Errorf("updated capture Text = %q, want freshly fetched text", updatedCap.Text)
	}
	if updatedCap.Title != "Freshly Fetched Headline" {
		t.Errorf("updated capture Title = %q, want freshly fetched title", updatedCap.Title)
	}

	reqMu.Lock()
	body := reqBody
	reqMu.Unlock()
	if !strings.Contains(body, "Freshly fetched body text from website.") {
		t.Errorf("LLM prompt did not contain refetched text. Prompt body:\n%s", body)
	}
	if strings.Contains(body, "Analysis failed") {
		t.Errorf("LLM prompt should not contain 'Analysis failed'")
	}
}

func TestRetryNothingAvailable(t *testing.T) {
	st := newStubStore()
	ch := &stubChannel{}

	// Capture with no content and no URL
	cap, err := st.CreateCapture(context.Background(), port.Capture{
		Kind:      "link",
		SourceURL: "",
	})
	if err != nil {
		t.Fatalf("CreateCapture: %v", err)
	}

	failedCard, err := st.CreateCard(context.Background(), port.Card{
		CaptureID:  &cap.ID,
		Title:      "Analysis failed",
		Summary:    "Analysis failed, see source.",
		Status:     port.StatusInbox,
		SourceURL:  "",
		SourceNote: "",
	})
	if err != nil {
		t.Fatalf("CreateCard: %v", err)
	}

	llmCalled := false
	llmSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		llmCalled = true
		w.WriteHeader(http.StatusOK)
	}))
	defer llmSrv.Close()

	s := baseSvc(t, st, ch, llmSrv)
	s.Fetcher = stubFetcher{
		recognize: func(raw string) capture.Share {
			t.Fatalf("fetcher should not be called")
			return capture.Share{}
		},
	}

	cards, err := s.Retry(context.Background(), failedCard.ID)
	// Acceptance criteria: Retry on a capture with no content and no URL returns an error and leaves state unchanged
	if err == nil {
		t.Fatalf("expected error for nothing available, got nil")
	}
	if !errors.Is(err, ErrNothingToReanalyze) && !strings.Contains(err.Error(), "nothing to re-analyze") {
		t.Errorf("err = %v, want 'nothing to re-analyze'", err)
	}
	if len(cards) != 0 {
		t.Errorf("cards len = %d, want 0", len(cards))
	}
	if llmCalled {
		t.Errorf("LLM should not be called")
	}

	// State unchanged
	cardAfter, err := st.GetCard(context.Background(), failedCard.ID)
	if err != nil {
		t.Fatalf("GetCard: %v", err)
	}
	if cardAfter.Status != port.StatusInbox || cardAfter.Title != "Analysis failed" {
		t.Errorf("card state was modified: %+v", cardAfter)
	}
	if len(ch.notifies) != 0 {
		t.Errorf("expected 0 notifications, got %d", len(ch.notifies))
	}
}

func TestRetryLegacyCardWithoutCapture(t *testing.T) {
	st := newStubStore()
	ch := &stubChannel{}

	targetURL := "https://example.com/legacy-article"
	failedCard, err := st.CreateCard(context.Background(), port.Card{
		CaptureID:  nil,
		Title:      "Analysis failed",
		Summary:    "Analysis failed, see source.",
		Status:     port.StatusInbox,
		SourceURL:  targetURL,
		SourceNote: targetURL,
	})
	if err != nil {
		t.Fatalf("CreateCard: %v", err)
	}

	llmJSON := `[{"title":"Legacy Result","summary":"analyzed legacy source","horizon":"short-term","tags":["legacy"],"links":["https://example.com/legacy-article"]}]`
	work := llmStub(http.StatusOK, llmJSON)
	defer work.Close()

	fetcherCalled := false
	s := baseSvc(t, st, ch, work)
	s.Fetcher = stubFetcher{
		recognize: capture.Recognize,
		fetch: func(sh capture.Share) capture.Fetched {
			fetcherCalled = true
			return capture.Fetched{
				Kind:  "link",
				URL:   sh.URL,
				Title: "Legacy Web Article",
				Text:  "Legacy web article body extracted from HTTP.",
			}
		},
		mediaMeta: func(sh capture.Share) capture.Fetched {
			return capture.Fetched{}
		},
	}

	cards, err := s.Retry(context.Background(), failedCard.ID)
	if err != nil {
		t.Fatalf("Retry: %v", err)
	}
	if !fetcherCalled {
		t.Fatalf("fetcher was not called; legacy card without capture should re-fetch source_url")
	}
	if len(cards) != 1 {
		t.Fatalf("cards len = %d, want 1", len(cards))
	}
	if cards[0].Title != "Legacy Result" {
		t.Errorf("title = %q, want 'Legacy Result'", cards[0].Title)
	}
	if cards[0].CaptureID == nil {
		t.Errorf("retried card should be linked to newly created capture")
	} else {
		cap, err := st.GetCapture(context.Background(), *cards[0].CaptureID)
		if err != nil {
			t.Errorf("failed to get created capture: %v", err)
		}
		if cap.SourceURL != targetURL {
			t.Errorf("capture URL = %q, want %q", cap.SourceURL, targetURL)
		}
		if cap.Text != "Legacy web article body extracted from HTTP." {
			t.Errorf("capture text = %q, want extracted text", cap.Text)
		}
	}

	orig, _ := st.GetCard(context.Background(), failedCard.ID)
	if orig.Status != port.StatusDismissed {
		t.Errorf("original status = %q, want dismissed", orig.Status)
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

func TestGoResearch(t *testing.T) {
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
	c, _ := st.CreateCard(context.Background(), port.Card{Title: "Card for GoResearch"})
	ch := &stubChannel{}
	s := baseSvc(t, st, ch, llm)
	r := research.New(config.Config{SearchURL: search.URL}, analyzeClient(llm))
	r.Timeout = 5 * time.Second
	s.Runner = r

	ctx := context.Background()
	s.GoResearch(ctx, c.ID)
	s.WG.Wait()

	if len(st.researches) != 1 {
		t.Fatalf("expected 1 research row, got %d", len(st.researches))
	}
	resRow := st.researches[1]
	if resRow.Status != "done" {
		t.Fatalf("status = %q, want done", resRow.Status)
	}
}

func TestReadTextFileAndStripHTML(t *testing.T) {
	// Plain text
	txt, ok := readTextFile(capture.File{
		Name: "test.txt", Mime: "text/plain", Data: []byte("Hello plain text"),
	})
	if !ok || txt != "Hello plain text" {
		t.Fatalf("plain text = %q, %v", txt, ok)
	}

	// HTML stripping scripts, styles, tags
	htmlData := "<html><head><script>alert('xss');</script><style>body { color: red; }</style></head><body><h1>Hello</h1> <p>World</p></body></html>"
	txt, ok = readTextFile(capture.File{
		Name: "page.html", Mime: "text/html", Data: []byte(htmlData),
	})
	if !ok {
		t.Fatalf("html expected ok")
	}
	if strings.Contains(txt, "alert") || strings.Contains(txt, "color") || !strings.Contains(txt, "Hello") || !strings.Contains(txt, "World") {
		t.Fatalf("stripped html unexpected: %q", txt)
	}

	// Non-text
	_, ok = readTextFile(capture.File{
		Name: "img.png", Mime: "image/png", Data: []byte("\x89PNG\r\n"),
	})
	if ok {
		t.Fatalf("image/png should not be text")
	}

	// Truncation over 4000 characters
	longText := strings.Repeat("A", 5000)
	txt, ok = readTextFile(capture.File{
		Name: "long.txt", Mime: "text/plain", Data: []byte(longText),
	})
	if !ok || len(txt) != 4000 {
		t.Fatalf("expected 4000 length, got %d", len(txt))
	}
}

func TestClipText(t *testing.T) {
	if got := clipText("short", 10); got != "short" {
		t.Errorf("clipText(short, 10) = %q", got)
	}
	if got := clipText("longer than five", 5); got != "longe" {
		t.Errorf("clipText(longer than five, 5) = %q", got)
	}
}

func TestResolveMediaEdgeCases(t *testing.T) {
	llm := llmStub(http.StatusOK, `{"cards":[{"title":"T","summary":"S"}]}`)
	defer llm.Close()
	st := newStubStore()
	s := baseSvc(t, st, &stubChannel{}, llm)

	ctx := context.Background()

	// 1. Empty files slice
	f := s.resolveMedia(ctx, capture.Share{Kind: capture.KindFile, Files: nil})
	if len(f.Notes) == 0 || f.Notes[0] != "no file content received" {
		t.Fatalf("expected 'no file content received', got %v", f.Notes)
	}

	// 2. PDF file
	f = s.resolveMedia(ctx, capture.Share{
		Kind:  capture.KindFile,
		Files: []capture.File{{Name: "doc.pdf", Mime: "application/pdf", Data: []byte("%PDF-1.4")}},
	})
	if len(f.Notes) == 0 || f.Notes[0] != "pdf: text not extracted" {
		t.Fatalf("expected 'pdf: text not extracted', got %v", f.Notes)
	}

	// 3. Binary file
	f = s.resolveMedia(ctx, capture.Share{
		Kind:  capture.KindFile,
		Files: []capture.File{{Name: "bin.dat", Mime: "application/octet-stream", Data: []byte{0x00, 0x01}}},
	})
	if len(f.Notes) == 0 || f.Notes[0] != "file: content not extractable" {
		t.Fatalf("expected 'file: content not extractable', got %v", f.Notes)
	}

	// 4. Image with Vision = nil
	sNoVision := baseSvc(t, st, &stubChannel{}, llm)
	sNoVision.Vision = nil
	f = sNoVision.resolveMedia(ctx, capture.Share{
		Kind:  capture.KindImage,
		Files: []capture.File{{Name: "img.jpg", Mime: "image/jpeg", Data: []byte("jpg")}},
	})
	if len(f.Notes) == 0 || f.Notes[0] != "image unreadable" {
		t.Fatalf("expected 'image unreadable', got %v", f.Notes)
	}

	// 5. Audio with ASR = nil
	sNoASR := baseSvc(t, st, &stubChannel{}, llm)
	sNoASR.ASR = nil
	f = sNoASR.resolveMedia(ctx, capture.Share{
		Kind:  capture.KindAudio,
		Files: []capture.File{{Name: "a.mp3", Mime: "audio/mp3", Data: []byte("mp3")}},
	})
	if len(f.Notes) == 0 || f.Notes[0] != "audio not transcribed" {
		t.Fatalf("expected 'audio not transcribed', got %v", f.Notes)
	}
}

func TestDuplicateCardShelvedOrDismissedRestoresInbox(t *testing.T) {
	spy := &promptSpy{}
	llm := spy.server(t)
	defer llm.Close()

	for _, initialStatus := range []string{port.StatusShelved, port.StatusDismissed} {
		st := newStubStore()
		existing, err := st.CreateCard(context.Background(), port.Card{
			Title:      "Initial Card",
			SourceURL:  "https://example.com/unique-url",
			SourceNote: "initial note",
			Status:     initialStatus,
		})
		if err != nil {
			t.Fatalf("CreateCard: %v", err)
		}

		ch := &stubChannel{}
		s := baseSvc(t, st, ch, llm)
		s.Fetcher = textFetcher()

		// Sharing the same URL with a caption note
		_, err = s.CaptureShare(context.Background(), capture.Share{
			Kind:    capture.KindLink,
			URL:     "https://example.com/unique-url",
			Caption: "added second thought",
		})
		if err != nil {
			t.Fatalf("CaptureShare: %v", err)
		}

		updated, err := st.GetCard(context.Background(), existing.ID)
		if err != nil {
			t.Fatalf("GetCard: %v", err)
		}

		if updated.Status != port.StatusInbox {
			t.Errorf("card from %s should be restored to %s, got %s",
				initialStatus, port.StatusInbox, updated.Status)
		}
		if !strings.Contains(updated.SourceNote, "added second thought") {
			t.Errorf("note not appended: %s", updated.SourceNote)
		}
	}
}

func TestFFmpegBinConfig(t *testing.T) {
	// SPARKKEEP_FFMPEG_BIN env override
	t.Setenv("SPARKKEEP_FFMPEG_BIN", "/custom/ffmpeg")
	if bin := ffmpegBin(config.Config{}); bin != "/custom/ffmpeg" {
		t.Errorf("ffmpegBin with env = %q, want /custom/ffmpeg", bin)
	}

	t.Setenv("SPARKKEEP_FFMPEG_BIN", "")
	// If candidate not found
	bin := ffmpegBin(config.Config{FFmpegBin: "/nonexistent/binary"})
	// Could be empty or "ffmpeg" if installed on host
	_ = bin
}
