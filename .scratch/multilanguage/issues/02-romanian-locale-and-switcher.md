# 02: Romanian Locale and Language Switcher

**What to build:**
A complete Romanian translation catalog with compile-time key parity against the English dictionary, so missing or extra keys produce TypeScript errors. Browser-language detection must apply Romanian automatically when `navigator.language` starts with "ro", falling back to English for unknown languages, with the stored preference taking precedence. A language selector in Settings → Appearance must let users switch between English and Romanian, persist the choice to `localStorage`, and apply the selected language to `document.documentElement.lang`. Tests must verify key parity between catalogs and coverage of all Romanian translations.

**Blocked by:** 01-i18n-core

**Status:** done

- [x] Romanian catalog file exists with all keys from English dictionary, typed with `satisfies` for compile-time parity
- [x] Browser-language detection applies Romanian when `navigator.language` starts with "ro", otherwise falls back to English
- [x] Preference persistence: stored value takes precedence over browser detection
- [x] `document.documentElement.lang` attribute reflects active locale on mount and change
- [x] `LanguageSelector` component in Settings → Appearance renders as a `<select>` with English and Română options
- [x] Language selector uses existing `pref-item-card` and `pref-select` styling patterns
- [x] Key-parity test walks both catalog trees and fails if keys diverge
- [x] Coverage test renders component in Romanian locale and asserts every key returns a non-empty translation
- [x] `make check` passes with zero warnings
- [x] Frontend build completes and `internal/web/dist` is committed

## Resolution

Implemented Romanian locale end to end.

- `frontend/src/i18n/ro.ts`: full catalog typed with `satisfies` against the English dictionary, so key drift is a compile-time error.
- `frontend/src/i18n/index.tsx`: locale detection order is stored preference, then `navigator.language` prefix `ro`, then English fallback. Active locale syncs to `document.documentElement.lang`.
- `frontend/src/components/settings/LanguageSelector.tsx`: `<select>` with English and Română options, reusing `pref-item-card` and `pref-select` styles, wired into Settings → Appearance.
- Tests: `catalogParity.test.ts` walks both trees for key parity; `localeCoverage.test.tsx` renders in Romanian and asserts every key yields a non-empty string; `LanguageSelector.test.tsx` covers rendering, switching, persistence, and `lang` sync.

Verification:

- Full frontend suite: 209/209 tests pass.
- `tsc`, lint, and `make check` pass. The `CardModal.tsx:69` warning is pre-existing and outside this ticket.
- `npm run build` succeeds; `internal/web/dist` is rebuilt and contains "Limba interfeței".

Commit: `<hash>`
