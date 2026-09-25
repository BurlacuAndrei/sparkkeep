# Prompt 09 — Fix Rune-Safe Text Truncation

## Goal
Fix `stripTagsAndCondense()` in `internal/capture/capture.go` to truncate at rune boundaries instead of byte boundaries.

## Problem
Line 337-338: `s[:condenseMax]` truncates at byte position, which can split a multi-byte UTF-8 character (e.g., CJK, emoji). This produces invalid UTF-8 that may confuse the LLM or produce garbled card content.

## Changes Required

1. **`internal/capture/capture.go`** in `stripTagsAndCondense`:
   - Replace `s[:condenseMax]` with a rune-aware truncation. Options:
     - (a) Convert to `[]rune`, truncate, convert back: `string([]rune(s)[:condenseMax])`
     - (b) Use `utf8.Valid` + walk back from the byte position to find a valid rune boundary
   - Note: `condenseMax` should semantically mean "max runes" not "max bytes" after this change; update the comment

2. **Tests**: Add a test in `capture_test.go` with a string containing multi-byte characters at the truncation boundary.

## Acceptance Criteria
- Truncated text is always valid UTF-8
- No multi-byte character is ever split
- All existing tests pass

## Severity: LOW
