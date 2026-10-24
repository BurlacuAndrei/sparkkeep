# 04: French (fr) Catalog

**What to build:** Full French translation of the English catalog in `frontend/src/i18n/fr.ts`, typed as `satisfies Catalog` with every English leaf translated to natural native UI copy. Preserve all placeholder, product/third-party names verbatim. Include `_one`/`_few`/`_other` plural leaves (duplicate `_other` into `_few`). Add at least one component render test asserting real translated text in French locale.

**Blocked by:** 01-multilocale-core

**Status:** done

- [x] Create `frontend/src/i18n/fr.ts` exporting a `satisfies Catalog` object with the same shape as `en.ts`. Translate every leaf to natural French UI copy (not literal word-for-word).
- [x] Preserve all `{{placeholders}}` exactly as they appear in English.
- [x] Keep product/third-party names verbatim: Sparkkeep, Obsidian, Notion, Joplin, Telegram, Discord, Slack, Zapier, n8n, Make, Raycast, Claude, Cursor, Zed, GitHub, Ko-fi, WhatsApp, iOS, Android, Chrome, Firefox, Safari, Edge, Brave.
- [x] Include `_one`, `_few`, and `_other` plural leaves for every plural group. Duplicate `_other` into `_few` (French uses one/other, never few).
- [x] Register the catalog in the `catalogs` map in `frontend/src/i18n/index.tsx`: add `fr` import and entry.
- [x] Add at least one component render test (e.g., `LanguageSelector.test.tsx`, `ThemeSelector.test.tsx`, or a shell header smoke test) wrapped in `<LocaleProvider locale="fr">` that asserts real translated French text appears in the DOM.
- [x] Verify `catalogParity.test.ts` covers `fr` (generalized test iterates all catalogs).
- [x] Verify `localeCoverage.test.tsx` covers `fr` (generalized test iterates all locales).
- [x] Verify `placeholderParity.test.ts` covers `fr` (placeholder extraction matches English).
- [x] Run `cd frontend && npm test` and verify zero warnings.
- [x] Run `npm run build` and verify no errors.
- [x] Commit `frontend/src/i18n/fr.ts` and test file(s).

## Resolution

French catalog live, 1,944 leaves matching English exactly.

- `frontend/src/i18n/fr.ts`: full French translation, `satisfies Catalog`, all `{{placeholders}}` and product names preserved, `_one`/`_few`/`_other` plural leaves present.
- `frontend/src/i18n/index.tsx`: `fr` imported and registered in `catalogs`; selector label is `Français`; `detectLocale()` maps `fr` and `fr-CA` to this catalog.
- `frontend/src/i18n/__tests__/localeRendering.test.tsx`: renders `ThemeSelector` under `<LocaleProvider locale="fr">` and asserts `Mode sombre` / `Mode clair`, with the English strings absent.

Verification:

- Leaf count parity: en/es/ro/pt-BR/fr/de all 1,944 leaves; `catalogParity.test.ts` fails on any gap.
- `placeholderParity.test.ts`, `localeCoverage.test.tsx`, `plural.test.ts` iterate every registered catalog, so `fr` is covered, including its `n === 0 || n === 1` plural rule.
- `npx tsc --noEmit` and `npm run lint` pass.
- Full frontend suite: 278/278 tests pass (i18n suite: 86).
- `npm run build` succeeds; `internal/web/dist` rebuilt.

Note: the release commit `feat(i18n): add Spanish, Portuguese, French, and German catalogs` covers all four catalogs (tickets 02, 03, 04, 05) plus the shared `index.tsx` registration and render test.

Commit: `<hash>`
