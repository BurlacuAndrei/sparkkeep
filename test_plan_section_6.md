## 6. Frontend UI Surfaces & User Experience

### 6.1 Triage Deck Swipe Physics & 5-Second Research Undo
- [x] **UI-01**: Verify Triage Deck pointer drag vectors map to drop zones (Left=Dismiss, Right=Keep, Up=Research, Down=Skip) and Research triggers 5s undo countdown before committing.
**Why it is done?**
Prevents accidental token expenditure by allowing the user 5 seconds to cancel research jobs.
- Status: PASS
- Verified by / date / commit: Subagent 6 / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: Vitest `src/components/TriageView.test.tsx` ("triggers 5s countdown on research and cancels api.triggerResearch if undone within 2s") confirms pointer drag vector resolving (`SwipeCard.tsx`: dx<0 dismiss, dx>0 keep, dy<0 research, dy>0 skip) and 5000ms delay (`TriageView.tsx`: `RESEARCH_UNDO_MS = 5000`) before triggering API call.
- Edge case checked: Triggered research via shortcut, advanced fake timers 2000ms, invoked toast undo; verified `api.triggerResearch` was not called and card state restored.
- Links: `frontend/src/components/TriageView.tsx#L195-L238`, `frontend/src/components/triage/SwipeCard.tsx#L125-L141`, `frontend/src/components/TriageView.test.tsx`

### 6.2 Sibling Idea Dismissal
- [x] **UI-02**: Verify multi-idea cards sharing a `capture_id` display the "Dismiss All Siblings" action and discard all related ideas in one click.
**Why it is done?**
Streamlines inbox clearing when a single web page produces 5-10 low-interest extracted ideas.
- Status: PASS
- Verified by / date / commit: Subagent 6 / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: Vitest `src/components/TriageView.test.tsx` ("multi-idea cards sharing capture_id display sibling dismissal and discard all matching ideas") verified `siblingTotal > 1` renders the `Dismiss remaining {{count}}` button in `SwipeCard.tsx`. Clicking invokes `dismissSiblings` which issues batch updates for all cards matching `capture_id`.
- Edge case checked: 2 sibling cards sharing `capture_id: 99`; clicked dismiss button, verified both cards 201 and 202 received `status: 'dismissed'`.
- Links: `frontend/src/components/TriageView.tsx#L361-L376`, `frontend/src/components/triage/SwipeCard.tsx#L309-L321`, `frontend/src/components/TriageView.test.tsx`

### 6.3 Kanban Board HTML5 Drag & Drop Transitions
- [ ] **UI-03**: Verify dragging a card between Kanban columns (`To Do` -> `In Progress` -> `Done`) updates card status via API and displays undo toast.
**Why it is done?**
Validates core workflow execution on desktop browsers.
- Status: PARTIAL
- Verified by / date / commit: Subagent 6 / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: Vitest `src/components/KanbanBoard.test.tsx` ("updates card status via onUpdateCard on HTML5 drop into Done column") confirms dragging a card to Done triggers `onUpdateCard(1, { status: 'done' })` and increments Done column counter. However, `KanbanBoard.tsx#handleDrop` calls `showToast` without the `onUndo` callback argument, so the toast does not display the Undo button.
- Edge case checked: Dragged card to Done column; verified done counter increments and status updates, but undo action button is omitted from toast notification.
- Links: https://github.com/BurlacuAndrei/sparkkeep/issues/43 , `frontend/src/components/KanbanBoard.tsx#L124-L142`, `frontend/src/components/KanbanBoard.test.tsx`

### 6.4 Kanban 7-Day Done Card Archival Folding
- [x] **UI-04**: Verify cards marked Done older than 7 days are collapsed into "View Archived" and expand when clicked.
**Why it is done?**
Prevents board clutter while preserving instant access to recent completions.
- Status: PASS
- Verified by / date / commit: Subagent 6 / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: Vitest `src/components/KanbanBoard.test.tsx` ("collapses cards marked Done older than 7 days into View Archived and expands when clicked") verified that 10 cards completed 14 days ago are folded into "View Archived (10)" while 3 cards completed 2 days ago remain displayed. Clicking expands all 13 cards and updates button to "Hide Archived".
- Edge case checked: Board with 3 fresh Done cards (<2d) and 10 stale Done cards (>14d); verified stale cards collapsed by default and revealed upon click.
- Links: `frontend/src/components/KanbanBoard.tsx#L89-L102`, `frontend/src/components/KanbanBoard.tsx#L470-L492`, `frontend/src/components/KanbanBoard.test.tsx`

### 6.5 Digest Brief Omnichannel Push & KPI Metrics
- [x] **UI-05**: Verify Digest Brief calculates Spark Volume, Clearance Rate %, and pushes markdown briefings to selected channels.
**Why it is done?**
Ensures the weekly review briefing provides accurate executive metrics and reliable cross-platform publishing.
- Status: PASS
- Verified by / date / commit: Subagent 6 / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: Vitest `src/components/DigestView.test.tsx` (22 tests passing) confirms calculation of Spark Volume (`totalSparks`), Triage Clearance Rate (`clearanceRate = totalSparks > 0 ? Math.round((decidedCount / totalSparks) * 100) : 100`), Markdown download/clipboard copy, and push via `pushDigestToChannel` to configured integrations.
- Edge case checked: Digest window with 0 captures (`digest: null` or empty days); renders empty-state "No captures in this window", clearance rate defaults cleanly to 100% without NaN%.
- Links: `frontend/src/components/DigestView.tsx#L201-L217`, `frontend/src/components/DigestView.tsx#L342-L360`, `frontend/src/components/DigestView.test.tsx`

### 6.6 Playbook Studio Visual Builder & Dry-Run Inspector
- [x] **UI-06**: Verify Playbook Studio allows inserting/reordering steps, displays health linter warnings, and simulates zero-token dry runs.
**Why it is done?**
Empowers users to customize deterministic research pipelines safely before executing them against LLMs.
- Status: PASS
- Verified by / date / commit: Subagent 6 / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: Vitest `src/components/PlaybookManager.test.tsx` (25 tests passing) confirms visual step builder, quick prompt starters, template library import/export, 5-pillar health scoring, and Dry-Run Inspector panel rendering compiled prompts with zero token consumption.
- Edge case checked: Playbook missing Extraction or Verification steps; Research Health Inspector renders amber advisory warnings ("Unextracted Sources", "Unverified Claims") with 1-click auto-fix buttons without disabling playbook save.
- Links: `frontend/src/components/PlaybookManager.tsx`, `frontend/src/components/PlaybookManager.test.tsx#L705-L790`

### 6.7 Card Modal 650ms Autosave & Idea Decomposition
- [x] **UI-07**: Verify Card Modal debounces edits with `saving` -> `saved` indicators, supports Split Idea, and merges sibling ideas.
**Why it is done?**
Ensures continuous autosave without keystroke lag, and allows splitting multifaceted articles into distinct atomic projects.
- Status: PASS
- Verified by / date / commit: Subagent 6 / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: Vitest `src/components/CardModal.test.tsx` ("debounces title autosave by 650ms and shows saved indicator" and "splits idea by retaining selected claims in Card A and creating Card B") confirms 650ms debounce with saving -> saved pill, and Split Idea decomposing claims across cards.
- Edge case checked: Split idea on Card 105 with 4 claims; selected 2 claims and gave title "Decomposed Card B". Verified Card A retained 2 unselected claims and Card B was created via `api.createCard` with the 2 selected claims sharing `capture_id: 88`.
- Links: `frontend/src/components/CardModal.tsx#L256-L268`, `frontend/src/components/CardModal.tsx#L504-L534`, `frontend/src/components/CardModal.test.tsx`
