# Prompt 3 — Retry re-analyzes from the stored capture

**Type:** Bug · **Size:** S–M · **Depends on:** 2

## Context
`core.Retry` builds a `capture.Fetched` from `card.Title` (literally
`"Analysis failed"` for failed cards) + `card.SourceNote`. It never re-fetches and
never uses the original content, so retry results are near-fabrications. It also
only keeps the first idea of a multi-idea result.

## Goal
Retry produces the same quality of result as a successful first capture.

## Scope
- Retry loads the card's capture (Prompt 2).
  - If the capture has usable content (text/transcript/digest/description non-empty) → analyze it.
  - Else, if it has a `source_url` → re-run the fetch pipeline (`resolve`) and update the stored capture.
  - Else → return a clear error ("nothing to re-analyze"), keep the card unchanged.
- On success: create **all** cards from the result linked to the same capture;
  mark the failed card `dismissed` (current behavior) — or reuse its row for the
  first card if simpler, as long as no orphan/duplicate remains.
- Notifications: one "done" per created card.
- Legacy cards without a capture: fall back to re-fetching `source_url`.

## Out of scope
Changing the analysis prompt/schema.

## Acceptance criteria
- Retrying a failed link card whose LLM now succeeds yields cards built from the fetched page text (assert the LLM request body contains the page text, not "Analysis failed").
- Multi-idea retry yields N cards.
- Retry on a capture with no content and no URL returns an error and leaves state unchanged.
- `POST /api/v1/cards/{id}/retry` and the Telegram retry button both use the new path.

## Testing
`core` tests with stub fetcher + stub LLM covering: content present, content missing
+ URL refetch, nothing available, legacy card without capture.
