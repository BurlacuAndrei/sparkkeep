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
// for plan (one-line query) and synthesis (markdown with citations).
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
		content := "## What the source says\nSummary [S1]\n## Findings\nKey findings [S1]\n## Sources\n[S1] source\n## Next steps\nNext step"
		if strings.Contains(last, "web search query") {
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
	mu        sync.Mutex
	progress  []struct {
		status string
		query  string
		steps  []port.ResearchStep
	}
	captures  map[int64]port.Capture
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

func (m *memoryStore) UpdateResearchProgress(_ context.Context, _ int64, status, query string, steps []port.ResearchStep, _ []port.Source, _ int) error {
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
	if !strings.Contains(report, "## Findings") {
		t.Fatalf("report missing ## Findings:\n%s", report)
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

	// Verify order: fetch:https://example.com/refA and fetch:https://example.com/refB MUST occur before search_api_called
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

func TestRun_SynthesisPromptContainsSourceMarkers(t *testing.T) {
	var synthPrompt string
	synthServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var req struct {
			Messages []struct {
				Content string `json:"content"`
			} `json:"messages"`
		}
		_ = json.Unmarshal(body, &req)
		if len(req.Messages) > 0 {
			synthPrompt = req.Messages[len(req.Messages)-1].Content
		}
		fmt.Fprint(w, `{"choices":[{"message":{"content":"## What the source says\n[S1] says X\n## Findings\nFound Y\n## Sources\n[S1]\n## Next steps\nDo Z"}}]}`)
	}))
	defer synthServer.Close()

	planServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"choices":[{"message":{"content":"search query"}}]}`)
	}))
	defer planServer.Close()

	search := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"results":[{"url":"https://example.com/res1"}]}`)
	}))
	defer search.Close()

	planClient := analyze.New(config.Config{LLMBase: planServer.URL, LLMModel: "plan"}, planServer.Client())
	synthClient := analyze.New(config.Config{LLMBase: synthServer.URL, LLMModel: "synth"}, synthServer.Client())

	runner := NewWithClients(config.Config{SearchURL: search.URL}, planClient, synthClient)
	tf := newTraceFetcher()
	tf.bodies["https://example.com/res1"] = "Search result 1 text"
	runner.Fetcher = tf

	card := port.Card{
		Title: "Test Citations",
		TLDR:  "Summary",
		References: []port.Reference{
			{Kind: "url", Label: "RefDoc", URL: "https://example.com/ref"},
		},
	}
	tf.bodies["https://example.com/ref"] = "Reference doc text"

	report, err := runner.Run(context.Background(), card)
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}

	if !strings.Contains(synthPrompt, "[S1]") || !strings.Contains(synthPrompt, "[S2]") {
		t.Fatalf("synthesis prompt missing [S1] or [S2] source markers:\n%s", synthPrompt)
	}
	if !strings.Contains(report, "[S1]") {
		t.Fatalf("report missing citations [S1]:\n%s", report)
	}
}

func TestRegistry_BudgetsAndRuneSafeClipping(t *testing.T) {
	reg := NewRegistry(10, 25)

	// Multi-byte string: Chinese characters (3 bytes each) + emojis (4 bytes each)
	// "你好世界🎉🔥" has 6 runes, but 18+ bytes!
	multiByte := "你好世界🎉🔥"
	src, ok := reg.Add("https://example.com/1", "Title 1", "search", multiByte, time.Now())
	if !ok || src == nil {
		t.Fatalf("failed to add first source")
	}
	if utf8.RuneCountInString(src.ClippedText) != 6 {
		t.Fatalf("rune count = %d, want 6", utf8.RuneCountInString(src.ClippedText))
	}

	// Long multi-byte string exceeding per-source budget (10 runes)
	longMulti := strings.Repeat("中", 50)
	src2, ok := reg.Add("https://example.com/2", "Title 2", "search", longMulti, time.Now())
	if !ok || src2 == nil {
		t.Fatalf("failed to add second source")
	}
	if utf8.RuneCountInString(src2.ClippedText) != 10 {
		t.Fatalf("expected clipped to per-source budget 10 runes, got %d", utf8.RuneCountInString(src2.ClippedText))
	}

	// Total budget was 25. First added 6 runes, second added 10 runes -> 16 runes used, 9 remaining.
	// Third source with 20 runes should be clipped to remaining 9 runes.
	src3, ok := reg.Add("https://example.com/3", "Title 3", "search", strings.Repeat("A", 20), time.Now())
	if !ok || src3 == nil {
		t.Fatalf("failed to add third source")
	}
	if utf8.RuneCountInString(src3.ClippedText) != 9 {
		t.Fatalf("expected clipped to remaining total budget 9 runes, got %d", utf8.RuneCountInString(src3.ClippedText))
	}

	// Fourth source should be rejected as total budget (25 runes) is exhausted.
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

	if count < 5 {
		t.Fatalf("expected at least 5 progress updates (each step running/done), got %d", count)
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
	if !strings.Contains(report, "## Findings") {
		t.Fatalf("report missing ## Findings:\n%s", report)
	}
}
