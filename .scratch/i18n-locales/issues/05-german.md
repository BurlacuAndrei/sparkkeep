# 05: German (de) Catalog

**What to build:** Full German translation of the English catalog in `frontend/src/i18n/de.ts`, typed as `satisfies Catalog` with every English leaf translated to natural native UI copy. Preserve all placeholders, product/third-party names verbatim. Include `_one`/`_few`/`_other` plural leaves (duplicate `_other` into `_few`). Add at least one component render test asserting real translated text in German locale.

**Blocked by:** 01-multilocale-core

**Status:** ready-for-agent

- [ ] Create `frontend/src/i18n/de.ts` exporting a `satisfies Catalog` object with the same shape as `en.ts`. Translate every leaf to natural German UI copy (not literal word-for-word).
- [ ] Preserve all `{{placeholders}}` exactly as they appear in English.
- [ ] Keep product/third-party names verbatim: Sparkkeep, Obsidian, Notion, Joplin, Telegram, Discord, Slack, Zapier, n8n, Make, Raycast, Claude, Cursor, Zed, GitHub, Ko-fi, WhatsApp, iOS, Android, Chrome, Firefox, Safari, Edge, Brave.
- [ ] Include `_one`, `_few`, and `_other` plural leaves for every plural group. Duplicate `_other` into `_few` (German uses one/other, never few).
- [ ] Register the catalog in the `catalogs` map in `frontend/src/i18n/index.tsx`: add `de` import and entry.
- [ ] Add at least one component render test (e.g., `LanguageSelector.test.tsx`, `ThemeSelector.test.tsx`, or a shell header smoke test) wrapped in `<LocaleProvider locale="de">` that asserts real translated German text appears in the DOM.
- [ ] Verify `catalogParity.test.ts` covers `de` (generalized test iterates all catalogs).
- [ ] Verify `localeCoverage.test.tsx` covers `de` (generalized test iterates all locales).
- [ ] Verify `placeholderParity.test.ts` covers `de` (placeholder extraction matches English).
- [ ] Run `cd frontend && npm test` and verify zero warnings.
- [ ] Run `npm run build` and verify no errors.
- [ ] Commit `frontend/src/i18n/de.ts` and test file(s).
