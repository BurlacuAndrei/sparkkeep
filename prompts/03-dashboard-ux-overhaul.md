# Goal: Web Dashboard UX Overhaul (Triage vs Execution Tabs)

## Context
The current Kanban board on the web dashboard displays all 6 columns (`inbox`, `researching`, `review`, `doing`, `shelved`, `done`) simultaneously. As the user accumulates hundreds of cards, a horizontally scrolling 6-column board becomes overwhelming. We need to separate "Triage & Review" from "Project Execution".

## Requirements
1. **Tabbed Views:** Refactor `frontend/src/components/KanbanBoard.tsx` to include two top-level tabs:
   - **Triage & Review Tab:** Displays only the `Inbox`, `Researching`, and `Review` columns.
   - **Execution Tab:** Displays only the `Doing`, `Shelved`, and `Completed` columns.
2. **Slide-over Drawer for Analyze/Review:** When a user clicks a card that is in the `review` column, instead of a simple modal, open a sleek slide-over drawer (or an expanded focused modal). This view must display the full Markdown research report side-by-side with primary action buttons (`Move to Doing`, `Shelve`, `Mark Done`).
3. **Auto-Archiving for Done:** Filter the `done` column so that cards older than 7 days are automatically hidden from the main board (creating an effective "Archive" state without needing a new DB column). Add a small text link at the bottom of the `done` column: "View archived...".

## Testability
- **Visual Validation:** Ensure switching between the "Triage" and "Execution" tabs cleanly mounts/unmounts the appropriate columns without breaking drag-and-drop or state.
- **Drawer Interaction:** Verify that clicking a `review` card opens the new drawer, successfully renders markdown, and that the action buttons successfully trigger status changes (moving the card to the Execution tab).
- **Auto-archive Logic:** Create a mock card with `updated_at` older than 7 days and verify it does not render in the `done` column.
