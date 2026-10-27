# Configuration Reference

Every setting can be adjusted on the fly in the **Settings** modal. Environment
variables are the boot-time path: they pre-seed a fresh instance and are handy
in `docker compose` or systemd units.

## Environment variables

| Environment Variable | Default | Purpose |
|---|---|---|
| `SPARKKEEP_DB` | `./sparkkeep.db` (`/data/sparkkeep.db` in the container) | SQLite database file path |
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
| `SPARKKEEP_DIGEST_PUSH_ENABLED` | `true` when `SPARKKEEP_TG_TOKEN` is set | Digest push toggle |
| `SPARKKEEP_DIGEST_PUSH_DAY` | `0` | Digest day (0=Sunday .. 6=Saturday) |
| `SPARKKEEP_DIGEST_PUSH_HOUR` | `19` | Digest hour, local time (0..23) |
| `SPARKKEEP_DISCORD_TOKEN` | `""` | Discord bot token |
| `SPARKKEEP_DISCORD_CHANNEL_ID` | `""` | Discord channel/thread ID |
| `SPARKKEEP_DISCORD_PUBLIC_KEY` | `""` | Discord interaction public key |
| `SPARKKEEP_SLACK_WEBHOOK_URL` | `""` | Slack incoming webhook URL |
| `SPARKKEEP_SLACK_BOT_TOKEN` | `""` | Slack bot token |
| `SPARKKEEP_SLACK_CHANNEL_ID` | `""` | Slack channel ID |
| `SPARKKEEP_OPENCLAW_URL` | `http://localhost:18789` | OpenClaw gateway base URL |
| `SPARKKEEP_OPENCLAW_TOKEN` | `""` | OpenClaw gateway token |
| `SPARKKEEP_OPENCLAW_CHANNEL` | `whatsapp` | OpenClaw target channel |
| `SPARKKEEP_OPENCLAW_TARGET` | `""` | OpenClaw destination/recipient |

## Health & observability

- `GET /livez` reports process liveness.
- `GET /readyz` checks database reachability and upload-directory write access.
- `GET /metrics` exposes a zero-dependency Prometheus text endpoint, including
  uptime and pipeline counters.

All three endpoints are unauthenticated by design so container orchestrators and
reverse proxies can probe them.

## Security notes

Set `SPARKKEEP_AUTH_TOKEN` (or a master passphrase in the setup wizard) before
exposing the instance to a network. An instance started without a token serves
`/api/` unauthenticated.
