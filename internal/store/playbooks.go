package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strconv"
	"strings"

	"sparkkeep/internal/port"
	"sparkkeep/internal/research"
)

func (s *Store) loadPlaybookSteps(ctx context.Context, playbookID int64) ([]port.PlaybookStep, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, playbook_id, position, kind, name, enabled, config
		 FROM playbook_steps WHERE playbook_id = ? ORDER BY position ASC, id ASC`, playbookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	steps := []port.PlaybookStep{}
	for rows.Next() {
		var st port.PlaybookStep
		var cfgJSON string
		if err := rows.Scan(&st.ID, &st.PlaybookID, &st.Position, &st.Kind, &st.Name, &st.Enabled, &cfgJSON); err != nil {
			return nil, err
		}
		if cfgJSON != "" && cfgJSON != "{}" {
			_ = json.Unmarshal([]byte(cfgJSON), &st.Config)
		}
		steps = append(steps, st)
	}
	return steps, rows.Err()
}

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

	steps, err := s.loadPlaybookSteps(ctx, id)
	if err != nil {
		return port.Playbook{}, err
	}
	pb.Steps = steps
	return pb, nil
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
