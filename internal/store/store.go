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
	ts := now()
	actionsJSON := "[]"
	if len(c.ProposedActions) > 0 {
		if b, err := json.Marshal(c.ProposedActions); err == nil {
			actionsJSON = string(b)
		}
	}
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO cards (title, summary, horizon, status, source_url, source_note, executive_summary, value_proposition, proposed_actions, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		c.Title, c.Summary, c.Horizon, c.Status, c.SourceURL, c.SourceNote, c.ExecutiveSummary, c.ValueProposition, actionsJSON, ts, ts)
	if err != nil {
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
	if len(c.Tags) > 0 {
		if err := s.SetCardTags(ctx, id, c.Tags); err != nil {
			return port.Card{}, err
		}
	}
	return c, nil
}

func (s *Store) GetCard(ctx context.Context, id int64) (port.Card, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, title, summary, horizon, status, source_url, source_note, executive_summary, value_proposition, proposed_actions, created_at, updated_at
		 FROM cards WHERE id = ?`, id)
	var c port.Card
	var created, updated string
	var actionsRaw string
	err := row.Scan(&c.ID, &c.Title, &c.Summary, &c.Horizon, &c.Status, &c.SourceURL, &c.SourceNote, &c.ExecutiveSummary, &c.ValueProposition, &actionsRaw, &created, &updated)
	if errors.Is(err, sql.ErrNoRows) {
		return port.Card{}, port.ErrNotFound
	}
	if err != nil {
		return port.Card{}, err
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
	return c, nil
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
	limit := f.Limit
	if limit <= 0 {
		limit = defaultLimit
	}
	sqlq := `SELECT id, title, summary, horizon, status, source_url, source_note, executive_summary, value_proposition, proposed_actions, created_at, updated_at FROM cards`
	if len(where) > 0 {
		sqlq += " WHERE " + strings.Join(where, " AND ")
	}
	sqlq += " ORDER BY updated_at DESC LIMIT ?"
	args = append(args, limit)

	rows, err := s.db.QueryContext(ctx, sqlq, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var cards []port.Card
	for rows.Next() {
		var c port.Card
		var created, updated string
		var actionsRaw string
		if err := rows.Scan(&c.ID, &c.Title, &c.Summary, &c.Horizon, &c.Status, &c.SourceURL, &c.SourceNote, &c.ExecutiveSummary, &c.ValueProposition, &actionsRaw, &created, &updated); err != nil {
			return nil, err
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

	cardIDs := make([]any, len(cards))
	placeholders := make([]string, len(cards))
	for i, c := range cards {
		cardIDs[i] = c.ID
		placeholders[i] = "?"
	}
	tagQuery := fmt.Sprintf(`SELECT ct.card_id, t.name FROM cards_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.card_id IN (%s) ORDER BY t.name`, strings.Join(placeholders, ","))
	tagRows, err := s.db.QueryContext(ctx, tagQuery, cardIDs...)
	if err != nil {
		return nil, err
	}
	defer tagRows.Close()

	tagsByCard := make(map[int64][]string, len(cards))
	for tagRows.Next() {
		var cid int64
		var name string
		if err := tagRows.Scan(&cid, &name); err != nil {
			return nil, err
		}
		tagsByCard[cid] = append(tagsByCard[cid], name)
	}
	if err := tagRows.Err(); err != nil {
		return nil, err
	}
	for i := range cards {
		cards[i].Tags = tagsByCard[cards[i].ID]
	}
	return cards, nil
}

func (s *Store) UpdateCard(ctx context.Context, id int64, p port.CardPatch) (port.Card, error) {
	var sets []string
	var args []any
	if p.Status != nil {
		sets = append(sets, "status = ?")
		args = append(args, *p.Status)
	}
	if p.Horizon != nil {
		sets = append(sets, "horizon = ?")
		args = append(args, *p.Horizon)
	}
	if p.Note != nil {
		sets = append(sets, "source_note = ?")
		args = append(args, *p.Note)
	}
	if p.ExecutiveSummary != nil {
		sets = append(sets, "executive_summary = ?")
		args = append(args, *p.ExecutiveSummary)
	}
	if p.ValueProposition != nil {
		sets = append(sets, "value_proposition = ?")
		args = append(args, *p.ValueProposition)
	}
	if p.ProposedActions != nil {
		actionsJSON := "[]"
		if b, err := json.Marshal(*p.ProposedActions); err == nil {
			actionsJSON = string(b)
		}
		sets = append(sets, "proposed_actions = ?")
		args = append(args, actionsJSON)
	}
	if len(sets) == 0 {
		return port.Card{}, port.ErrNotFound
	}
	sets = append(sets, "updated_at = ?")
	args = append(args, now())
	args = append(args, id)
	res, err := s.db.ExecContext(ctx, `UPDATE cards SET `+strings.Join(sets, ", ")+` WHERE id = ?`, args...)
	if err != nil {
		return port.Card{}, err
	}
	if n, err := res.RowsAffected(); err != nil || n == 0 {
		return port.Card{}, port.ErrNotFound
	}
	return s.GetCard(ctx, id)
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
		`SELECT id, card_id, status, query, findings, error, created_at FROM research ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []port.Research
	for rows.Next() {
		var r port.Research
		var created string
		if err := rows.Scan(&r.ID, &r.CardID, &r.Status, &r.Query, &r.Findings, &r.Error, &created); err != nil {
			return nil, err
		}
		r.CreatedAt, _ = parseTime(created)
		list = append(list, r)
	}
		return list, rows.Err()
}

func (s *Store) TagCoOccurrence(ctx context.Context, minWeight int) ([]port.TagPair, error) {
	if minWeight < 1 {
		minWeight = 1
	}
	const q = `
		SELECT ta.name, tb.name, COUNT(*) AS w
		FROM cards_tags ca
		JOIN cards_tags cb ON ca.card_id = cb.card_id AND ca.tag_id < cb.tag_id
		JOIN tags ta ON ta.id = ca.tag_id
		JOIN tags tb ON tb.id = cb.tag_id
		GROUP BY ta.name, tb.name
		HAVING w >= ?
		ORDER BY w DESC, ta.name, tb.name
		LIMIT ?`
	rows, err := s.db.QueryContext(ctx, q, minWeight, maxTagPairs)
	if err != nil {
		return nil, fmt.Errorf("store: tag co-occurrence: %w", err)
	}
	defer rows.Close()
	var out []port.TagPair
	for rows.Next() {
		var p port.TagPair
		if err := rows.Scan(&p.A, &p.B, &p.Weight); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

