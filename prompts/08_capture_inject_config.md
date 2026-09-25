# Prompt 08 — Inject Config into Capture Package

## Goal
Remove direct `os.Getenv` calls from `internal/capture/capture.go` and pass headless/chrome configuration through the `Fetcher` interface or struct fields.

## Problem
`headlessEnabled()` (line 216) and `HeadlessExtract()` (line 186) read `SPARKKEEP_HEADLESS_ENABLED` and `SPARKKEEP_CHROME_BIN` from `os.Getenv` at call time. This:
- Bypasses the centralized `config.Config` struct
- Makes the package impossible to test for headless flag variations without polluting the process env
- Creates a hidden dependency on environment state

## Changes Required

1. **`internal/capture/capture.go`**:
   - Add fields to the `Capture` struct: `HeadlessEnabled bool` and `ChromeBin string`
   - Replace `headlessEnabled()` calls with `c.HeadlessEnabled` (where `c` is the `Capture` receiver)
   - Replace `os.Getenv("SPARKKEEP_CHROME_BIN")` with `c.ChromeBin`
   - Convert package-level functions `Fetch`, `MediaMeta` to methods on `Capture` (or pass the config)
   - Update `Capture` struct in `fetcher.go` to carry these fields

2. **`internal/core/core.go`** (`New`):
   - Initialize `Capture{HeadlessEnabled: cfg.HeadlessEnabled, ChromeBin: cfg.ChromeBin}` (add `ChromeBin` to config if not present)

3. **`internal/config/config.go`**:
   - Add `ChromeBin string` field, read from `SPARKKEEP_CHROME_BIN` env var

## Acceptance Criteria
- No `os.Getenv` calls remain in `capture.go`
- All config flows through `config.Config` → `Capture` struct
- All existing tests pass

## Severity: MEDIUM
