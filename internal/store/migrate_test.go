package store

import (
	"database/sql"
	"path/filepath"
	"strings"
	"testing"
)

// TestMigrateRefusesNewerSchema proves an older binary refuses to run against a
// database written by a newer one instead of failing later with "no such column".
func TestMigrateRefusesNewerSchema(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "future.db")
	db, err := sql.Open("sqlite", "file:"+dbPath)
	if err != nil {
		t.Fatalf("open seed db: %v", err)
	}
	if _, err := db.Exec(`CREATE TABLE schema_version (version INTEGER NOT NULL PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
		t.Fatalf("create schema_version: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO schema_version (version, applied_at) VALUES (99, '2030-01-01T00:00:00Z')`); err != nil {
		t.Fatalf("seed schema_version: %v", err)
	}
	db.Close()

	if _, err := New(dbPath); err == nil || !strings.Contains(err.Error(), "newer than this binary") {
		t.Fatalf("New on newer schema: err = %v, want downgrade guard error", err)
	}
}
