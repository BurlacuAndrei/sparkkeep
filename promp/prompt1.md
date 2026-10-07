# Prompt 1 — Horizon validation & normalization fix

**Type:** Bug · **Size:** S · **Depends on:** —

## Context
The analysis prompt in `internal/analyze/analyze.go` (`PromptFor`) tells the model
horizon may be `short-term | medium-term | long-term | lifetime`, and
`port.ValidHorizon` accepts all four. But `validateCards` only accepts
`short-term` and `lifetime`, so any response using a legal horizon fails the
whole analysis and produces an "Analysis failed" card.

Models also commonly return near-misses (`"Short term"`, `"short_term"`,
`"medium"`, `"long term"`, `"bucket list"`), which today are hard failures.

## Goal
A valid analysis is never discarded because of the horizon field.

## Scope
- `validateCards` uses `port.ValidHorizon`.
- Add a `normalizeHorizon(string) string` applied to every card before
  validation: case/whitespace/underscore-insensitive, maps common synonyms
  (`medium`→`medium-term`, `long`→`long-term`, `now|soon|immediate`→`short-term`,
  `bucket|bucket-list|someday`→`lifetime`).
- Unknown / empty horizon → default `short-term` (do **not** fail the analysis);
  log once at debug level.
- Keep failing on genuinely invalid payloads (no cards, malformed JSON).

## Out of scope
Any prompt redesign (Prompt 6).

## Acceptance criteria
- A response containing `medium-term` and `long-term` cards is accepted and stored with those horizons.
- `"Short Term"`, `"short_term"`, `"bucket list"` normalize correctly.
- Missing horizon yields `short-term`, not `ErrInvalidResponse`.
- Existing analyze tests still pass.

## Testing
Table-driven tests in `internal/analyze/analyze_test.go` for `normalizeHorizon`
and for `ExtractJSON` with each of the four horizons + synonyms + empty.
