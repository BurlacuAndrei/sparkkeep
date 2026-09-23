# 040 — research: bounded research loop

## Goal
"Investigate this" on a card runs a deterministic, bounded pipeline that
produces a markdown findings report: build query → search (SearXNG JSON) →
fetch top N (reuse `capture.Fetch`) → clip to budget → ONE synthesis LLM
call → persist + notify. Hard stops everywhere; no agents, no recursion.

## Context
- Read `docs/design.md` §6 first.
- Reuses `capture.Fetch` (task 020) and the LLM `Client` (task 030). No new
  HTTP client; search is parsed from SearXNG JSON API.
- SearXNG returns JSON at `{Base}/search?q=…&format=json`; field of interest
  is `.results[].url`.

## Files
- Create `internal/research/research.go`
- Create `internal/research/research_test.go`

## Interface
```go
package research

type Runner struct {
    SearchURL string // e.g. http://localhost:8080/search or cleared for dev
    Client    *http.Client
    LLM       *analyze.Client
    MaxResults   int // 6
    ClipChars    int // 8000
    Timeout      time.Duration // 120s
}

// Run executes one research pass for a card and returns the findings
// markdown (not yet persisted or notified — caller/core decides).
func (r *Runner) Run(ctx context.Context, card port.Card) (string, error)
```
- `New(defaults)` helper sets the four knobs to the design defaults; tests
  override them (small `MaxResults`, short `Timeout`) so they run fast.

## Pipeline steps (in `Run`)
1. **Build query** — one call `LLM.Analyze` on a prompt:
   `"Create a concise web search query for investigating this idea. Reply
   with one line: the query."` Card inputs: `Title`, `Summary`, `Links[0]`
   (from `Idea` — for the research trigger we have `port.Card`; use
   `Title`+`Summary`+`SourceURL`). Trim + take first non-empty line.
2. **Search** — `GET {SearchURL}?q={url.QueryEscape(query)}&format=json`
   (headers: none). Suppose non-200 → error. Parse JSON → up to
   `MaxResults` result URLs. (Handle the `format=json` param only if
   `SearchURL` is set; if empty, use synthetic local results for dev-only —
   but for tests always set it to a `httptest.Server`.)
3. **Fetch+clip** — for each URL (sequentially, to stay polite), call
   `capture.Fetch(capture.Share{Name:"link", URL:u})`; append `.Text` to a
   buffer, clipped so total ≤ `ClipChars` (`ponytail: one flat budget, no
   per-source balancing —① fine for a handful of sources`). Skip fetch
   errors (don't fail the run).
4. **Synthesize** — `LLM.Analyze` again with prompt:
   `"Synthesize findings into actionable markdown report. Structure:
   ## Findings, ## Sources, ## Next steps. Max 600 words. Source URLs:
   {list}. Context: {title}\n{summary}"` → write `.Text` (strip title prefix)
   as the report body.
5. **Timeout** — wrap everything in `context.WithTimeout(ctx, r.Timeout)`.
   On timeout, return (err would be ctx deadline exceeded); caller maps to
   `failed` research row.

**Never panic on search/LLM/parse error** — surface as `error` so core can
mark the research row `failed` with the message.

## Tests (`research_test.go`)
- `TestRunSearchNoResults` — `httptest.Server` returns `{"results":[]}` ⇒
  `Run` returns error (empty results → error), not a nil report.
- `TestRunOk` — scripted search returns 1 result → URL serves
  `"source text here"`; stub LLM (both query & synthesis) answers viable
  JSON via `httptest`. Assert report contains `## Findings` and the source
  URL, and total fetched text was clipped to `ClipChars` when source is long
  (serve `strings.Repeat("a", 20000)`, set `ClipChars=100`, assert report
  body shorter than raw).
- `TestRunLLMQueryFail` — query step returns error ⇒ `Run` returns error.
- `TestRunContextTimeout` — set `Timeout=10ms`, search server sleeps ⇒ error
  is context/Timeout (but does not hang CI; keep server sleep < test timeout).
- `TestRunSkipsFetchErrors` — include one result URL that 404s alongside a
  valid one; run completes and report still contains the good source.
- `TestSearchJSONParse` — feed `{"results":[{"url":"http://a"}]}` via helper
  func `parseSearch(body)` directly (export or package-internal test).

## Definition of done
- `go build`, `go vet`, `make test` pass; `gofmt -l .` empty.
- Commit: `feat: bounded research loop (search→fetch→synthesize)`.