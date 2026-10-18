# 06: Automated Lifecycle Export Triggers & Background Isolation

**What to build:**
Automated lifecycle export triggers that automatically push cards and completed Research Dossiers to configured Knowledge Sinks in the background when cards are promoted during triage (`doing` or `done`) or when a Research Playbook finishes. Each sink has an independent auto-export toggle in Settings. In addition, manual single-card Markdown downloads and bulk ZIP archives are updated to include completed Research Dossiers.

**Blocked by:** 01: Core Knowledge Sink Seam & Obsidian End-to-End Tracer Bullet, 04: Schema-Resilient Notion Knowledge Sink End-to-End, 05: Dual-Mode Joplin Knowledge Sink End-to-End

**Status:** ready-for-agent

- [ ] `IntegrationsTab` provides independent "Auto-export on Doing/Done & Research Completion" toggle switches for Obsidian, Notion, and Joplin (stored as `obsidian_auto_export`, `notion_auto_export`, `joplin_auto_export` in `settings`).
- [ ] Asynchronous background runner in `core.Service` dispatches auto-exports with an isolated 15-second timeout per enabled sink upon:
  - Card status transition to `doing` or `done` (`UpdateCardStatus` / `UpdateCard`).
  - Research playbook completion in `runResearch`.
- [ ] Slow or failing sink endpoints log errors and do not block the UI triage workflow or research pipeline.
- [ ] Single-card Markdown download endpoint `GET /api/v1/cards/{id}/export.md` updated to include completed Research Dossier.
- [ ] Full library archive endpoint `GET /api/v1/export/archive.zip` updated to include completed Research Dossiers in zipped `.md` files.
- [ ] Integration tests verify automated lifecycle export firing and error isolation.
- [ ] Verification gate passes: `make check` succeeds cleanly with all linting, frontend tests, dist sync, and Go race tests passing.
