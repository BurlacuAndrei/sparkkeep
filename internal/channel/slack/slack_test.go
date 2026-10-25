package slack

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"sparkkeep/internal/i18n"
	"sparkkeep/internal/port"
)

func TestSlackNotifyWebhook(t *testing.T) {
	var receivedPayload map[string]any
	var called bool

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		_ = json.NewDecoder(r.Body).Decode(&receivedPayload)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`ok`))
	}))
	defer server.Close()

	adapter := New(Config{
		WebhookURL: server.URL,
	}, nil, "http://localhost:8080", nil)

	card := port.Card{
		ID:      42,
		Title:   "Modern Go Concurrency",
		Summary: "Patterns for resilient goroutines and channels.",
		Type:    "article",
		Horizon: "short-term",
	}

	err := adapter.Notify(context.Background(), port.Notification{Kind: "created", Card: card})
	if err != nil {
		t.Fatalf("Notify failed: %v", err)
	}

	if !called {
		t.Fatalf("expected HTTP request to Slack webhook")
	}
	blocks, ok := receivedPayload["blocks"].([]any)
	if !ok || len(blocks) != 3 {
		t.Fatalf("expected 3 blocks, got %+v", receivedPayload)
	}
}

func TestSlackNotifyWebhook_EmptyNotesAndSummary(t *testing.T) {
	var receivedPayload map[string]any
	var called bool

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		_ = json.NewDecoder(r.Body).Decode(&receivedPayload)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`ok`))
	}))
	defer server.Close()

	adapter := New(Config{
		WebhookURL: server.URL,
	}, nil, "http://localhost:8080", nil)

	card := port.Card{
		ID:      43,
		Title:   "Empty Summary Card",
		Summary: "",
		TLDR:    "",
		Type:    "article",
	}

	err := adapter.Notify(context.Background(), port.Notification{Kind: "created", Card: card})
	if err != nil {
		t.Fatalf("Notify failed: %v", err)
	}

	if !called {
		t.Fatalf("expected HTTP request to Slack webhook")
	}

	blocks, ok := receivedPayload["blocks"].([]any)
	if !ok || len(blocks) < 2 {
		t.Fatalf("expected blocks in payload, got %+v", receivedPayload)
	}

	secBlock, ok := blocks[1].(map[string]any)
	if !ok {
		t.Fatalf("expected block 1 to be a map, got %+v", blocks[1])
	}
	textMap, ok := secBlock["text"].(map[string]any)
	if !ok {
		t.Fatalf("expected text object in section block, got %+v", secBlock)
	}
	textVal, ok := textMap["text"].(string)
	if !ok || len(textVal) < 1 {
		t.Fatalf("expected non-empty section text, got %q", textVal)
	}
	if textVal != "_No notes provided_" {
		t.Fatalf("expected fallback text '_No notes provided_', got %q", textVal)
	}
}

func TestSlackLocalizedButtonsAndMessages(t *testing.T) {
	locales := []string{"en", "ro", "es", "pt-BR", "fr", "de"}

	for _, loc := range locales {
		b := i18n.GetButtons(loc)

		// 1. ActionButtons helper
		btns := ActionButtons(42, loc)
		if len(btns) != 6 {
			t.Fatalf("[%s] expected 6 buttons, got %d", loc, len(btns))
		}
		expectedLabels := []string{b.Research, b.Playbook, b.Do, b.Keep, b.Shelve, b.Dismiss}
		expectedPrefixes := []string{"research:42", "pb:42", "do:42", "keep:42", "shelve:42", "dismiss:42"}
		for i, btn := range btns {
			txtMap := btn["text"].(map[string]any)
			if txtMap["text"] != expectedLabels[i] {
				t.Errorf("[%s] btn %d text mismatch: %q != %q", loc, i, txtMap["text"], expectedLabels[i])
			}
			if btn["value"] != expectedPrefixes[i] {
				t.Errorf("[%s] btn %d value prefix mismatch: %q != %q", loc, i, btn["value"], expectedPrefixes[i])
			}
		}

		// 2. Outbound notification message
		var receivedPayload map[string]any
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			_ = json.NewDecoder(r.Body).Decode(&receivedPayload)
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`ok`))
		}))
		defer server.Close()

		adapter := New(Config{
			WebhookURL: server.URL,
			Locale:     loc,
		}, nil, "http://localhost:8080", nil)

		card := port.Card{
			ID:      42,
			Title:   "Slack Title",
			Summary: "Slack Summary",
		}
		if err := adapter.Notify(context.Background(), port.Notification{Kind: "created", Card: card}); err != nil {
			t.Fatalf("[%s] Notify error: %v", loc, err)
		}
		blocks := receivedPayload["blocks"].([]any)
		actionBlock := blocks[2].(map[string]any)
		elements := actionBlock["elements"].([]any)
		deepBtn := elements[0].(map[string]any)
		deepTxt := deepBtn["text"].(map[string]any)["text"]
		if deepTxt != b.DeepResearch {
			t.Errorf("[%s] expected deep research text %q, got %q", loc, b.DeepResearch, deepTxt)
		}
	}
}
