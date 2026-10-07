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

## 💎 Features: Community vs. Pro

Sparkkeep is built on an **Open Core** model. The core capture, two-stage triage brief, and baseline research pipeline is 100% free and MIT open-source.

| Capability | Community (Free / MIT) | Pro License ($49 Lifetime) |
|---|:---:|:---:|
| Raw Share Capture & Two-Stage Triage | ✅ | ✅ |
| Kanban Triage (Inbox, Doing, Done, Shelved) | ✅ | ✅ |
| Horizon Routing (Now, Next, Later) | ✅ | ✅ |
| Full-Text Search & Card Filtering | ✅ | ✅ |
| BYOK AI Models (OpenAI, DeepSeek, Ollama) | ✅ | ✅ |
| Automated Weekly Digest & Local Pipeline Metrics | ✅ | ✅ |
| Single-Binary Embedded Architecture | ✅ | ✅ |
| Default (lite) Research Pipeline (`ground, resolve_refs, search, read, report`) | ✅ | ✅ |
| Built-in "Claim check only" Playbook | ✅ | ✅ |
| **Full Default Research Playbook (Planning, Claims Verification, Landscape, Verdict)** | — | ✅ |
| **Custom Research Playbooks & Step Library (Create, Edit, Duplicate)** | — | ✅ |
| **Per-Role AI Model Routing & Token Caps (Triage, Vision, Planning, Synthesis)** | — | ✅ |
| **User Profile ("About Me") Personal Fit Scoring** | — | ✅ |
| **Obsidian Vault 2-Way Markdown Sync** | — | ✅ |
| **Outbound Webhooks (n8n, Zapier, Home Assistant)** | — | ✅ |

> **Privacy-First Offline Verification:** Pro licenses are cryptographically verified offline inside your instance using Ed25519 signatures. Your instance never phones home.

---

## ⚙️ Advanced Configuration (Optional)

If you prefer pre-seeding settings via environment variables (e.g. in Kubernetes or headless homelabs), you can still pass them:

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