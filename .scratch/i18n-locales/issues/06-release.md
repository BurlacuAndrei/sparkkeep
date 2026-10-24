# 06: Release 0.9.2

**What to build:** Bump version to 0.9.2 across `version.go`, `frontend/package.json`, and `package-lock.json`. Add a CHANGELOG.md entry for 0.9.2 documenting the four new locales (Spanish, Portuguese-Brazil, French, German). Update README.md localization section to list all six supported languages and reflect the generalized adding-a-locale workflow. Rebuild frontend dist (`npm run build`), commit `internal/web/dist`, and verify `make check` passes all CI invariants.

**Blocked by:** 02-spanish, 03-portuguese-brazil, 04-french, 05-german

**Status:** done

- [x] Update `version.go` to `const Version = "0.9.2"`.
- [x] Update `frontend/package.json` to `"version": "0.9.2"`.
- [x] Update `frontend/package-lock.json` to `"version": "0.9.2"` (top-level and any nested references).
- [x] Add CHANGELOG.md entry under `## [Unreleased]` or create `## [0.9.2] - <date>` section:
  - Document addition of four new UI locales: Spanish (Español), Portuguese-Brazil (Português (Brasil)), French (Français), German (Deutsch).
  - Note generalized detection algorithm supporting compound locale codes (pt-BR, de-AT, es-419, fr-CA).
  - Note generalized test suite iterating all registered catalogs.
- [x] Update README.md "Localization" section to list all six supported languages: English, Romanian, Spanish, Portuguese (Brasil), French, German.
- [x] Update README.md "Adding a locale" steps to reflect the generalized test workflow (tests now iterate the `catalogs` map, no per-locale test edits required).
- [x] Run `cd frontend && npm run build` to rebuild production assets.
- [x] Verify `internal/web/dist` is synchronized with the rebuilt frontend (commit if changed).
- [x] Run `make check` and verify all CI invariants pass: `gofmt`, `go vet`, `go test -race`, `npm run lint`, `npm test`, embedded dist freshness.
- [x] Commit version bumps, CHANGELOG, README, and `internal/web/dist`.

## Resolution

Sparkkeep 0.9.2 shipped with six complete UI locales.

- `version.go`: `const Version = "0.9.2"`.
- `frontend/package.json` and `frontend/package-lock.json` (top level and `packages[""]`): `0.9.2`.
- `CHANGELOG.md`: `## [0.9.2] - 2026-10-24` section — four new locales, per-locale plural rules, regional detection (`pt` → `pt-BR`, `de-AT` → `de`, `es-419` → `es`, `fr-CA` → `fr`), plural-aware counts.
- `README.md`: localization section lists all six languages as complete, documents resolver fallback for unregistered languages, names the five catalog files, and the adding-a-locale steps state that parity, coverage, and placeholder tests iterate every registered catalog.
- `.scratch/multilanguage/SPEC.md`: Wave 2 pointer to `.scratch/i18n-locales/`.
- `internal/web/dist`: rebuilt by `make check`; no diff, already synchronized.

Verification (`make check`, exit 0):

- `gofmt -w .` clean; `go vet ./...` clean.
- `npm run lint` (oxlint) clean.
- `npm test`: 31 test files, 278 tests passed.
- `npm run build` (tsc -b + vite) succeeded; embedded dist freshness satisfied.
- `go test -race ./...`: all packages ok.

Final qwen review verdict: **SHIP**.

Commit: `chore(release): ship six-locale UI in 0.9.2`
