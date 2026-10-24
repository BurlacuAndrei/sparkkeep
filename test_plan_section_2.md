## 2. Backend Core & Data Persistence

### 2.1 Concurrent Ingestion & Deduplication
- [ ] **CORE-01**: Verify concurrent `CaptureShare` requests with identical URLs create exactly one card and safely handle unique constraints.
**Why it is done?**
Ensures simultaneous capture requests (e.g. rapid double-clicks, duplicate bot webhooks) do not corrupt the database or create orphaned records.
- Status: FAIL
- Verified by / date / commit: Subagent 2 (Backend Core & Data Persistence) / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: Concurrent `CaptureShare` calls for identical URL `https://example.com/item-1` fail deduplication. When concurrent goroutines encounter a unique constraint conflict on `captures.source_url`, `s.Store.GetCardBySourceURL` returns `port.ErrNotFound` because the initial winning goroutine has not finished LLM triage or inserted the card yet. The concurrent calls fall through to `llmClient.Analyze` and each call `CreateCard`, producing duplicate cards instead of 1.
- Edge case checked: 10 concurrent requests with identical `source_url` and different user captions (`Caption from user 0..9`). Observed 10 separate card records created in `cards` table.
- Links: https://github.com/BurlacuAndrei/sparkkeep/issues/41, `internal/core/core.go:434-448`

### 2.2 Atomic Card, Tag, and Reference Creation
- [ ] **CORE-02**: Verify `Store.CreateCard` executes within a single atomic database transaction.
**Why it is done?**
Prevents partial database writes where a card row is persisted without its associated tags or references if an error occurs mid-creation.
- Status: FAIL
- Verified by / date / commit: Subagent 2 (Backend Core & Data Persistence) / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: `Store.CreateCard` in `internal/store/cards.go` executes `INSERT INTO cards` directly on `s.db` outside of any database transaction. Only subsequent tag and reference insertions execute inside a newly opened `s.db.BeginTx()`. When tag insertion fails (tested via `BEFORE INSERT ON cards_tags` trigger raising ABORT), only the tag sub-transaction rolls back. The card row in `cards` remains committed and persisted, leaving an orphaned card with 0 tags.
- Edge case checked: Forced failure during tag insertion via trigger. `SELECT COUNT(*) FROM cards` returned 1 row despite `CreateCard` returning an error.
- Links: https://github.com/BurlacuAndrei/sparkkeep/issues/42, `internal/store/cards.go:15-202`

### 2.3 SQLite WAL Concurrency & Head-of-Line Blocking Resilience
- [x] **CORE-03**: Verify SQLite connection pool handles concurrent write operations while a large read scan is in progress without `database is locked` errors.
**Why it is done?**
Validates `SetMaxOpenConns(1)` serialization and `busy_timeout=5000ms` under background worker and web API concurrency.
- Status: PASS
- Verified by / date / commit: Subagent 2 (Backend Core & Data Persistence) / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: SQLite configured with WAL mode (`journal_mode=WAL`), `busy_timeout=5000ms`, and single connection pool serialization (`db.SetMaxOpenConns(1)`). Executed 20 concurrent card updates during an active cursor read scan sleeping 15ms per row; all 20 writes completed cleanly without `database is locked`.
- Edge case checked: 20 concurrent card updates during full library export (5 sequential iterations of `ListCards` + `ListResearchByCard` across 50 cards). All updates completed with 0 errors.
- Links: `internal/store/store.go:37-43`

### 2.4 FTS5 Full-Text Search Sanitization
- [x] **CORE-04**: Verify full-text search against `cards_fts` safely handles unbalanced quotes, boolean operators, and special syntax.
**Why it is done?**
Prevents SQL/FTS query syntax errors when users search for code snippets, punctuation, or complex strings.
- Status: PARTIAL
- Verified by / date / commit: Subagent 2 (Backend Core & Data Persistence) / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: `sanitizeFTSQuery` safely strips quotes and formats phrases for SQLite FTS5 prefix matching. The literal query `""" NOT AND OR NEAR C++ && \x00` passed without error. Unbalanced quotes (`"`, `""`, `"""`, `""""`, `"unclosed`), boolean operators (`AND`, `OR`, `NOT`, `NEAR`, `NEAR/5`), and syntax symbols (`C++`, `&&`, `||`, `!`, `()`, `{}`, `[]`, `^`, `~`) all execute safely. However, an unescaped raw null byte (`\x00` / 0x00) is not stripped by `sanitizeFTSQuery`, causing Modernc SQLite C-string truncation before the closing quote and failing with `SQL logic error: unterminated string (1)`.
- Edge case checked: Query with literal `""" NOT AND OR NEAR C++ && \x00` passed; raw null byte query `test\x00nullbyte` failed with unterminated string error.
- Links: https://github.com/BurlacuAndrei/sparkkeep/issues/45, `internal/store/cards.go:394-434`

### 2.5 Background Worker Queue Isolation & Panic Recovery
- [ ] **CORE-05**: Verify background queue workers and `GoResearch` catch panics via `recover()` and mark tasks as failed without crashing the process.
**Why it is done?**
Prevents unhandled nil-pointer dereferences or malformed payload panics in async workers from terminating the main server daemon.
- Status: FAIL
- Verified by / date / commit: Subagent 2 (Backend Core & Data Persistence) / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: Code inspection and runtime verification confirmed `recover()` is absent from `GoResearch`, `StartQueueWorker`, `ProcessNextQueued`, `executeResearch`, and `research.Runner.RunWithID`. An unexpected panic terminates the entire server process. Tasks remain in `running` status and the background queue cannot advance to next queued items.
- Edge case checked: Injected panic during research execution. Verified no recovery handler exists; process crashes, task remains stuck in `running` state.
- Links: https://github.com/BurlacuAndrei/sparkkeep/issues/44, `internal/core/core.go:151-156`, `internal/core/queue.go:442-473`

### 2.6 Analysis Degradation & In-Place Retry Flow
- [x] **CORE-06**: Verify that if triage LLM call times out or fails, an "Analysis failed" card is created, preserving raw capture, and subsequent retry succeeds.
**Why it is done?**
Guarantees zero data loss when upstream LLM providers suffer transient outages.
- Status: PASS
- Verified by / date / commit: Subagent 2 (Backend Core & Data Persistence) / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: When triage LLM fails, `s.failCard` persists an `Analysis failed` card with `AnalysisFailed: true` linked to `captures.id`, preserving raw capture text and transcript. Calling `s.Retry(ctx, cardID)` re-analyzes from capture data without data loss. Verified via `go test -v ./internal/core -run "TestRetry.*"` (all 9 unit tests pass).
- Edge case checked: Multi-idea card retry dismisses original failed card and generates N new cards linked to the capture (`TestRetryMultiIdea`); single subject card retry updates the failed card in place with `AnalysisFailed: false` (`TestRetrySubjectCardInPlace`).
- Links: `internal/core/core.go:807-1021`, `internal/core/core.go:1444-1487`, `internal/core/core_test.go:1364-1410`, `internal/core/core_test.go:2421-2480`
