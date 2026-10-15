# 05: End-to-End Integration & Verification

**What to build:**
Verify end-to-end integration: Card Type taxonomy persistence -> Card triage classification -> Card Type default playbook resolution -> Custom playbook execution with fallback synthesis -> Report display. Run full backend and frontend test suites and fix any regressions.

**Blocked by:**
04-research-health-inspector-and-linter.md

**Status:** ready-for-agent

- [ ] Verify `ResolvePlaybook` correctly routes cards to matching custom playbooks by Card Type and falls back to Platform Default.
- [ ] Run full Go test suite (`go test ./...`) and ensure all pass green.
- [ ] Run frontend test suite (`npm test -- --run`) and ensure all pass green.
- [ ] Verify frontend build (`npm run build`).
