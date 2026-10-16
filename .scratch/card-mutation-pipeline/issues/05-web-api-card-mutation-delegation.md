# 05: Web API Card Mutation Handlers Delegation

**What to build:** Delegates card patch, tag update, comment, and batch stale archiving from `internal/web/cards_handler.go` into domain core, ensuring identical validation, provenance, and webhook dispatch across HTTP and chat transports.

**Blocked by:** 01: Domain Core Card Mutation Pipeline & Webhook Dispatch (Expand)

**Status:** ready-for-agent

- [ ] `patchCard` in `internal/web/cards_handler.go` delegates to `svc.UpdateCard` and `svc.SetCardTags`
- [ ] `createCardComment` delegates to `svc.AddCardComment`
- [ ] `batchShelveStale` delegates to `svc.ShelveStaleCards`
- [ ] Web handler responses retain existing JSON schemas and status codes
- [ ] Web integration tests in `internal/web/web_test.go` pass with zero regressions
