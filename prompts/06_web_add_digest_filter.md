# Prompt 06 — Add `Since` Filter to Avoid Full Table Scan in Digest

## Goal
Add a `Since time.Time` field to `port.CardFilter` and use it in `store.ListCards` so the weekly digest endpoint doesn't load all cards.

## Problem
`weeklyDigest()` in `web.go` (line 277) calls `ListCards(CardFilter{})` which loads the **entire** cards table, then filters in Go. This is O(N) memory and will degrade as the dataset grows.

## Changes Required

1. **`internal/port/model.go`**:
   - Add `Since time.Time` to `CardFilter` struct (zero value means no filter)

2. **`internal/store/store.go`** (`ListCards`):
   - If `f.Since` is not zero, add `WHERE created_at >= ?` clause with `f.Since.Format(time.RFC3339)`

3. **`internal/web/web.go`** (`weeklyDigest`):
   - Set `f.Since = time.Now().UTC().AddDate(0, 0, -7)` in the filter before calling `ListCards`
   - Remove the Go-side date filtering loop (or keep as safety net)

## Acceptance Criteria
- Digest endpoint only queries cards from the last 7 days at the SQL level
- Existing card listing API behavior is unchanged (Since defaults to zero = no filter)
- All tests pass

## Severity: MEDIUM
