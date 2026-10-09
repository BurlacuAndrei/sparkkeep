package e2e_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"testing"

	"sparkkeep/internal/port"
	"sparkkeep/internal/store"
)

// TestFunnel_TriagePipelineLifecycle verifies the end-to-end Triage Pipeline:
// Inbox -> Researching -> Review -> Comments -> Commit to Execution Board (To Do).
func TestFunnel_TriagePipelineLifecycle(t *testing.T) {
	h := newE2EHarness(t, `[{"title":"Autonomous Agents","summary":"Exploring multi-agent systems","horizon":"short-term","tags":["ai"]}]`)
	ctx := context.Background()

	// 1. Ingestion: Card arrives into Inbox without committed horizon
	c, err := h.store.CreateCard(ctx, port.Card{
		Title:   "Multi-Agent Coordination Protocol",
		Summary: "Initial idea captured from Telegram.",
		Status:  port.StatusInbox,
	})
	if err != nil {
		t.Fatalf("create card: %v", err)
	}
	if c.Status != port.StatusInbox {
		t.Fatalf("card status = %q, want %q", c.Status, port.StatusInbox)
	}

	// 2. Direct Commit from Inbox to Execution Board
	cDirect, err := h.store.CreateCard(ctx, port.Card{
		Title:  "Direct Action Item",
		Status: port.StatusInbox,
	})
	if err != nil {
		t.Fatalf("create direct card: %v", err)
	}
	resCommit := h.doJSON(http.MethodPatch, fmt.Sprintf("/api/v1/cards/%d", cDirect.ID), map[string]any{
		"horizon": port.HorizonShortTerm,
		"status":  port.StatusToDo,
	})
	if resCommit.Code != http.StatusOK {
		t.Fatalf("commit direct card failed: %d (%s)", resCommit.Code, resCommit.Body.String())
	}
	updatedDirect, err := h.store.GetCard(ctx, cDirect.ID)
	if err != nil {
		t.Fatalf("get direct card: %v", err)
	}
	if updatedDirect.Status != port.StatusToDo || updatedDirect.Horizon != port.HorizonShortTerm {
		t.Fatalf("expected direct card committed to to-do/short-term, got status=%q horizon=%q", updatedDirect.Status, updatedDirect.Horizon)
	}

	// 3. Start Research from Inbox -> Status becomes "researching", then "review"
	h.service.GoResearch(ctx, c.ID)
	h.service.WG.Wait()
	reviewedCard, err := h.store.GetCard(ctx, c.ID)
	if err != nil {
		t.Fatalf("get card after research: %v", err)
	}
	if reviewedCard.Status != port.StatusReview {
		t.Fatalf("card status after research = %q, want %q", reviewedCard.Status, port.StatusReview)
	}

	// 5. Add a comment during Review phase (POST /api/v1/cards/{id}/comments)
	resComment := h.doJSON(http.MethodPost, fmt.Sprintf("/api/v1/cards/%d/comments", c.ID), map[string]any{
		"content": "Reviewed research findings: architecture looks viable for Q3.",
	})
	if resComment.Code != http.StatusOK {
		t.Fatalf("post comment failed: %d (%s)", resComment.Code, resComment.Body.String())
	}

	var commentResp struct {
		OK   bool             `json:"ok"`
		Data port.CardComment `json:"data"`
	}
	if err := json.Unmarshal(resComment.Body.Bytes(), &commentResp); err != nil {
		t.Fatalf("unmarshal comment response: %v", err)
	}
	if !commentResp.OK || commentResp.Data.Content == "" {
		t.Fatalf("invalid comment response: %+v", commentResp)
	}

	// Verify comments loaded on GetCard and ListCards
	freshCard, err := h.store.GetCard(ctx, c.ID)
	if err != nil {
		t.Fatalf("get card: %v", err)
	}
	if len(freshCard.Comments) != 1 || freshCard.Comments[0].Content != "Reviewed research findings: architecture looks viable for Q3." {
		t.Fatalf("comments mismatch on GetCard: %+v", freshCard.Comments)
	}

	cardsList, err := h.store.ListCards(ctx, port.CardFilter{Status: port.StatusReview})
	if err != nil {
		t.Fatalf("list cards: %v", err)
	}
	if len(cardsList) == 0 || len(cardsList[0].Comments) != 1 {
		t.Fatalf("comments not batch loaded in ListCards: %+v", cardsList)
	}

	// 6. Commit from Review to Execution Board (Medium-term, To Do)
	resBoardCommit := h.doJSON(http.MethodPatch, fmt.Sprintf("/api/v1/cards/%d", c.ID), map[string]any{
		"horizon": port.HorizonMediumTerm,
		"status":  port.StatusToDo,
	})
	if resBoardCommit.Code != http.StatusOK {
		t.Fatalf("commit from review failed: %d (%s)", resBoardCommit.Code, resBoardCommit.Body.String())
	}
	committedCard, err := h.store.GetCard(ctx, c.ID)
	if err != nil {
		t.Fatalf("get card: %v", err)
	}
	if committedCard.Status != port.StatusToDo || committedCard.Horizon != port.HorizonMediumTerm {
		t.Fatalf("expected committed to to-do and medium-term, got status=%q horizon=%q", committedCard.Status, committedCard.Horizon)
	}
}

// TestFunnel_ExecutionBoardTransitions verifies Execution Board columns and Horizon shifting.
func TestFunnel_ExecutionBoardTransitions(t *testing.T) {
	h := newE2EHarness(t, `[]`)
	ctx := context.Background()

	// 1. Create card committed to Short-term To Do
	c, err := h.store.CreateCard(ctx, port.Card{
		Title:   "Implement OAuth Flow",
		Status:  port.StatusToDo,
		Horizon: port.HorizonShortTerm,
	})
	if err != nil {
		t.Fatalf("create card: %v", err)
	}

	// 2. Transition To Do -> In Progress
	resInProg := h.doJSON(http.MethodPatch, fmt.Sprintf("/api/v1/cards/%d", c.ID), map[string]any{
		"status": port.StatusInProgress,
	})
	if resInProg.Code != http.StatusOK {
		t.Fatalf("patch to in-progress failed: %d (%s)", resInProg.Code, resInProg.Body.String())
	}
	cInProg, _ := h.store.GetCard(ctx, c.ID)
	if cInProg.Status != port.StatusInProgress {
		t.Fatalf("status = %q, want %q", cInProg.Status, port.StatusInProgress)
	}

	// 3. Transition In Progress -> Done
	resDone := h.doJSON(http.MethodPatch, fmt.Sprintf("/api/v1/cards/%d", c.ID), map[string]any{
		"status": port.StatusDone,
	})
	if resDone.Code != http.StatusOK {
		t.Fatalf("patch to done failed: %d (%s)", resDone.Code, resDone.Body.String())
	}
	cDone, _ := h.store.GetCard(ctx, c.ID)
	if cDone.Status != port.StatusDone {
		t.Fatalf("status = %q, want %q", cDone.Status, port.StatusDone)
	}

	// 4. Shift Horizon: short-term -> long-term
	resShift := h.doJSON(http.MethodPatch, fmt.Sprintf("/api/v1/cards/%d", c.ID), map[string]any{
		"horizon": port.HorizonLongTerm,
	})
	if resShift.Code != http.StatusOK {
		t.Fatalf("shift horizon failed: %d (%s)", resShift.Code, resShift.Body.String())
	}
	cShifted, _ := h.store.GetCard(ctx, c.ID)
	if cShifted.Horizon != port.HorizonLongTerm {
		t.Fatalf("horizon = %q, want %q", cShifted.Horizon, port.HorizonLongTerm)
	}

	// 5. Validation rejection: deprecated "lifetime" horizon must fail
	resLifetime := h.doJSON(http.MethodPatch, fmt.Sprintf("/api/v1/cards/%d", c.ID), map[string]any{
		"horizon": "lifetime",
	})
	if resLifetime.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for deprecated 'lifetime' horizon, got %d", resLifetime.Code)
	}

	// 6. Validation rejection: deprecated "doing" status must fail
	resDoing := h.doJSON(http.MethodPatch, fmt.Sprintf("/api/v1/cards/%d", c.ID), map[string]any{
		"status": "doing",
	})
	if resDoing.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for deprecated 'doing' status, got %d", resDoing.Code)
	}
}

// TestFunnel_Migration16DataIntegrity tests that migration 16 properly migrates legacy data.
func TestFunnel_Migration16DataIntegrity(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "migration16_test.db")

	// 1. Create SQLite DB and initialize with schema up to migration 15
	rawDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	defer rawDB.Close()

	// Seed basic cards table and schema_version as if at v15
	_, err = rawDB.Exec(`
		CREATE TABLE schema_version (version INTEGER NOT NULL PRIMARY KEY, applied_at TEXT NOT NULL);
		INSERT INTO schema_version (version, applied_at) VALUES (15, '2026-01-01T00:00:00Z');

		CREATE TABLE cards (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			capture_id  INTEGER,
			title       TEXT NOT NULL,
			summary     TEXT NOT NULL DEFAULT '',
			horizon     TEXT NOT NULL DEFAULT 'short-term',
			status      TEXT NOT NULL DEFAULT 'inbox',
			source_url  TEXT NOT NULL DEFAULT '',
			source_note TEXT NOT NULL DEFAULT '',
			executive_summary TEXT NOT NULL DEFAULT '',
			value_proposition TEXT NOT NULL DEFAULT '',
			proposed_actions  TEXT NOT NULL DEFAULT '[]',
			type        TEXT NOT NULL DEFAULT 'idea',
			tldr        TEXT NOT NULL DEFAULT '',
			why_care    TEXT NOT NULL DEFAULT '',
			claims      TEXT NOT NULL DEFAULT '[]',
			open_questions TEXT NOT NULL DEFAULT '[]',
			signals     TEXT NOT NULL DEFAULT '{}',
			worthiness  TEXT NOT NULL DEFAULT '{}',
			actions_source TEXT NOT NULL DEFAULT 'triage',
			research_verdict TEXT NOT NULL DEFAULT '',
			research_confidence TEXT NOT NULL DEFAULT '',
			suggested_horizon TEXT NOT NULL DEFAULT '',
			suggested_tags TEXT NOT NULL DEFAULT '[]',
			created_at  TEXT NOT NULL,
			updated_at  TEXT NOT NULL
		);

		CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
		CREATE TABLE cards_tags (card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE, tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY (card_id, tag_id));
		CREATE TABLE card_references (id INTEGER PRIMARY KEY AUTOINCREMENT, card_id INTEGER NOT NULL, kind TEXT NOT NULL, label TEXT NOT NULL, url TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0);

		-- Insert legacy rows
		INSERT INTO cards (id, title, horizon, status, created_at, updated_at)
		VALUES (1, 'Lifetime Card', 'lifetime', 'inbox', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

		INSERT INTO cards (id, title, horizon, status, created_at, updated_at)
		VALUES (2, 'Doing Card', 'short-term', 'doing', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

		INSERT INTO cards (id, title, horizon, status, created_at, updated_at)
		VALUES (3, 'Both Legacy Card', 'lifetime', 'doing', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
	`)
	if err != nil {
		t.Fatalf("seed db failed: %v", err)
	}
	rawDB.Close()

	// 2. Open store with store.New which runs migrations including 0016
	st, err := store.New(dbPath)
	if err != nil {
		t.Fatalf("store.New failed: %v", err)
	}
	defer st.Close()
	ctx := context.Background()

	// 3. Verify card 1: lifetime -> long-term
	c1, err := st.GetCard(ctx, 1)
	if err != nil {
		t.Fatalf("get c1: %v", err)
	}
	if c1.Horizon != port.HorizonLongTerm {
		t.Errorf("c1 horizon = %q, want %q", c1.Horizon, port.HorizonLongTerm)
	}
	if c1.Status != port.StatusInbox {
		t.Errorf("c1 status = %q, want %q", c1.Status, port.StatusInbox)
	}

	// 4. Verify card 2: doing -> in-progress
	c2, err := st.GetCard(ctx, 2)
	if err != nil {
		t.Fatalf("get c2: %v", err)
	}
	if c2.Status != port.StatusInProgress {
		t.Errorf("c2 status = %q, want %q", c2.Status, port.StatusInProgress)
	}

	// 5. Verify card 3: lifetime -> long-term AND doing -> in-progress
	c3, err := st.GetCard(ctx, 3)
	if err != nil {
		t.Fatalf("get c3: %v", err)
	}
	if c3.Horizon != port.HorizonLongTerm || c3.Status != port.StatusInProgress {
		t.Errorf("c3 horizon=%q, status=%q; want long-term and in-progress", c3.Horizon, c3.Status)
	}

	// 6. Verify card_comments table works via AddCardComment and ListCardComments
	comment, err := st.AddCardComment(ctx, 1, "Migrated comment test")
	if err != nil {
		t.Fatalf("AddCardComment failed: %v", err)
	}
	if comment.CardID != 1 || comment.Content != "Migrated comment test" {
		t.Fatalf("unexpected comment: %+v", comment)
	}

	comments, err := st.ListCardComments(ctx, 1)
	if err != nil {
		t.Fatalf("ListCardComments: %v", err)
	}
	if len(comments) != 1 || comments[0].Content != "Migrated comment test" {
		t.Fatalf("unexpected comments list: %+v", comments)
	}
}
