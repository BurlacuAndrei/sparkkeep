# Prompt 5 — Model routing: role → LLM profile

**Type:** Feature · **Size:** M · **Depends on:** —

## Context
Settings already supports multiple **LLM profiles** (`llm_profiles` setting, one
`is_default`; see `internal/web/web.go` ~L380-620 and `SettingsModal.tsx`). But the
backend uses a single `analyze.Client` (one base/key/model) for triage, vision and
research. Triage is high-volume/low-depth; research synthesis is low-volume/high-depth.
Using one model for both is either slow/expensive or shallow.

## Goal
Each pipeline role can run on a different profile, with sensible fallback to the
default profile, hot-reloaded without restart.

## Scope
- Roles: `triage`, `vision`, `research_plan` (planning/reading/extraction), `research_synthesis`.
- Setting `llm_roles`: `{ role: profile_id }`. Missing/invalid mapping → default profile.
- Backend: introduce an `LLMRouter` (or equivalent) that returns a configured client
  per role. `core.Service` uses `router.For(role)` instead of the single client.
  `UpdateLLMConfig` / settings save rebuilds the router.
- Per-call token caps configurable per role (defaults: triage 1024, vision 512,
  plan 1024, synthesis 4096).
- Settings UI: in the AI tab, a "Use for" section — one select per role listing
  profiles (+ "Default"). Show a short hint per role ("fast & cheap recommended" /
  "strongest model recommended").
- Env pre-seed kept working (`SPARKKEEP_LLM_*` = default profile).

## Out of scope
Cost estimation display (Prompt 11/16).

## Acceptance criteria
- With two profiles A (default) and B, mapping `research_synthesis→B` sends synthesis requests to B's base URL/model and everything else to A (verified via two `httptest` servers).
- Deleting profile B falls back to default without errors.
- Changing mappings in Settings takes effect on the next request without restart.
- Fresh install with one profile behaves exactly as today.

## Testing
Router unit tests (fallbacks, deletion); core test asserting per-role endpoints; web
settings GET/PUT round-trip for `llm_roles`; frontend type-check.
