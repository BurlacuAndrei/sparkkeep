# Prompt 11 — Research report view, live progress, Telegram notification

**Type:** Feature (UI) · **Size:** M–L · **Depends on:** 10

## Context
Findings are shown as raw markdown in a `<pre>` inside a collapsed `<details>` in
`CardModal.tsx`; the Telegram link opens a basic HTML template
(`researchReportHTML` in `internal/web/web.go`). Users get no feedback while a
multi-minute run is in progress.

## Goal
Research feels like a premium product: users can watch it work, read a beautiful
cited report, and act on it in one click.

## Scope
**API**
- `GET /api/v1/research/{id}` (JSON) returns steps, sources, plan, result, tokens.
- `GET /api/v1/cards/{id}/research` returns latest run + history (list of past runs, newest first).

**Live progress**
- While a run is active, the card (modal + triage + kanban) shows a progress strip:
  step list with status icons (queued/running/done/failed/skipped) and elapsed time.
  Poll every 2–3s while active (stop when terminal). SSE optional — justify if used.

**Report view** (new full-width view/route or large panel, not a `<pre>`)
- Header: verdict badge (Pursue/Watch/Skip), confidence, for-whom, run date, models used.
- Sections: What the source says · Per-question findings · Claim check table (✅/⚠️/❓ + sources) · Landscape table · Risks · Next actions (checkbox list → "Add to card actions") · Sources list `S#` with title/domain/origin, citations `[S#]` clickable/scroll-linked.
- Suggested horizon/tags: one-click "Apply".
- Markdown rendering safe (sanitize; no raw HTML injection).
- Re-run button + history switcher.
- Server-rendered HTML page (Telegram link) updated to the same structure (read-only).

**Telegram**: research_done message = verdict line + confidence + top 3 next actions + link; research_failed shows failed step name.

**Cost visibility**: show tokens per role for the run if available.

## Out of scope
Playbook selection UI (Prompts 13–14).

## Acceptance criteria
- Starting research from triage shows live step progress without page refresh; polling stops at terminal state.
- Report renders all sections for a full result and degrades gracefully for partial results / legacy markdown-only runs.
- Clicking `[S3]` focuses source S3.
- "Apply suggested horizon" updates the card.
- Telegram messages match the new format and stay under limits.

## Testing
Web handler tests for new JSON shapes; Telegram formatter tests; frontend type-check
+ build; manual QA script with screenshots (in progress, done, failed, legacy).
