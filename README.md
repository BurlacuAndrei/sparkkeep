# Sparkkeep — Self-Hosted Capture & Action Engine

[![CI](https://github.com/BurlacuAndrei/sparkkeep/actions/workflows/ci.yml/badge.svg)](https://github.com/BurlacuAndrei/sparkkeep/actions/workflows/ci.yml)
[![Docker](https://github.com/BurlacuAndrei/sparkkeep/actions/workflows/docker.yml/badge.svg)](https://github.com/BurlacuAndrei/sparkkeep/actions/workflows/docker.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Go Version](https://img.shields.io/github/go-mod/go-version/BurlacuAndrei/sparkkeep)](go.mod)

Sparkkeep shortens the path from seeing an idea to executing it. Share a post, link, repo, or note from Telegram or the web, sparkkeep analyzes it with your preferred AI model, splits it into actionable idea cards, routes each into the right horizon, and lets you triage them Kanban-style — packaged as a **single binary** with **zero external database dependencies**.

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

Or using **Docker Compose**:

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

### Option 2: Pre-Built Standalone Binary

Download the latest binary for your operating system from [Releases](https://github.com/BurlacuAndrei/sparkkeep/releases):

```bash
# Example for Linux AMD64
tar -xzf sparkkeep-v1.0.0-linux-amd64.tar.gz
./sparkkeep-linux-amd64
```

Then visit **`http://localhost:8080`** in your browser.

---

## 🧙‍♂️ Zero-Touch First-Run Wizard

No need to hand-edit `.env` files or mount API key secrets before booting. When you open Sparkkeep for the first time:

1. **Master Passphrase:** Set your admin password.
2. **BYOK (Bring Your Own Keys):** Pick your AI provider in the dropdown:
   - **OpenAI** (`gpt-4o-mini`, `gpt-4o`)
   - **DeepSeek** (`deepseek-chat`, `deepseek-coder`)
   - **Local Ollama** (`llama3.2`, `mistral`, `qwen2.5`)
   - **Custom OpenAI-Compatible** (vLLM, LM Studio, OpenRouter)
3. **Instant Launch:** Keys are saved directly to your private, local SQLite database (`/data/sparkkeep.db`) and hot-reloaded without server restart.

---

## ✨ Key Features

Sparkkeep is designed to be a lightweight, privacy-first engine that helps you move from an idea to execution without friction.

- **Seamless Capture & Triage:** Instantly capture links, repos, and notes from the web, Telegram, OpenClaw (WhatsApp, Signal, iMessage), Discord, and Slack and turn them into actionable cards.
- **Multi-Channel Hub & Provenance:** Evolve past single-chat bots. Ingest and notify across Telegram, Discord, Slack, and OpenClaw gateways with full card provenance tracking (`source_channel`).
- **Kanban-Style Organization:** Organize ideas smoothly into Inbox, Doing, Done, and Shelved workflows.
- **Horizon Routing:** Keep your focus sharp with Now, Next, and Later horizons.
- **Bring Your Own Keys (BYOK):** Use your preferred AI models. Sparkkeep supports OpenAI, DeepSeek, local Ollama, and any custom OpenAI-compatible endpoint.
- **Local-First & Embedded Architecture:** Zero external database dependencies. The entire app, including the embedded SQLite database, runs from a single lightweight binary.
- **Powerful Search:** Instantly locate any card or past idea using built-in full-text search.

---

## 📡 Multi-Channel Hub & OpenClaw Integration

Sparkkeep features a unified **Channel Hub** supporting both in-binary native transports and external gateway bridges:

1. **Telegram:** Native stdlib HTTP long-polling with interactive inline buttons (`→ Doing`, `→ Done`, `Research`, `Shelve`).
2. **OpenClaw Bridge:** Connects to [OpenClaw Gateway](https://github.com/openclaw) via `POST /hooks/agent`. Unlocks **WhatsApp, Signal, iMessage, and Matrix** without bloating the Sparkkeep binary with headless browser drivers or native C bindings.
3. **Discord:** Rich Embed cards with interactive ActionRow components for instant triage from any server or channel.
4. **Slack:** Rich Block Kit formatting with interactive action buttons and incoming webhook support.
5. **Interactive Testing:** Test connectivity and dispatch weekly digests to any or all configured channels right from the Settings modal.

---

## ⚙️ Advanced Configuration (Optional)

If you prefer pre-seeding settings via environment variables (e.g. in Kubernetes or headless homelabs), you can still pass them (or configure them dynamically in the web UI Settings):

| Environment Variable | Default | Description |
|---|---|---|
| `SPARKKEEP_DB` | `/data/sparkkeep.db` | SQLite database file path |
| `SPARKKEEP_HTTP_ADDR` | `:8080` | Bind address and port |
| `SPARKKEEP_AUTH_TOKEN` | *Dynamic (DB)* | Master authentication bearer token |
| `SPARKKEEP_LLM_BASE` | *Dynamic (DB)* | Base URL for LLM provider API |
| `SPARKKEEP_LLM_KEY` | *Dynamic (DB)* | API Key for LLM provider |
| `SPARKKEEP_LLM_MODEL` | *Dynamic (DB)* | LLM model identifier |
| `SPARKKEEP_TG_TOKEN` | `""` | Telegram bot token for mobile captures |
| `SPARKKEEP_TG_CHAT_ID` | `0` | Authorized Telegram user/chat ID |
| `SPARKKEEP_OPENCLAW_URL` | `http://localhost:18789` | OpenClaw Gateway endpoint |
| `SPARKKEEP_OPENCLAW_TOKEN` | `""` | Bearer token for OpenClaw Gateway |
| `SPARKKEEP_OPENCLAW_CHANNEL`| `whatsapp` | Primary transport target (whatsapp, signal, imessage) |
| `SPARKKEEP_OPENCLAW_TARGET` | `""` | Target recipient phone number, jid, or group ID |
| `SPARKKEEP_DISCORD_TOKEN` | `""` | Discord Bot Token |
| `SPARKKEEP_DISCORD_CHANNEL_ID`| `""` | Default Discord channel ID for notifications |
| `SPARKKEEP_DISCORD_PUBLIC_KEY`| `""` | Discord Interaction verification public key |
| `SPARKKEEP_SLACK_WEBHOOK_URL`| `""` | Slack Incoming Webhook URL |
| `SPARKKEEP_SLACK_BOT_TOKEN` | `""` | Slack Bot OAuth Token |
| `SPARKKEEP_SLACK_CHANNEL_ID` | `""` | Default Slack channel ID |
| `SPARKKEEP_SEARCH_URL` | `https://searx.be` | SearXNG instance for deep research |
| `SPARKKEEP_HEADLESS_ENABLED` | `true` | Enable Chrome headless DOM scraping |

---

## 🏛️ Architecture

Sparkkeep is engineered for speed, privacy, and zero maintenance:

- **Backend:** Go (modern standard library + pure-Go SQLite via `modernc.org/sqlite`).
- **Frontend:** React 19 + TypeScript + Vite. Built assets are embedded directly into the Go executable via `//go:embed`.
- **Database:** Local SQLite database with automated up-migrations.
- **Portability:** Builds into a ~22 MB single static binary for Linux, macOS, and Windows.

---

## 🤝 Contributing

We welcome community contributions, bug reports, and suggestions!
- Read our [Contributing Guide](CONTRIBUTING.md) to set up your local development environment.
- Review our [Security Policy](SECURITY.md) for vulnerability reports.

---

## 📄 License

Sparkkeep is open-source software licensed under the [MIT License](LICENSE).