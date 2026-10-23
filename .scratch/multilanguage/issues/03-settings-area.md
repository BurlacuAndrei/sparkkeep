# 03: Settings Area Translation

**What to build:**
Every user-facing string in the Settings modal and all seven settings tabs must be translated, including labels, titles, button text, placeholder text, toast messages, and error messages. The translation keys must be added to both the English and Romanian catalogs in the same ticket, so no half-translated keys remain. A component test must render at least one settings tab in Romanian and assert translated output appears in the DOM.

**Blocked by:** 02-romanian-locale-and-switcher

**Status:** done

- [x] SettingsModal translated (tab labels, section titles, button text)
- [x] Appearance tab translated (labels, descriptions, selector options)
- [x] Profile tab translated (form labels, placeholders, validation messages)
- [x] AI tab translated (section titles, form fields, helper text)
- [x] Integrations tab translated (form labels, status badges, helper text)
- [x] Channels tab translated (channel names, labels, status badges, action buttons)
- [x] Schedule tab translated (time labels, descriptions)
- [x] Security tab translated (form labels, confirmation prompts, error messages)
- [x] Toast messages and error strings inside settings components translated
- [x] All keys added to BOTH English and Romanian catalogs in this ticket
- [x] Component test renders at least one settings tab in Romanian and asserts translated output
- [x] `make check` passes with zero warnings
- [x] Frontend build completes and `internal/web/dist` is committed

## Resolution

Translated every settings surface through the typed `t()` provider. Keys added to `frontend/src/i18n/en.ts` and `frontend/src/i18n/ro.ts` in the same change; no catalog key exists in only one locale. `SettingsModal.test.tsx` renders the modal in Romanian and asserts translated tab labels and section text in the DOM.

Test evidence (tester run before commit):

- `tsc` type check: pass
- lint: pass, zero warnings
- `npm test`: 211 tests pass
- `npm run build`: pass, `internal/web/dist` refreshed (`assets/app.js`, `assets/SettingsModal-dgI2lgmm.js`)

Commit: `feat(i18n): translate settings, appearance, and scheduler surfaces`.
