# 02: Stage-Aware Cards, Inline Action Checklist & Final-Step Completion Payoff

**What to build:** Transform board cards into stage-aware interactive surfaces:
- **`To Do` cards (Comfortable density):** Surface `why_care` / Research Verdict callouts and a single-line **Next Step** preview (`Next: <first unchecked action>`) with an interactive checkbox that marks the step completed *and* automatically transitions the card into `In Progress` (with Undo).
- **`In Progress` cards (Comfortable density):** Render an **Inline Action Checklist** with the progress bar and up to 2 unchecked `proposed_actions` directly checkable on the card face, plus a `+N more steps` inline expansion toggle.
- **Final-Step Completion Payoff:** Checking off the final remaining unchecked step on an `In Progress` card triggers a completion celebration state (respecting `data-reduce-motion`), transitions the card to `Done` (with Undo), and surfaces a 1-click Knowledge Sink export action when configured.
- **`Done` cards & `Compact` density:** Keep finished and compact cards tight with a compact `X/Y` step badge.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] On `to-do` cards in `Comfortable` density with at least one unchecked item in `proposed_actions`, the card displays a **Next Step** preview row with an interactive checkbox.
- [x] Checking the **Next Step** checkbox on a `to-do` card appends the step to `completed_actions` and updates `status: 'in-progress'` in a single mutation, displaying a toast with a 1-click Undo callback that restores both `status` and `completed_actions`.
- [x] On `in-progress` cards in `Comfortable` density, the card renders an **Inline Action Checklist** showing the progress bar and up to 2 unchecked `proposed_actions` as interactive checkboxes on the card face, plus a `+N more steps` button when additional steps exist that expands/collapses all steps inline.
- [x] Checking or unchecking a non-final step on an `in-progress` card updates `completed_actions` via `onUpdateCard` (with Undo support) without opening the modal.
- [x] Checking the final remaining unchecked step on an `in-progress` card (bringing `completed_actions.length === proposed_actions.length`) triggers a celebratory visual state (`.is-completing-celebration`, respecting `data-reduce-motion`), updates `completed_actions` and `status: 'done'`, and shows an Undo toast.
- [x] On `done` cards and in `Compact` density mode, multi-row inline checklists are omitted in favor of a compact step completion indicator.
- [x] All new strings are localized across all 6 Interface Locales (`en`, `ro`, `es`, `pt-BR`, `fr`, `de`), and automated tests verify `to-do` auto-promotion, `in-progress` inline checklist toggling/expansion, final-step auto-completion to `done`, and Undo behavior.
