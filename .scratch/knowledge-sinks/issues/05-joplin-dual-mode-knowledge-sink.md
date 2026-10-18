# 05: Dual-Mode Joplin Knowledge Sink End-to-End

**What to build:**
A dual-mode Joplin integration supporting both headless Self-Hosted Joplin Server (for 24/7 NAS-to-NAS export) and Joplin Desktop Clipper API (`127.0.0.1:41184`). Users can configure their preferred mode in Settings, test the connection, execute bulk exports, or send individual cards from the card modal. Notes are saved to a designated "Sparkkeep" notebook with tags applied, embedding the full Research Dossier and maintaining stateless idempotent upsert via deterministic 32-character hex identifiers.

**Blocked by:** 01: Core Knowledge Sink Seam & Obsidian End-to-End Tracer Bullet

**Status:** ready-for-agent

- [ ] Pure stdlib `net/http` client in `internal/joplin` supports both `"server"` and `"clipper"` modes.
- [ ] Deterministic 32-character lowercase hex IDs (`sha256("sparkkeep:card:<id>")[:32]`) derived for notes and notebooks to guarantee stateless idempotency without SQLite tracking tables.
- [ ] Self-Hosted Joplin Server mode: authenticates via `POST /api/sessions`, ensures deterministic notebook item (`type_: 2`), and writes serialized Joplin markdown note items (`type_: 1`) with metadata trailers to `PUT /api/items/root:/<id>.md:/content`.
- [ ] Joplin Desktop Clipper mode: verifies connection via `GET /ping`, resolves/creates target folder, and upserts notes via `PUT /notes/<id>` (fallback to `POST /notes`) with tags.
- [ ] Core orchestration wired for `POST /api/v1/cards/{id}/export/joplin`, bulk sync `POST /api/v1/export/joplin`, and `POST /api/v1/integrations/joplin/test`.
- [ ] `IntegrationsTab` includes Joplin configuration with mode selector (`server` vs `clipper`), appropriate credential inputs, target notebook name (default: "Sparkkeep"), "Test Connection", and "Sync Library Now".
- [ ] `CardHeaderActions` conditionally renders "Send to Joplin" when configured, with toast feedback.
- [ ] Mocked HTTP tests verify Joplin Server raw item serialization, Clipper REST endpoints, and deterministic upsert.
