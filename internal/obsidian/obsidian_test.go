package obsidian

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"sparkkeep/internal/port"
)

func TestSanitizeFilename(t *testing.T) {
	cases := []struct {
		id    int64
		input string
		want  string
	}{
		{1, "Simple Note", "Simple Note.md"},
		{2, "Note with: illegal / path \\ chars", "Note with illegal path chars.md"},
		{3, "../../../etc/passwd", "etc passwd.md"},
		{4, "", "card_4.md"},
		{5, "   ", "card_5.md"},
		{6, "A very long title that spans way over eighty characters to test whether the rune length truncator cuts it down properly without error",
			"A very long title that spans way over eighty characters to test whether the rune.md"},
	}

	for _, tc := range cases {
		got := SanitizeFilename(tc.id, tc.input)
		if got != tc.want {
			t.Errorf("SanitizeFilename(%d, %q) = %q, want %q", tc.id, tc.input, got, tc.want)
		}
	}
}

func TestCardToMarkdown(t *testing.T) {
	c := port.Card{
		ID:               42,
		Title:            "Build Micro-SaaS in Go",
		Summary:          "A great guide on building single-binary tools.",
		ExecutiveSummary: "Ship single-container tools.",
		ValueProposition: "High margins, zero cloud sprawl.",
		ProposedActions:  []string{"Setup SQLite", "Add Stripe or Lemon Squeezy"},
		Horizon:          "short-term",
		Status:           "doing",
		SourceURL:        "https://example.com/guide",
		Tags:             []string{"golang", "saas"},
		CreatedAt:        time.Date(2026, 10, 6, 8, 0, 0, 0, time.UTC),
		UpdatedAt:        time.Date(2026, 10, 6, 8, 30, 0, 0, time.UTC),
	}

	md := CardToMarkdown(c)

	if !strings.HasPrefix(md, "---\n") {
		t.Fatalf("expected YAML frontmatter start")
	}
	if !strings.Contains(md, `title: "Build Micro-SaaS in Go"`) {
		t.Fatalf("missing title in frontmatter")
	}
	if !strings.Contains(md, "- \"golang\"") {
		t.Fatalf("missing tags in frontmatter")
	}
	if !strings.Contains(md, "## Executive Summary\n\nShip single-container tools.") {
		t.Fatalf("missing Executive Summary section")
	}
	if !strings.Contains(md, "- [ ] Setup SQLite") {
		t.Fatalf("missing action checkbox")
	}
}

func TestSyncCardsToVault(t *testing.T) {
	tempDir := t.TempDir()
	vaultPath := filepath.Join(tempDir, "ObsidianVault")

	cards := []port.Card{
		{
			ID:        1,
			Title:     "Note One",
			Summary:   "Summary one",
			Horizon:   "short-term",
			Status:    "inbox",
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		},
		{
			ID:        2,
			Title:     "Note Two",
			Summary:   "Summary two",
			Horizon:   "lifetime",
			Status:    "done",
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		},
	}

	written, err := SyncCards(vaultPath, cards)
	if err != nil {
		t.Fatalf("SyncCards: %v", err)
	}
	if written != 2 {
		t.Fatalf("written = %d, want 2", written)
	}

	// Verify files exist
	file1 := filepath.Join(vaultPath, "Note One.md")
	content, err := os.ReadFile(file1)
	if err != nil {
		t.Fatalf("read note 1: %v", err)
	}
	if !strings.Contains(string(content), "# Note One") {
		t.Fatalf("unexpected note 1 content: %s", string(content))
	}
}
