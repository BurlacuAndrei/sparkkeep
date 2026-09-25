# Prompt 05 — Parse Research Report Template Once

## Goal
Move the `template.Parse` call for the research report HTML from per-request to init time.

## Problem
`getResearch()` in `internal/web/web.go` (line 392) parses the `researchReportHTML` template on **every** GET request. This is wasteful and can never change between requests.

## Changes Required

1. **`internal/web/web.go`**:
   - Add a package-level parsed template: `var researchTmpl = template.Must(template.New("research").Parse(researchReportHTML))`
   - In `getResearch()`, replace the per-request `template.New(...).Parse(...)` block with `researchTmpl.Execute(w, row)`
   - Remove the error handling for template parse (it now panics at init via `template.Must`, which is correct for a compile-time constant)

## Acceptance Criteria
- Template is parsed exactly once at program startup
- `getResearch()` uses the pre-parsed template
- All tests pass

## Severity: MEDIUM
