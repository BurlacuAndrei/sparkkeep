# Spec: Full-Screen Intelligence Digest Workspace — Widescreen Canvas, Period Wins Showcase, BYOK Executive Retrospective & Docked Inspector

**Triage Label:** `ready-for-agent`  
**Status:** Ready for Ticket Breakdown  
**Related Documents:** [GLOSSARY.md](file:///home/capitanfg/media-server/nas/sparkkeep/GLOSSARY.md), [CODING_STANDARDS.md](file:///home/capitanfg/media-server/nas/sparkkeep/CODING_STANDARDS.md)

---

## Problem Statement

Compared to the full-screen **Triage Deck** and the newly redesigned widescreen **Execution Board**, the current **Intelligence Digest** page feels trimmed, static, and disconnected from the user's real accomplishments and BYOK AI configuration:

1. **Trimmed Layout on Widescreen Displays:** Despite having no left sidebar, the Digest container is capped at `1180px` centered width, leaving nearly half of a `1920px–2560px` desktop monitor blank. Clicking any spark chip, research harvest row, or daily card launches a blocking modal overlay instead of opening a side-by-side **Board Inspector** pane.
2. **Static Window Identity ("Weekly" Hardcoding):** Users can switch the time window between `7`, `14`, and `30` days, yet the page title remains hardcoded to *"Weekly Intelligence Digest"* and the period comparison badge always reads *"WoW"* regardless of whether the user is reviewing a 7-day, 14-day, or 30-day horizon.
3. **Invisible Accomplishments (`CreatedAt` Filter Bug):** The backend digest query filters strictly by card creation timestamp (`CreatedAt`). Any card captured in a prior week that the user worked hard to complete (`done`), check off action steps on (`completed_actions`), or finish deep research on during the active window is completely excluded from `weekly_wins` and `research_harvest`.
4. **Understated Wins & Lack of Pride:** Completed cards are reduced to a single number in a KPI card, with no dedicated **Period Wins Showcase** celebrating shipped outcomes, total executed action steps, or a **Period Momentum Pulse** calibration. Meanwhile, the bottom of the page dumps raw daily captures into a vertical accordion.
5. **Shallow, Ephemeral Synthesis Bypassing BYOK Routing:** Clicking *Synthesize with AI* bypasses the BYOK role router (calling the raw triage client), ignores the user's `UserProfile` goals and configured **Output Language**, cannot be assigned to a dedicated model role in Platform Preferences, and loses its generated output the moment the user switches tabs.
6. **Passive Read-Only Report Instead of an Actionable Review Ritual:** The Digest does not help the user close loops or set up their next period—stale short-term warnings are non-interactive text banners, and there are no 1-click actions to promote recommended focus cards to `in-progress` or export period wins.

---

## Solution

Transform the trimmed Digest page into a full-screen, widescreen **Intelligence Digest** workspace that celebrates real period accomplishments, leverages the user's BYOK model routing for persistent **Executive Retrospectives**, and turns periodic review into an interactive ritual:

1. **Dynamic Window Identity (`7d` / `14d` / `30d`):**
   - Replace the native `<select>` dropdown with a tactile segmented pill switcher (`7d` · `14d` · `30d`, keyboard-accessible via `1` / `2` / `3`).
   - Dynamically adapt the workspace title (**Weekly Intelligence Digest**, **Biweekly Intelligence Digest**, **Monthly Intelligence Digest**) and period-over-period delta badges (`vs prior 7d`, `vs prior 14d`, `vs prior 30d`).
2. **Full-Screen Widescreen Canvas & Docked Board Inspector:**
   - Expand the Digest container up to `2400px` across a responsive **3-Column Intelligence Grid** on wide viewports (`>= 1280px`):
     - **Column 1 — Executive Retrospective & Emergent Themes Radar:** Persistent BYOK-synthesized narrative, Next-Period Focus recommendations, and interactive theme clusters.
     - **Column 2 — Period Wins Showcase & Momentum Pulse:** Dedicated celebration of shipped `done` cards (with period-over-period win delta), total executed action steps (`completed_actions`), the 5-state **Period Momentum Pulse**, and 1-click **Export Wins**.
     - **Column 3 — Deep Research Harvest & Strategic Health:** Completed research dossiers with verdict/confidence badges (`pursue` / `watch` / `skip`), Focus Horizon Balance meter, and an interactive Stale Bottleneck action bar.
   - Move the chronological **Day-by-Day Activity Timeline** into a clean, collapsible lower deck so it never crowds the primary intelligence canvas.
   - Integrate the non-blocking **Board Inspector** (`480px` docked right pane on viewports `>= 1200px`) whenever any card chip, win, harvest row, focus recommendation, or timeline card is clicked, with full keyboard parity (`1`/`2`/`3` window switch, `s` synthesize, `Escape` close inspector, `Enter`/`Space` expand to full modal).
3. **Accurate Accomplishment Accounting (`UpdatedAt` & Action Step Telemetry):**
   - Decouple accomplishment tracking from card capture date: any card transitioned to `done`, progressed via `completed_actions`, or completed in deep research (`research_state == 'done'` or `research_verdict != ''`) with `UpdatedAt` inside the selected window is included in **Period Wins**, **Executed Action Steps**, and **Research Harvest**, alongside `prev_wins` for accurate period-over-period win deltas.
4. **BYOK `digest_synthesis` Role & Persistent Executive Retrospective:**
   - Register **`digest_synthesis`** (*"Digest & Retrospective Synthesis"*, default `4096` token cap) as a first-class pipeline role in Platform Preferences (`AI Engine` -> `Model Routing` and `Token Caps`), automatically falling back to the Default BYOK profile when unassigned.
   - Upgrade `POST /api/v1/digest/synthesize` to route through the `digest_synthesis` BYOK client, ground its prompt in the user's `UserProfile` (goals, skills, stack, interests, constraints) and **Output Language**, and return a structured 5-part **Executive Retrospective**:
     1. `briefing`: Narrative synthesis connecting the period's captures and progress to the user's goals.
     2. `wins_narrative`: Proud highlight of closed loops (`done` cards, checked-off action steps, and research verdicts).
     3. `themes`: 2–4 emergent theme clusters (`title`, `summary`, `card_ids`).
     4. `next_focus`: Up to 3 recommended priority cards (`card_id`, `rationale`) from high-worthiness `to-do` / `inbox` / `pursue` cards, rendered with a 1-click **"Start Now (`in-progress`)"** button.
     5. `model` & `generated_at`: Displayed as a subtle read-only badge in the Retrospective header.
   - Persist the latest generated **Executive Retrospective** per window (`7d`, `14d`, `30d`) in the backend store so `GET /api/v1/digest` returns it immediately on load, and include the persisted retrospective and Period Wins in omnichannel pushes (Telegram, Discord, Slack, OpenClaw) and Markdown exports.

---

## User Stories

1. As a user on a widescreen desktop monitor, I want the **Intelligence Digest** to expand fluidly across the full width of the viewport (up to `2400px`) in a balanced multi-column layout, so that my screen real estate is utilized just as effectively as on the Execution Board and Triage Deck.
2. As a user switching the digest horizon between `7d`, `14d`, and `30d` via segmented pills (or keyboard shortcuts `1`, `2`, `3`), I want the page heading to dynamically update to **Weekly Intelligence Digest**, **Biweekly Intelligence Digest**, or **Monthly Intelligence Digest** and all delta badges to reflect the active window (`vs prior 7d/14d/30d`), so that the interface copy is always accurate.
3. As a user who captured a card two weeks ago and worked hard to complete it (`done`) or check off its action steps this week, I want that card and its completed steps included in this week's **Period Wins Showcase** and KPI counters, so that my real execution work is recognized regardless of when the link was first saved.
4. As a user who ran a Deep Research Playbook this week on an older card, I want that completed dossier included in this week's **Research Harvest**, so that all new intelligence generated during the period is surfaced.
5. As a user reviewing my passing week, biweekly sprint, or month, I want a dedicated **Period Wins Showcase** column that celebrates every card I moved to `done`, displays my period-over-period win delta, and tallies the total **Action Steps Executed** (`completed_actions`), so that I feel genuine pride in closing loops.
6. As a user viewing the **Period Wins Showcase**, I want to see a **Period Momentum Pulse** badge (*Execution Surge*, *Research Deep-Dive*, *Balanced Flow*, *Discovery & Capture*, or *Quiet Horizon*) with a clear explanation of my capture-to-completion balance, so that I get an encouraging, professional read on my workflow health without childish streak gimmicks.
7. As a user who wants to archive or share my completed work, I want a 1-click **Export Wins** action in the **Period Wins Showcase** that copies or downloads a clean Markdown summary of my completed outcomes and executed steps, so that I can paste it into team updates or personal logs.
8. As a user configuring BYOK models in Platform Preferences (`AI Engine` tab), I want a dedicated **Digest & Retrospective Synthesis (`digest_synthesis`)** role in the **Model Routing** and **Token Caps** sections that defaults to my Default BYOK profile when unassigned, so that I can optionally assign a frontier reasoning model specifically for periodic retrospectives.
9. As a user viewing the **Executive Retrospective** card in the Digest, I want to see a subtle read-only pill showing which BYOK model generated the synthesis and when it was generated, so that I have full transparency into the intelligence engine.
10. As a user clicking **Synthesize with AI** (or pressing `s`), I want the backend to ground the prompt in my `UserProfile` (goals, stack, interests, constraints) and my configured **Output Language**, so that the **Executive Retrospective** speaks directly to my priorities in my preferred language.
11. As a user who generates an **Executive Retrospective** and then switches to the Execution Board and back, I want the generated retrospective for that window (`7d`, `14d`, or `30d`) to remain persisted and load immediately without requiring me to re-run LLM inference.
12. As a user operating without an LLM API key configured (or when the LLM endpoint is unreachable), I want **Synthesize with AI** to fall back deterministically to a local heuristic retrospective (`briefing`, `wins_narrative`, `themes`, `next_focus`), so that the Digest remains 100% functional offline.
13. As a user reading the **Executive Retrospective**, I want to see up to 3 **Next-Period Focus** card recommendations (`next_focus`) with a 1-click **Start Now** button on each recommendation that transitions the card to `in-progress` (with Undo), so that my weekly review directly sets up my next week's execution.
14. As a user with short-term cards that have gone untouched (`stale_count > 0`), I want the Stale Bottleneck banner in the Strategic Health panel to provide 1-click **Inspect Stale** and **Batch-Shelve Stale** buttons, so that I can resolve bottlenecks immediately from the Digest.
15. As a user clicking any card chip in Emergent Themes, any win in the Period Wins Showcase, any dossier in Research Harvest, any Next-Period Focus recommendation, or any card in the Activity Timeline on a widescreen display (`>= 1200px`), I want the card to open in the non-blocking **Board Inspector** docked on the right side of the Digest workspace, so that I can inspect its dossier and check off action steps without losing my place in the Digest.
16. As a user inspecting a card in the docked **Board Inspector** inside the Digest, I want to toggle action checklist steps, switch between Brief and Research tabs, press `Enter` / `Space` (or click Expand) to open the full Card Modal, or press `Escape` to close the inspector, matching the exact ergonomics of the Execution Board.
17. As a user who wants to browse the chronological list of captured cards by day, I want the **Day-by-Day Activity Timeline** organized as a collapsible lower deck below the 3-column intelligence grid, so that the top of the workspace stays focused on high-signal synthesis and wins.
18. As a user pushing my Digest to Telegram, Discord, Slack, or OpenClaw (or exporting/downloading the Digest as Markdown), I want the outbound message and exported Markdown to include my persisted **Executive Retrospective** (`briefing` and `wins_narrative`) and **Period Wins**, so that shared digests are rich and comprehensive.
19. As a user operating Sparkkeep in any of the 8 supported Interface Locales (`en`, `ro`, `ru`, `de`, `es`, `fr`, `it`, `zh`), I want all titles, dynamic window labels, Momentum Pulse states, Period Wins Showcase copy, AI role settings, and action buttons to be 100% localized.

---

## Implementation Decisions

1. **Backend Digest Query & Accomplishment Accounting (`GET /api/v1/digest`):**
   - Expand card evaluation across the current window (`[now - days, now]`) and prior comparison window (`[now - 2*days, now - days]`):
     - **Captured Cards (`days`, `week_total`, `prev_total`, `wow_delta_percent`, `by_status`, `by_horizon`):** Continue grouping cards *captured* (`CreatedAt`) within the window for capture funnel and clearance rate metrics.
     - **Period Wins (`weekly_wins`, `prev_wins`, `wins_delta`):** Include any card with `Status == 'done'` whose `UpdatedAt` (or `CreatedAt` if `UpdatedAt` is zero) falls within the current window `[since, now]`, even if `CreatedAt < since`. Count prior-window `done` cards in `[prevSince, since)` as `prev_wins` to surface period-over-period win deltas.
     - **Executed Action Steps (`completed_actions_count`):** Sum `len(c.CompletedActions)` across all cards active or updated within `[since, now]` (`CreatedAt >= since || UpdatedAt >= since`).
     - **Research Harvest (`research_harvest`):** Include any card with `ResearchState == 'done'` or `ResearchVerdict != ''` whose `UpdatedAt` or `CreatedAt` falls within `[since, now]`.
     - **Stale Short-Term Cards (`stale_cards` & `stale_count`):** Return both `stale_count` and the slice of `stale_cards` (or IDs) for `short-term` cards in `inbox`, `to-do`, or `in-progress` untouched for `> 5` days so the frontend can inspect them directly in the docked inspector.
     - **Cached Synthesis (`synthesis`):** Look up the stored setting `digest_synthesis_<days>` (for `7`, `14`, `30` or custom `days`) and include the parsed `Executive Retrospective` object in the `GET /api/v1/digest` response if present.
2. **BYOK `digest_synthesis` Role Routing & Token Caps:**
   - Add `RoleDigestSynthesis = "digest_synthesis"` to the backend LLM router role constants, `AllRoles` slice, and `DefaultTokenCaps` (`4096` tokens).
   - When `Router.For(RoleDigestSynthesis)` is requested, the router resolves the profile mapped to `"digest_synthesis"` in `llm_roles`, or falls back automatically to the Default BYOK profile if unassigned.
   - Add `digest_synthesis` to `ROLE_DEFINITIONS` and `DEFAULT_TOKEN_CAPS` in the frontend AI settings tab so users can assign a specific BYOK profile and token cap in Platform Preferences (`SettingsModal` -> `AI Engine`).
3. **Structured `Executive Retrospective` Synthesis & Persistence (`POST /api/v1/digest/synthesize`):**
   - Route synthesis requests through `svc.ClientFor(analyze.RoleDigestSynthesis)` (falling back to `svc.Analyze`).
   - Load the user's `UserProfile` (`goals`, `skills`, `stack`, `interests`, `constraints`, `language`) and `interface_locale` fallback from the store so the prompt instructs the model to write in the user's **Output Language** and tailor insights and next-focus recommendations to their profile.
   - Prompt the model (and structure the deterministic heuristic fallback when no LLM is configured or when inference fails) to produce the 5-part JSON contract:
     ```ts
     interface DigestFocusRecommendation {
       card_id: number;
       title?: string;
       rationale: string;
     }

     interface DigestSynthesisResult {
       ok: boolean;
       briefing: string;
       wins_narrative?: string;
       themes?: DigestSynthesisTheme[];
       next_focus?: DigestFocusRecommendation[];
       model?: string;
       generated_at?: string;
     }
     ```
   - Persist the resulting JSON under setting key `digest_synthesis_<days>` in the store so subsequent `GET /api/v1/digest?days=<days>` requests return it automatically.
   - Enhance `pushDigest` (`POST /api/v1/digest/push`) and frontend Markdown generation (`buildDigestMarkdown`) to include the persisted `briefing`, `wins_narrative`, and `weekly_wins` when available.
4. **Deterministic `Period Momentum Pulse` State Machine:**
   - Compute the **Period Momentum Pulse** in a pure helper (`computeMomentumPulse`) from the digest telemetry:
     - `execution_surge`: `doneCount >= 3` or `(doneCount + completedActionsCount >= 5 && clearanceRate >= 70)`
     - `research_deep_dive`: `researchHarvestCount >= 2 && researchHarvestCount > doneCount`
     - `balanced_flow`: `clearanceRate >= 60 && (doneCount >= 1 || completedActionsCount >= 1)`
     - `discovery_capture`: `totalSparks > 0 && clearanceRate < 60`
     - `quiet_horizon`: `totalSparks === 0 && doneCount === 0 && researchHarvestCount === 0`
5. **Full-Screen Widescreen Layout, 3-Column Grid & Docked Inspector:**
   - Update `digest-brief.css` so `.digest-workspace-shell` spans `width: 100%; max-width: 2400px; margin: 0 auto; padding: 0 24px 48px;` with a flex/grid split when the right-hand **Board Inspector** (`BoardInspector`) is open (`width: clamp(380px, 30vw, 480px)` on viewports `>= 1200px`).
   - Replace the top window `<select>` with a segmented pill group (`7d` / `14d` / `30d`) and render the dynamic title (`Weekly` / `Biweekly` / `Monthly Intelligence Digest` for `7` / `14` / `30` days) and dynamic period-over-period delta badges (`vs prior 7d/14d/30d`).
   - Organize the main canvas on desktop (`>= 1280px`) into a 3-column grid (`.digest-widescreen-grid`, collapsing to 2 columns on `900px–1279px` and 1 column below `900px`):
     - **Column 1:** `Executive Retrospective` card (showing active model badge, `briefing`, `wins_narrative`, and `next_focus` cards with 1-click **Start Now** action) + `Emergent Themes Radar`.
     - **Column 2:** `Period Wins Showcase` card (showing the **Period Momentum Pulse** banner, `doneCount` with win delta, `completedActionsCount` pill, rich win cards with Horizon/Type/Verdict badges that open in the docked inspector on click, and a 1-click **Export Wins** button).
     - **Column 3:** `Deep Research Harvest` (showing verdict & confidence badges, clicking opens the dossier in the docked inspector) + `Strategic Health & Horizon Balance` (with interactive Stale Bottleneck buttons: **Inspect Stale** to select the first stale card into the docked inspector and filter to stale items, and **Batch-Shelve Stale** calling `api.batchShelveStaleCards(5)` with refresh & toast).
   - Render the **Day-by-Day Activity Timeline** in a collapsible lower deck below the 3-column grid so users can expand or fold chronological daily captures on demand.
6. **Keyboard Ergonomics in DigestView:**
   - When no input/textarea or modal overlay is focused:
     - `1`, `2`, `3`: Switch time window to `7d`, `14d`, `30d`.
     - `s`: Trigger **Synthesize with AI**.
     - `Escape`: Close the docked **Board Inspector** (or open dropdown menus).
     - `Enter` / `Space` (when a card is inspected in the docked inspector): Promote to the full `CardModal`.

---

## Testing Decisions

1. **External Behavior Only at High-Level Seams:**
   - Tests must assert observable HTTP API contracts, rendered DOM text/roles, user interactions, and emitted callbacks—never internal implementation details.
2. **Seam 1 — Backend HTTP API & Router Seam (`internal/web/web_test.go` & `internal/core/router_test.go`):**
   - Test `GET /api/v1/digest?days=7|14|30`: Verify that a card created outside the window (`CreatedAt < since`) but completed (`Status: done`, `UpdatedAt >= since`) or researched (`ResearchVerdict: pursue`, `UpdatedAt >= since`) is included in `weekly_wins`, `completed_actions_count`, and `research_harvest`.
   - Test `POST /api/v1/digest/synthesize`: Verify that synthesis routes through the `digest_synthesis` role client (falling back to default), injects `UserProfile` / `Output Language`, returns `briefing`, `wins_narrative`, `themes`, `next_focus`, `model`, and `generated_at`, persists the result in the store per window (`digest_synthesis_7`), and returns the cached synthesis on subsequent `GET /api/v1/digest` calls.
   - Test `GET /api/v1/settings` and `PATCH /api/v1/settings`: Verify that `digest_synthesis` is supported in `llm_roles` and `llm_token_caps`.
3. **Seam 2 — Frontend Digest Workspace & AI Settings Integration Seam (`DigestView.test.tsx` & `AIProfileTab.test.tsx`):**
   - Verify dynamic window title switching (*Weekly* / *Biweekly* / *Monthly Intelligence Digest*) via segmented `7d`/`14d`/`30d` pills and `1`/`2`/`3` keyboard shortcuts.
   - Verify the **Period Wins Showcase** renders completed `done` cards, `completed_actions_count`, the deterministic **Period Momentum Pulse** state, and 1-click **Export Wins**.
   - Verify **Executive Retrospective** displays cached or newly synthesized `briefing`, `wins_narrative`, `model` badge, and `next_focus` recommendations, and clicking **Start Now** promotes the card to `in-progress`.
   - Verify interactive Stale Bottleneck actions (**Inspect Stale** opening the card in the docked inspector and **Batch-Shelve Stale** invoking the API).
   - Verify clicking any card in Themes, Wins, Research Harvest, or Activity Timeline on desktop opens the non-blocking **Board Inspector** docked on the right, and `Escape` closes it.
   - Verify `AIProfileTab.test.tsx` renders the **Digest & Retrospective Synthesis** role in Model Routing and Token Caps.
4. **Seam 3 — Localization Catalog Parity Seam (`catalogParity.test.ts` & `placeholderParity.test.ts`):**
   - Verify 100% key and `{placeholder}` parity across all 8 supported locale catalogs (`en`, `ro`, `ru`, `de`, `es`, `fr`, `it`, `zh`).

---

## Out of Scope

- Consumer-gamification mechanics such as daily login streaks, XP leaderboards, or sound effects.
- Database schema (`CREATE TABLE` / `ALTER TABLE`) migrations—persisted synthesis uses the existing key-value `settings` store (`digest_synthesis_<days>`) and accomplishment metrics use existing `cards` columns (`status`, `completed_actions`, `research_verdict`, `research_state`, `created_at`, `updated_at`).
- Automated background cron scheduling for email newsletters (outbound digest pushes remain user-triggered or webhook/channel-driven).

---

## Further Notes

- Reuse the existing [`BoardInspector`](file:///home/capitanfg/media-server/nas/sparkkeep/frontend/src/components/board/BoardInspector.tsx) component directly inside [`DigestView.tsx`](file:///home/capitanfg/media-server/nas/sparkkeep/frontend/src/components/DigestView.tsx) so card inspection, inline checklist toggling, and dossier reading share a single canonical implementation across both full-screen workspaces.
