# 03: Telegram Adapter Protocol Bridge Migration

**What to build:** Migrates the Telegram bot adapter to invoke domain core for callback triage buttons, text notes, tag updates, research status checks, playbook resolution, and message ID linkages. Removes `port.Store` from the Telegram adapter and streamlines `telegram_test.go` to stub only the domain core interface.

**Blocked by:** 01: Domain Core Card Mutation Pipeline & Webhook Dispatch (Expand)

**Status:** ready-for-agent

- [ ] Telegram `Adapter` struct no longer contains `Store port.Store`
- [ ] Telegram `New` constructor signature drops `port.Store`
- [ ] Telegram callback query handlers for triage, note appending, tagging, and research trigger call `Service` methods
- [ ] Telegram `RecordChannelMessage` and `GetCardIDByChannelMessage` invoke `Service` methods instead of direct storage queries
- [ ] Telegram `Service` interface includes required mutation, research check, and message linking methods
- [ ] `telegram_test.go` updated to verify all interactions through `Service` without `port.Store`
