# 05: Research, Digest, and Playbooks Translation

**What to build:**
Every user-facing string in research reports, the digest view, and the playbook manager must be translated, including report metadata, action buttons, status labels, progress indicators, playbook steps, and canvas elements. The translation keys must be added to both the English and Romanian catalogs in the same ticket, so no half-translated keys remain. A component test must render at least one research or playbook component in Romanian and assert translated output appears in the DOM.

**Blocked by:** 02-romanian-locale-and-switcher

**Status:** done

- [x] ResearchReportView translated (report metadata, action buttons, status labels)
- [x] ResearchProgressStrip translated (progress labels, status indicators)
- [x] ResearchScheduler translated (form labels, descriptions, button text) — landed in `9e0e33e`
- [x] DigestView translated (section titles, card summaries, action buttons)
- [x] PlaybookManager translated (tab labels, playbook list, action buttons)
- [x] playbooks sub-components translated (DryRunInspector, PlaybookCanvas, PlaybookHealthInspector, QuickAddPalette, StepEditorModal)
- [x] Toast messages and error strings inside research and playbook components translated
- [x] All keys added to BOTH English and Romanian catalogs in this ticket
- [x] Component test renders at least one research or playbook component in Romanian and asserts translated output
- [x] `make check` passes with zero warnings
- [x] Frontend build completes and `internal/web/dist` is committed

## Resolution

Translated the research, digest, and playbook surfaces with keys added to `frontend/src/i18n/en.ts` and `frontend/src/i18n/ro.ts` in the same change.

- **Research:** `ResearchReportView.tsx` and `ResearchProgressStrip.tsx` now read all report metadata, action buttons, status labels, and progress indicators from the catalog. `ResearchScheduler` was already covered by ticket 03.
- **Digest:** `DigestView.tsx` translates section titles, card summaries, action buttons, and pluralized counters. `translatePlural` now lets `vars.count` override the numeric fallback so callers can format the count (e.g. locale-aware grouping) before interpolation.
- **Playbooks:** `PlaybookManager.tsx`, `playbooks/DryRunInspector.tsx`, `playbooks/PlaybookCanvas.tsx`, `playbooks/PlaybookHealthInspector.tsx`, `playbooks/QuickAddPalette.tsx`, `playbooks/StepEditorModal.tsx`, and `playbooks/constants.ts` translate tabs, list rows, canvas elements, step editor fields, and toast/error strings. Enum display labels come from `utils/cardEnumLabels.ts`.
- **Tests:** `DigestView.test.tsx` and `PlaybookManager.test.tsx` assert Romanian output in the DOM.
- **Build:** `npm run build` refreshed `internal/web/dist` (`app.js` plus renamed `CardModal`, `NewCardModal`, `SettingsModal` chunks).

Verification: `tsc`, lint, 228 tests, and the frontend build pass after three review rounds.
