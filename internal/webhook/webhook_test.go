package webhook

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"sparkkeep/internal/port"
)

type memoryStore struct {
	port.SettingsStore
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

func (m *memoryStore) ListSettings(_ context.Context) (map[string]string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make(map[string]string, len(m.settings))
	for k, v := range m.settings {
		out[k] = v
	}
	return out, nil
}

func (m *memoryStore) GetCardTypes(_ context.Context) ([]string, error) {
	return append([]string(nil), port.DefaultCardTypes...), nil
}

func (m *memoryStore) SetCardTypes(_ context.Context, _ []string) error {
	return nil
}

func TestWebhook_DispatchedByDefault(t *testing.T) {
	var called atomic.Bool
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called.Store(true)
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	store := newMemoryStore()
	store.SetSetting(context.Background(), "webhook_url", ts.URL)

	d := NewDispatcher(store, t.Logf)

	d.Dispatch(context.Background(), EventCardCreated, map[string]string{"title": "Test"})
	time.Sleep(50 * time.Millisecond)

	if !called.Load() {
		t.Fatalf("webhook should be dispatched when a webhook_url is configured")
	}
}

func TestWebhook_DeliveryAndSignature(t *testing.T) {
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

	d := NewDispatcher(store, t.Logf)

	d.Dispatch(context.Background(), EventCardCreated, map[string]string{"title": "My Card"})

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

func TestWebhook_WaitBlocksUntilDispatchDone(t *testing.T) {
	var done atomic.Bool
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(50 * time.Millisecond)
		done.Store(true)
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	store := newMemoryStore()
	store.SetSetting(context.Background(), "webhook_url", ts.URL)

	d := NewDispatcher(store, t.Logf)
	d.Dispatch(context.Background(), EventCardCreated, map[string]string{"title": "Wait Test"})

	d.Wait()

	if !done.Load() {
		t.Fatalf("expected dispatch to complete before Wait() returns")
	}
}

func TestWebhook_JoinWaitGroup(t *testing.T) {
	var done atomic.Bool
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(50 * time.Millisecond)
		done.Store(true)
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	store := newMemoryStore()
	store.SetSetting(context.Background(), "webhook_url", ts.URL)

	d := NewDispatcher(store, t.Logf)
	var externalWG sync.WaitGroup
	d.JoinWaitGroup(&externalWG)

	d.Dispatch(context.Background(), EventCardCreated, map[string]string{"title": "JoinWG Test"})

	externalWG.Wait()

	if !done.Load() {
		t.Fatalf("expected external WaitGroup to wait until dispatch completes")
	}
}
