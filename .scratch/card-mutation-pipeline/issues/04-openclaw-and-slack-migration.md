# 04: OpenClaw and Slack Protocol Bridge Migration

**What to build:** Migrates OpenClaw action handling to invoke domain core for card triage updates. Removes `port.Store` from both OpenClaw and Slack adapter structs and constructors. Updates `openclaw_test.go` to test action translation without storage dependencies.

**Blocked by:** 01: Domain Core Card Mutation Pipeline & Webhook Dispatch (Expand)

**Status:** resolved

- [x] OpenClaw `Adapter` and `New` no longer depend on `port.Store`
- [x] OpenClaw triage actions call `Service.UpdateCard` instead of direct storage mutation
- [x] Slack `Adapter` and `New` no longer take `port.Store` (dormant unused store field removed)
- [x] `openclaw_test.go` verifies triage actions against stubbed `Service` without `port.Store`
