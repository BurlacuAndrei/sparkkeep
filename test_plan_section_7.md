## 7. Internationalization (i18n), Themes & Accessibility

### 7.1 Six-Locale Catalog Parity & CLDR Pluralization Rules
- [x] **I18N-01**: Verify all 6 locales (`en`, `ro`, `es`, `pt-BR`, `fr`, `de`) provide 100% key parity and enforce plural categories (`one`, `few`, `other`).
**Why it is done?**
Guarantees grammatical correctness across all supported languages (e.g. Romanian `1 lună`, `3 luni`, `20 de luni`; French/Portuguese `0` and `1` mapped to `one`).
- Status: PASS
- Verified by / date / commit: Subagent 7 / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: `catalogParity.test.ts` (21 tests) validates 100% key parity across all 6 locales (`en`, `ro`, `es`, `pt-BR`, `fr`, `de`) with exactly 1,844 leaf keys per catalog and zero missing keys. `localeCoverage.test.tsx` (5 tests) asserts all translated leaves return non-empty strings. `pluralCategory` and `translatePlural` in `frontend/src/i18n/translate.ts:59-73` enforce CLDR pluralization rules: Romanian `n=1` -> `one`, `n=0 || (n%100 >= 1 && n%100 <= 19)` -> `few`, else `other`; French & Brazilian Portuguese truncate decimals and map integer `<= 1` (including 0, 0.5, 1, 1.5) to `one`. Verified via `plural.test.ts` (19 tests).
- Edge case checked: Romanian plural resolution checked for count=0 ("0 carduri", "0 luni" -> `few`), count=1 ("1 card", "1 lună" -> `one`), count=14 ("14 carduri", "14 luni" -> `few`), count=20 ("20 de carduri", "20 de luni" -> `other`). Spanish, Portuguese, French, and German singular/plural forms checked for counts 0, 1, 2, 3 in `plural.test.ts`.
- Links: `frontend/src/i18n/translate.ts:59-98`, `frontend/src/i18n/__tests__/plural.test.ts:1-107`, `frontend/src/i18n/__tests__/catalogParity.test.ts:1-55`.

### 7.2 Catalog Variable Placeholder Parity
- [x] **I18N-02**: Verify all translation keys across all 6 catalogs preserve identical `{{placeholder}}` token names without typos.
**Why it is done?**
Prevents silent rendering bugs where a mistyped placeholder (e.g. `{{cont}}` instead of `{{count}}`) displays empty text.
- Status: PASS
- Verified by / date / commit: Subagent 7 / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: `frontend/src/i18n/__tests__/placeholderParity.test.ts` (5 test suites, 100% passing) walks all 1,844 leaves in each non-English catalog (`ro`, `es`, `pt-BR`, `fr`, `de`) using regex `/\{\{(\w+)\}\}/g` and asserts that the extracted placeholder list for every leaf path identically matches the English reference key. Zero missing, renamed, or mistyped tokens found.
- Edge case checked: Automated AST leaf extraction scan across all `_one`, `_few`, and `_other` plural leaves and nested parameterized strings (e.g. `cards.age.months`, `settings.modal.taxonomy.confirmBodySingular`) confirms identical variable token lists across all 6 languages.
- Links: `frontend/src/i18n/__tests__/placeholderParity.test.ts:1-47`.

### 7.3 Theme Contrast Tokens & OLED Mode Support
- [ ] **I18N-03**: Verify Dark, Light, and OLED themes meet WCAG AA contrast ratios (4.5:1 for normal text) across triage, cards, and modal sheets.
**Why it is done?**
Ensures high readability across all lighting environments and monitors.
- Status: PARTIAL
- Verified by / date / commit: Subagent 7 / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence:
  - Contrast ratios: Color tokens in `frontend/src/styles/tokens.css` meet and exceed WCAG AA (4.5:1 normal text, 3:1 UI/large text) and AAA (7:1) across all themes. Computed ratios:
    - Dark theme: `--text-main` (#f3f4f6) on `--bg-app` (#0a0c10) is 17.78:1; on `--bg-surface` (#11141c) is 16.73:1; on `--bg-surface-elevated` (#161a24) is 15.80:1; `--text-dim` (#9ca3af) on `--bg-app` is 7.71:1.
    - Light theme: `--text-main` (#0f172a) on `--bg-app` (#f8fafc) is 17.06:1; on `--bg-surface` (#ffffff) is 17.85:1; on `--bg-surface-elevated` (#f1f5f9) is 16.30:1; `--text-dim` (#475569) on `--bg-app` is 7.24:1.
    - OLED theme: `--text-main` (#f9fafb) on `--bg-app` (#000000) is 20.10:1; on `--bg-surface-elevated` (#09090b) is 19.04:1; `--text-dim` (#9ca3af) on `--bg-app` is 8.27:1.
  - Immediate DOM sync: `ThemeContext.tsx:66-70` applies `data-theme` to `document.documentElement` immediately upon selection; verified in `ThemeSelector.test.tsx:69`.
  - Defect (OLED UI selector missing): `tokens.css:212-290` defines `[data-theme="oled"]` and `base.css:35` defines `[data-theme="oled"] body`. However, `ThemeContext.tsx:3-4` restricts `Theme` to `'dark' | 'light' | 'system'`, `ThemeSelector.tsx:14-33` only provides radio buttons for Dark, Light, and System, and no translation strings exist for OLED. Users cannot select OLED mode in Settings.
- Edge case checked: Switching theme from light to dark in `ThemeSelector` updates `data-theme` on `<html>` immediately and persists to localStorage (`sparkkeep_theme`). OLED mode applies correct tokens when set via DOM attribute, but is inaccessible via UI.
- Links: `frontend/src/styles/tokens.css:52-290`, `frontend/src/context/ThemeContext.tsx:1-95`, `frontend/src/components/ThemeSelector.tsx:1-81`; gh issue creation blocked by sandbox network isolation.

### 7.4 Reduced Motion Accessibility
- [x] **I18N-04**: Verify enabling "Reduce Motion" sets `data-reduce-motion="reduced"` on document root and disables card swipe animations and modal transitions.
**Why it is done?**
Prevents vestibular discomfort for users sensitive to motion effects.
- Status: PASS
- Verified by / date / commit: Subagent 7 / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: In `frontend/src/components/SettingsModal.tsx:332-336`, selecting "Reduced Blur & Motion" and saving sets `data-reduce-motion="reduced"` on `document.documentElement` and stores preference in `localStorage.getItem('sparkkeep_reduce_motion')`. On app startup, `frontend/src/App.tsx:160-168` re-hydrates this attribute from storage onto `<html>`. In `frontend/src/styles/tokens.css:293-301`, `[data-reduce-motion="reduced"] *` enforces `transition-duration: 0.01ms !important;`, `animation-duration: 0.01ms !important;`, `animation-iteration-count: 1 !important;`, and `backdrop-filter: none !important;`. Card swipe animations (`triage-deck.css:172` 320ms bezier curve) and modal transitions drop to 0.01ms (effectively instantaneous). Also supported via `@media (prefers-reduced-motion: reduce)` in `triage-deck.css:958-964`. Verified via automated test `updates data-reduce-motion and persists to localStorage on save` in `frontend/src/components/SettingsModal.test.tsx`.
- Edge case checked: Inspected computed CSS rules: `[data-reduce-motion="reduced"] *` overrides all deck cards (`.deck-card`, `.deck-ghost`), swipe gestures, and modal sheet transitions to 0.01ms instant execution. Toggling between 'default' and 'reduced' cleanly adds/removes attribute on `<html>`.
- Links: `frontend/src/styles/tokens.css:293-301`, `frontend/src/components/SettingsModal.tsx:331-336`, `frontend/src/App.tsx:160-168`, `frontend/src/components/SettingsModal.test.tsx:501-532`.
