# 04: Schema-Resilient Notion Knowledge Sink End-to-End

**What to build:**
A schema-resilient Notion integration that pushes Sparkkeep cards and completed Research Dossiers into a user-specified Notion Database. The user configures an Internal Integration Token and Database ID in Settings, tests the connection, runs bulk library exports, or triggers single-card exports from the card modal. Sparkkeep dynamically inspects the database, auto-provisions required properties (`Sparkkeep ID`, `Card Type`, `Horizon`, `Status`, `Tags`, `Source URL`), renders the synthesis, actions, and Research Dossier into native Notion blocks, and performs stateless idempotent updates.

**Blocked by:** 01: Core Knowledge Sink Seam & Obsidian End-to-End Tracer Bullet

**Status:** ready-for-agent

- [ ] Pure stdlib `net/http` client in `internal/notion` targets Notion API `v1` (`Notion-Version: 2022-06-28`).
- [ ] Connection test (`EnsureDatabaseSchema`) retrieves database metadata, detects existing `title` property name, and auto-provisions missing properties (`Sparkkeep ID`, `Card Type`, `Horizon`, `Status`, `Tags`, `Source URL`) via `PATCH /v1/databases/{id}`.
- [ ] Markdown-to-Notion block parser translates synthesis into a `callout` block, actions into `to_do` blocks, and parses Research Dossier Markdown into native Notion headings, bullet lists, code blocks, and paragraphs.
- [ ] Block parser chunks text exceeding 2,000 characters per block and batches children in chunks of ≤100 blocks per request.
- [ ] Stateless idempotent upsert: queries `POST /v1/databases/{id}/query` for `Sparkkeep ID == card.ID`, updating properties and replacing block children if present, or creating a fresh page via `POST /v1/pages`.
- [ ] Core orchestration wired for `POST /api/v1/cards/{id}/export/notion`, bulk sync `POST /api/v1/export/notion`, and `POST /api/v1/integrations/notion/test`.
- [ ] `IntegrationsTab` includes Notion configuration inputs (Token, Database ID), "Test Connection", and "Sync Library Now" buttons.
- [ ] `CardHeaderActions` conditionally renders "Send to Notion" when configured, with toast feedback.
- [ ] Mocked HTTP tests verify schema inspection/provisioning, block chunking, and stateless upsert handling.
