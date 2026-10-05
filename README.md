# sparkkeep — self-hosted capture & organize

Sparkkeep shortens the path from seeing an idea to doing it. Share a
post/link/repo/media from Telegram, sparkkeep analyzes it, splits it into
short idea cards, routes each into the right horizon, and lets you act on it
from a web dashboard — one container, one volume.

## Quick start

```sh
cp .env.example .env
# set SPARKKEEP_LLM_MODEL (e.g. llama3). For Telegram also set
# SPARKKEEP_TG_TOKEN; either DM the bot and copy its chat id into
# SPARKKEEP_TG_CHAT_ID, or set it manually.
docker compose up -d --build
```

Open `:8080` (`SPARKKEEP_HTTP_PORT` to change the published port).

## Config

| key | default | purpose |
|-----|---------|---------|
| `SPARKKEEP_DB` | `./sparkkeep.db` | SQLite path |
| `SPARKKEEP_HTTP_ADDR` | `:8080` | dashboard + API |
| `SPARKKEEP_LLM_BASE` | `http://localhost:11434/v1` | OpenAI-compatible base — Ollama default |
| `SPARKKEEP_LLM_KEY` | `` | API key, empty for Ollama |
| `SPARKKEEP_LLM_MODEL` | `` | required |
| `SPARKKEEP_TG_TOKEN` | `` | empty = Telegram off |
| `SPARKKEEP_TG_CHAT_ID` | `` | owner chat id |
| `SPARKKEEP_SEARCH_URL` | `https://searx.be` | SearXNG JSON search; set your own instance to override |
| `SPARKKEEP_MAX_ANALYZE_TOKENS` | `2048` | cap analysis output |

See `.env.example` for the full list.

## Weekly digest

The dashboard has a **Weekly digest** view (top bar button): cards captured in
the last 7 days grouped by day with per-status counts. You can also send
`/digest` to your Telegram bot anytime to receive your weekly summary directly in chat.

## Layout

One Go binary — `cmd/sparkkeep` plus `internal/{capture,analyze,research,store,web}` — with the dashboard embedded. SQLite file lives in `./data` (`/data` in the container).

Design docs: see `docs/design.md`.