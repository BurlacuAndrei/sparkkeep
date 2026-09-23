package store

import (
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"time"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

// migrate applies embedded forward-only migrations in filename order.
// ponytail: forward-only migrations; no down migration, no library — add
// one only if you ever need conflicts or downward moves.
func migrate(db *sql.DB) error {
	if _, err := db.Exec(
		`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
		return err
	}

	files, err := fs.Glob(migrationFS, "migrations/*.sql")
	if err != nil {
		return err
	}
	sort.Strings(files)

	var current int
	if err := db.QueryRow(`SELECT COALESCE(MAX(version), 0) FROM schema_version`).Scan(&current); err != nil {
		return err
	}

	for _, file := range files {
		var version int
		if _, err := fmt.Sscanf(file, "migrations/%d", &version); err != nil {
			return fmt.Errorf("store: parse migration filename %s: %w", file, err)
		}
		if version <= current {
			continue
		}
		sqlBytes, err := migrationFS.ReadFile(file)
		if err != nil {
			return err
		}
		tx, err := db.Begin()
		if err != nil {
			return err
		}
		if _, err := tx.Exec(string(sqlBytes)); err != nil {
			tx.Rollback()
			return fmt.Errorf("store: apply %s: %w", file, err)
		}
		if _, err := tx.Exec(`INSERT INTO schema_version (version, applied_at) VALUES (?, ?)`,
			version, time.Now().UTC().Format(time.RFC3339)); err != nil {
			tx.Rollback()
			return fmt.Errorf("store: record %s: %w", file, err)
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}
