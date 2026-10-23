# 05: Research, Digest, and Playbooks Translation

**What to build:**
Every user-facing string in research reports, the digest view, and the playbook manager must be translated, including report metadata, action buttons, status labels, progress indicators, playbook steps, and canvas elements. The translation keys must be added to both the English and Romanian catalogs in the same ticket, so no half-translated keys remain. A component test must render at least one research or playbook component in Romanian and assert translated output appears in the DOM.

**Blocked by:** 02-romanian-locale-and-switcher

**Status:** ready-for-agent

- [ ] ResearchReportView translated (report metadata, action buttons, status labels)
- [ ] ResearchProgressStrip translated (progress labels, status indicators)
- [ ] ResearchScheduler translated (form labels, descriptions, button text)
- [ ] DigestView translated (section titles, card summaries, action buttons)
- [ ] PlaybookManager translated (tab labels, playbook list, action buttons)
- [ ] playbooks sub-components translated (DryRunInspector, PlaybookCanvas, PlaybookHealthInspector, QuickAddPalette, StepEditorModal)
- [ ] Toast messages and error strings inside research and playbook components translated
- [ ] All keys added to BOTH English and Romanian catalogs in this ticket
- [ ] Component test renders at least one research or playbook component in Romanian and asserts translated output
- [ ] `make check` passes with zero warnings
- [ ] Frontend build completes and `internal/web/dist` is committed
