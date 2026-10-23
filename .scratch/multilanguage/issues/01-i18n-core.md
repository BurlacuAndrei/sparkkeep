# 01: i18n Core Infrastructure

**What to build:**
A typed internationalization module that provides a React context and hook for translating UI strings. The system must include a TypeScript-typed English dictionary as the source of truth, a `LocaleProvider` that wraps the app shell, a `useLocale()` hook that returns a `t()` function for key lookup with `{{placeholder}}` interpolation, and `Intl`-based formatters for numbers and dates. The provider must be wired into the app shell alongside the existing theme provider, and unit tests must verify the `t()` function, interpolation, and formatters work correctly.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Typed English dictionary exists with dotted namespace keys (common, settings, cards, research, triage, errors, playbooks)
- [x] `LocaleProvider` wraps app shell in `App.tsx` alongside `ThemeProvider`
- [x] `useLocale()` hook returns `{ t, locale, setLocale, locales }` and provides context to components
- [x] `t(key, vars?)` function looks up keys and interpolates `{{placeholder}}` values
- [x] `formatNumber(n)` and `formatDate(d)` helpers use `Intl.NumberFormat(locale)` and `Intl.DateTimeFormat(locale)`
- [x] Unit tests verify `t()` lookup, interpolation with variables, and formatter output
- [ ] `make check` passes with zero warnings (pre-existing lint warning in CardModal.tsx, not introduced by this ticket)

## Resolution

**Commit:** `<pending — recorded in commit history for feat(i18n): add typed locale provider and translation core>`

**Delivered:**

- `frontend/src/i18n/types.ts` — `Locale`, `Catalog`, `TranslationKey`, `TranslateFn` types derived from the English catalog.
- `frontend/src/i18n/en.ts` — typed English dictionary across the seven namespaces.
- `frontend/src/i18n/translate.ts` — key lookup plus `{{placeholder}}` interpolation.
- `frontend/src/i18n/index.tsx` — `LocaleProvider`, `useLocale()`, `locales`, `formatNumber`, `formatDate`; locale persisted under `sparkkeep_locale` and mirrored to `document.documentElement.lang`.
- `frontend/src/App.tsx` — `LocaleProvider` mounted inside `ThemeProvider`.
- `internal/web/dist/**` — rebuilt production bundle containing the i18n module.

**Test evidence:**

- Frontend suite: 197/197 tests pass, including `frontend/src/i18n/__tests__/i18n.test.tsx` (lookup, interpolation, formatters).
- Go race suite: pass.
- `make check`: lint, test, build, dist freshness and Go race invariants pass. The only lint finding is the pre-existing `CardModal.tsx:69` warning noted above.

**Process:** Reviewer verdict PASS. Not pushed; branch `feat/multilanguage` holds the commit.
