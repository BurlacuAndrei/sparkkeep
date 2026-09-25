# Prompt 01 — Add `context.Context` to `Analyze()`

## Goal
Make `Analyze()` in `internal/analyze/analyze.go` accept a `context.Context` parameter so callers can cancel long-running LLM calls.

## Problem
`Analyze()` (line 82) creates an `http.NewRequest` without context, making it un-cancellable. Meanwhile `Ask()` (line 138) correctly accepts `ctx`. This inconsistency means a slow Analyze call during Capture blocks indefinitely.

## Changes Required

1. **`internal/analyze/analyze.go`**:
   - Change signature from `func (c *Client) Analyze(payload capture.Fetched)` to `func (c *Client) Analyze(ctx context.Context, payload capture.Fetched)`
   - Replace `http.NewRequest(...)` with `http.NewRequestWithContext(ctx, ...)`

2. **`internal/core/core.go`**:
   - Update all call sites: `s.Analyze.Analyze(fetched)` → `s.Analyze.Analyze(ctx, fetched)` (lines 68, 168)

3. **`internal/core/core_test.go`**:
   - Verify existing tests still pass (they already use `context.Background()`)

## Acceptance Criteria
- `Analyze()` respects context cancellation
- `go test ./internal/analyze/... ./internal/core/...` passes
- No functional change when context is `context.Background()`

## Severity: HIGH
