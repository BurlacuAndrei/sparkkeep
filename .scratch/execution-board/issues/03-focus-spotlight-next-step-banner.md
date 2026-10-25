# 03: Focus Spotlight ("Next Easiest Step" Recommendation Banner)

**What to build:** Add the collapsible **Focus Spotlight** banner at the top of the Execution Board that eliminates decision paralysis by recommending a single high-leverage card and its next unchecked action step (prioritizing a manually pinned `🎯` card → closest-to-finish `In Progress` card → highest-worthiness `Now` `To Do` card with concrete steps). Users can complete the recommended step in one click directly in the spotlight (triggering auto-promote or final-step completion), cycle (`↻ Next suggestion`) through candidates, pin/unpin (`🎯`) any card, or collapse the spotlight.

**Blocked by:** 01: Widescreen Fluid Execution Board, Execution Pulse & Facet Filtering, 02: Stage-Aware Cards, Inline Action Checklist & Final-Step Completion Payoff

**Status:** ready-for-agent

- [ ] The **Focus Spotlight** banner renders at the top of the active Execution Board when at least one eligible `in-progress` or `to-do` card exists, ranking candidates deterministically: (1) manually pinned Focus Card (`sparkkeep_board_focus_id`), (2) `in-progress` card with the fewest remaining unchecked steps, (3) highest-worthiness / `pursue`-verdict `short-term` `to-do` card.
- [ ] The Focus Spotlight displays the recommended card's title, stage/horizon badge, step progress, and its next unchecked action step with a 1-click **Complete Step** button.
- [ ] Clicking **Complete Step** in the Focus Spotlight marks that action step completed (and promotes a `to-do` card to `in-progress`, or completes an `in-progress` card to `done` when it is the final step, with Undo support).
- [ ] Clicking **Next Suggestion (`↻`)** cycles the Focus Spotlight to the next eligible candidate card in the ranked list.
- [ ] Users can pin or unpin any active card as their Focus Card (`🎯`) from the spotlight or card actions (persisted in `localStorage` under `sparkkeep_board_focus_id`), and can collapse/expand the Focus Spotlight banner (`sparkkeep_board_spotlight_collapsed`).
- [ ] All Focus Spotlight strings are localized across all 6 Interface Locales (`en`, `ro`, `es`, `pt-BR`, `fr`, `de`), and automated tests verify candidate ranking, pin override, cycling suggestions, 1-click step completion, and collapse persistence.
