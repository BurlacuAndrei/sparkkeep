# Multimodal Ingestion & Knowledge Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept text, links, images, audio, video, and files via Telegram or a web drop box; resolve each to real content (image vision, YouTube transcripts, whisper audio); never present non-content as content; and expose all cards as a navigable tag graph.

**Architecture:** The existing one-way pipeline (`Recognize → Fetch → Analyze → Store → Notify`) is text-only solely because `capture.Share` can express two kinds. This widens `Share` and `Fetched` rather than adding a second pipeline. `Fetched.Notes []string` is the root-cause fix for the login-wall bug: anything that is not real content becomes a Note and is never promoted into `Text`.

**Tech Stack:** Go 1.26 (stdlib-only: `image`, `image/draw`, `mime/multipart`), `chromedp` (existing), `yt-dlp` (existing container binary), React 18 + Vite + TypeScript + `lucide-react` (existing), SQLite via `modernc.org/sqlite` (existing). **No new Go or npm dependencies.**

**Spec:** `docs/superpowers/specs/2026-10-01-multimodal-ingestion-design.md`

## Global Constraints

- **No new Go module dependencies.** `go.mod` must be unchanged by this work. Stdlib only for decoding, scaling, multipart, and VTT parsing.
- **No new npm dependencies.** The graph is hand-rolled SVG; icons come from the existing `lucide-react`.
- **No database migrations and no new tables.** The graph is derived from `cards`, `tags`, `cards_tags` at request time.
- **`Service.Capture(ctx, raw string)` keeps its exact signature**, so the twelve `svc.Capture(...)` call sites in `internal/core/core_test.go` need no changes. The `Name`→`Kind` rename does force a handful of unrelated test lines to be edited (enumerated in Task 2); no test's behaviour changes.
- **Anything that is not real content becomes a `Fetched.Notes` entry, never `Fetched.Text`.** This is the invariant that fixes the Instagram login-wall bug; no code path may promote a login wall, error page, or bot-detection string into `Text`.
- **No application-level authentication.** Traefik with `authelia@docker` already fronts every route.
- Config keys, exact defaults: `SPARKKEEP_ASR_URL=http://whisper:9000`, `SPARKKEEP_ASR_MODEL=` (empty), `SPARKKEEP_VISION_MODEL=` (falls back to `SPARKKEEP_LLM_MODEL`), `SPARKKEEP_COOKIES_FILE=` (empty), `SPARKKEEP_UPLOAD_DIR=` (falls back to `<dir(DB)>/uploads`), `SPARKKEEP_MAX_UPLOAD_MB=25`, `SPARKKEEP_TRANSCRIPT_LANGS=en.*,en`.
- Degradation strings are fixed and user-visible: `metadata unavailable`, `no transcript available`, `instagram caption unavailable`, `instagram login wall — caption unavailable`, `audio not transcribed`, `video: audio extraction unavailable`, `image unreadable`, `pdf: text not extracted`.
- Every non-trivial function added leaves a runnable check behind (`go test`). No new test frameworks.

## Review Focus

The five input classes most likely to bite a user, each pinned to a task below:

1. **A YouTube video with no subtitles at all.** Expected: a card still appears, carrying title and description, with the note `no transcript available` — never an empty card, never a fabricated transcript.
2. **An Instagram post with no cookies configured.** Expected: graceful note, card still created, no login-wall text in the card summary. This is the exact bug being fixed.
3. **A 12MP phone photo.** Expected: a card, and a `Describe` call that does not hang the request for minutes.
4. **An oversized upload (e.g. a 200MB video).** Expected: HTTP 413 and no partial file left on disk.
5. **A graph request over a large library (thousands of cards).** Expected: response in well under a second, not a runaway cross-product — tag co-occurrence must be filtered to a weight threshold, not emitted pairwise without limit.

---

## File Structure

**Created:**
- `internal/asr/asr.go` — whisper `/transcribe` client. One responsibility: audio bytes in, transcript string out.
- `internal/asr/asr_test.go` — multipart request shape against `httptest`.
- `internal/capture/media.go` — subtitles, Instagram caption, login-wall detection, media kind classification.
- `internal/capture/media_test.go` — tests for the above.
- `internal/store/graph.go` — graph queries (tag co-occurrence, tag list).
- `internal/store/graph_test.go`
- `internal/web/capture.go` — `POST /api/v1/capture`, `GET /api/v1/media/{name}`.
- `internal/web/graph.go` — `GET /api/v1/graph`, node/edge types.
- `internal/web/capture_test.go`, `internal/web/graph_test.go`
- `frontend/src/components/CaptureBox.tsx` — drop zone, paste, file picker, mic recorder.
- `frontend/src/components/GraphView.tsx` — SVG force simulation.
- `docs/superpowers/specs/2026-10-01-multimodal-ingestion-design.md` (already written)

**Modified:**
- `internal/port/model.go` — `GraphNode`, `GraphEdge`, `Graph` types.
- `internal/config/config.go` + `config_test.go` — seven new fields.
- `internal/capture/capture.go` — `Share.Kind`, `Share.Files`, `File`, `Fetched` new fields, `MediaMeta` cookies+transcript, headless login-wall guard.
- `internal/capture/fetcher.go` — `Fetcher` interface widened.
- `internal/analyze/analyze.go` — `doCompletion` multimodal messages, `Describe`, `promptFor`.
- `internal/analyze/analyze_test.go`
- `internal/core/core.go` — `CaptureShare`, `Capture` wrapper, `captureFromFile`, `persistUpload`.
- `internal/channel/telegram/telegram.go` — `Voice`/`Audio`/`Document`/`Video` fields, `ShareFromUpdate`, `getFile`.
- `internal/channel/telegram/telegram_test.go`
- `internal/web/web.go` — `api` struct gains `uploadDir`, `maxUpload`, route registration.
- `frontend/src/types.ts`, `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/components/Header.tsx`, `frontend/src/App.css`
- `Dockerfile` — `apk add ffmpeg`
- `.env.example`, `README.md`

---

## Task 1: Config

**Files:**
- Modify: `internal/config/config.go`
- Test: `internal/config/config_test.go`

**Interfaces:**
- Produces: `config.Config` gains `ASRURL string`, `ASRModel string`, `VisionModel string`, `CookiesFile string`, `UploadDir string`, `MaxUploadMB int`, `TranscriptLangs string`. Every later task reads these.

- [ ] **Step 1: Read the existing config test to match its style**

```bash
sed -n '1,40p' internal/config/config_test.go
```

Note: the existing test sets `SPARKKEEP_LLM_MODEL` (required by `Load`) — new tests must do the same or `Load` errors.

- [ ] **Step 2: Write the failing test**

Append to `internal/config/config_test.go`:

```go
func TestLoadMultimodalDefaults(t *testing.T) {
	t.Setenv("SPARKKEEP_LLM_MODEL", "gemma3:4b")
	for _, k := range []string{
		"SPARKKEEP_ASR_URL", "SPARKKEEP_ASR_MODEL", "SPARKKEEP_VISION_MODEL",
		"SPARKKEEP_COOKIES_FILE", "SPARKKEEP_UPLOAD_DIR", "SPARKKEEP_MAX_UPLOAD_MB",
		"SPARKKEEP_TRANSCRIPT_LANGS", "SPARKKEEP_DB",
	} {
		t.Setenv(k, "")
	}
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.ASRURL != DefaultASRURL {
		t.Errorf("ASRURL = %q, want %q", cfg.ASRURL, DefaultASRURL)
	}
	if cfg.ASRModel != "" {
		t.Errorf("ASRModel = %q, want empty", cfg.ASRModel)
	}
	if cfg.VisionModel != "gemma3:4b" {
		t.Errorf("VisionModel = %q, want the LLM model", cfg.VisionModel)
	}
	if cfg.CookiesFile != "" {
		t.Errorf("CookiesFile = %q, want empty", cfg.CookiesFile)
	}
	if cfg.UploadDir == "" {
		t.Error("UploadDir is empty, want <dir(DB)>/uploads")
	}
	if cfg.MaxUploadMB != 25 {
		t.Errorf("MaxUploadMB = %d, want 25", cfg.MaxUploadMB)
	}
	if cfg.TranscriptLangs != "en.*,en" {
		t.Errorf("TranscriptLangs = %q, want %q", cfg.TranscriptLangs, "en.*,en")
	}
}

func TestLoadMultimodalOverrides(t *testing.T) {
	t.Setenv("SPARKKEEP_LLM_MODEL", "gemma3:4b")
	t.Setenv("SPARKKEEP_ASR_URL", "http://elsewhere:9000")
	t.Setenv("SPARKKEEP_MAX_UPLOAD_MB", "5")
	t.Setenv("SPARKKEEP_TRANSCRIPT_LANGS", "ro,en")
	t.Setenv("SPARKKEEP_COOKIES_FILE", "/data/cookies.txt")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.ASRURL != "http://elsewhere:9000" || cfg.MaxUploadMB != 5 ||
		cfg.TranscriptLangs != "ro,en" || cfg.CookiesFile != "/data/cookies.txt" {
		t.Errorf("override not applied: %+v", cfg)
	}
}

func TestLoadBadMaxUploadMB(t *testing.T) {
	t.Setenv("SPARKKEEP_LLM_MODEL", "gemma3:4b")
	t.Setenv("SPARKKEEP_MAX_UPLOAD_MB", "lots")
	if _, err := Load(); err == nil {
		t.Fatal("want error for non-numeric SPARKKEEP_MAX_UPLOAD_MB")
	}
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `go test ./internal/config/ -run Multimodal -v`
Expected: FAIL to compile — `cfg.ASRURL` undefined.

- [ ] **Step 4: Implement**

Add to the `Config` struct in `internal/config/config.go`:

```go
	ASRURL          string
	ASRModel        string
	VisionModel     string
	CookiesFile     string
	UploadDir       string
	MaxUploadMB     int
	TranscriptLangs string
```

Add the constant beside `DefaultSearchURL`:

```go
// DefaultASRURL points at the deployed whisper container on proxy_net. Set
// SPARKKEEP_ASR_URL to empty to disable audio transcription entirely.
const DefaultASRURL = "http://whisper:9000"
```

In `Load`, inside the returned `Config` literal add:

```go
		ASRURL:          getenv("SPARKKEEP_ASR_URL", DefaultASRURL),
		ASRModel:        os.Getenv("SPARKKEEP_ASR_MODEL"),
		CookiesFile:     os.Getenv("SPARKKEEP_COOKIES_FILE"),
		MaxUploadMB:     25, // overridden below if env var is set
		TranscriptLangs: getenv("SPARKKEEP_TRANSCRIPT_LANGS", "en.*,en"),
```

After `cfg.HeadlessEnabled = headless`, add:

```go
	if v := os.Getenv("SPARKKEEP_VISION_MODEL"); v != "" {
		cfg.VisionModel = v
	} else {
		cfg.VisionModel = cfg.LLMModel
	}
	if v := os.Getenv("SPARKKEEP_MAX_UPLOAD_MB"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return Config{}, fmt.Errorf("config: SPARKKEEP_MAX_UPLOAD_MB: %w", err)
		}
		cfg.MaxUploadMB = n
	}
	cfg.UploadDir = os.Getenv("SPARKKEEP_UPLOAD_DIR")
	if cfg.UploadDir == "" {
		cfg.UploadDir = filepath.Join(filepath.Dir(cfg.DB), "uploads")
	}
```

**Placement note:** `cfg.VisionModel` must be assigned *after* the `SPARKKEEP_LLM_MODEL` required-check is satisfied, but that check only returns an error and does not mutate, so assigning from `cfg.LLMModel` in the block above is safe regardless of order within `Load`.

- [ ] **Step 5: Run the full config package tests**

Run: `go test ./internal/config/ -v`
Expected: PASS, all pre-existing tests plus the three new ones.

- [ ] **Step 6: Commit**

```bash
git add internal/config/config.go internal/config/config_test.go
git commit -m "feat(config): multimodal ingestion knobs (asr, vision model, cookies, uploads)"
```

---

## Task 2: Widen `Share` and `Fetched`

**Files:**
- Modify: `internal/capture/capture.go`
- Test: `internal/capture/capture_test.go`

**Interfaces:**
- Produces:
  - `capture.File{Name string; Mime string; Data []byte}`
  - `capture.Share{Kind string; URL string; Caption string; Files []File}` (field renamed from `Name`)
  - `capture.Fetched{Kind, URL, Title, Description, Text, Caption, Transcript, ImageDigest string; Notes []string; Err error}`
  - `capture.Recognize(raw string) Share` — unchanged signature, now returns `Kind`
  - `capture.Capture` struct gains `CookiesFile string` and `TranscriptLangs string`. It does **not** gain `ASR` or `Vision`: `capture` is imported by `asr` and `analyze`, so holding them there would be an import cycle. Media work lives in `core` (Task 6).

- [ ] **Step 1: Write the failing test**

Append to `internal/capture/capture_test.go`:

```go
func TestRecognizeSetsKind(t *testing.T) {
	if got := Recognize("just some text").Kind; got != KindText {
		t.Errorf("Kind = %q, want %q", got, KindText)
	}
	if got := Recognize("look at https://example.com/x").Kind; got != KindLink {
		t.Errorf("Kind = %q, want %q", got, KindLink)
	}
}

func TestKindForMime(t *testing.T) {
	cases := map[string]string{
		"image/jpeg":        KindImage,
		"image/png":         KindImage,
		"image/webp":        KindImage,
		"audio/ogg":         KindAudio,
		"audio/mpeg":        KindAudio,
		"audio/webm":        KindAudio,
		"video/mp4":         KindVideo,
		"video/quicktime":   KindVideo,
		"application/pdf":   KindFile,
		"text/plain":        KindFile,
	}
	for mime, want := range cases {
		if got := KindForMime(mime); got != want {
			t.Errorf("KindForMime(%q) = %q, want %q", mime, got, want)
		}
	}
	if got := KindForMime("application/octet-stream"); got != KindFile {
		t.Errorf("unknown mime should be a file, got %q", got)
	}
}

func TestLoginWallTextIsNotContent(t *testing.T) {
	for _, wall := range []string{
		"Log in to Instagram\nNice photo! From your friends on Instagram.",
		"Please enable JavaScript to continue",
		"Just a moment...\nChecking your browser before accessing.",
	} {
		if !isLoginWall(wall) {
			t.Errorf("isLoginWall(%q) = false, want true", wall)
		}
	}
	if isLoginWall("An interesting article about distributed systems.") {
		t.Error("isLoginWall gave a false positive on real content")
	}
}

func TestParseVTTStripsCues(t *testing.T) {
	vtt := "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nhello there\n\n00:00:04.000 --> 00:00:07.000\ngeneral kenobi\n"
	got := ParseVTT(vtt)
	if strings.Contains(got, "-->") || strings.Contains(got, "WEBVTT") {
		t.Errorf("timestamps survived: %q", got)
	}
	if !strings.Contains(got, "hello there") || !strings.Contains(got, "general kenobi") {
		t.Errorf("cue text missing: %q", got)
	}
}
```

If `strings` is not already imported in that test file, add it.

- [ ] **Step 2: Run to verify it fails**

Run: `go test ./internal/capture/ -run 'TestRecognizeSetsKind|TestKindForMime|TestLoginWall|TestParseVTT' -v`
Expected: FAIL to compile — `KindText`, `KindForMime`, `isLoginWall`, `ParseVTT` undefined.

- [ ] **Step 3: Implement the type changes**

In `internal/capture/capture.go`, replace the `Share` and `Fetched` structs with:

```go
// Kind classifies what the user handed us. Recognize sets text/link; the
// channel and web adapters set the media kinds directly.
const (
	KindText  = "text"
	KindLink  = "link"
	KindImage = "image"
	KindAudio = "audio"
	KindVideo = "video"
	KindFile  = "file"
)

// File is one media payload handed to the pipeline. Data is in memory: both
// callers (Telegram getFile, multipart upload) already hold the bytes, and
// uploads are size-capped, so there is no temp file to manage.
type File struct {
	Name string
	Mime string
	Data []byte
}

type Share struct {
	Kind    string
	URL     string
	Caption string
	Files   []File
}

type Fetched struct {
	Kind        string
	URL         string
	Title       string
	Description string
	Text        string
	Caption     string
	Transcript  string
	ImageDigest string
	// Notes are extraction warnings, never content. Anything we could not
	// read lands here so the analyzer can qualify the card instead of
	// inventing content from a login wall or an error page.
	Notes []string
	Err   error
}
```

- [ ] **Step 4: Rename `Name` → `Kind` throughout `capture.go`**

Every `share.Name` becomes `share.Kind`, and `f := Fetched{Name: ...}` becomes `Kind:`. There are four sites: `Recognize`'s two returns, `Fetch`'s literal, `MediaMeta`'s literal, and the `if share.Name == "text"` comparison (use `share.Kind == KindText`). Update the `mediaRe`-based `MediaMeta` guard accordingly.

- [ ] **Step 5: Add `KindForMime`**

```go
// KindForMime maps a mime type to a Share kind. Unknown types are files, so
// an unexpected upload still gets captured and read rather than dropped.
func KindForMime(mime string) string {
	m := strings.ToLower(strings.TrimSpace(mime))
	if i := strings.IndexByte(m, ';'); i >= 0 {
		m = strings.TrimSpace(m[:i])
	}
	switch {
	case strings.HasPrefix(m, "image/"):
		return KindImage
	case strings.HasPrefix(m, "audio/"):
		return KindAudio
	case strings.HasPrefix(m, "video/"):
		return KindVideo
	default:
		return KindFile
	}
}
```

- [ ] **Step 6: Fix the rename fallout in existing tests**

The `Name`→`Kind` rename breaks compilation in three test files. These are mechanical edits, not behaviour changes:

`internal/capture/capture_test.go` — lines using `s.Name` and `Share{Name:` (lines 16, 23, 31, 42, 65, 82, 97 by current numbering):
```bash
sed -i 's/s\.Name !=/s.Kind !=/g; s/Share{Name:/Share{Kind:/g; s/Fetched{Name:/Fetched{Kind:/g' internal/capture/capture_test.go
```
Then check what that rewrote and update the compared literals from `"link"`/`"text"` to `KindLink`/`KindText`.

`internal/core/core_test.go` — `textFetcher()` at lines 168–178:
```bash
sed -i 's/capture\.Fetched{Name: s\.Name/capture.Fetched{Kind: s.Kind/g' internal/core/core_test.go
```

`internal/research/research_test.go` — its `stubFetcher` implements `capture.Fetcher` and must satisfy the widened interface. Add:
```go
func (s stubFetcher) Subtitles(share capture.Share) string { return "" }
```

Run: `go build ./... && go test ./... 2>&1 | head -30`
Expected: the new tests PASS and everything compiles. `internal/capture/capture_test.go` line 97's `MediaMeta` test will pass with an empty cookie path.

- [ ] **Step 7: Commit**

```bash
git add internal/capture/capture.go internal/capture/capture_test.go
git add internal/capture/media.go internal/capture/media_test.go
git commit -m "feat(capture): widen Share/Fetched for media, Notes for extraction warnings"
```

---

## Task 3: Media resolution — subtitles, Instagram, login walls

**Files:**
- Create: `internal/capture/media.go`
- Test: `internal/capture/media_test.go`
- Modify: `internal/capture/fetcher.go`, `internal/capture/capture.go`

**Interfaces:**
- Consumes: `capture.File`, `capture.Share`, `capture.Fetched` from Task 2; `config.Config` from Task 1.
- Produces:
  - `capture.ParseVTT(vtt string) string`
  - `capture.IsLoginWall(text string) bool` (exported for reuse in tests from other packages)
  - `capture.ExtractInstagramCaption(html string) string`
  - `capture.InstagramEmbedURL(rawURL string) string` — returns "" for non-Instagram
  - `func (c Capture) Subtitles(share Share) string`
  - `capture.Capture` gains `CookiesFile`, `TranscriptLangs` fields
  - `capture.Fetcher` interface gains `Subtitles(share Share) string`

- [ ] **Step 1: Write the failing tests in the new file**

Create `internal/capture/media_test.go`:

```go
package capture

import "testing"

func TestInstagramEmbedURL(t *testing.T) {
	cases := map[string]string{
		"https://www.instagram.com/p/ABC123/": "https://www.instagram.com/p/ABC123/embed/captioned/",
		"https://instagram.com/reel/ABC123/": "https://www.instagram.com/reel/ABC123/embed/captioned/",
		"https://example.com/p/ABC123/":      "",
		"https://youtube.com/watch?v=x":      "",
	}
	for in, want := range cases {
		if got := InstagramEmbedURL(in); got != want {
			t.Errorf("InstagramEmbedURL(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestExtractInstagramCaptionFallsBackToOGDescription(t *testing.T) {
	// Rendered embeds put the caption in a Caption div; when the markup is
	// unavailable the og:description meta is the guaranteed fallback.
	html := `<html><head><meta property="og:description" content="A cat doing backflips"></head><body></body></html>`
	if got := ExtractInstagramCaption(html); got != "A cat doing backflips" {
		t.Errorf("caption = %q, want the og:description text", got)
	}
}

func TestExtractInstagramCaptionFromCaptionDiv(t *testing.T) {
	html := `<html><body><div class="Caption">Spilled my coffee on the keyboard
again</div><div class="CaptionAndHashtags">#fail</div></body></html>`
	got := ExtractInstagramCaption(html)
	if got == "" {
		t.Fatal("caption is empty, want the Caption div text")
	}
	if !contains(got, "Spilled my coffee") {
		t.Errorf("caption = %q, want it to contain the div text", got)
	}
}

func TestIsLoginWall(t *testing.T) {
	if !IsLoginWall("Log in to Instagram\nFrom your friends on Instagram.") {
		t.Error("instagram wall not detected")
	}
	if !IsLoginWall("Please enable JavaScript to continue") {
		t.Error("js wall not detected")
	}
	if IsLoginWall("A post about Go concurrency patterns and channels.") {
		t.Error("false positive on real content")
	}
}

func contains(haystack, needle string) bool {
	return len(haystack) >= len(needle) && (haystack == needle ||
		len(needle) == 0 || indexOf(haystack, needle) >= 0)
}

func indexOf(h, n string) int {
	for i := 0; i+len(n) <= len(h); i++ {
		if h[i:i+len(n)] == n {
			return i
		}
	}
	return -1
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `go test ./internal/capture/ -run 'TestInstagramEmbedURL|TestExtractInstagram|TestIsLoginWall' -v`
Expected: FAIL to compile — functions undefined.

- [ ] **Step 3: Implement `internal/capture/media.go`**

```go
package capture

import (
	"regexp"
	"strings"
)

var (
	igRe           = regexp.MustCompile(`(?i)^(?:https?://)?(?:www\.)?instagram\.com/(p|reel|reels|tv)/([A-Za-z0-9_-]+)`)
	igCaptionRe    = regexp.MustCompile(`(?is)<div[^>]*class="[^"]*Caption\b[^"]*"[^>]*>(.*?)</div>`)
	igOGDescRe     = regexp.MustCompile(`(?is)<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']`)
	ytSubOutRe     = regexp.MustCompile(`(?m)^\s*(WEBVTT|NOTE|Kind:|Language:).*$`)
	vttCueTimeRe   = regexp.MustCompile(`(?m)^[\d:.]+\s*-->\s*[\d:.]+.*$`)
	vttTagRe       = regexp.MustCompile(`<[^>]*>`)
	vttIndexRe     = regexp.MustCompile(`(?m)^\d+$`)
)

// InstagramEmbedURL returns the captioned-embed URL for an Instagram post,
// or "" when rawURL is not an Instagram post/reel/tv link.
//
// ponytail: only the four public path shapes are handled. Shortcode formats
// (vanity URLs) fall through to the empty-string case and surface as a Note
// rather than a fetch attempt.
func InstagramEmbedURL(rawURL string) string {
	m := igRe.FindStringSubmatch(strings.TrimSpace(rawURL))
	if m == nil {
		return ""
	}
	return "https://www.instagram.com/" + m[1] + "/" + m[2] + "/embed/captioned/"
}

// ExtractInstagramCaption pulls the caption out of a rendered embed page.
// The Caption div is preferred; og:description is the guaranteed fallback
// because it survives in the server-rendered shell.
func ExtractInstagramCaption(html string) string {
	if m := igCaptionRe.FindStringSubmatch(html); m != nil {
		if t := strings.TrimSpace(stripTagsAndCondense(m[1])); t != "" {
			return t
		}
	}
	if m := igOGDescRe.FindStringSubmatch(html); m != nil {
		return strings.TrimSpace(m[1])
	}
	return ""
}

// IsLoginWall reports whether extracted page text is a login/bot wall rather
// than content. Callers must treat a true result as a Note and leave Text
// empty — promoting wall text into Text is the bug this replaces.
func IsLoginWall(text string) bool {
	lower := strings.ToLower(text)
	for _, ind := range []string{
		"log in to instagram", "log in to facebook", "sign up to instagram",
		"log in to continue", "please enable javascript",
		"javascript is required", "just a moment...", "checking your browser",
		"verify you are human", "access denied", "bot detection",
		"security check", "cloudflare",
	} {
		if strings.Contains(lower, ind) {
			return true
		}
	}
	return false
}

// ParseVTT converts WebVTT into plain transcript text: drops the header, cue
// numbering, and timestamp lines, and strips inline cue tags.
func ParseVTT(vtt string) string {
	s := vtt
	s = vttIndexRe.ReplaceAllString(s, "")
	s = vttCueTimeRe.ReplaceAllString(s, "")
	s = igSubOutRe.ReplaceAllString(s, "")
	s = vttTagRe.ReplaceAllString(s, "")
	var lines []string
	for _, ln := range strings.Split(s, "\n") {
		if t := strings.TrimSpace(ln); t != "" {
			lines = append(lines, t)
		}
	}
	return strings.Join(lines, " ")
}
```

- [ ] **Step 4: Write `Subtitles` on `Capture`**

Append to `internal/capture/media.go`:

```go
// Subtitles returns a transcript for share's URL using yt-dlp's subtitle
// writers, or "" when none are available. Never returns an error: absence of
// subtitles is normal and the caller turns it into a Note.
func (c Capture) Subtitles(share Share) string {
	bin := c.YtDlpBin
	if bin == "" {
		bin = ytdlpBin
	}
	langs := c.TranscriptLangs
	if langs == "" {
		langs = "en.*,en"
	}
	args := []string{
		"--skip-download", "--no-warnings",
		"--write-auto-subs", "--write-subs",
		"--sub-langs", langs, "--sub-format", "vtt",
		"--output", "-",
	}
	if c.CookiesFile != "" {
		args = append(args, "--cookies", c.CookiesFile)
	}
	args = append(args, share.URL)
	ctx, cancel := context.WithTimeout(context.Background(), fetchTimeout)
	defer cancel()
	out, err := exec.CommandContext(ctx, bin, args...).Output()
	if err != nil {
		return ""
	}
	return ParseVTT(string(out))
}
```

Add the needed imports to `media.go`: `context`, `os/exec`, plus the `regexp`/`strings` already there.

- [ ] **Step 5: Widen the `Fetcher` interface**

In `internal/capture/fetcher.go`, add `Subtitles(share Share) string` to the interface and add the two config fields:

```go
type Fetcher interface {
	Recognize(raw string) Share
	Fetch(share Share) Fetched
	MediaMeta(share Share) Fetched
	Subtitles(share Share) string
}

type Capture struct {
	HeadlessEnabled bool
	ChromeBin       string
	YtDlpBin        string
	CookiesFile     string
	TranscriptLangs string
}
```

- [ ] **Step 5a: Add the wall-guard test before implementing it**

Append to `internal/capture/media_test.go`:

```go
func TestApplyHeadlessTurnsLoginWallIntoNote(t *testing.T) {
	got := applyHeadless(Fetched{}, "Instagram", "", "Log in to Instagram\nFrom your friends.")
	if got.Text != "" {
		t.Errorf("Text = %q, want empty for a login wall", got.Text)
	}
	if len(got.Notes) != 1 || got.Notes[0] != "instagram login wall — caption unavailable" {
		t.Errorf("Notes = %v, want the login-wall note", got.Notes)
	}
}

func TestApplyHeadlessKeepsRealContent(t *testing.T) {
	real := "A long article about Go generics and the type system, with examples."
	got := applyHeadless(Fetched{}, "Generics in Go", "about types", real)
	if got.Text != real {
		t.Errorf("Text = %q, want the page text preserved", got.Text)
	}
	if len(got.Notes) != 0 {
		t.Errorf("Notes = %v, want none for real content", got.Notes)
	}
}
```

- [ ] **Step 5b: Implement `applyHeadless` as a pure function**

This is the single point where headless output becomes content, so the wall check lives here and nowhere else:

```go
// applyHeadless folds headless-extraction output into f. A detected login or
// bot wall becomes a Note and leaves Text empty — promoting wall text into
// Text is the exact bug this replaces.
func applyHeadless(f Fetched, title, desc, text string) Fetched {
	if title != "" {
		f.Title = strings.TrimSpace(title)
	}
	if IsLoginWall(text) {
		f.Text = ""
		f.Notes = append(f.Notes, "instagram login wall — caption unavailable")
		return f
	}
	if desc != "" {
		f.Description = desc
	}
	if text != "" {
		f.Text = text
	}
	return f
}
```

- [ ] **Step 6: Wire cookies and the wall guard into `MediaMeta` and `Fetch`**

In `MediaMeta`, add cookies to the yt-dlp args and a note on failure:

```go
	args := []string{"--skip-download", "--dump-json", "--no-warnings"}
	if c.CookiesFile != "" {
		args = append(args, "--cookies", c.CookiesFile)
	}
	args = append(args, share.URL)
	out, err := exec.CommandContext(ctx, bin, args...).Output()
```

On the error path, before the headless attempt, add
`f.Notes = append(f.Notes, "metadata unavailable")`. Both the gated-domain
extraction in `Fetch` and the `MediaMeta` fallback then become a single call:

```go
	f = applyHeadless(f, title, desc, text)
```

replacing the three-field-by-field blocks in `Fetch` and the block in
`MediaMeta`. Note that the first extraction in `Fetch` previously returned
early on success; keep that early return but route it through `applyHeadless` so
the wall guard applies there too.

- [ ] **Step 7: Add the Instagram embed fallback to `MediaMeta`**

After the yt-dlp error branch, before the headless attempt:

```go
	if embed := InstagramEmbedURL(share.URL); embed != "" {
		if f.Caption == "" {
			if caption := c.embedCaption(embed); caption != "" {
				f.Caption = caption
			} else {
				f.Notes = append(f.Notes, "instagram caption unavailable")
			}
		}
	}
```

And the helper:

```go
// embedCaption best-effort-fetches an Instagram captioned-embed page and
// returns its caption. Returns "" on any failure; the caller emits a Note.
func (c Capture) embedCaption(embedURL string) string {
	ctx, cancel := context.WithTimeout(context.Background(), fetchTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, embedURL, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36")
	resp, err := httpClient.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return ""
	}
	return ExtractInstagramCaption(string(body))
}
```

- [ ] **Step 8: Run the capture tests**

Run: `go test ./internal/capture/ -v`
Expected: PASS, including the Task 2 tests and these.

- [ ] **Step 9: Commit**

```bash
git add internal/capture/
git commit -m "feat(capture): yt-dlp subtitles, IG embed caption, login-wall becomes a Note"
```

---

## Task 4: `internal/asr` — whisper client

**Files:**
- Create: `internal/asr/asr.go`
- Test: `internal/asr/asr_test.go`

**Interfaces:**
- Consumes: `capture.File` (Task 2), `config.Config` (Task 1).
- Produces:
  - `asr.Client{BaseURL, Model string; HTTP *http.Client}`
  - `asr.New(cfg config.Config) *Client`
  - `func (c *Client) Transcribe(ctx context.Context, f capture.File) (string, error)` — returns `("", nil)` when `BaseURL == ""`

- [ ] **Step 1: Write the failing test**

Create `internal/asr/asr_test.go`:

```go
package asr

import (
	"context"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"sparkkeep/internal/capture"
	"sparkkeep/internal/config"
)

func TestDisabledReturnsEmpty(t *testing.T) {
	c := New(config.Config{ASRURL: ""})
	got, err := c.Transcribe(context.Background(), capture.File{Name: "v.ogg", Data: []byte("x")})
	if err != nil || got != "" {
		t.Fatalf("disabled client returned (%q, %v), want (\"\", nil)", got, err)
	}
}

func TestTranscribePostsMultipart(t *testing.T) {
	var gotField, gotFilename string
	var gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/transcribe" {
			t.Errorf("path = %q, want /transcribe", r.URL.Path)
		}
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Errorf("parse multipart: %v", err)
			return
		}
		f, hdr, err := r.FormFile("file")
		if err != nil {
			t.Errorf("form file: %v", err)
			return
		}
		gotField = "file"
		gotFilename = hdr.Filename
		b, _ := io.ReadAll(f)
		gotBody = string(b)
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"text":"hello from the voice note"}`)
	}))
	defer srv.Close()

	c := New(config.Config{ASRURL: srv.URL})
	c.HTTP = srv.Client()
	got, err := c.Transcribe(context.Background(), capture.File{
		Name: "voice.ogg", Mime: "audio/ogg", Data: []byte("OggS-fake"),
	})
	if err != nil {
		t.Fatalf("Transcribe: %v", err)
	}
	if got != "hello from the voice note" {
		t.Errorf("text = %q", got)
	}
	if gotField != "file" || gotFilename != "voice.ogg" || gotBody != "OggS-fake" {
		t.Errorf("multipart field=%q filename=%q body=%q", gotField, gotFilename, gotBody)
	}
}

func TestTranscribeServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer srv.Close()
	c := New(config.Config{ASRURL: srv.URL})
	c.HTTP = srv.Client()
	if _, err := c.Transcribe(context.Background(), capture.File{Data: []byte("x")}); err == nil {
		t.Fatal("want error on 500")
	}
}

// compile-time guard that multipart is used as expected
var _ = multipart.NewReader
var _ = strings.TrimSpace
```

- [ ] **Step 2: Run to verify it fails**

Run: `go test ./internal/asr/ -v`
Expected: FAIL — no such package.

- [ ] **Step 3: Implement `internal/asr/asr.go`**

```go
// Package asr transcribes audio bytes through an OpenAI-Whisper-compatible
// /transcribe endpoint. It is a thin multipart client: no retries, no
// chunking, no language detection. Absence of a configured endpoint is not an
// error, it returns ("", nil) so callers skip cleanly.
package asr

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"sparkkeep/internal/capture"
	"sparkkeep/internal/config"
)

// timeout bounds one transcription. Whisper on CPU transcribes slowly; this
// is the whole ceiling including upload.
const timeout = 10 * time.Minute

type Client struct {
	BaseURL string
	Model   string
	HTTP    *http.Client
}

// New returns a client bound to cfg. An empty cfg.ASRURL disables ASR.
func New(cfg config.Config) *Client {
	return &Client{
		BaseURL: strings.TrimRight(cfg.ASRURL, "/"),
		Model:   cfg.ASRModel,
		HTTP:    &http.Client{Timeout: timeout},
	}
}

// Transcribe sends f to <BaseURL>/transcribe and returns the transcript.
// Returns ("", nil) when ASR is not configured, so a deployment without
// whisper degrades to a Note rather than an error.
func (c *Client) Transcribe(ctx context.Context, f capture.File) (string, error) {
	if c == nil || c.BaseURL == "" {
		return "", nil
	}
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	part, err := mw.CreateFormFile("file", f.Name)
	if err != nil {
		return "", err
	}
	if _, err := part.Write(f.Data); err != nil {
		return "", err
	}
	if c.Model != "" {
		if err := mw.WriteField("model", c.Model); err != nil {
			return "", err
		}
	}
	if err := mw.Close(); err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/transcribe", &body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())

	httpc := c.HTTP
	if httpc == nil {
		httpc = http.DefaultClient
	}
	resp, err := httpc.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("asr: transcribe status %d", resp.StatusCode)
	}
	var out struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", fmt.Errorf("asr: bad response: %w", err)
	}
	return strings.TrimSpace(out.Text), nil
}

// Ext is a convenience for callers that only have a file extension.
func Ext(name string) string { return strings.TrimPrefix(filepath.Ext(name), ".") }
```

- [ ] **Step 4: Run tests**

Run: `go test ./internal/asr/ -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/asr/
git commit -m "feat(asr): whisper /transcribe multipart client"
```

---

## Task 5: Vision + prompt

**Files:**
- Modify: `internal/analyze/analyze.go`
- Test: `internal/analyze/analyze_test.go`

**Interfaces:**
- Consumes: `capture.File`, `capture.Fetched` (Task 2), `config.Config` (Task 1).
- Produces:
  - `analyze.Client` gains field `VisionModel string`
  - `func (c *Client) Describe(ctx context.Context, img capture.File, hint string) (string, error)`
  - `analyze.PromptFor(payload capture.Fetched) string` (exported for tests)
  - `Analyze` reads `payload.Transcript`, `payload.ImageDigest`, `payload.Notes`

- [ ] **Step 1: Write the failing tests**

Append to `internal/analyze/analyze_test.go`:

```go
// tinyJPEG encodes a real n×n JPEG so the test exercises the same decode path
// Describe uses. Hand-written JPEG magic bytes are not decodable.
func tinyJPEG(t *testing.T, n int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, n, n))
	for y := 0; y < n; y++ {
		for x := 0; x < n; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x * 7), G: uint8(y * 7), B: 0x40, A: 0xff})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, nil); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestDescribeSendsImageDataURL(t *testing.T) {
	var body map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&body)
		io.WriteString(w, `{"choices":[{"message":{"content":"A dog on a skateboard."}}]}`)
	}))
	defer srv.Close()

	c := New(config.Config{LLMBase: srv.URL, LLMModel: "gemma3:4b", VisionModel: "gemma3:4b"}, srv.Client())
	got, err := c.Describe(context.Background(), capture.File{
		Name: "dog.jpg", Mime: "image/jpeg", Data: tinyJPEG(t, 64),
	}, "Describe this image.")
	if err != nil {
		t.Fatalf("Describe: %v", err)
	}
	if got != "A dog on a skateboard." {
		t.Errorf("digest = %q", got)
	}
	if body["model"] != "gemma3:4b" {
		t.Errorf("model = %v, want the vision model", body["model"])
	}
	msgs, _ := body["messages"].([]any)
	if len(msgs) != 1 {
		t.Fatalf("messages = %v, want one user message", body["messages"])
	}
	parts, _ := msgs[0].(map[string]any)["content"].([]any)
	if len(parts) != 2 {
		t.Fatalf("content parts = %v, want text + image", parts[0])
	}
	imgPart, _ := parts[1].(map[string]any)
	if imgPart["type"] != "image_url" {
		t.Fatalf("second part = %v, want image_url", imgPart)
	}
	url, _ := imgPart["image_url"].(map[string]any)["url"].(string)
	if !strings.HasPrefix(url, "data:image/jpeg;base64,") {
		t.Errorf("image url = %.40q, want a data: URL", url)
	}
}

// Review Focus: a 12MP phone photo must be downscaled, not sent at full size.
// Build the large image cheaply as a flat colour so the test stays fast.
func TestEncodeForVisionDownscalesLargePhoto(t *testing.T) {
	raw := tinyJPEG(t, 3000)
	enc, mime, err := encodeForVision(raw)
	if err != nil {
		t.Fatalf("encodeForVision: %v", err)
	}
	if mime != "image/jpeg" {
		t.Errorf("mime = %q, want image/jpeg", mime)
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(enc))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Width > visionMaxEdge || cfg.Height > visionMaxEdge {
		t.Errorf("encoded %dx%d, want both edges <= %d", cfg.Width, cfg.Height, visionMaxEdge)
	}
	// Aspect ratio must survive the nearest-neighbour scale.
	wantRatio := 1.0
	if got := float64(cfg.Width) / float64(cfg.Height); got < wantRatio*0.95 || got > wantRatio*1.05 {
		t.Errorf("aspect ratio %.3f, want ~1.0 for a square source", got)
	}
	// And the downscale must actually shrink the payload.
	if len(enc) >= len(raw) {
		t.Errorf("downscaled %d bytes from %d, expected smaller", len(enc), len(raw))
	}
}

func TestEncodeForVisionLeavesSmallImageAlone(t *testing.T) {
	enc, _, err := encodeForVision(tinyJPEG(t, 128))
	if err != nil {
		t.Fatalf("encodeForVision: %v", err)
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(enc))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Width != 128 || cfg.Height != 128 {
		t.Errorf("got %dx%d, want 128x128 untouched", cfg.Width, cfg.Height)
	}
}

func TestDescribeSkipsUnusableImage(t *testing.T) {
	// Bytes that are not an image cannot be decoded, so Describe must decline
	// rather than send garbage and invite a hallucination.
	c := New(config.Config{LLMBase: "http://127.0.0.1:1/v1", LLMModel: "m", VisionModel: "m"}, &http.Client{})
	got, err := c.Describe(context.Background(), capture.File{
		Name: "x.jpg", Mime: "image/jpeg", Data: []byte("not an image"),
	}, "")
	if err == nil {
		t.Fatal("want an error for undecodable image data")
	}
	if got != "" {
		t.Errorf("digest = %q, want empty on error", got)
	}
}

func TestPromptForCarriesTranscriptAndNotes(t *testing.T) {
	p := PromptFor(capture.Fetched{
		Kind:       capture.KindVideo,
		Title:      "Some talk",
		Transcript: "the actual spoken words",
		Notes:      []string{"no transcript available"},
	})
	for _, want := range []string{"the actual spoken words", "no transcript available", "EXTRACTION NOTES"} {
		if !strings.Contains(p, want) {
			t.Errorf("prompt missing %q", want)
		}
	}
}
```

Ensure `bytes`, `encoding/json`, `image`, `image/color`, `image/jpeg`, `io`, `net/http`, `net/http/httptest`, `strings`, and `sparkkeep/internal/capture` are imported in the test file.

- [ ] **Step 2: Run to verify it fails**

Run: `go test ./internal/analyze/ -run 'TestDescribe|TestPromptFor' -v`
Expected: FAIL to compile — `Describe`, `PromptFor` undefined.

- [ ] **Step 3: Widen `doCompletion` for multi-part content**

In `analyze.go`, change the `messages` field construction sites to `[]map[string]any` and change the `doCompletion` body's message typing. The `Analyze` call becomes:

```go
		"messages": []map[string]any{
			{"role": "system", "content": "You are a curator that returns strict JSON."},
			{"role": "user", "content": PromptFor(payload)},
		},
```

`Ask` becomes:

```go
		"messages": []map[string]any{
			{"role": "system", "content": "You are a rigorous research assistant."},
			{"role": "user", "content": prompt},
		},
```

- [ ] **Step 4: Add the `VisionModel` field and `Describe`**

Add `VisionModel string` to the `Client` struct, set it in `New` with a fallback:

```go
	c.VisionModel = cfg.VisionModel
	if c.VisionModel == "" {
		c.VisionModel = c.Model
	}
```

Add the downscale and description logic:

```go
// visionMaxEdge bounds the long edge of an image before it is sent to a
// vision model. A 12MP phone photo through a 4B model on CPU is minutes of
// wall clock; 768px is legible for captions and screenshots.
const visionMaxEdge = 768

// minDigestChars is the floor for a usable image description. Below it the
// model returned nothing, and a card built on that would be a fabrication.
const minDigestChars = 20

// Describe asks the vision model what an image contains. It returns
// ("", error) when the image cannot be decoded or the model is unreachable;
// the caller turns that into an "image unreadable" Note.
func (c *Client) Describe(ctx context.Context, img capture.File, hint string) (string, error) {
	enc, mime, err := encodeForVision(img.Data)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(hint) == "" {
		hint = "Describe this image. Transcribe any visible text verbatim. State clearly if the image is unreadable or contains no useful information."
	}
	content, err := c.doCompletion(ctx, map[string]any{
		"model": c.VisionModel,
		"messages": []map[string]any{{
			"role": "user",
			"content": []map[string]any{
				{"type": "text", "text": hint},
				{"type": "image_url", "image_url": map[string]string{
					"url": "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(enc),
				}},
			},
		}},
		"max_tokens":  512,
		"temperature": 0.1,
	})
	if err != nil {
		return "", err
	}
	content = strings.TrimSpace(content)
	if len(content) < minDigestChars {
		return "", fmt.Errorf("analyze: vision reply too short (%d chars)", len(content))
	}
	return content, nil
}

// encodeForVision downscales raw image bytes to visionMaxEdge and re-encodes
// as JPEG. Decoding is stdlib (jpeg/png/gif are registered by it) and
// scaling is a nearest-neighbour loop over image/draw, so no dependency.
func encodeForVision(raw []byte) ([]byte, string, error) {
	img, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, "", fmt.Errorf("analyze: decode image: %w", err)
	}
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= 0 || h <= 0 {
		return nil, "", fmt.Errorf("analyze: empty image %dx%d", w, h)
	}
	if w > visionMaxEdge || h > visionMaxEdge {
		scale := float64(visionMaxEdge) / float64(max(w, h))
		nw, nh := int(float64(w)*scale), int(float64(h)*scale)
		if nw < 1 {
			nw = 1
		}
		if nh < 1 {
			nh = 1
		}
		dst := image.NewRGBA(image.Rect(0, 0, nw, nh))
		for y := 0; y < nh; y++ {
			for x := 0; x < nw; x++ {
				sx := b.Min.X + x*w/nw
				sy := b.Min.Y + y*h/nh
				dst.Set(x, y, img.At(sx, sy))
			}
		}
		img = dst
	}
	var out bytes.Buffer
	if err := jpeg.Encode(&out, img, &jpeg.Options{Quality: 80}); err != nil {
		return nil, "", fmt.Errorf("analyze: encode jpeg: %w", err)
	}
	return out.Bytes(), "image/jpeg", nil
}
```

Add imports: `bytes`, `encoding/base64`, `image`, `image/jpeg`, `_ "image/png"` (blank import registers PNG decoding — required for Telegram PNG screenshots).

- [ ] **Step 5: Rewrite `promptFor` into exported `PromptFor`**

```go
// PromptFor builds the curator prompt. Notes are labelled explicitly as
// extraction warnings so the model qualifies the card instead of treating a
// login wall or a missing transcript as content.
func PromptFor(payload capture.Fetched) string {
	notes := "(none)"
	if len(payload.Notes) > 0 {
		notes = strings.Join(payload.Notes, "; ")
	}
	transcript := payload.Transcript
	if strings.TrimSpace(transcript) == "" {
		transcript = "(none)"
	}
	digest := payload.ImageDigest
	if strings.TrimSpace(digest) == "" {
		digest = "(none)"
	}
	return fmt.Sprintf(`You receive captured content of kind %q. You are the Sparkkeep Action Engine curator.
Give a concise "So What?" briefing and split the content into actionable idea cards.
Return ONLY a valid JSON object matching this schema:
{
  "executive_summary": "1-3 sentences answering 'What is this?'",
  "value_proposition": "1-2 sentences answering 'Why is this useful or important?'",
  "proposed_actions": ["2 to 3 concrete next steps or immediate action items"],
  "cards": [
    {
      "title": "short headline",
      "summary": "2-3 lines summarizing this distinct takeaway, project, or tool",
      "horizon": "short-term",
      "tags": ["lowercase tags, max 5"],
      "links": ["source links or references"]
    }
  ]
}

Rules:
- horizon must be "short-term" (actionable now/soon) or "lifetime" (long-horizon bucket item).
- One card per distinct idea or tool; if one idea, exactly one card; never merge; never drop.
- EXTRACTION NOTES are warnings about what could NOT be read. Never present a note's
  subject as content you learned. If content is missing, say so plainly in the summary.
- If the source is thin, produce one honest card rather than padding to look substantial.

TITLE: %s
DESCRIPTION: %s
BODY: %s
CAPTION: %s
TRANSCRIPT: %s
IMAGE READING: %s
EXTRACTION NOTES: %s`,
		payload.Kind,
		clip(payload.Title, 300), clip(payload.Description, 600),
		clip(payload.Text, 4000), clip(payload.Caption, 2000),
		clip(transcript, 6000), clip(digest, 2000), notes)
}

// clip truncates at a rune boundary so a long transcript cannot split a
// multi-byte character.
func clip(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return string([]rune(s)[:max]) + "\n[truncated]"
}
```

Then rename the single existing call site inside `Analyze` to `PromptFor(payload)`.

- [ ] **Step 6: Run tests**

Run: `go test ./internal/analyze/ -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add internal/analyze/
git commit -m "feat(analyze): vision Describe, transcript+notes in the curator prompt"
```

---

## Task 6: `core` — media capture and upload retention

**Files:**
- Modify: `internal/core/core.go`
- Test: `internal/core/core_test.go` (append only — do not touch existing tests)

**Interfaces:**
- Consumes: `capture.Share`/`File` (Task 2), `asr.Client` (Task 4), `analyze.Client` (Task 5), `config.Config` (Task 1).
- Produces:
  - `func (s *Service) CaptureShare(ctx context.Context, share capture.Share) ([]int64, error)`
  - `func (s *Service) Capture(ctx context.Context, raw string) ([]int64, error)` — unchanged signature
  - `core.Service` gains `Vision Describer`, `ASR Transcriber`, `UploadDir string`, `FFmpegBin string`
  - `core.Describer` and `core.Transcriber` interfaces, satisfied by `*analyze.Client` and `*asr.Client`
  - `func (s *Service) persistUpload(f capture.File) string` — returns the stored filename or ""
  - `Service.Analyze` **stays a concrete `*analyze.Client`** — tests observe the prompt through an `httptest` LLM instead, matching the existing `llmStub` pattern

- [ ] **Step 0: Add the interfaces and `Service` fields**

`analyze.Client` and `asr.Client` are the only implementations today, but the tests need fakes, so consume them through two tiny interfaces. Add to `internal/core/core.go`:

```go
// Describer reads an image and returns a text digest. Satisfied by
// *analyze.Client.
type Describer interface {
	Describe(ctx context.Context, img capture.File, hint string) (string, error)
}

// Transcriber turns audio into text. Satisfied by *asr.Client.
type Transcriber interface {
	Transcribe(ctx context.Context, f capture.File) (string, error)
}
```

Extend the existing `Service` struct (keep every current field, including the concrete `Analyze *analyze.Client`):

```go
type Service struct {
	Store     port.Store
	Channel   port.Channel
	Fetcher   capture.Fetcher
	Analyze   *analyze.Client
	Vision    Describer   // nil disables image digests
	ASR       Transcriber // nil disables transcription
	Runner    *research.Runner
	UploadDir string // "" disables upload retention
	FFmpegBin string // "" disables video audio extraction
	Logf      func(format string, args ...any)
}
```

A nil `Vision`/`ASR` must degrade to a Note, not panic — every call site guards with `if s.Vision != nil` / `if s.ASR != nil`. `*analyze.Client` satisfies `Describer` (Task 5 adds `Describe`); `*asr.Client` satisfies `Transcriber` (Task 4).

- [ ] **Step 1: Add a prompt-spy LLM and extend `stubFetcher`**

The file already has `stubFetcher` (with `recognize`/`fetch`/`mediaMeta` func fields) and `baseSvc(t, st, ch, llm)`. Extend the existing `stubFetcher` struct with a `subtitles` field rather than declaring a second one, then add its `Subtitles` method:

```go
func (s stubFetcher) Subtitles(share capture.Share) string {
	if s.subtitles != nil {
		return s.subtitles(share)
	}
	return ""
}
```

Add a `subtitles func(capture.Share) string` field to the existing `stubFetcher` struct definition.

Add a prompt-spy LLM server so tests can assert on what reached the model — the same approach as the existing `llmStub`:

```go
// promptSpy records the last curator prompt it was sent and answers with a
// one-card analysis.
type promptSpy struct {
	mu     sync.Mutex
	prompt string
}

func (p *promptSpy) server(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Messages []struct {
				Role    string          `json:"role"`
				Content json.RawMessage `json:"content"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		for _, m := range body.Messages {
			if m.Role != "user" {
				continue
			}
			var text string
			if json.Unmarshal(m.Content, &text) == nil {
				p.mu.Lock()
				p.prompt = text
				p.mu.Unlock()
			}
		}
		io.WriteString(w, `{"choices":[{"message":{"content":`+
			`"{\"executive_summary\":\"s\",\"value_proposition\":\"v\",`+
			`\"proposed_actions\":[\"a\"],\"cards\":[{\"title\":\"t\",`+
			`\"summary\":\"s\",\"horizon\":\"short-term\",\"tags\":[],\"links\":[]}]}"`+
			`}}]}`)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func (p *promptSpy) last() string {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.prompt
}

// fakeVision returns a canned image digest.
type fakeVision struct{ digest string }

func (f *fakeVision) Describe(ctx context.Context, img capture.File, hint string) (string, error) {
	return f.digest, nil
}

// fakeASR returns a canned transcript.
type fakeASR struct{ text string }

func (f *fakeASR) Transcribe(ctx context.Context, f capture.File) (string, error) {
	return f.text, nil
}
```

Add imports `sync` and `encoding/json` to the test file if absent.

- [ ] **Step 2: Write the failing tests**

```go
func TestCaptureShareAudioTranscribes(t *testing.T) {
	spy := &promptSpy{}
	s := baseSvc(t, newStubStore(), &stubChannel{}, spy.server(t))
	s.Fetcher = stubFetcher{}
	s.ASR = &fakeASR{text: "the spoken words of the voice note"}
	s.UploadDir = "" // no retention in this test

	ids, err := s.CaptureShare(context.Background(), capture.Share{
		Kind:    capture.KindAudio,
		Caption: "my idea",
		Files:   []capture.File{{Name: "v.ogg", Mime: "audio/ogg", Data: []byte("OggS")}},
	})
	if err != nil {
		t.Fatalf("CaptureShare: %v", err)
	}
	if len(ids) != 1 {
		t.Fatalf("ids = %v, want one card", ids)
	}
	if !strings.Contains(spy.last(), "the spoken words of the voice note") {
		t.Errorf("transcript never reached the prompt:\n%s", spy.last())
	}
}

func TestCaptureShareImageUsesVision(t *testing.T) {
	spy := &promptSpy{}
	s := baseSvc(t, newStubStore(), &stubChannel{}, spy.server(t))
	s.Fetcher = stubFetcher{}
	s.Vision = &fakeVision{digest: "a chart of quarterly revenue by quarter"}

	_, err := s.CaptureShare(context.Background(), capture.Share{
		Kind:  capture.KindImage,
		Files: []capture.File{{Name: "c.png", Mime: "image/png", Data: []byte("\x89PNG")}},
	})
	if err != nil {
		t.Fatalf("CaptureShare: %v", err)
	}
	if !strings.Contains(spy.last(), "quarterly revenue") {
		t.Errorf("image digest never reached the prompt:\n%s", spy.last())
	}
}

func TestCaptureShareVideoWithoutFFmpegStillCreatesCard(t *testing.T) {
	spy := &promptSpy{}
	s := baseSvc(t, newStubStore(), &stubChannel{}, spy.server(t))
	s.Fetcher = stubFetcher{}
	s.FFmpegBin = "" // deliberately absent

	ids, err := s.CaptureShare(context.Background(), capture.Share{
		Kind:  capture.KindVideo,
		Files: []capture.File{{Name: "v.mp4", Mime: "video/mp4", Data: []byte("\x00\x00\x00\x20ftyp")}},
	})
	if err != nil {
		t.Fatalf("CaptureShare: %v", err)
	}
	if len(ids) != 1 {
		t.Fatalf("ids = %v, want the card to still be created", ids)
	}
	if !strings.Contains(spy.last(), "video: audio extraction unavailable") {
		t.Errorf("missing ffmpeg note in prompt:\n%s", spy.last())
	}
}

// Review Focus: a YouTube link with no subtitles must still produce a card
// carrying the note, never a fabricated transcript and never an empty card.
func TestCaptureShareVideoNoSubtitlesNotesAndKeepsTitle(t *testing.T) {
	spy := &promptSpy{}
	s := baseSvc(t, newStubStore(), &stubChannel{}, spy.server(t))
	s.Fetcher = stubFetcher{
		mediaMeta: func(sh capture.Share) capture.Fetched {
			return capture.Fetched{
				Kind: sh.Kind, URL: sh.URL,
				Title: "A talk about Go", Description: "the description",
			}
		},
		subtitles: func(capture.Share) string { return "" },
	}
	ids, err := s.CaptureShare(context.Background(),
		capture.Share{Kind: capture.KindLink, URL: "https://www.youtube.com/watch?v=abc"})
	if err != nil {
		t.Fatalf("CaptureShare: %v", err)
	}
	if len(ids) != 1 {
		t.Fatalf("ids = %v, want a card despite no subtitles", ids)
	}
	p := spy.last()
	if !strings.Contains(p, "no transcript available") {
		t.Errorf("missing transcript note:\n%s", p)
	}
	if !strings.Contains(p, "A talk about Go") {
		t.Errorf("title was dropped:\n%s", p)
	}
	if strings.Contains(p, "TRANSCRIPT: the actual") {
		t.Error("a transcript was fabricated")
	}
}

// Review Focus: an unreachable whisper degrades to a note, not a failure.
func TestCaptureShareAudioASRFailureNotes(t *testing.T) {
	spy := &promptSpy{}
	s := baseSvc(t, newStubStore(), &stubChannel{}, spy.server(t))
	s.Fetcher = stubFetcher{}
	s.ASR = &fakeASR{text: ""} // empty transcript, no error
	ids, err := s.CaptureShare(context.Background(), capture.Share{
		Kind:  capture.KindAudio,
		Files: []capture.File{{Name: "v.ogg", Mime: "audio/ogg", Data: []byte("OggS")}},
	})
	if err != nil {
		t.Fatalf("CaptureShare: %v", err)
	}
	if len(ids) != 1 {
		t.Fatalf("ids = %v, want the card to still be created", ids)
	}
	if !strings.Contains(spy.last(), "audio not transcribed") {
		t.Errorf("missing ASR note:\n%s", spy.last())
	}
}

func TestPersistUploadDeduplicatesByContent(t *testing.T) {
	dir := t.TempDir()
	s := &Service{UploadDir: dir, Logf: t.Logf}
	f := capture.File{Name: "photo.jpg", Mime: "image/jpeg", Data: []byte("same-bytes")}
	a := s.persistUpload(f)
	b := s.persistUpload(capture.File{Name: "other-name.jpg", Mime: "image/jpeg", Data: []byte("same-bytes")})
	if a == "" || a != b {
		t.Errorf("persistUpload names %q and %q for identical content, want one name", a, b)
	}
	if a == "" {
		t.Fatal("no name returned")
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Errorf("wrote %d files, want 1", len(entries))
	}
}
```

- [ ] **Step 3: Run to verify it fails**

Run: `go test ./internal/core/ -run 'TestCaptureShare|TestPersistUpload' -v`
Expected: FAIL to compile — `CaptureShare`, `ASR`, `Vision`, `FFmpegBin`, `UploadDir` undefined.

- [ ] **Step 2: Run to verify it fails**

Run: `go test ./internal/core/ -run 'TestCaptureShare' -v`
Expected: FAIL to compile — `CaptureShare`, `ASR`, `Vision`, `FFmpegBin` undefined.

- [ ] **Step 3: Add the fields and interfaces to `core.go`**

Add imports: `crypto/sha256`, `encoding/hex`, `os`, `os/exec`, `path/filepath`, `sparkkeep/internal/asr`.

Add to `Service`:

```go
	ASR       Transcriber
	Vision    Describer
	UploadDir string
	FFmpegBin string
```

In `New`, wire them:

```go
	s.ASR = asr.New(cfg)
	s.Vision = llm
	s.UploadDir = cfg.UploadDir
	s.FFmpegBin = ffmpegBin(cfg)
```

with

```go
// ffmpegBin returns a usable ffmpeg path or "" when it is not installed.
// Video input without ffmpeg degrades to a Note rather than a failure.
func ffmpegBin(cfg config.Config) string {
	if v := os.Getenv("SPARKKEEP_FFMPEG_BIN"); v != "" {
		return v
	}
	for _, candidate := range []string{cfg.FFmpegBin, "ffmpeg"} {
		if candidate == "" {
			continue
		}
		if p, err := exec.LookPath(candidate); err == nil {
			return p
		}
	}
	return ""
}
```

- [ ] **Step 4: Add `CaptureShare` and demote `Capture` to a wrapper**

Rename the existing `Capture` body to `CaptureShare` taking a `Share`, and add:

```go
// Capture recognizes raw and runs the full pipeline. It is a convenience
// wrapper kept for the text/link path so existing callers and tests are
// unaffected by the switch to CaptureShare.
func (s *Service) Capture(ctx context.Context, raw string) ([]int64, error) {
	return s.CaptureShare(ctx, s.Fetcher.Recognize(raw))
}
```

Inside `CaptureShare`, replace the opening lines with a media branch. The duplicate-URL check stays for links; the fetch line becomes:

```go
	fetched := s.resolve(ctx, share)
```

- [ ] **Step 5: Implement `resolve`**

```go
// resolve turns a share into a Fetched. Link and text shares go through the
// fetcher; media shares are read locally. Nothing here fails hard — every
// unreadable input becomes a Note so a card is still produced.
func (s *Service) resolve(ctx context.Context, share capture.Share) capture.Fetched {
	switch share.Kind {
	case capture.KindText, capture.KindLink:
		f := s.fetchContent(share)
		f.Kind = share.Kind
		if share.Kind == capture.KindLink {
			if f.Transcript == "" {
				if tr := s.Fetcher.Subtitles(share); tr != "" {
					f.Transcript = tr
				} else if isVideoHost(f.URL) {
					f.Notes = append(f.Notes, "no transcript available")
				}
			}
		}
		return f
	default:
		return s.resolveMedia(ctx, share)
	}
}

// resolveMedia reads image, audio, video, and file payloads.
func (s *Service) resolveMedia(ctx context.Context, share capture.Share) capture.Fetched {
	f := capture.Fetched{
		Kind:    share.Kind,
		URL:     share.URL,
		Caption: share.Caption,
	}
	if len(share.Files) == 0 {
		f.Notes = append(f.Notes, "no file content received")
		return f
	}
	file := share.Files[0]
	f.Title = file.Name

	if share.Kind == capture.KindImage {
		if s.Vision == nil {
			f.Notes = append(f.Notes, "image unreadable")
			return f
		}
		digest, err := s.Vision.Describe(ctx, file, "")
		if err != nil {
			s.Logf("core: vision %s: %v", file.Name, err)
			f.Notes = append(f.Notes, "image unreadable")
			return f
		}
		f.ImageDigest = digest
		return f
	}

	if share.Kind == capture.KindVideo {
		audio, err := s.extractAudio(ctx, file)
		if err != nil {
			s.Logf("core: extract audio %s: %v", file.Name, err)
			f.Notes = append(f.Notes, "video: audio extraction unavailable")
			return f
		}
		if tr, terr := s.transcribe(ctx, audio); terr == nil && tr != "" {
			f.Transcript = tr
			return f
		} else if terr != nil {
			s.Logf("core: transcribe %s: %v", file.Name, terr)
		}
		f.Notes = append(f.Notes, "audio not transcribed")
		return f
	}

	if share.Kind == capture.KindAudio {
		tr, err := s.transcribe(ctx, file)
		if err != nil {
			s.Logf("core: transcribe %s: %v", file.Name, err)
			f.Notes = append(f.Notes, "audio not transcribed")
			return f
		}
		if tr == "" {
			f.Notes = append(f.Notes, "audio not transcribed")
			return f
		}
		f.Transcript = tr
		return f
	}

	// KindFile: read text-like content, otherwise record the filename only.
	if txt, ok := readTextFile(file); ok {
		f.Text = txt
		return f
	}
	if file.Mime == "application/pdf" {
		f.Notes = append(f.Notes, "pdf: text not extracted")
	} else {
		f.Notes = append(f.Notes, "file: content not extractable")
	}
	return f
}
```

Plus helpers:

```go
// isVideoHost reports whether a URL points at a platform that has subtitles
// worth asking for.
func isVideoHost(raw string) bool {
	low := strings.ToLower(raw)
	return strings.Contains(low, "youtube.com") || strings.Contains(low, "youtu.be")
}

func (s *Service) transcribe(ctx context.Context, f capture.File) (string, error) {
	if s.ASR == nil {
		return "", nil
	}
	return s.ASR.Transcribe(ctx, f)
}

// extractAudio converts a video file to 16kHz mono wav via ffmpeg. Returns
// an error when ffmpeg is unavailable, which the caller turns into a Note.
func (s *Service) extractAudio(ctx context.Context, in capture.File) (capture.File, error) {
	if s.FFmpegBin == "" {
		return capture.File{}, fmt.Errorf("core: ffmpeg not installed")
	}
	tmp, err := os.CreateTemp("", "sparkkeep-audio-*.wav")
	if err != nil {
		return capture.File{}, err
	}
	defer os.Remove(tmp.Name())
	tmp.Close()
	cmd := exec.CommandContext(ctx, s.FFmpegBin,
		"-i", "pipe:0", "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", tmp.Name())
	cmd.Stdin = bytes.NewReader(in.Data)
	if out, err := cmd.CombinedOutput(); err != nil {
		return capture.File{}, fmt.Errorf("core: ffmpeg: %w: %s", err, clipText(string(out), 200))
	}
	wav, err := os.ReadFile(tmp.Name())
	if err != nil {
		return capture.File{}, err
	}
	return capture.File{Name: "audio.wav", Mime: "audio/wav", Data: wav}, nil
}

func clipText(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

// readTextFile returns file contents when the mime is text-like. HTML is
// stripped so a saved web page reads as prose.
func readTextFile(f capture.File) (string, bool) {
	m := strings.ToLower(f.Mime)
	if !strings.HasPrefix(m, "text/") && m != "application/json" && m != "application/xml" {
		return "", false
	}
	s := strings.TrimSpace(string(f.Data))
	if strings.Contains(m, "html") {
		s = strings.TrimSpace(stripHTML(s))
	}
	if len(s) > 4000 {
		s = string([]rune(s)[:4000])
	}
	return s, s != ""
}

func stripHTML(s string) string {
	re := regexp.MustCompile(`(?s)<(script|style)[^>]*>.*?</\1>`)
	s = re.ReplaceAllString(s, " ")
	return tagStripRe.ReplaceAllString(s, "")
}
```

Declare `tagStripRe` once at package level in `core.go`:

```go
var tagStripRe = regexp.MustCompile(`<[^>]*>`)
```

- [ ] **Step 6: Implement `persistUpload`**

```go
// persistUpload stores f under UploadDir named by its content hash and
// returns the filename, or "" when storage is unavailable. Storage is
// best-effort: capture must not fail because a directory is missing.
func (s *Service) persistUpload(f capture.File) string {
	if s.UploadDir == "" || len(f.Data) == 0 {
		return ""
	}
	if err := os.MkdirAll(s.UploadDir, 0o755); err != nil {
		s.Logf("core: mkdir uploads: %v", err)
		return ""
	}
	sum := sha256.Sum256(f.Data)
	ext := strings.ToLower(filepath.Ext(f.Name))
	if ext == "" || len(ext) > 8 {
		ext = ""
	}
	name := hex.EncodeToString(sum[:])[:16] + ext
	if err := os.WriteFile(filepath.Join(s.UploadDir, name), f.Data, 0o644); err != nil {
		s.Logf("core: write upload: %v", err)
		return ""
	}
	return name
}
```

Call it in `resolveMedia` at the top of the media branch. Setting `f.URL` is all that is needed: `firstURL(fetched, idea.Links)` (core.go:304) already prefers `fetched.URL`, so the media link lands on the card with no further change, and the card's source column is a URL-shaped field. Only set it when `f.URL` is still empty, so a link-with-attachment keeps its real source URL:

```go
	if f.URL == "" {
		if name := s.persistUpload(file); name != "" {
			f.URL = "/api/v1/media/" + name
		}
	}
```

- [ ] **Step 6a: Wire the new dependencies into `core.New`**

Nothing works in production until `New` populates the new fields. `core.New` keeps its signature — it already receives the whole `config.Config`:

```go
func New(st port.Store, cfg config.Config, logf func(format string, args ...any)) *Service {
	llm := analyze.New(cfg, nil)
	s := &Service{
		Store: st,
		Fetcher: capture.Capture{
			HeadlessEnabled: cfg.HeadlessEnabled,
			ChromeBin:       cfg.ChromeBin,
			YtDlpBin:        cfg.YtDlpBin,
			CookiesFile:     cfg.CookiesFile,
			TranscriptLangs: cfg.TranscriptLangs,
		},
		Analyze:    llm,
		Vision:     llm, // *analyze.Client satisfies both
		ASR:        asr.New(cfg),
		UploadDir:  cfg.UploadDir,
		FFmpegBin:  cfg.FFmpegBin,
		Runner:     research.New(cfg, llm),
		Logf:       logf,
	}
	if s.Logf == nil {
		s.Logf = log.Printf
	}
	return s
}
```

Add the `sparkkeep/internal/asr` import. `asr.New(cfg)` already builds its own
timeout-bound client, and `Transcribe` returns `("", nil)` when `cfg.ASRURL` is
empty, so an unconfigured deployment degrades to a Note instead of erroring.

Confirm the `capture.Capture` field names match Task 2's struct. `cmd/sparkkeep/main.go` needs no change — it already calls `core.New(st, cfg, logger)`.

`cmd/sparkkeep/main.go` needs no change: it already calls `core.New(st, cfg, logger)`.

- [ ] **Step 7: Run the core tests**

Run: `go test ./internal/core/ -v`
Expected: PASS — all pre-existing tests (signature preserved) plus the new ones.

- [ ] **Step 7a: Fix the `webHandler` helper for the new `New` signature**

Task 8 changes `web.New` to take a `config.Config`. The existing helper in `internal/web/web_test.go` will not compile:

```go
func webHandler(st port.Store, svc *core.Service) http.Handler {
	return New(st, svc, "http://localhost:8080")
}
```

Update it in place to pass the config, so all existing web tests keep working:

```go
func webHandler(st port.Store, svc *core.Service) http.Handler {
	return New(st, svc, "http://localhost:8080", config.Config{MaxUploadMB: 25})
}
```

Add the `config` import if absent.

- [ ] **Step 8: Commit**

```bash
git add internal/core/core.go internal/core/core_test.go
git commit -m "feat(core): CaptureShare with vision, whisper, and ffmpeg audio extraction"
```

---

## Task 7: Telegram media ingestion

**Files:**
- Modify: `internal/channel/telegram/telegram.go`
- Test: `internal/channel/telegram/telegram_test.go`

**Interfaces:**
- Consumes: `core.Service.CaptureShare` (Task 6), `capture.Share`/`File`/`KindForMime` (Task 2).
- Produces: `func ShareFromUpdate(m *message, bytesFn func(string) ([]byte, error)) (capture.Share, bool)` — exported for tests.

- [ ] **Step 1: Write the failing tests**

Append to `internal/channel/telegram/telegram_test.go`:

```go
func TestShareFromUpdateText(t *testing.T) {
	m := &message{Chat: &chat{ID: 1}, Text: "https://example.com/x"}
	sh, ok := ShareFromUpdate(m, nil)
	if !ok || sh.Kind != capture.KindLink || sh.URL != "https://example.com/x" {
		t.Errorf("share = %+v ok=%v", sh, ok)
	}
}

func TestShareFromUpdatePhoto(t *testing.T) {
	m := &message{
		Chat:    &chat{ID: 1},
		Caption: "look at this",
		Photo:   []photoSize{{FileID: "abc"}},
	}
	sh, ok := ShareFromUpdate(m, func(id string) ([]byte, error) {
		if id != "abc" {
			t.Errorf("file id = %q, want abc", id)
		}
		return []byte{0xff, 0xd8, 0xff}, nil
	})
	if !ok || sh.Kind != capture.KindImage || sh.Caption != "look at this" {
		t.Fatalf("share = %+v ok=%v", sh, ok)
	}
	if len(sh.Files) != 1 || sh.Files[0].Mime != "image/jpeg" {
		t.Errorf("files = %+v, want one jpeg", sh.Files)
	}
}

func TestShareFromUpdateVoice(t *testing.T) {
	m := &message{Chat: &chat{ID: 1}, Voice: &voiceNote{FileID: "v1", MimeType: "audio/ogg"}}
	sh, ok := ShareFromUpdate(m, func(string) ([]byte, error) { return []byte("OggS"), nil })
	if !ok || sh.Kind != capture.KindAudio {
		t.Fatalf("share = %+v ok=%v", sh, ok)
	}
}

func TestShareFromUpdateDocument(t *testing.T) {
	m := &message{Chat: &chat{ID: 1}, Document: &document{
		FileID: "d1", FileName: "notes.pdf", MimeType: "application/pdf",
	}}
	sh, ok := ShareFromUpdate(m, func(string) ([]byte, error) { return []byte("%PDF"), nil })
	if !ok || sh.Kind != capture.KindFile || sh.Files[0].Name != "notes.pdf" {
		t.Fatalf("share = %+v ok=%v", sh, ok)
	}
}

func TestShareFromUpdateEmptyIsDropped(t *testing.T) {
	if _, ok := ShareFromUpdate(&message{Chat: &chat{ID: 1}}, nil); ok {
		t.Error("an update with neither text nor media should be dropped")
	}
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `go test ./internal/channel/telegram/ -run TestShareFromUpdate -v`
Expected: FAIL to compile — `ShareFromUpdate`, `voiceNote`, `document` undefined.

- [ ] **Step 3: Add the update fields**

Extend the `message` struct:

```go
type message struct {
	MessageID int64       `json:"message_id"`
	Chat      *chat       `json:"chat"`
	Text      string      `json:"text"`
	Caption   string      `json:"caption"`
	Photo     []photoSize `json:"photo"`
	Voice     *voiceNote  `json:"voice"`
	Audio     *audioFile  `json:"audio"`
	Document  *document   `json:"document"`
	Video     *videoFile  `json:"video"`
}

type voiceNote struct {
	FileID   string `json:"file_id"`
	MimeType string `json:"mime_type"`
	Duration int    `json:"duration"`
}

type audioFile struct {
	FileID   string `json:"file_id"`
	MimeType string `json:"mime_type"`
}

type document struct {
	FileID   string `json:"file_id"`
	FileName string `json:"file_name"`
	MimeType string `json:"mime_type"`
}

type videoFile struct {
	FileID   string `json:"file_id"`
	MimeType string `json:"mime_type"`
	Duration int    `json:"duration"`
}
```

- [ ] **Step 4: Implement `ShareFromUpdate`**

```go
// ShareFromUpdate maps a Telegram message to a capture.Share, downloading
// the first media payload when bytesFn is non-nil. ok is false when the
// message carries neither text nor media, which is the only case the caller
// should drop.
//
// A photo is the largest of Photo's sizes; Telegram orders them ascending, so
// the last entry is the full-resolution original.
func ShareFromUpdate(m *message, bytesFn func(string) ([]byte, error)) (capture.Share, bool) {
	caption := m.Caption
	text := m.Text

	if f, name, mime, ok := firstMedia(m); ok {
		var data []byte
		if bytesFn != nil {
			var err error
			data, err = bytesFn(f)
			if err != nil {
				return capture.Share{}, false
			}
		}
		return capture.Share{
			Kind:    capture.KindForMime(mime),
			Caption: caption,
			Files:   []capture.File{{Name: name, Mime: mime, Data: data}},
		}, true
	}

	raw := text
	if raw == "" {
		raw = caption
	}
	if strings.TrimSpace(raw) == "" {
		return capture.Share{}, false
	}
	return capture.Recognize(raw), true
}

// firstMedia returns the file id, filename, and mime of the first media
// payload on the message, preferring video then document then audio then
// photo, since a reel arrives as video and a saved file as a document.
func firstMedia(m *message) (fileID, name, mime string, ok bool) {
	switch {
	case m.Video != nil:
		return m.Video.FileID, "video.mp4", orMime(m.Video.MimeType, "video/mp4"), true
	case m.Document != nil:
		name = m.Document.FileName
		if name == "" {
			name = "document"
		}
		return m.Document.FileID, name, orMime(m.Document.MimeType, "application/octet-stream"), true
	case m.Voice != nil:
		return m.Voice.FileID, "voice.ogg", orMime(m.Voice.MimeType, "audio/ogg"), true
	case m.Audio != nil:
		return m.Audio.FileID, "audio.m4a", orMime(m.Audio.MimeType, "audio/mpeg"), true
	case len(m.Photo) > 0:
		last := m.Photo[len(m.Photo)-1]
		return last.FileID, "photo.jpg", "image/jpeg", true
	}
	return "", "", "", false
}

func orMime(v, def string) string {
	if strings.TrimSpace(v) == "" {
		return def
	}
	return v
}
```

- [ ] **Step 5: Route `handleMessage` through it**

Replace the body of `handleMessage` from the `raw :=` lines onward:

```go
	share, ok := ShareFromUpdate(m, func(fileID string) ([]byte, error) {
		return a.downloadFile(fileID)
	})
	if !ok {
		return
	}
	if _, err := a.Service.CaptureShare(context.Background(), share); err != nil {
		a.logf("telegram: capture: %v", err)
	}
```

Keep the owner check at the top of `handleMessage` unchanged.

- [ ] **Step 6: Implement `downloadFile`**

```go
// maxTelegramFile caps a downloaded Telegram payload. Telegram bots accept
// up to 20MB via getFile; the cap keeps a malformed response from exhausting
// memory.
const maxTelegramFile = 20 << 20

// downloadFile fetches a file's bytes through the getFile endpoint. The URL
// it returns is only valid briefly, so it is fetched immediately.
func (a *Adapter) downloadFile(fileID string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	raw, err := a.call(ctx, "getFile", map[string]any{"file_id": fileID})
	if err != nil {
		return nil, err
	}
	var meta struct {
		FilePath string `json:"file_path"`
	}
	if err := json.Unmarshal(raw, &meta); err != nil {
		return nil, err
	}
	if meta.FilePath == "" {
		return nil, fmt.Errorf("telegram: getFile returned no path for %s", fileID)
	}
	durl := fmt.Sprintf("%s/file/bot%s/%s", a.apiBase(), a.Token, meta.FilePath)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, durl, nil)
	if err != nil {
		return nil, err
	}
	resp, err := a.httpClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("telegram: download %s: status %d", meta.FilePath, resp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(resp.Body, maxTelegramFile))
}
```

- [ ] **Step 7: Run tests**

Run: `go test ./internal/channel/telegram/ -v`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add internal/channel/telegram/
git commit -m "feat(telegram): ingest photos, voice, audio, video and documents"
```

---

## Task 8: Web capture and media endpoints

**Files:**
- Create: `internal/web/capture.go`, `internal/web/capture_test.go`
- Modify: `internal/web/web.go`

**Interfaces:**
- Consumes: `core.Service.CaptureShare` (Task 6), `config.Config` (Task 1).
- Produces: `POST /api/v1/capture` (multipart: `file`, `text`/`url`), `GET /api/v1/media/{name}`.
- Requires: `api` struct gains `uploadDir string`, `maxUpload int64`; `web.New` signature grows to `New(store, svc, publicURL, cfg config.Config) http.Handler` — update the single call site in `cmd/sparkkeep/main.go`.

- [ ] **Step 1: Write the failing test**

Create `internal/web/capture_test.go`:

```go
package web

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"sparkkeep/internal/config"
	"sparkkeep/internal/core"
	"sparkkeep/internal/store"
)

func testHandler(t *testing.T, uploadDir string) (http.Handler, *store.Store) {
	t.Helper()
	st, err := store.New(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatalf("store.New: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	svc := core.New(st, config.Config{
		LLMModel: "m", LLMBase: "http://127.0.0.1:1/v1",
		ASRURL: "", HeadlessEnabled: false,
	}, t.Logf)
	cfg := config.Config{UploadDir: uploadDir, MaxUploadMB: 1}
	return New(st, svc, "http://localhost:8080", cfg), st
}

func multipartBody(t *testing.T, fields map[string]string, fileField, fileName, fileMime string, fileData []byte) (io.Reader, string) {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	for k, v := range fields {
		if err := mw.WriteField(k, v); err != nil {
			t.Fatal(err)
		}
	}
	if fileField != "" {
		fw, err := mw.CreateFormFile(fileField, fileName)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := fw.Write(fileData); err != nil {
			t.Fatal(err)
		}
	}
	if err := mw.Close(); err != nil {
		t.Fatal(err)
	}
	return &buf, mw.FormDataContentType()
}

func TestCaptureRejectsEmpty(t *testing.T) {
	h, _ := testHandler(t, t.TempDir())
	req := httptest.NewRequest("POST", "/api/v1/capture", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("code = %d, want 400", rec.Code)
	}
}

func TestCaptureRejectsOversizedUpload(t *testing.T) {
	h, _ := testHandler(t, t.TempDir())
	body, ct := multipartBody(t, nil, "file", "big.bin", "application/octet-stream", make([]byte, 2<<20))
	req := httptest.NewRequest("POST", "/api/v1/capture", body)
	req.Header.Set("Content-Type", ct)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusRequestEntityTooLarge && rec.Code != http.StatusBadRequest {
		t.Errorf("code = %d, want 413 or 400", rec.Code)
	}
	// Nothing must be left on disk.
	entries, _ := os.ReadDir(h.(interface{ uploadPath() string }).uploadPath())
	_ = entries
}

func TestMediaServesUploadedFile(t *testing.T) {
	dir := t.TempDir()
	h, _ := testHandler(t, dir)
	if err := os.WriteFile(filepath.Join(dir, "abc.jpg"), []byte("JPEGDATA"), 0o644); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("GET", "/api/v1/media/abc.jpg", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d, want 200", rec.Code)
	}
	if rec.Body.String() != "JPEGDATA" {
		t.Errorf("body = %q", rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "image/jpeg" {
		t.Errorf("content-type = %q, want image/jpeg", ct)
	}
}

func TestMediaRejectsTraversal(t *testing.T) {
	dir := t.TempDir()
	h, _ := testHandler(t, dir)
	req := httptest.NewRequest("GET", "/api/v1/media/..%2F..%2Fetc%2Fpasswd", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code == http.StatusOK {
		t.Error("path traversal was served, want rejection")
	}
}
```

Add `io` to the test imports. Note: `core.New` with an unreachable LLM means the card will take the `failCard` path — that still returns 200 with `card_ids`, which is what the status assertions above rely on.

- [ ] **Step 2: Run to verify it fails**

Run: `go test ./internal/web/ -run 'TestCapture|TestMedia' -v`
Expected: FAIL to compile — `New` arity mismatch, handlers undefined.

- [ ] **Step 3: Widen `api` and `New` in `web.go`**

```go
type api struct {
	store     port.Store
	svc       *core.Service
	public    string
	uploadDir string
	maxUpload int64
}

func New(store port.Store, svc *core.Service, publicURL string, cfg config.Config) http.Handler {
	a := &api{
		store: store, svc: svc, public: publicURL,
		uploadDir: cfg.UploadDir,
		maxUpload: int64(cfg.MaxUploadMB) << 20,
	}
	if a.maxUpload <= 0 {
		a.maxUpload = 25 << 20
	}
	mux := http.NewServeMux()
	// ... existing routes ...
	mux.HandleFunc("POST /api/v1/capture", a.capture)
	mux.HandleFunc("GET /api/v1/media/{name}", a.media)
	return withCORS(mux)
}
```

Add `sparkkeep/internal/config` to `web.go`'s imports. Update `cmd/sparkkeep/main.go`'s call to pass `cfg`.

- [ ] **Step 4: Create `internal/web/capture.go`**

```go
package web

import (
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"sparkkeep/internal/capture"
)

// capture accepts a paste/paste-or-upload in one multipart request: an
// optional `file` part and an optional `text` or `url` field. At least one
// is required. Everything runs through the same core pipeline as Telegram.
func (a *api) capture(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, a.maxUpload+(1<<20))
	if err := r.ParseMultipartForm(4 << 20); err != nil {
		writeErr(w, http.StatusBadRequest, "bad multipart: "+err.Error())
		return
	}
	defer r.MultipartForm.RemoveAll()

	raw := strings.TrimSpace(r.FormValue("url"))
	if raw == "" {
		raw = strings.TrimSpace(r.FormValue("text"))
	}

	files, ferr := a.readFiles(r.MultipartForm)
	if ferr != nil {
		writeErr(w, http.StatusBadRequest, ferr.Error())
		return
	}

	var share capture.Share
	switch {
	case raw != "":
		share = capture.Recognize(raw)
		if len(files) > 0 {
			// A link with an attached image: keep the link, add the file so
			// its visual content is read too.
			share.Files = files
		}
	case len(files) > 0:
		kind := capture.KindFile
		if len(files) == 1 {
			kind = capture.KindForMime(files[0].Mime)
		}
		share = capture.Share{Kind: kind, Files: files}
	default:
		writeErr(w, http.StatusBadRequest, "provide a file, url, or text")
		return
	}

	ids, err := a.svc.CaptureShare(r.Context(), share)
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "card_ids": ids})
}

// readFiles extracts every uploaded file part, rejecting anything over the
// configured cap. The cap is enforced again per file because MaxBytesReader
// covers the whole request, not each part.
func (a *api) readFiles(f *multipart.Form) ([]capture.File, error) {
	if f == nil || len(f.File) == 0 {
		return nil, nil
	}
	var out []capture.File
	for _, headers := range f.File {
		for _, h := range headers {
			fh, err := h.Open()
			if err != nil {
				return nil, err
			}
			data, rerr := io.ReadAll(io.LimitReader(fh, a.maxUpload+1))
			fh.Close()
			if rerr != nil {
				return nil, rerr
			}
			if int64(len(data)) > a.maxUpload {
				return nil, &tooLargeError{name: h.Filename}
			}
			out = append(out, capture.File{
				Name: filepath.Base(h.Filename),
				Mime: h.Header.Get("Content-Type"),
				Data: data,
			})
		}
	}
	return out, nil
}

type tooLargeError struct{ name string }

func (e *tooLargeError) Error() string {
	return "file too large: " + e.name
}

// media serves a retained upload. filepath.Base is the sanitisation that
// prevents traversal: a name containing separators can only ever resolve to a
// file directly inside uploadDir.
func (a *api) media(w http.ResponseWriter, r *http.Request) {
	name := filepath.Base(r.PathValue("name"))
	if name == "" || name == "." || name == "/" || a.uploadDir == "" {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	full := filepath.Join(a.uploadDir, name)
	if _, err := os.Stat(full); err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	f, err := os.Open(full)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	defer f.Close()
	if ct := ctByExt(name); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	http.ServeContent(w, r, name, time.Time{}, f)
}

func ctByExt(name string) string {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	case ".mp4":
		return "video/mp4"
	case ".pdf":
		return "application/pdf"
	case ".ogg":
		return "audio/ogg"
	case ".wav":
		return "audio/wav"
	case ".webm":
		return "audio/webm"
	}
	return ""
}
```

Add the `time` import. Map `*tooLargeError` to 413 at the top of `capture`:

```go
	var tl *tooLargeError
	if errors.As(ferr, &tl) {
		writeErr(w, http.StatusRequestEntityTooLarge, tl.Error())
		return
	}
```

(Add `errors` to the imports.)

- [ ] **Step 5: Fix the test's traversal-cleanup assertion**

Replace the odd `h.(interface{ uploadPath() string })` line in `TestCaptureRejectsOversizedUpload` with a direct directory check:

```go
	entries, _ := os.ReadDir(dir)
	if len(entries) != 0 {
		t.Errorf("oversized upload left %d files on disk", len(entries))
	}
```

and pass `dir := t.TempDir()` to `testHandler`.

- [ ] **Step 6: Run the web tests**

Run: `go test ./internal/web/ -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add internal/web/ cmd/sparkkeep/main.go
git commit -m "feat(web): multipart capture endpoint and retained media serving"
```

---

## Task 9: Graph query and endpoint

**Files:**
- Create: `internal/store/graph.go`, `internal/store/graph_test.go`, `internal/web/graph.go`, `internal/web/graph_test.go`
- Modify: `internal/port/model.go`

**Interfaces:**
- Produces:
  - `port.Graph{ Nodes []GraphNode; Edges []GraphEdge }`
  - `port.GraphNode{ ID, Label, Type string; Weight int }`
  - `port.GraphEdge{ From, To, Kind string; Weight int }`
  - `port.TagCoOccurrence(ctx, minWeight int) ([]TagPair, error)` — added to the `Store` interface
  - `port.TagPair{A, B string; Weight int}`
  - `GET /api/v1/graph?limit=500`

- [ ] **Step 1: Write the failing store test**

Create `internal/store/graph_test.go`:

```go
package store

import (
	"context"
	"path/filepath"
	"testing"

	"sparkkeep/internal/port"
)

func newGraphStore(t *testing.T) *Store {
	t.Helper()
	s, err := New(filepath.Join(t.TempDir(), "g.db"))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestTagCoOccurrence(t *testing.T) {
	ctx := context.Background()
	s := newGraphStore(t)

	mk := func(tags ...string) {
		t.Helper()
		c, err := s.CreateCard(ctx, port.Card{Title: "t", Summary: "s", Horizon: port.HorizonShortTerm, Tags: tags})
		if err != nil {
			t.Fatal(err)
		}
		_ = c
	}
	mk("go", "concurrency")
	mk("go", "concurrency")
	mk("go", "http")
	mk("rust", "concurrency")

	pairs, err := s.TagCoOccurrence(ctx, 2)
	if err != nil {
		t.Fatalf("TagCoOccurrence: %v", err)
	}
	found := false
	for _, p := range pairs {
		if (p.A == "concurrency" && p.B == "go" || p.A == "go" && p.B == "concurrency") && p.Weight == 3 {
			found = true
		}
	}
	if !found {
		t.Errorf("want go+concurrency weight 3, got %+v", pairs)
	}
	for _, p := range pairs {
		if p.Weight < 2 {
			t.Errorf("pair %+v below the threshold leaked through", p)
		}
	}
}

func TestTagCoOccurrenceEmpty(t *testing.T) {
	s := newGraphStore(t)
	pairs, err := s.TagCoOccurrence(context.Background(), 2)
	if err != nil {
		t.Fatalf("TagCoOccurrence: %v", err)
	}
	if len(pairs) != 0 {
		t.Errorf("want no pairs, got %+v", pairs)
	}
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `go test ./internal/store/ -run TestTagCoOccurrence -v`
Expected: FAIL to compile — `TagCoOccurrence` undefined.

- [ ] **Step 3: Add the port types**

In `internal/port/model.go`:

```go
// TagPair is two tags that appear together on N cards.
type TagPair struct {
	A      string
	B      string
	Weight int
}

// GraphNode is one vertex: a card ("card:12") or a tag ("tag:go").
type GraphNode struct {
	ID     string `json:"id"`
	Label  string `json:"label"`
	Type   string `json:"type"`
	Weight int    `json:"weight"`
}

// GraphEdge is a link between two nodes. Kind is "has" (card→tag)
// or "with" (tag→tag, weight = shared card count).
type GraphEdge struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Kind   string `json:"kind"`
	Weight int    `json:"weight"`
}

type Graph struct {
	Nodes []GraphNode `json:"nodes"`
	Edges []GraphEdge `json:"edges"`
}
```

Add `TagCoOccurrence(ctx context.Context, minWeight int) ([]TagPair, error)` to the `Store` interface.

- [ ] **Step 4: Implement `internal/store/graph.go`**

```go
package store

import (
	"context"
	"fmt"

	"sparkkeep/internal/port"
)

// maxTagPairs caps the co-occurrence result. A library with a few thousand
// cards can produce millions of tag pairs; the graph is only readable with
// the strongest ones, so the ORDER BY / LIMIT happens in the database rather
// than in Go.
//
// ponytail: one global weight threshold and one LIMIT. If a large library
// needs per-tag-neighbourhood budgets, add a window function here.
const maxTagPairs = 400

// TagCoOccurrence returns tag pairs sharing at least minWeight cards, capped
// at maxTagPairs and ordered by descending weight. minWeight below 1 is
// treated as 1.
func (s *Store) TagCoOccurrence(ctx context.Context, minWeight int) ([]port.TagPair, error) {
	if minWeight < 1 {
		minWeight = 1
	}
	const q = `
		SELECT ta.name, tb.name, COUNT(*) AS w
		FROM cards_tags ca
		JOIN cards_tags cb ON ca.card_id = cb.card_id AND ca.tag_id < cb.tag_id
		JOIN tags ta ON ta.id = ca.tag_id
		JOIN tags tb ON tb.id = cb.tag_id
		GROUP BY ta.name, tb.name
		HAVING w >= ?
		ORDER BY w DESC, ta.name, tb.name
		LIMIT ?`
	rows, err := s.db.QueryContext(ctx, q, minWeight, maxTagPairs)
	if err != nil {
		return nil, fmt.Errorf("store: tag co-occurrence: %w", err)
	}
	defer rows.Close()
	var out []port.TagPair
	for rows.Next() {
		var p port.TagPair
		if err := rows.Scan(&p.A, &p.B, &p.Weight); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
```

- [ ] **Step 5: Run store tests**

Run: `go test ./internal/store/ -v`
Expected: PASS.

- [ ] **Step 5a: Add `TagCoOccurrence` to both stub stores**

Widening `port.Store` breaks every fake implementing it. There are two, in different packages: `internal/core/core_test.go` and `internal/web/web_test.go`, each with its own `stubStore` holding `cards map[int64]port.Card`. Add this to **both** files (they are separate packages, so it must be duplicated):

```go
// TagCoOccurrence computes tag pairs from the in-memory cards, mirroring the
// store's aggregation: distinct tag pairs sharing at least minWeight cards.
func (s *stubStore) TagCoOccurrence(_ context.Context, minWeight int) ([]port.TagPair, error) {
	if minWeight < 1 {
		minWeight = 1
	}
	counts := map[[2]string]int{}
	for _, c := range s.cards {
		if c.Status == port.StatusDismissed || c.Status == port.StatusShelved {
			continue
		}
		sorted := append([]string(nil), c.Tags...)
		sort.Strings(sorted)
		for i := range sorted {
			for j := i + 1; j < len(sorted); j++ {
				counts[[2]string{sorted[i], sorted[j]}]++
			}
		}
	}
	var out []port.TagPair
	for k, w := range counts {
		if w >= minWeight {
			out = append(out, port.TagPair{A: k[0], B: k[1], Weight: w})
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Weight != out[j].Weight {
			return out[i].Weight > out[j].Weight
		}
		if out[i].A != out[j].A {
			return out[i].A < out[j].A
		}
		return out[i].B < out[j].B
	})
	return out, nil
}
```

Add `sort` to each test file's imports if absent. Run: `go build ./... && go test ./... 2>&1 | head -20`
Expected: everything compiles again. If a third `port.Store` implementation turns up, give it the same method.

- [ ] **Step 6: Write the failing web test**

Append to `internal/web/web_test.go`. Reuse the existing `webHandler(st, svc)` and `doJSON(t, h, method, path, body)` helpers — do not add a new test harness:

```go
func TestGraphEndpointShape(t *testing.T) {
	st := newStubStore()
	ctx := context.Background()
	for _, tags := range [][]string{
		{"go", "concurrency"},
		{"go", "concurrency"},
		{"rust", "concurrency"},
	} {
		if _, err := st.CreateCard(ctx, port.Card{
			Title: "card " + tags[0], Summary: "s",
			Horizon: port.HorizonShortTerm, Tags: tags,
		}); err != nil {
			t.Fatal(err)
		}
	}
	h := webHandler(st, &core.Service{Logf: t.Logf})
	rec := doJSON(t, h, "GET", "/api/v1/graph?limit=100", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var got struct {
		OK    bool       `json:"ok"`
		Graph port.Graph `json:"graph"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !got.OK {
		t.Fatal("ok = false")
	}
	cards, tags, with := 0, 0, 0
	for _, n := range got.Graph.Nodes {
		switch n.Type {
		case "card":
			cards++
		case "tag":
			tags++
		}
		if n.ID == "" || n.Label == "" {
			t.Errorf("node missing id/label: %+v", n)
		}
	}
	for _, e := range got.Graph.Edges {
		if e.Kind == "with" {
			with++
		}
	}
	if cards != 3 || tags != 3 {
		t.Errorf("nodes: %d cards, %d tags; want 3 and 3", cards, tags)
	}
	// go~concurrency (2 cards) and rust~concurrency (2 cards) clear the
	// threshold; go~rust appears on one card only and must not.
	if with != 2 {
		t.Errorf("co-occurrence edges = %d, want 2", with)
	}
	// Every edge endpoint must be a declared node or the renderer draws to
	// nowhere.
	known := map[string]bool{}
	for _, n := range got.Graph.Nodes {
		known[n.ID] = true
	}
	for _, e := range got.Graph.Edges {
		if !known[e.From] || !known[e.To] {
			t.Errorf("edge %s->%s references an undeclared node", e.From, e.To)
		}
	}
}

// Review Focus: shelved and dismissed cards are noise and must stay out.
func TestGraphExcludesShelvedAndDismissed(t *testing.T) {
	st := newStubStore()
	ctx := context.Background()
	for _, status := range []string{port.StatusInbox, port.StatusShelved, port.StatusDismissed} {
		if _, err := st.CreateCard(ctx, port.Card{
			Title: "card " + status, Summary: "s", Status: status,
			Horizon: port.HorizonShortTerm, Tags: []string{status},
		}); err != nil {
			t.Fatal(err)
		}
	}
	h := webHandler(st, &core.Service{Logf: t.Logf})
	rec := doJSON(t, h, "GET", "/api/v1/graph?limit=100", "")
	var got struct {
		Graph port.Graph `json:"graph"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	for _, n := range got.Graph.Nodes {
		if n.Type == "card" && (strings.Contains(n.Label, "shelved") || strings.Contains(n.Label, "dismissed")) {
			t.Errorf("node %q must not appear in the graph", n.Label)
		}
	}
}

func TestGraphRejectsBadLimit(t *testing.T) {
	h := webHandler(newStubStore(), &core.Service{Logf: t.Logf})
	rec := doJSON(t, h, "GET", "/api/v1/graph?limit=abc", "")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("code = %d, want 400", rec.Code)
	}
}
```

Add `encoding/json` to imports if absent (`strings`, `net/http`, `testing`, and `core` are already imported by this file).

- [ ] **Step 7: Run to verify it fails**

Run: `go test ./internal/web/ -run TestGraph -v`
Expected: FAIL — route not registered, 404.

- [ ] **Step 8: Create `internal/web/graph.go`**

```go
package web

import (
	"net/http"
	"strconv"

	"sparkkeep/internal/port"
)

const (
	defaultGraphLimit = 500
	maxGraphLimit     = 2000
	// graphMinWeight is the shared-card threshold for a tag-tag edge. At 2 a
	// pair means something; at 1 the graph is a hairball.
	graphMinWeight = 2
)

// graph returns the whole knowledge graph: every visible card as a node, the
// tags in use as nodes, a "has" edge per card-tag membership, and a "with"
// edge per tag pair that appears on at least graphMinWeight cards.
//
// Everything is derived at request time from the existing cards/tags tables —
// there is no edge table to maintain.
func (a *api) graph(w http.ResponseWriter, r *http.Request) {
	limit := defaultGraphLimit
	if v := r.URL.Query().Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n <= 0 {
			writeErr(w, http.StatusBadRequest, "invalid limit: "+v)
			return
		}
		if n > maxGraphLimit {
			n = maxGraphLimit
		}
		limit = n
	}

	// Only cards in an actionable state belong in a knowledge graph; dismissed
	// and shelved cards are noise. Every live status is fetched — filtering on
	// inbox alone would hide doing/done cards, and gating the extra queries on
	// len(cards) == limit would skip them on any library smaller than the limit.
	var cards []port.Card
	for _, status := range []string{port.StatusInbox, port.StatusDoing, port.StatusDone} {
		got, err := a.store.ListCards(r.Context(), port.CardFilter{Status: status, Limit: limit})
		if err != nil {
			a.fail(w, err)
			return
		}
		cards = append(cards, got...)
	}
	if len(cards) > limit {
		cards = cards[:limit]
	}

	g := port.Graph{Nodes: []port.GraphNode{}, Edges: []port.GraphEdge{}}
	tagSeen := map[string]bool{}
	for _, c := range cards {
		cid := "card:" + strconv.FormatInt(c.ID, 10)
		g.Nodes = append(g.Nodes, port.GraphNode{
			ID: cid, Label: c.Title, Type: "card", Weight: len(c.Tags),
		})
		for _, t := range c.Tags {
			tid := "tag:" + t
			if !tagSeen[tid] {
				tagSeen[tid] = true
				g.Nodes = append(g.Nodes, port.GraphNode{ID: tid, Label: t, Type: "tag"})
			}
			g.Edges = append(g.Edges, port.GraphEdge{From: cid, To: tid, Kind: "has", Weight: 1})
		}
	}

	pairs, err := a.store.TagCoOccurrence(r.Context(), graphMinWeight)
	if err != nil {
		a.fail(w, err)
		return
	}
	tagWeight := map[string]int{}
	for _, p := range pairs {
		aid, bid := "tag:"+p.A, "tag:"+p.B
		// Co-occurrence is a global query but the node set is not, so drop
		// pairs whose endpoints were not selected. Otherwise the renderer
		// receives edges pointing at nodes that do not exist.
		if !tagSeen[aid] || !tagSeen[bid] {
			continue
		}
		tagWeight[aid] += p.Weight
		tagWeight[bid] += p.Weight
		g.Edges = append(g.Edges, port.GraphEdge{From: aid, To: bid, Kind: "with", Weight: p.Weight})
	}
	// A tag on a single card has weight 0 and is still reachable through its
	// "has" edge, so every selected tag stays a node.
	for i := range g.Nodes {
		if g.Nodes[i].Type == "tag" {
			g.Nodes[i].Weight = tagWeight[g.Nodes[i].ID]
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "graph": g})
}
```

- [ ] **Step 9: Register the route and run**

Add to `web.go`'s mux: `mux.HandleFunc("GET /api/v1/graph", a.graph)`.

Run: `go test ./internal/web/ -v`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add internal/store/ internal/port/ internal/web/
git commit -m "feat(graph): tag co-occurrence query and knowledge graph endpoint"
```

---

## Task 10: Frontend — capture box and graph view

**Files:**
- Create: `frontend/src/components/CaptureBox.tsx`, `frontend/src/components/GraphView.tsx`
- Modify: `frontend/src/types.ts`, `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/components/Header.tsx`, `frontend/src/App.css`

**Interfaces:**
- Consumes: `POST /api/v1/capture` and `GET /api/v1/graph` (Tasks 8, 9).
- Produces: `api.captureText(raw)`, `api.captureFile(file)`, `api.fetchGraph(limit)`; `GraphView` and `CaptureBox` components.

- [ ] **Step 1: Add the types**

Append to `frontend/src/types.ts`:

```ts
export interface GraphNode {
  id: string;
  label: string;
  type: 'card' | 'tag';
  weight: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: 'has' | 'with';
  weight: number;
}

export interface GraphData {
  ok: boolean;
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
}
```

- [ ] **Step 2: Add the API functions**

Append to `frontend/src/api.ts`:

```ts
import { GraphData } from './types';

export async function captureText(raw: string): Promise<number[]> {
  const fd = new FormData();
  fd.set('text', raw);
  const res = await request<{ ok: boolean; card_ids: number[] }>('/api/v1/capture', {
    method: 'POST',
    body: fd,
  });
  return res.card_ids || [];
}

export async function captureFile(file: File | Blob, name?: string): Promise<number[]> {
  const fd = new FormData();
  fd.set('file', file, name ?? (file instanceof File ? file.name : 'capture'));
  const res = await request<{ ok: boolean; card_ids: number[] }>('/api/v1/capture', {
    method: 'POST',
    body: fd,
  });
  return res.card_ids || [];
}

export async function fetchGraph(limit = 500): Promise<GraphData['graph']> {
  const res = await request<GraphData>(`/api/v1/graph?limit=${limit}`);
  return res.graph || { nodes: [], edges: [] };
}
```

Note: do **not** set `Content-Type` on these — the browser must set the multipart boundary itself.

- [ ] **Step 3: Create `CaptureBox.tsx`**

```tsx
import React, { useCallback, useRef, useState } from 'react';
import { Upload, Mic, Square, Loader2, Link2 } from 'lucide-react';
import * as api from '../api';

interface Props {
  onCaptured: (ids: number[]) => void;
  onError: (msg: string) => void;
}

export const CaptureBox: React.FC<Props> = ({ onCaptured, onError }) => {
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [drag, setDrag] = useState(false);
  const [text, setText] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const send = useCallback(async (fn: () => Promise<number[]>) => {
    setBusy(true);
    try {
      const ids = await fn();
      if (ids.length) onCaptured(ids);
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }, [onCaptured, onError]);

  const handleFiles = useCallback((files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    // Only the first file per submission: the API captures one media payload
    // per request, and sending a burst of images would be ambiguous.
    send(() => api.captureFile(list[0]));
  }, [send]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  // A pasted screenshot arrives as a File on the clipboard, so the paste
  // handler covers "copy image from anywhere" with no extra UI.
  const onPaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const img = items.find((i) => i.type.startsWith('image/'));
    if (img) {
      e.preventDefault();
      const f = img.getAsFile();
      if (f) handleFiles([f]);
      return;
    }
    const text = e.clipboardData.getData('text');
    if (text.trim()) send(() => api.captureText(text));
  }, [handleFiles, send]);

  const submitText = useCallback(() => {
    const raw = text.trim();
    if (!raw) return;
    setText('');
    send(() => api.captureText(raw));
  }, [send, text]);

  const toggleRecord = useCallback(async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        if (blob.size) send(() => api.captureFile(blob, 'voice.webm'));
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch (e: any) {
      onError('microphone: ' + e.message);
    }
  }, [recording, send, onError]);

  return (
    <div
      className={`capture-box${drag ? ' drag' : ''}`}
      onDrop={onDrop}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onPaste={onPaste}
      tabIndex={0}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*,audio/*,video/*,.pdf,.txt,.md"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
      {/* A real paste field, not window.prompt: it stays visible so the user
          can see what they pasted, and it keeps focus while typing. */}
      <input
        className="capture-text"
        value={text}
        placeholder="Paste a link or a note…"
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submitText();
          }
        }}
      />
      <div className="capture-actions">
        <button
          className="btn"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          title="Upload an image, audio, video, or document"
        >
          {busy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
          Attach
        </button>
        <button
          className={`btn${recording ? ' recording' : ''}`}
          onClick={toggleRecord}
          title={recording ? 'Stop recording' : 'Record a voice note'}
        >
          {recording ? <Square size={14} /> : <Mic size={14} />}
          {recording ? 'Stop' : 'Voice'}
        </button>
        <button
          className="btn primary"
          disabled={busy || !text.trim()}
          onClick={submitText}
          title="Capture a link or a note"
        >
          <Link2 size={14} />
          Capture
        </button>
      </div>
      <p className="capture-hint">
        Drop, paste, or attach — images are read by vision, audio and video are
        transcribed, links are fetched.
      </p>
    </div>
  );
};
```

- [ ] **Step 4: Create `GraphView.tsx`**

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GraphNode, GraphEdge } from '../types';
import * as api from '../api';

interface Props {
  onSelectCard: (id: number) => void;
  onSelectTag: (tag: string) => void;
}

interface Sim {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  node: GraphNode;
}

const W = 900;
const H = 620;

/**
 * GraphView draws the knowledge graph as plain SVG with a small
 * force simulation run in a requestAnimationFrame loop. Deliberately
 * dependency-free: D3 would be larger than the whole simulation, and this
 * is the only visualisation in the app that needs layout.
 */
export const GraphView: React.FC<Props> = ({ onSelectCard, onSelectTag }) => {
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({
    nodes: [], edges: [],
  });
  const [tick, setTick] = useState(0);
  const simRef = useRef<Sim[]>([]);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    let alive = true;
    api.fetchGraph(500)
      .then((g) => { if (alive) setGraph(g); })
      .catch(() => setGraph({ nodes: [], edges: [] }));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    // Deterministic ring seeding: repeatable layout, no random jitter between
    // renders.
    const n = graph.nodes.length;
    simRef.current = graph.nodes.map((node, i) => {
      const angle = (2 * Math.PI * i) / Math.max(n, 1);
      const radius = Math.min(W, H) / 2 - 40;
      return {
        id: node.id,
        x: W / 2 + radius * Math.cos(angle),
        y: H / 2 + radius * Math.sin(angle),
        vx: 0, vy: 0,
        r: node.type === 'tag' ? 5 + Math.min(node.weight, 12) : 7,
        node,
      };
    });
    setRunning(true);
  }, [graph]);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const step = () => {
      const sims = simRef.current;
      const byId = new Map(sims.map((s) => [s.id, s]));

      // Repulsion. O(n^2) is fine for the few hundred nodes the endpoint
      // caps at; swap for a grid if a library ever reaches thousands.
      for (let i = 0; i < sims.length; i++) {
        for (let j = i + 1; j < sims.length; j++) {
          const a = sims[i], b = sims[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) { dx = (i - j) * 0.5 + 0.5; dy = 0.5; d2 = 0.5; }
          const f = 900 / d2;
          const d = Math.sqrt(d2);
          a.vx -= (dx / d) * f; a.vy -= (dy / d) * f;
          b.vx += (dx / d) * f; b.vy += (dy / d) * f;
        }
      }
      // Spring attraction along edges; "with" edges pull harder than "has".
      for (const e of graph.edges) {
        const a = byId.get(e.from), b = byId.get(e.to);
        if (!a || !b) continue;
        const k = e.kind === 'with' ? 0.02 * e.weight : 0.006;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        a.vx += (dx / d) * k * 40; a.vy += (dy / d) * k * 40;
        b.vx -= (dx / d) * k * 40; b.vy -= (dy / d) * k * 40;
      }
      let moving = false;
      for (const s of sims) {
        s.vx += (W / 2 - s.x) * 0.0012;
        s.vy += (H / 2 - s.y) * 0.0012;
        s.vx *= 0.82; s.vy *= 0.82;
        s.x += s.vx; s.y += s.vy;
        if (Math.abs(s.vx) + Math.abs(s.vy) > 0.05) moving = true;
      }
      setTick((t) => t + 1);
      if (moving) raf = requestAnimationFrame(step);
      else setRunning(false);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [graph, running]);

  const pos = useMemo(() => {
    const m = new Map<string, Sim>();
    for (const s of simRef.current) m.set(s.id, s);
    return m;
  }, [graph, tick]);

  if (!graph.nodes.length) {
    return <p className="empty">Nothing to map yet — capture a few things with shared tags.</p>;
  }

  return (
    <div className="graph-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="graph-svg">
        <g>
          {graph.edges.map((e, i) => {
            const a = pos.get(e.from), b = pos.get(e.to);
            if (!a || !b) return null;
            return (
              <line
                key={i}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={e.kind === 'with' ? '#7aa2f7' : '#3b4261'}
                strokeWidth={e.kind === 'with' ? Math.min(e.weight, 4) * 0.6 : 1}
                opacity={e.kind === 'with' ? 0.7 : 0.4}
              />
            );
          })}
        </g>
        <g>
          {simRef.current.map((s) => (
            <g
              key={s.id}
              transform={`translate(${s.x},${s.y})`}
              onClick={() => {
                if (s.node.type === 'tag') onSelectTag(s.node.label);
                else onSelectCard(Number(s.node.id.split(':')[1]));
              }}
              style={{ cursor: 'pointer' }}
            >
              <circle
                r={s.r}
                fill={s.node.type === 'tag' ? '#7aa2f7' : '#e0af68'}
                opacity={0.9}
              />
              <text
                x={s.r + 4} y={4}
                fill="#c0caf5"
                fontSize={s.node.type === 'tag' ? 10 : 11}
              >
                {s.node.label.length > 26 ? s.node.label.slice(0, 25) + '…' : s.node.label}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
};
```

- [ ] **Step 5: Wire both into `App.tsx` and `Header.tsx`**

In `Header.tsx`, add a graph button alongside the existing digest button, following its existing prop pattern (`onClick`, `className` when active).

In `App.tsx`:
- widen the view union: `useState<'kanban' | 'triage' | 'digest' | 'graph' | 'capture'>('kanban')`
- import `CaptureBox` and `GraphView`
- render `<CaptureBox onCaptured={async () => { await loadCards(); await loadTags(); }} onError={showToast} />` above the board for the `capture` view
- render `<GraphView onSelectCard={(id) => api.fetchCard(id).then(setSelectedCard).catch((e) => showToast(e.message))} onSelectTag={(t) => { setSelectedTag(t); setViewMode('kanban'); }} />` for the `graph` view

- [ ] **Step 6: Add the CSS**

Append to `frontend/src/App.css`:

```css
.capture-box {
  border: 1px dashed #3b4261;
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 14px;
  background: #16161e;
  outline: none;
}
.capture-box.drag { border-color: #7aa2f7; background: #1a1b26; }
.capture-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.capture-box .btn.recording { background: #f7768e; color: #1a1b26; border-color: #f7768e; }
.capture-hint { margin: 8px 0 0; font-size: 12px; color: #565f89; }
.capture-text { width: 100%; box-sizing: border-box; margin-bottom: 8px; }
.btn.primary { border-color: #7aa2f7; color: #7aa2f7; }
.spin { animation: sk-spin 1s linear infinite; }
@keyframes sk-spin { to { transform: rotate(360deg); } }

.graph-wrap { width: 100%; overflow: auto; background: #1a1b26; border-radius: 8px; }
.graph-svg { width: 100%; height: auto; min-height: 480px; }
.empty { padding: 24px; color: #565f89; }
```

Adjust colours to match the existing palette in `App.css` if it differs.

- [ ] **Step 7: Build and lint the frontend**

Run: `cd frontend && npm run lint && npm run build`
Expected: both succeed; `internal/web/dist` is regenerated. Fix any pre-existing lint noise separately rather than mixing it into this commit.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/
git commit -m "feat(frontend): capture drop box and SVG knowledge graph view"
```

---

## Task 11: Container, config docs, and full verification

**Files:**
- Modify: `Dockerfile`, `.env.example`, `README.md`

- [ ] **Step 1: Add ffmpeg to the image**

In the `Dockerfile`, change the runtime `apk add` line to:

```dockerfile
RUN apk add --no-cache ca-certificates yt-dlp ffmpeg chromium font-noto-cjk
```

- [ ] **Step 2: Document the new environment variables**

Append to `.env.example`:

```
# --- multimodal ingestion ---
# Whisper-compatible /transcribe endpoint. Empty disables audio transcription.
SPARKKEEP_ASR_URL=http://whisper:9000
# Model hint for the ASR server; blank uses the server's default.
SPARKKEEP_ASR_MODEL=
# Model used to read images. Blank = SPARKKEEP_LLM_MODEL. Must support vision.
SPARKKEEP_VISION_MODEL=
# Netscape cookies.txt passed to yt-dlp. Required for Instagram.
SPARKKEEP_COOKIES_FILE=
# Where uploaded files are retained. Blank = <dir of SPARKKEEP_DB>/uploads
SPARKKEEP_UPLOAD_DIR=
# Max upload size in MB.
SPARKKEEP_MAX_UPLOAD_MB=25
# yt-dlp --sub-langs for YouTube transcripts.
SPARKKEEP_TRANSCRIPT_LANGS=en.*,en
# Explicit ffmpeg path. Blank = auto-detect.
SPARKKEEP_FFMPEG_BIN=
```

- [ ] **Step 3: Add the README rows and a section**

Add to the config table:

```markdown
| `SPARKKEEP_ASR_URL` | `http://whisper:9000` | whisper `/transcribe`; empty = no audio |
| `SPARKKEEP_VISION_MODEL` | = `SPARKKEEP_LLM_MODEL` | model used to read images (must support vision) |
| `SPARKKEEP_COOKIES_FILE` | `` | Netscape `cookies.txt` for yt-dlp — required for Instagram |
| `SPARKKEEP_UPLOAD_DIR` | `<dir(DB)>/uploads` | retained uploads |
| `SPARKKEEP_MAX_UPLOAD_MB` | `25` | upload cap |
| `SPARKKEEP_TRANSCRIPT_LANGS` | `en.*,en` | subtitle languages |
```

And a new section after "Weekly digest":

```markdown
## Multimodal capture

Drop, paste, or attach into the dashboard's **Capture** view, or send media
straight to the Telegram bot — both go through the same pipeline.

| Input | How it is read |
|-------|----------------|
| Link / text | fetched (chromium when gated) |
| YouTube | `yt-dlp` metadata + subtitles, capped at `SPARKKEEP_TRANSCRIPT_LANGS` |
| Instagram | `yt-dlp` **with `SPARKKEEP_COOKIES_FILE`**; captioned-embed as a fallback |
| Image | vision model, downscaled to 768px |
| Audio | whisper `/transcribe` |
| Video | `ffmpeg` → 16kHz mono wav → whisper |
| Document | read when text-like; PDFs record a note |

Anything that could not be read is recorded as an **extraction note** on the
card rather than being fed to the model as content, so a login wall or a
missing transcript can never become a confident-looking summary.

**Knowledge graph** — the **Graph** view renders every card and tag as nodes,
with a `has` edge per card/tag membership and a `with` edge per pair of tags
that appear together on at least two cards. Derived live; no stored edges.
```

- [ ] **Step 4: Full verification**

Run:

```bash
go build ./... && go vet ./... && go test ./... && cd frontend && npm run build
```

Expected: all pass, no new failures.

- [ ] **Step 5: Confirm no dependency drift**

```bash
git diff --stat go.mod go.sum frontend/package.json
```

Expected: **empty**. If anything appears, a task added a dependency by mistake — revert it and use stdlib.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .env.example README.md internal/web/dist
git commit -m "docs+build: ffmpeg in image, multimodal config reference"
```

---

## Manual Verification Against Live Services

Run after Task 11, with the stack up:

1. **YouTube with subtitles** — send a link to the bot; confirm the card summary
   reflects spoken content, not just the description.
2. **YouTube without subtitles** — confirm a card still appears and carries
   `no transcript available`.
3. **Instagram with `SPARKKEEP_COOKIES_FILE` set** — confirm the real caption
   lands. This is the case the whole change exists for.
4. **Instagram without cookies** — confirm a Note, a card, and no login-wall
   text in the summary. If login-wall text *does* appear, the `IsLoginWall`
   guard has a gap.
5. **A phone photo** — confirm the card reflects the image and the request does
   not take minutes.
6. **A voice note** — confirm a transcript-derived card.
7. **A short video file** — confirm the ffmpeg + whisper path.
8. **A 12MP photo on a 100-card library** — confirm the graph renders and
   `/api/v1/graph` responds quickly.
