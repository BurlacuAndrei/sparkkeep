package discord

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"sparkkeep/internal/port"
)

type mockStore struct {
	port.Store
	updatedID    int64
	updatedPatch port.CardPatch
}

func (m *mockStore) UpdateCard(ctx context.Context, id int64, patch port.CardPatch) (port.Card, error) {
	m.updatedID = id
	m.updatedPatch = patch
	return port.Card{ID: id}, nil
}

func TestDiscordNotify(t *testing.T) {
	var receivedMsg discordMessage
	var receivedAuth string
	var called bool

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		receivedAuth = r.Header.Get("Authorization")
		_ = json.NewDecoder(r.Body).Decode(&receivedMsg)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id": "msg_999"}`))
	}))
	defer server.Close()

	adapter := New(Config{
		BotToken:  "test-token",
		ChannelID: "123456789",
	}, nil, nil, "http://localhost:8080", nil)
	adapter.apiBase = server.URL // point to mock server

	card := port.Card{
		ID:         42,
		Title:      "Super Micro Server Review",
		Summary:    "Detailed hardware analysis of the new platform.",
		Type:       "article",
		Horizon:    "short-term",
		Worthiness: port.Worthiness{Level: "High", Reason: "Great efficiency"},
	}

	err := adapter.Notify(context.Background(), port.Notification{Kind: "created", Card: card})
	if err != nil {
		t.Fatalf("Notify failed: %v", err)
	}

	if !called {
		t.Fatalf("expected HTTP request to Discord")
	}
	if receivedAuth != "Bot test-token" {
		t.Errorf("expected Bot test-token, got %q", receivedAuth)
	}
	if len(receivedMsg.Embeds) != 1 {
		t.Fatalf("expected 1 embed, got %d", len(receivedMsg.Embeds))
	}
	if len(receivedMsg.Components) != 2 {
		t.Fatalf("expected 2 ActionRows, got %d", len(receivedMsg.Components))
	}
	// Verify action buttons
	buttons := receivedMsg.Components[1].Components
	if len(buttons) != 4 {
		t.Fatalf("expected 4 buttons in row 2, got %d", len(buttons))
	}
	if buttons[0].Label != "Short" || buttons[0].CustomID != "card:42:commit:short-term" {
		t.Errorf("unexpected button 0: %+v", buttons[0])
	}
}

func TestDiscordHandleInteraction(t *testing.T) {
	st := &mockStore{}
	adapter := New(Config{}, nil, st, "", nil)

	// Interaction Type 3 (Button Click)
	interaction := DiscordInteraction{
		Type: 3,
	}
	interaction.Data.CustomID = "card:42:commit:short-term"
	body, _ := json.Marshal(interaction)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/channels/discord/interactions", bytes.NewReader(body))
	rec := httptest.NewRecorder()

	adapter.HandleInteraction(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rec.Code)
	}
	if st.updatedID != 42 {
		t.Errorf("expected updated card ID 42, got %d", st.updatedID)
	}
	if st.updatedPatch.Horizon == nil || *st.updatedPatch.Horizon != port.HorizonShortTerm {
		t.Errorf("expected horizon short-term, got %+v", st.updatedPatch.Horizon)
	}
}
