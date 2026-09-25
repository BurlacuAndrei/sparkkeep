# Prompt 10 — Clean Up Failed Cards After Retry

## Goal
When `Retry()` succeeds in `internal/core/core.go`, dismiss or delete the original "Analysis failed" card to prevent zombie accumulation.

## Problem
`Retry()` (lines 158-208) creates a **new** card from re-analysis but leaves the original "Analysis failed" card in `inbox` status. Over time, these zombie cards accumulate and clutter the inbox.

## Changes Required

1. **`internal/core/core.go`** in `Retry()`:
   - After successfully creating the new card (line 200), update the original card's status to `dismissed`:
     ```go
     dismissed := port.StatusDismissed
     if _, err := s.Store.UpdateCard(ctx, cardID, port.CardPatch{Status: &dismissed}); err != nil {
         s.Logf("core: dismiss original failed card %d: %v", cardID, err)
     }
     ```
   - This preserves the original card for audit but removes it from the active inbox

2. **Tests**: Add a test case in `core_test.go` that verifies after `Retry()`, the original card's status is `dismissed`.

## Acceptance Criteria
- After successful retry, original "Analysis failed" card has status `dismissed`
- The new card is created with status `inbox` as before
- All existing tests pass

## Severity: MEDIUM
