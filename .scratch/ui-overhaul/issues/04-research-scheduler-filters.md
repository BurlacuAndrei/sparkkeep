# 04: Research Scheduler Filters Modernization

**What to build:** Upgrade the rule filter dropdowns in the Research Scheduler ("Card Status", "Worthiness", "Card Type") to use the interactive, accessible `CustomSelect` component with option chips, keyboard navigation, and seamless state persistence.

**Blocked by:** 01: Universal Form Controls Foundation & CSS Modular Seam

**Status:** resolved

- [x] Card Status filter dropdown uses `CustomSelect` (Any, Inbox, Doing).
- [x] Worthiness filter dropdown uses `CustomSelect` (Any, High, Medium, Low).
- [x] Card Type filter dropdown uses `CustomSelect`.
- [x] Automated research rule creation and editing save filter parameters accurately.
- [x] Existing tests in the test suite pass.
