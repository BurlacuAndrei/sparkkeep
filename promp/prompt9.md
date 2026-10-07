# Prompt 9 — Research: question planning + targeted multi-query search

**Type:** Feature · **Size:** M · **Depends on:** 8

## Context
After Prompt 8 the runner searches with a single query. One angle misses most of
what a user actually wants to know (maintenance, pricing, alternatives,
independent benchmarks…). The Triage Brief already contains `open_questions` and
`claims`.

## Goal
Research decomposes the card into 3–5 focused sub-questions and searches each one,
preferring primary/official sources — still bounded and predictable.

## Scope
- New step `plan` (before `search`), `research_plan` model, strict JSON:
  `{ "questions": [{ "id": "Q1", "question": "...", "query": "...", "prefer_domains": ["github.com", ...] }] }`.
  Inputs: TL;DR, claims, open questions, references, already-fetched source titles.
  Cap: max 5 questions (configurable).
- `search` step: one SearXNG request per question; results tagged with the question
  id; merge + dedupe by canonical URL; rank: preferred/primary domains first, then
  SearXNG order; skip URLs already in the registry.
- `read` step: fetch budget split fairly across questions (round-robin) so one
  question cannot starve the others; overall max fetches cap (default 12).
- Registry entries record which question(s) they serve.
- Synthesis prompt groups findings per question ("Q1: … [S3][S5]").
- Persist the plan in the run (`plan` JSON) and all queries (replace single `query`
  with first query for backward compat + full list in `plan`).
- Fallback: if planning output is invalid → single-query behavior from Prompt 8 (log a Note, do not fail).

## Out of scope
Claim verification and verdict (Prompt 10).

## Acceptance criteria
- With a stub plan of 3 questions, exactly 3 search requests are made, results deduped, and fetched sources are distributed across questions.
- Invalid plan JSON degrades to single-query and the run succeeds.
- Total fetches never exceed the cap; total wall-clock cap still enforced.
- Report contains a section per question with citations.

## Testing
Unit tests for ranking/dedupe and fair budget split; pipeline test with stub planner
(valid + invalid); timeout test.
