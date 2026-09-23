# 010 — store: SQLite repository + migrations

## Goal
Implement `port.Store` over SQLite (pure-Go `modernc.org/sqlite`, no cgo),
with embedded forward-only migrations. All card/tag/research CRUD from the
port contract works and is tested against a real temp-dir SQLite file.

## Context
- Read `docs/design.md` (sections 2 and 3) and `internal/port/*.go` first.
- Consumes the exact interfaces from task 000. Do not modify `internal/port`.
- Add dependency: `go get modernc.org/sqlite` (only new dependency; this is
  the SQLite choice from design §2).

## Files
- Create `internal/store/store.go` — SQLite store implementing `port.Store`.
- Create `internal/store/migrate.go` — embedded migration runner.
- Create `internal/store/migrations/0001_init.sql`
- Create `internal/store/store_test.go`

## Schema (via `0001_init.sql`)
```sql
CREATE TABLE cards (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    summary     TEXT NOT NULL DEFAULT '',
    horizon     TEXT NOT NULL DEFAULT 'short-term',
    status      TEXT NOT NULL DEFAULT 'inbox',
    source_url  TEXT NOT NULL DEFAULT '',
    source_note TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE INDEX idx_cards_horizon ON cards (horizon);
CREATE INDEX idx_cards_status  ON cards (status);

CREATE TABLE tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);
CREATE TABLE cards_tags (
    card_id INTEGER NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
    PRIMARY KEY (card_id, tag_id)
);

CREATE TABLE research (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id    INTEGER NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
    status     TEXT NOT NULL DEFAULT 'queued',
    query      TEXT NOT NULL DEFAULT '',
    findings   TEXT NOT NULL DEFAULT '',
    error      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
```

## Migration runner rules (`migrate.go`)
- `//go:embed migrations/*.sql` inside package; embed a `schema_version`
  table (`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT
  NULL PRIMARY KEY, applied_at TEXT NOT NULL)`).
- On `Open`, run pending migrations in filename order (lexicographic
  `0001_...` sort is enough) inside a transaction; `migrate.go` executes
  SQL files in a transaction each, updates `schema_version`.
- `ponytail: forward-only migrations; no down migration, no library — add
  one only if you ever need conflicts or downward moves.`

## Behavior
- `New(path string) (*Store, error)` — opens SQLite `file:path` with
  `_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)`, runs migrations,
  and requires that the created `*Store` satisfies `port.Store` (compile
  harness `var _ port.Store = (*Store)(nil)`).
- `CreateCard`: insert card; insert tags (Upsert by name, `INSERT ... ON
  CONFLICT(name) DO NOTHING` then select id); join via `cards_tags`;
  `CreatedAt`/`UpdatedAt` UTC RFC3339 (`time.Time` → store as RFC3339 via
  `Format(time.RFC3339)`, parse back with `time.Parse`).
- `GetCard`: returns `port.Card` with tags; `port.ErrNotFound` error
  (defined in `internal/port` as `var ErrNotFound = errors.New("not found")`
  — **add it to `internal/port/store.go`** if not present) when no row.
- `ListCards(f CardFilter)`: filter by horizon/status/tag (EXISTS subquery)
  and `Query` = `LOWER(title) LIKE '%'||lower(?1)||'%' OR LOWER(summary)
  LIKE ...`; order by `updated_at DESC`; apply `Limit` (default 100) via
  `LIMIT ?`. Always populate `Tags`.
- `UpdateCard(id, p port.CardPatch)`: apply only non-nil patch fields
  (`Status`, `Horizon`, `Note`→`source_note`) with a dynamic `SET`; if patch
  is empty/unknown id, return `(card, ErrNotFound)`.
- `SetCardTags`: delete existing `cards_tags` for card, re-insert given list
  (upsert tags table as before).
- `ListTags`: `SELECT t.name, COUNT(ct.card_id) FROM tags t LEFT JOIN
  cards_tags ct ON t.id = ct.tag_id GROUP BY t.id ORDER BY t.name`.
- `CreateResearch`, `SetResearch`, `GetResearch`, `ListResearch`: plain CRUD
  using `port.Research`; `SetResearch` updates `status`, `findings`,
  `error` and returns the updated row.
- `Close()` closes DB handle.

## Tests (`store_test.go`, stdlib `testing`)
Run against `t.TempDir()` (`filepath.Join(t.TempDir(), "test.db")`). Table‑driven where sensible.
- `TestMigrate` — fresh DB: `schema_version` has (1); `cards` table exists.
- `TestCreateAndGetCard` — roundtrip with tags + horizon.
- `TestCreateCardNotFound` — `GetCard` unknown id returns `port.ErrNotFound`.
- `TestListCardsFilter` — given 3 cards (2 horizon values, 1 with tag
  "trading"), assert filter by horizon, tag, query-word, and `Limit`.
- `TestUpdateCardPatch` — patch only status → other fields unchanged; empty
  patch → `ErrNotFound`.
- `TestSetCardTagsReplace` — set(tags A) then set(tags B) → only B remains.
- `TestListTagsCounts` — after tagging 2 cards with same tag, count=2.
- `TestResearchCRUD` — create, set status/findings/error, get, list.
- `TestCloseDoubleClose` — `Close()` twice is safe (second returns nil).

## Definition of done
- `go build ./...`, `go vet ./...`, `make test` all pass.
- `gofmt -l .` empty; commit: `feat: sqlite store with migrations`.