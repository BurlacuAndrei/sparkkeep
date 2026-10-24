# 04: Non-Destructive Card Triage Brief Regeneration ("Regenerate Brief")

**What to build:** Keep existing Cards and Research Dossiers immutable when the user changes language, and provide an explicit, non-destructive **Regenerate Brief** action in the Card Modal (`POST /api/v1/cards/{id}/reanalyze`) that re-runs triage synthesis on the Card's stored source capture in the currently configured `Output Language` while preserving all user-curated state.

**Blocked by:** 03 (#52)

**Status:** ready-for-agent

- [ ] Changing `Interface Locale` or `Output Language` never automatically mutates or re-translates existing Cards, Tags, or Research Dossiers in the background.
- [ ] Backend exposes `POST /api/v1/cards/{id}/reanalyze` (`Service.ReanalyzeCard`), which re-runs triage analysis on the Card's stored capture (or reconstructs context from `SourceURL` / `SourceNote` / `Title` for `Subject Cards`) using the active taxonomy and current `UserProfile` (`Output Language`).
- [ ] Regenerating a Card's brief updates AI-synthesized fields (`Title`, `Summary`, `ExecutiveSummary`, `ValueProposition`, `TLDR`, `WhyCare`, `Claims`, `OpenQuestions`, `Worthiness`, `Signals`, `References`, `SuggestedHorizon`, `SuggestedTags`, `ProposedActions`) in place while strictly preserving user-owned state (`Status`, `Horizon`, user `Tags`, `CompletedActions`, `Comments`, and existing `Research` runs).
- [ ] Card Modal exposes a localized **Regenerate Brief** action button with loading state and completion toast feedback that refreshes the displayed Card in place.
- [ ] Automated backend and frontend integration tests verify non-destructive regeneration in a newly selected `Output Language` and confirm user-governed fields remain untouched.
