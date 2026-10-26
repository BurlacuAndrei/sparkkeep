# Sparkkeep — System Architecture & Design

## 1. Pitch & Scope

**Pitch.** Shorten the path from discovering an idea to executing it. Share a post, link, repo, note, or media from mobile (Telegram, WhatsApp, Signal, Discord, Slack) or the web; Sparkkeep captures it immutably, analyzes it using your preferred AI model, splits it into actionable idea cards, routes each into the appropriate horizon (short-term actionable vs. lifetime reference), and empowers you to triage them Kanban-style or run deep research playbooks.

**Form Factor.** Single, self-contained binary. Capture engine, multi-channel hub, research execution pipeline, embedded SQLite database, and embedded modern web dashboard run in a single process with zero external database dependencies.

**Core Principles:**
- **Local-First & Zero External DBs:** Uses SQLite via `modernc.org/sqlite` (pure Go, CGO-free, cross-platform) with WAL mode, serialized single-writer pool, and FTS5 full-text indexing.
- **Embedded Web Application:** Modern React 19 + Vite + TypeScript frontend compiled and embedded directly into the Go executable via `//go:embed`.
- **Bring Your Own Keys (BYOK):** Seamless integration with any OpenAI-compatible endpoint (OpenAI, DeepSeek, local Ollama, vLLM, LM Studio) without vendor lock-in.
- **Channel Independence:** Multi-channel hub supports Telegram, OpenClaw (WhatsApp, Signal, iMessage, Matrix), Discord, Slack, and Webhooks with full provenance tracking.
- **100% Open Source (AGPL-3.0):** All capture, analysis, search, kanban, research playbooks, obsidian sync, and webhook automations are fully open-source under the AGPL-3.0 License.

---

## 2. Architecture Overview

One binary, multiple entry points: long-polling channel goroutines (e.g. Telegram), webhook receivers (Discord, OpenClaw, Slack), and an HTTP server (REST API + embedded web dashboard).

```
   Telegram IN  ──┐
   OpenClaw IN  ──┼─► ┌──────────────────────────────────────────────┐
   Discord IN   ──┤   │ internal/channel (Hub router & adapters)     │
   Slack IN     ──┤   │   · telegram, openclaw, discord, slack       │
   Web/API IN   ──┘   └───────────────────┬──────────────────────────┘
                                          ▼
                      ┌──────────────────────────────────────────────┐
                      │ core.Service & capture.Handler               │
                      │   · recognize link / text / media / audio    │
                      │   · fetch sources (HTTP, headless Chrome, yt-dlp)
                      │   · transcribe audio (Whisper ASR)           │
                      │   · LLM analyze → triage brief → split cards │
                      │   · persist cards, emit Hub.Notify           │
                      │   · preserve provenance (channel, chat, msg) │
                      └───────────────────┬──────────────────────────┘
                                          ▼
                      ┌──────────────────────────────────────────────┐
                      │ store (SQLite via database/sql + FTS5)       │
                      │   spans: captures, cards, tags, research,    │
                      │          playbooks, settings, channels       │
                      └──────────────────────────────────────────────┘

   HTTP Server  ──► /api/v1/* (cards, research, channels, settings)
                    /assets/* (embedded React SPA dist via embed.FS)
```

### Package Layout

```
cmd/sparkkeep/               main.go — flag/env config, dependency injection, graceful shutdown
internal/port/               interfaces: Store, ChannelHub, ModelRouter, Playbook, etc.
internal/core/               orchestration service, capture handler, background research queue
internal/channel/            multi-channel hub router, broadcast fan-out, provenance dispatch
internal/channel/telegram/   Telegram Bot API long-poll adapter with interactive inline buttons
internal/channel/openclaw/   HTTP bridge for WhatsApp, Signal, iMessage, and Matrix
internal/channel/discord/    rich embeds and interactive ActionRow button webhooks
internal/channel/slack/      Block Kit interactive cards and incoming webhooks
internal/capture/            URL scrapers (plain HTTP + headless Chrome), yt-dlp, media handling
internal/asr/                Whisper ASR audio transcription client
internal/analyze/            OpenAI-compatible LLM client, prompt templates, model routing
internal/research/           playbook step execution engine, search, synthesizer, reporter
internal/obsidian/           local Obsidian note export and synchronization
internal/webhook/            outbound HMAC-signed webhook dispatcher
internal/license/            AGPL-3.0 status provider (all features; no gating)
internal/store/              modular SQLite repository, migrations runner, FTS5 sync triggers
internal/web/                domain HTTP handlers, auth middleware, embedded static file server
frontend/                    React 19 + TypeScript + Vite SPA, CSS design tokens, Vitest harness
```

---

## 3. Data Model & Storage

Sparkkeep stores all application state in a single SQLite database file (`/data/sparkkeep.db`), configured with Write-Ahead Logging (WAL) and a single-writer connection pool to serialize write transactions safely.

### Primary Entities

- **`captures`**: Immutable record of raw inbound messages, fetched web page bodies, transcribed voice notes, and media provenance (`source_channel`, `source_channel_chat_id`, `source_channel_msg_id`).
- **`cards`**: The core idea unit. Contains title, summary, horizon (`short-term` vs. `lifetime`), status (`inbox`, `doing`, `shelved`, `done`), triage brief JSON, capture reference, and tags.
- **`cards_fts`**: SQLite FTS5 virtual table synchronized via database triggers for instant full-text search across card titles, summaries, notes, and tags.
- **`tags` & `card_tags`**: Normalized tags assigned via LLM analysis or manual organization.
- **`research`**: Executed research runs with step progress snapshots, citations, synthesized Markdown reports, token usage, and user feedback.
- **`playbooks` & `playbook_steps`**: Deterministic step-based investigation definitions (ground, plan, search, read, verify, report, custom).
- **`channel_messages`**: Mapping between Sparkkeep card IDs and upstream platform message IDs to enable live in-place edits (e.g. Telegram send-and-edit pattern).
- **`settings`**: Dynamic key-value store for API keys, AI model profiles, channel credentials, and auth tokens, configurable directly through the web UI.

### Automated Migrations

Schema evolution is managed via sequential SQL migration scripts embedded in `internal/store/migrations/` (`0001_init.sql` through `0020_cards_fts.sql`). On startup, Sparkkeep automatically applies pending migrations within a transaction.

---

## 4. Two-Stage Pipeline: Capture & Triage

Sparkkeep decouples raw ingestion from synthesis into a reliable two-stage pipeline:

```
  Input (Link/Text/Media/Audio)
               │
               ▼
   [Stage 1: Ingestion & Capture]
   • Save raw payload in `captures` table (status=pending)
   • HTTP / Headless Chrome fetch for URLs
   • yt-dlp for video metadata
   • Whisper ASR for voice notes
   • Vision model for image screenshots
               │
               ▼
   [Stage 2: Triage & Brief Synthesis]
   • Inject user "About Me" profile context (skills, stack, goals)
   • Generate structured Triage Brief:
     - TL;DR executive summary
     - Value proposition ("why care")
     - Worthiness rating (high | medium | low)
     - Typology (tool, article, architecture, idea, etc.)
     - Factual claims to verify & open questions
     - Horizon recommendation (short-term vs. lifetime)
   • Decompose multi-item shares into distinct idea cards
   • Save cards to inbox and notify originating channel
```

### Model Roles & Router

The backend supports assigning distinct model configurations by role:
- `triage`: Fast, structured extraction for inbound captures.
- `vision`: Multimodal description of screenshots and images.
- `research_plan`: Investigative decomposition and search query generation.
- `research_synthesis`: High-reasoning report synthesis with factual citations.

---

## 5. Multi-Channel Hub & Provenance

Sparkkeep provides a unified channel abstraction (`port.Channel` and `port.ChannelHub`) for multi-channel ingestion, outbound interactive notifications, and provenance tracking:

- **Targeted Notification Routing:** Outbound card notifications route back to the channel of origin (e.g. captures from Discord notify Discord; captures from WhatsApp notify WhatsApp).
- **Sub-Channel Routing:** Supports prefix routing such as `openclaw:whatsapp` or `openclaw:signal`.
- **Concurrent Broadcast Fallback:** System broadcasts (such as scheduled weekly digests or cards created via Web UI) fan out across active channels concurrently with per-adapter error isolation and timeouts.
- **Telegram:** Stdlib HTTP long-polling (`getUpdates`) with atomic offset persistence, interactive inline keyboards (`→ Doing`, `→ Done`, `Research`, `Shelve`), and in-place message edit updates.
- **OpenClaw Bridge:** Connects to OpenClaw Gateway `POST /hooks/agent` with Bearer auth, unlocking 15+ external messaging transports (**WhatsApp**, **Signal**, **iMessage**, **Matrix**) without heavy dependencies.
- **Discord:** Rich Embeds with action color bars and interactive ActionRow button components via interaction webhooks.
- **Slack:** Rich Block Kit formatting with header blocks, markdown sections, and interactive action buttons.

---

## 6. Research Engine & Playbooks

Research investigations in Sparkkeep are deterministic, step-based workflows governed by **Playbooks**. There is no unbounded autonomous loop: every research run executes an ordered sequence of discrete, verifiable steps with hard stop conditions.

### Playbook Steps
- **`ground`:** Ingests card context, raw capture text, and metadata into run memory.
- **`resolve_refs`:** Discovers and fetches URLs referenced in card notes or content.
- **`plan`:** Formulates decomposing investigative questions and search queries.
- **`search`:** Executes queries against SearXNG or search APIs, tracking candidate source URLs.
- **`read`:** Fetches and clips content from discovered sources in round-robin fashion.
- **`verify_claims`:** Fact-checks assertions against extracted evidence with `[S#]` citations.
- **`landscape`:** Evaluates competitive alternatives and industry positioning.
- **`verdict`:** Synthesizes pursue/skip/watch recommendations with confidence scores.
- **`report`:** Compiles the complete Markdown briefing.
- **`custom`:** User-defined prompts with customizable role, tools, and headings.

### Scheduled Execution & Queue Worker
- **Bounded Background Queue:** Sequential processing of research jobs with restart resilience (interrupted jobs recover automatically on boot).
- **Quiet Window:** Configurable off-peak execution window (e.g. `23:00` to `07:00`).
- **Morning Digest:** Push digest summarizing overnight reports, verdicts, and card links.

---

## 7. Web Dashboard & User Interface

The web interface is a modern single-page application built with **React 19**, **TypeScript**, and **Vite**, with stylesheets organized into CSS design tokens, layout primitives, and component styles.

- **Omnisearch (Cmd+K / Ctrl+K):** Instant global search palette powered by backend FTS5 indexing with keyboard navigation.
- **Dual Views:**
  - **Kanban Board:** Smooth workflow management across Inbox, Doing, Done, and Shelved columns with horizon filtering.
  - **Triage Deck:** Tinder-style rapid swipe triage view for processing capture backlogs.
- **Slide-Over Research Drawer:** Full Markdown report view with rendered citations, step progress indicators, and user feedback triggers.
- **Smart Capture Modal:** Quick entry with auto-fetch preview, channel origin selection, and tag autocompletion.
- **Playbook Manager:** Interface to inspect built-in playbooks, create custom multi-step workflows, and test configurations.
- **Settings Modal:** Unified tabbed settings for AI profiles, channel integrations, Obsidian vault path, outbound webhooks, and security passphrases.
- **Theme Selector:** Curated theme palette with instant preview and persistent preference storage.

---

## 8. Configuration & Deployment

### Environment Variables

All settings can be pre-configured via environment variables or managed dynamically via the First-Run Setup Wizard and Web UI Settings:

| Environment Variable | Default | Purpose |
|---|---|---|
| `SPARKKEEP_DB` | `/data/sparkkeep.db` | SQLite database file path |
| `SPARKKEEP_HTTP_ADDR` | `:8080` | Bind address and port |
| `SPARKKEEP_AUTH_TOKEN` | *(Dynamic DB)* | Master authentication bearer token / cookie secret |
| `SPARKKEEP_LLM_BASE` | `http://localhost:11434/v1` | OpenAI-compatible API base URL |
| `SPARKKEEP_LLM_KEY` | *(Dynamic DB)* | API Key for LLM provider (empty for Ollama) |
| `SPARKKEEP_LLM_MODEL` | *(Dynamic DB)* | Model identifier (e.g. `gpt-4o`, `llama3.2`) |
| `SPARKKEEP_MAX_ANALYZE_TOKENS` | `2048` | Maximum token cap for analysis calls |
| `SPARKKEEP_TG_TOKEN` | `""` | Telegram bot token (empty = disabled) |
| `SPARKKEEP_TG_CHAT_ID` | `0` | Authorized Telegram user/chat ID |
| `SPARKKEEP_SEARCH_URL` | `https://searx.be` | SearXNG JSON search endpoint |
| `SPARKKEEP_HEADLESS_ENABLED` | `true` | Headless Chromium rendering toggle |
| `SPARKKEEP_ASR_URL` | `""` | Optional Whisper transcription endpoint |
| `SPARKKEEP_OPENCLAW_URL` | `http://localhost:18789` | OpenClaw Gateway bridge endpoint |
| `SPARKKEEP_DISCORD_TOKEN` | `""` | Discord bot token |
| `SPARKKEEP_SLACK_BOT_TOKEN` | `""` | Slack bot token |

### Deployment Options

1. **Docker / Docker Compose (Recommended):**
   ```bash
   docker run -d \
     --name sparkkeep \
     -p 8080:8080 \
     -v sparkkeep_data:/data \
     ghcr.io/burlacuandrei/sparkkeep:latest
   ```

2. **Standalone Binary:**
   Compiled static binaries are available for Linux, macOS, and Windows from GitHub Releases. Run `./sparkkeep` and open `http://localhost:8080`.