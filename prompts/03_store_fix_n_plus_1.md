# Prompt 03 — Fix N+1 Query in `ListCards`

## Goal
Eliminate the N+1 query pattern in `internal/store/store.go` `ListCards()` where tags are fetched individually per card.

## Problem
Lines 226-232: after fetching N cards, each card's tags are loaded via a separate `cardTags()` call. For the default limit of 100 cards, this produces 101 SQL queries per API call.

## Changes Required

1. **`internal/store/store.go`**:
   - After the main card query, collect all card IDs into a slice
   - Execute a single bulk query: `SELECT ct.card_id, t.name FROM cards_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.card_id IN (?, ?, ...) ORDER BY t.name`
   - Build a `map[int64][]string` from the result
   - Assign tags from the map to each card in the result slice
   - Keep the existing `cardTags()` method for single-card lookups (`GetCard`, `GetCardBySourceURL`)

2. **Tests**: Run `go test ./internal/store/...` to verify existing store tests pass

## Acceptance Criteria
- `ListCards` makes exactly 2 SQL queries regardless of result count (cards + tags)
- Existing `store_test.go` passes
- `GetCard` still works correctly with individual tag fetch

## Severity: HIGH
