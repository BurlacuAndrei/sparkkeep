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
	"testing"
	"time"

	"sparkkeep/internal/analyze"
	"sparkkeep/internal/capture"
	"sparkkeep/internal/config"
	"sparkkeep/internal/port"
)

// llmStub is a chat-completions server: the query step gets a canned
// one-line answer; the synthesis step echoes the prompt back so the report
// carries the exact source URLs and clipped fetched text the runner sent.
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
		content := last
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

func TestRunSearchNoResults(t *testing.T) {
	search := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"results":[]}`)
	}))
	defer search.Close()
	llm := llmStub()
	defer llm.Close()

	report, err := stubRunner(llm, search.URL).Run(context.Background(), port.Card{Title: "T", Summary: "S"})
	if err == nil {
		t.Fatal("err = nil, want error on empty search results")
	}
	if report != "" {
		t.Fatalf("report = %q, want empty", report)
	}
}

func TestRunOk(t *testing.T) {
	src := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "source text here")
	}))
	defer src.Close()
	search := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"results":[{"url":%q}]}`, src.URL)
	}))
	defer search.Close()
	llm := llmStub()
	defer llm.Close()

	report, err := stubRunner(llm, search.URL).Run(context.Background(), port.Card{Title: "T", Summary: "S"})
	if err != nil {
		t.Fatalf("Run err: %v", err)
	}
	if !strings.Contains(report, "## Findings") {
		t.Fatalf("report missing ## Findings:\n%s", report)
	}
	if !strings.Contains(report, src.URL) {
		t.Fatalf("report missing source URL %s:\n%s", src.URL, report)
	}
}

func TestRunClipped(t *testing.T) {
	raw := strings.Repeat("a", 20000)
	src := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, raw)
	}))
	defer src.Close()
	search := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"results":[{"url":%q}]}`, src.URL)
	}))
	defer search.Close()
	llm := llmStub()
	defer llm.Close()

	r := stubRunner(llm, search.URL)
	r.ClipChars = 100

	report, err := r.Run(context.Background(), port.Card{Title: "T", Summary: "S"})
	if err != nil {
		t.Fatalf("Run err: %v", err)
	}
	if len(report) >= len(raw) {
		t.Fatalf("report len %d, want shorter than raw %d", len(report), len(raw))
	}
	marker := "Fetched text:\n"
	i := strings.Index(report, marker)
	if i < 0 {
		t.Fatalf("report missing fetched-text section:\n%s", report)
	}
	if body := report[i+len(marker):]; len(body) > r.ClipChars {
		t.Fatalf("fetched text in report is %d chars, clip budget was %d", len(body), r.ClipChars)
	}
}

func TestRunLLMQueryFail(t *testing.T) {
	llm := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer llm.Close()
	search := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"results":[{"url":"http://x"}]}`)
	}))
	defer search.Close()

	_, err := stubRunner(llm, search.URL).Run(context.Background(), port.Card{Title: "T", Summary: "S"})
	if err == nil {
		t.Fatal("err = nil, want error when query LLM fails")
	}
}

func TestRunContextTimeout(t *testing.T) {
	llm := llmStub()
	defer llm.Close()
	search := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(500 * time.Millisecond)
		fmt.Fprint(w, `{"results":[]}`)
	}))
	defer search.Close()

	r := stubRunner(llm, search.URL)
	r.Timeout = 10 * time.Millisecond

	start := time.Now()
	_, err := r.Run(context.Background(), port.Card{Title: "T", Summary: "S"})
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("err = %v, want context deadline exceeded", err)
	}
	if d := time.Since(start); d > 2*time.Second {
		t.Fatalf("Run took %v, want prompt timeout", d)
	}
}

func TestRunSkipsFetchErrors(t *testing.T) {
	bad := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	}))
	defer bad.Close()
	good := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "good source text")
	}))
	defer good.Close()
	search := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"results":[{"url":%q},{"url":%q}]}`, bad.URL, good.URL)
	}))
	defer search.Close()
	llm := llmStub()
	defer llm.Close()

	r := stubRunner(llm, search.URL)
	r.MaxResults = 10

	report, err := r.Run(context.Background(), port.Card{Title: "T", Summary: "S"})
	if err != nil {
		t.Fatalf("Run err: %v", err)
	}
	if !strings.Contains(report, good.URL) {
		t.Fatalf("report missing good source %s:\n%s", good.URL, report)
	}
}

func TestSearchJSONParse(t *testing.T) {
	urls, err := parseSearch([]byte(`{"results":[{"url":"http://a"}]}`))
	if err != nil {
		t.Fatalf("parseSearch err: %v", err)
	}
	if len(urls) != 1 || urls[0] != "http://a" {
		t.Fatalf("urls = %v, want [http://a]", urls)
	}
}

type stubFetcher struct {
	text string
}

func (s stubFetcher) Recognize(raw string) capture.Share { return capture.Share{URL: raw} }
func (s stubFetcher) Fetch(share capture.Share) capture.Fetched {
	return capture.Fetched{URL: share.URL, Text: s.text}
}
func (s stubFetcher) MediaMeta(share capture.Share) capture.Fetched {
	return capture.Fetched{URL: share.URL, Text: s.text}
}

func TestFetchAndClipWithInjectedFetcher(t *testing.T) {
	r := &Runner{
		Fetcher:   stubFetcher{text: "stubbed content "},
		ClipChars: 30,
	}
	got := r.fetchAndClip([]string{"http://a", "http://b", "http://c"})
	if got != "stubbed content stubbed conten" {
		t.Fatalf("got %q, want %q", got, "stubbed content stubbed conten")
	}
}

