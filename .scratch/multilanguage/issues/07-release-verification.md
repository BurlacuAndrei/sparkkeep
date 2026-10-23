# 07: Release Verification and Documentation

**What to build:**
A full audit to verify zero untranslated user-facing strings remain in the frontend, a README section documenting how to add a new locale, and a coordinated version bump to 0.9.1 in both version.go and frontend/package.json. The frontend distribution must be rebuilt and committed to internal/web/dist. All CI checks must pass.

**Blocked by:** 03-settings-area, 04-card-surfaces, 05-research-digest-playbooks, 06-shell-and-common

**Status:** ready-for-agent

- [ ] Full audit confirms zero hardcoded user-facing English strings remain in frontend/src (excluding test files and comments)
- [ ] README.md includes a section documenting how to add a new locale (catalog file creation, key parity, provider registration)
- [ ] Version bumped to 0.9.1 in version.go
- [ ] Version bumped to 0.9.1 in frontend/package.json
- [ ] Frontend rebuilt with `npm run build`
- [ ] `internal/web/dist` committed with rebuilt frontend assets
- [ ] `make check` passes with zero warnings
- [ ] All acceptance criteria from tickets 01-06 verified complete
