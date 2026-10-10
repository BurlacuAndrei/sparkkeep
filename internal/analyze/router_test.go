package analyze

import (
	"testing"
)

func TestRouterFallbackAndMapping(t *testing.T) {
	profA := Profile{
		ID:        "prof-a",
		Name:      "Model A",
		BaseURL:   "https://api.a.com/v1",
		Model:     "model-a",
		APIKey:    "key-a",
		IsDefault: true,
	}
	profB := Profile{
		ID:        "prof-b",
		Name:      "Model B",
		BaseURL:   "https://api.b.com/v1",
		Model:     "model-b",
		APIKey:    "key-b",
		IsDefault: false,
	}

	router := NewRouter(RouterConfig{
		Profiles: []Profile{profA, profB},
		Roles: map[string]string{
			RoleResearchSynthesis: "prof-b",
		},
	})

	// Triage should fall back to default profile A
	triageClient := router.For(RoleTriage)
	if triageClient.BaseURL != profA.BaseURL || triageClient.Model != profA.Model {
		t.Fatalf("triage client mismatch: got base=%s model=%s, want %s / %s",
			triageClient.BaseURL, triageClient.Model, profA.BaseURL, profA.Model)
	}
	if triageClient.MaxTokens != 4096 {
		t.Fatalf("triage max tokens = %d, want 4096", triageClient.MaxTokens)
	}

	// Vision should fall back to default profile A with 1024 cap
	visionClient := router.For(RoleVision)
	if visionClient.BaseURL != profA.BaseURL || visionClient.Model != profA.Model {
		t.Fatalf("vision client mismatch: got base=%s model=%s, want %s / %s",
			visionClient.BaseURL, visionClient.Model, profA.BaseURL, profA.Model)
	}
	if visionClient.MaxTokens != 1024 {
		t.Fatalf("vision max tokens = %d, want 1024", visionClient.MaxTokens)
	}

	// Research plan should fall back to default profile A with 4096 cap
	planClient := router.For(RoleResearchPlan)
	if planClient.BaseURL != profA.BaseURL || planClient.Model != profA.Model {
		t.Fatalf("plan client mismatch: got base=%s model=%s, want %s / %s",
			planClient.BaseURL, planClient.Model, profA.BaseURL, profA.Model)
	}
	if planClient.MaxTokens != 4096 {
		t.Fatalf("plan max tokens = %d, want 4096", planClient.MaxTokens)
	}

	// Research synthesis should map to profile B with 8192 cap
	synthClient := router.For(RoleResearchSynthesis)
	if synthClient.BaseURL != profB.BaseURL || synthClient.Model != profB.Model {
		t.Fatalf("synth client mismatch: got base=%s model=%s, want %s / %s",
			synthClient.BaseURL, synthClient.Model, profB.BaseURL, profB.Model)
	}
	if synthClient.MaxTokens != 8192 {
		t.Fatalf("synth max tokens = %d, want 8192", synthClient.MaxTokens)
	}
}

func TestRouterProfileDeletionFallback(t *testing.T) {
	profA := Profile{
		ID:        "prof-a",
		Name:      "Model A",
		BaseURL:   "https://api.a.com/v1",
		Model:     "model-a",
		APIKey:    "key-a",
		IsDefault: true,
	}

	// Mapping references prof-b which is not present in profiles
	router := NewRouter(RouterConfig{
		Profiles: []Profile{profA},
		Roles: map[string]string{
			RoleResearchSynthesis: "prof-b", // deleted / nonexistent profile
		},
	})

	// Must fall back to default profile without error
	synthClient := router.For(RoleResearchSynthesis)
	if synthClient == nil {
		t.Fatal("expected non-nil synth client on missing profile fallback")
	}
	if synthClient.BaseURL != profA.BaseURL || synthClient.Model != profA.Model {
		t.Fatalf("expected fallback to prof-a: got base=%s model=%s", synthClient.BaseURL, synthClient.Model)
	}
	if synthClient.MaxTokens != 8192 {
		t.Fatalf("synth max tokens = %d, want 8192", synthClient.MaxTokens)
	}
}

func TestRouterCustomTokenCaps(t *testing.T) {
	profA := Profile{
		ID:        "prof-a",
		Name:      "Model A",
		BaseURL:   "https://api.a.com/v1",
		Model:     "model-a",
		IsDefault: true,
	}

	router := NewRouter(RouterConfig{
		Profiles: []Profile{profA},
		TokenCaps: map[string]int{
			RoleTriage:            2048,
			RoleResearchSynthesis: 8192,
		},
	})

	if router.For(RoleTriage).MaxTokens != 2048 {
		t.Fatalf("triage cap = %d, want 2048", router.For(RoleTriage).MaxTokens)
	}
	if router.For(RoleResearchSynthesis).MaxTokens != 8192 {
		t.Fatalf("synth cap = %d, want 8192", router.For(RoleResearchSynthesis).MaxTokens)
	}
	// Untouched roles keep defaults
	if router.For(RoleVision).MaxTokens != 1024 {
		t.Fatalf("vision cap = %d, want default 1024", router.For(RoleVision).MaxTokens)
	}
}

func TestRouterUpdateDefaultProfile(t *testing.T) {
	profA := Profile{
		ID:        "prof-a",
		BaseURL:   "https://api.old.com/v1",
		Model:     "old-model",
		APIKey:    "old-key",
		IsDefault: true,
	}

	router := NewRouter(RouterConfig{
		Profiles: []Profile{profA},
	})

	router.UpdateDefaultProfile("https://api.new.com/v1", "new-key", "new-model")

	client := router.For(RoleTriage)
	if client.BaseURL != "https://api.new.com/v1" || client.Model != "new-model" || client.APIKey != "new-key" {
		t.Fatalf("client not updated: got base=%s model=%s key=%s", client.BaseURL, client.Model, client.APIKey)
	}
}
