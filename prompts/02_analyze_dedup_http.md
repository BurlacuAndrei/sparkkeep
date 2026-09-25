# Prompt 02 — Deduplicate HTTP Call Logic in `analyze`

## Goal
Extract the shared HTTP request/response logic from `Analyze()` and `Ask()` into a single private `doCompletion()` helper.

## Problem
`Analyze()` (lines 82-133) and `Ask()` (lines 138-188) in `internal/analyze/analyze.go` contain near-identical code: JSON marshal, HTTP request build, auth header, response read, status check, envelope parse. The only differences are: system prompt, presence of `response_format`, and post-processing.

## Changes Required

1. **`internal/analyze/analyze.go`**:
   - Create a private method: `func (c *Client) doCompletion(ctx context.Context, systemPrompt, userPrompt string, opts map[string]any) (string, error)`
   - This method handles: request build, auth, HTTP call, response envelope parse, and returns the raw content string
   - Refactor `Analyze()` to call `doCompletion()` with `response_format` in opts, then run `ExtractJSON`
   - Refactor `Ask()` to call `doCompletion()` without `response_format`

2. **Tests**: Run `go test ./internal/analyze/... ./internal/core/...` to verify no regressions

## Acceptance Criteria
- Zero duplicated HTTP/envelope logic between `Analyze()` and `Ask()`
- Both methods' behavior is identical to before
- All existing tests pass

## Severity: MEDIUM
