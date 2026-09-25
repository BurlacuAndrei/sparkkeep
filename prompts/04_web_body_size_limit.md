# Prompt 04 — Add Request Body Size Limit

## Goal
Protect the web API from OOM via oversized request bodies by adding `http.MaxBytesReader` to `decodeJSON()`.

## Problem
`decodeJSON()` in `internal/web/web.go` (lines 411-413) reads the full request body with no size limit. A malicious or accidental large POST can exhaust memory.

## Changes Required

1. **`internal/web/web.go`**:
   - Add a constant: `const maxBodyBytes = 1 << 20` (1 MB — generous for JSON card payloads)
   - Modify `decodeJSON` to wrap `r.Body` with `http.MaxBytesReader(w, r.Body, maxBodyBytes)` before decoding
   - Note: `decodeJSON` doesn't currently receive `w http.ResponseWriter`, so either:
     - (a) Add `w` as a parameter to `decodeJSON`, or
     - (b) Wrap `r.Body` before calling `decodeJSON` in each handler that uses it

2. **Tests**: Verify existing `web_test.go` passes and optionally add a test that sends an oversized body and gets a 413 or 400.

## Acceptance Criteria
- All JSON-accepting endpoints reject bodies larger than the configured limit
- Normal payloads are unaffected
- All existing tests pass

## Severity: HIGH
