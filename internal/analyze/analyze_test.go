package analyze

import (
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

func TestAnalyzeParsesArray(t *testing.T) {
	st := stubServer(http.StatusOK, `[{"title":"A","summary":"sum A","horizon":"short-term","tags":["go"],"links":["u1"]},{"title":"B","summary":"sum B","horizon":"lifetime","tags":[],"links":[]}]`)
	defer st.Close()

	ideas, err := newStubbed(st, "").Analyze(capture.Fetched{Title: "t"})
	if err != nil {
		t.Fatalf("Analyze err: %v", err)
	}
	if len(ideas) != 2 {
		t.Fatalf("len = %d, want 2", len(ideas))
	}
	if ideas[0].Title != "A" || ideas[0].Summary != "sum A" || ideas[0].Horizon != "short-term" {
		t.Fatalf("ideas[0] = %+v", ideas[0])
	}
	if len(ideas[0].Tags) != 1 || ideas[0].Tags[0] != "go" || ideas[0].Links[0] != "u1" {
		t.Fatalf("ideas[0] tags/links = %+v %+v", ideas[0].Tags, ideas[0].Links)
	}
	if ideas[1].Horizon != "lifetime" {
		t.Fatalf("ideas[1].Horizon = %q", ideas[1].Horizon)
	}
}

func TestAnalyzeEmptyResult(t *testing.T) {
	st := stubServer(http.StatusOK, `[]`)
	defer st.Close()

	_, err := newStubbed(st, "").Analyze(capture.Fetched{})
	if !errors.Is(err, ErrInvalidResponse) {
		t.Fatalf("err = %v, want ErrInvalidResponse", err)
	}
}

func TestAnalyzeMalformed(t *testing.T) {
	st := stubServer(http.StatusOK, `{"x":1}`)
	defer st.Close()

	_, err := newStubbed(st, "").Analyze(capture.Fetched{})
	if !errors.Is(err, ErrInvalidResponse) {
		t.Fatalf("err = %v, want ErrInvalidResponse", err)
	}
}

func TestAnalyzeFencedJSON(t *testing.T) {
	st := stubServer(http.StatusOK, "```json\n[{\"title\":\"F\",\"summary\":\"s\",\"horizon\":\"short-term\",\"tags\":[],\"links\":[]}]\n```")
	defer st.Close()

	ideas, err := newStubbed(st, "").Analyze(capture.Fetched{})
	if err != nil {
		t.Fatalf("Analyze err: %v", err)
	}
	if len(ideas) != 1 || ideas[0].Title != "F" {
		t.Fatalf("ideas = %+v", ideas)
	}
}

func TestExtractJSONFenced(t *testing.T) {
	ideas, err := ExtractJSON("```json\n[{\"title\":\"F\",\"summary\":\"s\",\"horizon\":\"short-term\",\"tags\":[],\"links\":[]}]\n```")
	if err != nil {
		t.Fatalf("ExtractJSON err: %v", err)
	}
	if len(ideas) != 1 || ideas[0].Title != "F" {
		t.Fatalf("ideas = %+v", ideas)
	}
}

func TestExtractJSONWrapper(t *testing.T) {
	ideas, err := ExtractJSON(`{"ideas":[{"title":"W","summary":"s","horizon":"lifetime","tags":[],"links":[]}]}`)
	if err != nil {
		t.Fatalf("ExtractJSON err: %v", err)
	}
	if len(ideas) != 1 || ideas[0].Title != "W" {
		t.Fatalf("ideas = %+v", ideas)
	}
}

func TestPromptForContainsCaption(t *testing.T) {
	p := promptFor(capture.Fetched{Caption: "my caption text"})
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

	_, _ = newStubbed(st, "secret-key").Analyze(capture.Fetched{})
	if got != "Bearer secret-key" {
		t.Fatalf("Authorization = %q, want %q", got, "Bearer secret-key")
	}
}

func TestAnalyzeServerError(t *testing.T) {
	st := stubServer(http.StatusInternalServerError, "")
	defer st.Close()

	_, err := newStubbed(st, "").Analyze(capture.Fetched{})
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
