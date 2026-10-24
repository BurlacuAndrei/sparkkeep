Status: ready-for-agent

## Problem Statement

Sparkkeep ships with English and Romanian UI localization (0.9.1). Users in Spanish-speaking, Portuguese-speaking (Brazil), French-speaking, and German-speaking regions must use English or Romanian. The typed catalog infrastructure supports adding locales by dropping a new catalog file with compile-time key-parity enforcement, but the current `Locale` union, detection logic, plural resolver, and test suite are hardcoded for two locales. Generalizing these foundations and translating the ~2,350-leaf catalog into four additional languages will make Sparkkeep accessible to ~1.5 billion additional speakers without architectural rework.

## Solution

Extend the i18n module to support six locales (English, Romanian, Spanish, Portuguese-Brazil, French, German) by: (1) generalizing the `Locale` union, detection algorithm, and plural resolver to handle per-locale rules; (2) translating the full English catalog into four native-language catalogs with compile-time and runtime key parity; (3) expanding parity, coverage, placeholder, and plural tests to iterate every registered catalog; (4) bumping to 0.9.2 and rebuilding `internal/web/dist`. No new dependencies. Backend localization stays out of scope.

## User Stories

1. As a Spanish-speaking user, I want to switch the UI to Español so I can use Sparkkeep in my native language.
2. As a Brazilian Portuguese user, I want the UI to detect `pt-BR` from my browser and apply Portuguese (Brasil) automatically, so I don't have to configure it manually.
3. As a French-speaking user in Canada, I want `fr-CA` to fall back to `fr` so I see French UI even though my browser reports a regional variant.
4. As an Austrian German user, I want `de-AT` to resolve to `de` so I see German UI without manual configuration.
5. As a Latin American Spanish user, I want `es-419` to resolve to `es` so I see Spanish UI.
6. As a user, I want plural forms to follow each locale's rules: Spanish and German use one/other (1 card / 2 cards); Portuguese-Brazil and French use one for 0 and 1, other otherwise (0 carte / 1 carte / 2 cartes); Romanian keeps its existing one/few/other system.
7. As a developer, I want parity and coverage tests to iterate every registered catalog, so adding a seventh locale requires only a catalog file and registration — no test edits.
8. As a developer, I want a placeholder-parity test that ensures every catalog has the same `{{placeholders}}` per key as English, so translations cannot drop or rename interpolation variables.
9. As a developer, I want each new locale to include at least one component render test asserting real translated text, so the hook integrates correctly end-to-end.
10. As a user, I want the language selector to show native labels (Español, Português (Brasil), Français, Deutsch) so I can recognize my language at a glance.

## Implementation Decisions

1. **Locale union:** Extend `Locale` in `types.ts` to `'en' | 'ro' | 'es' | 'pt-BR' | 'fr' | 'de'`. Use BCP-47 canonical casing (`pt-BR` not `pt-br`) for display; storage and comparison normalize to lowercase.
2. **Native labels:** Update the `locales` array in `index.tsx` to include `{ code: 'es', label: 'Español' }`, `{ code: 'pt-BR', label: 'Português (Brasil)' }`, `{ code: 'fr', label: 'Français' }`, `{ code: 'de', label: 'Deutsch' }`.
3. **Detection algorithm:** Generalize `detectLocale()` to (a) try exact case-insensitive match against registered locale codes, (b) if input has a hyphen, try the base language (before `-`) as exact match, (c) if base doesn't match exactly, find a unique registered locale whose lowercased code starts with `{base}-` (handles `pt` → `pt-BR`), (d) fall to `'en'`. This handles `pt-BR`, `de-AT` → `de`, `es-419` → `es`, `fr-CA` → `fr`, and `zh-CN` → `en`.
4. **Plural resolver:** Extend `pluralCategory()` in `translate.ts` with per-locale rules: `es` and `de` use `n === 1 ? 'one' : 'other'` (like English); `pt-BR` and `fr` use `(n === 0 || n === 1) ? 'one' : 'other'`; `ro` keeps its existing one/few/other logic; `en` unchanged. `PluralCategory` type stays `'one' | 'few' | 'other'` — no new categories needed.
5. **Catalog shape:** Each new catalog (`es.ts`, `pt-BR.ts`, `fr.ts`, `de.ts`) is typed as `satisfies Catalog`, so TypeScript rejects missing or extra keys at compile time. Plural groups must include `_one`, `_few`, and `_other` leaves even if `_few` is never selected (to match the English catalog shape, which includes `_few` for Romanian compatibility). New catalogs duplicate `_other` into `_few` (like English does).
6. **Translation quality:** Translations are natural native UI copy, not literal word-for-word. Product names (Sparkkeep, Obsidian, Notion, Joplin, Telegram, Discord, Slack, Zapier, n8n, Make, Raycast, Claude, Cursor, Zed, GitHub, Ko-fi, WhatsApp, iOS, Android, Chrome, Firefox, Safari, Edge, Brave) and third-party labels stay verbatim per existing policy. Placeholders (`{{count}}`, `{{name}}`, `{{id}}`, etc.) are preserved exactly.
7. **Test generalization:** Refactor `catalogParity.test.ts` and `localeCoverage.test.tsx` to iterate every registered catalog in the `catalogs` map, not hardcoded `en`/`ro` pairs. Add a new `placeholderParity.test.ts` that walks every leaf in every non-English catalog and asserts the `{{placeholders}}` match English. Refactor `plural.test.ts` to test plural rules for every registered locale.
8. **Component render tests:** Each new locale includes at least one test (e.g., `LanguageSelector.test.tsx` or a new locale-specific smoke test) that renders a component wrapped in `<LocaleProvider locale="<code>">` and asserts translated text appears in the DOM.
9. **No backend changes:** `user_profile.language` still controls AI output. UI locale is frontend-only, stored in `localStorage`, not synced to the backend.
10. **No new dependency:** Pure TypeScript + React. No `react-i18next`, `next-intl`, or similar.

## Testing Decisions

1. **Generalized catalog parity test:** `catalogParity.test.ts` iterates every registered catalog (from the `catalogs` map in `index.tsx`) and asserts every leaf key exists in English and vice versa, with non-empty string values. One test suite, not one per locale.
2. **Generalized locale coverage test:** `localeCoverage.test.tsx` renders `<AllTranslations />` wrapped in `<LocaleProvider locale="<code>">` for every registered locale and asserts every key returns a non-empty translation (not the raw key). One test suite, not one per locale.
3. **Placeholder parity test:** New `placeholderParity.test.ts` walks every leaf in every non-English catalog and extracts `{{placeholders}}` via regex, then asserts they match English. Catches dropped or renamed interpolation variables.
4. **Plural tests per locale:** `plural.test.ts` extends `pluralCategory` test cases to cover `es`, `pt-BR`, `fr`, `de` with representative counts (0, 1, 2, 19, 20, 101, 120). Adds `translatePlural` assertions for each locale using actual catalog data.
5. **Component render test per locale:** Each new locale includes at least one test rendering a real component (e.g., `LanguageSelector`, `ThemeSelector`, or a shell header) with that locale active and asserting translated text appears. Proves the hook integrates end-to-end.
6. **Zero console warnings:** All new tests pass with zero warnings (CODING_STANDARDS §3).
7. **`make check` green:** All CI invariants pass: `gofmt`, `go vet`, `go test -race`, `npm run lint`, `npm test`, embedded `internal/web/dist` freshness.

## Out of Scope

- Backend channel/digest message localization (Telegram, Discord, Slack, OpenClaw notification text).
- AI output language control (already handled by `user_profile.language`).
- RTL layout support (no Arabic/Hebrew targeted).
- Rewriting existing date/number formatters to use the new `Intl` helpers.
- Adding locales beyond the four in this wave (Arabic, Russian, Hindi, CJK languages).
- Backend API changes to store the UI locale.
- Translating persisted playbook seed data or third-party UI labels (they stay in English by design).

## Further Notes

- The `satisfies` trick requires TypeScript 4.9+ (already satisfied).
- Adding a future locale is a single-file addition plus one `import` in the provider's `catalogs` map — no component edits, no test edits (tests iterate the map).
- The language selector in Appearance should show native labels (Español, Português (Brasil), Français, Deutsch) and visually indicate the current locale with a checkmark.
- The i18n module remains tree-shakable: unused keys are still bundled (string catalogs are small), but the `t()` function does not pull in unused code.
- Compound locale codes like `pt-BR` follow BCP-47 casing in the type and UI, but storage and comparison normalize to lowercase to avoid mismatches.
- The detection fallback chain (exact → base → unique prefix → English) ensures users with regional browser variants (fr-CA, de-AT, es-419) see the closest available locale without manual configuration.
