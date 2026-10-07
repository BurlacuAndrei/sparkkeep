package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	_ "modernc.org/sqlite"

	"sparkkeep/internal/port"
)

var _ port.Store = (*Store)(nil)

const (
	timeLayout   = time.RFC3339
	defaultLimit = 100
	maxTagPairs  = 400
)

type Store struct {
	db *sql.DB
}

func New(path string) (*Store, error) {
	dsn := "file:" + path + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("store: open %s: %w", path, err)
	}
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

func (s *Store) CreateCard(ctx context.Context, c port.Card) (port.Card, error) {
	return s.createCard(ctx, s.db, c)
}

func (s *Store) createCard(ctx context.Context, exec interface {
	ExecContext(context.Context, string, ...interface{}) (sql.Result, error)
	QueryRowContext(context.Context, string, ...interface{}) *sql.Row
}, c port.Card) (port.Card, error) {
	ts := now()
	actionsJSON := "[]"
	if len(c.ProposedActions) > 0 {
		if b, err := json.Marshal(c.ProposedActions); err == nil {
			actionsJSON = string(b)
		}
	}
	var captureID any
	if c.CaptureID != nil {
		captureID = *c.CaptureID
	}
	res, err := exec.ExecContext(ctx,
		`INSERT INTO cards (capture_id, title, summary, horizon, status, source_url, source_note, executive_summary, value_proposition, proposed_actions, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		captureID, c.Title, c.Summary, c.Horizon, c.Status, c.SourceURL, c.SourceNote, c.ExecutiveSummary, c.ValueProposition, actionsJSON, ts, ts)
	if err != nil {
		if isUniqueConstraint(err) {
			return port.Card{}, fmt.Errorf("%w: %v", port.ErrConflict, err)
		}
		return port.Card{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return port.Card{}, err
	}
	c.ID = id
	c.CreatedAt, _ = parseTime(ts)
	c.UpdatedAt = c.CreatedAt
	if c.ProposedActions == nil {
		c.ProposedActions = []string{}
	}
	if c.References == nil {
		c.References = []port.Reference{}
	}
	if len(c.Tags) > 0 || len(c.References) > 0 {
		tx, ok := exec.(*sql.Tx)
		if !ok {
			tx, err = s.db.BeginTx(ctx, nil)
			if err != nil {
				return port.Card{}, err
			}
			defer tx.Rollback()
		}
		for _, name := range c.Tags {
			tagID, err := s.upsertTag(ctx, tx, name)
			if err != nil {
				return port.Card{}, err
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO cards_tags (card_id, tag_id) VALUES (?, ?)`, id, tagID); err != nil {
				return port.Card{}, err
			}
		}
		for i, ref := range c.References {
			if _, err := tx.ExecContext(ctx,
				`INSERT INTO card_references (card_id, kind, label, url, position) VALUES (?, ?, ?, ?, ?)`,
				id, ref.Kind, ref.Label, ref.URL, i); err != nil {
				return port.Card{}, err
			}
		}
		if !ok {
			if err := tx.Commit(); err != nil {
				return port.Card{}, err
			}
		}
	}
	return c, nil
}

func (s *Store) GetCard(ctx context.Context, id int64) (port.Card, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, capture_id, title, summary, horizon, status, source_url, source_note, executive_summary, value_proposition, proposed_actions, created_at, updated_at
		 FROM cards WHERE id = ?`, id)
	var c port.Card
	var captureID sql.NullInt64
	var created, updated string
	var actionsRaw string
	err := row.Scan(&c.ID, &captureID, &c.Title, &c.Summary, &c.Horizon, &c.Status, &c.SourceURL, &c.SourceNote, &c.ExecutiveSummary, &c.ValueProposition, &actionsRaw, &created, &updated)
	if errors.Is(err, sql.ErrNoRows) {
		return port.Card{}, port.ErrNotFound
	}
	if err != nil {
		return port.Card{}, err
	}
	if captureID.Valid {
		c.CaptureID = &captureID.Int64
	}
	c.CreatedAt, _ = parseTime(created)
	c.UpdatedAt, _ = parseTime(updated)
	if actionsRaw != "" {
		_ = json.Unmarshal([]byte(actionsRaw), &c.ProposedActions)
	}
	if c.ProposedActions == nil {
		c.ProposedActions = []string{}
	}
	tags, err := s.cardTags(ctx, id)
	if err != nil {
		return port.Card{}, err
	}
	c.Tags = tags
	refs, err := s.cardReferences(ctx, id)
	if err != nil {
		return port.Card{}, err
	}
	c.References = refs
	return c, nil
}

func (s *Store) cardReferences(ctx context.Context, cardID int64) ([]port.Reference, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT kind, label, url FROM card_references WHERE card_id = ? ORDER BY position ASC, id ASC`,
		cardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	refs := []port.Reference{}
	for rows.Next() {
		var r port.Reference
		if err := rows.Scan(&r.Kind, &r.Label, &r.URL); err != nil {
			return nil, err
		}
		refs = append(refs, r)
	}
	return refs, rows.Err()
}

// GetCardBySourceURL returns the oldest card bearing url (trimmed) or
// ErrNotFound. The dedup check that calls it only compares the exact,
// trimmed source URL — no canonicalization, comma-twins are a manual merge.
func (s *Store) GetCardBySourceURL(ctx context.Context, url string) (port.Card, error) {
	url = strings.TrimSpace(url)
	if url == "" {
		return port.Card{}, port.ErrNotFound
	}
	row := s.db.QueryRowContext(ctx,
		`SELECT id FROM cards WHERE source_url = ? ORDER BY id LIMIT 1`, url)
	var id int64
	err := row.Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return port.Card{}, port.ErrNotFound
	}
	if err != nil {
		return port.Card{}, err
	}
	return s.GetCard(ctx, id)
}

func (s *Store) cardTags(ctx context.Context, cardID int64) ([]string, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT t.name FROM tags t JOIN cards_tags ct ON t.id = ct.tag_id WHERE ct.card_id = ? ORDER BY t.name`,
		cardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var tags []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		tags = append(tags, name)
	}
	return tags, rows.Err()
}

func (s *Store) ListCards(ctx context.Context, f port.CardFilter) ([]port.Card, error) {
	var where []string
	var args []any
	if f.Horizon != "" {
		where = append(where, "horizon = ?")
		args = append(args, f.Horizon)
	}
	if f.Status != "" {
		where = append(where, "status = ?")
		args = append(args, f.Status)
	}
	if f.Tag != "" {
		where = append(where, "EXISTS (SELECT 1 FROM cards_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.card_id = cards.id AND t.name = ?)")
		args = append(args, f.Tag)
	}
	if f.Query != "" {
		q := "%" + strings.ToLower(f.Query) + "%"
		where = append(where, "(LOWER(title) LIKE ? OR LOWER(summary) LIKE ? OR LOWER(executive_summary) LIKE ?)")
		args = append(args, q, q, q)
	}
	if !f.Since.IsZero() {
		where = append(where, "created_at >= ?")
		args = append(args, f.Since.Format(timeLayout))
	}
	if f.StaleDays > 0 {
		where = append(where, "updated_at < ?")
		args = append(args, staleCutoff(f.StaleDays))
	}
	limit := f.Limit
	if limit <= 0 {
		limit = defaultLimit
	}
	sqlq := `SELECT id, capture_id, title, summary, horizon, status, source_url, source_note, executive_summary, value_proposition, proposed_actions, created_at, updated_at FROM cards`
	if len(where) > 0 {
		sqlq += " WHERE " + strings.Join(where, " AND ")
	}
	sqlq += " ORDER BY updated_at DESC LIMIT ?"
	args = append(args, limit)
	if f.Offset > 0 {
		sqlq += " OFFSET ?"
		args = append(args, f.Offset)
	}

	rows, err := s.db.QueryContext(ctx, sqlq, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var cards []port.Card
	for rows.Next() {
		var c port.Card
		var captureID sql.NullInt64
		var created, updated string
		var actionsRaw string
		if err := rows.Scan(&c.ID, &captureID, &c.Title, &c.Summary, &c.Horizon, &c.Status, &c.SourceURL, &c.SourceNote, &c.ExecutiveSummary, &c.ValueProposition, &actionsRaw, &created, &updated); err != nil {
			return nil, err
		}
		if captureID.Valid {
			c.CaptureID = &captureID.Int64
		}
		c.CreatedAt, _ = parseTime(created)
		c.UpdatedAt, _ = parseTime(updated)
		if actionsRaw != "" {
			_ = json.Unmarshal([]byte(actionsRaw), &c.ProposedActions)
		}
		if c.ProposedActions == nil {
			c.ProposedActions = []string{}
		}
		cards = append(cards, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(cards) == 0 {
		return cards, nil
	}

	tagsByCard := make(map[int64][]string, len(cards))
	const tagBatchSize = 500
	for i := 0; i < len(cards); i += tagBatchSize {
		end := i + tagBatchSize
		if end > len(cards) {
			end = len(cards)
		}
		chunk := cards[i:end]
		cardIDs := make([]any, len(chunk))
		placeholders := make([]string, len(chunk))
		for j, c := range chunk {
			cardIDs[j] = c.ID
			placeholders[j] = "?"
		}
		tagQuery := fmt.Sprintf(`SELECT ct.card_id, t.name FROM cards_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.card_id IN (%s) ORDER BY t.name`, strings.Join(placeholders, ","))
		tagRows, err := s.db.QueryContext(ctx, tagQuery, cardIDs...)
		if err != nil {
			return nil, err
		}
		for tagRows.Next() {
			var cid int64
			var name string
			if err := tagRows.Scan(&cid, &name); err != nil {
				tagRows.Close()
				return nil, err
			}
			tagsByCard[cid] = append(tagsByCard[cid], name)
		}
		if err := tagRows.Err(); err != nil {
			tagRows.Close()
			return nil, err
		}
		tagRows.Close()
	}

	refsByCard := make(map[int64][]port.Reference, len(cards))
	for i := 0; i < len(cards); i += tagBatchSize {
		end := i + tagBatchSize
		if end > len(cards) {
			end = len(cards)
		}
		chunk := cards[i:end]
		cardIDs := make([]any, len(chunk))
		placeholders := make([]string, len(chunk))
		for j, c := range chunk {
			cardIDs[j] = c.ID
			placeholders[j] = "?"
		}
		refQuery := fmt.Sprintf(`SELECT card_id, kind, label, url FROM card_references WHERE card_id IN (%s) ORDER BY position ASC, id ASC`, strings.Join(placeholders, ","))
		refRows, err := s.db.QueryContext(ctx, refQuery, cardIDs...)
		if err != nil {
			return nil, err
		}
		for refRows.Next() {
			var cid int64
			var r port.Reference
			if err := refRows.Scan(&cid, &r.Kind, &r.Label, &r.URL); err != nil {
				refRows.Close()
				return nil, err
			}
			refsByCard[cid] = append(refsByCard[cid], r)
		}
		if err := refRows.Err(); err != nil {
			refRows.Close()
			return nil, err
		}
		refRows.Close()
	}

	for i := range cards {
		cards[i].Tags = tagsByCard[cards[i].ID]
		refs := refsByCard[cards[i].ID]
		if refs == nil {
			refs = []port.Reference{}
		}
		cards[i].References = refs
	}
	return cards, nil
}

type updateBuilder struct {
	table string
	sets  []string
	args  []any
	idCol string
	idVal any
}

func newUpdateBuilder(table, idCol string, idVal any) *updateBuilder {
	return &updateBuilder{table: table, idCol: idCol, idVal: idVal}
}

func (b *updateBuilder) set(col string, val any) {
	b.sets = append(b.sets, col+" = ?")
	b.args = append(b.args, val)
}

func (b *updateBuilder) empty() bool {
	return len(b.sets) == 0
}

func (b *updateBuilder) build() (string, []any) {
	b.sets = append(b.sets, "updated_at = ?")
	b.args = append(b.args, now())
	b.args = append(b.args, b.idVal)
	query := fmt.Sprintf("UPDATE %s SET %s WHERE %s = ?", b.table, strings.Join(b.sets, ", "), b.idCol)
	return query, b.args
}

func (s *Store) UpdateCard(ctx context.Context, id int64, p port.CardPatch) (port.Card, error) {
	b := newUpdateBuilder("cards", "id", id)
	if p.Status != nil {
		b.set("status", *p.Status)
	}
	if p.Horizon != nil {
		b.set("horizon", *p.Horizon)
	}
	if p.Note != nil {
		b.set("source_note", *p.Note)
	}
	if p.SourceURL != nil {
		b.set("source_url", *p.SourceURL)
	}
	if p.ExecutiveSummary != nil {
		b.set("executive_summary", *p.ExecutiveSummary)
	}
	if p.ValueProposition != nil {
		b.set("value_proposition", *p.ValueProposition)
	}
	if p.ProposedActions != nil {
		actionsJSON := "[]"
		if data, err := json.Marshal(*p.ProposedActions); err == nil {
			actionsJSON = string(data)
		}
		b.set("proposed_actions", actionsJSON)
	}
	if p.CaptureID != nil {
		b.set("capture_id", *p.CaptureID)
	}
	if p.References != nil {
		if err := s.SetCardReferences(ctx, id, *p.References); err != nil {
			return port.Card{}, err
		}
		// ensure updated_at is refreshed on the card
		b.set("updated_at", now())
	}
	if b.empty() {
		return s.GetCard(ctx, id)
	}

	query, args := b.build()
	res, err := s.db.ExecContext(ctx, query, args...)
	if err != nil {
		return port.Card{}, err
	}
	if n, err := res.RowsAffected(); err != nil || n == 0 {
		return port.Card{}, port.ErrNotFound
	}
	return s.GetCard(ctx, id)
}

// ShelveStale shelves every inbox/doing card untouched for more than days in
// one statement and returns the number of rows changed.
func (s *Store) ShelveStale(ctx context.Context, days int) (int64, error) {
	res, err := s.db.ExecContext(ctx,
		`UPDATE cards SET status = ?, updated_at = ? WHERE status IN (?, ?) AND updated_at < ?`,
		port.StatusShelved, now(), port.StatusInbox, port.StatusDoing, staleCutoff(days))
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (s *Store) SetCardTags(ctx context.Context, id int64, tags []string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM cards_tags WHERE card_id = ?`, id); err != nil {
		return err
	}
	for _, name := range tags {
		tagID, err := s.upsertTag(ctx, tx, name)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO cards_tags (card_id, tag_id) VALUES (?, ?)`, id, tagID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) SetCardReferences(ctx context.Context, id int64, refs []port.Reference) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM card_references WHERE card_id = ?`, id); err != nil {
		return err
	}
	for i, ref := range refs {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO card_references (card_id, kind, label, url, position) VALUES (?, ?, ?, ?, ?)`,
			id, ref.Kind, ref.Label, ref.URL, i); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) ListTags(ctx context.Context) ([]port.Tag, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT t.name, COUNT(ct.card_id) FROM tags t LEFT JOIN cards_tags ct ON t.id = ct.tag_id GROUP BY t.id ORDER BY t.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var tags []port.Tag
	for rows.Next() {
		var t port.Tag
		if err := rows.Scan(&t.Name, &t.Count); err != nil {
			return nil, err
		}
		tags = append(tags, t)
	}
	return tags, rows.Err()
}

func (s *Store) CreateResearch(ctx context.Context, cardID int64, query string) (port.Research, error) {
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO research (card_id, status, query, findings, error, created_at)
		 SELECT ?, 'queued', ?, '', '', ?
		 WHERE NOT EXISTS (SELECT 1 FROM research WHERE card_id = ? AND status IN ('queued', 'running'))`,
		cardID, query, now(), cardID)
	if err != nil {
		return port.Research{}, err
	}
	if n, err := res.RowsAffected(); err != nil {
		return port.Research{}, err
	} else if n == 0 {
		return port.Research{}, port.ErrResearchActive
	}
	id, err := res.LastInsertId()
	if err != nil {
		return port.Research{}, err
	}
	return s.GetResearch(ctx, id)
}

func (s *Store) HasActiveResearch(ctx context.Context, cardID int64) (bool, error) {
	var n int
	err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM research WHERE card_id = ? AND status IN ('queued', 'running')`, cardID).Scan(&n)
	return n > 0, err
}

func (s *Store) SetResearch(ctx context.Context, id int64, status, findings, errMsg string) (port.Research, error) {
	res, err := s.db.ExecContext(ctx,
		`UPDATE research SET status = ?, findings = ?, error = ? WHERE id = ?`, status, findings, errMsg, id)
	if err != nil {
		return port.Research{}, err
	}
	if n, err := res.RowsAffected(); err != nil || n == 0 {
		return port.Research{}, port.ErrNotFound
	}
	return s.GetResearch(ctx, id)
}

func (s *Store) GetResearch(ctx context.Context, id int64) (port.Research, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, card_id, status, query, findings, error, created_at FROM research WHERE id = ?`, id)
	var r port.Research
	var created string
	err := row.Scan(&r.ID, &r.CardID, &r.Status, &r.Query, &r.Findings, &r.Error, &created)
	if errors.Is(err, sql.ErrNoRows) {
		return port.Research{}, port.ErrNotFound
	}
	if err != nil {
		return port.Research{}, err
	}
	r.CreatedAt, _ = parseTime(created)
	return r, nil
}

func (s *Store) ListResearch(ctx context.Context) ([]port.Research, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, card_id, status, query, error, created_at FROM research ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []port.Research
	for rows.Next() {
		var r port.Research
		var created string
		if err := rows.Scan(&r.ID, &r.CardID, &r.Status, &r.Query, &r.Error, &created); err != nil {
			return nil, err
		}
		r.CreatedAt, _ = parseTime(created)
		list = append(list, r)
	}
	return list, rows.Err()
}

func (s *Store) GetResearchFindings(ctx context.Context, id int64) (string, error) {
	var findings string
	err := s.db.QueryRowContext(ctx,
		`SELECT findings FROM research WHERE id = ?`, id).Scan(&findings)
	if errors.Is(err, sql.ErrNoRows) {
		return "", port.ErrNotFound
	}
	return findings, err
}

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

func (s *Store) CreateCapture(ctx context.Context, c port.Capture) (port.Capture, error) {
	ts := now()
	notesJSON := "[]"
	if len(c.Notes) > 0 {
		if b, err := json.Marshal(c.Notes); err == nil {
			notesJSON = string(b)
		}
	}
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO captures (kind, source_url, title, description, text, caption, transcript, image_digest, notes, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		c.Kind, c.SourceURL, c.Title, c.Description, c.Text, c.Caption, c.Transcript, c.ImageDigest, notesJSON, ts)
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
	t, _ := parseTime(ts)
	c.CreatedAt = t
	if c.Notes == nil {
		c.Notes = []string{}
	}
	return c, nil
}

func (s *Store) GetCapture(ctx context.Context, id int64) (port.Capture, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, kind, source_url, title, description, text, caption, transcript, image_digest, notes, created_at
		 FROM captures WHERE id = ?`, id)
	var c port.Capture
	var notesJSON string
	var created string
	err := row.Scan(&c.ID, &c.Kind, &c.SourceURL, &c.Title, &c.Description, &c.Text, &c.Caption, &c.Transcript, &c.ImageDigest, &notesJSON, &created)
	if errors.Is(err, sql.ErrNoRows) {
		return port.Capture{}, port.ErrNotFound
	}
	if err != nil {
		return port.Capture{}, err
	}
	if notesJSON != "" {
		_ = json.Unmarshal([]byte(notesJSON), &c.Notes)
	}
	if c.Notes == nil {
		c.Notes = []string{}
	}
	c.CreatedAt, _ = parseTime(created)
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
