# Prompt 7 — Triage Brief: dashboard + Telegram presentation

**Type:** Feature (UI) · **Size:** M · **Depends on:** 6

## Context
`TriageView.tsx`, `CardItem.tsx` and `CardModal.tsx` render the old briefing
(Executive Summary / Value Proposition / Proposed Actions). Telegram's created-card
message (`internal/channel/telegram/telegram.go`) shows title + summary + buttons.

## Goal
The triage surfaces show exactly what's needed to decide "research or not", and
Research becomes the obvious primary action for high-worthiness cards.

## Scope
**Triage card (`TriageView`)**
- Header: type badge, horizon pill, worthiness badge (High/Med/Low + reason tooltip), signal chips (⚠ thin extraction, 📣 promotional, source quality).
- Body: TL;DR (prominent), "Why you might care", "Claims" (≤3), "Open questions research would answer" (≤3), references (compact chips, clickable).
- Remove "Proposed Actions" from triage. If the card has research results, show a "Researched ✓ — verdict" chip instead (placeholder until Prompt 10).
- Research button promoted (primary style when worthiness = high). Keep `R` hotkey.

**Kanban card (`CardItem`)**: TL;DR + type + worthiness dot; no actions count for un-researched cards.

**Modal (`CardModal`)**: editable TL;DR, why-care, claims, open questions; references section (Prompt 4); proposed actions section only visible when non-empty (populated later by research).

**Telegram created message**: `<type badge> <title>` / TL;DR / up to 3 claims / `Worth researching: High — reason` / buttons `🔬 Research` · `→ Doing` · `Shelve` · `✕ Dismiss`. Respect Telegram length limits (truncate safely, rune-aware).

## Out of scope
Playbook picker on the Research button (Prompt 14).

## Acceptance criteria
- New-schema cards render all fields; legacy cards render gracefully (fallback to summary).
- Worthiness/signal badges have accessible labels and work in light + dark themes.
- Telegram message for a card with long claims stays under 4096 chars and is valid HTML/Markdown per current parse mode.
- No regression in swipe/hotkeys.

## Testing
Telegram formatter unit tests (normal, long, legacy card); frontend type-check +
build; manual QA checklist in PR (screenshots of triage, kanban, modal, both themes).
