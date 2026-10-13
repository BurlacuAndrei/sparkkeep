package store

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	_ "modernc.org/sqlite"

	"sparkkeep/internal/port"
)

var (
	_ port.Store               = (*Store)(nil)
	_ port.CardStore           = (*Store)(nil)
	_ port.CaptureStore        = (*Store)(nil)
	_ port.ResearchStore       = (*Store)(nil)
	_ port.PlaybookStore       = (*Store)(nil)
	_ port.SettingsStore       = (*Store)(nil)
	_ port.MetricsStore        = (*Store)(nil)
	_ port.ChannelMessageStore = (*Store)(nil)
)

const (
	timeLayout   = time.RFC3339
	defaultLimit = 100
	maxTagPairs  = 400
)

type Store struct {
	db *sql.DB
}

func New(path string) (*Store, error) {
	dsn := "file:" + path + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("store: open %s: %w", path, err)
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(0)
	if err := migrate(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("store: migrate: %w", err)
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func now() string {
	return time.Now().UTC().Format(timeLayout)
}

func parseTime(s string) (time.Time, error) {
	return time.Parse(timeLayout, s)
}

// staleCutoff is the RFC3339 timestamp a card's updated_at must precede to
// count as stale — the single definition shared by the list filter and the
// batch shelve, so the two can't drift.
func staleCutoff(days int) string {
	return time.Now().UTC().AddDate(0, 0, -days).Format(timeLayout)
}

// upsertTag returns the id for name, inserting if absent.
func (s *Store) upsertTag(ctx context.Context, tx *sql.Tx, name string) (int64, error) {
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING`, name); err != nil {
		return 0, err
	}
	var id int64
	if err := tx.QueryRowContext(ctx, `SELECT id FROM tags WHERE name = ?`, name).Scan(&id); err != nil {
		return 0, err
	}
	return id, nil
}

func isUniqueConstraint(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "UNIQUE constraint failed") ||
		strings.Contains(msg, "unique constraint") ||
		strings.Contains(msg, "idx_cards_source") ||
		strings.Contains(msg, "idx_captures_source")
}

type rowScanner interface {
	Scan(dest ...any) error
}
