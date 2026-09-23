# 020 — capture: link recognition + fetching + yt-dlp metadata

## Goal
Identify what a user shared (bare text, link, media link) and fetch all
best-effort content into a normalized payload for the analyzer. Failure to
fetch must never break the pipeline — it degrades to the raw text.

## Context
- Read `docs/design.md` §4 first.
- Consumes the `port` types (Card-ish inputs are NOT stored here; this
  package only recognizes/fetches).
- `yt-dlp` is an external binary used as a subprocess (`ponytail: the only
  subprocess; swap for Go libs if metadata needs grow past title/desc`).

## Files
- Create `internal/capture/capture.go`
- Create `internal/capture/capture_test.go`

## Behavior

**Recognize (`capture.Recognize(raw string) (capture.Share, error)`)**
Classify the incoming share:
- `Share.Link` — if raw contains a single `http(s)://…` URL (regex). The URL
  is extracted and used as `Share.URL`.
- `Share.Caption` — the full raw text, kept verbatim (this is the
  pasted caption path for IG/FB).
- `Share.Name` — `"link"` | `"text"`
`Recognize` fills both fields; a shared URL with a trailing caption keeps
URL + caption. A bare non-URL string yields `Name=="text"` and `Caption==raw`.

**Fetch (`capture.Fetch(share) (capture.Fetched, error)`)**
Best-effort, time-boxed (5s via `context.WithTimeout`):
- `Fetched.Title`, `Fetched.Description`, `Fetched.Text` — from HTTP GET of
  `Share.URL`:
  - parse `<title>` and `<meta name="description">` from HTML
    (stdlib `golang.org/x/net/html`? — avoid; use `regexp` for `<title>` and
    meta description/summary only. `ponytail: regex-only HTML sniffing here;
    a real HTML parser only if description extraction ever must be exact`).
  - `Text`: fetch body, pass through `stripTagsAndCondense` helper built on
    `regexp` stripping `<[^>]*>`, `\n{3,}` collapse, and a 4000-char cap.
- On timeout / non-200 / non-HTML body: do NOT error — return a `Fetched`
  where `Text=""` and `Err!=nil`; caller decides to fall back to caption.
- If `Name=="text"` (no URL), `Fetch` returns `Fetched{Text: Caption}` and
  nil error directly.

**Media metadata (`capture.MediaMeta(share) (capture.Fetched, error)`)**
If `Share.URL` looks like YouTube/Instagram (host contains `youtube`/`youtu.be`/`instagram`/`facebook`):
- run `yt-dlp --skip-download --dump-json --no-warnings <url>` (5s timeout).
- parse JSON for `title` and `description`; map to `Fetched.Title`/`Description`.
- `ponytail: only title+description extracted; transcripts/thumbnails are a
  v2 need, add when you actually want them`.
Otherwise return the HTTP fetch result.

## Interface (what downstream `analyze` will consume)
```go
package capture

type Share struct {
    Name    string // "link" | "text"
    URL     string
    Caption string // full raw text (pasted-caption path)
}

type Fetched struct {
    Name        string // matches Share.Name
    URL         string
    Title       string
    Description string
    Text        string
    Err         error  // nil unless fetch failed
}

func Recognize(raw string) Share
func Fetch(share Share) Fetched // NEVER returns a hard error that aborts a caller
func MediaMeta(share Share) Fetched
```
Keep these exact signatures; `analyze`/`core` will call them.

## Tests (`capture_test.go`)
- `TestRecognizeLink` — raw with URL ⇒ `Name=="link"`, `URL` correct, `Caption` empty.
- `TestRecognizeLinkWithCaption` — URL + text ⇒ both `URL` and `Caption` set, `Name=="link"`.
- `TestRecognizeText` — no URL ⇒ `Name=="text"`, `Caption==raw`.
- `TestFetchText` — `httptest.Server` returning `<title>X</title><p>hello</p>` ⇒ Title=="X", Text contains "hello".
- `TestFetchTimeoutPeerError` — server that never writes (sleep 2s in handler) ⇒ `Fetched.Err != nil` after ~5s, no block hang (use short via injected context).
- `TestFetchNonHTML` — body is `"not html"` ⇒ no error, `Text` is the raw body.
- `TestMediaMetaYTDLPStub` — set env `SPARKKEEP_YTDLP` to point at a fake script (`#!/bin/sh` emitting `{"title":"T","description":"D"}`), invoke `MediaMeta` with a youtube URL ⇒ Title=="T", Description=="D". Use `t.Setenv`.
- `TestStripTags` — `<b>hi</b>\n\n\nworld` ⇒ `"hi\nworld\n"` (no `<>` remnants, ≤1 blank line).

## Definition of done
- `go build`, `go vet`, `make test` pass; `gofmt -l .` empty.
- Commit: `feat: capture recognition + best-effort fetch + yt-dlp meta`.