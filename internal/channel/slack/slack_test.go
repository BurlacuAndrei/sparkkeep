package slack

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

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
