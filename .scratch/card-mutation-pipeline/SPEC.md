# SPEC: Deepen Domain Core for Card Mutations & Eliminate Storage Leakage from Channel Adapters

**Triage Label:** `ready-for-agent`  
**Status:** Ready for Ticket Breakdown  
**Related Documents:** [GLOSSARY.md](file:///home/capitanfg/media-server/nas/sparkkeep/GLOSSARY.md), [CODING_STANDARDS.md](file:///home/capitanfg/media-server/nas/sparkkeep/CODING_STANDARDS.md), [AGENTS.md](file:///home/capitanfg/media-server/nas/sparkkeep/AGENTS.md)

---

## Problem Statement

Operators of SparkKeep interact with idea cards across multiple communication channels (Telegram, Discord, Slack, OpenClaw) and the web dashboard. However, the system currently suffers from architectural leakage, bypassed domain hooks, and testing friction:

1. **Storage Leakage Across Channel Adapters**: Transport adapters for Telegram, Discord, and OpenClaw bypass the domain core orchestration module and directly query and mutate the underlying SQLite storage (`port.Store`). This directly violates documented architectural standards requiring adapters to act strictly as thin protocol bridges.
2. **Missing Lifecycle Guarantees & Webhook Inconsistency**: Because channel adapters and web handlers mutate storage directly, card updates (such as triaging a card to `review` or `done`, updating its planning horizon, adding tags, or shelving stale cards) do not pass through a central domain mutation pipeline. Consequently, outbound webhooks are never dispatched for card updates, queue workers are not notified of state changes, and card modification provenance is lost.
3. **Bloated Adapter Test Doubles**: Because channel adapters require a direct storage handle, testing a protocol button click in Telegram or Discord requires mocking or stubbing over twenty storage database methods instead of simply asserting against a small domain core interface.

---

## Solution

Deepen the domain core module to take complete ownership of card mutations, triage state transitions, and channel message provenance, presenting a unified, deep interface to all callers:

1. **Card Mutation Pipeline in Domain Core**: Introduce cohesive domain operations on the domain core module for updating card status, horizon, notes, tags, and comments, as well as shelving stale cards and managing channel message linkages.
2. **Centralized Event Fan-Out & Webhook Dispatch**: Ensure every card mutation processed through domain core automatically enforces lifecycle invariants, dispatches outbound webhook notifications (`EventCardUpdated`), and wakes background queue processing where appropriate.
3. **Pure Protocol Channel Adapters**: Completely remove the storage handle from channel adapters (Telegram, Discord, OpenClaw, Slack). Channel adapters will interact exclusively with the domain core interface, restoring their intended architectural role as thin protocol bridges.
4. **Lean Adapter Test Suites**: Channel adapter tests will exercise transport translation against a minimal domain interface, removing hundreds of lines of brittle storage test doubles.

---

## User Stories

1. As an operator triaging a card via Telegram button callbacks, I want the card's status and horizon to update through the central domain core, so that all system lifecycle hooks and webhook events trigger reliably.
2. As an operator changing a card's status in Discord, I want external webhook subscribers to receive an instant card update event, so that my connected automation tools remain in sync.
3. As an operator using OpenClaw to process an inbound action, I want the card update to execute through the domain core module without the OpenClaw adapter touching SQLite directly, so that architectural invariants are maintained.
4. As an operator tagging a card via Telegram message commands, I want the tag mutation to go through domain core validation, so that malformed tags are rejected consistently across channels.
5. As an operator replying to a Telegram capture notification with a note, I want the note to be attached to the card via the domain core pipeline, so that note updates trigger outbound notifications if configured.
6. As an operator querying active research for a card in Telegram, I want the research check to go through domain core rather than direct database queries, so that caching or queue status is respected.
7. As an operator selecting a Research Playbook via Telegram, I want the playbook resolution to pass through domain core, so that built-in versus custom playbook constraints are checked consistently.
8. As an operator linking an incoming chat message ID to a card, I want the provenance link recorded through domain core, so that cross-channel tracking is centralized.
9. As an operator shelving stale cards via the web interface or scheduler, I want the batch shelf operation to trigger through domain core, so that archived card counts and events are audited.
10. As a developer maintaining channel adapters, I want channel adapters to require zero direct knowledge of the storage schema or SQL database, so that transport changes cannot corrupt storage state.
11. As a developer writing tests for the Discord adapter, I want to stub a small domain interface with only the methods Discord uses, so that tests do not require mock database tables.
12. As a developer writing tests for the Telegram adapter, I want to verify callback routing without maintaining twenty mock storage methods, so that tests run fast and remain resilient to storage refactors.
13. As an operator triggering card edits from the web API, I want the web handlers to delegate card mutations to the domain core module, so that web and chat channels behave with identical semantics.
14. As an operator with external webhooks configured, I want card update events to carry complete card payload and change metadata, so that downstream consumers know exactly what fields were modified.

---

## Implementation Decisions

### 1. Domain Core Interface Deepening
- The domain core module will be deepened to expose cohesive card lifecycle mutation methods:
  - Triage mutation: Accepts card ID and patch parameters (status, horizon, note, card type), validates the transition against domain rules, applies the change via storage, dispatches webhook events, and returns the updated card.
  - Tag management: Replaces or appends card tags through domain core validation, ensuring lowercase deduplication.
  - Comment addition: Records user or automated comments on cards and notifies interested parties.
  - Batch shelving: Executes stale card archiving with event logging.
  - Channel message provenance: Records and queries the association between transport message IDs and domain card IDs.
  - Research status & playbook inspection: Provides read access for active research state and available Research Playbooks without exposing raw storage queries to protocol adapters.

### 2. Elimination of Direct Storage Access in Channel Adapters
- All channel adapters (Telegram, Discord, OpenClaw, Slack) will have their direct storage dependency removed.
- Adapters will receive the domain core interface at initialization.
- Inbound button callbacks, text commands, and webhook actions will call domain core methods directly.
- Channel adapters remain strictly responsible for:
  - Validating incoming cryptographic transport signatures (e.g., Discord Ed25519 signatures, Telegram token checks).
  - Unmarshaling platform payloads into domain capture or mutation requests.
  - Formatting outbound domain notifications into platform-specific rich text, embeds, and interactive buttons.

### 3. Webhook Event Expansion
- The webhook dispatcher will introduce a dedicated event for card mutations (`EventCardUpdated`).
- Every successful card patch or triage transition executed through the domain core pipeline will publish this event, providing downstream integrations with real-time card state updates.

### 4. Web HTTP Adapter Alignment
- The HTTP handlers for cards will delegate update and delete operations through the domain core mutation pipeline rather than directly invoking storage methods.
- This establishes domain core as the single authoritative entry point for all card mutations across both HTTP and chat transports.

---

## Testing Decisions

- **What makes a good test:** Tests should verify observable external behavior and state outcomes across the architectural seam, never internal method calls or SQL implementation details.
- **Testing Seams:**
  - **Primary Seam (Domain Core Orchestration):** Unit and integration tests for domain core will invoke card mutation methods against an in-memory storage adapter, asserting that card properties update correctly, invalid transitions return expected errors, and webhook dispatchers receive notification events.
  - **Protocol Bridge Seams (Channel Adapters):** Channel adapter test suites will feed simulated transport payloads (e.g. simulated Discord interaction JSON, mock Telegram update callbacks) into adapter handlers and assert that the adapter issues the correct domain call to the stubbed domain core interface. No storage mocks will be used in channel adapter tests.
  - **HTTP API Seam (Web Handlers):** Web integration tests will verify that HTTP PATCH and POST requests to card endpoints produce proper HTTP status codes and reflect state changes through the service pipeline.
- **Prior Art:**
  - `internal/core/core_test.go`: Existing test patterns verifying capture intake, deduplication, and research orchestration with `stubStore`.
  - `internal/channel/hub_test.go`: Outbound notification routing tests verifying adapter dispatch without database access.
  - `internal/channel/telegram/telegram_test.go`: Protocol message parsing tests that can now be simplified by removing `st port.Store`.

---

## Out of Scope

- Changes to the underlying SQLite schema or database migrations (existing columns in `cards` and `channel_messages` are sufficient).
- Changes to frontend React components or CSS styles (this is a backend domain deepening).
- Modifications to the research pipeline execution logic or 5-Pillar evaluation model.
- Adding new channel adapters (e.g. WhatsApp, Matrix); this work strictly hardens existing Telegram, Discord, OpenClaw, and Slack adapters.

---

## Further Notes

- This refactoring brings the codebase into strict compliance with Section 1 of `CODING_STANDARDS.md` ("No Direct Storage Mutations: Adapters must never query SQLite directly or persist settings. All state operations must go through core.Service or ChannelHub.").
- This architectural deepening significantly improves AI navigability and test locality by ensuring all card state transitions occur in one well-defined location.
