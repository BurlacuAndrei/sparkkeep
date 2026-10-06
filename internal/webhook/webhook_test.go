package webhook

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"sparkkeep/internal/license"
	"sparkkeep/internal/port"
)

type memoryStore struct {
	port.Store
	mu       sync.Mutex
	settings map[string]string
}

func newMemoryStore() *memoryStore {
	return &memoryStore{settings: make(map[string]string)}
}

func (m *memoryStore) GetSetting(_ context.Context, key string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	val, ok := m.settings[key]
	if !ok {
		return "", port.ErrNotFound
	}
	return val, nil
}

func (m *memoryStore) SetSetting(_ context.Context, key, value string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.settings[key] = value
	return nil
}

func TestWebhook_GatedForCommunity(t *testing.T) {
	called := false
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	store := newMemoryStore()
	store.SetSetting(context.Background(), "webhook_url", ts.URL)

	licMgr := license.NewManager(store) // Community by default
	d := NewDispatcher(store, licMgr, t.Logf)

	d.Dispatch(context.Background(), EventCardCreated, map[string]string{"title": "Test"})
	time.Sleep(50 * time.Millisecond)

	if called {
		t.Fatalf("webhook was dispatched for community tier, expected to be gated")
	}
}

func TestWebhook_DispatchedForPro(t *testing.T) {
	var receivedPayload Payload
	var receivedSignature string
	delivered := make(chan struct{}, 1)

	secret := "super-webhook-secret"

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedSignature = r.Header.Get("X-Sparkkeep-Signature")
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &receivedPayload)
		w.WriteHeader(http.StatusOK)
		delivered <- struct{}{}
	}))
	defer ts.Close()

	store := newMemoryStore()
	store.SetSetting(context.Background(), "webhook_url", ts.URL)
	store.SetSetting(context.Background(), "webhook_secret", secret)

	licMgr := license.NewManager(store)
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	licMgr.SetPublicKeyForTest(pub)

	// Activate Pro with webhooks capability
	key, _ := license.SignLicense(priv, license.LicensePayload{
		Email:    "pro@example.com",
		Tier:     license.TierPro,
		Features: []string{license.FeatureWebhooks},
	})
	_, _ = licMgr.Activate(context.Background(), key)

	d := NewDispatcher(store, licMgr, t.Logf)

	d.Dispatch(context.Background(), EventCardCreated, map[string]string{"title": "My Pro Card"})

	select {
	case <-delivered:
		// success
	case <-time.After(2 * time.Second):
		t.Fatalf("webhook delivery timed out")
	}

	if receivedPayload.Event != EventCardCreated {
		t.Fatalf("expected event %s, got %s", EventCardCreated, receivedPayload.Event)
	}
	if !stringsHasPrefix(receivedSignature, "sha256=") {
		t.Fatalf("expected X-Sparkkeep-Signature header, got %q", receivedSignature)
	}
}

func stringsHasPrefix(s, prefix string) bool {
	return len(s) >= len(prefix) && s[:len(prefix)] == prefix
}
