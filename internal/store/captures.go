package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"sparkkeep/internal/port"
)

func scanCapture(row rowScanner) (port.Capture, error) {
	var c port.Capture
	var notesJSON string
	var created string
	err := row.Scan(&c.ID, &c.Kind, &c.SourceURL, &c.SourceChannel, &c.Title, &c.Description, &c.Text, &c.Caption, &c.Transcript, &c.ImageDigest, &notesJSON, &created)
	if err != nil {
		return port.Capture{}, err
	}
	c.Provenance = port.Provenance{Channel: c.SourceChannel}
	if notesJSON != "" {
		_ = json.Unmarshal([]byte(notesJSON), &c.Notes)
	}
	if c.Notes == nil {
		c.Notes = []string{}
	}
	c.CreatedAt, _ = parseTime(created)
	return c, nil
}

func (s *Store) CreateCapture(ctx context.Context, c port.Capture) (port.Capture, error) {
	ts := now()
	notesJSON := "[]"
	if len(c.Notes) > 0 {
		if b, err := json.Marshal(c.Notes); err == nil {
			notesJSON = string(b)
		}
	}
	sourceChannel := c.SourceChannel
	if sourceChannel == "" {
		sourceChannel = c.Provenance.Channel
	}
	if sourceChannel == "" {
		sourceChannel = "web"
	}
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO captures (kind, source_url, source_channel, title, description, text, caption, transcript, image_digest, notes, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		c.Kind, c.SourceURL, sourceChannel, c.Title, c.Description, c.Text, c.Caption, c.Transcript, c.ImageDigest, notesJSON, ts)
	if err != nil {
		if isUniqueConstraint(err) {
			return port.Capture{}, fmt.Errorf("%w: %v", port.ErrConflict, err)
		}
		return port.Capture{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return port.Capture{}, err
	}
	c.ID = id
	c.SourceChannel = sourceChannel
	c.Provenance.Channel = sourceChannel
	t, _ := parseTime(ts)
	c.CreatedAt = t
	if c.Notes == nil {
		c.Notes = []string{}
	}
	return c, nil
}

func (s *Store) GetCapture(ctx context.Context, id int64) (port.Capture, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, kind, source_url, source_channel, title, description, text, caption, transcript, image_digest, notes, created_at
		 FROM captures WHERE id = ?`, id)
	c, err := scanCapture(row)
	if errors.Is(err, sql.ErrNoRows) {
		return port.Capture{}, port.ErrNotFound
	}
	if err != nil {
		return port.Capture{}, err
	}
	return c, nil
}

func (s *Store) GetCaptureBySourceURL(ctx context.Context, url string) (port.Capture, error) {
	url = strings.TrimSpace(url)
	if url == "" {
		return port.Capture{}, port.ErrNotFound
	}
	var id int64
	err := s.db.QueryRowContext(ctx,
		`SELECT id FROM captures WHERE source_url = ? ORDER BY id LIMIT 1`, url).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return port.Capture{}, port.ErrNotFound
	}
	if err != nil {
		return port.Capture{}, err
	}
	return s.GetCapture(ctx, id)
}

func (s *Store) UpdateCapture(ctx context.Context, c port.Capture) (port.Capture, error) {
	notesJSON := "[]"
	if len(c.Notes) > 0 {
		if b, err := json.Marshal(c.Notes); err == nil {
			notesJSON = string(b)
		}
	}
	res, err := s.db.ExecContext(ctx,
		`UPDATE captures SET kind = ?, source_url = ?, title = ?, description = ?, text = ?, caption = ?, transcript = ?, image_digest = ?, notes = ? WHERE id = ?`,
		c.Kind, c.SourceURL, c.Title, c.Description, c.Text, c.Caption, c.Transcript, c.ImageDigest, notesJSON, c.ID)
	if err != nil {
		if isUniqueConstraint(err) {
			return port.Capture{}, fmt.Errorf("%w: %v", port.ErrConflict, err)
		}
		return port.Capture{}, err
	}
	if n, err := res.RowsAffected(); err != nil || n == 0 {
		return port.Capture{}, port.ErrNotFound
	}
	return s.GetCapture(ctx, c.ID)
}
