# Implementation Plan: Knowledge Sinks & Integrations

## Current State (Ticket 01 - Core Knowledge Sink & Obsidian)

**Status: ~90% Complete**

Already implemented:
- ✅ `port.CardExport` bundle type in `internal/port/port.go`
- ✅ `BuildCardExport` / `BuildLibraryExports` in `internal/core/core.go`
- ✅ `ExportCardToSink` / `ExportLibraryToSink` / `TestSinkConnection` in `internal/core/core.go` (Obsidian)
- ✅ Obsidian markdown export with full YAML frontmatter, Executive Summary, Proposed Actions, Research Dossier in `internal/obsidian/obsidian.go`
- ✅ File replacement idempotency (cleans up old `<card.ID>-*.md` files)
- ✅ API endpoints in `internal/web/web.go`:
  - `POST /api/v1/cards/{id}/export/obsidian`
  - `POST /api/v1/export/obsidian` (bulk sync)
  - `POST /api/v1/integrations/obsidian/test`
- ✅ Frontend `IntegrationsTab.tsx`: Obsidian vault path input, Test Connection, Sync Vault Now buttons
- ✅ Frontend `CardHeaderActions.tsx`: "Send to Obsidian Vault" in overflow menu (conditional on vault path)
- ✅ Single card markdown download (`/api/v1/cards/{id}/export.md`) includes Research Dossier

Remaining for Ticket 01:
- Minor: Auto-export triggers on triage (`doing`/`done`) and research completion (part of Ticket 06)

---

## Ticket 02: Client App URI and Web Intents (UNBLOCKED)

**Goal**: Zero-config client intents in card modal and settings toggles

### Backend Changes
1. No backend changes needed - these are pure client-side URI schemes

### Frontend Changes

#### 1. `frontend/src/components/settings/IntegrationsTab.tsx`
- Add "Client App Shortcuts" section with toggle switches for:
  - Obsidian App (`obsidian://new?name=...&content=...`)
  - Logseq (`logseq://x-callback-url/quickCapture?title=...&content=...`)
  - Things 3 (`things:///add?title=...&notes=...`)
  - Todoist (web URL: `https://todoist.com/showTask?text=...&description=...`)
  - GitHub Issues (web URL: `https://github.com/{owner}/{repo}/issues/new?title=...&body=...`)
- Persist enabled intents in settings: `client_intents_enabled` (comma-separated, default: `obsidian,todoist`)

#### 2. `frontend/src/components/card-modal/CardHeaderActions.tsx`
- Import settings to check enabled intents
- Add overflow menu items for each enabled client intent
- Generate appropriate URI/URL and open in new tab/window
- For Obsidian: use `obsidian://new?name={encodeURIComponent(title)}&content={encodeURIComponent(markdown)}`
- For Logseq: use `logseq://x-callback-url/quickCapture?title={encodeURIComponent(title)}&content={encodeURIComponent(markdown)}`
- For Things 3: use `things:///add?title={encodeURIComponent(title)}&notes={encodeURIComponent(markdown)}`
- For Todoist: open `https://todoist.com/showTask?text={encodeURIComponent(title)}&description={encodeURIComponent(markdown)}`
- For GitHub: need repo config in settings, open `https://github.com/{owner}/{repo}/issues/new?title={encodeURIComponent(title)}&body={encodeURIComponent(markdown)}`

#### 3. `frontend/src/api.ts`
- No new API calls needed (all client-side)

---

## Ticket 03: Authenticated Outbox RSS Feed (UNBLOCKED)

**Goal**: Authenticated, filterable RSS 2.0 feed with full HTML synthesis

### Backend Changes

#### 1. New package: `internal/feed/feed.go`
- `GenerateFeed(ctx, store, token, filter) (string, error)` - generates RSS 2.0 XML
- Token validation using constant-time comparison
- Filter support: `status`, `type`, `research_only`, `since`, `limit`
- Full HTML synthesis in `<content:encoded>` including Research Dossiers

#### 2. `internal/core/core.go`
- Add `GetOutboxFeedToken(ctx) (string, error)` - retrieve or generate token
- Add `RegenerateOutboxFeedToken(ctx) (string, error)` - rotate token
- Token stored in settings as `outbox_feed_token` (bcrypt hashed for storage, validated with constant-time compare)

#### 3. `internal/web/web.go` - New routes:
- `GET /api/v1/feed.xml` - RSS feed endpoint (public path, token in query)
- `GET /api/v1/integrations/outbox/token` - get current token (for settings UI)
- `POST /api/v1/integrations/outbox/token/regenerate` - regenerate token

#### 4. `internal/web/feed_handler.go` (new file)
- `serveFeed` - handles GET /api/v1/feed.xml with query params
- `getOutboxToken` - returns token for settings display
- `regenerateOutboxToken` - rotates token

### Frontend Changes

#### 1. `frontend/src/components/settings/IntegrationsTab.tsx`
- Add "Outbox RSS Feed" section
- Display current token (masked) with "Regenerate" and "Copy" buttons
- Show feed URL with token: `{origin}/api/v1/feed.xml?token=...`
- Add filter helper links (status=doing,done, type=article, research_only=1)

#### 2. `frontend/src/api.ts`
- `getOutboxFeedToken()`
- `regenerateOutboxFeedToken()`

---

## Execution Order

1. **Parallel**: Ticket 02 (Client Intents) + Ticket 03 (Outbox RSS Feed) - independent
2. **Sequential**: Ticket 04 (Notion) - after Ticket 01 complete
3. **Sequential**: Ticket 05 (Joplin) - after Ticket 01 complete
4. **Sequential**: Ticket 06 (Auto-export triggers) - after Tickets 01, 04, 05

---

## Verification Gate

All changes must pass `make check` before committing:
- Go: `go test -race ./...`, `go build ./...`, `go vet ./...`
- Frontend: `npm test`, `npm run build`, `npm run lint`
- Dist freshness: `internal/web/dist` must match frontend build