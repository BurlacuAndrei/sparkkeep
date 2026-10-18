# Implementation Plan: Knowledge Sinks & Integrations (Final)

## Current State - Tickets 01-05 COMPLETE

| Ticket | Feature | Status |
|--------|---------|--------|
| **01** | Core Knowledge Sink & Obsidian | ✅ ~95% |
| **02** | Client App URI & Web Intents | ✅ 100% |
| **03** | Authenticated Outbox RSS Feed | ✅ 100% |
| **04** | Notion Knowledge Sink | ✅ 100% |
| **05** | Joplin Dual-Mode Knowledge Sink | ✅ 100% |

---

## Ticket 06: Automated Lifecycle Export Triggers (UNBLOCKED)

**Goal**: Background auto-export on triage (`doing`/`done`) and research completion (with 15s timeout isolation), upgraded single-card downloads and ZIP archives, CI verification gate.

### Backend Changes

#### 1. `internal/core/core.go` - Auto-Export Trigger Logic
Add to `Service` struct:
```go
// Auto-export configuration (read from settings)
AutoExportObsidian bool
AutoExportNotion   bool
AutoExportJoplin   bool
```

Add methods:
```go
// Export triggers called after state transitions
func (s *Service) triggerAutoExportOnStatusChange(ctx context.Context, card port.Card, oldStatus, newStatus string)
func (s *Service) triggerAutoExportOnResearchComplete(ctx context.Context, cardID int64)
```

**Trigger Conditions:**
- Status transition TO: `to-do`, `in-progress`, `done` (i.e., "doing" or "done" states)
- Research completion (when `ResearchState` becomes `done`)
- Only for sinks with `auto_export` enabled in settings

**Async Execution with 15s Timeout:**
```go
func (s *Service) autoExportCard(ctx context.Context, cardID int64) {
    // Run in background with 15s timeout
    exportCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
    defer cancel()
    
    // Export to each enabled sink
    for _, sink := range s.enabledAutoExportSinks() {
        if err := s.ExportCardToSink(exportCtx, sink, cardID); err != nil {
            s.Logf("auto-export to %s failed for card %d: %v", sink, cardID, err)
        }
    }
}
```

#### 2. Integration Points

**In `UpdateCard` / Status Transition (card_mutations.go or core.go):**
- After successful status update to `to-do`, `in-progress`, `done`
- Call `triggerAutoExportOnStatusChange(ctx, card, oldStatus, newStatus)`

**In Research Completion (`executeResearch` in core.go):**
- After research marked `done` (line ~733)
- Call `triggerAutoExportOnResearchComplete(ctx, card.ID)`

#### 3. Settings Keys (store in DB)
- `obsidian_auto_export` (bool)
- `notion_auto_export` (bool)  
- `joplin_auto_export` (bool)

Read in `Service` initialization or on-demand via `Store.GetSetting`

#### 4. Upgraded Export Endpoints (include Research Dossier)

**Single Card Markdown (`/api/v1/cards/{id}/export.md`):**
- Already includes Research Dossier via `BuildCardExport` ✅ (verified in cards_handler.go)

**ZIP Archive (`/api/v1/export/archive.zip`):**
- Update to include Research Dossier for each card
- Use `BuildLibraryExports` which already includes research

Check `internal/web/cards_handler.go` exportLibraryZip - ensure it uses `BuildLibraryExports`

### Frontend Changes

#### 1. `IntegrationsTab.tsx`
- Auto-export toggles already added for Notion and Joplin in Tickets 04/05
- Add Obsidian auto-export toggle: `obsidian_auto_export`
- All three toggles persist to settings

#### 2. Settings API
- `patchSettings` already supports these fields ✅

### Verification

- `go test -race ./...`
- `npm test`
- `make check`
- Manual test: change card status to "done", verify auto-export fires (check logs)

---

## Execution

Single subagent for Ticket 06 (integrates with all previous sinks).