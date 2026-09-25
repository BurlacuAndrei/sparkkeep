# Prompt 14 — Use Config `PublicURL` in Telegram Adapter

## Goal
Replace `os.Getenv("SPARKKEEP_PUBLIC_URL")` in `sendResearch()` with the already-parsed `PublicURL` from config.

## Problem
`sendResearch()` in `telegram.go` (lines 242-244) reads `SPARKKEEP_PUBLIC_URL` from `os.Getenv` instead of using the config. The URL is already in `config.Config.PublicURL` and is passed to the web handler. This creates a config leak — the adapter bypasses the centralized config.

## Changes Required

1. **`internal/channel/telegram/telegram.go`**:
   - Add a `PublicURL string` field to `Adapter`
   - In `sendResearch()`, replace `os.Getenv("SPARKKEEP_PUBLIC_URL")` with `a.PublicURL`, falling back to `"http://localhost:8080"` if empty

2. **`cmd/sparkkeep/main.go`**:
   - Set `tg.PublicURL = cfg.PublicURL` when wiring the adapter

## Acceptance Criteria
- No `os.Getenv` calls remain in `telegram.go`
- Research notification links use the configured PublicURL
- All tests pass

## Severity: LOW
