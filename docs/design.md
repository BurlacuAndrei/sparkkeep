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

## 4. Two-stage pipeline — captures → triage brief → cards

Sparkkeep decouples raw ingestion from synthesis via a two-stage pipeline: **Capture** followed by **Triage**.

### Stage 1: Capture (Raw Ingestion)
Incoming shares (links, text, images, or audio voice notes) are first saved into the `captures` table with `status=pending`:
- **Plain links (HTTP/HTTPS):** fetched and parsed into clean readable text.
- **YouTube / Video URLs:** metadata extracted via `yt-dlp -j`.
- **Audio / Voice Notes:** transcribed into text via Whisper ASR client.
- **Images & Screenshots:** digested into text descriptions using the `vision` model role.
- **Captioned Posts:** caption preserved in `source_note`; linked URL fetched if open.

Captures preserve the raw source content immutably, ensuring re-analysis and multi-card decomposition have complete provenance.

### Stage 2: Triage & Brief Synthesis
The capture is evaluated by the LLM client routed for the `triage` role:
- **Personal Fit Context Injection:** If a user profile ("About Me") is configured, background context (goals, skills, stack, constraints) is injected as a passive context block.
- **Triage Brief Generation:** The model produces an actionable structured brief:
  - `tldr`: 1–2 sentence executive summary.
  - `why_care`: specific value proposition, tailored to personal fit.
  - `worthiness`: `high` | `medium` | `low` rating with concrete rationale.
  - `type`: card typology (`tool`, `reading`, `architecture`, `company`, `idea`, etc.).
  - `claims`: key factual claims to verify during research.
  - `open_questions`: targeted investigative angles.
  - `suggested_horizon`: `short-term` (actionable now) vs `lifetime` (long-term reference).
  - `tags`: topic categorization tags.
- **Distinct Idea Splitting:** Multi-item posts or digests are split into distinct cards, each linked to the parent capture via `capture_id`. Cards share the source URL without unique constraint conflicts.
- **Persistence & Notification:** Cards are saved in `inbox` status and dispatched via `Channel.Notify` with inline action buttons (`→ Doing`, `→ Done`, `Research`, `Shelve`).

### Model Roles & Router
Sparkkeep supports multiple AI endpoints configured through profiles:
- **Roles:** `triage`, `vision`, `research_plan`, `research_synthesis`.
- **Pro Gating:** Pro instances can route each role to separate providers/models (e.g. fast cheap models for triage/planning, high-reasoning models for research synthesis) with per-role token caps. Community instances route all roles to the default profile.

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

## 6. Research playbooks & execution pipeline

Research investigations in Sparkkeep are deterministic, step-based workflows governed by **Playbooks**. There is no unbounded autonomous loop: every research run executes an ordered sequence of discrete, verifiable steps with hard stop conditions.

### Playbook Architecture
A playbook (`port.Playbook`) consists of a sequence of `PlaybookStep` items:
- **`ground`:** Ingests card context, raw capture text, and metadata into run memory.
- **`resolve_refs`:** Discovers and fetches URLs referenced in card notes or content.
- **`plan`:** Formulates decomposing investigative questions and web search queries (`RoleResearchPlan`).
- **`search`:** Executes queries against SearXNG or search APIs, tracking candidate source URLs.
- **`read`:** Fetches and clips content from discovered sources in round-robin fashion.
- **`verify_claims`:** Fact-checks assertions against extracted evidence with `[S#]` citations.
- **`landscape`:** Evaluates competitive alternatives and industry positioning.
- **`verdict`:** Synthesizes pursue/skip/watch recommendation, confidence, and next actions.
- **`report`:** Compiles the complete Markdown briefing.
- **`custom`:** User-defined prompts with customizable role, tools (`search` / `none`), and heading.

### Tiers & Gating
- **Community:**
  - Includes **Default (lite)** playbook: `ground, resolve_refs, search, read, report`.
  - Includes built-in **"Claim check only"** playbook: `ground, resolve_refs, verify_claims, report`.
  - Runs all steps through the single default AI model profile.
- **Pro (`deep_research_v2`):**
  - Full 7-step **Default** playbook with planning, claim verification, landscape, and verdict.
  - Built-in specialist playbooks: **Deep Investigation** and **Vendor Comparison**.
  - **Custom Playbooks:** Create, edit, duplicate, and assign card-type affinities (up to 12 steps).
  - **Curated Step Library:** Instant insertion of pre-built domain analysis modules.
  - Per-role model routing (planning vs synthesis).
- **Graceful License Lapsing:** Custom playbooks remain readable if a Pro license expires, but cannot be run or edited until reactivated. User data is never deleted.

### Run Snapshots & Observability
- **Immutable Snapshot:** The exact playbook configuration is captured in `playbook_snapshot` on every research row, guaranteeing historical reproducibility.
- **Live Progress:** Progress is updated per-step (`steps` JSON array) and streamed to the UI.
- **Feedback & Metrics:**
  - Reports collect user 👍 / 👎 feedback and optional comments directly on the run.
  - Local endpoint `GET /api/v1/metrics/pipeline` computes funnel conversion %, median inbox time, playbook run counts, step success rates, feedback satisfaction, and average token consumption.
  - **Zero Telemetry:** All metrics remain 100% private and on-instance.

### Scheduled & Batch Overnight Research (Pro)
- **Persistent Bounded Queue:** Research requests can be queued with `scheduled_for` and `batch_id`. A dedicated background queue worker (default concurrency: 1) processes queued items sequentially.
- **Restart Resilience:** On server boot, `RecoverInterruptedResearch` transitions stale `running` jobs to `failed` (`interrupted by server restart`) with immediate retry support. Remaining `queued` jobs survive restarts intact.
- **Quiet Execution Window:** Configurable time window (e.g. `23:00` to `07:00`) halts processing during business hours and releases queue worker execution during off-peak hours.
- **Automation Rules:** Configurable scheduled triggers (e.g. daily at `02:00`) query cards matching criteria (status, worthiness, type, max age, tags) up to a max limit, avoiding duplicate queued passes.
- **Morning Research Digest:** Morning Telegram push (`/morning` command or scheduled delivery) summarizing overnight report counts, recommendations/verdicts, direct card links, and any interrupted runs.
- **Pro Gating:** Batch queuing (`POST /api/v1/research/batch`), rules management (`/api/v1/research/rules`), and quiet window endpoints are gated by `deep_research_v2`.

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
- Which SearXNG instance **resolved:** configurable via `SPARKKEEP_SEARCH_URL`,
  default is a public instance (`https://searx.be`); local self-hosted deployments
  can override it to an internal instance (e.g. `http://searxng:8080`).
- Weekly digest **resolved:** shipped as a dashboard view (`GET
  /api/v1/digest` + top-bar toggle). The Telegram `/digest` bot command
  (push the same digest to chat) is documented but not implemented — do it
  when a push channel is wanted.