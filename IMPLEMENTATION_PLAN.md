# Implementation Plan: Knowledge Sinks & Integrations (Updated)

## Current State

**Ticket 01 (Core Knowledge Sink & Obsidian)**: ~95% Complete
- ✅ Core orchestration, CardExport bundle, Obsidian export with idempotency
- ✅ API endpoints, Settings UI, Card modal integration
- ⏳ Auto-export triggers on triage/research completion (part of Ticket 06)

**Ticket 02 (Client App URI and Web Intents)**: ✅ COMPLETE
- ✅ Card modal overflow menu with Obsidian, Logseq, Things 3, Todoist, GitHub
- ✅ Settings toggles, GitHub repo config

**Ticket 03 (Authenticated Outbox RSS Feed)**: ✅ COMPLETE
- ✅ RSS 2.0 feed with HTML synthesis + Research Dossiers
- ✅ Token auth, filtering, Settings token management

---

## Ticket 04: Notion Knowledge Sink (UNBLOCKED - depends on Ticket 01 core)

**Goal**: Schema-resilient Notion API client with database property auto-provisioning, native block chunking (≤2,000 chars, 100 blocks/batch), stateless idempotent upsert.

### Backend Changes

#### 1. New package: `internal/notion/notion.go`
```go
package notion

import (
    "context"
    "sparkkeep/internal/port"
)

// Config holds Notion integration settings
type Config struct {
    Token      string // Internal Integration Token
    DatabaseID string // Target database ID
}

// Client wraps Notion API operations
type Client struct {
    config Config
    http   *http.Client
}

// NewClient creates a Notion client
func NewClient(config Config) *Client

// TestConnection validates token and database access
func (c *Client) TestConnection(ctx context.Context) (port.SinkTestResult, error)

// EnsureDatabaseSchema provisions required properties if missing
func (c *Client) EnsureDatabaseSchema(ctx context.Context) error

// UpsertCardExport creates or updates a page for the card export
func (c *Client) UpsertCardExport(ctx context.Context, exp port.CardExport) (pageID string, err error)

// Required database properties (auto-provisioned):
// - "Sparkkeep ID" (number) - unique identifier for idempotent upsert
// - "Card Type" (select)
// - "Horizon" (select)
// - "Status" (select)
// - "Tags" (multi_select)
// - "Source URL" (url)
// - "Created At" (date)
// - "Updated At" (date)
// - "Researched" (checkbox)
```

#### 2. Markdown-to-Notion Block Parser
- Convert markdown to Notion blocks (paragraph, heading_1/2/3, bulleted_list_item, numbered_list_item, to_do, code, callout, quote, divider)
- **Chunking**: Split text blocks > 2,000 chars
- **Batching**: Send ≤100 blocks per `appendBlocks` request
- Research Dossier → callout blocks with nested content

#### 3. `internal/core/core.go`
- Add Notion case to `ExportCardToSink`, `ExportLibraryToSink`, `TestSinkConnection`
- Read settings: `notion_token`, `notion_database_id`

#### 4. `internal/web/channels_handler.go` (or new `notion_handler.go`)
- Handlers for Notion-specific endpoints (reuse existing pattern)

#### 5. `internal/web/web.go`
- Add routes: `POST /api/v1/integrations/notion/test`, etc. (or reuse generic sink endpoints)

### Frontend Changes

#### 1. `frontend/src/components/settings/IntegrationsTab.tsx`
- Add "Notion Knowledge Sink" section
- Inputs: Integration Token, Database ID
- Buttons: Test Connection, Sync Library Now
- Auto-export toggle (for Ticket 06)

#### 2. `frontend/src/api.ts`
- No new APIs needed if using generic `/api/v1/integrations/notion/test` pattern

---

## Ticket 05: Joplin Dual-Mode Knowledge Sink (UNBLOCKED - depends on Ticket 01 core)

**Goal**: Pure-Go Joplin client supporting both Self-Hosted Joplin Server (`/api/sessions` + serialized item push) and Desktop Clipper API (`127.0.0.1:41184`), deterministic 32-char hex IDs.

### Backend Changes

#### 1. New package: `internal/joplin/joplin.go`
```go
package joplin

import (
    "context"
    "sparkkeep/internal/port"
)

type Mode string
const (
    ModeServer  Mode = "server"   // Self-hosted Joplin Server
    ModeClipper Mode = "clipper"  // Desktop Clipper API
)

type Config struct {
    Mode      Mode   // "server" or "clipper"
    BaseURL   string // Server: https://joplin.example.com, Clipper: http://127.0.0.1:41184
    Token     string // Server: email+password → session token; Clipper: clipper token
    Email     string // Server only
    Password  string // Server only
}

type Client struct {
    config Config
    http   *http.Client
    // For server mode: session token from /api/sessions
}

func NewClient(config Config) *Client

func (c *Client) TestConnection(ctx context.Context) (port.SinkTestResult, error)

func (c *Client) EnsureNotebook(ctx context.Context) (notebookID string, error)

func (c *Client) UpsertCardExport(ctx context.Context, exp port.CardExport) (noteID string, error)

// Deterministic IDs: sha256("sparkkeep:card:<cardID>")[:32] for notes
// Notebook ID: sha256("sparkkeep:notebook")[:32]
// All IDs lowercase hex, 32 chars
```

#### 2. Joplin Server Mode (`/api/`)
- POST `/api/sessions` with email/password → get token
- GET `/api/folders` → find/create "Sparkkeep" notebook (deterministic ID)
- POST `/api/notes` with `id` (deterministic), `parent_id` (notebook), `title`, `body` (markdown), `tags`
- PUT `/api/notes/:id` for updates

#### 3. Joplin Clipper Mode (`http://127.0.0.1:41184/`)
- POST `/resources` for any attachments (optional)
- POST `/notes` with `id`, `parent_id`, `title`, `body`, `tags`
- Uses `Authorization: Bearer <token>` header

#### 4. `internal/core/core.go`
- Add Joplin case to sink methods
- Read settings: `joplin_mode`, `joplin_base_url`, `joplin_token`, `joplin_email`, `joplin_password`

#### 5. Frontend: `IntegrationsTab.tsx`
- Add "Joplin Knowledge Sink" section
- Mode selector (Server / Clipper)
- Server: Base URL, Email, Password
- Clipper: Base URL (default 127.0.0.1:41184), Token
- Test Connection, Sync Library Now, Auto-export toggle

---

## Execution Order

1. **Parallel**: Ticket 04 (Notion) + Ticket 05 (Joplin) - independent
2. **Sequential**: Ticket 06 (Auto-export triggers) - after Tickets 01, 04, 05

---

## Verification Gate

All changes must pass `make check`:
- Go: `go test -race ./...`, `go build ./...`, `go vet ./...`
- Frontend: `npm test`, `npm run build`, `npm run lint`
- Dist freshness: `internal/web/dist` must match frontend build