# 01: Dynamic Window Identity, Widescreen 3-Column Canvas & Accomplishment Telemetry

**What to build:** Upgrade the **Intelligence Digest** backend and workspace layout so period accomplishments (`done` cards, executed action steps, and completed research dossiers) are accurately tracked regardless of when a card was originally captured, the time window (`7d` / `14d` / `30d`) is controlled via a tactile segmented pill switcher (and `1`/`2`/`3` keyboard shortcuts) that dynamically updates the workspace title (**Weekly** / **Biweekly** / **Monthly Intelligence Digest**) and period-over-period delta badges, and the layout expands into a full-screen widescreen 3-column intelligence grid (`max-width: 2400px`) above a collapsible **Day-by-Day Activity Timeline** deck.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] `GET /api/v1/digest` includes cards with `UpdatedAt` inside the active window in `weekly_wins` (`status == 'done'`), `completed_actions_count` (sum of `completed_actions` across cards active/updated in the window), and `research_harvest` (`research_state == 'done'` or `research_verdict != ''`), even when `CreatedAt` predates the window, and returns `prev_wins` and `stale_cards` alongside existing capture funnel metrics.
- [ ] The top window selector is a segmented pill toggle (`7d` · `14d` · `30d`, keyboard-accessible via `1`, `2`, `3` when no input/modal is focused) that dynamically updates the page title (**Weekly Intelligence Digest**, **Biweekly Intelligence Digest**, **Monthly Intelligence Digest**) and period-over-period delta badges (`vs prior 7d`, `vs prior 14d`, `vs prior 30d`).
- [ ] The Digest container expands fluidly up to `2400px` with a responsive 3-column intelligence grid on wide viewports (`>= 1280px`) and places the chronological **Day-by-Day Activity Timeline** inside a clean collapsible lower deck.
- [ ] All new UI strings are localized across all 8 supported Interface Locales (`en`, `ro`, `ru`, `de`, `es`, `fr`, `it`, `zh`) with backend and frontend integration tests passing.
