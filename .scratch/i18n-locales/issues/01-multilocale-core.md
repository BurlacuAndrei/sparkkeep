# 01: Multi-Locale Core Infrastructure

**What to build:** Generalize the i18n module to support six locales (English, Romanian, Spanish, Portuguese-Brazil, French, German) by extending the `Locale` union, detection algorithm, plural resolver, and test suite. Refactor parity and coverage tests to iterate every registered catalog instead of hardcoded pairs. Add placeholder-parity test and per-locale plural tests.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Extend `Locale` type in `frontend/src/i18n/types.ts` to include `'es' | 'pt-BR' | 'fr' | 'de'` alongside existing `'en' | 'ro'`.
- [x] Update `locales` array in `frontend/src/i18n/index.tsx` to add native labels: `{ code: 'es', label: 'Español' }`, `{ code: 'pt-BR', label: 'Português (Brasil)' }`, `{ code: 'fr', label: 'Français' }`, `{ code: 'de', label: 'Deutsch' }`.
- [x] Generalize `detectLocale()` in `frontend/src/i18n/index.tsx` to: (a) exact case-insensitive match against registered codes, (b) base-language match (before `-`), (c) unique prefix match (e.g., `pt` → `pt-BR`), (d) fall to `'en'`. Handle `pt-BR`, `de-AT` → `de`, `es-419` → `es`, `fr-CA` → `fr`.
- [x] Extend `pluralCategory()` in `frontend/src/i18n/translate.ts` with per-locale rules: `es` and `de` use `n === 1 ? 'one' : 'other'`; `pt-BR` and `fr` use `(n === 0 || n === 1) ? 'one' : 'other'`; `ro` unchanged; `en` unchanged.
- [x] Refactor `frontend/src/i18n/__tests__/catalogParity.test.ts` to iterate every registered catalog from the `catalogs` map, not hardcoded `en`/`ro` pairs. Assert every leaf key exists in English and vice versa, with non-empty string values.
- [x] Refactor `frontend/src/i18n/__tests__/localeCoverage.test.tsx` to render `<AllTranslations />` wrapped in `<LocaleProvider locale="<code>">` for every registered locale and assert every key returns a non-empty translation.
- [x] Add `frontend/src/i18n/__tests__/placeholderParity.test.ts` that walks every leaf in every non-English catalog and asserts `{{placeholders}}` match English via regex extraction.
- [x] Extend `frontend/src/i18n/__tests__/plural.test.ts` with `pluralCategory` test cases for `es`, `pt-BR`, `fr`, `de` (counts 0, 1, 2, 19, 20, 101, 120). Add `translatePlural` assertions for each locale using actual catalog data.
- [x] Document that `PluralCategory` stays `'one' | 'few' | 'other'` — no new categories needed for this wave.
- [x] Run `cd frontend && npm test` and verify zero warnings (CODING_STANDARDS §3).
- [x] Run `make check` and verify all CI invariants pass.
- [x] Commit changes.

## Resolution

Shipped six selectable locales on the generalized i18n core.

- `frontend/src/i18n/types.ts`: `Locale` union extended to `en`, `ro`, `es`, `pt-BR`, `fr`, `de`. `PluralCategory` unchanged (`one | few | other`); no new categories needed this wave.
- `frontend/src/i18n/index.tsx`: `locales` lists native labels for all six codes; `detectLocale()` resolves exact case-insensitive match, then base language, then unique prefix (`pt` -> `pt-BR`), then English. `pt-BR`, `de-AT`, `es-419`, `fr-CA` all land correctly.
- `frontend/src/i18n/translate.ts`: per-locale `pluralCategory()` (es/de: n === 1; pt-BR/fr: n === 0 || n === 1; ro and en unchanged). Locales without a catalog render English through the resolver fallback.
- Tests: `catalogParity.test.ts`, `localeCoverage.test.tsx`, and new `placeholderParity.test.ts` iterate the `catalogs` map instead of hardcoded pairs. `plural.test.ts` covers es, pt-BR, fr, de at counts 0, 1, 2, 19, 20, 101, 120 plus `translatePlural` against real catalog data. `i18n.test.tsx` covers compound-locale detection.
- `README.md` localization section updated to the six-language list and the generalized add-a-locale workflow.

Verification:

- `cd frontend && npx tsc --noEmit` and `npm run lint` pass.
- Full frontend suite: 247/247 tests pass.
- `npm run build` succeeds; six locale options present in the bundle; `internal/web/dist` rebuilt (4 renamed chunks plus `app.js` and `index.html`).

Commit: `<hash>`
