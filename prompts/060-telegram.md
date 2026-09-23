# 060 — Telegram channel adapter (long-polling, stdlib)

## Goal
The first `port.Channel` implementation. Long-poll Telegram via stdlib
`net/http` (no bot library). Inbound: messages → `core.Service.Capture`;
reactions; reply-to-card edits; inline-button callback queries (Doing/Done/
Research/Shelve). Outbound: `Notify` → photo caption text + inline keyboard,
and research report links.

## Context
- Reuse the long-polling pattern from `ai/scripts/digest_bot.py` (three files
  up in the NAS repo but the *pattern*): `getUpdates?offset` persisted
  between batches. Read `docs/design.md` §5 first.
- Only stdlib. Config from `config.Config` (`TGToken`, `TGChatID`).
- `Service` and `Store` are injected (loose coupling for tests).

## Files
- Create `internal/channel/telegram/telegram.go`
- Create `internal/channel/telegram/telegram_test.go`

## Interface
```go
package telegram

type Adapter struct {
    Token   string
    OwnerID int64 // configured TG_CHAT_ID; others ignored
    Service *core.Service
    Store   port.Store
    Logf    func(format string, args ...any)
}

// Run blocks: long-poll getUpdates, dispatch each update to a goroutine,
// save offset after each batch; stops when ctx is cancelled.
func (a *Adapter) Run(ctx context.Context) error

// Implements port.Channel (outbound).
func (a *Adapter) Notify(ctx context.Context, n port.Notification) error
```

**Persist offset**: file `sparkkeep_otg_offset.json` (or env
`SPARKKEEP_OFFSET_FILE`, default next to DB); read on start, write after
each successful batch. `ponytail: offset lost = duplicate replies; a crash
mid-batch can still dup — acceptable for a personal bot.`

## Behavior — inbound dispatch (`handleUpdate`)
- **Message**: if `update.message.chat.id != OwnerID` → ignore (owner lock).
  If `photo` present → build `capture.Share{Name:"link", URL:
  caption_url?}` — no, media: `raw = message.text or message.caption`; if
  empty → skip. Else `Service.Capture(ctx, raw)`.
- **CallbackQuery**: map `data` to action on `card_id`:
  - `"doing"` → `Store.UpdateCard(status=doing)`, reply edited keyboard + `Notify(done)`.
  - `"done"` → same with `done`.
  - `"shelve"` → `status=shelved`.
  - `"research"` → `go Service.Research(ctx, cardID)` (goroutine).
- **Reaction changed on a bot message**: only handle `⭐` (→ horizon=lifetime)
  and `⚡` (→ horizon=short-term) on that card id. (`ponytail: passive map;
  new reactions are a config map addition later.`)

## Behavior — outbound (`Notify`)
`n.Kind` mapping to Telegram message:
- `created` → send caption = `"{Title}\n\n{Summary}\n[horizon]\n#{tags comma}"`
  + inline keyboard buttons:
  ```
  [Doing] [Done] [Research] [Shelve]
  ```
  `callback_data` = `"<card_id>:doing"` etc.
- `analysis_failed` → same buttons but caption says `Analysis failed` +
  `[Retry]` button (`"<id>:retry"` → `Service.Retry`).
- `done`/`research_done`/`research_failed` → summary text; for research, link
  text points to `GetResearch` row id (`/api/v1/research/{id}` rendered as
  plain URL; dashboard URL from env `SPARKKEEP_PUBLIC_URL` default
  `http://<host>:8080`).

Use `sendMessage` (parse `Markdown`), and for edited keyboards
`editMessageReplyMarkup`. Handle chat action percent-injection carefully —
build URLs with `url.QueryEscape` only when needed.

## Tests (`telegram_test.go`) — httptest server emulating Bot API
Real `Adapter` pointed at fake bot server; call handlers directly for logic.
- `TestOwnerIgnore` — update from non-owner chat id → no `Service.Capture` call (capture via fake core stub).
- `TestMessageCapturesText` — owner message `"hello"` → `Service.Capture` called with `"hello"`.
- `TestPhotoWithCaptionFallsToText` — update with photo + caption `"x"` → capture `"x"`.
- `TestNoTextNoAction` — caption-free sticker → no call.
- `TestCallbackDoing` — callback `data="5:doing"` → `Store.UpdateCard(5,status doing)` observed via stub store, `answerCallbackQuery` sent.
- `TestCallbackResearch` — callback `5:research` → `Service.Research` invoked (stub starts a goroutine — assert via channel/`waitFor`).
- `TestReactionStarLifetime` — reaction `⭐` on message → UpdateCard(horizon lifetime).
- `TestNotifySendsKeyboard` — `created` notify → captures `reply_markup` contains `:doing` and each button.
- `TestNotifyResearchLink` — `research_done` → message text contains `/api/v1/research/` and the refresh id.
- `TestRunPollLoopNoPanic` — fake API returns updates then closing channel/timeout; `Run(ctx)` returns nil on cancel; offset file written.

## Definition of done
- `go build`, `go vet`, `make test` pass; `gofmt -l .` empty.
- Commit: `feat: telegram long-poll channel (capture, buttons, reactions)`.