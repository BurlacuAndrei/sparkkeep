package notion

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"sparkkeep/internal/port"
)

func TestChunkText(t *testing.T) {
	cases := []struct {
		name     string
		input    string
		maxChars int
		want     []string
	}{
		{
			name:     "short text",
			input:    "Hello world",
			maxChars: 2000,
			want:     []string{"Hello world"},
		},
		{
			name:     "long text split at sentences",
			input:    strings.Repeat("This is a sentence. ", 150),
			maxChars: 2000,
			// The chunking will split at sentence boundaries within 2000 chars
			want: nil, // We'll just verify it produces chunks
		},
		{
			name:     "single long sentence hard split",
			input:    strings.Repeat("a", 5000),
			maxChars: 2000,
			want: []string{
				strings.Repeat("a", 2000),
				strings.Repeat("a", 2000),
				strings.Repeat("a", 1000),
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := chunkText(tc.input, tc.maxChars)
			if tc.want != nil {
				if len(got) != len(tc.want) {
					t.Errorf("chunkText() = %d chunks, want %d", len(got), len(tc.want))
					return
				}
				for i := range got {
					if got[i] != tc.want[i] {
						t.Errorf("chunk[%d] = %q, want %q", i, got[i], tc.want[i])
					}
				}
			} else {
				// Just verify we get some chunks
				if len(got) == 0 {
					t.Errorf("chunkText() returned no chunks")
				}
				// Verify no chunk exceeds maxChars
				for i, chunk := range got {
					if len(chunk) > tc.maxChars {
						t.Errorf("chunk[%d] length %d exceeds maxChars %d", i, len(chunk), tc.maxChars)
					}
				}
			}
		})
	}
}

func TestSplitSentences(t *testing.T) {
	cases := []struct {
		input string
		want  []string
	}{
		{"Hello world.", []string{"Hello world."}},
		{"Hello. World!", []string{"Hello.", "World!"}},
		{"Hello? World.", []string{"Hello?", "World."}},
		{"No punctuation", []string{"No punctuation"}},
	}

	for _, tc := range cases {
		got := splitSentences(tc.input)
		if len(got) != len(tc.want) {
			t.Errorf("splitSentences(%q) = %v, want %v", tc.input, got, tc.want)
		}
		for i := range got {
			if got[i] != tc.want[i] {
				t.Errorf("sentence[%d] = %q, want %q", i, got[i], tc.want[i])
			}
		}
	}
}

func TestBlockBuilders(t *testing.T) {
	// Test heading block
	h := headingBlock(2, "Test Heading")
	if h["type"] != "heading_2" {
		t.Errorf("headingBlock type = %v, want heading_2", h["type"])
	}

	// Test paragraph block
	p := paragraphBlock("Test paragraph")
	if p["type"] != "paragraph" {
		t.Errorf("paragraphBlock type = %v, want paragraph", p["type"])
	}

	// Test bulleted list item
	b := bulletedListItemBlock("Item 1")
	if b["type"] != "bulleted_list_item" {
		t.Errorf("bulletedListItemBlock type = %v, want bulleted_list_item", b["type"])
	}

	// Test to-do block
	td := toDoBlock("Task 1", true)
	if td["type"] != "to_do" {
		t.Errorf("toDoBlock type = %v, want to_do", td["type"])
	}
	todo := td["to_do"].(map[string]any)
	if todo["checked"] != true {
		t.Errorf("toDoBlock checked = %v, want true", todo["checked"])
	}

	// Test code block
	c := codeBlock("fmt.Println(\"hello\")", "go")
	if c["type"] != "code" {
		t.Errorf("codeBlock type = %v, want code", c["type"])
	}
	code := c["code"].(map[string]any)
	if code["language"] != "go" {
		t.Errorf("codeBlock language = %v, want go", code["language"])
	}

	// Test callout block
	co := calloutBlock("📋", paragraphBlock("Content"))
	if co["type"] != "callout" {
		t.Errorf("calloutBlock type = %v, want callout", co["type"])
	}
	callout := co["callout"].(map[string]any)
	if callout["icon"].(map[string]any)["emoji"] != "📋" {
		t.Errorf("calloutBlock emoji = %v, want 📋", callout["icon"])
	}
}

func TestClientTestConnection(t *testing.T) {
	// Test missing token
	client := NewClient(Config{Token: "", DatabaseID: "test"})
	res, err := client.TestConnection(context.Background())
	if err != nil {
		t.Fatalf("TestConnection error: %v", err)
	}
	if res.Success {
		t.Error("expected success=false for missing token")
	}

	// Test missing database ID
	client = NewClient(Config{Token: "secret_123", DatabaseID: ""})
	res, err = client.TestConnection(context.Background())
	if err != nil {
		t.Fatalf("TestConnection error: %v", err)
	}
	if res.Success {
		t.Error("expected success=false for missing database ID")
	}
}

func TestClientUpsertCardExport(t *testing.T) {
	// Mock Notion API server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/databases/test_db/query":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"results": []any{},
			})
		case "/v1/pages":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "page_123"})
		case "/v1/pages/page_123":
			if r.Method == http.MethodPatch {
				w.WriteHeader(http.StatusOK)
			}
		case "/v1/blocks/page_123/children":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"results": []any{}})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	client := NewClient(Config{
		Token:      "secret_test",
		DatabaseID: "test_db",
		BaseURL:    server.URL + "/v1",
	})

	exp := port.CardExport{
		Card: port.Card{
			ID:               42,
			Title:            "Test Card",
			Summary:          "Test summary",
			Horizon:          "short-term",
			Status:           "inbox",
			SourceURL:        "https://example.com",
			Tags:             []string{"tag1", "tag2"},
			Type:             "article",
			CreatedAt:        time.Now(),
			UpdatedAt:        time.Now(),
			ExecutiveSummary: "Exec summary",
			ValueProposition: "Value prop",
			ProposedActions:  []string{"Action 1", "Action 2"},
			References: []port.Reference{
				{Kind: "url", Label: "Ref 1", URL: "https://ref1.com"},
			},
		},
		Research: nil,
	}

	pageID, err := client.UpsertCardExport(context.Background(), exp)
	if err != nil {
		t.Fatalf("UpsertCardExport error: %v", err)
	}
	if pageID != "page_123" {
		t.Errorf("got pageID %q, want 'page_123'", pageID)
	}
}

func TestCreatePage_BatchesExceeding100Blocks(t *testing.T) {
	var mu sync.Mutex
	createBlocksCount := 0
	var appendBatches []int

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		bodyBytes, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		var payload struct {
			Children []map[string]any `json:"children"`
		}
		_ = json.Unmarshal(bodyBytes, &payload)

		mu.Lock()
		defer mu.Unlock()

		switch {
		case r.URL.Path == "/v1/pages" && r.Method == http.MethodPost:
			// Notion rejects children > 100 with HTTP 400
			if len(payload.Children) > 100 {
				w.WriteHeader(http.StatusBadRequest)
				_, _ = w.Write([]byte(`{"object":"error","status":400,"message":"children length > 100"}`))
				return
			}
			createBlocksCount = len(payload.Children)
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "page_split_123"})

		case strings.HasPrefix(r.URL.Path, "/v1/blocks/page_split_123/children") && r.Method == http.MethodPatch:
			// Notion rejects append children > 100 with HTTP 400
			if len(payload.Children) > 100 {
				w.WriteHeader(http.StatusBadRequest)
				_, _ = w.Write([]byte(`{"object":"error","status":400,"message":"append children length > 100"}`))
				return
			}
			appendBatches = append(appendBatches, len(payload.Children))
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"results": []any{}})

		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	client := NewClient(Config{
		Token:      "secret_test",
		DatabaseID: "test_db",
		BaseURL:    server.URL + "/v1",
	})

	// Generate 235 dummy blocks (> 100, spanning 3 batches: 100 create, 100 patch, 35 patch)
	const totalBlocks = 235
	blocks := make([]map[string]any, totalBlocks)
	for i := 0; i < totalBlocks; i++ {
		blocks[i] = paragraphBlock(fmt.Sprintf("Block content %d", i+1))
	}

	pageID, err := client.createPage(context.Background(), map[string]any{}, blocks)
	if err != nil {
		t.Fatalf("createPage failed: %v", err)
	}
	if pageID != "page_split_123" {
		t.Fatalf("pageID = %q, want 'page_split_123'", pageID)
	}

	mu.Lock()
	defer mu.Unlock()

	if createBlocksCount != 100 {
		t.Errorf("createBlocksCount = %d, want 100", createBlocksCount)
	}

	expectedBatches := []int{100, 35}
	if len(appendBatches) != len(expectedBatches) {
		t.Fatalf("len(appendBatches) = %d, want %d (got %v)", len(appendBatches), len(expectedBatches), appendBatches)
	}
	for i, count := range expectedBatches {
		if appendBatches[i] != count {
			t.Errorf("appendBatches[%d] = %d, want %d", i, appendBatches[i], count)
		}
	}
}
