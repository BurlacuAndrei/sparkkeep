# 03: BYOK `digest_synthesis` Role & Persistent Executive Retrospective

**What to build:** Register **`digest_synthesis`** (*"Digest & Retrospective Synthesis"*) as a configurable BYOK role in Platform Preferences (`AI Engine` -> `Model Routing` and `Token Caps`, falling back to the Default BYOK profile when unassigned), upgrade `POST /api/v1/digest/synthesize` to ground its synthesis in the user's `UserProfile` and **Output Language** while returning and persisting a structured 5-part **Executive Retrospective** per window (`7d`, `14d`, `30d`), and render the **Executive Retrospective** with a read-only model badge, `wins_narrative`, and **Next-Period Focus** cards featuring a 1-click **Start Now (`in-progress`)** action.

**Blocked by:** 01: Dynamic Window Identity, Widescreen 3-Column Canvas & Accomplishment Telemetry

**Status:** completed

- [x] `digest_synthesis` is registered in the backend LLM Router (`DefaultTokenCaps["digest_synthesis"] = 4096`, falling back to the Default profile when unassigned) and exposed in Platform Preferences (`AI Engine` -> `Model Routing` and `Token Caps`).
- [x] `POST /api/v1/digest/synthesize` routes through the `digest_synthesis` role client, grounds the prompt in `UserProfile` + **Output Language**, returns the 5-part **Executive Retrospective** (`briefing`, `wins_narrative`, `themes`, `next_focus`, `model`, `generated_at` with deterministic heuristic fallback when no LLM key is configured or inference fails), and persists the result under `digest_synthesis_<days>` so `GET /api/v1/digest` returns it automatically across tab switches.
- [x] The **Executive Retrospective** card in Column 1 displays the read-only `model` and `generated_at` badge, triggers synthesis via button click or the `s` keyboard shortcut, renders `briefing` and `wins_narrative`, and renders up to 3 **Next-Period Focus** recommendations (`next_focus`) each with a 1-click **Start Now** button that transitions the card to `in-progress` (with Undo).
- [x] Omnichannel digest pushes (`POST /api/v1/digest/push`) and Markdown exports automatically include the persisted `briefing` and `wins_narrative` when available.
- [x] All new UI and settings keys are localized across all 8 Interface Locales and covered by backend (`web_test.go`, `router_test.go`) and frontend (`DigestView.test.tsx`, `AIProfileTab.test.tsx`) tests.
