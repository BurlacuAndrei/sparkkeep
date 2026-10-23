# 07: Release Verification and Documentation

**What to build:**
A full audit to verify zero untranslated user-facing strings remain in the frontend, a README section documenting how to add a new locale, and a coordinated version bump to 0.9.1 in both version.go and frontend/package.json. The frontend distribution must be rebuilt and committed to internal/web/dist. All CI checks must pass.

**Blocked by:** 03-settings-area, 04-card-surfaces, 05-research-digest-playbooks, 06-shell-and-common

**Status:** done

- [x] Full audit confirms zero hardcoded user-facing English strings remain in frontend/src (excluding test files and comments)
- [x] README.md includes a section documenting how to add a new locale (catalog file creation, key parity, provider registration)
- [x] Version bumped to 0.9.1 in version.go
- [x] Version bumped to 0.9.1 in frontend/package.json
- [x] Frontend rebuilt with `npm run build`
- [x] `internal/web/dist` committed with rebuilt frontend assets
- [x] `make check` passes with zero warnings
- [x] All acceptance criteria from tickets 01-06 verified complete

## Resolution

Verified 2026-10-23 on branch `feat/multilanguage`.

Acceptance criteria evidence:

- Audit: no hardcoded user-facing English left in `frontend/src` (tests and
  comments excluded). Catalog parity and coverage tests enforce completeness.
- `README.md`: new "Adding a locale" section covers catalog file creation,
  key parity, and provider/catalog registration.
- `version.go`: `Version = "0.9.1"`.
- `frontend/package.json`: `"version": "0.9.1"` (lockfile updated to match).
- `npm run build` ran; `internal/web/dist` output byte-identical to HEAD, so no
  dist change was needed in this commit.
- `make check` exit 0:
  - gofmt clean, `go vet` clean
  - version check reports 0.9.1
  - lint zero warnings
  - 234 tests pass
  - frontend build succeeds
  - dist freshness guard passes
  - `go test -race` passes for all packages
