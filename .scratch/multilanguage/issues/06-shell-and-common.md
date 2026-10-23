# 06: Shell and Common Components Translation

**What to build:**
Every user-facing string in the application shell and common components must be translated, including the main app layout, header, sidebar navigation, omnisearch, setup wizard, lock screen, theme selector, error boundary, and any remaining user-facing strings not covered by tickets 03, 04, or 05. The translation keys must be added to both the English and Romanian catalogs in the same ticket, so no half-translated keys remain. A component test must render at least one shell component in Romanian and assert translated output appears in the DOM. The final coverage audit must find zero hardcoded user-facing English strings remaining in the frontend source.

**Blocked by:** 02-romanian-locale-and-switcher

**Status:** done

- [x] App.tsx translated (any user-facing strings in root layout)
- [x] Header translated (navigation labels, user menu items, action buttons)
- [x] Sidebar translated (navigation items, section labels, badges)
- [x] Omnisearch translated (placeholder text, result labels, empty states)
- [x] SetupWizard translated (step titles, form labels, button text, validation messages)
- [x] LockScreen translated (form labels, button text, error messages)
- [x] ThemeSelector translated (theme names, descriptions)
- [x] ErrorBoundary translated (error titles, descriptions, retry button text)
- [x] All remaining user-facing strings in frontend/src not covered by tickets 03-05 translated
- [x] All keys added to BOTH English and Romanian catalogs in this ticket
- [x] Component test renders at least one shell component in Romanian and asserts translated output
- [x] Coverage audit finds zero hardcoded user-facing English strings remaining
- [x] `make check` passes with zero warnings
- [x] Frontend build completes and `internal/web/dist` is committed

## Resolution

Translated the application shell and remaining common surfaces: `App.tsx`, `Header`, `Sidebar`, `Omnisearch`, `SetupWizard`, `LockScreen`, and `ErrorBoundary`, plus the leftover strings in `api.ts` (error messages) and `settings/IntegrationsTab.tsx`. Theme names were already locale-driven and needed no key changes.

Keys were added to both `i18n/en.ts` and `i18n/ro.ts` in the same commit; `i18n/index.tsx` and `i18n/translate.ts` gained the lookup/interpolation support the new strings need. No locale has a missing key.

Test coverage: `Header.test.tsx` and `Sidebar.test.tsx` mount under `LocaleProvider locale="ro"` and assert Romanian strings in the DOM (sidebar covers populated tag list, empty state, and collapsed tab). `api.test.ts` and `i18n/__tests__/plural.test.ts` were updated for the translated messages and plural rules.

Coverage audit: no hardcoded user-facing English strings remain in `frontend/src`.

Two review rounds applied. The second round also removed the lingering lint warning in `CardModal.tsx` by deriving the effective settings value instead of mirroring prop state through a `useEffect` (`set-state-in-effect`); behavior is unchanged — parent-supplied settings win, otherwise settings are fetched once and cached locally.

Verification: `tsc` clean, lint zero warnings, 234 tests passing, frontend build succeeds, and `internal/web/dist` was rebuilt and committed (new `CustomSelect` chunk, renamed CardModal/NewCardModal/SettingsModal chunks).
