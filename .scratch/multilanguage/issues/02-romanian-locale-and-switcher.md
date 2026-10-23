# 02: Romanian Locale and Language Switcher

**What to build:**
A complete Romanian translation catalog with compile-time key parity against the English dictionary, so missing or extra keys produce TypeScript errors. Browser-language detection must apply Romanian automatically when `navigator.language` starts with "ro", falling back to English for unknown languages, with the stored preference taking precedence. A language selector in Settings → Appearance must let users switch between English and Romanian, persist the choice to `localStorage`, and apply the selected language to `document.documentElement.lang`. Tests must verify key parity between catalogs and coverage of all Romanian translations.

**Blocked by:** 01-i18n-core

**Status:** ready-for-agent

- [ ] Romanian catalog file exists with all keys from English dictionary, typed with `satisfies` for compile-time parity
- [ ] Browser-language detection applies Romanian when `navigator.language` starts with "ro", otherwise falls back to English
- [ ] Preference persistence: stored value takes precedence over browser detection
- [ ] `document.documentElement.lang` attribute reflects active locale on mount and change
- [ ] `LanguageSelector` component in Settings → Appearance renders as a `<select>` with English and Română options
- [ ] Language selector uses existing `pref-item-card` and `pref-select` styling patterns
- [ ] Key-parity test walks both catalog trees and fails if keys diverge
- [ ] Coverage test renders component in Romanian locale and asserts every key returns a non-empty translation
- [ ] `make check` passes with zero warnings
- [ ] Frontend build completes and `internal/web/dist` is committed
