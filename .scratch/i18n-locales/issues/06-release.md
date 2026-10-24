# 06: Release 0.9.2

**What to build:** Bump version to 0.9.2 across `version.go`, `frontend/package.json`, and `package-lock.json`. Add a CHANGELOG.md entry for 0.9.2 documenting the four new locales (Spanish, Portuguese-Brazil, French, German). Update README.md localization section to list all six supported languages and reflect the generalized adding-a-locale workflow. Rebuild frontend dist (`npm run build`), commit `internal/web/dist`, and verify `make check` passes all CI invariants.

**Blocked by:** 02-spanish, 03-portuguese-brazil, 04-french, 05-german

**Status:** ready-for-agent

- [ ] Update `version.go` to `const Version = "0.9.2"`.
- [ ] Update `frontend/package.json` to `"version": "0.9.2"`.
- [ ] Update `frontend/package-lock.json` to `"version": "0.9.2"` (top-level and any nested references).
- [ ] Add CHANGELOG.md entry under `## [Unreleased]` or create `## [0.9.2] - <date>` section:
  - Document addition of four new UI locales: Spanish (Español), Portuguese-Brazil (Português (Brasil)), French (Français), German (Deutsch).
  - Note generalized detection algorithm supporting compound locale codes (pt-BR, de-AT, es-419, fr-CA).
  - Note generalized test suite iterating all registered catalogs.
- [ ] Update README.md "Localization" section to list all six supported languages: English, Romanian, Spanish, Portuguese (Brasil), French, German.
- [ ] Update README.md "Adding a locale" steps to reflect the generalized test workflow (tests now iterate the `catalogs` map, no per-locale test edits required).
- [ ] Run `cd frontend && npm run build` to rebuild production assets.
- [ ] Verify `internal/web/dist` is synchronized with the rebuilt frontend (commit if changed).
- [ ] Run `make check` and verify all CI invariants pass: `gofmt`, `go vet`, `go test -race`, `npm run lint`, `npm test`, embedded dist freshness.
- [ ] Commit version bumps, CHANGELOG, README, and `internal/web/dist`.
