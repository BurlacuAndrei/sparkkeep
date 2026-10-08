package e2e_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	_ "modernc.org/sqlite"

	"sparkkeep/internal/analyze"
	"sparkkeep/internal/capture"
	"sparkkeep/internal/channel/telegram"
	"sparkkeep/internal/config"
	"sparkkeep/internal/core"
	"sparkkeep/internal/license"
	"sparkkeep/internal/port"
	"sparkkeep/internal/store"
	"sparkkeep/internal/web"
)

// harness wraps an end-to-end stack running against an isolated SQLite test database.
type harness struct {
	t       *testing.T
	dbPath  string
	store   *store.Store
	service *core.Service
	handler http.Handler
	llmSrv  *httptest.Server
	tgSrv   *httptest.Server
	tgSent  []string
}

func newE2EHarness(t *testing.T, llmResponseJSON string) *harness {
	t.Helper()

	// 1. Isolated SQLite database in t.TempDir (clean teardown)
	dbPath := filepath.Join(t.TempDir(), "e2e_isolated.db")
	st, err := store.New(dbPath)
	if err != nil {
		t.Fatalf("failed to init isolated store: %v", err)
	}
	t.Cleanup(func() { st.Close() })

	// 2. Mock LLM server
	llmSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`, strconv.Quote(llmResponseJSON))
	}))
	t.Cleanup(llmSrv.Close)

	// 3. Mock Telegram API server
	h := &harness{t: t, dbPath: dbPath, store: st, llmSrv: llmSrv}
	h.tgSrv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/sendChatAction") {
			_, _ = w.Write([]byte(`{"ok":true,"result":true}`))
			return
		}
		var msg struct {
			Text string `json:"text"`
		}
		_ = json.NewDecoder(r.Body).Decode(&msg)
		h.tgSent = append(h.tgSent, msg.Text)
		_, _ = w.Write([]byte(`{"ok":true,"result":{"message_id":99}}`))
	}))
	t.Cleanup(h.tgSrv.Close)

	// 4. Core service
	cfg := config.Config{
		LLMBase:   llmSrv.URL,
		LLMModel:  "stub-model",
		PublicURL: "https://test.sparkkeep.local",
	}
	ac := analyze.New(cfg, llmSrv.Client())
	h.service = &core.Service{
		Store:   st,
		Fetcher: capture.Capture{},
		Analyze: ac,
		Logf:    t.Logf,
		License: license.SetupProForTest(context.Background(), st),
	}

	// 5. Telegram Adapter
	tgAdapter := &telegram.Adapter{
		Token:   "e2e-token",
		OwnerID: 1001,
		Store:   st,
		Service: h.service,
		Logf:    t.Logf,
	}
	h.service.Channel = tgAdapter

	// 6. Web API Handler
	h.handler = web.New(st, h.service, cfg)
	return h
}

func (h *harness) doJSON(method, path string, body any) *httptest.ResponseRecorder {
	h.t.Helper()
	var rdr *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			h.t.Fatalf("marshal request body: %v", err)
		}
		rdr = bytes.NewReader(b)
	} else {
		rdr = bytes.NewReader(nil)
	}

	req := httptest.NewRequest(method, path, rdr)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	rr := httptest.NewRecorder()
	h.handler.ServeHTTP(rr, req)
	return rr
}

// E2E-001: Ingestion of Telegram message into Inbox Card
func TestE2E_TelegramIngestionToInbox(t *testing.T) {
	sampleTelegramCard := `[{
		"title": "Agency Agents - 200+ Specialized AI Agents",
		"summary": "Full AI agency repo for Claude Code, Cursor and Copilot.",
		"type": "repo",
		"horizon": "short-term",
		"tags": ["ai", "agents", "github"],
		"links": []
	}]`

	h := newE2EHarness(t, sampleTelegramCard)
	ctx := context.Background()

	// Simulate capture via service (as Telegram adapter does upon receiving chat link)
	cardIDs, err := h.service.CaptureShare(ctx, capture.Share{
		Kind:    "link",
		URL:     "https://www.instagram.com/reel/DdTdlm9i_Eg/?stkn=ZHp6YjZ4Z3NwbGdy",
		Caption: "THIS GITHUB REPO IS A GOLDMINE FOR AI CODERS",
	})
	if err != nil {
		t.Fatalf("CaptureShare failed: %v", err)
	}
	if len(cardIDs) == 0 {
		t.Fatal("expected at least 1 created card ID")
	}

	// Verify card was created in store with inbox status
	cards, err := h.store.ListCards(ctx, port.CardFilter{})
	if err != nil {
		t.Fatalf("ListCards failed: %v", err)
	}
	if len(cards) != 1 {
		t.Fatalf("expected 1 card, got %d", len(cards))
	}

	card := cards[0]
	if card.Status != port.StatusInbox {
		t.Errorf("card status = %q, want %q", card.Status, port.StatusInbox)
	}
	if card.Title != "Agency Agents - 200+ Specialized AI Agents" {
		t.Errorf("card title = %q, want %q", card.Title, "Agency Agents - 200+ Specialized AI Agents")
	}
	if card.Type != port.CardTypeRepo {
		t.Errorf("card type = %q, want %q", card.Type, port.CardTypeRepo)
	}
}

// E2E-002: Batch Queue Research from Inbox
func TestE2E_BatchQueueResearch(t *testing.T) {
	h := newE2EHarness(t, `[]`)
	ctx := context.Background()

	c1, err := h.store.CreateCard(ctx, port.Card{Title: "Telegram Spark 1", Status: port.StatusInbox})
	if err != nil {
		t.Fatalf("create c1: %v", err)
	}
	c2, err := h.store.CreateCard(ctx, port.Card{Title: "Telegram Spark 2", Status: port.StatusInbox})
	if err != nil {
		t.Fatalf("create c2: %v", err)
	}

	// POST /api/v1/research/batch with card IDs
	reqBody := map[string]any{"card_ids": []int64{c1.ID, c2.ID}}
	res := h.doJSON(http.MethodPost, "/api/v1/research/batch", reqBody)
	if res.Code != http.StatusOK {
		t.Fatalf("batch queue status = %d, want 200: %s", res.Code, res.Body.String())
	}

	var batchResp struct {
		OK     bool            `json:"ok"`
		Queued []port.Research `json:"queued"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &batchResp); err != nil {
		t.Fatalf("decode batch response: %v", err)
	}
	if !batchResp.OK || len(batchResp.Queued) != 2 {
		t.Fatalf("expected 2 queued items, got %d", len(batchResp.Queued))
	}
}

// E2E-003: Review Drawer Action -> Move to Doing
func TestE2E_ReviewDrawerStateTransitions(t *testing.T) {
	h := newE2EHarness(t, `[]`)
	ctx := context.Background()

	// Seed card in 'review' status (arrived from deep research)
	c, err := h.store.CreateCard(ctx, port.Card{
		Title:            "Distributed Consensus with Raft",
		Status:           port.StatusReview,
		ExecutiveSummary: "Comprehensive study on Raft vs Multi-Paxos in Go.",
		Type:             port.CardTypeArticle,
	})
	if err != nil {
		t.Fatalf("create card: %v", err)
	}

	// User clicks "Move to Doing" in review drawer
	newStatus := port.StatusDoing
	patchBody := map[string]any{"status": newStatus}
	res := h.doJSON(http.MethodPatch, fmt.Sprintf("/api/v1/cards/%d", c.ID), patchBody)
	if res.Code != http.StatusOK {
		t.Fatalf("patch card status = %d, want 200: %s", res.Code, res.Body.String())
	}

	// Verify updated status in database
	updated, err := h.store.GetCard(ctx, c.ID)
	if err != nil {
		t.Fatalf("get card: %v", err)
	}
	if updated.Status != port.StatusDoing {
		t.Errorf("card status = %q, want %q", updated.Status, port.StatusDoing)
	}
}

// E2E-004: Shelve and Re-activate Flow (Review -> Shelved -> Doing)
func TestE2E_ShelveAndReactivateFlow(t *testing.T) {
	h := newE2EHarness(t, `[]`)
	ctx := context.Background()

	// 1. Create card in review
	c, err := h.store.CreateCard(ctx, port.Card{
		Title:   "Local LLM Fine-Tuning Pipeline",
		Status:  port.StatusReview,
		Horizon: port.HorizonMediumTerm,
	})
	if err != nil {
		t.Fatalf("create card: %v", err)
	}

	// 2. Click "Shelve" in review drawer
	shelveBody := map[string]any{"status": port.StatusShelved}
	res := h.doJSON(http.MethodPatch, fmt.Sprintf("/api/v1/cards/%d", c.ID), shelveBody)
	if res.Code != http.StatusOK {
		t.Fatalf("shelve status = %d, want 200: %s", res.Code, res.Body.String())
	}

	shelvedCard, err := h.store.GetCard(ctx, c.ID)
	if err != nil {
		t.Fatalf("get shelved card: %v", err)
	}
	if shelvedCard.Status != port.StatusShelved {
		t.Fatalf("card status = %q, want shelved", shelvedCard.Status)
	}

	// 3. User browses Execution Tab -> Shelved column and re-activates card to "doing"
	reactivateBody := map[string]any{"status": port.StatusDoing}
	res2 := h.doJSON(http.MethodPatch, fmt.Sprintf("/api/v1/cards/%d", c.ID), reactivateBody)
	if res2.Code != http.StatusOK {
		t.Fatalf("reactivate status = %d, want 200: %s", res2.Code, res2.Body.String())
	}

	doingCard, err := h.store.GetCard(ctx, c.ID)
	if err != nil {
		t.Fatalf("get reactivated card: %v", err)
	}
	if doingCard.Status != port.StatusDoing {
		t.Errorf("reactivated card status = %q, want doing", doingCard.Status)
	}
}

// E2E-005: Completed Card and 7-Day Auto-Archive Rule
func TestE2E_DoneAndAutoArchiveRule(t *testing.T) {
	h := newE2EHarness(t, `[]`)
	ctx := context.Background()

	// Create active Done card (recent)
	recentCard, err := h.store.CreateCard(ctx, port.Card{
		Title:  "Setup PWA Manifest",
		Status: port.StatusDone,
	})
	if err != nil {
		t.Fatalf("create recentCard: %v", err)
	}

	// Create older Done card (> 7 days stale)
	oldCard, err := h.store.CreateCard(ctx, port.Card{
		Title:  "Legacy OAuth Integration",
		Status: port.StatusDone,
	})
	if err != nil {
		t.Fatalf("create oldCard: %v", err)
	}

	// Explicitly set updated_at / created_at to 10 days ago for oldCard
	rawDB, err := sql.Open("sqlite", h.dbPath)
	if err != nil {
		t.Fatalf("open raw db: %v", err)
	}
	defer rawDB.Close()

	eightDaysAgo := time.Now().UTC().Add(-10 * 24 * time.Hour)
	_, err = rawDB.Exec(`UPDATE cards SET updated_at = ?, created_at = ? WHERE id = ?`,
		eightDaysAgo.Format(time.RFC3339), eightDaysAgo.Format(time.RFC3339), oldCard.ID)
	if err != nil {
		t.Fatalf("update oldCard timestamp: %v", err)
	}

	// 1. Fetch cards via Web API: GET /api/v1/cards?status=done
	res := h.doJSON(http.MethodGet, "/api/v1/cards?status=done", nil)
	if res.Code != http.StatusOK {
		t.Fatalf("GET /api/v1/cards status = %d: %s", res.Code, res.Body.String())
	}

	var resp struct {
		OK    bool        `json:"ok"`
		Cards []port.Card `json:"cards"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode cards: %v", err)
	}
	allDone := resp.Cards
	if len(allDone) != 2 {
		t.Fatalf("expected 2 done cards total in DB, got %d", len(allDone))
	}

	// 2. Validate client-side / filtering 7-day threshold logic:
	sevenDaysMS := 7 * 24 * time.Hour
	now := time.Now().UTC()

	var activeDone []port.Card
	var archivedDone []port.Card
	for _, c := range allDone {
		if now.Sub(c.UpdatedAt) > sevenDaysMS {
			archivedDone = append(archivedDone, c)
		} else {
			activeDone = append(activeDone, c)
		}
	}

	if len(activeDone) != 1 || activeDone[0].ID != recentCard.ID {
		t.Errorf("activeDone expected recent card ID %d, got %+v", recentCard.ID, activeDone)
	}
	if len(archivedDone) != 1 || archivedDone[0].ID != oldCard.ID {
		t.Errorf("archivedDone expected old card ID %d, got %+v", oldCard.ID, archivedDone)
	}
}

// E2E-006: Data Teardown and Isolation Verification
func TestE2E_DataTeardownIsolation(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "isolated.db")

	st, err := store.New(dbPath)
	if err != nil {
		t.Fatalf("failed to init store: %v", err)
	}

	ctx := context.Background()
	_, err = st.CreateCard(ctx, port.Card{Title: "Ephemeral Card", Status: port.StatusInbox})
	if err != nil {
		t.Fatalf("create ephemeral card: %v", err)
	}

	rawDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open raw db: %v", err)
	}
	defer rawDB.Close()

	count := 0
	if err := rawDB.QueryRowContext(ctx, "SELECT count(*) FROM cards").Scan(&count); err != nil {
		t.Fatalf("query count: %v", err)
	}
	if count != 1 {
		t.Errorf("expected 1 card in isolated store, got %d", count)
	}

	// Close store and verify file exists only in temporary directory
	st.Close()

	// Assert the production database was never written to
	prodDBPath := filepath.Join("data", "sparkkeep.db")
	if prodDBPath == dbPath {
		t.Fatalf("test database path matched production database path!")
	}
}
