package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"

	"sparkkeep/internal/port"
)

var DefaultCardTypes = port.DefaultCardTypes

func (s *Store) GetSetting(ctx context.Context, key string) (string, error) {
	var val string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, key).Scan(&val)
	if errors.Is(err, sql.ErrNoRows) {
		return "", port.ErrNotFound
	}
	return val, err
}

func (s *Store) SetSetting(ctx context.Context, key, value string) error {
	ts := now()
	_, err := s.db.ExecContext(ctx, `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		key, value, ts)
	return err
}

func (s *Store) ListSettings(ctx context.Context) (map[string]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT key, value FROM settings ORDER BY key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	res := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		res[k] = v
	}
	return res, rows.Err()
}

func defaultCardTypes() []string {
	res := make([]string, len(DefaultCardTypes))
	copy(res, DefaultCardTypes)
	return res
}

func (s *Store) GetCardTypes(ctx context.Context) ([]string, error) {
	val, err := s.GetSetting(ctx, "card_types")
	if err != nil {
		if errors.Is(err, port.ErrNotFound) {
			return defaultCardTypes(), nil
		}
		return nil, err
	}
	if strings.TrimSpace(val) == "" {
		return defaultCardTypes(), nil
	}
	var types []string
	if err := json.Unmarshal([]byte(val), &types); err != nil || types == nil {
		return defaultCardTypes(), nil
	}
	return types, nil
}

func (s *Store) SetCardTypes(ctx context.Context, types []string) error {
	if types == nil {
		types = []string{}
	}
	data, err := json.Marshal(types)
	if err != nil {
		return err
	}
	return s.SetSetting(ctx, "card_types", string(data))
}
