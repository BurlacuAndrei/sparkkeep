# Localization

The UI offers six interface languages: **English** (default), **Romanian**,
**Spanish**, **Portuguese (Brasil)**, **French**, and **German**. All six have
complete catalogs, each with the plural forms its language needs. Users switch
language in **Settings → Appearance**; the choice persists in `localStorage`
under `sparkkeep_locale`. `<html lang>` follows the active locale.

On first run the browser language picks the locale: an exact match first (so
`pt-BR` resolves to Portuguese (Brasil)), then the base language (`es-419` → `es`,
`de-AT` → `de`, `fr-CA` → `fr`, `pt` → `pt-BR`), else English. A browser
language with no registered catalog renders English through the resolver fallback.

The frontend uses a small typed catalog module in
[`frontend/src/i18n/`](../frontend/src/i18n/): `en.ts` is the source of truth and
`ro.ts`, `es.ts`, `pt-BR.ts`, `fr.ts`, and `de.ts` hold the translations.
`index.tsx` exposes `LocaleProvider`, `useLocale()` (`t`, `tp`, `formatNumber`,
`formatDate`), and the formatting helpers.

The selected interface locale is persisted server-side and also drives the
**Output Language** for triage briefs, research dossiers, and digest
retrospectives. Canonical card types resolve localized aliases, so an existing
taxonomy keeps routing to the right playbook even when the UI language changes.

## Adding a locale

1. Create `frontend/src/i18n/<code>.ts` exporting a `satisfies Catalog` object
   with the same shape as `en.ts`. TypeScript rejects missing or extra keys at
   compile time.
2. Add the code to the `Locale` union in `frontend/src/i18n/types.ts`.
3. Register the catalog in the `catalogs` map in `frontend/src/i18n/index.tsx`,
   and add a `locales` option (code plus native-language label). Check that
   detection maps the new code in `BASE_LANGUAGE` when it has no exact browser
   match.
4. Add the locale's plural rules to `pluralCategory` in
   `frontend/src/i18n/translate.ts` and cover them in `plural.test.ts`. Parity,
   coverage, and placeholder tests iterate every registered catalog, so they need
   no edits.
5. Run `cd frontend && npm test` and `npm run build`; commit the rebuilt
   `internal/web/dist`.

Persisted playbook seed data and third-party UI labels stay in English by design
(see the `shortcut:` comments where relevant). Card copy is persisted in the
locale that was active when it was written.
