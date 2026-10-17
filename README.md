# Sparkkeep — Self-Hosted Capture & Action Engine

<p align="center">
  <b>Turn fleeting thoughts, links, and media into prioritized, actionable execution cards.</b>
  <br />
  <i>Packaged as a lightning-fast single binary with zero external database dependencies.</i>
</p>

<p align="center">
  <a href="https://github.com/BurlacuAndrei/sparkkeep/actions/workflows/ci.yml"><img src="https://github.com/BurlacuAndrei/sparkkeep/actions/workflows/ci.yml/badge.svg" alt="CI Status" /></a>
  <a href="https://github.com/BurlacuAndrei/sparkkeep/actions/workflows/docker.yml"><img src="https://github.com/BurlacuAndrei/sparkkeep/actions/workflows/docker.yml/badge.svg" alt="Docker Build" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" /></a>
  <a href="go.mod"><img src="https://img.shields.io/github/go-mod/go-version/BurlacuAndrei/sparkkeep" alt="Go Version" /></a>
  <a href="https://github.com/BurlacuAndrei/sparkkeep/releases"><img src="https://img.shields.io/github/v/release/BurlacuAndrei/sparkkeep?include_prereleases&color=7928CA" alt="Release" /></a>
  <a href="https://github.com/BurlacuAndrei/sparkkeep/pkgs/container/sparkkeep"><img src="https://img.shields.io/badge/Container-ghcr.io-success" alt="Container" /></a>
  <a href="https://ko-fi.com/andreiburlacu"><img src="https://img.shields.io/badge/Ko--fi-Buy%20me%20a%20coffee-ff5e5b?logo=ko-fi&logoColor=white" alt="Ko-fi" /></a>
  <a href="https://github.com/sponsors/BurlacuAndrei"><img src="https://img.shields.io/badge/Sponsor-%E2%9D%A4-ea4aaa?logo=github-sponsors&logoColor=white" alt="GitHub Sponsor" /></a>
</p>

---

## 💡 Why Sparkkeep?

Most "read-it-later" and bookmarking apps are digital graveyards: you save interesting links, repos, and notes, but **never execute on them**. 

**Sparkkeep is not a bookmark manager — it is an Action Engine.**

When you share an idea, tweet, GitHub repository, audio memo, or screenshot from your mobile phone or web browser, Sparkkeep:
1. **Captures it immutably** with full source provenance tracking (or seeds user-authored **Subject Cards** without requiring external URLs).
2. **Filters engagement bait** via an automated Triage Noise Gate so clickbait and spam never pollute your Inbox.
3. **Scrapes & transcribes** content automatically (headless Chrome, yt-dlp, Whisper ASR).
4. **Synthesizes a structured Triage Brief** using your choice of LLM (local Ollama or cloud BYOK) with a consolidated single-card default and 3-card fission cap.
5. **Decomposes complex items** into discrete, actionable cards routed to realistic horizons (**Now**, **Next**, **Later**).
6. **Enables deep, hallucination-free research playbooks** in **Playbook Studio** with factual web groundings and citations.

```
 Traditional Bookmarkers:  Save Link ─────────────► Digital Graveyard 💀
 Sparkkeep Engine:         Capture ──► Noise Gate ──► AI Triage ──► Horizon Routing ──► Deep Research ──► Shipped 🚀
```

---

## 🖥️ Platform Showcase

Every view in Sparkkeep is crafted for keyboard speed, minimal cognitive load, and frictionless execution.

### 1. Fluid Kanban & Horizon Boards
Organize triage cards across **Now**, **Next**, **Later**, and **Shelved** horizons with real-time drag-and-drop, automated tag indexing, and live progress indicators.

<p align="center">
  <img src="docs/assets/dashboard-hero.png" alt="Sparkkeep Execution Boards" width="100%" style="border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.35);" />
</p>

### 2. Swipeable Triage Deck
Burn through your incoming inbox backlogs with keyboard shortcuts (`1` Now, `2` Next, `3` Later, `Esc` Dismiss). Review instant AI synthesis, "Why You'd Care", and decomposed sub-actions before promoting to your active board.

<p align="center">
  <img src="docs/assets/triage-deck.png" alt="Swipeable Triage Deck" width="100%" style="border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.35);" />
</p>

### 3. Structured Card Dossier, Action Checklist & Subject Cards
Every card decomposes captured sources into a concrete TL;DR takeaway, why it matters, an interactive checklist of next actions, and direct deep research triggers. User-authored notes are treated as first-class **Subject Cards** with on-demand AI triage synthesis and autonomous research grounding directly on your topic notes without requiring external URLs.

<p align="center">
  <img src="docs/assets/card-modal.png" alt="Card Detail & Action Checklist" width="100%" style="border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.35);" />
</p>

### 4. Deterministic Deep Research Dossier
Trigger autonomous, multi-step investigative playbooks that scrape the web, verify facts, assess risks, and issue an objective Pursue, Watch, or Skip verdict with high confidence scoring.

<p align="center">
  <img src="docs/assets/research-dossier.png" alt="Deep Research Dossier" width="100%" style="border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.35);" />
</p>

### 5. Omnisearch (Cmd+K)
Instant, zero-latency full-text search powered by SQLite FTS5. Filter across card titles, summaries, tags, and research verdicts in milliseconds from anywhere in the app.

<p align="center">
  <img src="docs/assets/omnisearch.png" alt="Omnisearch Cmd+K" width="100%" style="border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.35);" />
</p>

### 6. Weekly Intelligence Digest & Multi-Channel Broadcast
Automated high-level syntheses identifying emergent themes across your captured cards, weekly win velocity, triage clearance rates, and horizon distribution balances. Broadcast your synthesized brief directly to **Telegram**, **Discord**, or **Slack** with a single click.

<p align="center">
  <img src="docs/assets/weekly-digest.png" alt="Weekly Intelligence Digest" width="100%" style="border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.35);" />
</p>

### 7. Playbook Studio Workspace & Pipeline Timeline
Design and customize deterministic research workflows in a dedicated, full-width builder canvas. Reorder pipeline steps via an interactive visual timeline, inspect real-time methodological rigor with **5-Pillar Research Health Linter** badges (Grounding, Planning, Fact-Check, Landscape, Decision Verdict), and test prompts safely with zero-cost client-side dry runs.

<p align="center">
  <img src="docs/assets/playbook-studio.png" alt="Playbook Studio Workspace" width="100%" style="border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.35);" />
</p>

---

## ⚡ 1-Minute Quick Start

### Option 1: Docker (Recommended)

Run Sparkkeep instantly with zero configuration files:

```bash
docker run -d \
  --name sparkkeep \
  -p 8080:8080 \
  -v sparkkeep_data:/data \
  ghcr.io/burlacuandrei/sparkkeep:latest
```

### Option 2: Docker Compose

```yaml
services:
  sparkkeep:
    image: ghcr.io/burlacuandrei/sparkkeep:latest
    container_name: sparkkeep
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - ./data:/data
```

```bash
docker compose up -d
```

### Option 3: Pre-Built Standalone Binary

Download the latest lightweight (~24MB) binary for Linux, macOS, or Windows from [Releases](https://github.com/BurlacuAndrei/sparkkeep/releases):

```bash
# Example for Linux AMD64 (replace VERSION with the latest release, e.g. v0.9.0)
tar -xzf sparkkeep-<VERSION>-linux-amd64.tar.gz
./sparkkeep-linux-amd64
```

Then navigate to **`http://localhost:8080`** in your browser.

---

## 🧙‍♂️ Zero-Touch First-Run Wizard

No editing `.env` files or mounting secret volumes before booting. On initial launch, Sparkkeep walks you through an interactive setup directly in the UI:

```mermaid
flowchart LR
    A["🚀 Launch Sparkkeep"] --> B["🔒 Set Master Passphrase"]
    B --> C["🤖 Select AI Provider<br/>(Ollama / OpenAI / DeepSeek)"]
    C --> D["💾 Save to Private SQLite DB"]
    D --> E["✨ Ready to Capture & Triage"]
```

1. **Master Passphrase:** Secure your personal dashboard with bcrypt-backed session auth.
2. **Bring Your Own Keys (BYOK):**
   - **Local & Private:** Ollama (`llama3.2`, `mistral`, `qwen2.5`), LM Studio, vLLM.
   - **Cloud Providers:** OpenAI (`gpt-4o-mini`, `gpt-4o`), DeepSeek (`deepseek-chat`, `deepseek-coder`), OpenRouter.
3. **Instant Launch:** Credentials save directly to your encrypted SQLite database (`/data/sparkkeep.db`) with instant hot-reloading.

---

## 🚀 System Architecture

Sparkkeep is compiled into a **single, self-contained, CGO-free binary** with zero external database dependencies.

```mermaid
flowchart TD
    subgraph Inputs ["Inbound & Outbound Channels"]
        TG["Telegram Bot (2-Way)"]
        DC["Discord (Embeds & Interactions)"]
        SL["Slack (Block Kit Notifications)"]
        WB["Web Extension & REST Webhook"]
    end

    subgraph Hub ["Unified Channel Hub"]
        ROUTER["Router & Provenance Tracker<br/>(internal/channel)"]
        GATE["Triage Noise Gate<br/>(Junk & Bait Filter)"]
    end

    subgraph Pipeline ["Capture & Triage Pipeline"]
        SCRAPE["Scraper & Fetcher<br/>(HTTP / Headless Chrome / yt-dlp)"]
        ASR["Whisper ASR Audio Engine"]
        LLM["LLM Synthesis & Fission Policy<br/>(Single-Card Default, Cap 3)"]
    end

    subgraph Store ["Embedded Storage Engine"]
        SQLITE[("SQLite WAL Mode<br/>(modernc.org/sqlite)")]
        FTS["FTS5 Full-Text Search Engine"]
    end

    subgraph UI ["Embedded Web Application"]
        REACT["React 19 + TypeScript SPA"]
        KANBAN["Kanban & Horizon Boards"]
        TRIAGE["Swipeable Triage Deck"]
        STUDIO["Playbook Studio Workspace"]
        SEARCH["Omnisearch (Cmd+K)"]
        DIGEST["Weekly Intelligence Digest"]
    end

    subgraph Research ["Deterministic Research Engine"]
        PLAYBOOKS["Playbook Studio & 5-Pillar Linter"]
        SEARX["SearXNG Search Engine"]
        VERIFY["Claim Verification & Sources"]
        REPORT["Markdown Intelligence Dossier"]
    end

    TG --> ROUTER
    DC --> ROUTER
    SL --> ROUTER
    WB --> ROUTER

    ROUTER --> GATE
    GATE -->|Passed| SCRAPE
    SCRAPE --> ASR
    ASR --> LLM
    LLM --> SQLITE
    SQLITE <--> FTS
    SQLITE --> REACT
    REACT --> KANBAN
    REACT --> TRIAGE
    REACT --> STUDIO
    REACT --> SEARCH
    REACT --> DIGEST
    STUDIO --> PLAYBOOKS
    KANBAN --> SEARX
    PLAYBOOKS --> SEARX
    SEARX --> VERIFY
    VERIFY --> REPORT
```

---

## ✨ Key Strengths & Capabilities

| Capability | What It Does | Why It Matters |
|---|---|---|
| **Zero-DB Single Binary** | Pure Go SQLite (`modernc.org/sqlite`), no CGO, no PostgreSQL, no Redis. | Runs anywhere (Raspberry Pi, NAS, VPS, Mac) in <30MB RAM with zero maintenance. |
| **Omni-Channel Capture** | Ingest links, notes, images, and voice memos from Telegram, Discord, Web Extension, and Webhooks; broadcast to Slack. | Never lose an idea on mobile or desktop. Capture from the apps you already live in. |
| **Interactive In-Place Triage** | Telegram inline keyboards & Discord ActionRows let you triage (`→ Doing`, `→ Done`, `Shelve`) directly in chat. | Triage from your notifications without ever opening the web app. |
| **Triage Noise Gate & Fission Cap** | Ingestion noise gate rejects junk/bait; enforces single-card default with a 3-card max cap. | Prevents social media engagement bait and card explosion from cluttering your Inbox. |
| **First-Class Subject Cards** | Capture raw ideas without URLs; run on-demand AI triage synthesis and autonomous research. | Freely capture open-ended hypotheses and research them with zero friction. |
| **Playbook Studio Workspace** | Visual step sequencer, 5-Pillar Research Health Linter, prompt dry runs, and template gallery. | Full freedom to compose custom research workflows while guaranteeing methodological rigor. |
| **Configurable Card Taxonomy** | Up to 20 user-defined macro Card Types with category-based playbook routing and safe cascading. | Organize domain knowledge your way without classification drift or dead playbooks. |
| **Dual-View Productivity** | Switch seamlessly between fluid Kanban Boards and a swipeable **Triage Deck**. | Rapidly burn through capture backlogs with minimal cognitive friction. |
| **Deterministic Deep Research** | Bounded, multi-step investigative playbooks (Ground → Plan → Search → Fact-Check → Verdict). | No hallucinating infinite loops; generates verified reports backed by citations. |
| **Omnisearch (Cmd+K)** | Instant, keyboard-first full-text search indexed in real-time via SQLite FTS5. | Find any card, snippet, tag, or note across years of captured data in milliseconds. |
| **Privacy-First BYOK** | Connect local Ollama instances or custom OpenAI-compatible endpoints. | Your thoughts, notes, and research stay entirely on your private hardware. |

---

## 📡 Multi-Channel Hub & Mobile Ingestion

Sparkkeep features an extensible Channel Hub with native long-polling adapters plus a **Universal Inbound Webhook (iOS Shortcuts, Android Share Sheet, cURL, automation platforms)** for mobile capture:

```mermaid
sequenceDiagram
    autonumber
    actor User as Mobile User
    participant Channels as Telegram / Discord / Webhook
    participant Hub as Sparkkeep Engine
    participant Gate as Triage Noise Gate
    participant LLM as LLM Synthesis (BYOK)
    participant DB as SQLite WAL (Local)

    User->>Channels: Shares URL, Tweet, Note, or Voice Memo
    Channels->>Hub: Inbound Webhook / Long-Poll (Provenance Preserved)
    Hub->>Gate: Evaluate Engagement Bait & Spam Filter
    alt Filtered (Engagement Bait / Junk)
        Gate-->>Hub: Reject & Discard
        Hub->>Channels: Send discard notice (Inbox kept clean)
    else Passed Noise Gate
        Gate-->>Hub: Ingest Content
        Hub->>Hub: Scrape Body / Transcribe Audio (Whisper)
        Hub->>LLM: Generate Structured Triage Brief (Single-Card / Cap 3)
        LLM-->>Hub: Return JSON Brief & Cards
        Hub->>DB: Persist Cards & Index via FTS5
        Hub->>Channels: Send interactive Triage keyboard (Now / Next / Shelve)
        User->>Channels: Tap triage action or Deep Research
        Channels->>Hub: Card status updated in real-time
    end
```

- **Telegram:** Built-in HTTP long-polling (`getUpdates`) with interactive inline keyboards (`→ Doing`, `→ Done`, `Research`, `Shelve`).
- **Discord:** Rich Embeds with action color bars and interactive ActionRow button components.
- **Slack:** Rich Block Kit formatting with header blocks, markdown sections, and interactive action buttons.
- **Noise Gate Feedback:** Automatic discard notifications informing users when low-signal hype or spam has been filtered out.
- **Weekly Digest Broadcasts:** Instant single-click on-demand dispatches and scheduled automated digest broadcasts across all connected channels.

---

## 🔬 Deterministic Research Playbooks & Playbook Studio

Unbounded LLM loops are expensive and hallucinate. Sparkkeep combines deterministic, reproducible research playbooks with a visual authoring environment in **Playbook Studio**:

```
 [1. Ground]       Ingest card context, captured raw text, or Subject Card notes
      │
 [2. Plan]         Formulate decomposing questions and targeted search queries
      │
 [3. Search]       Execute queries against SearXNG or private search endpoints
      │
 [4. Read & Clip]  Fetch and clip candidate source URLs in parallel
      │
 [5. Fact-Check]   Cross-examine claims against extracted evidence with [S#] citations
      │
 [6. Landscape]    Evaluate competitive alternatives and industry positioning
      │
 [7. Verdict]      Synthesize Pursue / Skip / Watch recommendation with confidence score
      │
 [8. Dossier]      Compile comprehensive Markdown research dossier
```

### 5 Pillars of Research Health
The **Research Health Linter** guides users with non-blocking advisory checks as they compose steps:
1. **Context Grounding:** Ensures input text, provenance, and claims are seeded into prompts.
2. **Decomposition & Planning:** Formulates targeted search queries rather than broad questions.
3. **Fact-Checking & Sources:** Enforces explicit URL citations `[S#]` against extracted web text.
4. **Market & Landscape:** Evaluates competitors, alternatives, and technical viability.
5. **Actionable Verdict:** Delivers an unequivocal Pursue, Watch, or Skip verdict with confidence scores.

### Category-Based Playbook Routing
Playbooks are routed deterministically based on card taxonomy:
`Explicit User Selection → Card Type Default → Platform Default`
This ensures books, code repositories, deep tech papers, and business tools automatically trigger the right analytical lenses without fragile tag maintenance.

---

## ⚙️ Configuration Reference

While all settings can be adjusted on the fly in the **Settings Modal**, you can pre-seed configurations via environment variables:

| Environment Variable | Default | Purpose |
|---|---|---|
| `SPARKKEEP_DB` | `/data/sparkkeep.db` | SQLite database file path |
| `SPARKKEEP_HTTP_ADDR` | `:8080` | Bind address and port |
| `SPARKKEEP_PUBLIC_URL` | `http://localhost:8080` | Public URL used in research report links |
| `SPARKKEEP_AUTH_TOKEN` | *(Dynamic DB)* | Master authentication bearer token |
| `SPARKKEEP_LLM_BASE` | `http://localhost:11434/v1` | OpenAI-compatible base URL |
| `SPARKKEEP_LLM_KEY` | *(Dynamic DB)* | API Key for LLM provider (optional for Ollama) |
| `SPARKKEEP_LLM_MODEL` | *(Dynamic DB)* | Model identifier (`llama3.2`, `gpt-4o`, `deepseek-chat`) |
| `SPARKKEEP_VISION_MODEL` | *(`SPARKKEEP_LLM_MODEL`)* | Vision model for image analysis |
| `SPARKKEEP_MAX_ANALYZE_TOKENS` | `2048` | Max tokens for a single LLM analysis |
| `SPARKKEEP_SEARCH_URL` | `https://searx.be` | SearXNG instance for deep research |
| `SPARKKEEP_HEADLESS_ENABLED` | `true` | Headless Chromium rendering toggle |
| `SPARKKEEP_CHROME_BIN` | *(auto-detect)* | Chromium/Chrome binary path |
| `SPARKKEEP_YTDLP` | `yt-dlp` | yt-dlp binary path |
| `SPARKKEEP_FFMPEG_BIN` | *(auto-detect)* | ffmpeg binary path |
| `SPARKKEEP_COOKIES_FILE` | `""` | Netscape cookies file for authenticated scraping |
| `SPARKKEEP_UPLOAD_DIR` | `<dbdir>/uploads` | Uploaded media directory |
| `SPARKKEEP_MAX_UPLOAD_MB` | `25` | Max size of a single upload (MB) |
| `SPARKKEEP_UPLOAD_MAX_SIZE_MB` | `0` | Post-transcode upload size limit (MB, 0 = disabled) |
| `SPARKKEEP_UPLOAD_MAX_AGE_DAYS` | `0` | Delete uploads older than N days (0 = disabled) |
| `SPARKKEEP_ASR_URL` | `""` | Whisper ASR endpoint |
| `SPARKKEEP_ASR_MODEL` | `""` | Whisper model name |
| `SPARKKEEP_TRANSCRIPT_LANGS` | `en.*,en` | Preferred transcript languages |
| `SPARKKEEP_TG_TOKEN` | `""` | Telegram Bot API token |
| `SPARKKEEP_TG_CHAT_ID` | `0` | Authorized Telegram user/chat ID |
| `SPARKKEEP_OFFSET_FILE` | `<dbdir>/bot_offset.json` | Telegram long-poll offset file |
| `SPARKKEEP_DIGEST_PUSH_ENABLED` | `true` when `SPARKKEEP_TG_TOKEN` is set | Weekly digest push toggle |
| `SPARKKEEP_DIGEST_PUSH_DAY` | `0` | Digest day (0=Sunday .. 6=Saturday) |
| `SPARKKEEP_DIGEST_PUSH_HOUR` | `19` | Digest hour, local time (0..23) |
| `SPARKKEEP_DISCORD_TOKEN` | `""` | Discord bot token |
| `SPARKKEEP_DISCORD_CHANNEL_ID` | `""` | Discord channel/thread ID |
| `SPARKKEEP_DISCORD_PUBLIC_KEY` | `""` | Discord interaction public key |
| `SPARKKEEP_SLACK_WEBHOOK_URL` | `""` | Slack incoming webhook URL |
| `SPARKKEEP_SLACK_BOT_TOKEN`| `""` | Slack bot token |
| `SPARKKEEP_SLACK_CHANNEL_ID` | `""` | Slack channel ID |
| `SPARKKEEP_OPENCLAW_URL` | `http://localhost:18789` | OpenClaw gateway base URL |
| `SPARKKEEP_OPENCLAW_TOKEN` | `""` | OpenClaw gateway token |
| `SPARKKEEP_OPENCLAW_CHANNEL` | `whatsapp` | OpenClaw target channel |
| `SPARKKEEP_OPENCLAW_TARGET` | `""` | OpenClaw destination/recipient |

### 💾 Backup & Restore

`sparkkeep backup [output-file]` writes a consistent single-file snapshot of the SQLite database using `VACUUM INTO`, safe to run while the daemon is live (WAL mode). Without an argument it writes `<dbdir>/backups/sparkkeep-<UTC YYYYMMDD-HHMMSS>.db`.

This snapshots the SQLite database only. Uploaded media lives in `SPARKKEEP_UPLOAD_DIR` (default `<dbdir>/uploads`), a separate directory to copy alongside the backup.

To restore: stop the daemon, copy the backup file over the path in `SPARKKEEP_DB`, then start the daemon again.

---

## 🧩 Browser Extension (Chrome & Firefox)

Capture web pages, articles, and research sources with 1-click directly into your Sparkkeep library:
1. In Chrome/Brave/Edge, navigate to `chrome://extensions/` and enable **Developer mode**.
2. Click **Load unpacked** and select the [`extension/`](extension/) directory from this repository.
3. Click the Sparkkeep extension icon in your toolbar, enter your instance URL (e.g. `http://localhost:8080`) and your Master Passphrase / Token to connect.

---

## 🔄 Upgrade & Rollback Procedures

Sparkkeep uses forward-only SQLite migrations. When upgrading your instance:
1. **Take a backup:** Always create a backup before upgrading container images or binaries:
   ```bash
   # Docker
   docker compose exec sparkkeep sparkkeep backup /data/backup-pre-upgrade.db
   # Standalone binary
   ./sparkkeep backup ./backup-pre-upgrade.db
   ```
2. **Upgrade image or binary:** Pull the latest container (`docker compose pull && docker compose up -d`) or replace the executable. Schema migrations apply automatically on boot.
3. **Rollback:** Because schema downgrade protection prohibits older binaries from executing against newer schemas, rolling back requires stopping the daemon and restoring your pre-upgrade backup file over `SPARKKEEP_DB`.

## 🏛️ Technology Stack

- **Backend:** Go 1.26 (Standard library HTTP routing, pure-Go SQLite via `modernc.org/sqlite`, zero CGO).
- **Frontend:** React 19 + TypeScript + Vite. Assets are embedded directly into the Go executable via `//go:embed`.
- **Search:** Embedded SQLite FTS5 with database triggers for zero-lag full-text indexing.
- **Portability:** Builds into a single lightweight binary (<25MB) across Linux, macOS, and Windows.

---

## ☕ Support Sparkkeep

Sparkkeep is 100% free and open-source software under the [MIT License](LICENSE). If Sparkkeep brings clarity to your thoughts, saves you time, or powers your daily workflow, consider buying a coffee or becoming a sponsor:

- ☕ **[Buy me a coffee on Ko-fi](https://ko-fi.com/andreiburlacu)** (0% platform fee, one-off tips or monthly)
- 💖 **[Sponsor on GitHub](https://github.com/sponsors/BurlacuAndrei)** (Direct GitHub sponsorship)

Your support fuels active maintenance, continuous feature development, and keeps Sparkkeep independent!

---

## 🤝 Contributing

We welcome community contributions, bug reports, and suggestions!
- Read our [Contributing Guide](CONTRIBUTING.md) to set up your local development environment.
- Review our [Security Policy](SECURITY.md) for vulnerability reporting.

---

## 📄 License & Transparency

Sparkkeep is open-source software licensed under the [MIT License](LICENSE).

All features are included: capture, multi-channel messaging, triage, LLM analysis, kanban workflows, research playbooks, Obsidian sync, and webhooks are 100% free and open-source. There are no paid tiers, no license keys, and no gated capabilities. For our architectural review, please refer to our internal [System Architecture](docs/design.md).