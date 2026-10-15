# 01: Configurable Card Taxonomy Settings & Triage Ingestion

**What to build:**
Enable users to configure up to 20 macro Card Types in Platform Preferences (Appearance & Preferences), with pre-seeded defaults (`tool`, `product`, `company`, `article`, `idea`, `repo`, `paper`) and an immutable `other` fallback. Dynamically inject the active Card Types into the AI triage classification prompt (`internal/analyze/analyze.go`) so unclassified inputs cleanly land in `other`.

**Blocked by:**
None (can start immediately)

**Status:** complete

- [x] Store active Card Types list in platform settings (max 20 types, default list seeded, immutable `other` fallback).
- [x] Expose GET / PATCH settings endpoints for `card_types`.
- [x] Inject active `card_types` dynamically into `internal/analyze/analyze.go` triage prompt.
- [x] Add Card Taxonomy section to `SettingsModal.tsx` in Appearance & Preferences tab with add/delete chips and active count (`X / 20`).
- [x] Backend tests in `internal/analyze` and `internal/store` pass.
- [x] Frontend tests in `SettingsModal.test.tsx` pass.
