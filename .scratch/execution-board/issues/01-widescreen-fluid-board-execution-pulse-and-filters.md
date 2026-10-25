# 01: Widescreen Fluid Execution Board, Execution Pulse & Facet Filtering

**What to build:** Replace the hardcoded `300px` column width cap with a dedicated modular Execution Board stylesheet and fluid widescreen 3-column CSS Grid (`minmax(300px, 1fr)`). Add the live **Execution Pulse** telemetry strip derived from card data (**Action Step Progress** `X/Y · Z%` bar, clickable **Research Ready** filter pill, **7-Day Shipped** velocity counter, and conditional **Idle `14d+`** filter pill with 1-click batch-shelve) alongside toolbar facet filters (**Card Type**, **Research Verdict / Readiness**, and **Sort Order**: Recently Updated, Worthiness, Action Progress, Newest), fully localized across all 6 Interface Locales with integration tests.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] A dedicated modular Execution Board stylesheet replaces the fixed `300px` column constraint with a fluid responsive 3-column CSS Grid (`minmax(300px, 1fr)`) so the board scales across widescreen viewports.
- [x] The **Execution Pulse** strip renders at the top of the active Execution Board, displaying live **Action Step Progress** (`completed / total` steps and percentage bar across active cards), **Research Ready** count, and **7-Day Shipped** count (`done` within the last 7 days).
- [x] Clicking the **Research Ready** pill in the Execution Pulse toggles filtering the board to cards with completed research (`research_state === 'done'` or `Boolean(research_verdict)`).
- [x] When active board cards (`in-progress` or `short-term` `to-do`) have not been updated in 14+ days, an **Idle `14d+`** filter pill appears in the Execution Pulse; activating it filters to those idle cards and exposes a 1-click batch-shelve button invoking `batchShelveStale`.
- [x] Toolbar facet filters allow filtering active board cards by **Card Type**, **Research Verdict / Signal** (`All`, `Research Ready`, `Pursue`, `Idle 14d+`), and **Sort Order** (`Updated`, `Worthiness`, `Action Progress`, `Newest`).
- [x] All new UI labels and telemetry strings are localized across all 6 Interface Locales (`en`, `ro`, `es`, `pt-BR`, `fr`, `de`) with catalog and placeholder parity tests passing.
- [x] Automated integration tests verify Execution Pulse calculations, Research Ready and Idle filter toggles, batch-shelving idle cards, Card Type filtering, and sorting.
