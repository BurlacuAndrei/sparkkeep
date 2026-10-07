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
// for plan (JSON or single-line query) and synthesis (markdown with citations).
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
		content := "## What the source says\nSummary [S1]\n## Questions & Findings\n### Q1: What is it?\nKey findings [S1]\n## Sources\n[S1] source\n## Next steps\nNext step"
		if strings.Contains(last, "research planning assistant") {
			content = `{"questions":[{"id":"Q1","question":"Core technology?","query":"core tech query","prefer_domains":["github.com"]}]}`
		} else if strings.Contains(last, "web search query") {
			content = "cli-fi reading list"
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
		status string
		query  string
		steps  []port.ResearchStep
	}
	captures map[int64]port.Capture
}

func newMemoryStore() *memoryStore {
	return &memoryStore{captures: make(map[int64]port.Capture)}
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

func (m *memoryStore) UpdateResearchProgress(_ context.Context, _ int64, status, query string, steps []port.ResearchStep, _ []port.Source, _ *port.ResearchPlan, _ int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	stepsCopy := make([]port.ResearchStep, len(steps))
	copy(stepsCopy, steps)
	m.progress = append(m.progress, struct {
		status string
		query  string
		steps  []port.ResearchStep
	}{status: status, query: query, steps: stepsCopy})
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
func (o orderTrackFetcher) Subtitles(share capture.Share) string           { return "" }

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

	synthServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		content := "## What the source says\n[S1]\n## Questions & Findings\n### Q1: Question 1?\nFindings for Q1 [S1]\n## Sources\n[S1]\n## Next steps\nSteps"
		_ = body
		fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`, strconv.Quote(content))
	}))
	defer synthServer.Close()

	planClient := analyze.New(config.Config{LLMBase: planServer.URL, LLMModel: "plan"}, planServer.Client())
	synthClient := analyze.New(config.Config{LLMBase: synthServer.URL, LLMModel: "synth"}, synthServer.Client())

	runner := NewWithClients(config.Config{SearchURL: search.URL}, planClient, synthClient)
	tf := newTraceFetcher()
	runner.Fetcher = tf

	card := port.Card{
		Title: "Multi-Question Card",
		TLDR:  "Investigating distributed databases",
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

	synthServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		content := "## What the source says\nText [S1]\n## Questions & Findings\n### Q1: General\nFound things [S1]\n## Sources\n[S1]\n## Next steps\nSteps"
		fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`, strconv.Quote(content))
	}))
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

	synthServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"choices":[{"message":{"content":"## What the source says\n[S1]\n## Questions & Findings\n### Q1\nfindings\n## Sources\n[S1]\n## Next steps\nsteps"}}]}`)
	}))
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
