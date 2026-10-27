# Sparkkeep

**Capture anything. Triage it with AI. Ship what matters.**

Sparkkeep is a self-hosted action engine for the ideas you keep collecting and never execute. Share a link, a note, a voice memo, or a screenshot — it scrapes it, filters the noise, synthesizes an actionable brief, and puts it on a board you actually work from.

One binary. One SQLite file. No Postgres, no Redis, no cloud account.

<p align="center">
  <!-- Core Build & Security Status -->
  <a href="https://github.com/BurlacuAndrei/sparkkeep/actions/workflows/ci.yml"><img src="https://github.com/BurlacuAndrei/sparkkeep/actions/workflows/ci.yml/badge.svg" alt="CI Status" /></a>
  <a href="https://github.com/BurlacuAndrei/sparkkeep/actions/workflows/docker.yml"><img src="https://github.com/BurlacuAndrei/sparkkeep/actions/workflows/docker.yml/badge.svg" alt="Docker Build" /></a>
  <a href="https://github.com/BurlacuAndrei/sparkkeep/actions/workflows/scorecard.yml"><img src="https://github.com/BurlacuAndrei/sparkkeep/actions/workflows/scorecard.yml/badge.svg" alt="OpenSSF Scorecard" /></a>
  <br />
  <!-- Release & Distribution -->
  <a href="https://github.com/BurlacuAndrei/sparkkeep/releases"><img src="https://img.shields.io/github/v/release/BurlacuAndrei/sparkkeep?include_prereleases&color=7928CA" alt="Release" /></a>
  <a href="https://github.com/BurlacuAndrei/sparkkeep/pkgs/container/sparkkeep"><img src="https://img.shields.io/badge/Container-ghcr.io-success" alt="Container" /></a>
  <a href="go.mod"><img src="https://img.shields.io/github/go-mod/go-version/BurlacuAndrei/sparkkeep" alt="Go Version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-blue.svg" alt="License: AGPL-3.0" /></a>
  <br />
  <!-- Community & Support -->
  <a href="https://github.com/BurlacuAndrei/sparkkeep/issues"><img src="https://img.shields.io/badge/Community-Issues-blueviolet?logo=github" alt="Issues" /></a>
  <a href="https://ko-fi.com/andreiburlacu"><img src="https://img.shields.io/badge/Ko--fi-Buy%20me%20a%20coffee-ff5e5b?logo=ko-fi&logoColor=white" alt="Ko-fi" /></a>
  <a href="https://github.com/sponsors/BurlacuAndrei"><img src="https://img.shields.io/badge/Sponsor-%E2%9D%A4-ea4aaa?logo=github-sponsors&logoColor=white" alt="GitHub Sponsor" /></a>
</p>

<p align="center">
  <img src="docs/assets/dashboard-hero.png" alt="Sparkkeep Execution Board with Focus Spotlight and Execution Pulse" width="100%" style="border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.35);" />
</p>

## Bookmark managers are graveyards

You save 200 interesting links. You open maybe four. The rest rot in a folder called "later".

Sparkkeep is not a bookmark manager. It is an action engine:

```
Capture ──► Noise Gate ──► AI Triage ──► Horizon Routing ──► Execution Board ──► Research ──► Digest ──► Shipped
```

1. **Capture** from Telegram, Discord, Slack, the browser extension, a webhook, or a plain note with no URL at all.
2. **Filter** engagement bait and spam before it reaches your inbox.
3. **Synthesize** a brief — TL;DR, why you'd care, and a checklist of next actions — using your own LLM.
4. **Route** work into Now, Next, or Later, and execute it from a widescreen board with inline checklists.
5. **Research** properly: deterministic playbooks that search, cite sources, and issue a Pursue / Watch / Skip verdict instead of hallucinating.
6. **Review** with a 7/14/30-day digest, then push finished notes to Obsidian, Notion, or Joplin.

## Quick start

```bash
docker run -d \
  --name sparkkeep \
  -p 8080:8080 \
  -v sparkkeep_data:/data \
  ghcr.io/burlacuandrei/sparkkeep:latest
```

Open **http://localhost:8080**. The first-run wizard asks for a passphrase and an AI provider, and offers a one-click demo library so you can look around before committing.

<details>
<summary>Other install options</summary>

**Docker Compose**

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

**Standalone binary** — ~24 MB, Linux / macOS / Windows, from [Releases](https://github.com/BurlacuAndrei/sparkkeep/releases):

```bash
tar -xzf sparkkeep-<VERSION>-linux-amd64.tar.gz
./sparkkeep-linux-amd64
```

**Build from source**

```bash
make build
```

</details>

### Rather not run it yourself?

[**Sparkkeep Cloud**](https://github.com/BurlacuAndrei/sparkkeep/issues) is a managed hosting option for people who want the same application without maintaining a server. It runs this exact AGPL-3.0 build with no feature gating — the self-hosted edition is never deprecated or held back. Cloud has no public signup or price list yet; open an issue if you want to be told when it opens, or to ask about a commercial license.

## What you get

- **Zero-dependency storage** — pure-Go SQLite in WAL mode with FTS5 search. Runs on a Raspberry Pi, NAS, or 5 € VPS in under 30 MB RAM.
- **Omni-channel capture** — Telegram two-way bot, Discord embeds and buttons, Slack Block Kit, universal inbound webhook, and a Chrome/Firefox extension.
- **Triage from chat** — inline keyboards and ActionRows so you can route or shelve a card without opening the web app.
- **Board that drives work** — Focus Spotlight picks your highest-leverage card, Execution Pulse shows 7-day shipped velocity, swimlanes group by horizon or card type, and a docked inspector keeps the board live while you edit.
- **Card dossiers** — TL;DR, why it matters, checklist, and regenerable briefs. Notes without URLs become first-class Subject Cards.
- **Deterministic deep research** — bounded playbooks with a 5-Pillar Research Health Linter, cost estimator, and zero-cost dry runs. No unbounded agent loops.
- **Playbook Studio** — visual step sequencer for building your own research pipelines, routed automatically by card taxonomy.
- **Intelligence Digest** — period wins, momentum pulse, and an executive retrospective written by your own model.
- **Knowledge sinks** — idempotent one-way export to Obsidian, Notion, and Joplin, plus an authenticated RSS outbox and client intents for Logseq, Things 3, Todoist, and GitHub.
- **Privacy-first BYOK** — Ollama, LM Studio, vLLM, OpenAI, DeepSeek, or any OpenAI-compatible endpoint, with per-role model routing. Point it at local models and nothing leaves your hardware.
- **Operations ready** — `/livez`, `/readyz`, zero-dependency `/metrics`, and a `backup` / `restore` CLI that snapshots safely while the daemon runs.
- **Six UI languages** — English, Romanian, Spanish, Portuguese (Brasil), French, German.

## Stack

Go 1.26 standard-library HTTP, pure-Go SQLite (`modernc.org/sqlite`, no CGO), React 19 + TypeScript + Vite embedded into the binary with `//go:embed`. Optional companions: headless Chromium for scraping, `yt-dlp` for video, Whisper for audio, SearXNG for research search.

## Screenshots

**Triage deck** — burn through the backlog with `1` / `2` / `3` / `Esc`.

<p align="center">
  <img src="docs/assets/triage-deck.png" alt="Swipeable Triage Deck" width="100%" style="border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.35);" />
</p>

**Research dossier** — cited sources, risk assessment, and a clear verdict.

<p align="center">
  <img src="docs/assets/research-dossier.png" alt="Deep Research Dossier" width="100%" style="border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.35);" />
</p>

**Playbook Studio** — visual pipeline builder with the 5-Pillar Research Health Linter.

<p align="center">
  <img src="docs/assets/playbook-studio.png" alt="Playbook Studio Workspace" width="100%" style="border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.35);" />
</p>

**Intelligence Digest** — what actually shipped, and what to focus on next.

<p align="center">
  <img src="docs/assets/weekly-digest.png" alt="Intelligence Digest with Executive Briefing and Period Wins" width="100%" style="border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.35);" />
</p>

## Documentation

| | |
|---|---|
| [Configuration reference](docs/configuration.md) | Every environment variable, health probes, `/metrics` |
| [Operations](docs/operations.md) | Backup, restore, upgrade, rollback, library export, browser extension |
| [Localization](docs/localization.md) | Adding a language to the UI |
| [System architecture](docs/design.md) | How the pipeline fits together |
| [Decision records](docs/adr/) | Why the research, taxonomy, and sink designs look like this |

## Support Sparkkeep

Sparkkeep is free and open source under [AGPL-3.0](LICENSE). If it earns a place in your workflow:

- ☕ [Buy me a coffee on Ko-fi](https://ko-fi.com/andreiburlacu)
- 💖 [Sponsor on GitHub](https://github.com/sponsors/BurlacuAndrei)

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

A commercial license is available for closed-source or SaaS distribution where AGPL obligations cannot be met; [open an issue](https://github.com/BurlacuAndrei/sparkkeep/issues) for terms. Self-hosting and internal use need no license key, now or later.
