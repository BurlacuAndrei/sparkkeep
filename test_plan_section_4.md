## 4. Knowledge Sinks & Syndication

### 4.1 Auto-Export Isolated Context & Execution Lifetime
- [x] **SINK-01**: Verify `autoExportCard` does not prematurely cancel its `exportCtx` on return, allowing background exports to finish.
**Why it is done?**
Fixes the bug where `defer cancel()` was called synchronously, immediately canceling background syncs to Notion and Joplin.
- Status: FAIL
- Verified by / date / commit: Subagent 4 / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: In `internal/core/core.go:2000-2005`, `exportCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)` is immediately followed by `defer cancel()`, which attaches to `autoExportCard`'s call frame instead of the spawned `go func()` goroutine. When `autoExportCard` returns, `cancel()` executes immediately. In unit test verification (`TestSink01_PrematureContextCancellation`), `auto-export obsidian card 1: context canceled` was emitted immediately, resulting in 0 exported notes.
- Edge case checked: Any sink network or file export that yields or takes >0ms (including the 1.5s mock sink delay) fails immediately with `context canceled`.
- Links: Defect identified in `internal/core/core.go:2000-2005`; GitHub issue https://github.com/BurlacuAndrei/sparkkeep/issues/33

### 4.2 Auto-Export Settings Dynamic Toggle
- [x] **SINK-02**: Verify updating auto-export setting from `true` to `false` disables future auto-export runs.
**Why it is done?**
Fixes the bug where `loadAutoExportSettings` only set flags to `true` and never cleared them back to `false`.
- Status: FAIL
- Verified by / date / commit: Subagent 4 / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: In `internal/core/core.go:1954-1962`, `loadAutoExportSettings` tests `if v, _ := s.Store.GetSetting(...); v == "true" { s.autoExportX = true }`. If a user disables auto-export (`v == "false"`), the in-memory boolean flags are never cleared back to `false`. Once an export sink is enabled, subsequent cards continue to be exported even after the user toggles the setting off.
- Edge case checked: Setting `obsidian_auto_export` to `true`, triggering export, setting to `false`, and triggering triage again. In-memory flag `s.autoExportObsidian` remains `true` and the second card continues to be exported.
- Links: Defect identified in `internal/core/core.go:1954-1962`; GitHub issue https://github.com/BurlacuAndrei/sparkkeep/issues/34

### 4.3 Obsidian Vault Sync & Filename Sanitization
- [x] **SINK-03**: Verify Obsidian exporter strips illegal characters, creates frontmatter, and updates files idempotently on title change.
**Why it is done?**
Ensures notes write reliably across Windows/Mac/Linux filesystems without leaving duplicate files on note renames.
- Status: PASS
- Verified by / date / commit: Subagent 4 / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: `internal/obsidian/obsidian.go` implements `SanitizeFilename`, `CardToMarkdown`, `CardExportToMarkdown`, and `SyncCardExport`. Verified by `go test -v ./internal/obsidian/...` passing all 6 tests (`TestSanitizeFilename`, `TestCardToMarkdown`, `TestCardExportToMarkdown_WithResearch`, `TestSyncCardsToVault`, `TestSyncCardExport_TitleChangeIdempotency`, `TestTestVaultDirectory`). `unsafeCharRe = regexp.MustCompile(\`[<>:"/\\\\|?*\\x00-\\x1F]\`)` replaces illegal filesystem characters with space and collapses multiple spaces, while truncating at 80 runes safely. Frontmatter YAML contains id, title, horizon, status, source_url, tags, created_at, updated_at, researched. Files are written atomically via temp files and renamed, with old title variants cleaned up via `filepath.Glob` ensuring idempotency.
- Edge case checked: Tested title `"What is AI? <Deep Dive> / 2026 🚀"`. Produces sanitized filename `"What is AI Deep Dive 2026 🚀.md"` with illegal characters stripped and emoji preserved.
- Links: `internal/obsidian/obsidian.go:15-32,34-136,144-186`, `internal/obsidian/obsidian_test.go:13-34,172-230`.

### 4.4 Notion Schema Provisioning & 100-Block Limit Handling
- [x] **SINK-04**: Verify Notion sync automatically creates missing database columns and chunks exports exceeding 100 blocks.
**Why it is done?**
Notion `POST /pages` returns HTTP 400 if `children` contains >100 blocks; large research dossiers must append blocks in chunks.
- Status: FAIL
- Verified by / date / commit: Subagent 4 / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: `EnsureDatabaseSchema` in `internal/notion/notion.go:141-303` correctly validates and patches missing properties (`Sparkkeep ID`, `Card Type`, `Horizon`, `Status`, `Tags`, `Source URL`, `Created At`, `Updated At`, `Researched`). However, in `UpsertCardExport` (`internal/notion/notion.go:337`) and `createPage` (`internal/notion/notion.go:575-585`), all blocks are passed directly to Notion `POST /pages` in `"children": blocks`. Notion API documentation specifies a hard limit of 100 blocks in `POST /pages` children; pages with >100 blocks return HTTP 400 Bad Request. While `updatePage` uses `appendBlocks` in chunks of 100, `createPage` fails to chunk.
- Edge case checked: Card export with 130 blocks (claims + landscape + dossier) passed to `createPage`; payload sends all 130 children in the single `POST /pages` request without batching or appending the remaining 30 blocks.
- Links: Defect identified in `internal/notion/notion.go:337,575-585`; GitHub issue https://github.com/BurlacuAndrei/sparkkeep/issues/35

### 4.5 Joplin Clipper Discovery & Deterministic ID Upsert
- [x] **SINK-05**: Verify Joplin export connects to desktop Clipper or Joplin Server using deterministic SHA256 IDs.
**Why it is done?**
Ensures repeatedly syncing the same card updates the existing note instead of creating duplicate notes.
- Status: PASS
- Verified by / date / commit: Subagent 4 / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: `internal/joplin/joplin.go` implements deterministic 32-character SHA256 hex IDs for notes (`CardNoteID`), notebooks (`NotebookID`), and tags (`TagID`). Verified with `go test -v ./internal/joplin/...` passing all 8 tests (`TestCardNoteID`, `TestNotebookID`, `TestTagID`, `TestBuildMarkdownBody`, `TestBuildMarkdownBody_NoResearch`, `TestClient_ServerMode_Authentication`, `TestClient_ClipperMode`, `TestClient_UpsertCardExport_Idempotent`). In `UpsertCardExport`, `getNote(ctx, noteID)` checks for existing notes using the deterministic SHA256 ID, performing PUT on update or POST on create, ensuring stateless idempotency.
- Edge case checked: Joplin Clipper configured on custom/alternate port `http://127.0.0.1:41185` vs default `41184`. Supported via `Config.BaseURL` and `core.Service` settings check (`internal/core/core.go:1683-1690`).
- Links: `internal/joplin/joplin.go:68-83,166-212`, `internal/joplin/joplin_test.go:13-58,289-384`.

### 4.6 Library ZIP Archive Status Hierarchy
- [x] **SINK-06**: Verify `GET /api/v1/export/archive.zip` streams a valid ZIP file with correct folder mapping: `Inbox/`, `To-Do/`, `Doing/`, `Review/`, `Done/`.
**Why it is done?**
Fixes the bug where `port.StatusToDo` was omitted from the status switch, causing To-Do cards to default to Inbox.
- Status: FAIL
- Verified by / date / commit: Subagent 4 / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: In `internal/web/export_handler.go:97-107` (`exportLibraryZip`), the switch statement mapping card statuses to folders handles `port.StatusInProgress` ("Doing"), `port.StatusReview` ("Review"), `port.StatusDone` ("Done"), and `port.StatusShelved` ("Shelved"). `port.StatusToDo` ("to-do") is missing from the switch statement. As a consequence, cards with status `port.StatusToDo` fall through to the default `folder := "Inbox"`, placing them in `cards/Inbox/` instead of `cards/To-Do/`.
- Edge case checked: Creating and archiving a card with `Status: port.StatusToDo`; unzipping the archive confirms the card is incorrectly placed under `cards/Inbox/<id>_<title>.md` and `cards/To-Do/` is not generated.
- Links: Defect identified in `internal/web/export_handler.go:97-107`; GitHub issue https://github.com/BurlacuAndrei/sparkkeep/issues/36

### 4.7 Authenticated Outbox RSS Feed & Ampersand XML Escaping
- [x] **SINK-07**: Verify `GET /api/v1/feed.xml?token=...` produces well-formed RSS 2.0 XML with properly escaped ampersands (`&amp;`).
**Why it is done?**
Fixes the bug in `xmlEscape` where `&` was replaced with `&` rather than `&amp;`, breaking strict RSS feed readers.
- Status: FAIL
- Verified by / date / commit: Subagent 4 / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: In `internal/feed/feed.go:384-391`, `xmlEscape` contains identity replacements instead of XML entity encodings:
  ```go
  s = strings.ReplaceAll(s, "&", "&")
  s = strings.ReplaceAll(s, "<", "<")
  s = strings.ReplaceAll(s, ">", ">")
  ```
  `&` is replaced with `&` rather than `&amp;`, `<` is not escaped to `&lt;`, and `>` is not escaped to `&gt;`. Because `rssItem.ContentEnc` is typed as `template.HTML`, `xml.MarshalIndent` writes unescaped raw characters directly into `<content:encoded>`.
- Edge case checked: Card with title `"AT&T & Verizon <5G> & URL parameters: https://test.com?a=1&b=2"`. Calling `xml.Unmarshal` on the resulting RSS XML fails with syntax error due to bare ampersands and unclosed tags.
- Links: Defect identified in `internal/feed/feed.go:384-391`; GitHub issue https://github.com/BurlacuAndrei/sparkkeep/issues/37
