# Prompt 6 — Triage Brief: backend schema, prompt, storage

**Type:** Feature · **Size:** M–L · **Depends on:** 2, 4, 5

## Context
Stage 1 today outputs executive summary, value proposition and **proposed actions**.
Actions answer "how do I do this?" before the user has decided whether it's worth
their time. Sibling cards from one post also share the post-level briefing
(`core.cardFromIdea` fallback), so they look identical in triage.

## Goal
Stage 1 produces a **Triage Brief** per card that lets the user decide in <10s
whether to research — using the cheap `triage` model role.

## Scope
- New card fields (migration, `port.Card`, API, store):
  - `type`: `tool|repo|article|idea|claim|tutorial|product|other`
  - `tldr` (1 sentence)
  - `why_care` (1–2 sentences)
  - `claims[]` (≤3, what the source *asserts*)
  - `open_questions[]` (≤3, what research would answer)
  - `signals`: `{ extraction: "full"|"partial"|"thin", promo: bool, source_quality: "primary"|"secondary"|"social"|"unknown", published_at?: string }`
  - `worthiness`: `{ level: "high"|"medium"|"low", reason }`
  - (`references` from Prompt 4, horizon, tags unchanged)
- Rewrite `PromptFor` for the new schema; **per-card** fields required (no
  post-level fallback for tldr/why_care). Keep the Notes honesty rules; `signals.extraction`
  must reflect Notes (login wall ⇒ `thin`/`partial`).
- Stage 1 no longer generates `proposed_actions`. Keep the column/field for
  backward compatibility and for research write-back (Prompt 10). Map legacy fields:
  `executive_summary`←`tldr`, `value_proposition`←`why_care` for old clients.
- Parser tolerant of missing optional fields; strict on `title`, `tldr`, `horizon` (after Prompt 1 normalization).
- Analysis runs via `router.For("triage")`.

## Out of scope
UI and Telegram rendering (Prompt 7).

## Acceptance criteria
- A stubbed model response in the new schema produces cards with all fields persisted and returned by the API.
- Two cards from one post have distinct `tldr`/`why_care`.
- A capture with a "login wall" Note yields `signals.extraction != "full"`.
- Old cards (pre-migration) still load; legacy fields are populated for them.
- Analysis requests go to the triage profile.

## Testing
Prompt snapshot test (golden file) for `PromptFor`; parse tests for full/partial/legacy
responses; core test for per-card distinctness and routing; store migration test.
