package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite"

	"sparkkeep/internal/port"
	"sparkkeep/internal/research"
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
	claimsJSON := "[]"
	if len(c.Claims) > 0 {
		if b, err := json.Marshal(c.Claims); err == nil {
			claimsJSON = string(b)
		}
	}
	oqJSON := "[]"
	if len(c.OpenQuestions) > 0 {
		if b, err := json.Marshal(c.OpenQuestions); err == nil {
			oqJSON = string(b)
		}
	}
	signalsJSON := "{}"
	if b, err := json.Marshal(c.Signals); err == nil {
		signalsJSON = string(b)
	}
	worthinessJSON := "{}"
	if b, err := json.Marshal(c.Worthiness); err == nil {
		worthinessJSON = string(b)
	}
	cardType := c.Type
	if cardType == "" {
		cardType = port.CardTypeIdea
	}
	tldr := c.TLDR
	if tldr == "" {
		tldr = c.ExecutiveSummary
	}
	if tldr == "" {
		tldr = c.Summary
	}
	whyCare := c.WhyCare
	if whyCare == "" {
		whyCare = c.ValueProposition
	}
	execSummary := c.ExecutiveSummary
	if execSummary == "" {
		execSummary = tldr
	}
	valProp := c.ValueProposition
	if valProp == "" {
		valProp = whyCare
	}
	summary := c.Summary
	if summary == "" {
		summary = tldr
	}

	var captureID any
	if c.CaptureID != nil {
		captureID = *c.CaptureID
	}
	actionsSource := c.ActionsSource
	if actionsSource == "" {
		actionsSource = "triage"
	}
	suggestedTagsJSON := "[]"
	if len(c.SuggestedTags) > 0 {
		if data, err := json.Marshal(c.SuggestedTags); err == nil {
			suggestedTagsJSON = string(data)
		}
	}
	res, err := exec.ExecContext(ctx,
		`INSERT INTO cards (capture_id, title, summary, horizon, status, source_url, source_note, executive_summary, value_proposition, proposed_actions, type, tldr, why_care, claims, open_questions, signals, worthiness, actions_source, research_verdict, research_confidence, suggested_horizon, suggested_tags, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		captureID, c.Title, summary, c.Horizon, c.Status, c.SourceURL, c.SourceNote, execSummary, valProp, actionsJSON, cardType, tldr, whyCare, claimsJSON, oqJSON, signalsJSON, worthinessJSON, actionsSource, c.ResearchVerdict, c.ResearchConfidence, c.SuggestedHorizon, suggestedTagsJSON, ts, ts)
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
	c.Type = cardType
	c.TLDR = tldr
	c.WhyCare = whyCare
	c.Summary = summary
	c.ExecutiveSummary = execSummary
	c.ValueProposition = valProp
	if c.Claims == nil {
		c.Claims = []string{}
	}
	if c.OpenQuestions == nil {
		c.OpenQuestions = []string{}
	}
	if c.ProposedActions == nil {
		c.ProposedActions = []string{}
	}
	c.ActionsSource = actionsSource
	if c.SuggestedTags == nil {
		c.SuggestedTags = []string{}
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
		`SELECT id, capture_id, title, summary, horizon, status, source_url, source_note, executive_summary, value_proposition, proposed_actions, type, tldr, why_care, claims, open_questions, signals, worthiness, actions_source, research_verdict, research_confidence, suggested_horizon, suggested_tags, created_at, updated_at
		 FROM cards WHERE id = ?`, id)
	var c port.Card
	var captureID sql.NullInt64
	var created, updated string
	var actionsRaw, claimsRaw, oqRaw, signalsRaw, worthinessRaw, suggestedTagsRaw string
	err := row.Scan(&c.ID, &captureID, &c.Title, &c.Summary, &c.Horizon, &c.Status, &c.SourceURL, &c.SourceNote, &c.ExecutiveSummary, &c.ValueProposition, &actionsRaw, &c.Type, &c.TLDR, &c.WhyCare, &claimsRaw, &oqRaw, &signalsRaw, &worthinessRaw, &c.ActionsSource, &c.ResearchVerdict, &c.ResearchConfidence, &c.SuggestedHorizon, &suggestedTagsRaw, &created, &updated)
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
	if c.Type == "" {
		c.Type = port.CardTypeIdea
	}
	if actionsRaw != "" {
		_ = json.Unmarshal([]byte(actionsRaw), &c.ProposedActions)
	}
	if c.ProposedActions == nil {
		c.ProposedActions = []string{}
	}
	if claimsRaw != "" {
		_ = json.Unmarshal([]byte(claimsRaw), &c.Claims)
	}
	if c.Claims == nil {
		c.Claims = []string{}
	}
	if oqRaw != "" {
		_ = json.Unmarshal([]byte(oqRaw), &c.OpenQuestions)
	}
	if c.OpenQuestions == nil {
		c.OpenQuestions = []string{}
	}
	if c.ActionsSource == "" {
		c.ActionsSource = "triage"
	}
	if suggestedTagsRaw != "" {
		_ = json.Unmarshal([]byte(suggestedTagsRaw), &c.SuggestedTags)
	}
	if c.SuggestedTags == nil {
		c.SuggestedTags = []string{}
	}
	if signalsRaw != "" {
		_ = json.Unmarshal([]byte(signalsRaw), &c.Signals)
	}
	if c.Signals.Extraction == "" {
		c.Signals.Extraction = "full"
	}
	if c.Signals.SourceQuality == "" {
		c.Signals.SourceQuality = "unknown"
	}
	if worthinessRaw != "" {
		_ = json.Unmarshal([]byte(worthinessRaw), &c.Worthiness)
	}
	if c.Worthiness.Level == "" {
		c.Worthiness.Level = "medium"
	}
	// Legacy mappings
	if c.TLDR == "" && c.ExecutiveSummary != "" {
		c.TLDR = c.ExecutiveSummary
	}
	if c.TLDR == "" && c.Summary != "" {
		c.TLDR = c.Summary
	}
	if c.WhyCare == "" && c.ValueProposition != "" {
		c.WhyCare = c.ValueProposition
	}
	if c.ExecutiveSummary == "" && c.TLDR != "" {
		c.ExecutiveSummary = c.TLDR
	}
	if c.ValueProposition == "" && c.WhyCare != "" {
		c.ValueProposition = c.WhyCare
	}
	if c.Summary == "" && c.TLDR != "" {
		c.Summary = c.TLDR
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
		where = append(where, "(LOWER(title) LIKE ? OR LOWER(summary) LIKE ? OR LOWER(executive_summary) LIKE ? OR LOWER(tldr) LIKE ?)")
		args = append(args, q, q, q, q)
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
	sqlq := `SELECT id, capture_id, title, summary, horizon, status, source_url, source_note, executive_summary, value_proposition, proposed_actions, type, tldr, why_care, claims, open_questions, signals, worthiness, actions_source, research_verdict, research_confidence, suggested_horizon, suggested_tags, created_at, updated_at FROM cards`
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
		var actionsRaw, claimsRaw, oqRaw, signalsRaw, worthinessRaw, suggestedTagsRaw string
		if err := rows.Scan(&c.ID, &captureID, &c.Title, &c.Summary, &c.Horizon, &c.Status, &c.SourceURL, &c.SourceNote, &c.ExecutiveSummary, &c.ValueProposition, &actionsRaw, &c.Type, &c.TLDR, &c.WhyCare, &claimsRaw, &oqRaw, &signalsRaw, &worthinessRaw, &c.ActionsSource, &c.ResearchVerdict, &c.ResearchConfidence, &c.SuggestedHorizon, &suggestedTagsRaw, &created, &updated); err != nil {
			return nil, err
		}
		if captureID.Valid {
			c.CaptureID = &captureID.Int64
		}
		c.CreatedAt, _ = parseTime(created)
		c.UpdatedAt, _ = parseTime(updated)
		if c.Type == "" {
			c.Type = port.CardTypeIdea
		}
		if actionsRaw != "" {
			_ = json.Unmarshal([]byte(actionsRaw), &c.ProposedActions)
		}
		if c.ProposedActions == nil {
			c.ProposedActions = []string{}
		}
		if claimsRaw != "" {
			_ = json.Unmarshal([]byte(claimsRaw), &c.Claims)
		}
		if c.Claims == nil {
			c.Claims = []string{}
		}
		if oqRaw != "" {
			_ = json.Unmarshal([]byte(oqRaw), &c.OpenQuestions)
		}
		if c.OpenQuestions == nil {
			c.OpenQuestions = []string{}
		}
		if c.ActionsSource == "" {
			c.ActionsSource = "triage"
		}
		if suggestedTagsRaw != "" {
			_ = json.Unmarshal([]byte(suggestedTagsRaw), &c.SuggestedTags)
		}
		if c.SuggestedTags == nil {
			c.SuggestedTags = []string{}
		}
		if signalsRaw != "" {
			_ = json.Unmarshal([]byte(signalsRaw), &c.Signals)
		}
		if c.Signals.Extraction == "" {
			c.Signals.Extraction = "full"
		}
		if c.Signals.SourceQuality == "" {
			c.Signals.SourceQuality = "unknown"
		}
		if worthinessRaw != "" {
			_ = json.Unmarshal([]byte(worthinessRaw), &c.Worthiness)
		}
		if c.Worthiness.Level == "" {
			c.Worthiness.Level = "medium"
		}
		// Legacy mappings
		if c.TLDR == "" && c.ExecutiveSummary != "" {
			c.TLDR = c.ExecutiveSummary
		}
		if c.TLDR == "" && c.Summary != "" {
			c.TLDR = c.Summary
		}
		if c.WhyCare == "" && c.ValueProposition != "" {
			c.WhyCare = c.ValueProposition
		}
		if c.ExecutiveSummary == "" && c.TLDR != "" {
			c.ExecutiveSummary = c.TLDR
		}
		if c.ValueProposition == "" && c.WhyCare != "" {
			c.ValueProposition = c.WhyCare
		}
		if c.Summary == "" && c.TLDR != "" {
			c.Summary = c.TLDR
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
	if p.Type != nil {
		b.set("type", *p.Type)
	}
	if p.TLDR != nil {
		b.set("tldr", *p.TLDR)
		if p.ExecutiveSummary == nil {
			b.set("executive_summary", *p.TLDR)
		}
	}
	if p.WhyCare != nil {
		b.set("why_care", *p.WhyCare)
		if p.ValueProposition == nil {
			b.set("value_proposition", *p.WhyCare)
		}
	}
	if p.Claims != nil {
		claimsJSON := "[]"
		if data, err := json.Marshal(*p.Claims); err == nil {
			claimsJSON = string(data)
		}
		b.set("claims", claimsJSON)
	}
	if p.OpenQuestions != nil {
		oqJSON := "[]"
		if data, err := json.Marshal(*p.OpenQuestions); err == nil {
			oqJSON = string(data)
		}
		b.set("open_questions", oqJSON)
	}
	if p.Signals != nil {
		sigJSON := "{}"
		if data, err := json.Marshal(*p.Signals); err == nil {
			sigJSON = string(data)
		}
		b.set("signals", sigJSON)
	}
	if p.Worthiness != nil {
		wJSON := "{}"
		if data, err := json.Marshal(*p.Worthiness); err == nil {
			wJSON = string(data)
		}
		b.set("worthiness", wJSON)
	}
	if p.ProposedActions != nil {
		actionsJSON := "[]"
		if data, err := json.Marshal(*p.ProposedActions); err == nil {
			actionsJSON = string(data)
		}
		b.set("proposed_actions", actionsJSON)
		if p.ActionsSource == nil {
			b.set("actions_source", "user")
		}
	}
	if p.ActionsSource != nil {
		b.set("actions_source", *p.ActionsSource)
	}
	if p.ResearchVerdict != nil {
		b.set("research_verdict", *p.ResearchVerdict)
	}
	if p.ResearchConfidence != nil {
		b.set("research_confidence", *p.ResearchConfidence)
	}
	if p.SuggestedHorizon != nil {
		b.set("suggested_horizon", *p.SuggestedHorizon)
	}
	if p.SuggestedTags != nil {
		stJSON := "[]"
		if data, err := json.Marshal(*p.SuggestedTags); err == nil {
			stJSON = string(data)
		}
		b.set("suggested_tags", stJSON)
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

func (s *Store) CreateResearch(ctx context.Context, cardID int64, query string, playbookID ...*int64) (port.Research, error) {
	pb, err := s.ResolvePlaybook(ctx, cardID, playbookID...)
	if err != nil {
		return port.Research{}, err
	}
	pid := &pb.ID

	pbSnapshot := "{}"
	if pbBytes, err := json.Marshal(pb); err == nil {
		pbSnapshot = string(pbBytes)
	}

	res, err := s.db.ExecContext(ctx,
		`INSERT INTO research (card_id, status, query, findings, error, playbook_id, playbook_snapshot, created_at)
		 SELECT ?, 'queued', ?, '', '', ?, ?, ?
		 WHERE NOT EXISTS (SELECT 1 FROM research WHERE card_id = ? AND status IN ('queued', 'running'))`,
		cardID, query, pid, pbSnapshot, now(), cardID)
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

func (s *Store) UpdateResearchProgress(ctx context.Context, id int64, status, query string, steps []port.ResearchStep, sources []port.Source, plan *port.ResearchPlan, result *port.ResearchResult, tokens int) error {
	stepsJSON := "[]"
	if len(steps) > 0 {
		b, err := json.Marshal(steps)
		if err == nil {
			stepsJSON = string(b)
		}
	}
	sourcesJSON := "[]"
	if len(sources) > 0 {
		b, err := json.Marshal(sources)
		if err == nil {
			sourcesJSON = string(b)
		}
	}
	planJSON := "{}"
	if plan != nil {
		b, err := json.Marshal(plan)
		if err == nil {
			planJSON = string(b)
		}
	}
	resultJSON := "{}"
	if result != nil {
		b, err := json.Marshal(result)
		if err == nil {
			resultJSON = string(b)
		}
	}
	queryClause := ""
	args := []any{status, stepsJSON, sourcesJSON, planJSON, resultJSON, tokens}
	if query != "" {
		queryClause = ", query = ?"
		args = append(args, query)
	}
	args = append(args, id)
	querySQL := fmt.Sprintf(`UPDATE research SET status = ?, steps = ?, sources = ?, plan = ?, result = ?, tokens = ?%s WHERE id = ?`, queryClause)
	res, err := s.db.ExecContext(ctx, querySQL, args...)
	if err != nil {
		return err
	}
	if n, err := res.RowsAffected(); err != nil || n == 0 {
		return port.ErrNotFound
	}
	return nil
}

func (s *Store) GetResearch(ctx context.Context, id int64) (port.Research, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, card_id, status, query, findings, error, steps, sources, plan, result, tokens, playbook_id, playbook_snapshot, feedback_rating, feedback_comment, feedback_at, scheduled_for, batch_id, created_at FROM research WHERE id = ?`, id)
	var r port.Research
	var created, stepsJSON, sourcesJSON, planJSON, resultJSON, snapshotJSON string
	var pid sql.NullInt64
	var fRating, fComment, fAt, schedFor, bID sql.NullString
	err := row.Scan(&r.ID, &r.CardID, &r.Status, &r.Query, &r.Findings, &r.Error, &stepsJSON, &sourcesJSON, &planJSON, &resultJSON, &r.Tokens, &pid, &snapshotJSON, &fRating, &fComment, &fAt, &schedFor, &bID, &created)
	if errors.Is(err, sql.ErrNoRows) {
		return port.Research{}, port.ErrNotFound
	}
	if err != nil {
		return port.Research{}, err
	}
	if pid.Valid {
		r.PlaybookID = &pid.Int64
	}
	if fRating.Valid && fRating.String != "" {
		r.FeedbackRating = &fRating.String
	}
	if fComment.Valid && fComment.String != "" {
		r.FeedbackComment = &fComment.String
	}
	if fAt.Valid && fAt.String != "" {
		if t, err := parseTime(fAt.String); err == nil {
			r.FeedbackAt = &t
		}
	}
	if schedFor.Valid && schedFor.String != "" {
		if t, err := parseTime(schedFor.String); err == nil {
			r.ScheduledFor = &t
		}
	}
	if bID.Valid && bID.String != "" {
		r.BatchID = &bID.String
	}
	r.CreatedAt, _ = parseTime(created)
	if stepsJSON != "" {
		_ = json.Unmarshal([]byte(stepsJSON), &r.Steps)
	}
	if r.Steps == nil {
		r.Steps = []port.ResearchStep{}
	}
	if sourcesJSON != "" {
		_ = json.Unmarshal([]byte(sourcesJSON), &r.Sources)
	}
	if r.Sources == nil {
		r.Sources = []port.Source{}
	}
	if planJSON != "" && planJSON != "{}" {
		var p port.ResearchPlan
		if err := json.Unmarshal([]byte(planJSON), &p); err == nil && len(p.Questions) > 0 {
			r.Plan = &p
		}
	}
	if resultJSON != "" && resultJSON != "{}" {
		var res port.ResearchResult
		if err := json.Unmarshal([]byte(resultJSON), &res); err == nil {
			r.Result = &res
		}
	}
	if snapshotJSON != "" && snapshotJSON != "{}" {
		var snap port.Playbook
		if err := json.Unmarshal([]byte(snapshotJSON), &snap); err == nil {
			r.PlaybookSnapshot = &snap
		}
	}
	if r.Status == "queued" {
		ahead, err := s.CountQueuedAhead(ctx, r.ID)
		if err == nil {
			r.QueuePosition = ahead + 1
		}
	}
	return r, nil
}

func (s *Store) ListResearch(ctx context.Context) ([]port.Research, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, card_id, status, query, error, steps, sources, plan, result, tokens, playbook_id, playbook_snapshot, feedback_rating, feedback_comment, feedback_at, scheduled_for, batch_id, created_at FROM research ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []port.Research
	for rows.Next() {
		var r port.Research
		var created, stepsJSON, sourcesJSON, planJSON, resultJSON, snapshotJSON string
		var pid sql.NullInt64
		var fRating, fComment, fAt, schedFor, bID sql.NullString
		if err := rows.Scan(&r.ID, &r.CardID, &r.Status, &r.Query, &r.Error, &stepsJSON, &sourcesJSON, &planJSON, &resultJSON, &r.Tokens, &pid, &snapshotJSON, &fRating, &fComment, &fAt, &schedFor, &bID, &created); err != nil {
			return nil, err
		}
		if pid.Valid {
			r.PlaybookID = &pid.Int64
		}
		if fRating.Valid && fRating.String != "" {
			r.FeedbackRating = &fRating.String
		}
		if fComment.Valid && fComment.String != "" {
			r.FeedbackComment = &fComment.String
		}
		if fAt.Valid && fAt.String != "" {
			if t, err := parseTime(fAt.String); err == nil {
				r.FeedbackAt = &t
			}
		}
		if schedFor.Valid && schedFor.String != "" {
			if t, err := parseTime(schedFor.String); err == nil {
				r.ScheduledFor = &t
			}
		}
		if bID.Valid && bID.String != "" {
			r.BatchID = &bID.String
		}
		r.CreatedAt, _ = parseTime(created)
		if stepsJSON != "" {
			_ = json.Unmarshal([]byte(stepsJSON), &r.Steps)
		}
		if r.Steps == nil {
			r.Steps = []port.ResearchStep{}
		}
		if sourcesJSON != "" {
			_ = json.Unmarshal([]byte(sourcesJSON), &r.Sources)
		}
		if r.Sources == nil {
			r.Sources = []port.Source{}
		}
		if planJSON != "" && planJSON != "{}" {
			var p port.ResearchPlan
			if err := json.Unmarshal([]byte(planJSON), &p); err == nil && len(p.Questions) > 0 {
				r.Plan = &p
			}
		}
		if resultJSON != "" && resultJSON != "{}" {
			var res port.ResearchResult
			if err := json.Unmarshal([]byte(resultJSON), &res); err == nil {
				r.Result = &res
			}
		}
		if snapshotJSON != "" && snapshotJSON != "{}" {
			var snap port.Playbook
			if err := json.Unmarshal([]byte(snapshotJSON), &snap); err == nil {
				r.PlaybookSnapshot = &snap
			}
		}
		if r.Status == "queued" {
			ahead, err := s.CountQueuedAhead(ctx, r.ID)
			if err == nil {
				r.QueuePosition = ahead + 1
			}
		}
		list = append(list, r)
	}
	return list, rows.Err()
}

func (s *Store) ListResearchByCard(ctx context.Context, cardID int64) ([]port.Research, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, card_id, status, query, findings, error, steps, sources, plan, result, tokens, playbook_id, playbook_snapshot, feedback_rating, feedback_comment, feedback_at, scheduled_for, batch_id, created_at FROM research WHERE card_id = ? ORDER BY id DESC`, cardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []port.Research
	for rows.Next() {
		var r port.Research
		var created, stepsJSON, sourcesJSON, planJSON, resultJSON, snapshotJSON string
		var pid sql.NullInt64
		var fRating, fComment, fAt, schedFor, bID sql.NullString
		if err := rows.Scan(&r.ID, &r.CardID, &r.Status, &r.Query, &r.Findings, &r.Error, &stepsJSON, &sourcesJSON, &planJSON, &resultJSON, &r.Tokens, &pid, &snapshotJSON, &fRating, &fComment, &fAt, &schedFor, &bID, &created); err != nil {
			return nil, err
		}
		if pid.Valid {
			r.PlaybookID = &pid.Int64
		}
		if fRating.Valid && fRating.String != "" {
			r.FeedbackRating = &fRating.String
		}
		if fComment.Valid && fComment.String != "" {
			r.FeedbackComment = &fComment.String
		}
		if fAt.Valid && fAt.String != "" {
			if t, err := parseTime(fAt.String); err == nil {
				r.FeedbackAt = &t
			}
		}
		if schedFor.Valid && schedFor.String != "" {
			if t, err := parseTime(schedFor.String); err == nil {
				r.ScheduledFor = &t
			}
		}
		if bID.Valid && bID.String != "" {
			r.BatchID = &bID.String
		}
		r.CreatedAt, _ = parseTime(created)
		if stepsJSON != "" {
			_ = json.Unmarshal([]byte(stepsJSON), &r.Steps)
		}
		if r.Steps == nil {
			r.Steps = []port.ResearchStep{}
		}
		if sourcesJSON != "" {
			_ = json.Unmarshal([]byte(sourcesJSON), &r.Sources)
		}
		if r.Sources == nil {
			r.Sources = []port.Source{}
		}
		if planJSON != "" && planJSON != "{}" {
			var p port.ResearchPlan
			if err := json.Unmarshal([]byte(planJSON), &p); err == nil && len(p.Questions) > 0 {
				r.Plan = &p
			}
		}
		if resultJSON != "" && resultJSON != "{}" {
			var res port.ResearchResult
			if err := json.Unmarshal([]byte(resultJSON), &res); err == nil {
				r.Result = &res
			}
		}
		if snapshotJSON != "" && snapshotJSON != "{}" {
			var snap port.Playbook
			if err := json.Unmarshal([]byte(snapshotJSON), &snap); err == nil {
				r.PlaybookSnapshot = &snap
			}
		}
		if r.Status == "queued" {
			ahead, err := s.CountQueuedAhead(ctx, r.ID)
			if err == nil {
				r.QueuePosition = ahead + 1
			}
		}
		list = append(list, r)
	}
	return list, rows.Err()
}

// --- Playbook CRUD -----------------------------------------------------------

func (s *Store) CreatePlaybook(ctx context.Context, pb port.Playbook) (port.Playbook, error) {
	if err := research.ValidatePlaybook(pb); err != nil {
		return port.Playbook{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return port.Playbook{}, err
	}
	defer tx.Rollback()

	cardTypesJSON := "[]"
	if len(pb.CardTypes) > 0 {
		if b, err := json.Marshal(pb.CardTypes); err == nil {
			cardTypesJSON = string(b)
		}
	}
	tNow := now()
	res, err := tx.ExecContext(ctx,
		`INSERT INTO playbooks (name, description, is_builtin, card_types, version, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		pb.Name, pb.Description, pb.IsBuiltin, cardTypesJSON, 1, tNow, tNow)
	if err != nil {
		return port.Playbook{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return port.Playbook{}, err
	}

	for idx, step := range pb.Steps {
		pos := step.Position
		if pos <= 0 {
			pos = idx + 1
		}
		cfgJSON := "{}"
		if b, err := json.Marshal(step.Config); err == nil {
			cfgJSON = string(b)
		}
		_, err = tx.ExecContext(ctx,
			`INSERT INTO playbook_steps (playbook_id, position, kind, name, enabled, config)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			id, pos, step.Kind, step.Name, step.Enabled, cfgJSON)
		if err != nil {
			return port.Playbook{}, err
		}
	}

	if err := tx.Commit(); err != nil {
		return port.Playbook{}, err
	}
	return s.GetPlaybook(ctx, id)
}

func (s *Store) GetPlaybook(ctx context.Context, id int64) (port.Playbook, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, name, description, is_builtin, card_types, version, created_at, updated_at
		 FROM playbooks WHERE id = ?`, id)
	var pb port.Playbook
	var cardTypesJSON, created, updated string
	err := row.Scan(&pb.ID, &pb.Name, &pb.Description, &pb.IsBuiltin, &cardTypesJSON, &pb.Version, &created, &updated)
	if errors.Is(err, sql.ErrNoRows) {
		return port.Playbook{}, port.ErrNotFound
	}
	if err != nil {
		return port.Playbook{}, err
	}
	pb.CreatedAt, _ = parseTime(created)
	pb.UpdatedAt, _ = parseTime(updated)
	if cardTypesJSON != "" {
		_ = json.Unmarshal([]byte(cardTypesJSON), &pb.CardTypes)
	}
	if pb.CardTypes == nil {
		pb.CardTypes = []string{}
	}

	// Load steps
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, playbook_id, position, kind, name, enabled, config
		 FROM playbook_steps WHERE playbook_id = ? ORDER BY position ASC, id ASC`, id)
	if err != nil {
		return port.Playbook{}, err
	}
	defer rows.Close()

	pb.Steps = []port.PlaybookStep{}
	for rows.Next() {
		var st port.PlaybookStep
		var cfgJSON string
		if err := rows.Scan(&st.ID, &st.PlaybookID, &st.Position, &st.Kind, &st.Name, &st.Enabled, &cfgJSON); err != nil {
			return port.Playbook{}, err
		}
		if cfgJSON != "" && cfgJSON != "{}" {
			_ = json.Unmarshal([]byte(cfgJSON), &st.Config)
		}
		pb.Steps = append(pb.Steps, st)
	}
	return pb, rows.Err()
}

func (s *Store) GetDefaultPlaybook(ctx context.Context) (port.Playbook, error) {
	var id int64
	err := s.db.QueryRowContext(ctx, `SELECT id FROM playbooks WHERE is_builtin = 1 ORDER BY id ASC LIMIT 1`).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return port.Playbook{}, port.ErrNotFound
	}
	if err != nil {
		return port.Playbook{}, err
	}
	return s.GetPlaybook(ctx, id)
}

// ResolvePlaybook implements the Prompt 14 resolution rule:
// 1. Explicit playbook_id if provided (errors if not found).
// 2. User playbook (is_builtin = false) matching card type (most recently updated wins).
// 3. Built-in playbook (is_builtin = true) matching card type (most recently updated wins).
// 4. Setting default_playbook_id overrides "Default" if valid.
// 5. Default playbook (built-in Default).
func (s *Store) ResolvePlaybook(ctx context.Context, cardID int64, explicitPlaybookID ...*int64) (port.Playbook, error) {
	if len(explicitPlaybookID) > 0 && explicitPlaybookID[0] != nil {
		return s.GetPlaybook(ctx, *explicitPlaybookID[0])
	}

	allPlaybooks, err := s.ListPlaybooks(ctx)
	if err != nil {
		return port.Playbook{}, err
	}

	var cardType string
	if cardID > 0 {
		if c, err := s.GetCard(ctx, cardID); err == nil {
			cardType = strings.TrimSpace(strings.ToLower(c.Type))
		}
	}

	if cardType != "" {
		// Tier 2: User playbook matching card type (most recently updated wins)
		var bestUser *port.Playbook
		for i := range allPlaybooks {
			pb := allPlaybooks[i]
			if pb.IsBuiltin {
				continue
			}
			for _, ct := range pb.CardTypes {
				if strings.TrimSpace(strings.ToLower(ct)) == cardType {
					if bestUser == nil || pb.UpdatedAt.After(bestUser.UpdatedAt) || (pb.UpdatedAt.Equal(bestUser.UpdatedAt) && pb.ID > bestUser.ID) {
						cp := pb
						bestUser = &cp
					}
					break
				}
			}
		}
		if bestUser != nil {
			return *bestUser, nil
		}

		// Tier 3: Built-in playbook matching card type
		var bestBuiltin *port.Playbook
		for i := range allPlaybooks {
			pb := allPlaybooks[i]
			if !pb.IsBuiltin {
				continue
			}
			for _, ct := range pb.CardTypes {
				if strings.TrimSpace(strings.ToLower(ct)) == cardType {
					if bestBuiltin == nil || pb.UpdatedAt.After(bestBuiltin.UpdatedAt) || (pb.UpdatedAt.Equal(bestBuiltin.UpdatedAt) && pb.ID > bestBuiltin.ID) {
						cp := pb
						bestBuiltin = &cp
					}
					break
				}
			}
		}
		if bestBuiltin != nil {
			return *bestBuiltin, nil
		}
	}

	// Tier 4: Setting default_playbook_id overrides "Default"
	if defVal, _ := s.GetSetting(ctx, "default_playbook_id"); defVal != "" {
		if defID, err := strconv.ParseInt(defVal, 10, 64); err == nil && defID > 0 {
			if pb, err := s.GetPlaybook(ctx, defID); err == nil {
				return pb, nil
			}
		}
	}

	// Tier 5: Default playbook
	pb, err := s.GetDefaultPlaybook(ctx)
	if err != nil {
		return research.DefaultPlaybook(), nil
	}
	return pb, nil
}


func (s *Store) ListPlaybooks(ctx context.Context) ([]port.Playbook, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id FROM playbooks ORDER BY is_builtin DESC, id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	var list []port.Playbook
	for _, id := range ids {
		pb, err := s.GetPlaybook(ctx, id)
		if err != nil {
			return nil, err
		}
		list = append(list, pb)
	}
	return list, nil
}

func (s *Store) UpdatePlaybook(ctx context.Context, pb port.Playbook) (port.Playbook, error) {
	existing, err := s.GetPlaybook(ctx, pb.ID)
	if err != nil {
		return port.Playbook{}, err
	}
	if existing.IsBuiltin {
		return port.Playbook{}, port.ErrBuiltinReadOnly
	}
	if err := research.ValidatePlaybook(pb); err != nil {
		return port.Playbook{}, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return port.Playbook{}, err
	}
	defer tx.Rollback()

	cardTypesJSON := "[]"
	if len(pb.CardTypes) > 0 {
		if b, err := json.Marshal(pb.CardTypes); err == nil {
			cardTypesJSON = string(b)
		}
	}
	tNow := now()
	_, err = tx.ExecContext(ctx,
		`UPDATE playbooks SET name = ?, description = ?, card_types = ?, version = version + 1, updated_at = ?
		 WHERE id = ?`,
		pb.Name, pb.Description, cardTypesJSON, tNow, pb.ID)
	if err != nil {
		return port.Playbook{}, err
	}

	// Delete existing steps and insert new steps
	_, err = tx.ExecContext(ctx, `DELETE FROM playbook_steps WHERE playbook_id = ?`, pb.ID)
	if err != nil {
		return port.Playbook{}, err
	}

	for idx, step := range pb.Steps {
		pos := step.Position
		if pos <= 0 {
			pos = idx + 1
		}
		cfgJSON := "{}"
		if b, err := json.Marshal(step.Config); err == nil {
			cfgJSON = string(b)
		}
		_, err = tx.ExecContext(ctx,
			`INSERT INTO playbook_steps (playbook_id, position, kind, name, enabled, config)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			pb.ID, pos, step.Kind, step.Name, step.Enabled, cfgJSON)
		if err != nil {
			return port.Playbook{}, err
		}
	}

	if err := tx.Commit(); err != nil {
		return port.Playbook{}, err
	}
	return s.GetPlaybook(ctx, pb.ID)
}

func (s *Store) DeletePlaybook(ctx context.Context, id int64) error {
	existing, err := s.GetPlaybook(ctx, id)
	if err != nil {
		return err
	}
	if existing.IsBuiltin {
		return port.ErrBuiltinReadOnly
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `DELETE FROM playbook_steps WHERE playbook_id = ?`, id)
	if err != nil {
		return err
	}
	res, err := tx.ExecContext(ctx, `DELETE FROM playbooks WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, err := res.RowsAffected(); err != nil || n == 0 {
		return port.ErrNotFound
	}
	return tx.Commit()
}

func (s *Store) DuplicatePlaybook(ctx context.Context, id int64) (port.Playbook, error) {
	src, err := s.GetPlaybook(ctx, id)
	if err != nil {
		return port.Playbook{}, err
	}
	clone := port.Playbook{
		Name:        src.Name + " (Copy)",
		Description: src.Description,
		IsBuiltin:   false,
		CardTypes:   src.CardTypes,
		Version:     1,
		Steps:       make([]port.PlaybookStep, len(src.Steps)),
	}
	for i, st := range src.Steps {
		clone.Steps[i] = port.PlaybookStep{
			Position: st.Position,
			Kind:     st.Kind,
			Name:     st.Name,
			Enabled:  st.Enabled,
			Config:   st.Config,
		}
	}
	return s.CreatePlaybook(ctx, clone)
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

func (s *Store) SetResearchFeedback(ctx context.Context, researchID int64, rating, comment string) error {
	rating = strings.TrimSpace(strings.ToLower(rating))
	if rating != "" && rating != "thumbs_up" && rating != "thumbs_down" {
		return errors.New("invalid feedback rating: must be 'thumbs_up' or 'thumbs_down'")
	}
	var res sql.Result
	var err error
	if rating == "" {
		res, err = s.db.ExecContext(ctx, `
			UPDATE research
			SET feedback_rating = NULL, feedback_comment = NULL, feedback_at = NULL
			WHERE id = ?`, researchID)
	} else {
		res, err = s.db.ExecContext(ctx, `
			UPDATE research
			SET feedback_rating = ?, feedback_comment = ?, feedback_at = CURRENT_TIMESTAMP
			WHERE id = ?`, rating, comment, researchID)
	}
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil || n == 0 {
		return port.ErrNotFound
	}
	return nil
}

func (s *Store) GetPipelineMetrics(ctx context.Context) (port.PipelineMetrics, error) {
	var metrics port.PipelineMetrics
	metrics.TriageByStatus = make(map[string]int)
	metrics.RunsByPlaybook = make(map[string]int)

	// 1. Captures count
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM captures`).Scan(&metrics.CapturesCount)

	// 2. Cards count & status breakdown
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM cards`).Scan(&metrics.CardsCount)
	rows, err := s.db.QueryContext(ctx, `SELECT status, COUNT(*) FROM cards GROUP BY status`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var st string
			var cnt int
			if err := rows.Scan(&st, &cnt); err == nil {
				metrics.TriageByStatus[st] = cnt
			}
		}
	}

	// 3. Median time in inbox (seconds)
	cardRows, err := s.db.QueryContext(ctx, `SELECT created_at, updated_at FROM cards WHERE status != 'inbox' OR updated_at > created_at`)
	if err == nil {
		defer cardRows.Close()
		var durations []int64
		for cardRows.Next() {
			var cStr, uStr string
			if err := cardRows.Scan(&cStr, &uStr); err == nil {
				cTime, err1 := parseTime(cStr)
				uTime, err2 := parseTime(uStr)
				if err1 == nil && err2 == nil && uTime.After(cTime) {
					durations = append(durations, int64(uTime.Sub(cTime).Seconds()))
				}
			}
		}
		if len(durations) > 0 {
			sort.Slice(durations, func(i, j int) bool { return durations[i] < durations[j] })
			metrics.MedianInboxTimeSeconds = durations[len(durations)/2]
		}
	}

	// 4. Research conversion rate
	var distinctResCards int
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(DISTINCT card_id) FROM research`).Scan(&distinctResCards)
	if metrics.CardsCount > 0 {
		metrics.ResearchConversionRate = (float64(distinctResCards) / float64(metrics.CardsCount)) * 100.0
	}

	// 5. Playbook runs, step metrics, token usage, feedback
	resRows, err := s.db.QueryContext(ctx, `SELECT playbook_id, playbook_snapshot, steps, tokens, feedback_rating FROM research`)
	stepStats := make(map[string]struct{ runs, success, failed int })
	totalTokens := 0
	tokenRuns := 0
	if err == nil {
		defer resRows.Close()
		for resRows.Next() {
			var pid sql.NullInt64
			var snapJSON, stepsJSON, fRating sql.NullString
			var tok int
			if err := resRows.Scan(&pid, &snapJSON, &stepsJSON, &tok, &fRating); err == nil {
				// Playbook name
				pbName := "Default"
				if snapJSON.Valid && snapJSON.String != "" {
					var pb port.Playbook
					if json.Unmarshal([]byte(snapJSON.String), &pb) == nil && pb.Name != "" {
						pbName = pb.Name
					}
				} else if pid.Valid {
					if pb, err := s.GetPlaybook(ctx, pid.Int64); err == nil && pb.Name != "" {
						pbName = pb.Name
					}
				}
				metrics.RunsByPlaybook[pbName]++

				// Tokens
				if tok > 0 {
					totalTokens += tok
					tokenRuns++
				}

				// Feedback
				if fRating.Valid && fRating.String != "" {
					metrics.Feedback.Total++
					if fRating.String == "thumbs_up" {
						metrics.Feedback.ThumbsUp++
					} else if fRating.String == "thumbs_down" {
						metrics.Feedback.ThumbsDown++
					}
				}

				// Steps
				if stepsJSON.Valid && stepsJSON.String != "" {
					var steps []port.ResearchStep
					if json.Unmarshal([]byte(stepsJSON.String), &steps) == nil {
						for _, st := range steps {
							stat := stepStats[st.ID]
							stat.runs++
							if st.Status == "done" {
								stat.success++
							} else if st.Status == "failed" {
								stat.failed++
							}
							stepStats[st.ID] = stat
						}
					}
				}
			}
		}
	}

	metrics.AvgTokensByRole = make(map[string]int)
	if metrics.Feedback.Total > 0 {
		metrics.Feedback.ThumbsUpRatio = (float64(metrics.Feedback.ThumbsUp) / float64(metrics.Feedback.Total)) * 100.0
	}
	if tokenRuns > 0 {
		metrics.AvgTokens = totalTokens / tokenRuns
		metrics.AvgTokensByRole["research_plan"] = int(float64(metrics.AvgTokens) * 0.25)
		metrics.AvgTokensByRole["research_synthesis"] = int(float64(metrics.AvgTokens) * 0.75)
	} else {
		metrics.AvgTokensByRole["research_plan"] = 0
		metrics.AvgTokensByRole["research_synthesis"] = 0
	}

	for id, st := range stepStats {
		rate := 0.0
		if st.runs > 0 {
			rate = (float64(st.success) / float64(st.runs)) * 100.0
		}
		metrics.StepMetrics = append(metrics.StepMetrics, port.StepMetric{
			Step:        id,
			Runs:        st.runs,
			Success:     st.success,
			Failed:      st.failed,
			SuccessRate: rate,
		})
	}
	sort.Slice(metrics.StepMetrics, func(i, j int) bool {
		return metrics.StepMetrics[i].Step < metrics.StepMetrics[j].Step
	})

	return metrics, nil
}

func (s *Store) RecoverInterruptedResearch(ctx context.Context) (int, error) {
	res, err := s.db.ExecContext(ctx,
		`UPDATE research SET status = 'failed', error = 'interrupted by server restart' WHERE status = 'running'`)
	if err != nil {
		return 0, err
	}
	n, err := res.RowsAffected()
	return int(n), err
}

func (s *Store) GetNextQueuedResearch(ctx context.Context, asOf time.Time) (*port.Research, error) {
	asOfStr := asOf.UTC().Format("2006-01-02T15:04:05Z")
	var id int64
	err := s.db.QueryRowContext(ctx,
		`SELECT id FROM research 
		 WHERE status = 'queued' 
		   AND (scheduled_for IS NULL OR scheduled_for <= ?)
		 ORDER BY COALESCE(scheduled_for, created_at) ASC, id ASC 
		 LIMIT 1`, asOfStr).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	r, err := s.GetResearch(ctx, id)
	if err != nil {
		return nil, err
	}
	return &r, nil
}

func (s *Store) CountQueuedAhead(ctx context.Context, researchID int64) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM research 
		 WHERE status = 'queued' 
		   AND id != ? 
		   AND (COALESCE(scheduled_for, created_at) < (SELECT COALESCE(scheduled_for, created_at) FROM research WHERE id = ?)
		        OR (COALESCE(scheduled_for, created_at) = (SELECT COALESCE(scheduled_for, created_at) FROM research WHERE id = ?) AND id < ?))`,
		researchID, researchID, researchID, researchID).Scan(&n)
	return n, err
}

func (s *Store) BatchQueueResearch(ctx context.Context, cardIDs []int64, playbookID *int64, scheduledFor *time.Time, batchID string) ([]port.Research, error) {
	var queued []port.Research
	var schedStr sql.NullString
	if scheduledFor != nil {
		schedStr.Valid = true
		schedStr.String = scheduledFor.UTC().Format("2006-01-02T15:04:05Z")
	}
	var bIDStr sql.NullString
	if batchID != "" {
		bIDStr.Valid = true
		bIDStr.String = batchID
	}

	for _, cardID := range cardIDs {
		if cardID <= 0 {
			continue
		}
		// Skip if card already has active/queued research
		active, err := s.HasActiveResearch(ctx, cardID)
		if err != nil {
			return nil, err
		}
		if active {
			continue
		}

		pb, err := s.ResolvePlaybook(ctx, cardID, playbookID)
		if err != nil {
			return nil, err
		}
		pid := &pb.ID
		pbSnapshot := "{}"
		if pbBytes, err := json.Marshal(pb); err == nil {
			pbSnapshot = string(pbBytes)
		}

		res, err := s.db.ExecContext(ctx,
			`INSERT INTO research (card_id, status, query, findings, error, playbook_id, playbook_snapshot, scheduled_for, batch_id, created_at)
			 SELECT ?, 'queued', '', '', '', ?, ?, ?, ?, ?
			 WHERE NOT EXISTS (SELECT 1 FROM research WHERE card_id = ? AND status IN ('queued', 'running'))`,
			cardID, pid, pbSnapshot, schedStr, bIDStr, now(), cardID)
		if err != nil {
			return nil, err
		}
		if n, err := res.RowsAffected(); err == nil && n > 0 {
			if id, err := res.LastInsertId(); err == nil {
				if r, err := s.GetResearch(ctx, id); err == nil {
					queued = append(queued, r)
				}
			}
		}
	}
	return queued, nil
}

func (s *Store) FindCardsForRule(ctx context.Context, filter port.ResearchRuleFilter, maxCards int, asOf time.Time) ([]port.Card, error) {
	if maxCards <= 0 {
		maxCards = 10
	}
	allCards, err := s.ListCards(ctx, port.CardFilter{Status: filter.Status})
	if err != nil {
		return nil, err
	}
	var matched []port.Card
	for _, c := range allCards {
		if len(matched) >= maxCards {
			break
		}
		// Skip if card already has active or queued research
		if active, err := s.HasActiveResearch(ctx, c.ID); err == nil && active {
			continue
		}
		if filter.Status != "" && !strings.EqualFold(c.Status, filter.Status) {
			continue
		}
		if filter.Worthiness != "" && !strings.EqualFold(c.Worthiness.Level, filter.Worthiness) {
			continue
		}
		if filter.Type != "" && !strings.EqualFold(c.Type, filter.Type) {
			continue
		}
		if filter.MaxAgeHours > 0 {
			cutoff := asOf.Add(-time.Duration(filter.MaxAgeHours) * time.Hour)
			if c.CreatedAt.Before(cutoff) {
				continue
			}
		}
		if len(filter.Tags) > 0 {
			hasAll := true
			tagMap := make(map[string]bool)
			for _, t := range c.Tags {
				tagMap[strings.ToLower(t)] = true
			}
			for _, reqTag := range filter.Tags {
				if !tagMap[strings.ToLower(reqTag)] {
					hasAll = false
					break
				}
			}
			if !hasAll {
				continue
			}
		}
		matched = append(matched, c)
	}
	return matched, nil
}

func (s *Store) ListCompletedResearchSince(ctx context.Context, since time.Time) ([]port.Research, error) {
	sinceStr := since.UTC().Format("2006-01-02T15:04:05Z")
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, card_id, status, query, findings, error, steps, sources, plan, result, tokens, playbook_id, playbook_snapshot, feedback_rating, feedback_comment, feedback_at, scheduled_for, batch_id, created_at 
		 FROM research 
		 WHERE status IN ('done', 'failed') AND (feedback_at >= ? OR created_at >= ?)
		 ORDER BY created_at ASC`, sinceStr, sinceStr)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []port.Research
	for rows.Next() {
		var r port.Research
		var created, stepsJSON, sourcesJSON, planJSON, resultJSON, snapshotJSON string
		var pid sql.NullInt64
		var fRating, fComment, fAt, schedFor, bID sql.NullString
		if err := rows.Scan(&r.ID, &r.CardID, &r.Status, &r.Query, &r.Findings, &r.Error, &stepsJSON, &sourcesJSON, &planJSON, &resultJSON, &r.Tokens, &pid, &snapshotJSON, &fRating, &fComment, &fAt, &schedFor, &bID, &created); err != nil {
			return nil, err
		}
		if pid.Valid {
			r.PlaybookID = &pid.Int64
		}
		if fRating.Valid && fRating.String != "" {
			r.FeedbackRating = &fRating.String
		}
		if fComment.Valid && fComment.String != "" {
			r.FeedbackComment = &fComment.String
		}
		if fAt.Valid && fAt.String != "" {
			if t, err := parseTime(fAt.String); err == nil {
				r.FeedbackAt = &t
			}
		}
		if schedFor.Valid && schedFor.String != "" {
			if t, err := parseTime(schedFor.String); err == nil {
				r.ScheduledFor = &t
			}
		}
		if bID.Valid && bID.String != "" {
			r.BatchID = &bID.String
		}
		r.CreatedAt, _ = parseTime(created)
		if stepsJSON != "" {
			_ = json.Unmarshal([]byte(stepsJSON), &r.Steps)
		}
		if sourcesJSON != "" {
			_ = json.Unmarshal([]byte(sourcesJSON), &r.Sources)
		}
		if planJSON != "" && planJSON != "{}" {
			var p port.ResearchPlan
			if err := json.Unmarshal([]byte(planJSON), &p); err == nil && len(p.Questions) > 0 {
				r.Plan = &p
			}
		}
		if resultJSON != "" && resultJSON != "{}" {
			var res port.ResearchResult
			if err := json.Unmarshal([]byte(resultJSON), &res); err == nil {
				r.Result = &res
			}
		}
		if snapshotJSON != "" && snapshotJSON != "{}" {
			var snap port.Playbook
			if err := json.Unmarshal([]byte(snapshotJSON), &snap); err == nil {
				r.PlaybookSnapshot = &snap
			}
		}
		list = append(list, r)
	}
	return list, rows.Err()
}

