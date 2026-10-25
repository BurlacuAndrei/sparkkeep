package joplin

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"sparkkeep/internal/i18n"
	"sparkkeep/internal/port"
)

func TestCardNoteID(t *testing.T) {
	// Test deterministic ID generation
	id1 := CardNoteID(42)
	id2 := CardNoteID(42)
	if id1 != id2 {
		t.Errorf("CardNoteID not deterministic: %s != %s", id1, id2)
	}
	if len(id1) != 32 {
		t.Errorf("CardNoteID length: got %d, want 32", len(id1))
	}
	// Verify it's valid hex
	if _, err := hex.DecodeString(id1); err != nil {
		t.Errorf("CardNoteID not valid hex: %v", err)
	}
	// Different card IDs should produce different IDs
	id3 := CardNoteID(43)
	if id1 == id3 {
		t.Errorf("Different card IDs produced same note ID")
	}
}

func TestNotebookID(t *testing.T) {
	id1 := NotebookID()
	id2 := NotebookID()
	if id1 != id2 {
		t.Errorf("NotebookID not deterministic: %s != %s", id1, id2)
	}
	if len(id1) != 32 {
		t.Errorf("NotebookID length: got %d, want 32", len(id1))
	}
	// Verify against known value
	h := sha256.Sum256([]byte("sparkkeep:notebook"))
	expected := hex.EncodeToString(h[:])[:32]
	if id1 != expected {
		t.Errorf("NotebookID mismatch: got %s, want %s", id1, expected)
	}
}

func TestTagID(t *testing.T) {
	id1 := TagID("golang")
	id2 := TagID("golang")
	if id1 != id2 {
		t.Errorf("TagID not deterministic: %s != %s", id1, id2)
	}
	if len(id1) != 32 {
		t.Errorf("TagID length: got %d, want 32", len(id1))
	}
	// Different tags should produce different IDs
	id3 := TagID("rust")
	if id1 == id3 {
		t.Errorf("Different tags produced same ID")
	}
}

func TestBuildMarkdownBody(t *testing.T) {
	client := NewClient(Config{Mode: ModeClipper, BaseURL: "http://localhost:41184"})

	exp := port.CardExport{
		Card: port.Card{
			ID:               1,
			Title:            "Test Card",
			Summary:          "A summary",
			ExecutiveSummary: "Exec summary",
			ValueProposition: "Value prop",
			ProposedActions:  []string{"Action 1", "Action 2"},
			SourceURL:        "https://example.com",
			SourceNote:       "Some notes",
			Tags:             []string{"tag1", "tag2"},
			References: []port.Reference{
				{Label: "Ref 1", URL: "https://ref1.com", Kind: "url"},
				{Label: "Ref 2", Kind: "tool"},
			},
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		},
		Research: &port.Research{
			ID:        1,
			CardID:    1,
			Status:    "done",
			Findings:  "Research findings here",
			CreatedAt: time.Now(),
			PlaybookSnapshot: &port.Playbook{
				Name: "Test Playbook",
			},
			Steps: []port.ResearchStep{
				{ID: "s1", Status: "done", FinishedAt: time.Now()},
			},
		},
	}

	body := client.buildMarkdownBody(exp)

	// Check all sections present
	checks := []string{
		"# Test Card",
		"## Executive Summary",
		"Exec summary",
		"## Value Proposition",
		"Value prop",
		"## Proposed Actions",
		"- [ ] Action 1",
		"- [ ] Action 2",
		"## Source Notes",
		"Some notes",
		"## References",
		"[Ref 1](https://ref1.com) (url)",
		"- Ref 2 (tool)",
		"## Research Dossier",
		"**Playbook:** Test Playbook",
		"Research findings here",
	}

	for _, check := range checks {
		if !strings.Contains(body, check) {
			t.Errorf("Missing expected content: %q\n\nBody:\n%s", check, body)
		}
	}
}

func TestBuildMarkdownBody_NoResearch(t *testing.T) {
	client := NewClient(Config{Mode: ModeClipper, BaseURL: "http://localhost:41184"})

	exp := port.CardExport{
		Card: port.Card{
			ID:        1,
			Title:     "No Research Card",
			Summary:   "Just a summary",
			Tags:      []string{},
			CreatedAt: time.Now(),
		},
		Research: nil,
	}

	body := client.buildMarkdownBody(exp)

	if strings.Contains(body, "## Research Dossier") {
		t.Errorf("Should not have Research Dossier when no research")
	}
	if !strings.Contains(body, "## Summary") {
		t.Errorf("Should have Summary section when no executive summary")
	}
}

func TestClient_ServerMode_Authentication(t *testing.T) {
	// Mock Joplin Server that expects login
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/sessions":
			if r.Method != http.MethodPost {
				w.WriteHeader(http.StatusMethodNotAllowed)
				return
			}
			var req struct {
				Email    string `json:"email"`
				Password string `json:"password"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			if req.Email == "test@example.com" && req.Password == "password123" {
				json.NewEncoder(w).Encode(map[string]string{"token": "test-session-token"})
			} else {
				w.WriteHeader(http.StatusUnauthorized)
			}
		case "/api/folders":
			auth := r.Header.Get("Authorization")
			if auth != "Bearer test-session-token" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			if r.Method == http.MethodGet {
				json.NewEncoder(w).Encode(map[string]any{
					"items": []map[string]string{{"id": "existing-folder", "title": "Sparkkeep"}},
				})
			} else if r.Method == http.MethodPost {
				w.WriteHeader(http.StatusCreated)
			}
		case "/api/notes/test-note-id":
			if r.Method == http.MethodGet {
				w.WriteHeader(http.StatusNotFound)
			}
		case "/api/notes":
			if r.Method == http.MethodPost {
				w.WriteHeader(http.StatusCreated)
			}
		case "/api/tags":
			if r.Method == http.MethodGet {
				json.NewEncoder(w).Encode(map[string]any{"items": []map[string]string{}})
			} else if r.Method == http.MethodPost {
				w.WriteHeader(http.StatusCreated)
			}
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer mockServer.Close()

	client := NewClient(Config{
		Mode:     ModeServer,
		BaseURL:  mockServer.URL,
		Email:    "test@example.com",
		Password: "password123",
	})

	ctx := context.Background()

	// Test authentication
	err := client.authenticate(ctx)
	if err != nil {
		t.Fatalf("authenticate failed: %v", err)
	}
	if client.token != "test-session-token" {
		t.Errorf("token not set: got %s", client.token)
	}

	// Test connection
	result, err := client.TestConnection(ctx)
	if err != nil {
		t.Fatalf("TestConnection failed: %v", err)
	}
	if !result.Success {
		t.Errorf("TestConnection failed: %s", result.Message)
	}
}

func TestClient_ClipperMode(t *testing.T) {
	// Mock Clipper API
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if auth != "Bearer clipper-token" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		switch r.URL.Path {
		case "/ping":
			w.WriteHeader(http.StatusOK)
		case "/folders":
			if r.Method == http.MethodGet {
				json.NewEncoder(w).Encode(map[string]any{
					"items": []map[string]string{{"id": "existing-folder", "title": "Sparkkeep"}},
				})
			} else if r.Method == http.MethodPost {
				w.WriteHeader(http.StatusCreated)
			}
		case "/notes/test-note-id":
			if r.Method == http.MethodGet {
				w.WriteHeader(http.StatusNotFound)
			}
		case "/notes":
			if r.Method == http.MethodPost {
				w.WriteHeader(http.StatusCreated)
			}
		case "/tags":
			if r.Method == http.MethodGet {
				json.NewEncoder(w).Encode(map[string]any{"items": []map[string]string{}})
			} else if r.Method == http.MethodPost {
				w.WriteHeader(http.StatusCreated)
			}
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer mockServer.Close()

	client := NewClient(Config{
		Mode:    ModeClipper,
		BaseURL: mockServer.URL,
		Token:   "clipper-token",
	})

	ctx := context.Background()

	result, err := client.TestConnection(ctx)
	if err != nil {
		t.Fatalf("TestConnection failed: %v", err)
	}
	if !result.Success {
		t.Errorf("TestConnection failed: %s", result.Message)
	}
}

func TestClient_UpsertCardExport_Idempotent(t *testing.T) {
	callCount := 0
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if auth != "Bearer clipper-token" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		callCount++
		switch r.URL.Path {
		case "/ping":
			w.WriteHeader(http.StatusOK)
		case "/folders":
			if r.Method == http.MethodGet {
				json.NewEncoder(w).Encode(map[string]any{
					"items": []map[string]string{{"id": NotebookID(), "title": "Sparkkeep"}},
				})
			}
		case "/notes/" + CardNoteID(42):
			if r.Method == http.MethodGet {
				if callCount == 2 { // First upsert creates, second finds it
					json.NewEncoder(w).Encode(map[string]any{
						"id": CardNoteID(42), "title": "Test", "body": "", "parent_id": NotebookID(),
					})
				} else {
					w.WriteHeader(http.StatusNotFound)
				}
			} else if r.Method == http.MethodPut {
				w.WriteHeader(http.StatusOK)
			}
		case "/notes":
			if r.Method == http.MethodPost {
				w.WriteHeader(http.StatusCreated)
			}
		case "/tags":
			if r.Method == http.MethodGet {
				json.NewEncoder(w).Encode(map[string]any{"items": []map[string]string{}})
			} else if r.Method == http.MethodPost {
				w.WriteHeader(http.StatusCreated)
			}
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer mockServer.Close()

	client := NewClient(Config{
		Mode:    ModeClipper,
		BaseURL: mockServer.URL,
		Token:   "clipper-token",
	})

	ctx := context.Background()
	exp := port.CardExport{
		Card: port.Card{
			ID:        42,
			Title:     "Idempotent Test",
			Summary:   "Summary",
			Tags:      []string{"test"},
			CreatedAt: time.Now(),
		},
	}

	// First upsert (create)
	id1, err := client.UpsertCardExport(ctx, exp)
	if err != nil {
		t.Fatalf("First upsert failed: %v", err)
	}
	if id1 != CardNoteID(42) {
		t.Errorf("Wrong note ID: got %s, want %s", id1, CardNoteID(42))
	}

	// Second upsert (update) - should be idempotent
	id2, err := client.UpsertCardExport(ctx, exp)
	if err != nil {
		t.Fatalf("Second upsert failed: %v", err)
	}
	if id2 != CardNoteID(42) {
		t.Errorf("Wrong note ID on second upsert: got %s", id2)
	}

	// Should have made: ping, folders GET, notes GET (404), notes POST, tags GET, tags POST
	// Second round: notes GET (200), notes PUT, tags GET
	if callCount < 8 {
		t.Errorf("Expected multiple API calls, got %d", callCount)
	}
}

func TestJoplinLocalizedHeadings(t *testing.T) {
	locales := []string{"en", "ro", "es", "pt-BR", "fr", "de"}
	client := NewClient(Config{Mode: ModeClipper, Token: "tok"})

	for _, loc := range locales {
		h := i18n.GetHeadings(loc)
		exp := port.CardExport{
			Locale: loc,
			Card: port.Card{
				ID:               99,
				Title:            "Joplin Note Title",
				ExecutiveSummary: "Exec text",
				ValueProposition: "Value prop text",
				ProposedActions:  []string{"Task A"},
				SourceNote:       "Note text",
			},
			Research: &port.Research{
				ID: 5,
				PlaybookSnapshot: &port.Playbook{
					Name: "Audit",
				},
				Findings: "Findings text",
			},
		}

		body := client.buildMarkdownBody(exp)
		expected := []string{
			"## " + h.ExecutiveSummary,
			"## " + h.ValueProposition,
			"## " + h.ProposedActions,
			"## " + h.SourceNotes,
			"## " + h.ResearchDossier,
			"**" + h.Playbook + ":** Audit",
		}
		for _, ex := range expected {
			if !strings.Contains(body, ex) {
				t.Errorf("[%s] expected body to contain %q, got:\n%s", loc, ex, body)
			}
		}
	}
}
