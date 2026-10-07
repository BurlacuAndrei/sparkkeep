# Prompt 8 — Research engine v2 foundation: step runner, source registry, run log

**Type:** Refactor + Feature · **Size:** L · **Depends on:** 2, 4, 5

## Context
`internal/research/research.go` is a fixed function: 1 LLM query from title+summary
→ SearXNG → top 6 → concatenate into **one 8k-char budget with no source markers**
→ 600-word synthesis. It never reads the original post or its references. The
`research.query` column is never filled (`core.Research` passes `""`). There is no
per-step visibility.

## Goal
Replace the monolith with a **step-based runner** that (a) grounds research in the
stored capture, (b) fetches the card's references directly before any web search,
(c) attributes every piece of text to a numbered source, and (d) records per-step
progress. Output quality must already beat today's report with only these steps.

## Scope
- **Step abstraction**: `Step{ID, Name, Run(ctx, *RunState) error}`; `RunState` holds
  card, capture, references, `Sources` registry, step outputs, budgets.
- **Source registry**: each fetched document gets `S1..Sn` with url, title, fetched_at,
  origin (`capture|reference|search`), clipped text. **Per-source** char budget
  (default 6k) + total budget (default 40k); rune-safe clipping (no byte/rune mixing).
- **Steps in this ticket** (fixed order, hardcoded pipeline for now):
  1. `ground` — load the capture; restate claims/references (no LLM needed if Triage Brief present).
  2. `resolve_refs` — fetch every URL reference directly (GitHub: README via raw URL / repo page); skip failures with a Note.
  3. `search` — single query (current behavior, but built from TL;DR + claims + references), dedupe against already-fetched URLs.
  4. `read` — fetch top N search results into the registry.
  5. `synthesize` — `research_synthesis` model; prompt receives sources tagged `[S#]` and must cite them; sections: What the source says / Findings / Sources / Next steps.
- **Persistence**: extend `research` row: `query` (filled), `steps` JSON
  (`[{id,status,started_at,finished_at,note}]`), `sources` JSON, `tokens` (if
  provider returns usage). Update the row after each step so the UI can poll.
- Planning/reading calls via `research_plan`, synthesis via `research_synthesis`.
- Keep hard caps: total timeout, max steps, max fetches. Keep "no recursion".
- A failed step marks the run `failed` with the step id in `error`, except
  `resolve_refs`/`read` partial failures which are Notes.

## Out of scope
Question planning/multi-query (Prompt 9), claim verification/verdict (Prompt 10), UI (Prompt 11), user-editable playbooks (Prompt 12).

## Acceptance criteria
- For a card with 2 URL references, both are fetched **before** any search request (assert order via stubs).
- Synthesis prompt contains `[S1]`… markers and per-source text never exceeds the per-source budget; multi-byte text never panics.
- `research.query`, `steps`, `sources` are persisted; `steps` reflect progress mid-run (observable via store after each step).
- Report cites sources with `[S#]` matching the registry.
- If SearXNG returns 0 results but references produced text, the run still succeeds (today it fails).

## Testing
Full-pipeline tests with stub fetcher, stub SearXNG, and stub LLM per role; unit tests
for registry budgets and clipping; failure-mode tests (ref fetch fails, search fails,
synthesis fails).
