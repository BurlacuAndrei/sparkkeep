# Spec: Execution Board Workspace — Widescreen Architecture, Swimlanes, Docked Inspector & Focus Momentum

**Triage Label:** `ready-for-agent`  
**Status:** Ready for Ticket Breakdown  
**Related Documents:** [GLOSSARY.md](GLOSSARY.md), [CODING_STANDARDS.md](CODING_STANDARDS.md)

---

## Problem Statement

Compared to the Triage Deck and the Weekly Digest, the current Board view feels incomplete, static, and visually underpowered when opened on desktop and widescreen monitors:

1. **Severe Widescreen Underutilization:** Each Kanban column is hardcoded to a fixed `300px` width (`flex: 0 0 300px`). Across three status columns (`To Do`, `In Progress`, `Done`), the entire board occupies only `~932px`, leaving over half of a modern `1920px–2560px` viewport completely blank.
2. **Blocking Modal Context Switches:** Clicking any card on the board immediately launches a full-screen backdrop overlay that obscures the board canvas. Users cannot browse across cards side-by-side, compare items in a column, or check off steps in a docked detail pane while keeping their board in view.
3. **One-Dimensional Flat Columns:** When viewing "All Horizons", cards from `Short-Term (Now)`, `Medium-Term (Next)`, and `Long-Term (Later)` are dumped into a single flat vertical list per column. There is no two-dimensional matrix (**Execution Swimlanes**) to view or drag cards across both execution status and strategic Horizon or Card Type simultaneously, nor are there facet filters for Card Type, Research Verdict, or local sorting.
4. **Hidden Action Checklists & Uniform Card Stages:** Cards on the board look nearly identical across `To Do`, `In Progress`, and `Done` except for a tiny status label. Concrete `proposed_actions` and `why_care` takeaways synthesized by the AI are hidden behind the modal—forcing users to open a dialog just to see what the next step is or to check off an action item. Moreover, checking off the final action step on an `In Progress` card provides no completion payoff or automatic transition to `Done`.
5. **Decision Paralysis & Lack of Execution Momentum:** Unlike Triage (which guides the user one card at a time with live session progress and keyboard shortcuts) and Digest (which synthesizes an executive briefing), the Board drops the user in front of a passive wall of cards with no recommended starting point (**Focus Spotlight**), no live workspace telemetry (**Execution Pulse**), no keyboard navigation, and no effortless way to spot or sweep long-idle active cards.

---

## Solution

Transform the static 3-column Kanban page into a first-class, widescreen **Execution Board** workspace designed around effortless momentum, clarity, and completing real work:

1. **Fluid Widescreen Grid & Dedicated Modular Stylesheet:** Replace the fixed `300px` column cap with a responsive, full-width CSS Grid layout in a dedicated feature stylesheet so columns scale fluidly across wide monitors while Shelved and Dismissed views render in balanced multi-card grids.
2. **Non-Blocking Docked Board Inspector:** On wide viewports (`>= 1200px`), selecting a card (via click or keyboard focus) opens a side-by-side **Board Inspector** pane docked to the right of the board canvas. Users can read the executive summary, value proposition (`why_care`), Research Verdict and dossier preview, and toggle or edit action checklist items while keeping the board columns and swimlanes live and interactive on the left. Double-clicking a card or pressing the expand action (`o`) opens the full two-column Card Modal.
3. **Execution Swimlanes (2D Strategic Matrix):** Introduce a layout switcher between classic **Columns** (`To Do` · `In Progress` · `Done`) and **Execution Swimlanes**—a two-dimensional matrix crossing the three execution status columns against collapsible horizontal rows grouped by **Horizon** (`Now` / `Next` / `Later`) or **Card Type** (`tool`, `repo`, `article`, `paper`, etc.). Dragging a card between swimlane cells updates both its status and its Horizon in a single motion.
4. **Execution Pulse & Focus Spotlight ("Next Easiest Step"):**
   - **Execution Pulse:** A live telemetry strip at the top of the board derived 100% from card data (requiring zero artificial streak storage or database migrations), displaying overall **Action Step Progress** (`X / Y steps · Z%`), a clickable **Research Ready** filter pill (`🔬 N Research Ready`), **7-Day Shipped Velocity** (`✓ N completed this week`), and a quiet **Idle (`14d+`)** filter pill when active cards have gone untouched for two weeks.
   - **Focus Spotlight:** A collapsible recommendation bar integrated at the top of the Execution Board that eliminates decision paralysis by highlighting a single priority card and its next unchecked action step—automatically selecting either a user-pinned card (`🎯`), the closest-to-finish `In Progress` card (fewest remaining unchecked steps), or the highest-worthiness `Now` (`Short-Term`) `To Do` card with concrete steps. Users can check off the recommended step in one click, cycle (`↻`) to the next candidate, pin/unpin, or open the card in the Board Inspector.
5. **Stage-Aware Cards, Inline Action Checklists & Completion Payoff:**
   - **`In Progress` Cards (Comfortable Density):** Render an **Inline Action Checklist** displaying the live progress bar and up to 2 unchecked `proposed_actions` directly as interactive checkboxes on the card, plus a `+N more steps` toggle to expand all steps inline.
   - **`To Do` Cards (Comfortable Density):** Surface a single-line **Next Step** preview (`Next: <first unchecked action>`) with an interactive checkbox—checking it off marks that step complete and automatically advances the card into `In Progress` (with Undo).
   - **Final-Step Completion Payoff:** Checking off the final remaining action step on an `In Progress` card triggers a refined completion celebration state (respecting `data-reduce-motion`), transitions the card to `Done` (with a 5-second Undo toast), and offers a 1-click Knowledge Sink export action when configured.
   - **`Done` Cards & Compact Density:** Render in a streamlined, scannable format so finished items never crowd active work.
6. **Facet Filtering & Full Keyboard Parity:** Add toolbar facet filters for **Card Type**, **Research Verdict / Readiness**, and **Sort Order** (recently updated, worthiness, action progress, age), alongside full keyboard navigation (`j`/`k` or arrow keys to move focus across cards, `Space` to toggle the Board Inspector, `o` or `Enter` to open the full modal, `[` and `]` to move the focused card across status columns, `1`/`2`/`3` to assign Horizon, and `?` to open the keyboard shortcuts guide).

---

## User Stories

1. As a user on a widescreen desktop monitor, I want the Execution Board columns to expand fluidly across the available viewport width rather than stopping at 932px, so that my screen real estate is fully utilized and cards have room to breathe.
2. As a user browsing cards on a wide screen (`>= 1200px`), I want single-clicking a card to open a non-blocking **Board Inspector** pane docked on the right side of the board, so that I can inspect a card's details, research verdict, and action checklist without covering my board with a modal backdrop.
3. As a user with the Board Inspector open, I want to click or arrow (`j`/`k`) through different cards on the board and have the docked inspector update immediately in place, so that I can rapidly review multiple active items in succession.
4. As a user reading a card in the docked Board Inspector, I want a 1-click **Expand** button (and `o` keyboard shortcut / double-click on any card) that promotes the view into the full two-column Card Modal, so that I can read long-form research dossiers or perform deep editing whenever needed.
5. As a user on a tablet or narrower viewport (`< 1200px`), I want clicking a card on the Execution Board to open the full Card Modal directly, so that the layout never feels cramped on smaller screens.
6. As a user opening the Execution Board to start working, I want a **Focus Spotlight** at the top of the workspace that recommends a single high-leverage card and its next concrete action step, so that I never experience decision paralysis when facing a full board.
7. As a user with multiple `In Progress` cards, I want the Focus Spotlight to automatically prioritize the card closest to completion (fewest remaining unchecked action steps), so that I am nudged to finish open work before starting new work.
8. As a user with no `In Progress` cards, I want the Focus Spotlight to recommend the highest-worthiness `Now (Short-Term)` card in `To Do` (prioritizing cards with a `PURSUE` research verdict and actionable steps), so that I always have a clear starting point.
9. As a user viewing the Focus Spotlight, I want to check off the suggested next action step with a single click right inside the spotlight banner, so that I can make immediate progress within seconds of opening the app.
10. As a user viewing the Focus Spotlight, I want a **Next Suggestion (`↻`)** button to cycle through other eligible cards and a **Pin (`🎯`)** button on any card to lock my chosen priority into the spotlight, so that I stay in full control of my focus.
11. As a user who prefers a minimal header during deep work, I want to collapse and expand the Focus Spotlight with a single click (persisted in local preferences), so that I can reclaim vertical space whenever I want.
12. As a user viewing the Execution Board, I want an **Execution Pulse** telemetry strip in the header that displays live **Action Step Progress** (`completed / total steps` and percentage bar across active board cards), **Research Ready** card count, and **7-Day Shipped** count, so that I can feel tangible momentum from my actual work without artificial game mechanics.
13. As a user with cards whose deep research playbooks have completed, I want to click the **Research Ready** pill in the Execution Pulse to filter the board to cards with completed research dossiers, so that I can immediately act on newly verified findings.
14. As a user whose active board has accumulated cards untouched for 14 or more days, I want a subtle **Idle (`14d+`)** filter pill to appear in the Execution Pulse with a 1-click option to filter to those idle cards or batch-shelve them, so that I can keep my workspace clean without noisy warning badges cluttering every card.
15. As a user looking at an `In Progress` card in Comfortable density, I want to see an **Inline Action Checklist** rendering the progress bar and up to 2 unchecked `proposed_actions` directly on the card face, so that I can see and check off my next steps without opening a modal.
16. As a user working on an `In Progress` card with more than 2 unchecked steps, I want a compact `+N more steps` toggle on the card face that expands and collapses the full list of steps inline, so that board cards remain scannable by default while supporting full inline execution.
17. As a user looking at a `To Do` card in Comfortable density, I want to see its first unchecked action step (`Next: ...`) and its `why_care` / `Research Verdict` summary on the card face, so that I know why the card matters and how to start it at a glance.
18. As a user clicking the checkbox next to the `Next: ...` action step on a `To Do` card, I want that action step marked completed and the card automatically promoted into `In Progress` (with an Undo toast), so that starting a task and completing its first step happens in one fluid motion.
19. As a user checking off the final remaining action step on an `In Progress` card (either on the card face, in the Focus Spotlight, or in the Board Inspector), I want the card to display a refined completion celebration (respecting `data-reduce-motion`) and automatically transition to `Done` with an Undo toast and a 1-click Knowledge Sink export option when configured, so that finishing all steps of an idea feels genuinely rewarding.
20. As a user viewing cards in the `Done` column (or in `Compact` density mode), I want checklists and multi-line summaries collapsed into a compact completion badge (`N/N completed`), so that finished work stays tidy and high-density scanning remains fast.
21. As a user planning across multiple time horizons on a large screen, I want to switch the board layout from **Columns** to **Execution Swimlanes**, so that I can see `Now (Short-Term)`, `Next (Medium-Term)`, and `Later (Long-Term)` as horizontal swimlane rows crossed with `To Do`, `In Progress`, and `Done` columns in a 2D strategic matrix.
22. As a user in Execution Swimlanes view grouped by Horizon, I want to drag and drop a card into any row-column cell to update both its `status` and its `horizon` simultaneously (with Undo support), so that reprioritizing across time and execution stage is effortless.
23. As a user organizing a diverse collection of tools, repositories, papers, and articles, I want the option to group **Execution Swimlanes** by **Card Type**, so that I can view and manage each category of spark across its `To Do`, `In Progress`, and `Done` stages.
24. As a user in Execution Swimlanes view, I want to collapse and expand individual swimlane rows, so that I can fold away rows I am not currently focusing on.
25. As a user with many cards on the Execution Board, I want toolbar facet filters for **Card Type**, **Research Verdict** (`Pursue`, `Watch`, `Research Ready`), and **Sort Order** (Recently Updated, Worthiness, Action Progress, Newest), so that I can slice my execution queue without leaving the board.
26. As a keyboard-first power user on the Execution Board, I want to navigate cards with `j`/`k` or arrow keys, toggle the docked Board Inspector with `Space`, open the full Card Modal with `o` or `Enter`, move a focused card across status columns with `[` and `]`, assign its Horizon with `1`/`2`/`3`, and view a keyboard shortcuts cheat-sheet with `?`, so that the Execution Board matches the speed and ergonomics of the Triage Deck.
27. As a user operating Sparkkeep in any of the six supported Interface Locales (`en`, `ro`, `es`, `pt-BR`, `fr`, `de`), I want all labels, telemetry counters, spotlight actions, swimlane headers, inspector controls, and shortcut hints on the Execution Board to be fully localized.

---

## Implementation Decisions

1. **Dedicated Execution Board Feature Stylesheet & Fluid Grid Architecture:**
   - Extract and expand Execution Board styles into a dedicated modular stylesheet imported by the board workspace, removing the legacy fixed `flex: 0 0 300px` column constraint.
   - Use a responsive CSS Grid for the 3-column execution canvas (`grid-template-columns: repeat(3, minmax(300px, 1fr))`), allowing columns to expand fluidly across wide viewports.
   - When the **Board Inspector** is docked open on viewports `>= 1200px`, wrap the board canvas and the inspector in a two-zone master-detail layout where the board grid flexes on the left and the inspector docks as a sticky/scrollable pane (`width: clamp(380px, 30vw, 460px)`) on the right.
2. **Execution Pulse Telemetry Derivation (Stateless & Real-Time):**
   - Compute all **Execution Pulse** metrics purely from the loaded card collection in memory without adding database tables or extra network calls:
     - **Action Step Progress:** Sum `completed_actions.length` and `proposed_actions.length` across active board cards (`to-do` and `in-progress` matching the active horizon/tag scope, plus recently completed `done` cards if in scope) to render a live progress bar and step tally.
     - **Research Ready Count:** Count active board cards (`to-do` or `in-progress`) where `research_state === 'done'` or `Boolean(research_verdict)`. Clicking the pill toggles a quick filter isolating those cards.
     - **7-Day Shipped Velocity:** Count cards in `done` whose `updated_at` (or `created_at`) is within the last 7 days.
     - **Idle (`14d+`) Filter Pill:** Count `in-progress` and `short-term` `to-do` cards whose `updated_at` (or `created_at`) is older than 14 days. Render a quiet filter pill only when the count is `> 0`; when active, expose a 1-click batch-shelve action invoking the existing stale-shelve API endpoint.
3. **Focus Spotlight Ranking & State Machine:**
   - Select the **Focus Spotlight** candidate from active board cards (`in-progress` and `to-do`) using a deterministic priority order:
     1. A card matching the user's manually pinned Focus Card ID (stored in `localStorage` under `sparkkeep_board_focus_id`), provided it is still in `to-do` or `in-progress`.
     2. `in-progress` cards that have at least one unchecked item in `proposed_actions`, sorted ascending by remaining unchecked step count (`total - completed`), then descending by worthiness (`high` > `medium` > `low`) and `updated_at`.
     3. `to-do` cards in the `short-term` (`Now`) horizon that have at least one unchecked item in `proposed_actions` (or any `short-term` `to-do` card if none have steps), sorted by `research_verdict === 'pursue'`, worthiness level, and recency.
   - Maintain a session skip-offset / cycled ID set so clicking **Next Suggestion (`↻`)** rotates cleanly through the ranked candidates.
   - Persist the Spotlight collapsed/expanded toggle in `localStorage` (`sparkkeep_board_spotlight_collapsed`).
4. **Stage-Aware Card Rendering & Inline Action Checklist Mechanics:**
   - Enhance board card rendering with stage-aware slots and an optional `onToggleActionStep(card, stepText, stepIndex)` callback:
     - **`In Progress` Stage (Comfortable Density):** Render `why_care` (or `tldr` fallback), the progress bar, and up to 2 unchecked items from `proposed_actions` as interactive checkbox rows directly on the card face. If more than 2 unchecked steps exist (or if completed steps exist), provide an inline toggle (`+N more steps` / `Show all steps`) that expands all `proposed_actions` in place on the card.
     - **`To Do` Stage (Comfortable Density):** Render a **Next Step** preview row showing the first unchecked item from `proposed_actions` with an interactive checkbox. Checking this step appends it to `completed_actions` and simultaneously updates `status: 'in-progress'` in a single `updateCard` patch (with Undo support).
     - **Final-Step Auto-Completion & Celebration:** When a user checks off the last remaining unchecked action step on an `in-progress` card (bringing `completed_actions.length === proposed_actions.length` where `proposed_actions.length > 0`), apply a temporary celebratory CSS class (`.is-completing-celebration`, respecting `[data-reduce-motion="reduced"]`) and patch the card with both the updated `completed_actions` and `status: 'done'`, displaying an Undo toast (and a toast action button to open/export or sync when a Knowledge Sink is configured).
     - **`Done` Stage & `Compact` Density:** Keep `Done` cards and `Compact` mode streamlined by omitting multi-row checklists and rendering a compact step completion pill (`N/N`).
5. **Execution Swimlanes (2D Matrix View):**
   - Add a layout mode toggle (`Columns` vs `Swimlanes`, persisted in `localStorage` under `sparkkeep_board_layout`) and a Swimlane grouping selector (`Horizon` vs `Card Type`, persisted under `sparkkeep_board_swimlane_group`).
   - In **Swimlanes** mode:
     - Render a 2D CSS Grid where each swimlane row has a sticky/collapsible lane header (showing lane title, card count, and step completion summary) followed by 3 drop-zone cells (`to-do`, `in-progress`, `done`).
     - When grouped by **Horizon**, render three rows (`short-term`, `medium-term`, `long-term`). Dropping a card into a cell `(targetHorizon, targetStatus)` dispatches a single `updateCard(id, { status: targetStatus, horizon: targetHorizon })` call with full Undo support reverting both fields.
     - When grouped by **Card Type**, render rows for each active Card Type that has at least one card on the board (localized via canonical card type labels), plus an `Other` row if applicable. Dropping a card into a cell updates its `status` (and if dragged across type rows, optionally updates `type` with Undo).
6. **Docked Board Inspector Component:**
   - Build a dedicated `BoardInspector` pane rendered alongside the board when a card is inspected on viewports `>= 1200px` (or when toggled via `Space`).
   - The `BoardInspector` displays:
     - Header with Platform badge, Card Type, Status & Horizon quick-selectors, **Pin to Focus (`🎯`)** button, **Expand to Full Modal (`Maximize2` / `o`)** button, and **Close (`X` / `Escape`)** button.
     - Editable or interactive **Action Checklist** (`proposed_actions` / `completed_actions` with ability to check off steps, add a new step, or remove a step right from the inspector).
     - **Executive Brief** (`tldr`, `why_care`, `worthiness`, and `claims` / `open_questions` summary).
     - **Research Verdict & Dossier Preview** (showing the verdict badge, confidence, and a collapsible preview of the latest research findings, or a 1-click **Deep Research** trigger button if unresearched).
7. **Facet Filters, Sorting & Keyboard Navigation:**
   - Add a compact filter & sort bar in the Execution Board header supporting:
     - **Card Type** filter pill/dropdown (populated from the card types present on the board).
     - **Signal / Research** filter (`All`, `Research Ready`, `Pursue Verdict`, `Idle 14d+`).
     - **Sort Order** (`Updated`, `Worthiness`, `Action Progress`, `Newest`).
   - Implement board keyboard shortcuts (inactive when typing in inputs or when a modal overlay is open):
     - `j` / `ArrowDown` and `k` / `ArrowUp`: Move keyboard focus ring across visible board cards.
     - `Space`: Toggle the docked **Board Inspector** for the focused card.
     - `o` or `Enter`: Open the full **Card Modal** for the focused card.
     - `[` and `]`: Move the focused card one stage left or right (`to-do` ↔ `in-progress` ↔ `done`).
     - `1`, `2`, `3`: Set the focused card's Horizon to `short-term`, `medium-term`, or `long-term`.
     - `f`: Pin/unpin the focused card in the **Focus Spotlight**.
     - `?`: Open the Keyboard Shortcuts guide modal.

---

## Testing Decisions

1. **Good Tests Assert External User-Visible Behavior at High-Level Seams:**
   - Tests must verify rendered DOM elements, ARIA roles/states, keyboard interactions, drag-and-drop outcomes, and emitted `onUpdateCard` / `onSelectCard` / API payloads—never internal component state variables or CSS class implementation details except where a class represents an explicit accessibility/density contract.
2. **Primary Seam — Execution Board Workspace Integration Seam (`KanbanBoard.test.tsx` & `CardItem.test.tsx`):**
   - Following prior art in `KanbanBoard.test.tsx`, `TriageView.test.tsx`, and `DigestView.test.tsx`, test the complete Execution Board experience through its top-level component interface:
     - **Execution Pulse Telemetry:** Verify accurate step progress (`completed / total`), `Research Ready` filter toggling, 7-day completed count, and conditional `Idle 14d+` filter + batch-shelve invocation.
     - **Focus Spotlight:** Verify automatic selection of the closest-to-finish `in-progress` card (and fallback to top `short-term` `to-do` card), manual pin override (`🎯`), cycling suggestions (`↻`), collapsing/expanding the spotlight, and 1-click step completion from the spotlight banner.
     - **Inline Action Checklist & Final-Step Completion:** Verify that `in-progress` cards render up to 2 unchecked steps inline with `+N more` expansion; verify that checking the next step on a `to-do` card patches both `completed_actions` and `status: 'in-progress'`; verify that checking the final unchecked step on an `in-progress` card patches `completed_actions` and `status: 'done'` with an Undo callback that restores prior state.
     - **Execution Swimlanes:** Verify switching between `Columns` and `Swimlanes` modes, grouping rows by `Horizon` and `Card Type`, collapsing a swimlane row, and dragging a card into a `(Horizon, Status)` cell to patch both `status` and `horizon` simultaneously.
     - **Docked Board Inspector:** Verify that clicking a card (or pressing `Space` on a focused card) opens the docked `BoardInspector` displaying the card's summary, `why_care`, and interactive checklist, while clicking `Expand` (or pressing `o` / double-clicking) invokes `onSelectCard` to open the full modal.
     - **Facet Filters & Keyboard Navigation:** Verify filtering by `Card Type` and `Research Ready`, sorting cards, and using keyboard shortcuts (`j`/`k`, `[`/`]`, `1`/`2`/`3`, `?`).
3. **Secondary Seam — Localization Catalog Parity Seam (`catalogParity.test.ts` & `placeholderParity.test.ts`):**
   - Verify 100% key and `{placeholder}` parity across all 6 supported locale catalogs (`en`, `ro`, `es`, `pt-BR`, `fr`, `de`) for all new Execution Board strings.

---

## Out of Scope

- Artificial consumer-game mechanics such as daily login streaks, XP point ledgers, leaderboards, or sound effects.
- New backend database migrations or SQLite tables (all board telemetry and checklist states use existing `Card` fields and REST API endpoints).
- Custom user-defined status columns beyond the canonical execution stages (`to-do`, `in-progress`, `done`, plus `shelved` and `dismissed` archive modes).
- Real-time multi-user collaborative cursors.

---

## Further Notes

- Canonical domain terminology (**Execution Board**, **Board Inspector**, **Execution Swimlanes**, **Execution Pulse**, **Focus Spotlight**, **Inline Action Checklist**) is recorded in [`GLOSSARY.md`](GLOSSARY.md).
- Every frontend change must synchronize `internal/web/dist` via `npm run build` and pass `make check` per [`AGENTS.md`](AGENTS.md) and [`CODING_STANDARDS.md`](CODING_STANDARDS.md).
