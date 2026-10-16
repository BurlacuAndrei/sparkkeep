# 03: Unified Local Verification Target (make check) in Makefile

**What to build:** Add a `check` target to the root Makefile that chains gofmt, go vet, frontend lint, frontend tests, frontend build, git diff --exit-code on internal/web/dist, and race-enabled Go tests, mirroring the exact CI requirements in a single command.

**Blocked by:** None (can start immediately)

**Status:** closed

- [x] `Makefile` contains a `.PHONY: check` target that executes formatting, vetting, frontend lint, frontend test, frontend build, dist sync check, and Go test suite.
- [x] Running `make check` locally runs cleanly to completion with exit code 0.
