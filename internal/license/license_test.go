package license

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"testing"
	"time"

	"sparkkeep/internal/port"
)

type memoryStore struct {
	port.Store
	settings map[string]string
}

func newMemoryStore() *memoryStore {
	return &memoryStore{settings: make(map[string]string)}
}

func (m *memoryStore) GetSetting(_ context.Context, key string) (string, error) {
	val, ok := m.settings[key]
	if !ok {
		return "", port.ErrNotFound
	}
	return val, nil
}

func (m *memoryStore) SetSetting(_ context.Context, key, value string) error {
	m.settings[key] = value
	return nil
}

func (m *memoryStore) ListSettings(_ context.Context) (map[string]string, error) {
	out := make(map[string]string)
	for k, v := range m.settings {
		out[k] = v
	}
	return out, nil
}

func TestLicenseManager_DefaultCommunity(t *testing.T) {
	store := newMemoryStore()
	mgr := NewManager(nil)
	status := mgr.Status(context.Background())

	if status.Tier != TierCommunity {
		t.Fatalf("expected tier %s, got %s", TierCommunity, status.Tier)
	}
	if !status.IsValid {
		t.Fatalf("expected community to be valid")
	}
	if mgr.HasCapability(context.Background(), FeatureObsidianSync) {
		t.Fatalf("community tier should not have %s", FeatureObsidianSync)
	}

	// With store
	mgr = NewManager(store)
	status = mgr.Status(context.Background())
	if status.Tier != TierCommunity {
		t.Fatalf("expected tier %s with empty store, got %s", TierCommunity, status.Tier)
	}
}

func TestLicenseManager_ActivateValidPro(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}

	store := newMemoryStore()
	mgr := NewManager(store)
	mgr.SetPublicKeyForTest(pub)

	validPayload := LicensePayload{
		Email:     "founder@example.com",
		Tier:      TierPro,
		Features:  []string{FeatureObsidianSync, FeatureWebhooks},
		IssuedAt:  time.Now().Unix(),
		ExpiresAt: 0, // lifetime
	}

	key, err := SignLicenseForTest(priv, validPayload)
	if err != nil {
		t.Fatalf("SignLicense: %v", err)
	}

	status, err := mgr.Activate(context.Background(), key)
	if err != nil {
		t.Fatalf("Activate: %v", err)
	}

	if status.Tier != TierPro || status.Email != "founder@example.com" {
		t.Fatalf("unexpected activated status: %+v", status)
	}
	if !status.IsLifetime {
		t.Fatalf("expected lifetime license")
	}

	// Check capability
	if !mgr.HasCapability(context.Background(), FeatureObsidianSync) {
		t.Fatalf("expected capability %s to be true", FeatureObsidianSync)
	}
	if !mgr.HasCapability(context.Background(), FeatureWebhooks) {
		t.Fatalf("expected capability %s to be true", FeatureWebhooks)
	}
	if mgr.HasCapability(context.Background(), "unknown_feature") {
		t.Fatalf("expected unknown_feature to be false")
	}
}

func TestLicenseManager_ExpiredLicense(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}

	store := newMemoryStore()
	mgr := NewManager(store)
	mgr.SetPublicKeyForTest(pub)

	expiredPayload := LicensePayload{
		Email:     "expired@example.com",
		Tier:      TierPro,
		Features:  []string{FeatureObsidianSync},
		IssuedAt:  time.Now().Add(-48 * time.Hour).Unix(),
		ExpiresAt: time.Now().Add(-24 * time.Hour).Unix(),
	}

	key, err := SignLicenseForTest(priv, expiredPayload)
	if err != nil {
		t.Fatalf("SignLicense: %v", err)
	}

	_, err = mgr.Activate(context.Background(), key)
	if !errors.Is(err, ErrLicenseExpired) {
		t.Fatalf("expected ErrLicenseExpired, got %v", err)
	}

	// Status should remain Community
	status := mgr.Status(context.Background())
	if status.Tier != TierCommunity {
		t.Fatalf("expected status to remain community, got %s", status.Tier)
	}
}

func TestLicenseManager_InvalidOrTamperedKey(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}

	store := newMemoryStore()
	mgr := NewManager(store)
	mgr.SetPublicKeyForTest(pub)

	// Malformed key
	_, err = mgr.Activate(context.Background(), "not-a-valid-key")
	if !errors.Is(err, ErrInvalidLicense) {
		t.Fatalf("expected ErrInvalidLicense, got %v", err)
	}

	// Tampered signature
	validPayload := LicensePayload{
		Email:    "test@example.com",
		Tier:     TierPro,
		Features: []string{FeatureObsidianSync},
	}
	key, _ := SignLicenseForTest(priv, validPayload)
	tamperedKey := key[:len(key)-4] + "AAAA"

	_, err = mgr.Activate(context.Background(), tamperedKey)
	if !errors.Is(err, ErrSignatureFailed) {
		t.Fatalf("expected ErrSignatureFailed, got %v", err)
	}
}

func TestLicenseManager_MasterKeyVerification(t *testing.T) {
	// Private key generated with MasterPublicKeyB64
	privB64 := "bFKzwMfCetkIPe0zbjM7b0iZ7s5DyvkDqqnERIfoAZsH8Cw3J7KLwXL2eECVxw/20HmO5cki974SE7Bseb37rw=="
	privBytes, _ := base64.StdEncoding.DecodeString(privB64)
	priv := ed25519.PrivateKey(privBytes)

	mgr := NewManager(newMemoryStore()) // Uses default embedded MasterPublicKey

	payload := LicensePayload{
		Email:    "buyer@example.com",
		Tier:     TierPro,
		Features: []string{FeatureObsidianSync, FeatureWebhooks},
	}
	key, err := SignLicense(priv, payload)
	if err != nil {
		t.Fatalf("SignLicense: %v", err)
	}

	status, err := mgr.Activate(context.Background(), key)
	if err != nil {
		t.Fatalf("Activate with default public key failed: %v", err)
	}
	if status.Tier != TierPro || status.Email != "buyer@example.com" {
		t.Fatalf("unexpected status: %+v", status)
	}
	if !mgr.HasCapability(context.Background(), FeatureObsidianSync) {
		t.Fatalf("expected FeatureObsidianSync to be true")
	}
}
