<p align="center">
  <img src="docs/assets/banner.jpg" alt="Sparkkeep Banner" width="100%" style="border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.3);" />
</p>

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
  <a href="https://hub.docker.com/"><img src="https://img.shields.io/badge/Container-ghcr.io-success" alt="Container" /></a>
</p>

---

## 💡 Why Sparkkeep?

Most "read-it-later" and bookmarking apps are digital graveyards: you save interesting links, repos, and notes, but **never execute on them**. 

**Sparkkeep is not a bookmark manager — it is an Action Engine.**

When you share an idea, tweet, GitHub repository, audio memo, or screenshot from your mobile phone or web browser, Sparkkeep:
1. **Captures it immutably** with full source provenance tracking.
2. **Scrapes & transcribes** content automatically (headless Chrome, yt-dlp, Whisper ASR).
3. **Synthesizes a structured Triage Brief** using your choice of LLM (local Ollama or cloud).
4. **Decomposes complex items** into discrete, actionable cards routed to realistic horizons (**Now**, **Next**, **Later**).
5. **Enables deep, hallucination-free research playbooks** with factual web groundings and citations.

```
 Traditional Bookmarkers:  Save Link ─────────────► Digital Graveyard 💀
 Sparkkeep Engine:         Capture ──► AI Triage ──► Horizon Routing ──► Deep Research ──► Shipped 🚀
```

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
# Example for Linux AMD64
tar -xzf sparkkeep-v1.0.0-linux-amd64.tar.gz
./sparkkeep-linux-amd64
```

Then navigate to **`http://localhost:8080`** in your browser.

---

## 🧙‍♂️ Zero-Touch First-Run Wizard

No editing `.env` files or mounting secret volumes before booting. On initial launch, Sparkkeep walks you through an interactive setup directly in the UI:

```mermaid
flowchart LR
    A[Launch Sparkkeep] --> B[Set Master Passphrase]
    B --> C[Select AI Provider\nOllama / OpenAI / DeepSeek]
    C --> D[Save to Private SQLite DB]
    D --> E[Ready to Capture & Triage]
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
graph TD
    subgraph Inputs [Inbound Capture Channels]
        TG[Telegram Bot]
        DC[Discord Embeds]
        SL[Slack Block Kit]
        OC[OpenClaw Gateway\nWhatsApp / Signal / iMessage]
        WB[Web Extension & REST API]
    end

    subgraph Hub [Unified Channel Router & Provenance]
        ROUTER[internal/channel/Hub]
    end

    subgraph Pipeline [Capture & Triage Engine]
        SCRAPE[Scraper & Fetcher\nHTTP / Headless Chrome / yt-dlp]
        ASR[Whisper ASR Audio Engine]
        LLM[LLM Synthesis & Card Splitter]
    end

    subgraph Store [Embedded Local Store]
        SQLITE[(SQLite + WAL Mode\nmodernc.org/sqlite)]
        FTS[FTS5 Full-Text Search Engine]
    end

    subgraph UI [Embedded Modern Frontend]
        REACT[React 19 + TypeScript SPA\nEmbedded via go:embed]
        KANBAN[Kanban & Horizon Boards]
        TRIAGE[Swipeable Triage Deck]
        SEARCH[Omnisearch Cmd+K]
    end

    subgraph Research [Deterministic Research Playbooks]
        SEARX[SearXNG Search Engine]
        VERIFY[Claim Verification & [S#] Citations]
        REPORT[Markdown Intelligence Dossier]
    end

    Inputs --> ROUTER
    ROUTER --> SCRAPE
    SCRAPE --> ASR
    ASR --> LLM
    LLM --> SQLITE
    SQLITE --> FTS
    SQLITE --> REACT
    REACT --> KANBAN
    REACT --> TRIAGE
    REACT --> SEARCH
    KANBAN --> Research
    Research --> SEARX
    SEARX --> VERIFY
    VERIFY --> REPORT
```

---

## ✨ Key Strengths & Capabilities

| Capability | What It Does | Why It Matters |
|---|---|---|
| **Zero-DB Single Binary** | Pure Go SQLite (`modernc.org/sqlite`), no CGO, no PostgreSQL, no Redis. | Runs anywhere (Raspberry Pi, NAS, VPS, Mac) in <30MB RAM with zero maintenance. |
| **Omni-Channel Capture** | Ingest links, notes, images, and voice memos from Telegram, Discord, Slack, and OpenClaw. | Never lose an idea on mobile. Capture from the apps you already live in. |
| **Interactive In-Place Triage** | Telegram inline keyboards & Discord ActionRows let you triage (`→ Doing`, `→ Done`, `Shelve`) directly in chat. | Triage from your notifications without ever opening the web app. |
| **Dual-View Productivity** | Switch seamlessly between a fluid Kanban Board and a Tinder-style swipeable **Triage Deck**. | Rapidly burn through capture backlogs with zero cognitive friction. |
| **Deterministic Deep Research** | Bounded, multi-step investigative playbooks (Ground → Plan → Search → Fact-Check → Verdict). | No hallucinating infinite loops; generates verified reports backed by citations. |
| **Omnisearch (Cmd+K)** | Instant, keyboard-first full-text search indexed in real-time via SQLite FTS5. | Find any card, snippet, tag, or note across years of captured data in milliseconds. |
| **Privacy-First BYOK** | Connect local Ollama instances or custom OpenAI-compatible endpoints. | Your thoughts, notes, and research stay entirely on your private hardware. |

---

## 📡 Multi-Channel Hub & OpenClaw Integration

Sparkkeep features an extensible Channel Hub with native long-polling adapters and external gateway bridges:

```mermaid
sequenceDiagram
    autonumber
    actor User as Mobile User
    participant TG as Telegram / Discord / WhatsApp
    participant Hub as Sparkkeep Engine
    participant LLM as LLM Analysis (BYOK)
    participant DB as SQLite (Local)

    User->>TG: Shares URL, Tweet, Note, or Audio Memo
    TG->>Hub: Inbound Webhook / Long-Poll (Provenance Preserved)
    Hub->>Hub: Fetch URL Body / Transcribe Audio
    Hub->>LLM: Generate Triage Brief & Action Items
    LLM-->>Hub: Structured JSON Brief & Cards
    Hub->>DB: Persist Cards & Index via FTS5
    Hub->>TG: Edits message with interactive Triage buttons
    User->>TG: Clicks "→ Doing" or "Deep Research"
    TG->>Hub: Card status updated in real-time
```

- **Telegram:** Built-in HTTP long-polling (`getUpdates`) with interactive inline keyboards (`→ Doing`, `→ Done`, `Research`, `Shelve`).
- **OpenClaw Bridge:** Connects to [OpenClaw Gateway](https://github.com/openclaw) via `POST /hooks/agent`, unlocking **WhatsApp, Signal, iMessage, and Matrix** without bloated dependencies.
- **Discord:** Rich Embeds with action color bars and interactive ActionRow button components.
- **Slack:** Rich Block Kit formatting with header blocks, markdown sections, and interactive action buttons.
- **Weekly Digest Broadcasts:** Automatic or on-demand digest broadcasts dispatched across all configured channels.

---

## 🔬 Deterministic Research Playbooks

Unbounded LLM loops are expensive and hallucinate. Sparkkeep's research engine executes deterministic, reproducible playbooks:

```
 [1. Ground]       Ingest card context, captured raw text, and metadata
      │
 [2. Plan]         Formulate decomposing questions and targeted search queries
      │
 [3. Search]       Execute queries against SearXNG or search endpoints
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

---

## ⚙️ Configuration Reference

While all settings can be adjusted on the fly in the **Settings Modal**, you can pre-seed configurations via environment variables:

| Environment Variable | Default | Purpose |
|---|---|---|
| `SPARKKEEP_DB` | `/data/sparkkeep.db` | SQLite database file path |
| `SPARKKEEP_HTTP_ADDR` | `:8080` | Bind address and port |
| `SPARKKEEP_AUTH_TOKEN` | *(Dynamic DB)* | Master authentication bearer token |
| `SPARKKEEP_LLM_BASE` | `http://localhost:11434/v1` | OpenAI-compatible base URL |
| `SPARKKEEP_LLM_KEY` | *(Dynamic DB)* | API Key for LLM provider (optional for Ollama) |
| `SPARKKEEP_LLM_MODEL` | *(Dynamic DB)* | Model identifier (`llama3.2`, `gpt-4o`, `deepseek-chat`) |
| `SPARKKEEP_TG_TOKEN` | `""` | Telegram Bot API token |
| `SPARKKEEP_TG_CHAT_ID` | `0` | Authorized Telegram user/chat ID |
| `SPARKKEEP_OPENCLAW_URL` | `http://localhost:18789` | OpenClaw Gateway bridge endpoint |
| `SPARKKEEP_OPENCLAW_TOKEN`| `""` | Bearer token for OpenClaw Gateway |
| `SPARKKEEP_DISCORD_TOKEN` | `""` | Discord bot token |
| `SPARKKEEP_SLACK_BOT_TOKEN`| `""` | Slack bot token |
| `SPARKKEEP_SEARCH_URL` | `https://searx.be` | SearXNG instance for deep research |
| `SPARKKEEP_HEADLESS_ENABLED` | `true` | Headless Chromium rendering toggle |

---

## 🏛️ Technology Stack

- **Backend:** Go 1.26 (Standard library HTTP routing, pure-Go SQLite via `modernc.org/sqlite`, zero CGO).
- **Frontend:** React 19 + TypeScript + Vite. Assets are embedded directly into the Go executable via `//go:embed`.
- **Search:** Embedded SQLite FTS5 with database triggers for zero-lag full-text indexing.
- **Portability:** Builds into a single lightweight binary (<25MB) across Linux, macOS, and Windows.

---

## 🤝 Contributing

We welcome community contributions, bug reports, and suggestions!
- Read our [Contributing Guide](CONTRIBUTING.md) to set up your local development environment.
- Review our [Security Policy](SECURITY.md) for vulnerability reporting.

---

## 📄 License & Transparency

Sparkkeep is open-source software licensed under the [MIT License](LICENSE).

All core capture, multi-channel messaging, triage, LLM analysis, and kanban workflows are 100% free and open-source. For our architectural and licensing review, please refer to our internal [System Architecture](docs/design.md).