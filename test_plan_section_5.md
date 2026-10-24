## 5. Channel Adapters & Webhooks

### 5.1 Telegram Ingestion & Markdown Truncation
- [x] **CHAN-01**: Verify Telegram adapter handles long-polling updates, aggregates media group albums, and escapes reserved Markdown characters.
**Why it is done?**
Prevents Telegram API errors when card titles or summaries contain unescaped Markdown syntax.
- Status: PASS
- Verified by / date / commit: Subagent 5 (Channel Adapters & Webhooks) / 2026-10-24 / 276afd3
- Evidence: `Run(ctx)` polls updates via `/getUpdates?timeout=25&offset=<offset+1>` with persisted offset in `offsetFile()`. `bufferMediaGroup` and `flushMediaGroup` aggregate multi-part photo/document albums into single `capture.Share` of kind `capture.KindImage` with combined files and caption (`TestMediaGroupAggregation` passes). `escapeMarkdown` replaces `_`, `*`, `[`, and ``` ` ``` with backslash-escaped characters in placeholder and error messages. `cardCaption` truncates via `safeTruncate` at 4000 runes with closing tokens. Full telegram suite passes (`go test -v ./internal/channel/telegram` -> 28 tests PASS).
- Edge case checked: Tested 4,500-character input with unclosed `*`, `_`, and ``` ` ``` tokens (`*bold _italic `code ...`). `safeTruncate(input, 4000)` produced 4003 runes with trailing `…*_```, balancing all asterisks (2), underscores (2), and backticks (2). All tokens closed, total runes (4003) well within Telegram 4096-rune limit (`TestCardCaption_SafeTruncateLong`).
- Links: `internal/channel/telegram/telegram.go:550-566`, `internal/channel/telegram/telegram_test.go:963-991`, `internal/channel/telegram/telegram_test.go:1771-1844`

### 5.2 Discord Rich Embeds & Ed25519 Interaction Verification
- [x] **CHAN-02**: Verify Discord webhook validates `X-Signature-Ed25519` and responds with HTTP 401 on invalid signatures.
**Why it is done?**
Satisfies Discord bot security requirements and prevents forged interaction payloads.
- Status: PASS
- Verified by / date / commit: Subagent 5 (Channel Adapters & Webhooks) / 2026-10-24 / 276afd3
- Evidence: `HandleInteraction` reads body up to 1MB, decodes `X-Signature-Ed25519` hex and `X-Signature-Timestamp`, and verifies with `ed25519.Verify(a.pubKey, append([]byte(timestamp), body...), sig)`. Rejects invalid signature, wrong key, missing timestamp, or missing public key with HTTP 401 Unauthorized before parsing payload. Rich embeds construct type/title header, TLDR description, worthiness/horizon/tags fields, and ActionRow buttons for deep research, horizons (short/med/long), and discard. All Discord tests pass (`go test -v ./internal/channel/discord` -> 5 tests PASS).
- Edge case checked: Tested interaction payload with tampered timestamp (`"1700000000"` vs `"1700000001"`), modified signature byte, missing timestamp header, and payload alteration. Verified HTTP 401 returned and `svc.UpdateCard` never invoked (`TestDiscordHandleInteractionRejectsInvalidSignature` in `discord_test.go:135-179`).
- Links: `internal/channel/discord/discord.go:280-300`, `internal/channel/discord/discord_test.go:135-179`

### 5.3 Slack Block Kit Notifications
- [ ] **CHAN-03**: Verify Slack adapter delivers notification blocks with action buttons and headers via incoming webhook.
**Why it is done?**
Ensures Slack team members receive triage cards and digest summaries cleanly.
- Status: PARTIAL
- Verified by / date / commit: Subagent 5 (Channel Adapters & Webhooks) / 2026-10-24 / 276afd3
- Evidence: `Notify` constructs Slack Block Kit payload with header block, markdown section block, and action buttons (`🔬 Deep Research`, `Short`, `Medium`, `Long`, `✕ Discard`) and delivers via incoming webhook URL or Slack Web API (`chat.postMessage`). Unit test `TestSlackNotifyWebhook` passes.
- Edge case checked: Inspected `buildBlockPayload` when card has empty notes/summary (`c.TLDR == ""` and `c.Summary == ""`). Variable `desc` evaluates to `""`, emitting `{"type": "section", "text": {"type": "mrkdwn", "text": ""}}`. Slack Block Kit schema specifies section `text.text` requires `minLength: 1`, returning HTTP 400 `invalid_blocks` from Slack API. Defect filed.
- Links: `internal/channel/slack/slack.go:132-152`, `internal/channel/slack/slack_test.go:13-49`, https://github.com/BurlacuAndrei/sparkkeep/issues/31

### 5.4 OpenClaw Multi-Messenger Bridge & Command Parser
- [ ] **CHAN-04**: Verify OpenClaw adapter authenticates bearer token and parses text commands (`/research <id>`, `/discard <id>`).
**Why it is done?**
Allows users on WhatsApp, Signal, or Matrix to control card state remotely.
- Status: PARTIAL
- Verified by / date / commit: Subagent 5 (Channel Adapters & Webhooks) / 2026-10-24 / 276afd3
- Evidence: `HandleWebhook` verifies bearer token in `Authorization: Bearer <token>` or `?token=<token>`. Fails closed when no token is configured (HTTP 401) and rejects unauthorized tokens (HTTP 401). Parses action commands `/research <id>`, `/short <id>`, `/med <id>`, `/long <id>`, and `/discard <id>`. OpenClaw unit tests pass (`go test -v ./internal/channel/openclaw` -> 5 tests PASS).
- Edge case checked: Command with non-existent card ID (e.g. `/discard 999999`). In `handleActionCommand`, `_, _ = a.Service.UpdateCard(...)` ignores the error and returns `Card 999999 shelved`, yielding a false-positive HTTP 200 `{"ok": true, "message": "Card 999999 shelved"}`. Similarly, `/research 999999` reports started research while failing in background goroutine. Defect filed.
- Links: `internal/channel/openclaw/openclaw.go:273-364, 367-412`, `internal/channel/openclaw/openclaw_test.go:85-162`, https://github.com/BurlacuAndrei/sparkkeep/issues/32

### 5.5 Outbound Webhooks & HMAC-SHA256 Signatures
- [ ] **CHAN-05**: Verify outbound webhook dispatch sends `X-Sparkkeep-Signature: sha256=<hex>` and joins shutdown WaitGroup.
**Why it is done?**
Ensures downstream systems can verify payload authenticity and in-flight webhooks are not terminated abruptly on server shutdown.
- Status: PARTIAL
- Verified by / date / commit: Subagent 5 (Channel Adapters & Webhooks) / 2026-10-24 / 276afd3
- Evidence: `SendSync` computes HMAC-SHA256 signature using shared secret and sets header `X-Sparkkeep-Signature: sha256=<hex>`. Verified with `TestWebhook_DeliveryAndSignature`. However, `d.Dispatch` launches an untracked background goroutine (`go func() { ... }()`) and does not join `core.Service.WG` or any shutdown `WaitGroup`. In-flight webhooks can be killed abruptly on process termination. Defect filed.
- Edge case checked: Verified HMAC tampering check where altering 1 byte in payload or signature causes receiver verification (`hmac.Equal`) to fail (`TestWebhook_DeliveryAndSignature`).
- Links: `internal/webhook/webhook.go:51-77, 99-103, 122-126`, `internal/webhook/webhook_test.go:94-124`, `cmd/sparkkeep/main.go:303-312`, https://github.com/BurlacuAndrei/sparkkeep/issues/30
