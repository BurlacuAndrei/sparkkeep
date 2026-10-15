# SparkKeep Research Engine

The bounded, deterministic intelligence engine that captures context, investigates claims across the web, and produces verified briefing reports.

## Language

**Research Playbook**:
A deterministic, ordered sequence of execution steps configured to investigate a topic or card.
_Avoid_: Research recipe, prompt chain, workflow graph

**Built-in Playbook**:
An immutable, system-seeded research playbook that cannot be edited directly, but can be cloned.
_Avoid_: Hardcoded playbook, system recipe

**Custom Playbook**:
A user-defined research playbook created from scratch or cloned from a built-in playbook, with fully editable steps and instructions.
_Avoid_: Custom recipe, user workflow

**Step Primitive**:
A modular unit of research execution in a playbook with configurable prompt instructions, tool policies, input bindings, and resource caps.
_Avoid_: Step block, action node, pipeline task

**Research Health Linter**:
A real-time guidance mechanism in the playbook builder that surfaces advisory warnings and best-practice recommendations without blocking playbook saving or execution.
_Avoid_: Validation errors, playbook blocker, schema validator

**Research Health Inspector**:
The persistent sidebar panel in the playbook builder that visualizes pipeline readiness, token budgets, and 1-click recommendations.
_Avoid_: Playbook sidebar, stats drawer

**5-Pillar Research Model**:
The evaluative framework (Grounding, Retrieval, Extraction, Verification, Delivery) used to determine research rigor.
_Avoid_: Playbook checklist, pipeline stages

**Fallback Report Synthesizer**:
The execution engine mechanism that compiles executed step outputs into a finalized research report when an explicit report step is omitted.
_Avoid_: Auto-formatter, markdown glue

**Card Type**:
A high-level categorization assigned to a card (e.g. `tool`, `company`, `article`, `product`, `repo`, `paper`) that classifies its nature and can trigger specific default Research Playbooks.
_Avoid_: Card category, card classification, ticket type

**Configurable Taxonomy**:
The user-governed list of up to 20 active Card Types managed in Platform Preferences, strictly bounding the AI triage classifier with unclassified items routed to `other`.
_Avoid_: Dynamic emergent taxonomy, tag routing, open categories
