package research

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
	"unicode/utf8"

	"sparkkeep/internal/analyze"
	"sparkkeep/internal/capture"
	"sparkkeep/internal/config"
	"sparkkeep/internal/port"
)

// llmStub is a chat-completions server that returns appropriate responses
// for plan, claims verification, landscape, and verdict.
func llmStub() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var req struct {
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
		}
		_ = json.Unmarshal(body, &req)
		last := ""
		if n := len(req.Messages); n > 0 {
			last = req.Messages[n-1].Content
		}
		content := `{"recommendation":"pursue","for_whom":"engineers","risks":["complexity"],"confidence":"high","next_actions":["Step 1","Step 2","Step 3"],"suggested_horizon":"short-term","suggested_tags":["ai"]}`
		if strings.Contains(last, "research planning assistant") {
			content = `{"questions":[{"id":"Q1","question":"Core technology?","query":"core tech query","prefer_domains":["github.com"]}]}`
		} else if strings.Contains(last, "web search query") {
			content = "cli-fi reading list"
		} else if strings.Contains(last, "fact-checking assistant") || strings.Contains(last, "Claims to verify") {
			content = `{"claims":[{"claim":"Claim 1","status":"supported","rationale":"Found in S1","sources":["S1"]}]}`
		} else if strings.Contains(last, "competitive and technology landscape") {
			content = `{"landscape":[{"name":"AltTool","url":"https://alt.example.com","one_liner":"Alt solution","how_it_differs":"Simpler","sources":["S1"]}]}`
		} else if strings.Contains(last, "research synthesis and executive decision assistant") {
			content = `{"recommendation":"pursue","for_whom":"engineers","risks":["complexity"],"confidence":"high","next_actions":["Step 1","Step 2","Step 3"],"suggested_horizon":"short-term","suggested_tags":["ai"]}`
		}
		fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`, strconv.Quote(content))
	}))
}

func stubRunner(llm *httptest.Server, searchURL string) *Runner {
	r := New(config.Config{SearchURL: searchURL},
		analyze.New(config.Config{LLMBase: llm.URL, LLMModel: "stub"}, llm.Client()))
	r.Timeout = 5 * time.Second
	return r
}

func stubSynthServer() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		str := string(body)
		content := `{"recommendation":"pursue","for_whom":"engineers","risks":["complexity"],"confidence":"high","next_actions":["Step 1","Step 2","Step 3"],"suggested_horizon":"short-term","suggested_tags":["ai"]}`
		if strings.Contains(str, "Claims to verify") || strings.Contains(str, "fact-checking assistant") {
			content = `{"claims":[{"claim":"Scales linearly","status":"supported","rationale":"Backed by S1","sources":["S1"]},{"claim":"Provides linearizability","status":"supported","rationale":"Backed by S1","sources":["S1"]}]}`
		} else if strings.Contains(str, "competitive and technology landscape") {
			content = `{"landscape":[{"name":"AltTool","url":"https://alt.example.com","one_liner":"Alt solution","how_it_differs":"Simpler","sources":["S1"]}]}`
		} else if strings.Contains(str, "research synthesis and executive decision assistant") {
			content = `{"recommendation":"pursue","for_whom":"engineers","risks":["complexity"],"confidence":"high","next_actions":["Step 1","Step 2","Step 3"],"suggested_horizon":"short-term","suggested_tags":["ai"]}`
		}
		fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`, strconv.Quote(content))
	}))
}

type traceFetcher struct {
	mu     sync.Mutex
	trace  []string
	bodies map[string]string
}

func newTraceFetcher() *traceFetcher {
	return &traceFetcher{bodies: make(map[string]string)}
}

func (tf *traceFetcher) Recognize(raw string) capture.Share { return capture.Share{URL: raw} }
func (tf *traceFetcher) Fetch(share capture.Share) capture.Fetched {
	return tf.FetchWithContext(context.Background(), share)
}
func (tf *traceFetcher) FetchWithContext(_ context.Context, share capture.Share) capture.Fetched {
	tf.mu.Lock()
	defer tf.mu.Unlock()
	tf.trace = append(tf.trace, "fetch:"+share.URL)
	body, ok := tf.bodies[share.URL]
	if !ok {
		body = "fetched body for " + share.URL
	}
	if body == "__ERROR__" {
		return capture.Fetched{URL: share.URL, Err: errors.New("404 not found")}
	}
	return capture.Fetched{URL: share.URL, Title: "Title of " + share.URL, Text: body}
}
func (tf *traceFetcher) MediaMeta(share capture.Share) capture.Fetched {
	return tf.Fetch(share)
}
func (tf *traceFetcher) Subtitles(share capture.Share) string { return "" }

type memoryStore struct {
	port.Store
	mu       sync.Mutex
	progress []struct {
		status  string
		query   string
		steps   []port.ResearchStep
		sources []port.Source
		result  *port.ResearchResult
	}
	captures map[int64]port.Capture
	cards    map[int64]port.Card
}

func newMemoryStore() *memoryStore {
	return &memoryStore{
		captures: make(map[int64]port.Capture),
		cards:    make(map[int64]port.Card),
	}
}

func (m *memoryStore) GetCapture(_ context.Context, id int64) (port.Capture, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	cap, ok := m.captures[id]
	if !ok {
		return port.Capture{}, port.ErrNotFound
	}
	return cap, nil
}

func (m *memoryStore) GetCard(_ context.Context, id int64) (port.Card, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	card, ok := m.cards[id]
	if !ok {
		return port.Card{}, port.ErrNotFound
	}
	return card, nil
}

func (m *memoryStore) ListCardComments(_ context.Context, cardID int64) ([]port.CardComment, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if c, ok := m.cards[cardID]; ok && len(c.Comments) > 0 {
		return c.Comments, nil
	}
	return nil, nil
}

func (m *memoryStore) GetResearch(_ context.Context, id int64) (port.Research, error) {
	return port.Research{}, port.ErrNotFound
}

func (m *memoryStore) GetSetting(_ context.Context, _ string) (string, error) {
	return "", port.ErrNotFound
}

func (m *memoryStore) GetDefaultPlaybook(_ context.Context) (port.Playbook, error) {
	return DefaultPlaybook(), nil
}

func (m *memoryStore) UpdateCard(_ context.Context, id int64, p port.CardPatch) (port.Card, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	card, ok := m.cards[id]
	if !ok {
		return port.Card{}, port.ErrNotFound
	}
	if p.ProposedActions != nil {
		card.ProposedActions = *p.ProposedActions
		if p.ActionsSource == nil {
			card.ActionsSource = "user"
		}
	}
	if p.ActionsSource != nil {
		card.ActionsSource = *p.ActionsSource
	}
	if p.ResearchVerdict != nil {
		card.ResearchVerdict = *p.ResearchVerdict
	}
	if p.ResearchConfidence != nil {
		card.ResearchConfidence = *p.ResearchConfidence
	}
	if p.SuggestedHorizon != nil {
		card.SuggestedHorizon = *p.SuggestedHorizon
	}
	if p.SuggestedTags != nil {
		card.SuggestedTags = *p.SuggestedTags
	}
	m.cards[id] = card
	return card, nil
}

func (m *memoryStore) UpdateResearchProgress(_ context.Context, _ int64, status, query string, steps []port.ResearchStep, sources []port.Source, _ *port.ResearchPlan, result *port.ResearchResult, _ int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	stepsCopy := make([]port.ResearchStep, len(steps))
	copy(stepsCopy, steps)
	sourcesCopy := make([]port.Source, len(sources))
	copy(sourcesCopy, sources)
	m.progress = append(m.progress, struct {
		status  string
		query   string
		steps   []port.ResearchStep
		sources []port.Source
		result  *port.ResearchResult
	}{status: status, query: query, steps: stepsCopy, sources: sourcesCopy, result: result})
	return nil
}

func TestRunSearchNoResults_NoOtherSources(t *testing.T) {
	search := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"results":[]}`)
	}))
	defer search.Close()
	llm := llmStub()
	defer llm.Close()

	report, err := stubRunner(llm, search.URL).Run(context.Background(), port.Card{Title: "T", Summary: "S"})
	if err == nil {
		t.Fatal("err = nil, want error on empty search results with no other sources")
	}
	if !strings.Contains(err.Error(), "step search") {
		t.Fatalf("err = %v, want step search error", err)
	}
	if report != "" {
		t.Fatalf("report = %q, want empty", report)
	}
}

func TestRunSearchNoResults_WithReferencesSucceeds(t *testing.T) {
	search := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"results":[]}`)
	}))
	defer search.Close()
	llm := llmStub()
	defer llm.Close()

	r := stubRunner(llm, search.URL)
	tf := newTraceFetcher()
	tf.bodies["https://example.com/ref1"] = "reference documentation content"
	r.Fetcher = tf

	card := port.Card{
		Title:   "Topic With Ref",
		Summary: "Summary",
		References: []port.Reference{
			{Kind: "url", Label: "Ref 1", URL: "https://example.com/ref1"},
		},
	}

	report, err := r.Run(context.Background(), card)
	if err != nil {
		t.Fatalf("expected run to succeed when search returns 0 but references produce text, got: %v", err)
	}
	if !strings.Contains(report, "## Questions & Findings") && !strings.Contains(report, "## Findings") {
		t.Fatalf("report missing findings section:\n%s", report)
	}
}

func TestRun_OrderReferencesBeforeSearch(t *testing.T) {
	var events []string
	var mu sync.Mutex

	recordEvent := func(name string) {
		mu.Lock()
		defer mu.Unlock()
		events = append(events, name)
	}

	search := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		recordEvent("search_api_called")
		fmt.Fprint(w, `{"results":[{"url":"https://example.com/search-result"}]}`)
	}))
	defer search.Close()

	llm := llmStub()
	defer llm.Close()

	r := stubRunner(llm, search.URL)
	tf := newTraceFetcher()
	tf.bodies["https://example.com/refA"] = "Ref A body"
	tf.bodies["https://example.com/refB"] = "Ref B body"
	tf.bodies["https://example.com/search-result"] = "Search result body"

	// Wrap fetcher to record event order
	r.Fetcher = orderTrackFetcher{
		underlying: tf,
		onFetch: func(url string) {
			recordEvent("fetch:" + url)
		},
	}

	card := port.Card{
		Title: "Card with References",
		TLDR:  "Card TLDR",
		References: []port.Reference{
			{Kind: "url", Label: "Ref A", URL: "https://example.com/refA"},
			{Kind: "url", Label: "Ref B", URL: "https://example.com/refB"},
		},
	}

	_, err := r.Run(context.Background(), card)
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}

	searchIdx := -1
	refAIdx := -1
	refBIdx := -1
	for i, ev := range events {
		if ev == "search_api_called" {
			searchIdx = i
		} else if ev == "fetch:https://example.com/refA" {
			refAIdx = i
		} else if ev == "fetch:https://example.com/refB" {
			refBIdx = i
		}
	}

	if refAIdx == -1 || refBIdx == -1 || searchIdx == -1 {
		t.Fatalf("missing events: events=%v", events)
	}
	if refAIdx >= searchIdx || refBIdx >= searchIdx {
		t.Fatalf("expected references fetched BEFORE search, got events order: %v", events)
	}
}

type orderTrackFetcher struct {
	underlying capture.Fetcher
	onFetch    func(url string)
}

func (o orderTrackFetcher) Recognize(raw string) capture.Share { return capture.Share{URL: raw} }
func (o orderTrackFetcher) Fetch(share capture.Share) capture.Fetched {
	return o.FetchWithContext(context.Background(), share)
}
func (o orderTrackFetcher) FetchWithContext(ctx context.Context, share capture.Share) capture.Fetched {
	if o.onFetch != nil {
		o.onFetch(share.URL)
	}
	return o.underlying.FetchWithContext(ctx, share)
}
func (o orderTrackFetcher) MediaMeta(share capture.Share) capture.Fetched { return o.Fetch(share) }
func (o orderTrackFetcher) Subtitles(share capture.Share) string          { return "" }

func TestRun_MultiQuestionPlanning(t *testing.T) {
	var searchQueries []string
	var searchMu sync.Mutex

	search := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query().Get("q")
		searchMu.Lock()
		searchQueries = append(searchQueries, q)
		searchMu.Unlock()

		// Return a distinct URL per query
		resURL := fmt.Sprintf("https://example.com/res-%s", q)
		fmt.Fprintf(w, `{"results":[{"url":%q}]}`, resURL)
	}))
	defer search.Close()

	// Plan LLM returns 3 questions
	planJSON := `{"questions":[
		{"id":"Q1","question":"Question 1?","query":"q1-search","prefer_domains":["github.com"]},
		{"id":"Q2","question":"Question 2?","query":"q2-search"},
		{"id":"Q3","question":"Question 3?","query":"q3-search"}
	]}`

	planServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`, strconv.Quote(planJSON))
	}))
	defer planServer.Close()

	synthServer := stubSynthServer()
	defer synthServer.Close()

	planClient := analyze.New(config.Config{LLMBase: planServer.URL, LLMModel: "plan"}, planServer.Client())
	synthClient := analyze.New(config.Config{LLMBase: synthServer.URL, LLMModel: "synth"}, synthServer.Client())

	runner := NewWithClients(config.Config{SearchURL: search.URL}, planClient, synthClient)
	tf := newTraceFetcher()
	runner.Fetcher = tf

	card := port.Card{
		Title:  "Multi-Question Card",
		TLDR:   "Investigating distributed databases",
		Claims: []string{"Scales linearly", "Provides linearizability"},
	}

	report, err := runner.Run(context.Background(), card)
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}

	searchMu.Lock()
	defer searchMu.Unlock()
	if len(searchQueries) != 3 {
		t.Fatalf("expected exactly 3 search requests, got %d: %v", len(searchQueries), searchQueries)
	}

	if !strings.Contains(report, "## Questions & Findings") {
		t.Fatalf("report missing ## Questions & Findings:\n%s", report)
	}
}

func TestRun_InvalidPlanJSON_DegradesToSingleQuery(t *testing.T) {
	var searchQueries []string
	search := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		searchQueries = append(searchQueries, r.URL.Query().Get("q"))
		fmt.Fprint(w, `{"results":[{"url":"https://example.com/fallback-res"}]}`)
	}))
	defer search.Close()

	// Plan server returns invalid non-JSON output
	planServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"choices":[{"message":{"content":"Not JSON at all, just free text query: fallback-query"}}]}`)
	}))
	defer planServer.Close()

	synthServer := stubSynthServer()
	defer synthServer.Close()

	planClient := analyze.New(config.Config{LLMBase: planServer.URL, LLMModel: "plan"}, planServer.Client())
	synthClient := analyze.New(config.Config{LLMBase: synthServer.URL, LLMModel: "synth"}, synthServer.Client())

	runner := NewWithClients(config.Config{SearchURL: search.URL}, planClient, synthClient)
	runner.Fetcher = newTraceFetcher()

	card := port.Card{Title: "Fallback Card", TLDR: "Some summary"}
	report, err := runner.Run(context.Background(), card)
	if err != nil {
		t.Fatalf("Run should succeed despite invalid plan JSON, got: %v", err)
	}

	if len(searchQueries) != 1 {
		t.Fatalf("expected 1 fallback search query, got %d: %v", len(searchQueries), searchQueries)
	}
	if !strings.Contains(report, "## Questions & Findings") && !strings.Contains(report, "## Findings") {
		t.Fatalf("unexpected report:\n%s", report)
	}
}

func TestRankURLs_PreferredDomains(t *testing.T) {
	urls := []string{
		"https://blog.medium.com/post",
		"https://github.com/org/repo",
		"https://randomnews.org/article",
		"https://docs.python.org/3/library",
	}
	prefer := []string{"github.com", "docs.python.org"}

	ranked := rankURLs(urls, prefer)
	if len(ranked) != 4 {
		t.Fatalf("len = %d, want 4", len(ranked))
	}
	if ranked[0] != "https://github.com/org/repo" || ranked[1] != "https://docs.python.org/3/library" {
		t.Fatalf("preferred domains not ranked first: %v", ranked)
	}
	if ranked[2] != "https://blog.medium.com/post" || ranked[3] != "https://randomnews.org/article" {
		t.Fatalf("standard order not preserved: %v", ranked)
	}
}

func TestRun_RoundRobinFairBudget(t *testing.T) {
	// 2 questions, each has 3 search results. MaxFetches is 4.
	// Round robin should take:
	// Q1: url1, Q2: url4, Q1: url2, Q2: url5 -> exactly 4 total, 2 from each question!
	var fetchedURLs []string
	var fetchMu sync.Mutex

	tf := newTraceFetcher()
	orderTracker := orderTrackFetcher{
		underlying: tf,
		onFetch: func(u string) {
			fetchMu.Lock()
			defer fetchMu.Unlock()
			fetchedURLs = append(fetchedURLs, u)
		},
	}

	search := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query().Get("q")
		if q == "q1" {
			fmt.Fprint(w, `{"results":[{"url":"https://example.com/q1-a"},{"url":"https://example.com/q1-b"},{"url":"https://example.com/q1-c"}]}`)
		} else {
			fmt.Fprint(w, `{"results":[{"url":"https://example.com/q2-a"},{"url":"https://example.com/q2-b"},{"url":"https://example.com/q2-c"}]}`)
		}
	}))
	defer search.Close()

	planJSON := `{"questions":[{"id":"Q1","question":"Q1?","query":"q1"},{"id":"Q2","question":"Q2?","query":"q2"}]}`
	planServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`, strconv.Quote(planJSON))
	}))
	defer planServer.Close()

	synthServer := stubSynthServer()
	defer synthServer.Close()

	planClient := analyze.New(config.Config{LLMBase: planServer.URL, LLMModel: "plan"}, planServer.Client())
	synthClient := analyze.New(config.Config{LLMBase: synthServer.URL, LLMModel: "synth"}, synthServer.Client())

	runner := NewWithClients(config.Config{SearchURL: search.URL}, planClient, synthClient)
	runner.Fetcher = orderTracker
	runner.MaxFetches = 4

	_, err := runner.Run(context.Background(), port.Card{Title: "Fair Budget Test", TLDR: "Testing"})
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}

	fetchMu.Lock()
	defer fetchMu.Unlock()
	if len(fetchedURLs) != 4 {
		t.Fatalf("expected 4 total fetches, got %d: %v", len(fetchedURLs), fetchedURLs)
	}
	expectedOrder := []string{
		"https://example.com/q1-a",
		"https://example.com/q2-a",
		"https://example.com/q1-b",
		"https://example.com/q2-b",
	}
	for i, exp := range expectedOrder {
		if fetchedURLs[i] != exp {
			t.Errorf("fetch %d: got %s, want %s (round-robin order violation)", i, fetchedURLs[i], exp)
		}
	}
}

func TestRegistry_BudgetsAndRuneSafeClipping(t *testing.T) {
	reg := NewRegistry(10, 25)

	multiByte := "你好世界🎉🔥"
	src, ok := reg.Add("https://example.com/1", "Title 1", "search", multiByte, time.Now(), "Q1")
	if !ok || src == nil {
		t.Fatalf("failed to add first source")
	}
	if utf8.RuneCountInString(src.ClippedText) != 6 {
		t.Fatalf("rune count = %d, want 6", utf8.RuneCountInString(src.ClippedText))
	}
	if len(src.Questions) != 1 || src.Questions[0] != "Q1" {
		t.Fatalf("questions = %v, want [Q1]", src.Questions)
	}

	longMulti := strings.Repeat("中", 50)
	src2, ok := reg.Add("https://example.com/2", "Title 2", "search", longMulti, time.Now(), "Q2")
	if !ok || src2 == nil {
		t.Fatalf("failed to add second source")
	}
	if utf8.RuneCountInString(src2.ClippedText) != 10 {
		t.Fatalf("expected clipped to per-source budget 10 runes, got %d", utf8.RuneCountInString(src2.ClippedText))
	}

	src3, ok := reg.Add("https://example.com/3", "Title 3", "search", strings.Repeat("A", 20), time.Now())
	if !ok || src3 == nil {
		t.Fatalf("failed to add third source")
	}
	if utf8.RuneCountInString(src3.ClippedText) != 9 {
		t.Fatalf("expected clipped to remaining total budget 9 runes, got %d", utf8.RuneCountInString(src3.ClippedText))
	}

	src4, ok := reg.Add("https://example.com/4", "Title 4", "search", "more text", time.Now())
	if ok || src4 != nil {
		t.Fatalf("expected rejection when total budget exhausted")
	}
}

func TestRun_ProgressPersistenceMidRun(t *testing.T) {
	search := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"results":[{"url":"https://example.com/search1"}]}`)
	}))
	defer search.Close()
	llm := llmStub()
	defer llm.Close()

	runner := stubRunner(llm, search.URL)
	tf := newTraceFetcher()
	tf.bodies["https://example.com/search1"] = "Search body"
	runner.Fetcher = tf

	ms := newMemoryStore()
	runner.Store = ms

	card := port.Card{Title: "Progress Test", TLDR: "Testing progress updates"}
	_, err := runner.RunWithID(context.Background(), card, 999)
	if err != nil {
		t.Fatalf("RunWithID failed: %v", err)
	}

	ms.mu.Lock()
	count := len(ms.progress)
	ms.mu.Unlock()

	if count < 6 {
		t.Fatalf("expected at least 6 progress updates, got %d", count)
	}
}

func TestRun_PartialRefFetchFailureContinuesWithNote(t *testing.T) {
	search := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"results":[{"url":"https://example.com/search-ok"}]}`)
	}))
	defer search.Close()
	llm := llmStub()
	defer llm.Close()

	runner := stubRunner(llm, search.URL)
	tf := newTraceFetcher()
	tf.bodies["https://example.com/bad-ref"] = "__ERROR__" // simulated 404
	tf.bodies["https://example.com/good-ref"] = "Good ref text"
	tf.bodies["https://example.com/search-ok"] = "Search result text"
	runner.Fetcher = tf

	card := port.Card{
		Title: "Ref Failure Card",
		TLDR:  "Testing partial ref failures",
		References: []port.Reference{
			{Kind: "url", Label: "Bad Ref", URL: "https://example.com/bad-ref"},
			{Kind: "url", Label: "Good Ref", URL: "https://example.com/good-ref"},
		},
	}

	report, err := runner.Run(context.Background(), card)
	if err != nil {
		t.Fatalf("Run should succeed despite partial ref fetch error, got: %v", err)
	}
	if !strings.Contains(report, "## Questions & Findings") && !strings.Contains(report, "## Findings") {
		t.Fatalf("report missing findings:\n%s", report)
	}
}

func TestClaimVerification_CitationValidation(t *testing.T) {
	search := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"results":[{"url":"https://example.com/s1"}]}`)
	}))
	defer search.Close()

	llm := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		str := string(body)
		content := ""
		if strings.Contains(str, "research planning assistant") {
			content = `{"questions":[{"id":"Q1","question":"Question 1?","query":"q1"}]}`
		} else if strings.Contains(str, "Claims to verify") {
			// Claim 1 cites S1 (valid)
			// Claim 2 cites S99 (invalid -> should downgrade)
			// Claim 3 cites [] (no sources -> should downgrade)
			content = `{
				"claims": [
					{"claim": "Claim 1", "status": "supported", "rationale": "Directly backed by S1", "sources": ["S1"]},
					{"claim": "Claim 2", "status": "supported", "rationale": "I hallucinated this", "sources": ["S99"]},
					{"claim": "Claim 3", "status": "disputed", "rationale": "I dispute without proof", "sources": []}
				]
			}`
		} else if strings.Contains(str, "competitive and technology landscape") {
			content = `{"landscape":[{"name":"Alt","url":"https://alt.com","one_liner":"Alt","how_it_differs":"Different","sources":["S1"]}]}`
		} else if strings.Contains(str, "research synthesis and executive decision assistant") {
			content = `{"recommendation":"pursue","for_whom":"all","risks":["none"],"confidence":"high","next_actions":["act1","act2","act3"]}`
		}
		fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`, strconv.Quote(content))
	}))
	defer llm.Close()

	runner := stubRunner(llm, search.URL)
	tf := newTraceFetcher()
	tf.bodies["https://example.com/s1"] = "Evidence body"
	runner.Fetcher = tf

	card := port.Card{
		Title:  "Citation Validation Card",
		Claims: []string{"Claim 1", "Claim 2", "Claim 3"},
	}

	state := NewRunState(card, 0, nil, DefaultPerSourceBudget, DefaultTotalBudget)
	for _, step := range runner.buildPipeline() {
		if err := step.Run(context.Background(), state); err != nil {
			t.Fatalf("step %s failed: %v", step.ID, err)
		}
	}

	if state.Result == nil || len(state.Result.Claims) != 3 {
		t.Fatalf("expected 3 claim verdicts, got %+v", state.Result)
	}

	c1 := state.Result.Claims[0]
	if c1.Status != "supported" || len(c1.Sources) != 1 || c1.Sources[0] != "S1" {
		t.Fatalf("Claim 1 should be supported by S1, got: %+v", c1)
	}

	c2 := state.Result.Claims[1]
	if c2.Status != "unverified" {
		t.Fatalf("Claim 2 citing non-existent S99 should be downgraded to unverified, got: %+v", c2)
	}

	c3 := state.Result.Claims[2]
	if c3.Status != "unverified" {
		t.Fatalf("Claim 3 citing empty sources should be downgraded to unverified, got: %+v", c3)
	}
}

func TestCardWriteBack_ProposedActions_AndUserGuard(t *testing.T) {
	search := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"results":[{"url":"https://example.com/item"}]}`)
	}))
	defer search.Close()

	llm := llmStub()
	defer llm.Close()

	runner := stubRunner(llm, search.URL)
	tf := newTraceFetcher()
	tf.bodies["https://example.com/item"] = "Content"
	runner.Fetcher = tf

	ms := newMemoryStore()
	runner.Store = ms

	// 1. Initial card with triage actions
	card := port.Card{
		ID:              42,
		Title:           "Writeback Guard Card",
		Summary:         "Summary",
		ActionsSource:   "triage",
		ProposedActions: []string{"Initial triage action"},
	}
	ms.cards[42] = card

	_, err := runner.RunWithID(context.Background(), card, 100)
	if err != nil {
		t.Fatalf("RunWithID failed: %v", err)
	}

	// Should have replaced actions from research verdict
	c1 := ms.cards[42]
	if c1.ActionsSource != "research" {
		t.Fatalf("actions_source want research, got %s", c1.ActionsSource)
	}
	if len(c1.ProposedActions) == 0 || c1.ProposedActions[0] == "Initial triage action" {
		t.Fatalf("expected proposed actions to be updated by research, got: %+v", c1.ProposedActions)
	}
	if c1.ResearchVerdict != "pursue" || c1.ResearchConfidence != "high" {
		t.Fatalf("unexpected verdict/confidence: %s / %s", c1.ResearchVerdict, c1.ResearchConfidence)
	}

	// 2. User edits actions
	userActions := []string{"User manual action"}
	_, err = ms.UpdateCard(context.Background(), 42, port.CardPatch{
		ProposedActions: &userActions,
	})
	if err != nil {
		t.Fatalf("UpdateCard user: %v", err)
	}
	cUser := ms.cards[42]
	if cUser.ActionsSource != "user" {
		t.Fatalf("want actions_source user after user update, got %s", cUser.ActionsSource)
	}

	// 3. Second research run: user-edited actions MUST NOT be overwritten
	_, err = runner.RunWithID(context.Background(), cUser, 101)
	if err != nil {
		t.Fatalf("second RunWithID failed: %v", err)
	}

	c2 := ms.cards[42]
	if c2.ActionsSource != "user" {
		t.Fatalf("want actions_source still user, got %s", c2.ActionsSource)
	}
	if len(c2.ProposedActions) != 1 || c2.ProposedActions[0] != "User manual action" {
		t.Fatalf("user-edited proposed actions were overwritten! got: %+v", c2.ProposedActions)
	}
}

func TestStep_InvalidJSON_RepairAndFallback(t *testing.T) {
	search := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"results":[{"url":"https://example.com/one"}]}`)
	}))
	defer search.Close()

	// 1. Repair succeeds: first response is broken, second response is valid JSON
	var callCount int
	var mu sync.Mutex
	repairLLM := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		callCount++
		body, _ := io.ReadAll(r.Body)
		str := string(body)

		if strings.Contains(str, "research planning assistant") {
			fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`,
				strconv.Quote(`{"questions":[{"id":"Q1","question":"Q?","query":"q"}]}`))
			return
		}
		if strings.Contains(str, "Claims to verify") || (strings.Contains(str, "not valid JSON") && strings.Contains(str, "claims")) {
			// First call gives invalid JSON
			if !strings.Contains(str, "not valid JSON") {
				fmt.Fprintf(w, `{"choices":[{"message":{"content":"Broken non-json output"}}]}`)
				return
			}
			// Repair retry gives valid JSON
			fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`,
				strconv.Quote(`{"claims":[{"claim":"C1","status":"supported","rationale":"ok","sources":["S1"]}]}`))
			return
		}
		if strings.Contains(str, "landscape") {
			fmt.Fprintf(w, `{"choices":[{"message":{"content":"{\"landscape\":[]}"}}]}`)
			return
		}
		// Verdict
		fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`,
			strconv.Quote(`{"recommendation":"watch","for_whom":"all","risks":[],"confidence":"medium","next_actions":["a1","a2","a3"]}`))
	}))
	defer repairLLM.Close()

	runner := stubRunner(repairLLM, search.URL)
	tf := newTraceFetcher()
	tf.bodies["https://example.com/one"] = "body"
	runner.Fetcher = tf

	card := port.Card{Title: "Repair Test", Claims: []string{"C1"}}
	state := NewRunState(card, 0, nil, DefaultPerSourceBudget, DefaultTotalBudget)

	for _, step := range runner.buildPipeline() {
		if err := step.Run(context.Background(), state); err != nil {
			t.Fatalf("expected repair to succeed, but step %s failed: %v", step.ID, err)
		}
	}
	if len(state.Result.Claims) != 1 || state.Result.Claims[0].Status != "supported" {
		t.Fatalf("expected repaired claim, got: %+v", state.Result.Claims)
	}

	// 2. Verdict fails both tries -> research run fails
	verdictFailLLM := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		str := string(body)
		if strings.Contains(str, "research planning assistant") {
			fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`,
				strconv.Quote(`{"questions":[{"id":"Q1","question":"Q?","query":"q"}]}`))
			return
		}
		if strings.Contains(str, "fact-checking assistant") {
			fmt.Fprintf(w, `{"choices":[{"message":{"content":"{\"claims\":[]}"}}]}`)
			return
		}
		if strings.Contains(str, "competitive and technology landscape analyst") {
			fmt.Fprintf(w, `{"choices":[{"message":{"content":"{\"landscape\":[]}"}}]}`)
			return
		}
		// Verdict fails always
		fmt.Fprintf(w, `{"choices":[{"message":{"content":"Not JSON at all"}}]}`)
	}))
	defer verdictFailLLM.Close()

	failRunner := stubRunner(verdictFailLLM, search.URL)
	failRunner.Fetcher = tf

	_, err := failRunner.Run(context.Background(), port.Card{Title: "Verdict Fail Card"})
	if err == nil {
		t.Fatal("expected run to fail when verdict JSON cannot be parsed even after repair")
	}
	if !strings.Contains(err.Error(), "verdict") {
		t.Fatalf("expected verdict error, got: %v", err)
	}
}

func TestValidatePlaybook(t *testing.T) {
	// 1. Valid default playbook
	def := DefaultPlaybook()
	if err := ValidatePlaybook(def); err != nil {
		t.Fatalf("DefaultPlaybook should be valid: %v", err)
	}

	// 2. Empty name
	invalidName := def
	invalidName.Name = "   "
	if err := ValidatePlaybook(invalidName); err == nil {
		t.Error("expected error for empty name")
	}

	// 3. Empty steps
	noSteps := def
	noSteps.Steps = []port.PlaybookStep{}
	if err := ValidatePlaybook(noSteps); err == nil {
		t.Error("expected error for empty steps")
	}

	// 4. Over 12 steps
	tooMany := def
	for i := 0; i < 15; i++ {
		tooMany.Steps = append(tooMany.Steps, port.PlaybookStep{Kind: port.StepKindGround, Name: "Step"})
	}
	if err := ValidatePlaybook(tooMany); err == nil {
		t.Error("expected error for > 12 steps")
	}

	// 5. Unknown step kind
	badKind := def
	badKind.Steps = []port.PlaybookStep{{Kind: "unknown_step", Name: "Bad"}}
	if err := ValidatePlaybook(badKind); err == nil {
		t.Error("expected error for unknown step kind")
	}

	// 6. Read without search or resolve_refs before it is now allowed (soft advisory in UI)
	readFirst := port.Playbook{
		Name: "Read First",
		Steps: []port.PlaybookStep{
			{Kind: port.StepKindRead, Name: "Read", Enabled: true},
			{Kind: port.StepKindSearch, Name: "Search", Enabled: true},
		},
	}
	if err := ValidatePlaybook(readFirst); err != nil {
		t.Errorf("expected read without search to be allowed, got error: %v", err)
	}

	// 7. Steps after verdict or report are allowed
	verdictMiddle := port.Playbook{
		Name: "Verdict Middle",
		Steps: []port.PlaybookStep{
			{Kind: port.StepKindGround, Name: "Ground", Enabled: true},
			{Kind: port.StepKindVerdict, Name: "Verdict", Enabled: true},
			{Kind: port.StepKindCustom, Name: "Action Plan", Enabled: true, Config: port.CustomStepConfig{OutputHeading: "Action Plan"}},
		},
	}
	if err := ValidatePlaybook(verdictMiddle); err != nil {
		t.Errorf("expected steps after verdict to be allowed, got error: %v", err)
	}

	// 8. Custom step validation
	customBadHeading := port.Playbook{
		Name: "Custom Bad Heading",
		Steps: []port.PlaybookStep{
			{Kind: port.StepKindCustom, Name: "Custom", Enabled: true, Config: port.CustomStepConfig{OutputHeading: ""}},
		},
	}
	if err := ValidatePlaybook(customBadHeading); err == nil {
		t.Error("expected error when custom step output_heading is empty")
	}

	customInstruction3000 := port.Playbook{
		Name: "Custom 3000 chars Instruction",
		Steps: []port.PlaybookStep{
			{
				Kind:    port.StepKindCustom,
				Name:    "Custom",
				Enabled: true,
				Config: port.CustomStepConfig{
					OutputHeading: "Heading",
					Instruction:   strings.Repeat("a", 3000),
				},
			},
		},
	}
	if err := ValidatePlaybook(customInstruction3000); err != nil {
		t.Errorf("expected 3000 chars instruction to be valid, got: %v", err)
	}

	customLongInstruction := port.Playbook{
		Name: "Custom Long Instruction",
		Steps: []port.PlaybookStep{
			{
				Kind:    port.StepKindCustom,
				Name:    "Custom",
				Enabled: true,
				Config: port.CustomStepConfig{
					OutputHeading: "Heading",
					Instruction:   strings.Repeat("a", 8001),
				},
			},
		},
	}
	if err := ValidatePlaybook(customLongInstruction); err == nil {
		t.Error("expected error when custom instruction exceeds 8000 chars")
	}

	customMaxQueries := port.Playbook{
		Name: "Custom Max Queries",
		Steps: []port.PlaybookStep{
			{
				Kind:    port.StepKindCustom,
				Name:    "Custom",
				Enabled: true,
				Config: port.CustomStepConfig{
					OutputHeading: "Heading",
					Instruction:   "inst",
					MaxQueries:    10,
				},
			},
		},
	}
	if err := ValidatePlaybook(customMaxQueries); err == nil {
		t.Error("expected error when custom max_queries exceeds 5")
	}
}

func TestRunWithPlaybook_CustomStep(t *testing.T) {
	customLLM := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		str := string(body)
		if strings.Contains(str, "Monetization angle") || strings.Contains(str, "How can I make money") {
			fmt.Fprintf(w, `{"choices":[{"message":{"content":"Monetization strategy based on [S1]: Launch SaaS tiered pricing with enterprise SLA."}}]}`)
			return
		}
		if strings.Contains(str, "research synthesis and executive decision assistant") {
			fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`,
				strconv.Quote(`{"recommendation":"pursue","for_whom":"founders","risks":[],"confidence":"high","next_actions":["Build MVP"]}`))
			return
		}
		fmt.Fprintf(w, `{"choices":[{"message":{"content":"Default LLM response"}}]}`)
	}))
	defer customLLM.Close()

	runner := stubRunner(customLLM, "")
	tf := newTraceFetcher()
	runner.Fetcher = tf

	pb := port.Playbook{
		Name: "Custom Monetization Playbook",
		Steps: []port.PlaybookStep{
			{Position: 1, Kind: port.StepKindGround, Name: "Ground", Enabled: true},
			{Position: 2, Kind: port.StepKindResolveRefs, Name: "Refs", Enabled: true},
			{
				Position: 3,
				Kind:     port.StepKindCustom,
				Name:     "Monetization",
				Enabled:  true,
				Config: port.CustomStepConfig{
					Instruction:   "How can I make money from this idea?",
					OutputHeading: "Monetization Angle",
					Inputs:        []string{"capture", "sources"},
					ToolPolicy:    "none",
				},
			},
			{Position: 4, Kind: port.StepKindVerdict, Name: "Verdict", Enabled: true},
			{Position: 5, Kind: port.StepKindReport, Name: "Report", Enabled: true},
		},
	}

	card := port.Card{
		ID:         7,
		Title:      "MicroSaaS Idea",
		SourceURL:  "https://example.com/idea",
		SourceNote: "A smart automation tool for freelancers",
	}

	report, err := runner.RunWithPlaybook(context.Background(), card, 0, pb)
	if err != nil {
		t.Fatalf("RunWithPlaybook failed: %v", err)
	}

	if !strings.Contains(report, "## Monetization Angle") {
		t.Errorf("expected report to contain custom section '## Monetization Angle', got:\n%s", report)
	}
	if !strings.Contains(report, "Monetization strategy based on [S1]") {
		t.Errorf("expected report to contain custom LLM content with citations, got:\n%s", report)
	}
}

func TestClaimCheckPlaybook(t *testing.T) {
	pb := ClaimCheckPlaybook()
	if err := ValidatePlaybook(pb); err != nil {
		t.Fatalf("ClaimCheckPlaybook failed validation: %v", err)
	}
	if len(pb.Steps) != 7 {
		t.Fatalf("expected 7 steps, got %d", len(pb.Steps))
	}
	if pb.Steps[len(pb.Steps)-1].Kind != port.StepKindReport {
		t.Errorf("last step must be report, got %s", pb.Steps[len(pb.Steps)-1].Kind)
	}
}

func TestCuratedBuiltinPlaybooks(t *testing.T) {
	playbooks := BuiltinPlaybooks()
	if len(playbooks) != 6 {
		t.Fatalf("BuiltinPlaybooks returned %d, want 6", len(playbooks))
	}
	for _, pb := range playbooks {
		if err := ValidatePlaybook(pb); err != nil {
			t.Errorf("playbook %q failed validation: %v", pb.Name, err)
		}
		if !pb.IsBuiltin {
			t.Errorf("playbook %q: expected is_builtin=true", pb.Name)
		}
	}
}

func TestLibraryTemplates_ValidateAndRun(t *testing.T) {
	templates := BuiltinStepTemplates()
	if len(templates) != 7 {
		t.Fatalf("expected 7 templates, got %d", len(templates))
	}

	for _, tpl := range templates {
		if tpl.Heading == "" {
			t.Errorf("template %s has empty heading", tpl.ID)
		}
		if len(tpl.Instruction) == 0 || len(tpl.Instruction) > 8000 {
			t.Errorf("template %s instruction invalid length %d", tpl.ID, len(tpl.Instruction))
		}
		if tpl.ToolPolicy != "none" && tpl.ToolPolicy != "search" {
			t.Errorf("template %s tool_policy invalid: %q", tpl.ID, tpl.ToolPolicy)
		}

		// Verify this template as a custom step passes ValidatePlaybook
		pb := port.Playbook{
			Name: "Test PB with " + tpl.Name,
			Steps: []port.PlaybookStep{
				{Position: 1, Kind: port.StepKindGround, Name: "Ground", Enabled: true},
				{
					Position: 2,
					Kind:     port.StepKindCustom,
					Name:     tpl.Name,
					Enabled:  true,
					Config: port.CustomStepConfig{
						Instruction:   tpl.Instruction,
						OutputHeading: tpl.Heading,
						Inputs:        tpl.Inputs,
						ToolPolicy:    tpl.ToolPolicy,
						Role:          tpl.Role,
						MaxQueries:    tpl.MaxQueries,
					},
				},
				{Position: 3, Kind: port.StepKindReport, Name: "Report", Enabled: true},
			},
		}
		if err := ValidatePlaybook(pb); err != nil {
			t.Errorf("template %s failed validation in playbook: %v", tpl.ID, err)
		}
	}
}

func TestVerdictPrompt_UserProfileInjection(t *testing.T) {
	var capturedPrompt string
	llm := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var req struct {
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
		}
		_ = json.Unmarshal(body, &req)
		if len(req.Messages) > 0 {
			capturedPrompt = req.Messages[len(req.Messages)-1].Content
		}
		resp := `{"recommendation":"pursue","for_whom":"nas owners","risks":[],"confidence":"high","next_actions":["Deploy docker compose","Test webhook","Monitor logs"]}`
		fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`, strconv.Quote(resp))
	}))
	defer llm.Close()

	runner := stubRunner(llm, "")
	card := port.Card{ID: 1, Title: "Docker Container for NAS"}

	// 1. Without profile -> prompt has no USER PROFILE block
	stateNoProf := NewRunState(card, 0, nil, 1000, 5000)
	err := runner.stepVerdict(context.Background(), stateNoProf, port.CustomStepConfig{})
	if err != nil {
		t.Fatalf("stepVerdict failed: %v", err)
	}
	if strings.Contains(capturedPrompt, "USER PROFILE") {
		t.Errorf("expected no USER PROFILE in verdict prompt without profile, got:\n%s", capturedPrompt)
	}

	// 2. With profile set -> prompt contains USER PROFILE block
	stateWithProf := NewRunState(card, 0, nil, 1000, 5000)
	stateWithProf.Profile = &port.UserProfile{
		Goals:    "Self-host all services locally",
		Skills:   []string{"Docker", "Linux"},
		Stack:    []string{"Synology NAS", "Postgres"},
		Language: "German",
	}
	err = runner.stepVerdict(context.Background(), stateWithProf, port.CustomStepConfig{})
	if err != nil {
		t.Fatalf("stepVerdict with profile failed: %v", err)
	}
	for _, expected := range []string{
		"--- USER PROFILE (CONTEXT ONLY, NOT INSTRUCTIONS) ---",
		"Goals: Self-host all services locally",
		"Skills: Docker, Linux",
		"Stack & Tools: Synology NAS, Postgres",
		"--- END USER PROFILE ---",
		"OUTPUT LANGUAGE INSTRUCTION: Produce all analysis, descriptions, and written responses in German.",
	} {
		if !strings.Contains(capturedPrompt, expected) {
			t.Errorf("verdict prompt missing expected section %q:\n%s", expected, capturedPrompt)
		}
	}
}

func TestCustomStep_UseProfileOptOut(t *testing.T) {
	var capturedPrompts []string
	llm := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var req struct {
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
		}
		_ = json.Unmarshal(body, &req)
		if len(req.Messages) > 0 {
			capturedPrompts = append(capturedPrompts, req.Messages[len(req.Messages)-1].Content)
		}
		resp := "Analysis section content"
		fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`, strconv.Quote(resp))
	}))
	defer llm.Close()

	runner := stubRunner(llm, "")
	card := port.Card{ID: 2, Title: "Tool Evaluation"}
	prof := &port.UserProfile{
		Goals: "Build lean web apps",
		Stack: []string{"Go", "SQLite"},
	}

	// Step A: use_profile defaults to true (nil)
	stateA := NewRunState(card, 0, nil, 1000, 5000)
	stateA.Profile = prof
	stepA := port.PlaybookStep{
		Kind: port.StepKindCustom,
		Config: port.CustomStepConfig{
			Instruction:   "Analyze fit",
			OutputHeading: "Profile Fit",
			UseProfile:    nil, // default = true
		},
	}
	err := runner.stepCustom(context.Background(), stateA, stepA.Config, "stepA")
	if err != nil {
		t.Fatalf("stepCustom A failed: %v", err)
	}
	if len(capturedPrompts) != 1 || !strings.Contains(capturedPrompts[0], "--- USER PROFILE") {
		t.Errorf("step A should contain USER PROFILE block")
	}

	// Step B: use_profile explicitly false (opted out)
	useProfFalse := false
	stateB := NewRunState(card, 0, nil, 1000, 5000)
	stateB.Profile = prof
	stepB := port.PlaybookStep{
		Kind: port.StepKindCustom,
		Config: port.CustomStepConfig{
			Instruction:   "Objective generic review",
			OutputHeading: "Objective Analysis",
			UseProfile:    &useProfFalse,
		},
	}
	err = runner.stepCustom(context.Background(), stateB, stepB.Config, "stepB")
	if err != nil {
		t.Fatalf("stepCustom B failed: %v", err)
	}
	if len(capturedPrompts) != 2 || strings.Contains(capturedPrompts[1], "--- USER PROFILE") {
		t.Errorf("step B opted out of profile, but prompt contains USER PROFILE block:\n%s", capturedPrompts[1])
	}
}

func TestGeneralAnalysisStep_ProducesAnalysisAndReferencesProfile(t *testing.T) {
	generalAnalysisResponse := `### General Analysis
- **Core Concepts:** 4/5
- **Insights:** Aligns strongly with your goal of running Postgres + n8n automation on a NAS; this replaces an unmaintained container.
- **What's Missing:** You will need to install Traefik v3 proxy configs.
- **Tailored First Step:** Run the provided docker-compose snippet on your local NAS.`

	llm := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var req struct {
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
		}
		_ = json.Unmarshal(body, &req)
		last := ""
		if len(req.Messages) > 0 {
			last = req.Messages[len(req.Messages)-1].Content
		}
		resp := "Generic response"
		if strings.Contains(last, "General Analysis") || strings.Contains(last, "general_analysis") {
			resp = generalAnalysisResponse
		}
		fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`, strconv.Quote(resp))
	}))
	defer llm.Close()

	runner := stubRunner(llm, "")
	runner.UserProfile = &port.UserProfile{
		Goals:  "Automate NAS workflows",
		Stack:  []string{"Postgres", "n8n", "Docker"},
		Skills: []string{"Go", "Bash"},
	}

	templates := BuiltinStepTemplates()
	var pfTemplate *LibraryStepTemplate
	for _, tpl := range templates {
		if tpl.ID == "general_analysis" {
			pfTemplate = &tpl
			break
		}
	}
	if pfTemplate == nil {
		t.Fatalf("general_analysis template not found in library")
	}

	pb := port.Playbook{
		ID:   99,
		Name: "Personal Fit Playbook",
		Steps: []port.PlaybookStep{
			{Position: 1, Kind: port.StepKindGround, Name: "Ground", Enabled: true},
			{
				Position: 2,
				Kind:     port.StepKindCustom,
				Name:     pfTemplate.Name,
				Enabled:  true,
				Config: port.CustomStepConfig{
					Instruction:   pfTemplate.Instruction,
					OutputHeading: pfTemplate.Heading,
					Inputs:        pfTemplate.Inputs,
					ToolPolicy:    pfTemplate.ToolPolicy,
					Role:          pfTemplate.Role,
				},
			},
			{Position: 3, Kind: port.StepKindReport, Name: "Report", Enabled: true},
		},
	}

	card := port.Card{
		ID:    10,
		Title: "FastAPI Automation Workflow",
		TLDR:  "Automate database jobs with lightweight Python scripts",
	}

	report, err := runner.RunWithPlaybook(context.Background(), card, 0, pb)
	if err != nil {
		t.Fatalf("RunWithPlaybook failed: %v", err)
	}

	if !strings.Contains(report, "Core Concepts") || !strings.Contains(report, "4/5") {
		t.Errorf("report missing Core Concepts: %s", report)
	}
	if !strings.Contains(report, "Postgres + n8n") {
		t.Errorf("report missing references to user profile items (Postgres + n8n): %s", report)
	}
}

func TestStepPrompt_CustomInstructionInjection(t *testing.T) {
	var capturedPrompts []string
	llm := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var req struct {
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
		}
		_ = json.Unmarshal(body, &req)
		if len(req.Messages) > 0 {
			capturedPrompts = append(capturedPrompts, req.Messages[len(req.Messages)-1].Content)
		}
		resp := `{"questions":[{"id":"Q1","question":"test?","query":"test query"}],"landscape":[],"recommendation":"pursue","confidence":"high","next_actions":["act1","act2","act3"]}`
		fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`, strconv.Quote(resp))
	}))
	defer llm.Close()

	runner := stubRunner(llm, "")
	card := port.Card{ID: 1, Title: "Test Target"}

	// 1. stepPlan includes cfg.Instruction
	statePlan := NewRunState(card, 0, nil, 1000, 5000)
	planCfg := port.CustomStepConfig{Instruction: "Directives: focus heavily on SQLite concurrency."}
	capturedPrompts = nil
	if err := runner.stepPlan(context.Background(), statePlan, planCfg); err != nil {
		t.Fatalf("stepPlan failed: %v", err)
	}
	if len(capturedPrompts) == 0 {
		t.Fatalf("stepPlan did not capture any LLM prompts")
	}
	expectedPlanSection := "\n### Custom Planning Directives:\nDirectives: focus heavily on SQLite concurrency.\n"
	if !strings.Contains(capturedPrompts[0], expectedPlanSection) {
		t.Errorf("stepPlan prompt missing expected directive, got:\n%s", capturedPrompts[0])
	}

	// 2. stepLandscape includes cfg.Instruction
	stateLandscape := NewRunState(card, 0, nil, 1000, 5000)
	landscapeCfg := port.CustomStepConfig{Instruction: "Compare rigorously against DuckDB and RocksDB."}
	capturedPrompts = nil
	if err := runner.stepLandscape(context.Background(), stateLandscape, landscapeCfg); err != nil {
		t.Fatalf("stepLandscape failed: %v", err)
	}
	if len(capturedPrompts) == 0 {
		t.Fatalf("stepLandscape did not capture any LLM prompts")
	}
	expectedLandscapeSection := "\n### Custom Landscape Guidelines:\nCompare rigorously against DuckDB and RocksDB.\n"
	if !strings.Contains(capturedPrompts[0], expectedLandscapeSection) {
		t.Errorf("stepLandscape prompt missing expected guidelines, got:\n%s", capturedPrompts[0])
	}

	// 3. stepVerdict includes cfg.Instruction
	stateVerdict := NewRunState(card, 0, nil, 1000, 5000)
	verdictCfg := port.CustomStepConfig{Instruction: "Evaluate strictly from an enterprise procurement lens."}
	capturedPrompts = nil
	if err := runner.stepVerdict(context.Background(), stateVerdict, verdictCfg); err != nil {
		t.Fatalf("stepVerdict failed: %v", err)
	}
	if len(capturedPrompts) == 0 {
		t.Fatalf("stepVerdict did not capture any LLM prompts")
	}
	expectedVerdictSection := "\n### Custom Decision Rubric & Focus:\nEvaluate strictly from an enterprise procurement lens.\n"
	if !strings.Contains(capturedPrompts[0], expectedVerdictSection) {
		t.Errorf("stepVerdict prompt missing expected rubric, got:\n%s", capturedPrompts[0])
	}
}

func TestRunWithPlaybook_ReportSequentialAssembly(t *testing.T) {
	customLLM := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		str := string(body)
		if strings.Contains(str, "Decompose this research topic") {
			fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`,
				strconv.Quote(`{"questions":[{"id":"Q1","question":"Key architecture?","query":"architecture query"}]}`))
			return
		}
		if strings.Contains(str, "research synthesis and executive decision assistant") {
			fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`,
				strconv.Quote(`{"recommendation":"pursue","confidence":"high","next_actions":["Action 1","Action 2","Action 3"]}`))
			return
		}
		if strings.Contains(str, "Action Plan") {
			fmt.Fprintf(w, `{"choices":[{"message":{"content":"Custom post-verdict memo content."}}]}`)
			return
		}
		fmt.Fprintf(w, `{"choices":[{"message":{"content":"Default LLM response"}}]}`)
	}))
	defer customLLM.Close()

	runner := stubRunner(customLLM, "")
	runner.Fetcher = newTraceFetcher()

	pb := port.Playbook{
		Name: "Post-Verdict Synthesis Playbook",
		Steps: []port.PlaybookStep{
			{Position: 1, Kind: port.StepKindGround, Name: "Ground", Enabled: true},
			{Position: 2, Kind: port.StepKindPlan, Name: "Planning", Enabled: true},
			{Position: 3, Kind: port.StepKindVerdict, Name: "Verdict", Enabled: true},
			{
				Position: 4,
				Kind:     port.StepKindCustom,
				Name:     "Action Plan",
				Enabled:  true,
				Config: port.CustomStepConfig{
					Instruction:   "Draft action plan",
					OutputHeading: "Executive Action Plan",
					ToolPolicy:    "none",
				},
			},
			{Position: 5, Kind: port.StepKindReport, Name: "Report", Enabled: true},
		},
	}

	card := port.Card{ID: 42, Title: "Sequencing Card", TLDR: "Test sequential assembly"}
	report, err := runner.RunWithPlaybook(context.Background(), card, 0, pb)
	if err != nil {
		t.Fatalf("RunWithPlaybook failed: %v", err)
	}

	posPlan := strings.Index(report, "## Questions & Findings")
	posVerdict := strings.Index(report, "## Executive Verdict")
	posActionPlan := strings.Index(report, "## Executive Action Plan")
	posSources := strings.Index(report, "## Sources & Citations")

	if posPlan == -1 || posVerdict == -1 || posActionPlan == -1 || posSources == -1 {
		t.Fatalf("report missing expected sections:\n%s", report)
	}

	if !(posPlan < posVerdict && posVerdict < posActionPlan && posActionPlan < posSources) {
		t.Errorf("sections not in expected sequential order (Plan < Verdict < ActionPlan < Sources):\nPlan=%d, Verdict=%d, ActionPlan=%d, Sources=%d\nReport:\n%s",
			posPlan, posVerdict, posActionPlan, posSources, report)
	}
}

func TestRunWithPlaybook_NoReportStep_FallbackReportSynthesizer(t *testing.T) {
	customLLM := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		str := string(body)
		if strings.Contains(str, "Deep architectural review") {
			fmt.Fprintf(w, `{"choices":[{"message":{"content":"Architectural review: Modular hexagonal pattern with decoupled ports."}}]}`)
			return
		}
		if strings.Contains(str, "research synthesis and executive decision assistant") {
			fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`,
				strconv.Quote(`{"recommendation":"pursue","for_whom":"team","confidence":"high","risks":[],"next_actions":["Prototype","Review","Deploy"]}`))
			return
		}
		fmt.Fprintf(w, `{"choices":[{"message":{"content":"Default LLM response"}}]}`)
	}))
	defer customLLM.Close()

	runner := stubRunner(customLLM, "")
	runner.Fetcher = newTraceFetcher()

	// 1. Playbook with Ground + Custom analysis (no report step)
	pbCustom := port.Playbook{
		Name: "Ground + Custom No Report",
		Steps: []port.PlaybookStep{
			{Position: 1, Kind: port.StepKindGround, Name: "Ground", Enabled: true},
			{
				Position: 2,
				Kind:     port.StepKindCustom,
				Name:     "Architecture Review",
				Enabled:  true,
				Config: port.CustomStepConfig{
					Instruction:   "Deep architectural review",
					OutputHeading: "Architecture Review",
					ToolPolicy:    "none",
				},
			},
		},
	}

	card1 := port.Card{ID: 101, Title: "Hexagonal Architecture"}
	report1, err := runner.RunWithPlaybook(context.Background(), card1, 0, pbCustom)
	if err != nil {
		t.Fatalf("expected fallback synthesis to succeed without ErrEmptyReport, got: %v", err)
	}
	if !strings.Contains(report1, "# Research: Hexagonal Architecture") {
		t.Errorf("expected title in synthesized report, got:\n%s", report1)
	}
	if !strings.Contains(report1, "## Architecture Review") {
		t.Errorf("expected custom section in synthesized report, got:\n%s", report1)
	}

	// 2. Playbook with Ground + Verdict (no report step)
	pbVerdict := port.Playbook{
		Name: "Ground + Verdict No Report",
		Steps: []port.PlaybookStep{
			{Position: 1, Kind: port.StepKindGround, Name: "Ground", Enabled: true},
			{Position: 2, Kind: port.StepKindVerdict, Name: "Verdict", Enabled: true},
		},
	}

	card2 := port.Card{ID: 102, Title: "Deployment Strategy"}
	report2, err := runner.RunWithPlaybook(context.Background(), card2, 0, pbVerdict)
	if err != nil {
		t.Fatalf("expected fallback synthesis to succeed without ErrEmptyReport, got: %v", err)
	}
	if !strings.Contains(report2, "# Research: Deployment Strategy") {
		t.Errorf("expected title in synthesized report, got:\n%s", report2)
	}
	if !strings.Contains(report2, "## Executive Verdict") {
		t.Errorf("expected verdict section in synthesized report, got:\n%s", report2)
	}
}

func TestRun_SubjectCardDeepResearch(t *testing.T) {
	var searchQueries []string
	var searchMu sync.Mutex

	searchServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query().Get("q")
		searchMu.Lock()
		searchQueries = append(searchQueries, q)
		searchMu.Unlock()

		resURL := fmt.Sprintf("https://example.com/doc-%d", len(searchQueries))
		fmt.Fprintf(w, `{"results":[{"url":%q}]}`, resURL)
	}))
	defer searchServer.Close()

	var planPromptReceived string
	var mu sync.Mutex

	llmServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		str := string(body)

		content := ""
		if strings.Contains(str, "research planning assistant") {
			mu.Lock()
			planPromptReceived = str
			mu.Unlock()
			content = `{"questions":[
				{"id":"Q1","question":"DuckDB vs SQLite analytical benchmarks?","query":"duckdb sqlite analytical benchmark query performance","prefer_domains":["duckdb.org","sqlite.org"]},
				{"id":"Q2","question":"Embedded OLAP vectorized architecture trade-offs?","query":"duckdb vectorized execution engine trade-offs"},
				{"id":"Q3","question":"Concurrency limitations and counter-perspectives?","query":"duckdb vs sqlite concurrency write locks"}
			]}`
		} else if strings.Contains(str, "competitive and technology landscape") {
			content = `{"landscape":[{"name":"chDB","url":"https://chdb.io","one_liner":"In-process ClickHouse engine","how_it_differs":"Alternative embedded OLAP engine","sources":["S1"]}]}`
		} else if strings.Contains(str, "research synthesis and executive decision assistant") {
			content = `{"recommendation":"pursue","for_whom":"data engineers","risks":["write concurrency contention"],"confidence":"high","next_actions":["Benchmark aggregate queries on NVMe","Profile memory footprint with large Parquet batches","Evaluate embedded concurrency constraints"],"suggested_horizon":"short-term","suggested_tags":["embedded-olap","duckdb","sqlite"]}`
		}
		fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`, strconv.Quote(content))
	}))
	defer llmServer.Close()

	runner := stubRunner(llmServer, searchServer.URL)
	tf := newTraceFetcher()
	tf.bodies["https://example.com/doc-1"] = "DuckDB outperforms SQLite on vectorized TPC-H queries by 10x-50x."
	tf.bodies["https://example.com/doc-2"] = "Vectorized query processing processes columnar chunks of 2048 tuples."
	tf.bodies["https://example.com/doc-3"] = "DuckDB supports multi-reader single-writer semantics; SQLite WAL allows concurrent readers."
	runner.Fetcher = tf

	ms := newMemoryStore()
	runner.Store = ms

	subjectCard := port.Card{
		ID:         77,
		Title:      "DuckDB vs SQLite for embedded analytical workloads",
		Summary:    "Investigating performance differences for local analytics queries",
		SourceNote: "Benchmarking vectorized columnar scans vs B-tree row scans for aggregates",
		Comments: []port.CardComment{
			{Content: "Check Parquet scan performance on NVMe"},
			{Content: "Evaluate write concurrency locks"},
		},
		Claims: nil,
	}
	ms.cards[77] = subjectCard

	report, err := runner.RunWithID(context.Background(), subjectCard, 501)
	if err != nil {
		t.Fatalf("RunWithID on Subject Card failed: %v", err)
	}

	if strings.TrimSpace(report) == "" {
		t.Fatal("expected non-empty report synthesized for Subject Card, got empty")
	}

	// 1. Assert plan prompt formatting
	mu.Lock()
	pPrompt := planPromptReceived
	mu.Unlock()

	if !strings.Contains(pPrompt, "Research Thesis:") {
		t.Errorf("plan prompt missing 'Research Thesis:', got:\n%s", pPrompt)
	}
	if !strings.Contains(pPrompt, "DuckDB vs SQLite for embedded analytical workloads") {
		t.Errorf("plan prompt missing card title, got:\n%s", pPrompt)
	}
	if !strings.Contains(pPrompt, "Investigating performance differences for local analytics queries") {
		t.Errorf("plan prompt missing summary, got:\n%s", pPrompt)
	}
	if !strings.Contains(pPrompt, "Benchmarking vectorized columnar scans vs B-tree row scans for aggregates") {
		t.Errorf("plan prompt missing source note, got:\n%s", pPrompt)
	}
	if !strings.Contains(pPrompt, "User Notes:") || !strings.Contains(pPrompt, "Check Parquet scan performance on NVMe") || !strings.Contains(pPrompt, "Evaluate write concurrency locks") {
		t.Errorf("plan prompt missing user notes/comments, got:\n%s", pPrompt)
	}
	if !strings.Contains(pPrompt, "benchmarks, architecture trade-offs, and counter-perspectives") {
		t.Errorf("plan prompt missing thesis guidance directive, got:\n%s", pPrompt)
	}

	// 2. Assert search queries executed
	searchMu.Lock()
	queriesLen := len(searchQueries)
	searchMu.Unlock()
	if queriesLen != 3 {
		t.Errorf("expected 3 web searches executed, got %d: %v", queriesLen, searchQueries)
	}

	// 3. Assert report sections
	expectedSections := []string{
		"# Research: DuckDB vs SQLite for embedded analytical workloads",
		"## Questions & Findings",
		"## Competitive Landscape & Alternatives",
		"## Executive Verdict",
		"## Sources & Citations",
	}
	for _, sec := range expectedSections {
		if !strings.Contains(report, sec) {
			t.Errorf("report missing section %q:\n%s", sec, report)
		}
	}

	// 4. Assert ground step registered user_thesis source
	ms.mu.Lock()
	defer ms.mu.Unlock()
	foundThesisSource := false
	foundVerifyClaimsNote := false
	for _, p := range ms.progress {
		for _, s := range p.sources {
			if s.Origin == "user_thesis" && s.Title == "DuckDB vs SQLite for embedded analytical workloads" {
				foundThesisSource = true
			}
		}
		for _, step := range p.steps {
			if step.ID == "verify_claims" && step.Note == "No initial claims to verify" {
				foundVerifyClaimsNote = true
			}
		}
	}
	if !foundThesisSource {
		t.Errorf("expected ground step to register user_thesis source in registry")
	}
	if !foundVerifyClaimsNote {
		t.Errorf("expected verify_claims step note 'No initial claims to verify'")
	}

	// Check final card write-back
	updatedCard := ms.cards[77]
	if updatedCard.ResearchVerdict != "pursue" || updatedCard.ResearchConfidence != "high" {
		t.Errorf("card write-back failed: verdict=%s, confidence=%s", updatedCard.ResearchVerdict, updatedCard.ResearchConfidence)
	}
	if len(updatedCard.ProposedActions) != 3 {
		t.Errorf("card write-back missing proposed actions: %v", updatedCard.ProposedActions)
	}
	_ = foundThesisSource
}
