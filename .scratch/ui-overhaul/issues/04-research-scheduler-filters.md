# 04: Research Scheduler Filters Modernization

**What to build:** Upgrade the rule filter dropdowns in the Research Scheduler ("Card Status", "Worthiness", "Card Type") to use the interactive, accessible `CustomSelect` component with option chips, keyboard navigation, and seamless state persistence.

**Blocked by:** 01: Universal Form Controls Foundation & CSS Modular Seam

**Status:** ready-for-agent

- [ ] Card Status filter dropdown uses `CustomSelect` (Any, Inbox, Doing).
- [ ] Worthiness filter dropdown uses `CustomSelect` (Any, High, Medium, Low).
- [ ] Card Type filter dropdown uses `CustomSelect`.
- [ ] Automated research rule creation and editing save filter parameters accurately.
- [ ] Existing tests in the test suite pass.
