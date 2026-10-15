package discord

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/hex"
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

func signRequest(t *testing.T, priv ed25519.PrivateKey, timestamp string, body []byte) (string, string) {
	t.Helper()
	sig := ed25519.Sign(priv, append([]byte(timestamp), body...))
	return hex.EncodeToString(sig), timestamp
}

func TestDiscordHandleInteraction(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	st := &mockStore{}
	adapter := New(Config{PublicKey: hex.EncodeToString(pub)}, nil, st, "", nil)

	// Interaction Type 3 (Button Click)
	interaction := DiscordInteraction{
		Type: 3,
	}
	interaction.Data.CustomID = "card:42:commit:short-term"
	body, _ := json.Marshal(interaction)

	sig, ts := signRequest(t, priv, "1700000000", body)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/channels/discord/interactions", bytes.NewReader(body))
	req.Header.Set("X-Signature-Ed25519", sig)
	req.Header.Set("X-Signature-Timestamp", ts)
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

func TestDiscordHandleInteractionRejectsInvalidSignature(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	ping := []byte(`{"type":1}`)
	validSig := hex.EncodeToString(ed25519.Sign(priv, append([]byte("1700000000"), ping...)))

	cases := []struct {
		name string
		key  string
		sig  string
		ts   string
		body []byte
	}{
		{"unsigned ping", hex.EncodeToString(pub), "", "1700000000", ping},
		{"wrong signature", hex.EncodeToString(pub), hex.EncodeToString(ed25519.Sign(priv, []byte("other"))), "1700000000", ping},
		{"missing timestamp", hex.EncodeToString(pub), validSig, "", ping},
		{"no public key", "", validSig, "1700000000", ping},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			st := &mockStore{}
			adapter := New(Config{PublicKey: tc.key}, nil, st, "", nil)
			req := httptest.NewRequest(http.MethodPost, "/api/v1/channels/discord/interactions", bytes.NewReader(tc.body))
			if tc.sig != "" {
				req.Header.Set("X-Signature-Ed25519", tc.sig)
			}
			if tc.ts != "" {
				req.Header.Set("X-Signature-Timestamp", tc.ts)
			}
			rec := httptest.NewRecorder()

			adapter.HandleInteraction(rec, req)

			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("expected 401 Unauthorized, got %d", rec.Code)
			}
			if st.updatedID != 0 {
				t.Errorf("expected no store call, got updated card %d", st.updatedID)
			}
		})
	}
}
