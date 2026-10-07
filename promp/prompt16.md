# Prompt 16 — Pro gating, report feedback & pipeline metrics, docs alignment

**Type:** Feature + Docs · **Size:** M · **Depends on:** 14

## Context
`license.FeatureDeepResearchV2` is defined but never checked, while the README sells
"Autonomous Deep Research Agent v2" as Pro. There is no way to know whether reports
are useful or how the funnel performs (captures → researched → doing).

## Goal
The free/pro boundary is real, honest and enforced server-side; the team can measure
whether the pipeline delivers value.

## Scope
**Gating** (server-side checks via `HasCapability`, UI shows lock + upsell to `LicenseModal`):
| Community | Pro (`deep_research_v2`) |
|---|---|
| Triage Brief | Custom playbooks (create/edit/duplicate) + step library |
| Built-in "Claim check only" + a **Default (lite)** variant: `ground, resolve_refs, search, read, report` | Full Default playbook (plan, verify, landscape, verdict) |
| Single model for all roles | Per-role model routing |
| — | Batch/scheduled research (Prompt 17), Personal fit step |

- Existing user playbooks stay readable after a license lapses but can't be run/edited (clear message). Never delete user data.
- 402/403 responses with a machine-readable `feature` field; UI maps it to the upsell.

**Feedback & metrics**
- 👍/👎 + optional comment on each research report (stored on the run).
- Local-only metrics endpoint `GET /api/v1/metrics/pipeline`: captures, triage decisions by action, median time-in-inbox, research conversion %, runs by playbook, success/failure rate by step, 👍 ratio, avg tokens per role. Simple dashboard card in Digest view.
- No telemetry leaves the instance.

**Docs**
- README feature table and wording updated to what actually ships ("Research Playbooks", no "autonomous agent" claim).
- `docs/design.md` sections 4 & 6 rewritten for two-stage pipeline, captures, playbooks, model roles.

## Acceptance criteria
- Community instance: creating a playbook via API returns 403 with `feature: deep_research_v2`; research uses Default (lite); role mapping is ignored (default profile used).
- Pro instance: everything unlocked; lapsing license keeps data readable.
- Feedback persists and is reflected in metrics.
- README/design reviewed by PO.

## Testing
License-matrix tests (community/pro/lapsed) across API endpoints and runner; metrics
aggregation tests on seeded DB; frontend type-check/build.
