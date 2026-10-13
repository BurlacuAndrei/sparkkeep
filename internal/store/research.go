package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"sparkkeep/internal/port"
)

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
	_, _ = s.db.ExecContext(ctx, `UPDATE cards SET research_state = 'queued' WHERE id = ?`, cardID)
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
	_, _ = s.db.ExecContext(ctx, `UPDATE cards SET research_state = ? WHERE id = (SELECT card_id FROM research WHERE id = ?)`, status, id)
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
	_, _ = s.db.ExecContext(ctx, `UPDATE cards SET research_state = ? WHERE id = (SELECT card_id FROM research WHERE id = ?)`, status, id)
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
		`SELECT id, card_id, status, query, findings, error, steps, sources, plan, result, tokens, playbook_id, playbook_snapshot, feedback_rating, feedback_comment, feedback_at, scheduled_for, batch_id, created_at FROM research WHERE card_id = ? ORDER BY id`, cardID)
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

func (s *Store) GetResearchFindings(ctx context.Context, id int64) (string, error) {
	var findings string
	err := s.db.QueryRowContext(ctx,
		`SELECT findings FROM research WHERE id = ?`, id).Scan(&findings)
	if errors.Is(err, sql.ErrNoRows) {
		return "", port.ErrNotFound
	}
	return findings, err
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
			_, _ = s.db.ExecContext(ctx, `UPDATE cards SET research_state = 'queued' WHERE id = ?`, cardID)
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
		list = append(list, r)
	}
	return list, rows.Err()
}
