# 06: End-to-End Verification Gate & Build Freshness

**What to build:** Run the Vitest test suite (`npm run test`), execute the production build (`npm run build`) to synchronize `internal/web/dist`, and verify the complete CI gate with `make check` (linting, tests, dist freshness, Go race tests).

**Blocked by:** 05: Light Mode Visual Polish, Token Enforcement & Contrast Remediation

**Status:** resolved

- [x] All Vitest unit and component tests pass cleanly.
- [x] Production frontend build completes with zero errors.
- [x] Distribution bundle in `internal/web/dist` is fresh and committed.
- [x] `make check` passes all CI invariants.
