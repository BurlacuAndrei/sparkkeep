# Prompt 19 — Expand Test Coverage for Web and Store

## Goal
Add missing test cases for `web` and `store` packages to match the level of coverage in `core_test.go`.

## Problem
- `core_test.go`: 641 lines, comprehensive orchestration tests ✅
- `store_test.go`: exists but needs coverage for edge cases (empty tags, duplicate source URLs, concurrent research guards)
- `web_test.go`: exists but needs coverage for validation failures, digest endpoint, and research trigger
- `capture_test.go`: exists but thin on headless fallback paths
- `telegram_test.go`: exists but needs reaction handling and offset persistence tests

## Changes Required

### `store_test.go` — Add:
1. `TestCreateCardWithEmptyTags` — verify empty tag slice works
2. `TestGetCardBySourceURL_NotFound` — verify `ErrNotFound` for missing URL
3. `TestListCardsWithQueryFilter` — verify case-insensitive LIKE search
4. `TestUpdateCard_NotFound` — verify `ErrNotFound` for non-existent card
5. `TestCreateResearchDedup` — verify `ErrResearchActive` when queued exists

### `web_test.go` — Add:
1. `TestCreateCard_BadRequest` — invalid JSON returns 400
2. `TestPatchCard_InvalidStatus` — (after prompt 07) invalid status returns 400
3. `TestWeeklyDigest_Empty` — verify empty digest response shape
4. `TestTriggerResearch_DuplicateRejects` — verify 409 for active research
5. `TestGetResearch_NotFound` — verify 404

## Acceptance Criteria
- `go test ./internal/store/...` and `go test ./internal/web/...` pass
- Each new test covers a distinct edge case
- Test patterns match the project's existing stub/table-driven style

## Severity: MEDIUM
