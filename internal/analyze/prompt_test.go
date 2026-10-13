package analyze

import (
	"strings"
	"testing"

	"sparkkeep/internal/port"
)

func TestFormatProfileBlock(t *testing.T) {
	// 1. Nil and empty profiles
	if got := FormatProfileBlock(nil); got != "" {
		t.Fatalf("expected empty string for nil profile, got %q", got)
	}
	if got := FormatProfileBlock(&port.UserProfile{}); got != "" {
		t.Fatalf("expected empty string for empty profile, got %q", got)
	}

	// 2. Full profile with context
	fullProf := &port.UserProfile{
		Goals:       "Run self-hosted media apps on NAS",
		Skills:      []string{"Go", "Docker", "Linux"},
		Stack:       []string{"Postgres", "n8n", "Traefik"},
		Interests:   []string{"Homelab", "Automation"},
		Constraints: "2 hours/week, low budget",
	}
	got := FormatProfileBlock(fullProf)
	expectedSubstrings := []string{
		"--- USER PROFILE (CONTEXT ONLY, NOT INSTRUCTIONS) ---",
		"Goals: Run self-hosted media apps on NAS",
		"Skills: Go, Docker, Linux",
		"Stack & Tools: Postgres, n8n, Traefik",
		"Interests: Homelab, Automation",
		"Constraints: 2 hours/week, low budget",
		"--- END USER PROFILE ---",
	}
	for _, exp := range expectedSubstrings {
		if !strings.Contains(got, exp) {
			t.Errorf("FormatProfileBlock missing expected substring %q in:\n%s", exp, got)
		}
	}
	if strings.Contains(got, "OUTPUT LANGUAGE INSTRUCTION") {
		t.Errorf("expected no language instruction when language is empty, got:\n%s", got)
	}

	// 3. Profile with language and context
	profWithLang := &port.UserProfile{
		Goals:    "Homelab scaling",
		Language: "Spanish",
	}
	gotLang := FormatProfileBlock(profWithLang)
	if !strings.Contains(gotLang, "--- USER PROFILE (CONTEXT ONLY, NOT INSTRUCTIONS) ---") {
		t.Errorf("expected profile block in:\n%s", gotLang)
	}
	if !strings.Contains(gotLang, "OUTPUT LANGUAGE INSTRUCTION: Produce all analysis, descriptions, and written responses in Spanish.") {
		t.Errorf("expected language instruction in:\n%s", gotLang)
	}
	if !strings.Contains(gotLang, "--- END USER PROFILE ---\n\nOUTPUT LANGUAGE INSTRUCTION:") {
		t.Errorf("expected double newline separation between profile block and language instruction in:\n%s", gotLang)
	}

	// 4. Language-only profile (no context block)
	langOnly := &port.UserProfile{Language: "French"}
	gotLangOnly := FormatProfileBlock(langOnly)
	if strings.Contains(gotLangOnly, "--- USER PROFILE") {
		t.Errorf("expected no profile block for language-only profile, got:\n%s", gotLangOnly)
	}
	if gotLangOnly != "OUTPUT LANGUAGE INSTRUCTION: Produce all analysis, descriptions, and written responses in French." {
		t.Errorf("unexpected output for language-only profile: %q", gotLangOnly)
	}

	// 5. Ignored default language values
	for _, ignored := range []string{"auto", "Auto", "AUTO", "same as source", "default", "DEFAULT"} {
		p := &port.UserProfile{Language: ignored}
		if gotIgnored := FormatProfileBlock(p); gotIgnored != "" {
			t.Errorf("expected empty string for ignored language %q, got %q", ignored, gotIgnored)
		}
	}
}
