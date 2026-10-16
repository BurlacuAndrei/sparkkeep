# SPEC: Playbook Studio & Non-Destructive Taxonomy Cascade

**Triage Label:** `ready-for-agent`  
**Status:** Ready for Ticket Breakdown  
**Related Documents:** [GLOSSARY.md](file:///home/capitanfg/media-server/nas/sparkkeep/GLOSSARY.md), [ADR 0003](file:///home/capitanfg/media-server/nas/sparkkeep/docs/adr/0003-playbook-studio-workspace-and-non-destructive-taxonomy-cascade.md)

---

## Problem Statement

Users of SparkKeep find the existing Research Playbook management experience cumbersome, disorienting, and difficult to use. Specifically:
1. **The interface looks unpolished and uninspired**: Research Playbooks are confined inside a secondary tab of the Settings modal dialog, relying on drab forms, low-contrast cards, and cramped controls rather than feeling like a state-of-the-art AI research laboratory.
2. **The user experience is fragmented and hidden**: Finding playbooks requires digging through platform preferences. Once inside the editor, spatial hierarchy is weak: metadata, card types, and step lists are stacked without clear workflow continuity.
3. **Adding a custom step has high friction**: Inserting a step requires opening a detached multi-tab modal, selecting a blank step, hunting for the new item dumped at the bottom, expanding a dense accordion, and filling out six separate low-level technical fields.
4. **Domain Terminology Drift**: The legacy interface uses "Recipe" and "Playbook Archetypes", contradicting the project's canonical glossary (`_Avoid_: Research recipe, prompt chain, workflow graph`).
5. **Taxonomy Deletion Uncertainty**: Card Types are user-defined in platform preferences; when a user deletes a Card Type that is mapped to playbooks, there is no safety mechanism or impact warning, creating anxiety around accidental asset loss or broken routing.

---

## Solution

Promote Research Playbooks from a hidden settings tab to a dedicated, first-class top-level workspace view (**Playbook Studio**) in the main application navigation.

1. **Dedicated Workspace**: A distraction-free, full-width canvas that provides ample screen real estate for an interactive sequential Pipeline Timeline, real-time Research Health Inspector, and client-side Dry-Run prompt compilation.
2. **Visual Pipeline Timeline**: Step Primitives are presented as elevated node cards along a connected visual rail with stage badges, live tool policy chips (`🔍 Web Search` vs `🧠 Source Reasoning`), input/output indicators, and smooth reordering.
3. **In-Line Step Insertion & Quick-Add Palette**: Contextual `+` insertion lines between existing steps open an instant Quick-Add popover palette with typeahead filtering over the Step Primitive Library and a 1-click Blank Custom Step that immediately expands in place with pre-filled smart defaults and focused input.
4. **In-Place Focused Step Editor**: Expanding a step keeps the user anchored in the pipeline flow, providing prompt starters, live character counting, tool policy toggles, role bindings, and input source selectors.
5. **Playbook Template Gallery**: Replaces the old recipe modal with a browsable gallery of starter templates (Market Intelligence, Due Diligence, Academic Review, Rapid Fact-Check) showing step flow previews, 5-Pillar readiness tags, and token/latency budget estimates.
6. **Zero-Cost Client-Side Dry-Run Inspector**: A live preview panel in Playbook Studio allowing users to simulate variable bindings and inspect compiled prompt templates against any existing card with zero token consumption and zero latency.
7. **Non-Destructive Taxonomy Cascade**: A polite impact confirmation dialog when deleting a Card Type in Settings that lists affected playbooks and safely detaches the deleted type (or offers remapping), guaranteeing custom playbooks are never accidentally destroyed.

---

## User Stories

1. As an operator conducting research, I want to access Playbook Studio directly from the main header navigation, so that I don't have to navigate through platform settings to manage my research workflows.
2. As an operator designing a research playbook, I want to work in a full-width workspace without sidebar clutter, so that I have maximum horizontal space to visualize multi-step pipelines and inspect health metrics.
3. As an operator evaluating research pipelines, I want to view built-in and custom playbooks in a clean catalog with clear status badges, step counts, and quick actions, so that I can easily differentiate immutable system playbooks from custom workflows.
4. As an operator creating a custom playbook, I want to view my pipeline as an interactive sequential timeline with connecting rails, so that I immediately understand the execution order and data flow from Grounding to Report.
5. As an operator crafting a custom research step, I want to hover between any two existing steps and click an in-line `+` inserter, so that I can place the new step exactly where it belongs in the execution sequence without hunting.
6. As an operator adding a step, I want a Quick-Add Command Palette with instantaneous search across the Step Primitive Library and a 1-click "Blank Custom Step" option, so that I can add steps in seconds.
7. As an operator creating a blank custom step, I want the step to automatically expand in place with sensible defaults and auto-focus its Name/Heading field, so that I can immediately start writing prompt instructions.
8. As an operator tuning prompt instructions, I want quick-insert prompt starter chips and a live character counter, so that I can rapidly anchor instructions to research best practices without exceeding token limits.
9. As an operator configuring execution tools, I want an intuitive toggle between "Live Web Search" and "Source Reasoning", so that I can control whether external queries are executed or limited to existing sources.
10. As an operator choosing input bindings, I want clear checkbox pills for Capture Context, References, Sources, and Previous Steps, so that I can control precisely what context each Step Primitive receives.
11. As an operator exploring research strategies, I want a visual Playbook Template Gallery organized by research domain, so that I can clone tuned starter archetypes (e.g., Competitor Teardown, Due Diligence, Academic Review) with one click.
12. As an operator authoring a new pipeline, I want real-time feedback from the Research Health Inspector and 5-Pillar Model, so that I am alerted to missing retrieval or unverified claims before executing runs.
13. As an operator testing prompt changes, I want a zero-cost client-side Dry-Run Inspector to preview compiled prompt instructions against a selected card, so that I can verify variable interpolation without burning API credits.
14. As an administrator managing platform taxonomy in Settings, I want a safety warning when deleting a Card Type that is mapped to playbooks, so that I am informed which playbooks are affected.
15. As an administrator deleting a Card Type, I want the option to safely detach the type from mapped playbooks, so that my custom research playbooks remain intact and usable for general research.
16. As an operator with custom playbooks, I want to export and import playbooks via clean JSON format, so that I can back up and share my research workflows.

---

## Implementation Decisions

### 1. Architectural Layout & Navigation
- Add a top-level navigation item and view state for Playbook Studio in the primary header alongside Triage, Boards, and Digest.
- Render Playbook Studio in full-width mode (`no-sidebar`), dedicating horizontal canvas width to the dual-pane pipeline builder and health dock.
- Maintain a secondary "Open Playbook Studio" link/button in the Settings modal for discoverability.

### 2. Pipeline Sequencer & In-Line Step Inserter
- Transform the step list into a visual Pipeline Timeline with vertical connector rails, step position nodes, and stage badges.
- Introduce an in-line insertion handle that appears on hover between adjacent steps and at the end of the pipeline.
- Implement a floating Quick-Add Command Palette popover anchored to the insertion line, featuring:
  - Search filter input with keyboard navigation.
  - Curated Step Primitive templates categorized by stage.
  - "Blank Custom Step" action that immediately injects an editable step with pre-filled defaults.
- Automatically expand the newly inserted step into focused edit mode and focus its primary title input.

### 3. Step Primitive In-Place Editor
- Edit Step Primitives directly inline within the timeline rather than in a detached modal or sliding drawer, preserving surrounding pipeline context.
- Provide clean tabs/sections for:
  - Basic Info: Step Name & Report Section Heading.
  - Prompt Instructions: Textarea with quick prompt starter pills and 8,000 character limit counter.
  - Tool Policy & Execution: Web Search (with max queries cap 1–5) vs. Source Reasoning, and LLM Role binding.
  - Input Bindings: Checkbox chips for `capture`, `references`, `sources`, and `previous_steps`.
- Add a 1-click "Save to My Step Library" button stored in user templates.

### 4. Template Gallery & Terminology Purge
- Completely purge the term "Recipe" from all user-facing copy and internal symbols, replacing it with `Playbook Template`.
- Build a browsable Playbook Template Gallery modal showcasing:
  - Curated domain templates with visual icon, description, step sequence chain, and 5-Pillar readiness tags.
  - Built-in Playbooks with a 1-click "Clone Steps" action.

### 5. Client-Side Dry-Run & Prompt Inspector
- Implement a dedicated drawer or toggleable pane in Playbook Studio.
- Provide a card selector dropdown (listing captured cards or fallback to a realistic sample card).
- Compute variable substitutions locally (`{card_title}`, `{card_content}`, `{source_urls}`, `{previous_steps}`) and render the interpolated prompt text for each step with zero API calls.

### 6. Non-Destructive Taxonomy Cascade in Settings
- When deleting a Card Type chip in Settings, inspect all loaded playbooks for references to that type.
- If references exist, present an impact confirmation dialog:
  - Lists affected playbooks.
  - Defaults to "Detach Card Type from Playbooks" (non-destructive).
  - Automatically executes batch updates via the API to remove the type from the playbooks' `card_types` arrays, updating both settings and playbooks cleanly.

---

## Testing Decisions

### Seam Strategy
- **Primary Seam**: High-level component interaction testing via `@testing-library/react` and `vitest`.
  - Mount the top-level application and Playbook Studio components with mocked HTTP API handlers (`api.ts`).
  - Test real user flows from button click to rendered DOM updates without mocking internal state or private sub-components.
- **Settings Taxonomy Seam**: Component testing in `SettingsModal.test.tsx` verifying the deletion confirmation dialog, impact listing of playbooks, and batch update dispatching.

### Key Behaviors to Test
- Switching top-level view mode to Playbook Studio renders the studio workspace in full-width mode.
- Selecting "New Playbook" initializes a lean custom pipeline with default starter steps.
- Hovering/clicking the in-line `+` inserter between steps displays the Quick-Add palette and inserts the chosen step primitive at the exact target index.
- In-place step editor updates name, heading, prompt instructions, tool policy, and input bindings correctly.
- Dry-Run inspector compiles prompt templates client-side against mock cards.
- Deleting a card type associated with playbooks triggers the impact modal; confirming "Detach" invokes the playbook update API without deleting the playbooks.
- All existing tests in `PlaybookManager.test.tsx` and `SettingsModal.test.tsx` continue to pass without regressions.

---

## Out of Scope

- Modifying the backend database schema for playbooks or steps (the existing SQLite tables `playbooks` and `playbook_steps` already support arbitrary JSON step configs and card type arrays).
- Building an unconstrained 2D node-graph canvas (violates the deterministic sequential execution rule in [GLOSSARY.md](file:///home/capitanfg/media-server/nas/sparkkeep/GLOSSARY.md)).
- Tag-based dynamic playbook triggers (rejected in [ADR 0002](file:///home/capitanfg/media-server/nas/sparkkeep/docs/adr/0002-configurable-card-taxonomy-and-playbook-routing.md)).
- Direct live multi-LLM batch execution from the dry-run inspector (dry-run is intentionally client-side and zero-cost).

---

## Further Notes

- Maintains 100% backward compatibility with existing saved playbooks and database migrations.
- Follows all design aesthetic standards: dark-mode elegance, glassmorphism, fluid micro-animations, and responsive layout.
