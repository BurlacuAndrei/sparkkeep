# sparkkeep — design

## 1. Pitch & scope

**Pitch.** Shorten the path from seeing an idea to doing it. You share a
post/link/repo/media from any device; sparkkeep analyzes it, splits it into
short idea cards, routes each into the right horizon (short-term actionable
vs lifetime bucket-list), and lets you act on it — from Telegram, then the
web dashboard.

**Form factor.** One Go binary. Capture + organize + dashboard in one
process. Telegram is the first *channel* (in/out), not the product — the
core speaks to a `Channel` interface so more channels can drop in later.

**Explicitly out of scope for v1 (YAGNI):**
- No user accounts / multi-tenant auth — single-user, single-instance.
- No Postgres — SQLite first, behind a thin storage boundary.
- No React/build toolchain — embedded static dashboard (stdlib net/http).
- No persistent agent infra — a research task is one bounded goroutine.
- No IG/FB deep scraping — auto-fetch what's open, paste caption otherwise.
- No self-hosted LLM router — BYO OpenAI-compatible endpoint (Ollama works).

## 2. Architecture

One binary, two entry points: a **Telegram long-poll goroutine** (capture in,
notify out) and a **net/http server** (API + embedded dashboard). Shared core
in the middle.

```
                  ┌─────────────────────────────────────────┐
  Telegram IN ──► │ channel/telegram  (adapter, stdlib HTTP) │
                  └───────────────┬─────────────────────────┘
                                  ▼
                  ┌─────────────────────────────────────────┐
                  │ core  capture.Handler                    │
                  │   · recognize link / text / media        │
                  │   · fetch open sources (HTTP, yt-dlp)    │
                  │   · LLM analyze → split → classify        │
                  │   · persist cards, emit Channel.Notify    │
                  └───────────────┬─────────────────────────┘
                                  ▼
                  ┌─────────────────────────────────────────┐
                  │ store  (SQLite via database/sql)         │
                  │   spans: cards, tags, research, events    │
                  └─────────────────────────────────────────┘

  HTTP server ──► /api/* (cards, research, events)  +  embed.FS dashboard
                       shared core, same process
```

**Package layout:**

```
cmd/sparkkeep/        main.go — flags/env, wiring, graceful shutdown
internal/port/        minimal interfaces: Channel (In/Out), Store
internal/channel/telegram/   long-poll adapter (stdlib, no bot lib)
internal/capture/     link recognition + fetch (net/http, yt-dlp subprocess)
internal/analyze/     OpenAI-compatible LLM client (stdlib JSON over HTTP)
internal/research/    bounded loop: query → search → read → synthesize
internal/store/       SQLite repository (database/sql + modernc.org/sqlite)
internal/web/         embed.FS dashboard + API handlers
```

**Deliberate simplification:** only abstraction is `port.Store` (interface →
SQLite impl) and `port.Channel` — because you called for channel-independence
and a Postgres escape hatch. Everything else is concrete types. `ponytail:
single-user sync app; if ever multi-writer, the Store interface is the seam
to Postgres or a queue.`

**Dependencies (only three, two are SQLite+yt-dlp):**
- `modernc.org/sqlite` — pure-Go SQLite driver (no cgo, static binary)
- `yt-dlp` — external binary, only for YouTube/IG media metadata
- stdlib for everything else (Telegram API, HTTP, JSON, embed)

## 3. Data model & storage

SQLite, single file. Three tables.

**`cards`** — the idea.

| column     | type      | notes |
|------------|-----------|-------|
| id         | INTEGER PK|    |
| title      | TEXT      | 1-line, LLM-generated |
| summary    | TEXT      | 2–3 lines, LLM |
| horizon    | TEXT      | `short-term` \| `lifetime` (LLM-classified) |
| status     | TEXT      | `inbox` → `doing` → `done` / `shelved` |
| source_url | TEXT      | original post/link, if any |
| source_note| TEXT      | pasted caption when scraping blocked |
| created_at | TEXT      | RFC3339 UTC |
| updated_at | TEXT      |    |

**`tags`** — freeform, LLM-suggested + channel-reaction refinement. `cards_tags` join table.

**`research`** — one row per bounded research run: card_id, status (`queued`/`running`/`done`/`failed`), query, findings (markdown), created_at.

**`events`** — optional audit trail of channel interactions (used for the weekly digest and debugging).

**Migrations:** embedded SQL files in `internal/store/migrations/` (`0001_init.sql`, …), applied at startup behind `doc_id`-style version tracking. No migration library — a 20-line runner in `store` (`ponytail: single-user, forward-only migrations; add a library only if you ever need downward/conflict resolution`).

**API shape** (`/api/v1`):
- `GET /cards?horizon=&tag=&status=` — list
- `POST /cards` — create manually
- `PATCH /cards/{id}` — status/tag/horizon/note
- `GET /tags`, `GET /research`, `POST /research` (trigger from a card)

Dashboard is read-heavy; no pagination beyond `?limit=` for now (`ponytail: fine until a user has thousands of cards; add cursor paging then`).

## 4. Analysis pipeline — post → cards

Pipeline runs on every incoming share. Pure function: bytes in, `[]Card` out.

**Step 1 — Recognize.** `capture.Recognize(rawText, media)` classifies the
incoming share:
- plain link (http/https) → fetch in Step 2
- YouTube/Instagram/video URL → shell out to `yt-dlp -j` for title/description
  (`ponytail: yt-dlp is the only subprocess; swap for Go libs if metadata
  needs ever grow past title/desc`)
- text-with-link (captioned post) → use caption as `source_note`, may still
  fetch the link
- bare text → analyze as-is

Fetching is best-effort and time-boxed (5s). Failure is not an error: the
caption/link text still gets analyzed.

**Step 2 — Analyze.** `analyze.Analyze(payload)` calls the configured
OpenAI-compatible endpoint once with a strict prompt. Returns JSON, validated:

```json
[{"title":"…","summary":"2–3 lines…","horizon":"short-term|lifetime",
  "tags":["…"],"links":["https://…"]}]
```

Prompt contract: *split the post into one card per distinct idea/tool; never
merge; if only one idea, return one card; 10 items → 10 cards; horizon =
"lifetime" for bucket-list/long-horizon, "short-term" for actionable now;
tags ≤ 5 lowercase.*

**Step 3 — Persist & notify.** Cards stored; each triggers `Channel.Notify`
with a compact Telegram message: title, one-line summary, horizon badge,
tags, and inline buttons (`→ Doing`, `→ Done`, `Research`, `Shelve`).

**Failure handling:** step 1 always yields *something* to analyze. Step 2
fails → card saved with `status=inbox`, summary "analysis failed, see
source" and a retry button (`ponytail: no retry queue; the Research/re-analyze
button on the card is the retry path`).

**Concurrency:** per-incoming-share goroutine; the LLM call is the only
serialization point (one at a time via a mutex around the endpoint call,
`ponytail: single endpoint, cheap; fan out only if one user saturates`).

## 5. Telegram channel adapter

First implementation of `port.Channel`. Stdlib HTTP long-polling — exactly
the pattern your NAS `digest_bot.py` already uses, in Go.

**Inbound:**
- Long-poll `getUpdates` with `offset` persisted to disk after each batch
  (crash-safe restart).
- Owner lock: only one configured `TG_CHAT_ID` is allowed to speak to the
  bot; everyone else gets silence (`ponytail: single-user product; a
  multi-tenant ACL is a whole feature, add when there are real other users`).
- Message handler: photo/video/link/text all funnel into
  `core.Capture(rawText, media)`.

**Outbound (`Notify`):**
- Text message + inline keyboard: buttons `→ Doing`, `→ Done`, `Research`,
  `Shelve`. Button presses come back as `callback_query` updates and map to
  status changes / research trigger — same long-poll loop, no webhook.

**Reactions as refinement:** emoji reactions on the card message map to tag
or horizon tweaks (`⭐` → re-moving to lifetime, etc.) — implemented as a
small `reaction → action` map, passive and explicit.

**Inbound "organize-by-reply":** replying to a card message with text/tag
edits the card (append tag, set note). This is the "intercept the reply and
organize" part you asked for — replies are matched by message thread id, not
parsed commands.

**Config (env):** `SPARKKEEP_TG_TOKEN`, `SPARKKEEP_TG_CHAT_ID` (owner),
`SPARKKEEP_TG_ENABLED` (off = dashboard-only mode).

## 6. Research loop

"Investigate this" on a card spawns one bounded run. No agent, no infinite
loop — a deterministic pipeline with a hard stop.

```
request ──► build query (LLM, from card title+summary)
      ──► search (SearXNG instance ── or any JSON/HTML search config)
      ──► fetch top N results (reuse capture.Fetch, time-boxed)
      ──► extract text → trim to context budget (chars)
      ──► synthesize: one LLM call → findings (markdown report)
      ──► store + Channel.Notify(report link)
```

**Deterministic stops (no unbounded recursion):**
- search returns up to N=6 results
- each result clipped to ~8K chars of text before synthesis
- one synthesis LLM call, no follow-up passes
- hard wall-clock timeout per run (default 120s)

**State:** `research` table row: `queued → running → done|failed`. Runs
serialized (one at a time, same mutex pattern as analysis — `ponytail:
single-user; a worker pool only matters if research queues grow past a few
runs`). Failure stores the error on the row and notifies the channel.

**Search backend:** configurable `SPARKKEEP_SEARCH_URL`. Default expectation
is a SearXNG JSON API (already on your NAS); v1 ships a generic
`?q=` + parse-JSON reader, documented so other backends can follow
(`ponytail: one parser today; a provider interface only when a second
search vendor actually appears`).

## 7. Web dashboard & API

**Dashboard** — one static HTML page + a single JS file, embedded via
`embed.FS`, served by the same binary on `:8080`. No build step, no
framework: vanilla JS calling `/api/v1`. Dark, card-grid UI modeled as:

- **left rail** — filter facets: horizon (`short-term` / `lifetime`), tag
  chips, status
- **main grid** — idea cards (title, summary, tags, horizon badge, status)
- **top bar** — search box (SQL LIKE on title/summary/tags), "New card" +
  "Research" actions
- **row of two boards** — convenience split: *Action queue* (short-term,
  inbox/doing) vs *Bucket list* (lifetime), same data, two filtered grids

**API** (from section 3, plus):
- `POST /api/v1/research` — start research from card id
- `POST /api/v1/cards/{id}/retry` — re-analyze a failed-analysis card
- `POST /api/v1/cards/{id}/notify` — re-send a card as notification

**Serve mode:** static assets + `json` API handlers on one `http.ServeMux`
with `http.FileServer` for `/assets`. CORS unneeded (same origin).
`ponytail: hide the server behind your existing Traefik/Authelia on the NAS
if you want auth; in-app auth is out of scope.`

## 8. Config, deployment, testing

**Config.** Env-only, no config file. All keys prefixed `SPARKKEEP_`:

| key | default | purpose |
|-----|---------|---------|
| `SPARKKEEP_DB` | `./sparkkeep.db` | SQLite path |
| `SPARKKEEP_HTTP_ADDR` | `:8080` | dashboard + API |
| `SPARKKEEP_LLM_BASE` | `http://localhost:11434/v1` | OpenAI-compatible base — Ollama default |
| `SPARKKEEP_LLM_KEY` | `` | API key, empty for Ollama |
| `SPARKKEEP_LLM_MODEL` | `` | required |
| `SPARKKEEP_TG_TOKEN` | `` | empty = Telegram off |
| `SPARKKEEP_TG_CHAT_ID` | `` | owner chat id |
| `SPARKKEEP_SEARCH_URL` | `` | SearXNG JSON search |
| `SPARKKEEP_MAX_ANALYZE_TOKENS` | `2048` | cap analysis output |

**Deployment.** A `Dockerfile` (`FROM golang:… AS build` multi-stage →
`scratch`/`alpine:runtime`, plus `yt-dlp` in runtime image) + a compose
service with volume mount for the SQLite file. Runs as one container on the
NAS; Telegram long-poll and HTTP server both live in it.

**Testing.**
- `store`: table-driven tests against a temp-dir SQLite file.
- `analyze`: prompt/JSON parsing round-trip; LLM endpoint stubbed with
  `httptest` returning canned JSON — no real LLM in CI.
- `capture`: URL fetch stubbed; yt-dlp path faked as a script that emits
  canned JSON.
- `channel/telegram`: long-poll loop tested with `httptest` simulating the
  Telegram API (updates in, button callbacks out).
- `research`: full pipeline smoke test against stubbed search + LLM.
- `ponytail`: no test framework beyond stdlib `testing`; no CI infra in v1 —
  `make test` + `make build`. A GitHub Actions workflow is added when the
  repo goes public.`

## 9. Open questions before implementation

- App name (sparkkeep? final call).
- Telegram bot username will be one you register — placeholder now.
- Which SearXNG instance: your NAS sidecar, or a public one (e.g.
  searx.be) for initial dev.
- Whether the weekly digest (from your ask) is a dashboard view or a real
  Telegram push — decide before planning (default: dashboard view + a
  `/digest` bot command later).