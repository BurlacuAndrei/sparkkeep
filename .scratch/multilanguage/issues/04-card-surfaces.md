# 04: Card Surfaces Translation

**What to build:**
Every user-facing string in card components must be translated, including card items, the card modal and its sub-components, the new card modal, the Kanban board, the triage view and its sub-components, and any user-facing select options. The translation keys must be added to both the English and Romanian catalogs in the same ticket, so no half-translated keys remain. A component test must render at least one card component in Romanian and assert translated output appears in the DOM.

**Blocked by:** 02-romanian-locale-and-switcher

**Status:** ready-for-agent

- [ ] CardItem translated (action labels, submenu items, tooltips)
- [ ] CardModal translated (tab labels, action buttons, metadata fields)
- [ ] card-modal sub-components translated (CardActionsChecklist, CardCommentsSection, CardHeaderActions, CardLifecycleStepper, CardMetadataPanel)
- [ ] NewCardModal translated (form labels, placeholders, button text)
- [ ] KanbanBoard translated (column headers, card counts, status labels)
- [ ] TriageView translated (action buttons, status labels, keyboard shortcut descriptions)
- [ ] triage sub-components translated (KeyboardShortcutsModal, ResearchTray, SwipeCard, TriageList)
- [ ] CustomSelect and selectOptions translated if user-facing
- [ ] Toast messages and error strings inside card components translated
- [ ] All keys added to BOTH English and Romanian catalogs in this ticket
- [ ] Component test renders at least one card component in Romanian and asserts translated output
- [ ] `make check` passes with zero warnings
- [ ] Frontend build completes and `internal/web/dist` is committed
