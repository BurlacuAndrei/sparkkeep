# Prompt 15 — User profile (personal fit) injected into both stages

**Type:** Feature · **Size:** M · **Depends on:** 6, 12

## Context
Both stages produce generic output ("this could be useful for developers"). A short
user profile turns it into advice *for this user* ("you run Postgres + n8n on a NAS;
this replaces a container"). This is cheap to build and highly perceptible.

## Goal
With a profile filled in, Triage's `why_care` / `worthiness` and Research's verdict
and Personal-fit step are explicitly tailored to the user; without one, behavior is
unchanged.

## Scope
- Profile (Settings → "About me"): `goals` (free text), `skills` (tags), `stack/tools`
  (tags), `interests` (tags), `constraints` (time/budget free text), `language`
  for outputs (default: same as source / English). Max ~1,500 chars total, enforced.
- Stored as a setting; exposed via settings API.
- Prompt injection: a compact "USER PROFILE" block appended to the Triage prompt and
  to `verdict` and `custom` steps (opt-out per custom step: `use_profile`). Clearly
  delimited and labelled as context, not instructions (prompt-injection hygiene).
- Activate the 👤 Personal fit library step (Prompt 13): fit score (1–5), why,
  what's missing (skills/tools), first step tailored to the user.
- Output language setting respected by both stages.
- Privacy note in UI: profile is stored locally and sent only to the configured LLM providers.

## Out of scope
Learning the profile automatically from behavior.

## Acceptance criteria
- With profile set, the triage prompt and verdict prompt contain the profile block (golden tests); without it, prompts are byte-identical to before.
- Personal fit step produces a fit score and references profile items.
- Output language switch yields prompts instructing that language.

## Testing
Prompt golden tests (with/without profile, language); settings API round-trip; length
validation; frontend type-check/build.
