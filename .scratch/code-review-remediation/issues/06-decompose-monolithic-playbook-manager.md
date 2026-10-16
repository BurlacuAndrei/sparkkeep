# 06: Decompose Monolithic PlaybookManager into Domain Canvas Primitives

**What to build:**
Decompose the 2,418-line monolithic `frontend/src/components/PlaybookManager.tsx` into focused, single-responsibility subcomponents located under `frontend/src/components/playbooks/`:
1. `PlaybookHealthInspector.tsx` (5-pillar health readiness cards, advisory banners, and 1-click auto-fix actions)
2. `PlaybookCanvas.tsx` (step sequence rendering, move up/down, delete, step primitive badges)
3. `StepEditorModal.tsx` (step configuration forms, prompt instructions, quick starter chips, and tool policies)
Keep `PlaybookManager.tsx` as a clean coordinator component under 500 lines.

**Blocked by:** 03: Dynamic Card Taxonomy Synchronization in Playbook Routing

**Status:** completed

- [x] Create `frontend/src/components/playbooks/` directory
- [x] Extract `PlaybookHealthInspector.tsx` with clear props interface
- [x] Extract `PlaybookCanvas.tsx` with clear props interface
- [x] Extract `StepEditorModal.tsx` with clear props interface
- [x] Refactor `PlaybookManager.tsx` to compose these subcomponents
- [x] Verify `npm test` passes all 77+ tests and `npm run lint` has 0 warnings
- [x] Verify `npm run build` succeeds cleanly
