# Prompt 15 — Inject Fetcher into Research Runner

## Goal
Replace the hard-coded `capture.Fetch()` call in `research.fetchAndClip()` with an injected `capture.Fetcher` for testability.

## Problem
`fetchAndClip()` in `research.go` (line 185) calls the package-level `capture.Fetch()` directly, bypassing the `Fetcher` interface. This makes it impossible to stub fetch behavior in research tests — every test must have a real HTTP server.

## Changes Required

1. **`internal/research/research.go`**:
   - Add `Fetcher capture.Fetcher` field to `Runner` struct
   - In `fetchAndClip()`, replace `capture.Fetch(capture.Share{...})` with `r.Fetcher.Fetch(capture.Share{...})`
   - In `New()`, initialize `Fetcher: capture.Capture{}` as the default

2. **`internal/core/core.go`** in `New()`:
   - No changes needed if `research.New()` handles the default

3. **Tests**: Optionally add a research test that stubs the fetcher to verify clip behavior without HTTP.

## Acceptance Criteria
- `fetchAndClip` uses the injected fetcher
- Default behavior (using `capture.Capture{}`) is unchanged
- All existing tests pass

## Severity: MEDIUM
