# 01: Core Knowledge Sink Seam & Obsidian End-to-End Tracer Bullet

**What to build:**
A unified Knowledge Sink architecture orchestrated by `internal/core/Service` that upgrades Sparkkeep's Obsidian vault export. Users can configure a server-side Obsidian vault directory in Settings, test the path connection, run a bulk library export, and trigger single-card exports directly from the card modal. Exported notes now include YAML frontmatter, synthesis, action items, and the full Markdown Research Dossier from the latest completed research run. If a card's title is modified, re-exporting replaces the previous `<id>-*.md` file statelessly without leaving orphaned notes in the vault.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Core domain exposes `port.CardExport` (`Card` + latest completed `Research` dossier) and orchestration methods `ExportCardToSink`, `ExportLibraryToSink`, and `TestSinkConnection` on `core.Service`.
- [ ] Obsidian exporter formats notes with complete YAML frontmatter, synthesis sections, action checklist, and completed `## Research Dossier` if research exists.
- [ ] Obsidian exporter performs stateless idempotent upsert by matching `<card.ID>-*.md` in the vault directory and replacing the existing file when the title has changed.
- [ ] Endpoints `POST /api/v1/cards/{id}/export/obsidian`, `POST /api/v1/export/obsidian`, and `POST /api/v1/integrations/obsidian/test` are active.
- [ ] `IntegrationsTab` provides vault path input, "Test Connection" button, and "Sync Library Now" button with status feedback.
- [ ] `CardHeaderActions` provides "Send to Obsidian Vault" action when an Obsidian vault path is configured, displaying toast feedback on export.
- [ ] Unit and integration tests verify markdown formatting with research dossiers, file replacement idempotency, and API endpoints.
