# 050 — core: capture → cards handler

## Goal
The single orchestration entry point. Incoming share → recognize → fetch →
analyze → store cards → notify channel. Also `Retry` (re-analyze a failed
card) and `Research(trigger)` orchestration using the research runner.
Everything wired into one `core.Service` consuming `port.Store`,
`port.Channel`, `capture`, `analyze`.

## Context
- Read `docs/design.md` §4–§6 first.
- Consumes interfaces from tasks 000 (port), 010 (store impl), 020
  (capture), 030 (analyze), 040 (research). Implements the *controller*
  layer — no HTTP, no Telegram, no persistence decisions here.

## Files
- Create `internal/core/core.go`
- Create `internal/core/core_test.go`

## Interface
```go
package core

type Service struct {
    Store   port.Store
    Channel port.Channel
    Capture capture.Fetcher // interface w/ Recognize+Fetch+MediaMeta
    Analyze *analyze.Client
    Research *research.Runner
    Logf func(format string, args ...any) // default log.Printf
}

// New constructs a Service. It does not wire Telegram — Channel can be nil
// until the adapter is attached (web/main wires it). cfg is used for the
// analyze client and logger.
func New(st port.Store, cfg config.Config, logf func(format string, args ...any)) *Service

// Capture: recognize → fetch → mediaMeta → analyze → persist each card →
// notify each. Returns ids of created cards.
func (s *Service) Capture(ctx context.Context, raw string) ([]int64, error)

// ResearchData: store research row 'queued', run research, set result,
// notify research_done/failed. Service method so anything can trigger it.
func (s *Service) Research(ctx context.Context, cardID int64) error

// Retry: re-run analyze on a card's saved SourceURL/SourceNote, update
// the card row, notify. Returns the updated card.
func (s *Service) Retry(ctx context.Context, cardID int64) (port.Card, error)
```

**`capture.Fetcher`** — interface that `core` consumes (fulfilled by the
struct from task 020, easy to stub in tests):
```go
package capture
type Fetcher interface {
    Recognize(raw string) Share
    Fetch(share Share) Fetched
    MediaMeta(share Share) Fetched
}
```
(If task 020 exported a concrete `Capture` struct, make a tiny adapter in
this package so `core` depends on the interface; do not modify 020's
signatures.)

## Behavior (Capture)
1. `Share = Capture.Recognize(raw)`.
2. If `Share.Name=="link"`: `Fetched = Capture.MediaMeta(share)`; if its
   description/text are empty, also run `Capture.Fetch(share)` and merge
   non-empty fields. If `Share.Name=="text"`: `Fetched = Capture.Fetch(share)`
   (returns just the caption).
3. `ideas, err = Analyze.Analyze(fetched)`.
   - On error: create one card `{Title:"Analysis failed", Summary:…,
     Status:inbox, SourceURL, SourceNote: raw}` — the "failed-show source +
     retry button" path. Notify with `Kind:"analysis_failed"` and return
     its id (no hard error — the pipeline must never break on LLM failure).
   - On success: for each `Idea`, build `port.Card{Horizon, Tags, Title,
     Summary, SourceURL: fetched.URL or first link, Status: inbox}`; store;
     `Channel.Notify(ctx, Notification{Kind:"created", Card: card})`. All
     cards stored even if a later one's notify fails.
4. Short-circuit: if no `Idea` (len 0) after Analyze success — do not create
   card, return `([]int64{}, nil)`.

## Behavior (Retry)
- Load card; re-run `Analyze` on a `Fetched{U Title/U SourceURL/U SourceNote}`
  built from stored fields; on success update the card row with first Idea's
  Title/Summary/Horizon/Tags; on failure keep card but return error.
- `Channel.Notify(Kind:"done", Card: updated)` on success.

## Behavior (Research)
- Check card exists (`port.ErrNotFound` → return).
- `row, err = Store.CreateResearch(ctx, cardID, "")`.
- `findings, err = Research.Run(ctx, card)`:
  - success → `Store.SetResearch(..., "done", findings, "")` + notify
    `Kind:"research_done", Res:&row, Text:"Research complete"`.
  - error → `Store.SetResearch(..., "failed", "", err.Error())` + notify
    `Kind:"research_failed", Res:&row, Text:err.Error()`. Never panic.

## Tests (`core_test.go`) — stub Store & Channel (in-memory), stub sharing
`ShareFetcher` interface, `analyze.Client` with `httptest`.
- `TestCaptureTextSingleIdea` — analyze stub returns 1 idea → 1 card stored,
  `Kind:"created"` notify, correct Horizon/Tags.
- `TestCaptureMultiIdeaSplits` — 3 ideas → 3 cards, 3 notifies.
- `TestCaptureAnalysisFailDegrades` — LLM 500 → card stored (`Title:
  "Analysis failed"`), notify `Kind:"analysis_failed"`, `err==nil`.
- `TestCaptureZeroIdeasNoCard` — analyze returns `[]` → no card, no notify.
- `TestCaptureTextIsSourceNote` — raw non-URL → caption lands in
  `SourceNote`, `SourceURL==""`.
- `TestRetrySuccessUpdatesCard` — after initial fail card, retry with working
  LLM → card updated, `Kind:"done"`.
- `TestResearchSuccessNotifyDone` — stub search+LLM → research row status
  `"done"`, notify `Kind:"research_done"`.
- `TestResearchFailNotifyFailed` — LLM errors → row `"failed"`, notify
  `Kind:"research_failed"`.
- `TestCaptureNotifyErrorStillStores` — Channel.Notify returns error → cards
  still stored, Capture returns nil error.

## Definition of done
- `go build`, `go vet`, `make test` pass; `gofmt -l .` empty.
- Commit: `feat: core orchestration (capture, research, retry)`.