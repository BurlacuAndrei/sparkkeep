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

**Playbook Template**:
A pre-configured, domain-specific starter sequence of Step Primitives that can be loaded into a custom playbook or used as a baseline.
_Avoid_: Research recipe, playbook archetype, prompt recipe

**Playbook Studio**:
The dedicated, first-class workspace view in SparkKeep for designing, testing, inspecting, and managing Research Playbooks.
_Avoid_: Playbook settings, recipe manager, workflow builder

**Non-Destructive Taxonomy Cascade**:
The safeguard policy ensuring that deleting a Card Type detaches it from associated Research Playbooks and falls back gracefully rather than destroying user-created playbooks.
_Avoid_: Cascade delete, taxonomy wipe, orphaned playbook purge

**Subject Card**:
A user-authored card created from an open-ended topic, query, or thesis rather than captured from an external media URL.
_Avoid_: Manual card, scratch card, blank card, note card

**Card Fission**:
The ingestion policy that splits a single multi-part capture into multiple cards only when distinct, standalone subjects or tools are identified.
_Avoid_: Card splitting, post fragmentation, multi-card slicing

**Triage Noise Gate**:
The ingestion filter that identifies zero-signal engagement bait, rhetorical interaction hooks, or pure junk promotion and discards them entirely, preventing unwanted card creation.
_Avoid_: Spam filter, bait blocker, fluff cleaner

**Knowledge Sink**:
An external personal knowledge management system (such as Obsidian, Notion, or Joplin) that receives one-way, idempotent outbound card and research dossier exports from Sparkkeep.
_Avoid_: Two-way sync, connector, integration

**Client Intent**:
A client-dispatched URI scheme or pre-filled web URL that hands off a card directly from the browser to a local or web application without server-side credentials.
_Avoid_: Native plugin, desktop bridge

**Outbox Feed**:
An authenticated, filterable syndication feed exposing curated cards and completed research dossiers to external readers and automation tools.
_Avoid_: Public RSS, inbound feed

**Interface Locale**:
The active display language governing workspace UI chrome, built-in taxonomy labels, and outbound channel notifications.
_Avoid_: UI language, profile language, translation mode

**Output Language**:
The user-configured target language in which the intelligence engine synthesizes card triage briefs, claims, and research dossiers.
_Avoid_: Interface locale, system language, translation filter

**Canonical Card Type**:
A system-defined Card Type identified by an immutable English slug for routing and classification while rendered with a locale-specific display label in the interface.
_Avoid_: Translated category key, localized type slug

**Custom Card Type**:
A user-defined Card Type stored and displayed verbatim in the language entered by the user.
_Avoid_: Custom category, freeform tag
