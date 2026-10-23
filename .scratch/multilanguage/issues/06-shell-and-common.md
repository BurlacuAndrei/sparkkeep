# 06: Shell and Common Components Translation

**What to build:**
Every user-facing string in the application shell and common components must be translated, including the main app layout, header, sidebar navigation, omnisearch, setup wizard, lock screen, theme selector, error boundary, and any remaining user-facing strings not covered by tickets 03, 04, or 05. The translation keys must be added to both the English and Romanian catalogs in the same ticket, so no half-translated keys remain. A component test must render at least one shell component in Romanian and assert translated output appears in the DOM. The final coverage audit must find zero hardcoded user-facing English strings remaining in the frontend source.

**Blocked by:** 02-romanian-locale-and-switcher

**Status:** ready-for-agent

- [ ] App.tsx translated (any user-facing strings in root layout)
- [ ] Header translated (navigation labels, user menu items, action buttons)
- [ ] Sidebar translated (navigation items, section labels, badges)
- [ ] Omnisearch translated (placeholder text, result labels, empty states)
- [ ] SetupWizard translated (step titles, form labels, button text, validation messages)
- [ ] LockScreen translated (form labels, button text, error messages)
- [ ] ThemeSelector translated (theme names, descriptions)
- [ ] ErrorBoundary translated (error titles, descriptions, retry button text)
- [ ] All remaining user-facing strings in frontend/src not covered by tickets 03-05 translated
- [ ] All keys added to BOTH English and Romanian catalogs in this ticket
- [ ] Component test renders at least one shell component in Romanian and asserts translated output
- [ ] Coverage audit finds zero hardcoded user-facing English strings remaining
- [ ] `make check` passes with zero warnings
- [ ] Frontend build completes and `internal/web/dist` is committed
