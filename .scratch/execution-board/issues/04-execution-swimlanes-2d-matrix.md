# 04: Execution Swimlanes (2D Strategic Matrix by Horizon & Card Type)

**What to build:** Add the layout toggle switching between **Columns** and **Execution Swimlanes** (with a grouping selector for **Horizon** vs. **Card Type**). Render collapsible horizontal swimlane rows (`Now` / `Next` / `Later` or active Card Types) crossed with `To Do` · `In Progress` · `Done` columns, supporting 2D drag-and-drop across cells that updates both `status` and `horizon` (or `type`) in a single motion with Undo support.

**Blocked by:** 01: Widescreen Fluid Execution Board, Execution Pulse & Facet Filtering

**Status:** ready-for-agent

- [ ] A layout toggle in the Execution Board header switches between **Columns** and **Execution Swimlanes** views (persisted in `localStorage` under `sparkkeep_board_layout`).
- [ ] When **Execution Swimlanes** is active, a grouping selector switches swimlane rows between **Horizon** (`short-term`, `medium-term`, `long-term`) and **Card Type** (active card types present on the board, localized via `cardTypeLabel`), persisted under `sparkkeep_board_swimlane_group`.
- [ ] Each swimlane row renders a collapsible lane header showing the lane title, card count, and step progress summary, followed by 3 status drop-zone cells (`To Do`, `In Progress`, `Done`).
- [ ] Dragging and dropping a card into a `(Horizon, Status)` cell in Horizon Swimlanes dispatches a single `onUpdateCard(id, { status, horizon })` update and shows a toast with a 1-click Undo callback that reverts both `status` and `horizon`.
- [ ] Dragging and dropping a card into a `(CardType, Status)` cell in Card Type Swimlanes updates `status` (and `type` when moved across rows) with Undo support.
- [ ] All swimlane controls and headers are localized across all 6 Interface Locales (`en`, `ro`, `es`, `pt-BR`, `fr`, `de`), and automated tests verify layout switching, Horizon and Card Type swimlane grouping, row collapsing, and 2D drag-and-drop with Undo.
