# Prompt 12 — Playbook engine: data model, seeded default, API

**Type:** Feature / Architecture · **Size:** L · **Depends on:** 10

## Context
After Prompts 8–10 the research pipeline is a hardcoded sequence of steps. The
product vision is that users can **modify the research pipeline** (e.g. add "How can I
make money from this?"). That requires the pipeline to be **data**, not code.

## Goal
Research runs execute a stored **Playbook**. The current pipeline ships as the
built-in "Default" playbook, and playbooks can be created/edited via API.

## Scope
- **Step kinds** (code, fixed set): `ground`, `resolve_refs`, `plan`, `search`, `read`,
  `verify_claims`, `landscape`, `verdict`, `report`, and new generic **`custom`**.
- **`custom` step**: user-written `instruction` + `output_heading`; inputs selectable
  (`capture`, `references`, `sources`, `previous_steps`); tool policy
  (`none` = reason over existing sources only, `search` = may add up to K extra queries
  to the registry). Output is a cited markdown section `[S#]`; uses `research_plan`
  or `research_synthesis` per step setting.
- **Schema**: `playbooks (id, name, description, is_builtin, card_types JSON, version, created_at, updated_at)`,
  `playbook_steps (playbook_id, position, kind, name, enabled, config JSON)`.
  `research` row gets `playbook_id` + `playbook_snapshot` JSON (exact steps used — runs must be reproducible after edits).
- Seed built-in **Default** playbook = Prompt 10 pipeline. Built-ins are read-only;
  "duplicate" creates an editable copy.
- **Validation** rules (server-side): required kinds order (`read` needs `search` or
  `resolve_refs` before it; `verdict`/`report` last), max 12 steps, custom
  instruction length ≤ 2,000 chars, per-step budgets within global caps.
- Runner executes `playbook_snapshot` generically; report includes custom sections
  in playbook order.
- **API**: `GET/POST /api/v1/playbooks`, `GET/PUT/DELETE /api/v1/playbooks/{id}`,
  `POST /api/v1/playbooks/{id}/duplicate`; `POST /api/v1/research` accepts optional
  `playbook_id` (default: Default playbook).

## Out of scope
Editor UI and step library (Prompt 13), picker/auto-select (Prompt 14), Pro gating (Prompt 16).

## Acceptance criteria
- Research without `playbook_id` behaves identically to Prompt 10 (golden test on step order/prompts).
- A playbook with an added `custom` step "Monetization angle" produces a report containing that section with citations.
- Editing a playbook after a run doesn't change that run's `playbook_snapshot`.
- Invalid playbooks are rejected with a clear 400 message per rule.
- Built-in playbook cannot be modified or deleted (403).

## Testing
Store CRUD + seed tests; validation table tests; runner tests for custom step (`none`
and `search` policies); API tests.
