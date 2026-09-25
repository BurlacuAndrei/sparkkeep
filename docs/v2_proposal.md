# Sparkkeep V2: The Action Engine Proposal

## 1. Vision & Concept
Sparkkeep transitions from a simple capture tool to a **"Do-it-later" Action Engine**. The goal is to provide the fastest bridge from an incoming media post (link, video, image, repo) to a concrete, triaged action item with an auto-generated concise research report.

## 2. Audit & Cross-Check 
Sparkkeep's current single Go binary architecture with SQLite is excellent for self-hosting. However, it lacks robust scraping for gated platforms and a rich web UI for rapid triage.
Compared to tools like Fabric.so, Readwise, and Notion:
- **Differentiator:** Sparkkeep is active (tasks & autonomous research) rather than passive (read-it-later or bookmarking).
- **Core Value:** The "So What?" report. When saving an item, the app automatically generates an executive summary, value proposition, and proposed actions.

## 3. Architecture Upgrades (V2)
To achieve this, the architecture will be upgraded in three specific areas:
1. **The "Report & Triage" Engine:** Upgrading the LLM prompt and SQLite schema to generate and store a structured "Briefing" (Executive Summary, Value Proposition, Proposed Actions) alongside distinct idea cards.
2. **Modern Web Dashboard:** Replacing the static HTML/Vanilla JS with a modern frontend framework (React/Vite or Svelte) embedded into the Go binary. This UI will focus on Tinder/Kanban-style rapid triage.
3. **Advanced Scraping:** Integrating a headless browser (e.g., `playwright-go`) to successfully extract text/images from Javascript-heavy and gated sites (e.g., Instagram, Facebook).

## 4. Execution Plan
To implement this cleanly, development is segmented into isolated scopes executed by AI subagents. The prompts to drive these agents are located in `./prompts`.

- **Agent 1:** Web Dashboard UI Upgrade (Frontend)
- **Agent 2:** LLM Pipeline & Schema Upgrade (Backend Core)
- **Agent 3:** Advanced Scraping Engine (Backend Integrations)
- **Gatekeeper:** Master orchestrator that coordinates the builds, parallel execution, and tests the end-to-end integration.
