# 030 — analyze: LLM client + split/classify

## Goal
Single OpenAI-compatible chat call that turns captured content into a JSON
array of idea cards (title, short summary, horizon, tags, links). Strict
parse + validation so a malformed LLM response fails loudly and retryable.

## Context
- Read `docs/design.md` §4 first.
- Bridges `capture.Fetched` → `[]port.Card` (cards created later by `core`;
  here we produce the *intent* payloads).
- Self-contained LLM config: reads `config.Config` fields `LLMBase`,
  `LLMKey`, `LLMModel`, `MaxAnalyzeTokens` (fallback 2048).
- Uses stdlib `net/http` + `encoding/json`; no SDK installed.

## Files
- Create `internal/analyze/analyze.go`
- Create `internal/analyze/analyze_test.go`

## Interface
```go
package analyze

type Idea struct {
    Title   string   `json:"title"`
    Summary string   `json:"summary"`
    Horizon string   `json:"horizon"` // "short-term" | "lifetime"
    Tags    []string `json:"tags"`
    Links   []string `json:"links"`
}

// New returns a client bound to the endpoint/key/model.
func New(cfg config.Config, forceClient *http.Client) *Client

type Client struct { … } // holds BaseURL, APIKey, Model, MaxTokens, HTTP

// Analyze turns a Fetched payload into ideas. ErrInvalidResponse if the
// model answer is not a valid, non-empty JSON array (or array len 0).
func (c *Client) Analyze(payload capture.Fetched) ([]Idea, error)
```
- `New` should swap in `forceClient` (for tests) or default `&http.Client{
  Timeout: 60 * time.Second }`.

## Behavior
- Build prompt in `func promptFor(payload capture.Fetched) string`:
  ```
  You receive a captured internet post. Split it into every distinct idea,
  tool, or takeaway. One JSON object per card; if one idea, exactly one
  object; never merge; never drop. Return ONLY a JSON array of objects:
  [{"title":"short headline","summary":"2-3 lines","horizon":"short-term","tags":["≤5 lowercase"],"links":["original or sources"]}]
  horizon="lifetime" when it is a long-horizon bucket item/trip/plan;
  "short-term" when actionable now. If media metadata, incorporate it into
  every card. Source:
  TITLE: {Title}
  DESCRIPTION: {Description}
  BODY: {Text}
  CAPTION: {Caption}
  ```
- Make the POST to `{BaseURL}/chat/completions` with:
  ```json
  {"model":"{model}","messages":[{"role":"system","content":"You are a curator that returns strict JSON."},{"role":"user","content":"{prompt}"}],"response_format":{"type":"json_object"},"max_tokens":{max}, "temperature":0.3}
  ```
  Header `Authorization: Bearer {key}` if `Key != ""` (Ollama needs none).
- Pipe the raw `choices[0].message.content` through `ExtractJSON`.
- **`ExtractJSON`** (`func ExtractJSON(s string) ([]Idea, error)`): trim; if
  content starts with `{` (`response_format json_object` wrappers), assume
  single-idea wrapper `{"ideas":[...]}` unwrap or accept object direct;
  robustly handle the model returning ```` ```json ```` fences — strip
  backtick fences, leading `json`, and whitespace. Return an error (no
  partial parse) when JSON is not an array of these objects.

## Tests (`analyze_test.go`) — all via `httptest.Server` (no live LLM)
- `TestAnalyzeParsesArray` — stub returns 2 valid objects ⇒ 2 `Idea`s, fields parsed.
- `TestAnalyzeEmptyResult` — stub returns `[]` ⇒ `ErrInvalidResponse`.
- `TestAnalyzeMalformed` — stub returns `{"x":1}` ⇒ `ErrInvalidResponse`.
- `TestAnalyzeFencedJSON` — stub returns array wrapped in ```` ```json ```` ⇒ still parses.
- `TestExtractJSONFenced` — input with backtick fences parses.
- `TestPromptForContainsCaption` — payload with Caption leads to prompt containing `CAPTION:` and the caption text.
- `TestAuthorizationHeader` — client with Key sets `Authorization` header on request.
- `TestAnalyzeServerError` — stub returns 500 ⇒ error (not `ErrInvalidResponse`).
- Test that `Idea.Horizon` is validated: `TestHorizonConstraint` — Extracted object with `horizon:"bogus"` ⇒ error.

## Definition of done
- `go build`, `go vet`, `make test` pass; `gofmt -l .` empty.
- Commit: `feat: OpenAI-compatible analyze client + strict JSON parse`.