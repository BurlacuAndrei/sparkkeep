# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-10

Initial public release of Sparkkeep under AGPL-3.0.

### Added
- **Self-hosted capture & action engine**: pure-Go SQLite (`modernc.org/sqlite`)
  with WAL mode and FTS5 full-text search, embedded React 19 UI (`//go:embed`),
  and multi-arch Docker / standalone binaries.
- **Omni-channel ingestion & interactive chat triage**: two-way Telegram bot,
  Discord embeds and ActionRows, Slack Block Kit, universal inbound webhook,
  Chrome/Firefox Web Clipper extension, and URL-less Subject Cards.
- **Privacy-first BYOK AI pipeline**: noise gate, structured card synthesis
  (TL;DR, value proposition, actionable checklist), and per-role routing across
  Ollama, LM Studio, vLLM, OpenAI, DeepSeek, or any OpenAI-compatible endpoint.
- **Execution Board & Swipeable Triage Deck**: keyboard-driven backlog triage,
  Focus Spotlight, 7-day Execution Pulse, horizon/taxonomy swimlanes, and a
  docked board inspector.
- **Deterministic Deep Research & Playbook Studio**: bounded research pipelines
  with SearXNG web search, 5-Pillar Research Health Linter, cost estimator,
  zero-cost dry runs, cited dossiers, and Pursue / Watch / Skip verdicts.
- **Intelligence Digest**: 7/14/30-day accomplishment telemetry, period wins
  showcase, stale bottleneck resolution, and executive retrospective synthesis.
- **Knowledge Sinks & Outbox**: idempotent one-way sync and lifecycle auto-export
  to Obsidian, Notion, and Joplin, plus authenticated RSS outbox, Markdown/ZIP
  exports, and client intents for Logseq, Things 3, Todoist, and GitHub.
- **Operations & Security**: login throttling, opaque `HttpOnly` 30-day session
  cookies, `/livez`, `/readyz`, `/metrics`, and online `backup` / `restore` CLI.
- **Six UI languages**: complete localized catalogs and plural rules for English,
  Romanian, Spanish, Brazilian Portuguese, French, and German.
