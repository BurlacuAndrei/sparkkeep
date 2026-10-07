# Prompt 4 — Persist card references (links + entities)

**Type:** Feature / Foundation · **Size:** M · **Depends on:** 2

## Context
The analyzer already returns `links[]` per idea (`analyze.Idea.Links`), but
`port.Card` has no field for it, so references are dropped. Named entities (tools,
repos, people, papers, companies) are never extracted. These references are
exactly what research must target first ("research the references").

## Goal
Every card carries a structured list of references that later stages can fetch
directly, and the user can see/edit them.

## Scope
- Reference model: `{ kind: "url"|"repo"|"tool"|"product"|"person"|"org"|"paper"|"other", label, url? }`.
- Storage: `card_references` table (`card_id, kind, label, url, position`) or a JSON
  column — dev's choice, justify in PR. Must be queryable per card.
- Deterministic extraction (no LLM): all URLs found in capture text/caption/description
  (reuse `urlRe`), canonicalized (strip tracking params `utm_*`, `fbclid`, etc.,
  dedupe), GitHub URLs tagged `repo`.
- Analyzer: extend the card JSON with `references: [{kind,label,url}]`; merge LLM
  references with deterministic ones (dedupe by canonical URL / case-insensitive label).
  Keep accepting legacy `links[]` → map to `kind:url`.
- API: references included in card JSON; `PATCH /cards/{id}` accepts a full
  replacement list.
- UI (`CardModal.tsx`): "References" section — list with kind chip, clickable URL,
  add/remove.

## Out of scope
Research consuming references (Prompt 8). Triage visual redesign (Prompt 7).

## Acceptance criteria
- A captured post containing 3 URLs (one GitHub) and mentioning a named tool yields a card with ≥3 URL refs (repo tagged) + the tool entity.
- Tracking parameters are stripped; duplicates collapse.
- References survive edit/save round-trip in the modal.
- Legacy `links[]` responses still work.

## Testing
Unit tests for URL canonicalization + merge/dedupe; analyze parse tests for new and
legacy shapes; store round-trip; web PATCH test.
