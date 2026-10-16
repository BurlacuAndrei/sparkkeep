# 01: Core Broadcast Morning Digest & Multi-Channel Fanout

**What to build:**
Lift scheduled morning research digest generation out of the isolated Telegram adapter into `internal/core/Service`. Expose `Service.SendMorningDigest(ctx context.Context) error` that retrieves completed research runs within the digest window from the store, compiles the briefing, and dispatches it via `port.ChannelHub.Notify(ctx, notification)` with broadcast fallback across all registered channels (Telegram, Discord, Slack, and Inbound Webhooks). Clean up `internal/channel/telegram/telegram.go` so it delegates to or receives notifications rather than reaching into SQLite storage directly or running an isolated digest loop.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] Add `SendMorningDigest(ctx context.Context) error` to `internal/core/Service` (or queue scheduler)
- [x] Send digest notifications through `port.ChannelHub.Notify` with channel provenance / broadcast fallback
- [x] Remove direct store queries and isolated database setting mutations (`last_morning_digest_at`) from `internal/channel/telegram/telegram.go`
- [x] Add unit and integration tests in `internal/core/core_test.go` or `internal/channel/hub_test.go` verifying multi-channel fanout
- [x] Ensure all Go tests pass: `go test -v ./...`
