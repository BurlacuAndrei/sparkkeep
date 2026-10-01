# sparkkeep — multimodal ingestion & knowledge graph

Date: 2026-10-01
Status: approved (design reviewed in chat; amended to include ffmpeg + whisper)

## 1. Problem

Today the pipeline is text-only, and an Instagram post shared to the bot
produces an essentially empty analysis. Three independent causes:

1. `internal/capture/capture.go` `MediaMeta` runs
   `yt-dlp --skip-download --dump-json`. Instagram requires login cookies, so
   this fails on essentially every post.
2. The chromedp fallback then loads the **login wall**, and that wall's text is
   promoted into `Fetched.Text` and analyzed as if it were content. It is long
   enough that `needsHeadlessFallback` never fires, so the garbage is treated
   as the real thing.
3. YouTube links get title and description only. Subtitles are never
   requested, so a transcript never exists.

Telegram photos are parsed into the update struct but never read;
`handleMessage` returns early when text and caption are both empty. There is no
`voice`, `audio`, or `document` field at all, so voice notes are structurally
invisible.

Categorization is a flat `tags` string list in a join table. No hierarchy, no
edges. Nothing to draw a mind map from.

### Goal

Accept text, links, images, audio, video, and files through either Telegram or
a web drop box; resolve each to real content; produce idea cards that reflect
what the input actually said; and expose the accumulated cards as a navigable
graph.

## 2. What already exists (no new dependencies)

Every capability required is already deployed and unused. Verified 2026-10-01.

| Need | Asset | Verification |
|------|-------|--------------|
| Read images | `gemma3:4b` reports `vision` in Ollama | `/api/tags` → `capabilities:["completion","vision"]` |
| Transcribe audio | `whisper` on `proxy_net`, `:9000` | `openapi.json` → `/transcribe` (multipart), `/health`, `/models` |
| Video transcripts | `yt-dlp 2024.12.03` in container | `--write-auto-subs`, `--sub-langs`, `--sub-format` present |
| Audio extraction from video | `ffmpeg` via `apk add` (new, one Dockerfile line) | — |
| Web research | SearXNG + chromedp | already wired |
| Headless rendering | `chromium` + `chromium-browser` in container | confirmed |

## 3. Design

### 3.1 The shape

The pipeline is already a clean one-way flow:

```
Recognize → Fetch → Analyze → Store → Notify
```

It is text-only for one reason: `capture.Share` can express `"link"` or
`"text"` and nothing else. The design widens the two data structures the
pipeline already passes around, rather than introducing a second pipeline.

### 3.2 `capture.Share` — what the user handed us

`Name` is renamed `Kind` because it now carries six values, not two.

```go
type Share struct {
    Kind    string   // "text" | "link" | "image" | "audio" | "video" | "file"
    URL     string
    Caption string
    Files   []File   // bytes handed to us, already in memory
}

type File struct {
    Name string
    Mime string
    Data []byte
}
```

`Data []byte` rather than a filesystem path: Telegram returns bytes over the
`getFile` API and the web path is size-capped, so there is no reason to
materialize a temp file that both callers would have to clean up. Uploads are
persisted only for retention (see 3.8), not for the extraction path.

`Recognize(raw string) Share` keeps its current behaviour and now returns
`Kind: "text" | "link"`. Media callers construct the `Share` directly; no new
constructor is introduced.

### 3.3 `capture.Fetched` — what we learned

```go
type Fetched struct {
    Kind        string
    URL         string
    Title       string
    Description string
    Text        string
    Caption     string
    Transcript  string   // NEW: YouTube subtitles or whisper output
    ImageDigest string   // NEW: the model's reading of attached image(s)
    Notes       []string // NEW: extraction warnings — NOT content
    Err         error
}
```

`Notes` is the root-cause fix for the class of bug in §1.2:

> **Anything that is not real content becomes a Note, never `Text`.**

The login wall, a failed metadata call, a missing transcript, an unreadable
image — all become Notes. `promptFor` instructs the model that Notes are
extraction warnings rather than content and that they should qualify the card.
Extraction failure is then visible in the output instead of silently becoming a
confident summary of a login page.

### 3.4 Link resolution order

`Capture.Fetch` for a `Kind: "link"` share, in order:

1. `yt-dlp --dump-json [--cookies $SPARKKEEP_COOKIES_FILE]` → `Title`,
   `Description`. On failure → Note `metadata unavailable`.
2. `yt-dlp --write-auto-subs --sub-langs $TRANSLANGS --sub-format vtt -o -` →
   `Transcript`, parsed from WebVTT by stripping cues/timestamps.
3. YouTube host with empty transcript → Note `no transcript available`; title
   and description are kept.
4. Instagram host where step 1 failed → best-effort caption via
   `https://www.instagram.com/p/{id}/embed/captioned/`. On failure → Note
   `instagram caption unavailable`.
5. `httpFetch` → `Text`.
6. Headless fallback → `Text`, **plus** a login-wall detector that converts
   detected wall text into a Note and leaves `Text` empty.
7. All steps failed → Notes only, `Text` empty.

**Cookies are the primary Instagram mechanism, not a fallback.** Verified
2026-10-01 from inside the container: the plain `GET` of `/embed/captioned/`
returns a 146KB JavaScript shell containing no caption markup and no
`og:description`; rendering it through chromium yields 248KB with still no
caption markup; `?__a=1&__d=dis` returns 500 and oEmbed returns 400. Instagram
has been progressively closing the login-free routes. The embed route is
therefore best-effort only.

**Known unverified point:** the caption node's class in a successfully rendered
embed page could not be confirmed, because no genuine post URL was available to
test against. Implementation must confirm the selector against a real post.
`og:description` is the guaranteed fallback, and a total miss degrades to a Note
rather than a failure.

### 3.5 Images → vision

`gemma3:4b` is already the configured model and already supports vision. Two
changes in `internal/analyze`:

- `doCompletion` types `messages` as `[]map[string]string`; widen to
  `[]map[string]any`. This is the only structural change required for
  OpenAI-compatible multi-part content, and it is shared by `Analyze` and `Ask`.
- New `func (c *Client) Describe(ctx, img capture.File, hint string) (string, error)`
  sends `[{"type":"text",...},{"type":"image_url","image_url":{"url":"data:<mime>;base64,..."}}]`
  with a small `max_tokens` and `temperature` 0.1.

`Describe` downscales to 768px on the long edge before encoding. A 12MP phone
photo through a 4B vision model on CPU is otherwise unpleasantly slow. Decoding
is stdlib `image.Decode` (jpeg/png/gif are registered by stdlib); scaling is a
shortest-edge nearest-neighbour loop using stdlib `image/draw`. No dependency.

Degradation: an error, or a reply shorter than ~20 characters, yields
`ImageDigest: ""` and a Note `image unreadable`. The card is still created.

`SPARKKEEP_VISION_MODEL` overrides the model for vision calls, defaulting to
`SPARKKEEP_LLM_MODEL`.

### 3.6 Audio and video → whisper

New package `internal/asr`, roughly 60 lines:

```go
type Client struct{ BaseURL, Model string; HTTP *http.Client }

func (c *Client) Transcribe(ctx context.Context, f capture.File) (string, error)
```

Multipart POST to `<BaseURL>/transcribe` with field `file`, response parsed as
`{"text": "..."}`. When `BaseURL` is empty the client returns `("", nil)` so
callers skip cleanly rather than branching on configuration everywhere.

Two input paths reach it:

- **Telegram voice / audio** — bytes arrive over the existing `getFile` API.
  Ogg/Opus and MP3 are handled by the existing whisper container.
- **Video** — `ffmpeg -i in -vn -ac 1 -ar 16000 -f wav out` extracts a 16kHz
  mono wav, which is then transcribed. `ffmpeg` is added to the Dockerfile via
  `apk add`. This is the one infrastructure addition in the design; it costs
  roughly 50MB of image size and is the cleanly droppable piece if the video
  path is later judged not worth it.

Unreachable or failing ASR yields Note `audio not transcribed`.

### 3.7 Files

Text-like files are read directly (`Text`). PDF text extraction is explicitly
out of scope — a Note `pdf: text not extracted` is emitted instead, so the card
records the filename and the fact that nothing was read.

### 3.8 Web capture

One new endpoint, `POST /api/v1/capture`, `multipart/form-data`:

- `file` part, optional, capped by `SPARKKEEP_MAX_UPLOAD_MB` (default 25). The
  existing `maxBodyBytes` constant is 1MB and applies only to JSON endpoints, so
  uploads get their own limit.
- `text` or `url` field, optional.
- At least one of the two required, else 400.

The endpoint calls `svc.CaptureShare(ctx, share)`.

`Service.CaptureShare` is the real entry point. `Service.Capture(ctx, raw string)`
is retained as a three-line wrapper over `Recognize` + `CaptureShare`, which
leaves the 647-line `core_test.go` and its twelve call sites untouched.

Uploads persist to `<dir(DB)>/uploads/<sha256[:16]>.<ext>` and are served by
`GET /api/v1/media/{name}`, which sanitises with `filepath.Base`. Content-hash
naming dedupes identical uploads for free. Retention exists because a card
captured from a photo is materially weaker if the photo cannot be seen.

No application-level authentication. Traefik with `authelia@docker` already
fronts every route.

### 3.9 Telegram

`handleMessage` stops dropping anything. The update struct gains `Voice`,
`Audio`, `Document`, and `Video` fields alongside the existing `Photo`. A
`ShareFromUpdate` helper maps the update to a `Share`:

- text or caption present → existing `Recognize` path
- media present → `Kind` derived from mime, with bytes fetched via `getFile`
- both → media `Share` with the caption attached

### 3.10 Knowledge graph

`GET /api/v1/graph?limit=500` returns nodes and edges.

```go
type GraphNode struct{ ID, Label, Type string; Weight int }
type GraphEdge struct{ From, To, Kind string; Weight int }
```

Node types are `card` and `tag`. Edge kinds are `has` (card→tag) and `with`
(tag→tag, weight = number of shared cards).

Two aggregates over existing tables:

- Cards and their tags come from the existing `ListCards`.
- Tag co-occurrence is a self-join on `cards_tags`:
  `a.tag_id = b.tag_id AND a.tag_id < b.tag_id GROUP BY 1,2 HAVING COUNT(*) >= 2`.

Tag→tag edges are filtered to the top N by weight so the graph stays readable.

**No new tables and no migrations.** A separate `category` column is
deliberately rejected: it would be a fourth way to express what a
frequently-used tag already says, and the graph already renders such a tag as a
hub node.

Frontend is an SVG force simulation of roughly 100 lines in `GraphView.tsx`.
No D3, no new npm dependencies.

## 4. Degradation table

| Situation | Outcome |
|-----------|---------|
| Instagram login wall | Note `instagram login wall — caption unavailable`, `Text` empty |
| yt-dlp failed | Note `metadata unavailable`, continue to embed route |
| YouTube, no subtitles | Note `no transcript available`, title/description kept |
| whisper unreachable | Note `audio not transcribed` |
| ffmpeg missing, video input | Note `video: audio extraction unavailable` |
| vision unhelpful | Note `image unreadable` |
| PDF | Note `pdf: text not extracted` |
| all extraction failed | existing `failCard` path → "Analysis failed" + Retry |

A card is always created, and it never claims content it does not have.

## 5. Configuration

| key | default | purpose |
|-----|---------|---------|
| `SPARKKEEP_ASR_URL` | `http://whisper:9000` | whisper base; an unreachable URL degrades to an `audio not transcribed` note |
| `SPARKKEEP_ASR_MODEL` | `` | server-side default when blank |
| `SPARKKEEP_VISION_MODEL` | = `SPARKKEEP_LLM_MODEL` | model for image reads |
| `SPARKKEEP_COOKIES_FILE` | `` | Netscape `cookies.txt` for yt-dlp |
| `SPARKKEEP_UPLOAD_DIR` | `<dir(DB)>/uploads` | retained uploads |
| `SPARKKEEP_MAX_UPLOAD_MB` | `25` | upload size cap |
| `SPARKKEEP_TRANSCRIPT_LANGS` | `en.*,en` | yt-dlp `--sub-langs` |

`SPARKKEEP_ASR_URL` defaults to the deployed whisper container because it is
verified reachable from the sparkkeep container on `proxy_net`. Point it
elsewhere to use a different whisper server. There is no disable switch: an
unreachable or misconfigured URL degrades to an `audio not transcribed` note
and the card is still created.

## 6. Testing

| File | Coverage |
|------|----------|
| `internal/capture/capture_test.go` | `Kind` classification, login-wall→Note (not `Text`), WebVTT parsing, embed HTML→caption |
| `internal/analyze/analyze_test.go` | `Describe` posts an `image_url` data URL; `promptFor` includes transcript/notes |
| `internal/asr/asr_test.go` (new) | multipart request shape against `httptest`, empty `BaseURL` returns `("", nil)` |
| `internal/core/core_test.go` | untouched — `Capture` keeps its signature |
| `internal/web/web_test.go` | `POST /api/v1/capture` multipart, oversized rejection, `GET /api/v1/graph` shape, `GET /api/v1/media/{name}` |
| `internal/channel/telegram/telegram_test.go` | photo/voice update → expected `Share.Kind` |

No store tests are added: the graph uses existing `ListCards` and no migration
is introduced.

## 7. Explicitly out of scope

- Embedding-based semantic card links. `nomic-embed-text` is deployed and
  unused, but this needs a column, a backfill, and re-embedding on every card
  edit. Deferred until tag co-occurrence proves too noisy.
- New database tables or migrations.
- A graph database, D3, or any new npm dependency.
- Application-level authentication.
- PDF text extraction.
- Instagram story and reel video download where cookies are not configured.
- Tag parent/child hierarchy.
