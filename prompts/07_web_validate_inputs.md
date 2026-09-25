# Prompt 07 — Add Input Validation to Web API

## Goal
Validate incoming API payloads to prevent invalid data from reaching the store.

## Problem
Web handlers accept any string for `status` and `horizon` fields. A PATCH with `{"status": "banana"}` succeeds silently and creates inconsistent data. There's no validation of enum values anywhere in the web layer.

## Changes Required

1. **`internal/port/model.go`** (or a new `internal/port/validate.go`):
   - Add helper functions:
     ```go
     func ValidHorizon(h string) bool { return h == HorizonShortTerm || h == HorizonLifetime }
     func ValidStatus(s string) bool { return s == StatusInbox || s == StatusDoing || s == StatusDone || s == StatusShelved || s == StatusDismissed }
     ```

2. **`internal/web/web.go`**:
   - In `createCard`: validate `b.Horizon` and `b.Status` before creating. Return 400 if invalid.
   - In `patchCard`: validate `*b.Status` and `*b.Horizon` (if non-nil) before updating. Return 400 if invalid.
   - In `createCard`: require `b.Title` to be non-empty. Return 400 if missing.

3. **Tests**: Add a test case in `web_test.go` for invalid horizon/status values getting 400.

## Acceptance Criteria
- Invalid horizon/status values are rejected with 400 and clear error message
- Valid values pass through unchanged
- All existing tests pass

## Severity: HIGH
