package license

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"sparkkeep/internal/port"
)

const (
	TierCommunity = "community"
	TierPro       = "pro"

	FeatureObsidianSync   = "obsidian_sync"
	FeatureWebhooks       = "webhooks"
	FeatureDeepResearchV2 = "deep_research_v2"
)

var (
	ErrInvalidLicense  = errors.New("invalid license key format")
	ErrSignatureFailed = errors.New("license signature verification failed")
	ErrLicenseExpired  = errors.New("license has expired")
)

// MasterPublicKeyB64 is the production Ed25519 public key used to verify Sparkkeep Pro licenses.
const MasterPublicKeyB64 = "B/AsNyeyi8Fy9nhAlccP9tB5juXJIve+EhOwbHm9+68="

var defaultPublicKey = func() ed25519.PublicKey {
	b, _ := base64.StdEncoding.DecodeString(MasterPublicKeyB64)
	return ed25519.PublicKey(b)
}()

type LicensePayload struct {
	Email     string   `json:"email"`
	Tier      string   `json:"tier"`
	Features  []string `json:"features"`
	IssuedAt  int64    `json:"issued_at"`
	ExpiresAt int64    `json:"expires_at"` // 0 = lifetime
}

type LicenseStatus struct {
	Tier       string   `json:"tier"`
	Email      string   `json:"email,omitempty"`
	Features   []string `json:"features"`
	ExpiresAt  int64    `json:"expires_at,omitempty"`
	IsLifetime bool     `json:"is_lifetime"`
	IsValid    bool     `json:"is_valid"`
}

type Manager struct {
	store     port.Store
	publicKey ed25519.PublicKey
}

func NewManager(store port.Store) *Manager {
	return &Manager{
		store:     store,
		publicKey: defaultPublicKey,
	}
}

// SetPublicKeyForTest allows injecting a test Ed25519 public key during testing.
func (m *Manager) SetPublicKeyForTest(pub ed25519.PublicKey) {
	m.publicKey = pub
}

// ParseAndVerify checks the cryptographic signature of the license string.
// Format: base64(payload_json).base64(signature)
func (m *Manager) ParseAndVerify(key string) (*LicensePayload, error) {
	key = strings.TrimSpace(key)
	if key == "" {
		return nil, ErrInvalidLicense
	}

	parts := strings.Split(key, ".")
	if len(parts) != 2 {
		return nil, ErrInvalidLicense
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, fmt.Errorf("%w: invalid payload encoding", ErrInvalidLicense)
	}

	sigBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("%w: invalid signature encoding", ErrInvalidLicense)
	}

	if len(m.publicKey) == ed25519.PublicKeySize {
		if !ed25519.Verify(m.publicKey, payloadBytes, sigBytes) {
			return nil, ErrSignatureFailed
		}
	}

	var payload LicensePayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return nil, fmt.Errorf("%w: invalid payload json", ErrInvalidLicense)
	}

	if payload.ExpiresAt > 0 && time.Now().Unix() > payload.ExpiresAt {
		return nil, ErrLicenseExpired
	}

	return &payload, nil
}

// Activate verifies the key and persists it into the settings table.
func (m *Manager) Activate(ctx context.Context, key string) (*LicenseStatus, error) {
	payload, err := m.ParseAndVerify(key)
	if err != nil {
		return nil, err
	}

	if m.store != nil {
		if err := m.store.SetSetting(ctx, "license_key", key); err != nil {
			return nil, err
		}
		if err := m.store.SetSetting(ctx, "license_tier", payload.Tier); err != nil {
			return nil, err
		}
	}

	return &LicenseStatus{
		Tier:       payload.Tier,
		Email:      payload.Email,
		Features:   payload.Features,
		ExpiresAt:  payload.ExpiresAt,
		IsLifetime: payload.ExpiresAt == 0,
		IsValid:    true,
	}, nil
}

// Status returns current tier status, falling back safely to Community if unactivated or invalid.
func (m *Manager) Status(ctx context.Context) LicenseStatus {
	community := LicenseStatus{
		Tier:     TierCommunity,
		Features: []string{"core_capture", "triage", "llm_analysis", "search"},
		IsValid:  true,
	}

	if m.store == nil {
		return community
	}

	key, err := m.store.GetSetting(ctx, "license_key")
	if err != nil || key == "" {
		return community
	}

	payload, err := m.ParseAndVerify(key)
	if err != nil {
		return community
	}

	features := append(community.Features, payload.Features...)

	return LicenseStatus{
		Tier:       payload.Tier,
		Email:      payload.Email,
		Features:   features,
		ExpiresAt:  payload.ExpiresAt,
		IsLifetime: payload.ExpiresAt == 0,
		IsValid:    true,
	}
}

// HasCapability checks whether the requested feature is enabled under the current license.
func (m *Manager) HasCapability(ctx context.Context, feature string) bool {
	status := m.Status(ctx)
	for _, f := range status.Features {
		if f == feature {
			return true
		}
	}
	return false
}

// SignLicense creates a cryptographically signed license string using an Ed25519 private key.
func SignLicense(priv ed25519.PrivateKey, payload LicensePayload) (string, error) {
	return SignLicenseForTest(priv, payload)
}

// SignLicenseForTest is a test helper for creating signed licenses.
func SignLicenseForTest(priv ed25519.PrivateKey, payload LicensePayload) (string, error) {
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	sig := ed25519.Sign(priv, payloadBytes)
	encodedPayload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	encodedSig := base64.RawURLEncoding.EncodeToString(sig)
	return fmt.Sprintf("%s.%s", encodedPayload, encodedSig), nil
}
