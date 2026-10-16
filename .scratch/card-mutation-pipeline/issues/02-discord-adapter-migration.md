# 02: Discord Adapter Protocol Bridge Migration

**What to build:** Migrates the Discord adapter to execute card triage button actions (`horizon_short`, `status_done`, etc.) strictly through the domain core interface. Removes `port.Store` from the Discord adapter constructor and struct. Updates `discord_test.go` to verify button click translation without storage test doubles.

**Blocked by:** 01: Domain Core Card Mutation Pipeline & Webhook Dispatch (Expand)

**Status:** resolved

- [x] Discord `Adapter` struct no longer contains `Store port.Store`
- [x] Discord `New` constructor signature drops `port.Store`
- [x] Discord interaction component handlers invoke `Service.UpdateCard` for horizon and status updates
- [x] Discord `Service` interface includes `UpdateCard(ctx context.Context, id int64, patch port.CardPatch) (port.Card, error)`
- [x] `discord_test.go` verifies button triage interactions using stubbed `Service` without `port.Store`
