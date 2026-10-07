# Analysis & Research Pipeline — Ticket Index

Execute in numeric order. Each ticket is a self-contained, testable slice and
lists its dependencies. Source of truth for the product direction:
`analysis_pipeline_product_review.md` (PO review, 2026-10-07).

| # | Ticket | Phase | Depends on |
|---|---|---|---|
| 1 | [Horizon validation & normalization fix](prompt1.md) | Now — defects | — |
| 2 | [Persist raw captures; fix multi-card split collapse](prompt2.md) | Now — defects | 1 |
| 3 | [Retry re-analyzes from the stored capture](prompt3.md) | Now — defects | 2 |
| 4 | [Persist card references (links + entities)](prompt4.md) | Now — foundation | 2 |
| 5 | [Model routing: role → LLM profile](prompt5.md) | Next | — |
| 6 | [Triage Brief: backend schema, prompt, storage](prompt6.md) | Next | 2, 4, 5 |
| 7 | [Triage Brief: dashboard + Telegram presentation](prompt7.md) | Next | 6 |
| 8 | [Research engine v2 foundation: step runner, source registry, run log](prompt8.md) | Next | 2, 4, 5 |
| 9 | [Research: question planning + targeted multi-query search](prompt9.md) | Next | 8 |
| 10 | [Research: claim check, landscape, verdict + card write-back](prompt10.md) | Next | 9, 6 |
| 11 | [Research report view, live progress, Telegram notification](prompt11.md) | Next | 10 |
| 12 | [Playbook engine: data model, seeded default, API](prompt12.md) | Later | 10 |
| 13 | [Playbook editor UI + built-in step library](prompt13.md) | Later | 12, 11 |
| 14 | [Playbook picker at research trigger (web + Telegram) + auto-select by type](prompt14.md) | Later | 13 |
| 15 | [User profile (personal fit) injected into both stages](prompt15.md) | Later | 6, 12 |
| 16 | [Pro gating, report feedback & pipeline metrics, docs alignment](prompt16.md) | Later | 14 |
| 17 | [Batch / scheduled overnight research (Pro)](prompt17.md) | Later | 16 |

## Conventions for every ticket

- Backend: Go stdlib + `modernc.org/sqlite`; no new dependencies without justification.
- Migrations: forward-only SQL in `internal/store/migrations/`, use the **next free number** at implementation time.
- Tests: stdlib `testing`, LLM / SearXNG / HTTP stubbed with `httptest` — no real network in CI.
- Frontend: React 19 + TS + vanilla CSS in `frontend/`; rebuild embedded assets (`internal/web/dist`) per `CONTRIBUTING.md`.
- Keep the existing honesty rule: extraction **Notes** are warnings, never content — in every prompt.
- `make test` and the frontend type-check/build must be green before a ticket is closed.
