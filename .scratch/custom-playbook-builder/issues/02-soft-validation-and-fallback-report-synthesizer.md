# 02: Soft Validation & Fallback Report Synthesizer

**What to build:**
Relax rigid ordering validation in `internal/research/playbook.go` so ordering rules (e.g. `read` after `search`) do not fail HTTP requests with 400 Bad Request errors. In `internal/research/research.go`, add a Fallback Report Synthesizer so that if a playbook omits an explicit `report` step, the runner automatically aggregates all executed step outputs (custom headings, findings, verdict, claims) into a structured Markdown report instead of failing with `ErrEmptyReport`.

**Blocked by:**
None (can start immediately)

**Status:** ready-for-agent

- [ ] Relax `ValidatePlaybook` in `internal/research/playbook.go` to enforce only structural invariants (name required, 1-12 steps, valid kinds, char caps). Remove hard block on `read` without `search`.
- [ ] Add `FallbackReportSynthesizer` in `internal/research/research.go` that runs if no step produced output for `"report"`, stitching all step findings into a valid Markdown briefing.
- [ ] Ensure `ErrEmptyReport` is only returned if genuinely no content was produced.
- [ ] Add unit tests in `internal/research/research_test.go` and `internal/research/playbook_test.go` confirming execution without explicit report step produces valid report.
