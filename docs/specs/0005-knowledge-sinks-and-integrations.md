# Spec: Knowledge Sinks & Low-Cost Integrations

## Problem Statement

Users collect, triage, and deeply research knowledge items in Sparkkeep, but want to store and synthesize their long-term notes in their existing Personal Knowledge Management (PKM) ecosystems—specifically Obsidian, Notion, and self-hosted Joplin. Previously, Sparkkeep advertised integrations for Obsidian and Notion under an older paid tier that has since been eliminated in favor of a 100% open-source MIT model. Currently, only a basic directory export to a local Obsidian vault exists, and it drops completed Research Dossiers, requires a local filesystem mount, and lacks single-card actions or automated triggers. Furthermore, users cannot easily bridge cards into lightweight desktop tools (Logseq, Things 3, Todoist, GitHub) or consume their curated cards and dossiers via RSS in external readers and automation pipelines.

## Solution

Implement a unified, zero-paywall **Knowledge Sink** architecture orchestrated by `internal/core/Service`. External PKMs (Obsidian, Notion, self-hosted Joplin Server, and Joplin Desktop Clipper) are modeled as one-way, statelessly idempotent outbound destinations. 

Whenever a card is manually exported, promoted during triage (`doing` or `done`), or completes a Research Playbook, Sparkkeep packages a canonical export bundle containing the card synthesis, checklist items, and full Research Dossier, and pushes it idempotently to the configured sinks. In addition, Sparkkeep provides zero-config Client Intents (`obsidian://`, `logseq://`, `things://`, Todoist, GitHub) in the card modal and an authenticated Outbox RSS/Atom feed (`GET /api/v1/feed.xml?token=...`) for passive syndication.

## User Stories

1. As a user, I want all PKM and automation integrations to be 100% free and open-source under MIT, so that no features are gated behind paywalls or license keys.
2. As an Obsidian user, I want Sparkkeep to export cards to my vault directory with full YAML frontmatter, executive summary, actions, and the complete Research Dossier, so that my research findings are preserved in my vault.
3. As an Obsidian user, I want re-exporting a card whose title has been edited to update the existing file in place, so that my vault does not accumulate duplicate or orphaned markdown files.
4. As a mobile or remote browser user, I want an "Open in Obsidian" action in the card modal using the `obsidian://new` URI scheme, so that I can instantly clip a card into my local Obsidian vault without configuring a server-side filesystem path.
5. As a Notion user, I want to connect Sparkkeep to my Notion workspace using an Internal Integration Token and a target Database ID, so that my captured cards are saved directly to my Notion database.
6. As a Notion user, I want Sparkkeep to automatically inspect and provision missing database properties (`Sparkkeep ID`, `Card Type`, `Horizon`, `Status`, `Tags`, `Source URL`) on my Notion database, so that setup is resilient and never fails due to schema mismatches.
7. As a Notion user, I want exported cards in Notion to feature structured callout blocks, interactive `to_do` checkboxes, and native blocks for the Research Dossier, so that my notes look clean and readable.
8. As a Notion user, I want the Notion exporter to automatically chunk text exceeding 2,000 characters and batch requests exceeding 100 blocks, so that large research reports never fail Notion's API limits.
9. As a Notion user, I want re-exporting a card to update the existing Notion page rather than creating a duplicate row, so that my database stays clean.
10. As a self-hosted Joplin user, I want to configure Sparkkeep with my Joplin Server URL, email, and password, so that Sparkkeep can push notes directly to my Joplin Server 24/7 headless on my NAS.
11. As a self-hosted Joplin user, I want Sparkkeep to derive deterministic 32-character hex item IDs for notes and folders, so that updates and research completions overwrite existing Joplin items statelessly without needing tracking tables.
12. As a Joplin desktop user, I want an alternate Clipper Data API mode (`http://127.0.0.1:41184` + token), so that I can push cards directly to my local Joplin desktop app if I do not use Joplin Server.
13. As a Joplin user, I want all exported cards to land in a designated "Sparkkeep" notebook with card tags attached, so that my primary notebook tree remains uncluttered.
14. As a user, I want a single-click "Send to [Obsidian / Notion / Joplin]" action in the card modal, so that I can selectively send individual cards to any configured sink.
15. As a user, I want a "Sync Library Now" button for each configured sink in Settings, so that I can backfill my entire active card collection.
16. As a user, I want independent auto-export toggles for each configured sink, so that I can automatically push promoted cards (`doing`/`done`) and completed research to Joplin/Obsidian while keeping Notion manual.
17. As a user, I want auto-exports to run asynchronously with a 15-second timeout, so that a slow external API never blocks UI interactions or research pipeline execution.
18. As a user, I want a "Test Connection" button for each sink in Settings, so that I can immediately verify my credentials, URLs, and database permissions.
19. As a user, I want toggleable Client Intents in the card modal for Logseq (`logseq://`), Things 3 (`things://`), Todoist, and GitHub Issues, so that I can quickly send cards to my favorite desktop or task tools.
20. As a user, I want an authenticated Outbox RSS feed (`GET /api/v1/feed.xml?token=...`), so that external RSS readers (FreshRSS, Miniflux, Readwise Reader) and automation tools (n8n, Zapier) can subscribe to my triaged cards and research dossiers.
21. As a user, I want to filter the Outbox RSS feed using query parameters (`?status=doing,done`, `?type=article`, `?research_only=1`), so that I can consume tailored sub-feeds.
22. As a user, I want to view and regenerate my Outbox RSS feed token in Settings, so that I can revoke access if my token is ever exposed.
23. As a user, I want single-card Markdown downloads and bulk ZIP archives to also include the latest completed Research Dossier, so that manual exports are never missing critical research data.

## Implementation Decisions

1. **One-Way Stateless Knowledge Sinks (`docs/adr/0005-one-way-stateless-knowledge-sinks.md`):** All integrations are one-way outbound exports. Two-way sync, inbound polling, and local sync-state tables in SQLite are explicitly rejected to eliminate conflict resolution complexity and maintain Sparkkeep as the upstream capture and triage engine.
2. **Core Orchestration Seam:** `internal/web` handlers delegate all export, bulk sync, connection testing, and lifecycle auto-export orchestration to `internal/core/Service`. Individual sink packages (`internal/obsidian`, `internal/notion`, `internal/joplin`) act as thin adapters consuming a unified `port.CardExport` bundle.
3. **Stateless Deterministic Upsert:**
   - Obsidian: matches `<card.ID>-*.md` in the vault directory and updates in place.
   - Joplin: uses deterministic 32-character lowercase hex IDs (`sha256("sparkkeep:card:<id>")[:32]`) for notes and notebooks across both Joplin Server and Desktop Clipper APIs.
   - Notion: auto-provisions a `Sparkkeep ID` (`number`) property and performs a filter query before write; updates existing pages or creates a fresh page if deleted/missing.
4. **Resilient Notion Block Chunker:** A dedicated Markdown-to-Notion parser converts Markdown into native Notion blocks, adhering strictly to Notion's ≤2,000 characters per block limit and batching requests in chunks of ≤100 blocks.
5. **Joplin Dual-Mode Support:** Supports both headless Self-Hosted Joplin Server (`/api/sessions` + `/api/items/root:/...:/content` raw item push) and Joplin Desktop Clipper API (`127.0.0.1:41184` + token).
6. **Token-Authenticated Outbox RSS:** Emits standard RSS 2.0 XML with full HTML-rendered synthesis and Research Dossier in `<content:encoded>`, authenticated via a constant-time validated query parameter (`?token=...`).
7. **Modular Frontend Settings & Modal UI:** Sinks and client intents are managed under [`IntegrationsTab.tsx`](file:///home/capitanfg/media-server/nas/sparkkeep/frontend/src/components/settings/IntegrationsTab.tsx), and conditionally surfaced in [`CardHeaderActions.tsx`](file:///home/capitanfg/media-server/nas/sparkkeep/frontend/src/components/card-modal/CardHeaderActions.tsx) with toast status feedback.

## Testing Decisions

- **Behavioral Focus:** Tests assert observable external behavior: generated files, HTTP payloads sent to mock sink endpoints, response codes, and DOM state changes, without asserting internal function call chains.
- **Backend Mocking (`httptest.Server`):** Test suites in `internal/notion`, `internal/joplin`, `internal/feed`, and `internal/web` run against standard Go `httptest.Server` instances mocking Notion API and Joplin Server/Clipper responses.
- **Prior Art:**
  - `internal/web/web_test.go`: `TestLicenseStatusAndObsidianExport` and webhook dispatch test patterns.
  - `internal/channel/discord/discord_test.go`: HTTP payload and signature verification patterns.
  - `frontend/src/components/settings/IntegrationsTab.test.tsx`: Component rendering and interaction patterns.

## Out of Scope

- Two-way synchronization or polling changes from Obsidian, Notion, or Joplin back into Sparkkeep.
- End-to-End Encryption (E2EE) key negotiation for Joplin Server accounts (target account/notebook must have E2EE disabled).
- Per-card custom property mapping editor for Notion (fixed canonical property schema with automatic provisioning).
- Dedicated REST API clients for self-hosted bookmarking tools (Karakeep/Hoarder, Linkding, Wallabag) — covered passively via Outbox RSS and Inbound Webhooks.

## Further Notes

- All changes adhere strictly to [`CODING_STANDARDS.md`](file:///home/capitanfg/media-server/nas/sparkkeep/CODING_STANDARDS.md) (zero paywalls, core orchestration, Vitest act cleanliness, `make check` passing).
- Architecture Decision Record is recorded at [`docs/adr/0005-one-way-stateless-knowledge-sinks.md`](file:///home/capitanfg/media-server/nas/sparkkeep/docs/adr/0005-one-way-stateless-knowledge-sinks.md).
- Ubiquitous language is recorded in [`GLOSSARY.md`](file:///home/capitanfg/media-server/nas/sparkkeep/GLOSSARY.md).
