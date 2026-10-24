Status: ready-for-agent

## Problem Statement

Sparkkeep's UI text is hardcoded in English. A user who speaks Romanian (or another language) has no way to switch the interface. The platform already stores a `user_profile.language` field, but it controls AI output language — not UI labels. There is no i18n infrastructure, no language selector, and no persistence mechanism for a display-language preference.

## Solution

Add a small typed i18n module (dictionary + React context + hook) following the `ThemeContext` precedent. Ship English (default, "most popular") and Romanian. Persist the chosen locale in `localStorage`, apply `document.documentElement.lang`, and detect the browser language as a fallback (unknown → English). Expose a language selector in Settings → Appearance. Architecture allows adding more locales by dropping a new catalog file with compile-time key-parity enforcement — no component changes required.

## User Stories

1. As a Romanian-speaking user, I want to switch the UI language to Romanian so I can use Sparkkeep in my native language.
2. As a new user, I want the UI to auto-detect my browser language and apply Romanian automatically, so I don't have to configure it manually.
3. As an English-speaking user, I want English to remain the default and "most popular" language, so my experience is unchanged.
4. As a user, I want my language choice to persist across sessions, so I only pick it once.
5. As a developer, I want to add a new locale by creating one catalog file that is compile-time checked against the English shape, so I cannot ship a partial translation.
6. As a developer, I want a `useLocale()` hook so I can translate strings without prop-drilling or global imports.
7. As a user, I want the `<html lang>` attribute to reflect my choice, so screen readers and browser tools work correctly.
8. As a developer, I want interpolation support for dynamic values (counts, names), so translated strings can include runtime data.
9. As a developer, I want date and number formatting to use `Intl` APIs with the active locale, so new code is locale-aware by default.

## Implementation Decisions

1. **Module shape:** A single `frontend/src/i18n/` module with `types.ts` (key shape), `en.ts` (source-of-truth catalog), `ro.ts` (Romanian catalog), `index.ts` (public API: `LocaleProvider`, `useLocale`, `Locale` type). Components consume only the public API.
2. **Compile-time key parity:** The Romanian catalog is typed as `satisfies` the English catalog shape (deep `typeof en`). Missing or extra keys in `ro` produce a TypeScript error. A runtime check in tests walks both trees and fails if keys diverge.
3. **Context pattern:** Mirror `ThemeContext.tsx`: `createContext` + `LocaleProvider` + `useLocale()` hook. `useLocale()` returns `{ t, locale, setLocale, locales }`. `t(key, vars?)` looks up a key and interpolates `{{name}}` placeholders.
4. **Persistence:** `localStorage` key `sparkkeep_locale`. Fallback chain: stored value → `navigator.language` prefix match → `'en'`. On change, write to storage and set `document.documentElement.lang`.
5. **Interpolation:** `t('key', { count: 3 })` replaces `{{count}}` in the value string. No plural library; count-based keys (e.g. `items_one`, `items_other`) handled by a small helper when needed.
6. **Provider placement:** `LocaleProvider` wraps the app alongside `ThemeProvider` in `App.tsx`. It is independent of `ThemeProvider` (no coupling).
7. **Language switcher UI:** A new `LanguageSelector` component rendered inside Settings → Appearance, as a `<select>` with two options (English / Română), styled like the existing `pref-item-card` + `pref-select` pattern. Uses `useLocale().setLocale`.
8. **DOM application:** `useEffect` in provider sets `document.documentElement.lang = locale` on mount and on change.
9. **No new dependency:** Pure TypeScript + React. No `react-i18next`, `next-intl`, or similar.
10. **Catalog namespace:** Keys use dotted namespaces matching component boundaries (e.g. `settings.appearance.title`, `settings.channels.add`). Top-level namespaces: `common`, `settings`, `cards`, `research`, `triage`, `errors`, `playbooks`.
11. **Test-only strings:** Strings that only appear in test files are translated too, so the catalog-to-locale coverage test is exhaustive.
12. **Intl formatting:** Export a `formatNumber(n)` and `formatDate(d)` helper from the i18n module that uses `Intl.NumberFormat(locale)` and `Intl.DateTimeFormat(locale)`. Existing formatters untouched; new code uses helpers.
13. **No backend changes:** `user_profile.language` still controls AI output. UI locale is frontend-only, stored in `localStorage`, not synced to the backend.

## Testing Decisions

1. **Catalog key parity test:** A unit test (`frontend/src/i18n/__tests__/catalogParity.test.ts`) walks the `en` and `ro` trees recursively and asserts every leaf key exists in both. This catches drift at CI time, complementing the `satisfies` compile-time check.
2. **Catalog-to-locale coverage test:** A unit test (`frontend/src/i18n/__tests__/localeCoverage.test.ts`) renders a test component wrapped in `<LocaleProvider locale="ro">`, calls `t()` for every leaf key in the English catalog, and asserts each returns a non-empty translated string (not the raw key). This proves every key has a Romanian translation.
3. **Component-level render test:** At least one existing component (e.g. `ThemeSelector.test.tsx` or a new `LanguageSelector.test.tsx`) is rendered with Romanian locale and asserts translated output appears in the DOM. This proves the hook integrates correctly.
4. **Provider hook test:** `useLocale` hook test verifies default locale, `setLocale` persistence, interpolation, and fallback to English for unknown browser language.
5. **Prior art:** Tests follow the `ThemeSelector.test.tsx` pattern — wrap in provider, assert rendered output. Vitest + `@testing-library/react`.
6. **Zero console warnings:** All new tests must pass with zero warnings (CODING_STANDARDS §3).

## Out of Scope

- Backend channel/digest message localization (Telegram, Discord, Slack, OpenClaw notification text).
- AI output language control (already handled by `user_profile.language`).
- RTL layout support (no Arabic/Hebrew targeted).
- Rewriting existing date/number formatters to use the new `Intl` helpers.
- Adding locales beyond English and Romanian.
- Backend API changes to store the UI locale.

## Wave 2

Wave 2 extends the i18n foundation to six locales (adds Spanish, Portuguese-Brazil, French, German) with a generalized detection algorithm, per-locale plural rules, and a test suite that iterates every registered catalog. Full specification and implementation tickets live in `.scratch/i18n-locales/`. See that spec for scope, user stories, and implementation decisions.

---

## Further Notes

- The `satisfies` trick requires TypeScript 4.9+ (already satisfied by the project's TS version).
- Adding a third locale later is a single-file addition plus one `import` in the provider's locale map — no component edits.
- The language selector in Appearance should visually indicate the current locale with a checkmark or the native-language label (e.g. "Română").
- The i18n module should be tree-shakable: unused keys are still bundled (string catalogs are small), but the `t()` function should not pull in unused code.
