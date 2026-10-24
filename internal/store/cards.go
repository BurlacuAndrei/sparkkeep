package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"unicode"

	"sparkkeep/internal/port"
)

func (s *Store) CreateCard(ctx context.Context, c port.Card) (port.Card, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return port.Card{}, err
	}
	defer tx.Rollback()

	ts := now()
	actionsJSON := "[]"
	if len(c.ProposedActions) > 0 {
		if b, err := json.Marshal(c.ProposedActions); err == nil {
			actionsJSON = string(b)
		}
	}
	completedActionsJSON := "[]"
	if len(c.CompletedActions) > 0 {
		if b, err := json.Marshal(c.CompletedActions); err == nil {
			completedActionsJSON = string(b)
		}
	}
	analysisFailedInt := 0
	if c.AnalysisFailed {
		analysisFailedInt = 1
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
	researchState := c.ResearchState
	if researchState == "" {
		researchState = "none"
	}
	sourceChannel := c.SourceChannel
	if sourceChannel == "" {
		sourceChannel = c.Provenance.Channel
	}
	if sourceChannel == "" {
		sourceChannel = "web"
	}
	sourceChatID := c.SourceChannelChatID
	if sourceChatID == "" {
		sourceChatID = c.Provenance.ChatID
	}
	sourceMsgID := c.SourceChannelMsgID
	if sourceMsgID == "" {
		sourceMsgID = c.Provenance.MsgID
	}
	res, err := tx.ExecContext(ctx,
		`INSERT INTO cards (capture_id, title, summary, horizon, status, source_url, source_note, executive_summary, value_proposition, proposed_actions, completed_actions, type, tldr, why_care, claims, open_questions, signals, worthiness, actions_source, analysis_failed, research_verdict, research_confidence, suggested_horizon, suggested_tags, research_state, source_channel, source_channel_chat_id, source_channel_msg_id, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		captureID, c.Title, summary, c.Horizon, c.Status, c.SourceURL, c.SourceNote, execSummary, valProp, actionsJSON, completedActionsJSON, cardType, tldr, whyCare, claimsJSON, oqJSON, signalsJSON, worthinessJSON, actionsSource, analysisFailedInt, c.ResearchVerdict, c.ResearchConfidence, c.SuggestedHorizon, suggestedTagsJSON, researchState, sourceChannel, sourceChatID, sourceMsgID, ts, ts)
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
	c.ResearchState = researchState
	c.SourceChannel = sourceChannel
	c.SourceChannelChatID = sourceChatID
	c.SourceChannelMsgID = sourceMsgID
	c.Provenance = port.Provenance{
		Channel: sourceChannel,
		ChatID:  sourceChatID,
		MsgID:   sourceMsgID,
	}
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
	if c.CompletedActions == nil {
		c.CompletedActions = []string{}
	}
	c.ActionsSource = actionsSource
	if c.SuggestedTags == nil {
		c.SuggestedTags = []string{}
	}
	if c.References == nil {
		c.References = []port.Reference{}
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
	if err := tx.Commit(); err != nil {
		return port.Card{}, err
	}
	return c, nil
}

func scanCard(row rowScanner) (port.Card, error) {
	var c port.Card
	var captureID sql.NullInt64
	var created, updated string
	var actionsRaw, completedActionsRaw, claimsRaw, oqRaw, signalsRaw, worthinessRaw, suggestedTagsRaw string
	var analysisFailedInt int
	err := row.Scan(&c.ID, &captureID, &c.Title, &c.Summary, &c.Horizon, &c.Status, &c.SourceURL, &c.SourceNote, &c.ExecutiveSummary, &c.ValueProposition, &actionsRaw, &completedActionsRaw, &c.Type, &c.TLDR, &c.WhyCare, &claimsRaw, &oqRaw, &signalsRaw, &worthinessRaw, &c.ActionsSource, &analysisFailedInt, &c.ResearchVerdict, &c.ResearchConfidence, &c.SuggestedHorizon, &suggestedTagsRaw, &c.ResearchState, &c.SourceChannel, &c.SourceChannelChatID, &c.SourceChannelMsgID, &created, &updated)
	if err != nil {
		return port.Card{}, err
	}
	c.Provenance = port.Provenance{
		Channel: c.SourceChannel,
		ChatID:  c.SourceChannelChatID,
		MsgID:   c.SourceChannelMsgID,
	}
	if captureID.Valid {
		c.CaptureID = &captureID.Int64
	}
	if c.ResearchState == "" {
		c.ResearchState = "none"
	}
	c.CreatedAt, _ = parseTime(created)
	c.UpdatedAt, _ = parseTime(updated)
	c.AnalysisFailed = analysisFailedInt != 0
	if c.Type == "" {
		c.Type = port.CardTypeIdea
	}
	if actionsRaw != "" {
		_ = json.Unmarshal([]byte(actionsRaw), &c.ProposedActions)
	}
	if c.ProposedActions == nil {
		c.ProposedActions = []string{}
	}
	if completedActionsRaw != "" {
		_ = json.Unmarshal([]byte(completedActionsRaw), &c.CompletedActions)
	}
	if c.CompletedActions == nil {
		c.CompletedActions = []string{}
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
	return c, nil
}

func (s *Store) GetCard(ctx context.Context, id int64) (port.Card, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, capture_id, title, summary, horizon, status, source_url, source_note, executive_summary, value_proposition, proposed_actions, completed_actions, type, tldr, why_care, claims, open_questions, signals, worthiness, actions_source, analysis_failed, research_verdict, research_confidence, suggested_horizon, suggested_tags, research_state, source_channel, source_channel_chat_id, source_channel_msg_id, created_at, updated_at
		 FROM cards WHERE id = ?`, id)
	c, err := scanCard(row)
	if errors.Is(err, sql.ErrNoRows) {
		return port.Card{}, port.ErrNotFound
	}
	if err != nil {
		return port.Card{}, err
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
	comments, err := s.ListCardComments(ctx, id)
	if err != nil {
		return port.Card{}, err
	}
	c.Comments = comments
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

// sanitizeFTSQuery prepares user query input for SQLite FTS5 MATCH queries.
// It handles phrase queries, multi-word tokens with prefix matching, and sanitizes
// characters that could cause FTS5 syntax errors.
func sanitizeFTSQuery(raw string) string {
	raw = strings.ReplaceAll(raw, "\x00", " ")
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return `""`
	}
	// Preserve exact phrase queries if the caller wrapped the string in quotes.
	if strings.HasPrefix(raw, `"`) && strings.HasSuffix(raw, `"`) && len(raw) >= 2 {
		clean := strings.Trim(raw, `"`)
		clean = strings.ReplaceAll(clean, `"`, "")
		clean = strings.TrimRight(clean, "*")
		clean = strings.TrimSpace(clean)
		if clean == "" {
			return `""`
		}
		if endsWithAlphaNum(clean) {
			return `"` + clean + `"*`
		}
		return `"` + clean + `"`
	}

	clean := strings.ReplaceAll(raw, `"`, "")
	words := strings.Fields(clean)
	if len(words) == 0 {
		return `""`
	}
	var parts []string
	for _, w := range words {
		w = strings.TrimRight(w, "*")
		if w != "" {
			if endsWithAlphaNum(w) {
				parts = append(parts, `"`+w+`"*`)
			} else {
				parts = append(parts, `"`+w+`"`)
			}
		}
	}
	if len(parts) == 0 {
		return `""`
	}
	return strings.Join(parts, " ")
}

func endsWithAlphaNum(s string) bool {
	if s == "" {
		return false
	}
	r := rune(s[len(s)-1])
	return unicode.IsLetter(r) || unicode.IsDigit(r)
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
		ftsQ := sanitizeFTSQuery(f.Query)
		likeQ := "%" + strings.ToLower(f.Query) + "%"
		where = append(where, "(cards.id IN (SELECT rowid FROM cards_fts WHERE cards_fts MATCH ?) OR cards.source_url LIKE ? OR EXISTS (SELECT 1 FROM cards_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.card_id = cards.id AND LOWER(t.name) LIKE ?))")
		args = append(args, ftsQ, likeQ, likeQ)
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
	sqlq := `SELECT id, capture_id, title, summary, horizon, status, source_url, source_note, executive_summary, value_proposition, proposed_actions, completed_actions, type, tldr, why_care, claims, open_questions, signals, worthiness, actions_source, analysis_failed, research_verdict, research_confidence, suggested_horizon, suggested_tags, research_state, source_channel, source_channel_chat_id, source_channel_msg_id, created_at, updated_at FROM cards`
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
		c, err := scanCard(rows)
		if err != nil {
			return nil, err
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

	commentsByCard := make(map[int64][]port.CardComment, len(cards))
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
		comQuery := fmt.Sprintf(`SELECT id, card_id, content, created_at FROM card_comments WHERE card_id IN (%s) ORDER BY created_at ASC`, strings.Join(placeholders, ","))
		comRows, err := s.db.QueryContext(ctx, comQuery, cardIDs...)
		if err != nil {
			return nil, err
		}
		for comRows.Next() {
			var cid int64
			var cc port.CardComment
			var created string
			if err := comRows.Scan(&cc.ID, &cid, &cc.Content, &created); err != nil {
				comRows.Close()
				return nil, err
			}
			cc.CardID = cid
			cc.CreatedAt, _ = parseTime(created)
			commentsByCard[cid] = append(commentsByCard[cid], cc)
		}
		if err := comRows.Err(); err != nil {
			comRows.Close()
			return nil, err
		}
		comRows.Close()
	}

	for i := range cards {
		cards[i].Tags = tagsByCard[cards[i].ID]
		refs := refsByCard[cards[i].ID]
		if refs == nil {
			refs = []port.Reference{}
		}
		cards[i].References = refs
		comments := commentsByCard[cards[i].ID]
		if comments == nil {
			comments = []port.CardComment{}
		}
		cards[i].Comments = comments
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
	if p.Title != nil {
		b.set("title", *p.Title)
	}
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
	if p.CompletedActions != nil {
		compJSON := "[]"
		if data, err := json.Marshal(*p.CompletedActions); err == nil {
			compJSON = string(data)
		}
		b.set("completed_actions", compJSON)
	}
	if p.AnalysisFailed != nil {
		failedInt := 0
		if *p.AnalysisFailed {
			failedInt = 1
		}
		b.set("analysis_failed", failedInt)
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
	if p.ResearchState != nil {
		b.set("research_state", *p.ResearchState)
	}
	if p.SourceChannel != nil {
		b.set("source_channel", *p.SourceChannel)
	}
	if p.SourceChannelChatID != nil {
		b.set("source_channel_chat_id", *p.SourceChannelChatID)
	}
	if p.SourceChannelMsgID != nil {
		b.set("source_channel_msg_id", *p.SourceChannelMsgID)
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
		if isUniqueConstraint(err) {
			return port.Card{}, fmt.Errorf("%w: %v", port.ErrConflict, err)
		}
		return port.Card{}, err
	}
	if n, err := res.RowsAffected(); err != nil || n == 0 {
		return port.Card{}, port.ErrNotFound
	}
	return s.GetCard(ctx, id)
}

func (s *Store) DeleteCard(ctx context.Context, id int64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `DELETE FROM cards_tags WHERE card_id = ?`, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM card_references WHERE card_id = ?`, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM card_comments WHERE card_id = ?`, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM research WHERE card_id = ?`, id); err != nil {
		return err
	}

	res, err := tx.ExecContext(ctx, `DELETE FROM cards WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return port.ErrNotFound
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM cards_tags)`); err != nil {
		return err
	}

	return tx.Commit()
}

// ShelveStale shelves every inbox/to-do card untouched for more than days in
// one statement and returns the number of rows changed. In-progress cards
// represent active user commitments and are deliberately excluded from auto-shelve.
func (s *Store) ShelveStale(ctx context.Context, days int) (int64, error) {
	res, err := s.db.ExecContext(ctx,
		`UPDATE cards SET status = ?, updated_at = ? WHERE status IN (?, ?) AND updated_at < ?`,
		port.StatusShelved, now(), port.StatusInbox, port.StatusToDo, staleCutoff(days))
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
	if _, err := tx.ExecContext(ctx, `DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM cards_tags)`); err != nil {
		return err
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
		`SELECT t.name, COUNT(c.id)
		 FROM tags t
		 JOIN cards_tags ct ON t.id = ct.tag_id
		 JOIN cards c ON c.id = ct.card_id
		 WHERE c.status != 'dismissed'
		 GROUP BY t.id
		 HAVING COUNT(c.id) > 0
		 ORDER BY t.name`)
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

func (s *Store) AddCardComment(ctx context.Context, cardID int64, content string) (port.CardComment, error) {
	ts := now()
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO card_comments (card_id, content, created_at) VALUES (?, ?, ?)`,
		cardID, content, ts)
	if err != nil {
		return port.CardComment{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return port.CardComment{}, err
	}
	c := port.CardComment{
		ID:      id,
		CardID:  cardID,
		Content: content,
	}
	c.CreatedAt, _ = parseTime(ts)
	return c, nil
}

func (s *Store) ListCardComments(ctx context.Context, cardID int64) ([]port.CardComment, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, content, created_at FROM card_comments WHERE card_id = ? ORDER BY created_at ASC`,
		cardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var comments []port.CardComment
	for rows.Next() {
		var c port.CardComment
		var created string
		if err := rows.Scan(&c.ID, &c.Content, &created); err != nil {
			return nil, err
		}
		c.CardID = cardID
		c.CreatedAt, _ = parseTime(created)
		comments = append(comments, c)
	}
	return comments, rows.Err()
}
