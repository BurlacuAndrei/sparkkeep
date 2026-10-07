# Prompt 14 — Playbook picker at research trigger (web + Telegram) + auto-select by type

**Type:** Feature · **Size:** M · **Depends on:** 13

## Context
Research is triggered from three places: triage (`R` hotkey / button), card modal,
and Telegram inline button (`<id>:research` callback in `telegram.go`). All currently
run the Default playbook. Card `type` (Prompt 6) and playbook `card_types`
(Prompt 13) exist but aren't connected.

## Goal
Research uses the right playbook automatically, and the user can override it in one
tap from any surface.

## Scope
- **Resolution rule** (server-side, single function, unit-tested): explicit
  `playbook_id` → user playbook matching card `type` (most recently updated wins) →
  built-in matching type → Default. Setting `default_playbook_id` overrides "Default".
- `POST /api/v1/research` without `playbook_id` uses the rule; response includes the
  chosen playbook.
- **Web**: Research button becomes a split button — main action runs the
  auto-selected playbook (label shows its name); caret opens a list of playbooks.
  `R` = auto; `Shift+R` opens the picker.
- **Telegram**: `🔬 Research` runs auto-selected; add `▾` button that edits the
  message keyboard to list up to 6 playbooks (callback `<id>:research:<playbook_id>`),
  plus "Back". Callback data must stay ≤ 64 bytes.
- Settings: "Default playbook" select.

## Out of scope
Pro gating of custom playbooks (Prompt 16).

## Acceptance criteria
- A `repo` card with a user playbook tagged `repo` auto-runs that playbook from all three surfaces.
- Override via picker runs the chosen playbook (visible in run's `playbook_id`).
- Telegram picker works with long playbook names (truncated labels) and stale messages (deleted playbook → friendly error).

## Testing
Resolution-rule table tests; web API tests; Telegram callback tests (keyboard edit,
payload size, deleted playbook); frontend type-check/build.
