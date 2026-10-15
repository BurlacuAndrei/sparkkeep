# 04: Research Health Inspector & Soft Linter

**What to build:**
Implement the persistent Research Health Inspector sidebar in the Custom Playbook Builder. Display a dynamic 5-Pillar Health Score (Grounding, Retrieval, Extraction, Verification, Delivery), non-blocking advisory warnings (e.g. "Hallucination Risk: No web search tool enabled") with 1-click `+ Add Recommended Step` auto-fix buttons, and a live dynamic token and execution latency cost estimator.

**Blocked by:**
03-custom-playbook-builder-canvas.md

**Status:** completed

- [x] Implement Research Health Inspector right-hand dock/sidebar in `PlaybookManager.tsx`.
- [x] Implement 5-Pillar scoring logic assessing Grounding, Retrieval, Extraction, Verification, and Delivery.
- [x] Surface non-blocking advisory notices with 1-click `+ Add Step` action buttons inserting the recommended step into the optimal position.
- [x] Build dynamic cost & time estimator recalculating LLM calls, web queries, and estimated latency as steps are edited.
- [x] Update `PlaybookManager.test.tsx` verifying health score calculation, advisory notices, and 1-click auto-fix actions.
