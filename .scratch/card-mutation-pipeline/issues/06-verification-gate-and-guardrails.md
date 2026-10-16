# 06: Architecture Verification Gate & Storage Seam Guardrail (Contract)

**What to build:** Updates wiring in `cmd/sparkkeep/main.go` and `internal/web/channels_handler.go` so no channel adapter receives `port.Store`. Verifies strict compliance with Section 1 of `CODING_STANDARDS.md`, updates documentation, and satisfies the `make check` verification gate.

**Blocked by:** 02: Discord Adapter Protocol Bridge Migration, 03: Telegram Adapter Protocol Bridge Migration, 04: OpenClaw and Slack Protocol Bridge Migration, 05: Web API Card Mutation Handlers Delegation

**Status:** resolved

- [x] `cmd/sparkkeep/main.go` constructs all channel adapters without passing `store`
- [x] `internal/web/channels_handler.go` initializes test adapters without passing `store`
- [x] No package under `internal/channel/` imports or references `port.Store`
- [x] `make check` passes completely (gofmt, go vet, go test -race ./..., npm run lint, npm test, dist freshness)
- [x] All tickets 01-06 marked resolved
