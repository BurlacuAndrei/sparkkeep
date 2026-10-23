# 04: Card Surfaces Translation

**What to build:**
Every user-facing string in card components must be translated, including card items, the card modal and its sub-components, the new card modal, the Kanban board, the triage view and its sub-components, and any user-facing select options. The translation keys must be added to both the English and Romanian catalogs in the same ticket, so no half-translated keys remain. A component test must render at least one card component in Romanian and assert translated output appears in the DOM.

**Blocked by:** 02-romanian-locale-and-switcher

**Status:** done

- [x] CardItem translated (action labels, submenu items, tooltips)
- [x] CardModal translated (tab labels, action buttons, metadata fields)
- [x] card-modal sub-components translated (CardActionsChecklist, CardCommentsSection, CardHeaderActions, CardLifecycleStepper, CardMetadataPanel)
- [x] NewCardModal translated (form labels, placeholders, button text)
- [x] KanbanBoard translated (column headers, card counts, status labels)
- [x] TriageView translated (action buttons, status labels, keyboard shortcut descriptions)
- [x] triage sub-components translated (KeyboardShortcutsModal, ResearchTray, SwipeCard, TriageList)
- [x] CustomSelect and selectOptions translated if user-facing
- [x] Toast messages and error strings inside card components translated
- [x] All keys added to BOTH English and Romanian catalogs in this ticket
- [x] Component test renders at least one card component in Romanian and asserts translated output
- [x] `make check` passes with zero warnings
- [x] Frontend build completes and `internal/web/dist` is committed

## Resolution

Translated all card, board, and triage surfaces across two review rounds.

- **Catalogs:** `frontend/src/i18n/en.ts` and `ro.ts` gained matching key sets; `types.ts` and `index.tsx` extended for the new namespaces. Romanian terminology reviewed and corrected (enum labels, not raw enum values).
- **Card surfaces:** `CardItem`, `CardModal`, `NewCardModal`, `KanbanBoard`, `TriageView`, `CustomSelect`, `selectOptions`.
- **Sub-components:** `card-modal/CardActionsChecklist`, `CardCommentsSection`, `CardHeaderActions`, `CardLifecycleStepper`, `CardMetadataPanel`; `triage/KeyboardShortcutsModal`, `ResearchTray`, `SwipeCard`, `TriageList`.
- **Helpers:** plural-aware interpolation added to the translate helper with its own test. New `frontend/src/utils/cardEnumLabels.ts` maps domain enums to translation keys so enum values never leak into the UI; `cardUtils.tsx` and `triage.ts` updated to use it.
- **Tests:** new `CardItem.test.tsx` renders a card component in Romanian and asserts translated output; existing CardModal, NewCardModal, KanbanBoard, TriageView, CardHeaderActions, DigestView, PlaybookManager, i18n, and cardUtils tests updated for the new keys.
- **Verification:** `tsc`, lint, 225 tests, and the production build pass. `internal/web/dist` rebuilt; the chunk renames show as deletions of the old hashed assets plus additions of the new ones.
