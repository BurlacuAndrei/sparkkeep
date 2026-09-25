package analyze

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"sparkkeep/internal/capture"
	"sparkkeep/internal/config"
)

// stubServer returns an httptest server answering /chat/completions with a
// chat response whose message content is the given string (200), or a bare
// status when non-200.
func stubServer(status int, content string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if status != http.StatusOK {
			w.WriteHeader(status)
			return
		}
		fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`, strconv.Quote(content))
	}))
}

func newStubbed(st *httptest.Server, key string) *Client {
	return New(config.Config{LLMBase: st.URL, LLMModel: "stub", LLMKey: key}, st.Client())
}

func TestAnalyzeParsesBriefing(t *testing.T) {
	jsonPayload := `{
		"executive_summary": "High performance vector database for local models.",
		"value_proposition": "Allows fast semantic search completely offline.",
		"proposed_actions": ["Download the repo", "Run the local benchmark"],
		"cards": [
			{"title":"Deploy Qdrant","summary":"Setup local docker container","horizon":"short-term","tags":["vector","db"],"links":["https://example.com"]},
			{"title":"Long term migration","summary":"Evaluate lifetime durability","horizon":"lifetime","tags":["arch"],"links":[]}
		]
	}`
	st := stubServer(http.StatusOK, jsonPayload)
	defer st.Close()

	res, err := newStubbed(st, "").Analyze(context.Background(), capture.Fetched{Title: "Vector DBs"})
	if err != nil {
		t.Fatalf("Analyze err: %v", err)
	}
	if res.ExecutiveSummary != "High performance vector database for local models." {
		t.Errorf("ExecutiveSummary = %q", res.ExecutiveSummary)
	}
	if res.ValueProposition != "Allows fast semantic search completely offline." {
		t.Errorf("ValueProposition = %q", res.ValueProposition)
	}
	if len(res.ProposedActions) != 2 || res.ProposedActions[0] != "Download the repo" {
		t.Errorf("ProposedActions = %+v", res.ProposedActions)
	}
	if len(res.Cards) != 2 {
		t.Fatalf("len(Cards) = %d, want 2", len(res.Cards))
	}
	if res.Cards[0].Title != "Deploy Qdrant" || res.Cards[0].Horizon != "short-term" {
		t.Errorf("Cards[0] = %+v", res.Cards[0])
	}
	if res.Cards[1].Horizon != "lifetime" {
		t.Errorf("Cards[1].Horizon = %q", res.Cards[1].Horizon)
	}
}

func TestAnalyzeParsesArray(t *testing.T) {
	st := stubServer(http.StatusOK, `[{"title":"A","summary":"sum A","horizon":"short-term","tags":["go"],"links":["u1"]},{"title":"B","summary":"sum B","horizon":"lifetime","tags":[],"links":[]}]`)
	defer st.Close()

	res, err := newStubbed(st, "").Analyze(context.Background(), capture.Fetched{Title: "t"})
	if err != nil {
		t.Fatalf("Analyze err: %v", err)
	}
	if len(res.Cards) != 2 {
		t.Fatalf("len = %d, want 2", len(res.Cards))
	}
	if res.Cards[0].Title != "A" || res.Cards[0].Summary != "sum A" || res.Cards[0].Horizon != "short-term" {
		t.Fatalf("cards[0] = %+v", res.Cards[0])
	}
	if len(res.Cards[0].Tags) != 1 || res.Cards[0].Tags[0] != "go" || res.Cards[0].Links[0] != "u1" {
		t.Fatalf("cards[0] tags/links = %+v %+v", res.Cards[0].Tags, res.Cards[0].Links)
	}
	if res.Cards[1].Horizon != "lifetime" {
		t.Fatalf("cards[1].Horizon = %q", res.Cards[1].Horizon)
	}
	if res.ExecutiveSummary != "sum A" {
		t.Errorf("ExecutiveSummary fallback = %q, want sum A", res.ExecutiveSummary)
	}
}

func TestAnalyzeEmptyResult(t *testing.T) {
	st := stubServer(http.StatusOK, `[]`)
	defer st.Close()

	_, err := newStubbed(st, "").Analyze(context.Background(), capture.Fetched{})
	if !errors.Is(err, ErrInvalidResponse) {
		t.Fatalf("err = %v, want ErrInvalidResponse", err)
	}
}

func TestAnalyzeMalformed(t *testing.T) {
	st := stubServer(http.StatusOK, `{"x":1}`)
	defer st.Close()

	_, err := newStubbed(st, "").Analyze(context.Background(), capture.Fetched{})
	if !errors.Is(err, ErrInvalidResponse) {
		t.Fatalf("err = %v, want ErrInvalidResponse", err)
	}
}

func TestAnalyzeFencedJSON(t *testing.T) {
	st := stubServer(http.StatusOK, "```json\n[{\"title\":\"F\",\"summary\":\"s\",\"horizon\":\"short-term\",\"tags\":[],\"links\":[]}]\n```")
	defer st.Close()

	res, err := newStubbed(st, "").Analyze(context.Background(), capture.Fetched{})
	if err != nil {
		t.Fatalf("Analyze err: %v", err)
	}
	if len(res.Cards) != 1 || res.Cards[0].Title != "F" {
		t.Fatalf("cards = %+v", res.Cards)
	}
}

func TestExtractJSONFenced(t *testing.T) {
	res, err := ExtractJSON("```json\n[{\"title\":\"F\",\"summary\":\"s\",\"horizon\":\"short-term\",\"tags\":[],\"links\":[]}]\n```")
	if err != nil {
		t.Fatalf("ExtractJSON err: %v", err)
	}
	if len(res.Cards) != 1 || res.Cards[0].Title != "F" {
		t.Fatalf("cards = %+v", res.Cards)
	}
}

func TestExtractJSONWrapper(t *testing.T) {
	res, err := ExtractJSON(`{"ideas":[{"title":"W","summary":"s","horizon":"lifetime","tags":[],"links":[]}]}`)
	if err != nil {
		t.Fatalf("ExtractJSON err: %v", err)
	}
	if len(res.Cards) != 1 || res.Cards[0].Title != "W" {
		t.Fatalf("cards = %+v", res.Cards)
	}
}

func TestPromptForContainsBriefing(t *testing.T) {
	p := promptFor(capture.Fetched{Title: "Test Title", Caption: "my caption text"})
	if !strings.Contains(p, "executive_summary") || !strings.Contains(p, "value_proposition") || !strings.Contains(p, "proposed_actions") {
		t.Fatalf("prompt missing briefing schema:\n%s", p)
	}
	if !strings.Contains(p, "CAPTION:") || !strings.Contains(p, "my caption text") {
		t.Fatalf("prompt missing caption:\n%s", p)
	}
}

func TestAuthorizationHeader(t *testing.T) {
	var got string
	st := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"choices":[{"message":{"content":"[]"}}]}`)
	}))
	defer st.Close()

	_, _ = newStubbed(st, "secret-key").Analyze(context.Background(), capture.Fetched{})
	if got != "Bearer secret-key" {
		t.Fatalf("Authorization = %q, want %q", got, "Bearer secret-key")
	}
}

func TestAnalyzeServerError(t *testing.T) {
	st := stubServer(http.StatusInternalServerError, "")
	defer st.Close()

	_, err := newStubbed(st, "").Analyze(context.Background(), capture.Fetched{})
	if err == nil || errors.Is(err, ErrInvalidResponse) {
		t.Fatalf("err = %v, want non-ErrInvalidResponse error", err)
	}
}

func TestHorizonConstraint(t *testing.T) {
	_, err := ExtractJSON(`[{"title":"x","summary":"y","horizon":"bogus","tags":[],"links":[]}]`)
	if !errors.Is(err, ErrInvalidResponse) {
		t.Fatalf("err = %v, want ErrInvalidResponse", err)
	}
}

func TestDefaultClientBoundedDial(t *testing.T) {
	c := New(config.Config{LLMBase: "http://127.0.0.1:1", LLMModel: "stub"}, nil)
	tr, ok := c.HTTP.Transport.(*http.Transport)
	if !ok {
		t.Fatalf("default client Transport = %T, want *http.Transport", c.HTTP.Transport)
	}
	if tr.DialContext == nil {
		t.Fatal("default client Transport has no DialContext: response time is intentionally unbounded, but connection establishment must still be bounded so a dead endpoint fails at connect")
	}
}
