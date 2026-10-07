# Prompt 10 — Research: claim check, landscape, verdict + card write-back

**Type:** Feature · **Size:** M–L · **Depends on:** 9, 6

## Context
Research currently ends in free-form markdown. The value the user pays attention to
is: *Are the claims true? What are the alternatives? Should I bother? What exactly do
I do next?* Results also don't flow back into the card (only the "Append findings as
actions" bullet scraper in `CardModal.tsx`).

## Goal
Every research run ends with a **structured, cited outcome** that updates the card,
so the board reflects what research learned.

## Scope
- Steps after `read`:
  - `verify_claims` — for each Triage claim: `supported | disputed | unverified`, 1-line rationale, source ids. Claims without any supporting source must be `unverified` (enforce in code: verdicts citing no valid `S#` are downgraded).
  - `landscape` — up to 5 alternatives/prior art: `{name, url?, one_liner, how_it_differs, sources[]}`.
  - `verdict` (`research_synthesis` model) — `{ recommendation: "pursue"|"watch"|"skip", for_whom, risks[], confidence: "high"|"medium"|"low", next_actions[3..5], suggested_horizon?, suggested_tags[] }`.
  - `report` — renders the final markdown from all structured outputs (deterministic template where possible; LLM only for narrative sections).
- Persist structured result on the run: `result` JSON (`claims`, `landscape`, `verdict`).
- **Card write-back** on success:
  - `proposed_actions` ← `verdict.next_actions` (replace only if the user hasn't edited actions; track `actions_source: "triage"|"research"|"user"`).
  - store `research_verdict` + `research_confidence` on the card (or derive from latest run in API).
  - `suggested_horizon` / `suggested_tags` are **suggestions** (exposed in API), not auto-applied.
- Remove the bullet-scraper path's necessity (keep button, but prefer structured actions).

## Out of scope
Report UI (Prompt 11). Making steps configurable (Prompt 12).

## Acceptance criteria
- A run with 3 claims produces 3 claim verdicts; a verdict citing a non-existent source is downgraded to `unverified`.
- Card shows `proposed_actions` from research afterward; user-edited actions are not overwritten.
- Card API exposes latest verdict/confidence and suggestions.
- Invalid JSON from a step → one repair retry, then the step is recorded as failed-with-note and the report is still produced from what exists (run status `done` with warnings), unless `verdict` fails (then `failed`).

## Testing
Structured-output parse tests (valid/invalid/repair); citation validation tests;
write-back tests including the "user edited actions" guard; pipeline happy path.
