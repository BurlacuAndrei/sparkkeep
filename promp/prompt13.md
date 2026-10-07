# Prompt 13 — Playbook editor UI + built-in step library

**Type:** Feature (UI + content) · **Size:** L · **Depends on:** 12, 11

## Context
Prompt 12 makes playbooks data with an API. Users need a friendly way to shape their
research, and a library of high-quality ready-made steps so they don't start from a
blank prompt.

## Goal
A user can, without writing code or JSON, duplicate the Default playbook, add a
"Monetization angle" step from the library, reorder/toggle steps, save it, and run it.

## Scope
**Step library** (shipped as built-in templates, versioned, stored server-side; each is a `custom` step config with tuned instruction + output heading + tool policy):
- 💰 Monetization angle — business models, who pays, pricing comparables, effort-to-first-dollar.
- 🛠️ Tech feasibility — self-hostability, stack, license, maintenance health (commits, issues, bus factor), integration effort.
- 🥊 Competitive landscape (extended) — comparison table.
- 📚 Learning path — prerequisites, best resources, 1-week plan.
- ⚠️ Risk & red flags — hype check, conflicts of interest, security/privacy, legal.
- 👤 Personal fit — placeholder that becomes active with Prompt 15.
- Plus built-in playbook **"Claim check only"** (`ground, resolve_refs, plan, search, read, verify_claims, report`).
- `GET /api/v1/playbook-steps/library` endpoint.

**Editor UI** (new "Research Playbooks" section — Settings tab or dedicated view)
- List: built-ins (lock icon, Duplicate) + user playbooks (Edit, Duplicate, Delete).
- Editor: name, description, applicable card types (multi-select, used in Prompt 14),
  ordered step list with drag-and-drop + keyboard reorder, enable toggle, expand to
  edit custom step instruction / heading / tool policy / model role.
- "Add step" drawer: library templates (with description + preview) or "Blank custom step".
- Inline validation mirroring server rules; server errors shown per step.
- Rough cost/time indicator per playbook (steps × role, coarse "≈ N LLM calls, ≈ M fetches").

## Out of scope
Choosing a playbook when triggering research (Prompt 14).

## Acceptance criteria
- The goal scenario works end-to-end in the browser and the resulting report shows the Monetization section.
- Built-ins cannot be edited from the UI; duplicate works.
- Reordering/toggling persists and reflects in the next run's snapshot.
- Library step instructions are reviewed (PR includes them as readable text) and produce cited output in a stub-LLM test.
- Works in light/dark themes and at mobile width.

## Testing
API tests for library endpoint; frontend type-check/build; browser QA recording of the
goal scenario; prompt-template snapshot tests.
