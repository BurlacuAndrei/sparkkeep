package e2e_test

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"sparkkeep/internal/port"
)

// TestE2E_FullIngestToExportJourney executes the complete end-to-end journey (E2E-01):
// POST /api/v1/capture -> LLM Triage -> Horizon Assignment -> Deep Research -> Move to Done -> Export to Obsidian & ZIP Archive.
func TestE2E_FullIngestToExportJourney(t *testing.T) {
	triageResponseJSON := `[{
		"title": "Raft Consensus Protocol",
		"summary": "State machine replication algorithm designed for understandability.",
		"executive_summary": "Raft provides linearizable state machine replication safety with fast leader election.",
		"value_proposition": "Simpler to reason about and formally verify than Multi-Paxos.",
		"claims": [
			"Leader election is safe and randomized timers prevent split votes.",
			"Log matching property guarantees replicated state machine consistency."
		],
		"proposed_actions": [
			"Read Ongaro doctoral dissertation",
			"Prototype raft leader election in Go"
		],
		"type": "article",
		"horizon": "short-term",
		"tags": ["distributed-systems", "raft", "consensus"]
	}]`

	h := newE2EHarness(t, triageResponseJSON)
	ctx := context.Background()

	// Step 1: POST /api/v1/capture
	capturePayload := map[string]string{
		"url":  "https://raft.github.io/raft.pdf",
		"text": "Raft consensus protocol state machine replication safety and liveness proof.",
	}
	resCapture := h.doJSON(http.MethodPost, "/api/v1/capture", capturePayload)
	if resCapture.Code != http.StatusOK {
		t.Fatalf("POST /api/v1/capture failed with status %d: %s", resCapture.Code, resCapture.Body.String())
	}

	var captureResp struct {
		OK      bool    `json:"ok"`
		CardIDs []int64 `json:"card_ids"`
	}
	if err := json.Unmarshal(resCapture.Body.Bytes(), &captureResp); err != nil {
		t.Fatalf("failed to decode capture response: %v", err)
	}
	if !captureResp.OK || len(captureResp.CardIDs) == 0 {
		t.Fatalf("expected at least 1 created card, got %+v", captureResp)
	}
	cardID := captureResp.CardIDs[0]

	// Verify Step 2: Card created in store with LLM Triage output
	card, err := h.store.GetCard(ctx, cardID)
	if err != nil {
		t.Fatalf("get card %d: %v", cardID, err)
	}
	if card.Status != port.StatusInbox {
		t.Errorf("expected card status 'inbox', got %q", card.Status)
	}
	if card.Title != "Raft Consensus Protocol" {
		t.Errorf("card title = %q, want 'Raft Consensus Protocol'", card.Title)
	}
	if card.ExecutiveSummary == "" {
		t.Errorf("expected non-empty executive summary")
	}

	// Step 3: Horizon Assignment: User assigns horizon to medium-term
	patchHorizonPayload := map[string]any{
		"horizon": port.HorizonMediumTerm,
	}
	resHorizon := h.doJSON(http.MethodPatch, fmt.Sprintf("/api/v1/cards/%d", cardID), patchHorizonPayload)
	if resHorizon.Code != http.StatusOK {
		t.Fatalf("PATCH horizon failed: %d (%s)", resHorizon.Code, resHorizon.Body.String())
	}
	card, err = h.store.GetCard(ctx, cardID)
	if err != nil || card.Horizon != port.HorizonMediumTerm {
		t.Fatalf("expected horizon %q, got %q (err=%v)", port.HorizonMediumTerm, card.Horizon, err)
	}

	// Step 4: Deep Research
	err = h.service.Research(ctx, cardID)
	if err != nil {
		t.Fatalf("Deep research failed: %v", err)
	}
	card, err = h.store.GetCard(ctx, cardID)
	if err != nil {
		t.Fatalf("get card after research: %v", err)
	}
	if card.ResearchState != port.ResearchStateDone {
		t.Errorf("expected research_state 'done', got %q", card.ResearchState)
	}
	if card.Status != port.StatusReview {
		t.Errorf("expected card status 'review' after research, got %q", card.Status)
	}

	// Step 5: Move to Done
	patchDonePayload := map[string]any{
		"status": port.StatusDone,
	}
	resDone := h.doJSON(http.MethodPatch, fmt.Sprintf("/api/v1/cards/%d", cardID), patchDonePayload)
	if resDone.Code != http.StatusOK {
		t.Fatalf("PATCH status=done failed: %d (%s)", resDone.Code, resDone.Body.String())
	}
	card, err = h.store.GetCard(ctx, cardID)
	if err != nil || card.Status != port.StatusDone {
		t.Fatalf("expected status 'done', got %q", card.Status)
	}

	// Step 6: Export to Obsidian (single note export via GET /api/v1/cards/{id}/export.md)
	resExportMD := h.doJSON(http.MethodGet, fmt.Sprintf("/api/v1/cards/%d/export.md", cardID), nil)
	if resExportMD.Code != http.StatusOK {
		t.Fatalf("GET export.md failed: %d (%s)", resExportMD.Code, resExportMD.Body.String())
	}
	mdContent := resExportMD.Body.String()

	// Verify Obsidian note structure
	if !strings.HasPrefix(mdContent, "---\n") || !strings.Contains(mdContent, "---\n\n") {
		t.Errorf("export.md missing YAML frontmatter delimiters")
	}
	if !strings.Contains(mdContent, `status: done`) {
		t.Errorf("export.md frontmatter missing status: done")
	}
	if !strings.Contains(mdContent, `researched: true`) {
		t.Errorf("export.md frontmatter missing researched: true")
	}
	if !strings.Contains(mdContent, "## Executive Summary") {
		t.Errorf("export.md missing Executive Summary section")
	}
	if !strings.Contains(mdContent, "## Research Dossier") {
		t.Errorf("export.md missing Research Dossier section")
	}

	// Check claims edge case
	t.Logf("Exported markdown:\n%s", mdContent)
	hasClaims := strings.Contains(mdContent, "## Claims")
	t.Logf("Exported markdown contains '## Claims': %v", hasClaims)

	// Step 7: Export to ZIP Archive (GET /api/v1/export/archive.zip)
	resZip := h.doJSON(http.MethodGet, "/api/v1/export/archive.zip", nil)
	if resZip.Code != http.StatusOK {
		t.Fatalf("GET /api/v1/export/archive.zip failed: %d", resZip.Code)
	}
	ct := resZip.Header().Get("Content-Type")
	if ct != "application/zip" {
		t.Errorf("expected Content-Type application/zip, got %q", ct)
	}

	// Read and verify zip structure
	zipBytes := resZip.Body.Bytes()
	zipRdr, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		t.Fatalf("failed to open zip reader: %v", err)
	}

	foundDoneNote := false
	for _, file := range zipRdr.File {
		t.Logf("Zip entry: %s", file.Name)
		if strings.HasPrefix(file.Name, "cards/Done/") && strings.Contains(file.Name, "Raft") {
			foundDoneNote = true
			rc, err := file.Open()
			if err != nil {
				t.Fatalf("open zip file %s: %v", file.Name, err)
			}
			content, _ := io.ReadAll(rc)
			rc.Close()
			if !strings.Contains(string(content), "## Research Dossier") {
				t.Errorf("zip note missing Research Dossier: %s", string(content))
			}
		}
	}
	if !foundDoneNote {
		t.Errorf("did not find card under cards/Done/ in ZIP archive")
	}
}

// TestE2E_SPAFallbackRouting verifies whether direct navigation to sub-paths serves index.html (E2E-02).
func TestE2E_SPAFallbackRouting(t *testing.T) {
	h := newE2EHarness(t, "")
	routes := []string{"/cards", "/triage", "/playbooks", "/settings"}
	for _, route := range routes {
		res := h.doJSON(http.MethodGet, route, nil)
		if res.Code != http.StatusOK {
			t.Errorf("GET %s returned status %d, want 200", route, res.Code)
		}
		ct := res.Header().Get("Content-Type")
		if !strings.HasPrefix(ct, "text/html") {
			t.Errorf("GET %s returned Content-Type %q, want text/html", route, ct)
		}
		if !strings.Contains(res.Body.String(), "<div id=\"root\"></div>") {
			t.Errorf("GET %s did not serve index.html content", route)
		}
	}
}
