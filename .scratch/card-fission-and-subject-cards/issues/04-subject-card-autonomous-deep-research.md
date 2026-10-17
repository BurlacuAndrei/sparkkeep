# 04: Autonomous Deep Research Grounding for Subject Cards

**What to build:**
Triggering Deep Research on a Subject Card uses the card's Title, Summary, and User Comments as the core Research Thesis during research planning (`stepPlan`), generating targeted investigative web search queries across SearxNG to discover primary documentation, architecture trade-offs, and empirical benchmarks from scratch.

**Blocked by:** 03: In-Place Subject Card Triage Synthesis & Drawer Action

**Status:** ready-for-agent

- [ ] `stepPlan` in the research runner detects when a card lacks capture text or claims, treating the card's title, summary, and user comments as the core research thesis.
- [ ] Research planning prompt instructs the LLM to generate investigative web search queries focused on primary documentation, benchmarks, and counter-perspectives for the thesis.
- [ ] Deep Research compiles a full report with claim verification and competitive landscape from external web results without empty report errors.
- [ ] Integration tests in `internal/research` and `internal/e2e` verify autonomous research execution on Subject Cards.
