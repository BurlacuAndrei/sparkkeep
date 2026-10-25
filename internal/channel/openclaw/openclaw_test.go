package openclaw

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"sparkkeep/internal/capture"
	"sparkkeep/internal/i18n"
	"sparkkeep/internal/port"
)

type mockService struct {
	captured     bool
	updatedID    int64
	updatedPatch port.CardPatch
	updateErr    error
	getCardErr   error
}

func (m *mockService) CaptureShare(_ context.Context, _ capture.Share) ([]int64, error) {
	m.captured = true
	return []int64{7}, nil
}

func (m *mockService) GoResearch(ctx context.Context, cardID int64, playbookID ...*int64) {}

func (m *mockService) UpdateCard(ctx context.Context, id int64, patch port.CardPatch) (port.Card, error) {
	if m.updateErr != nil {
		return port.Card{}, m.updateErr
	}
	m.updatedID = id
	m.updatedPatch = patch
	return port.Card{ID: id}, nil
}

func (m *mockService) GetCard(ctx context.Context, id int64) (port.Card, error) {
	if m.getCardErr != nil {
		return port.Card{}, m.getCardErr
	}
	return port.Card{ID: id}, nil
}

func TestOpenClawNotify(t *testing.T) {
	var receivedPayload gatewayHookPayload
	var receivedAuth string
	var called bool

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		receivedAuth = r.Header.Get("Authorization")
		_ = json.NewDecoder(r.Body).Decode(&receivedPayload)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok": true}`))
	}))
	defer server.Close()

	adapter := New(Config{
		GatewayURL:     server.URL,
		HookToken:      "secret-token-123",
		DefaultChannel: "whatsapp",
		DefaultTarget:  "+1555123456",
	}, nil, "http://localhost:8080", nil)

	ctx := context.Background()
	card := port.Card{
		ID:            42,
		Title:         "OpenClaw Architecture",
		Summary:       "A gateway for multi-channel personal agents.",
		Type:          "tool",
		Horizon:       "short-term",
		SourceChannel: "openclaw:whatsapp",
	}

	err := adapter.Notify(ctx, port.Notification{Kind: "created", Card: card})
	if err != nil {
		t.Fatalf("Notify failed: %v", err)
	}

	if !called {
		t.Fatalf("expected HTTP request to OpenClaw gateway")
	}
	if receivedAuth != "Bearer secret-token-123" {
		t.Errorf("expected Bearer secret-token-123, got %q", receivedAuth)
	}
	if receivedPayload.Channel != "whatsapp" {
		t.Errorf("expected channel whatsapp, got %q", receivedPayload.Channel)
	}
	if !receivedPayload.Deliver {
		t.Errorf("expected deliver = true")
	}
}

func TestOpenClawHandleActionCommand(t *testing.T) {
	svc := &mockService{}
	adapter := New(Config{HookToken: "tok"}, svc, "", nil)

	// Inbound webhook with action command
	payload := InboundWebhookPayload{
		Channel: "whatsapp",
		Sender:  "+1555123456",
		Text:    "/short 42",
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/channels/openclaw/webhook", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer tok")
	rec := httptest.NewRecorder()

	adapter.HandleWebhook(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
	}
	if svc.updatedID != 42 {
		t.Errorf("expected updated card ID 42, got %d", svc.updatedID)
	}
	if svc.updatedPatch.Horizon == nil || *svc.updatedPatch.Horizon != port.HorizonShortTerm {
		t.Errorf("expected horizon short-term, got %+v", svc.updatedPatch.Horizon)
	}
}

func TestOpenClawHandleActionCommand_CardNotFound(t *testing.T) {
	svc := &mockService{updateErr: port.ErrNotFound}
	adapter := New(Config{HookToken: "tok"}, svc, "", nil)

	payload := InboundWebhookPayload{
		Channel: "whatsapp",
		Sender:  "+1555123456",
		Text:    "/discard 999999",
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/channels/openclaw/webhook", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer tok")
	rec := httptest.NewRecorder()

	adapter.HandleWebhook(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 Not Found, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse json response: %v", err)
	}
	if ok, _ := resp["ok"].(bool); ok {
		t.Errorf("expected ok = false for non-existent card, got true")
	}
	errMsg, _ := resp["error"].(string)
	if errMsg == "" {
		t.Errorf("expected error message in response, got empty")
	}
}

func TestOpenClawHandleResearchCommand_CardNotFound(t *testing.T) {
	svc := &mockService{getCardErr: port.ErrNotFound}
	adapter := New(Config{HookToken: "tok"}, svc, "", nil)

	payload := InboundWebhookPayload{
		Channel: "whatsapp",
		Sender:  "+1555123456",
		Text:    "/research 999999",
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/channels/openclaw/webhook", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer tok")
	rec := httptest.NewRecorder()

	adapter.HandleWebhook(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 Not Found, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse json response: %v", err)
	}
	if ok, _ := resp["ok"].(bool); ok {
		t.Errorf("expected ok = false for non-existent card, got true")
	}
}

func TestOpenClawUnauthorizedWebhook(t *testing.T) {
	adapter := New(Config{HookToken: "secret"}, nil, "", nil)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/channels/openclaw/webhook", io.NopCloser(bytes.NewReader([]byte("{}"))))
	req.Header.Set("Authorization", "Bearer wrong-token")
	rec := httptest.NewRecorder()

	adapter.HandleWebhook(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized, got %d", rec.Code)
	}
}

func TestOpenClawWebhookFailsClosedWithoutToken(t *testing.T) {
	svc := &mockService{}
	adapter := New(Config{}, svc, "", nil)

	payload := InboundWebhookPayload{Channel: "whatsapp", Text: "https://example.com"}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/channels/openclaw/webhook", bytes.NewReader(body))
	rec := httptest.NewRecorder()

	adapter.HandleWebhook(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized, got %d", rec.Code)
	}
	if svc.captured {
		t.Errorf("expected no capture when no token is configured")
	}
}

func TestOpenClawWebhookAcceptsConfiguredToken(t *testing.T) {
	svc := &mockService{}
	adapter := New(Config{HookToken: "tok"}, svc, "", nil)

	payload := InboundWebhookPayload{Channel: "whatsapp", Text: "https://example.com"}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/channels/openclaw/webhook", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer tok")
	rec := httptest.NewRecorder()

	adapter.HandleWebhook(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
	}
	if !svc.captured {
		t.Errorf("expected capture with configured token")
	}
}

func TestOpenClawLocalizedFormattingAndActionCommands(t *testing.T) {
	locales := []string{"en", "ro", "es", "pt-BR", "fr", "de"}

	for _, loc := range locales {
		m := i18n.GetMessages(loc)
		svc := &mockService{}
		adapter := New(Config{HookToken: "tok", Locale: loc}, svc, "http://localhost:8080", nil)

		// 1. Check message formatting
		card := port.Card{
			ID:         42,
			Title:      "Local Card",
			Summary:    "Local Summary",
			Horizon:    port.HorizonShortTerm,
			Worthiness: port.Worthiness{Level: "High"},
			Claims:     []string{"Local Claim 1"},
		}
		notif := port.Notification{Kind: "created", Card: card}
		msg := adapter.formatNotification(context.Background(), notif)
		if !strings.Contains(msg, m.Horizon) {
			t.Errorf("[%s] expected message to contain horizon label %q, got: %s", loc, m.Horizon, msg)
		}
		if !strings.Contains(msg, m.ActionsReplyWith) {
			t.Errorf("[%s] expected message to contain actions label %q, got: %s", loc, m.ActionsReplyWith, msg)
		}
		if !strings.Contains(msg, m.KeyClaims) {
			t.Errorf("[%s] expected message to contain key claims label %q, got: %s", loc, m.KeyClaims, msg)
		}

		// 2. Action command responses
		handled, reply, err := adapter.handleActionCommand(context.Background(), "/do 42")
		if !handled || err != nil {
			t.Fatalf("[%s] /do command failed: %v", loc, err)
		}
		if reply != m.MovedShortTerm && reply != "Card 42 moved to Short-term (Doing)" && !strings.Contains(reply, "42") {
			t.Errorf("[%s] unexpected reply: %s", loc, reply)
		}

		handled, reply, err = adapter.handleActionCommand(context.Background(), "/shelve 42")
		if !handled || err != nil {
			t.Fatalf("[%s] /shelve command failed: %v", loc, err)
		}
		if !strings.Contains(reply, "42") {
			t.Errorf("[%s] unexpected shelve reply: %s", loc, reply)
		}

		handled, reply, err = adapter.handleActionCommand(context.Background(), "/keep 42")
		if !handled || err != nil {
			t.Fatalf("[%s] /keep command failed: %v", loc, err)
		}
		wantKeep := strings.TrimSpace(reply)
		if wantKeep != strings.TrimSpace(fmt.Sprintf(m.MovedInbox, 42)) {
			t.Errorf("[%s] unexpected keep reply: %s, want: %s", loc, reply, fmt.Sprintf(m.MovedInbox, 42))
		}
	}
}
