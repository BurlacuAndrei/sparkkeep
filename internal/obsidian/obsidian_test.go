package obsidian

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"sparkkeep/internal/i18n"
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
	if !strings.Contains(md, "researched: false") {
		t.Fatalf("expected researched: false in frontmatter")
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
	if strings.Contains(md, "## Research Dossier") {
		t.Fatalf("unexpected Research Dossier section for unresearched card")
	}
}

func TestCardExportToMarkdown_WithResearch(t *testing.T) {
	finishedTime := time.Date(2026, 10, 6, 9, 15, 0, 0, time.UTC)
	exp := port.CardExport{
		Card: port.Card{
			ID:               99,
			Title:            "Vector Search Architectures",
			ExecutiveSummary: "Evaluating vector databases against SQLite.",
			Horizon:          "short-term",
			Status:           "done",
			CreatedAt:        time.Date(2026, 10, 6, 8, 0, 0, 0, time.UTC),
			UpdatedAt:        time.Date(2026, 10, 6, 9, 30, 0, 0, time.UTC),
		},
		Research: &port.Research{
			ID:       12,
			CardID:   99,
			Status:   "done",
			Findings: "SQLite FTS5 outperforms dense embeddings on keyword-heavy local lookups.",
			PlaybookSnapshot: &port.Playbook{
				Name: "Deep Architecture Review",
			},
			CreatedAt: time.Date(2026, 10, 6, 8, 30, 0, 0, time.UTC),
			Steps: []port.ResearchStep{
				{ID: "step-1", Status: "done", StartedAt: time.Date(2026, 10, 6, 8, 35, 0, 0, time.UTC), FinishedAt: finishedTime},
			},
		},
	}

	md := CardExportToMarkdown(exp)

	if !strings.Contains(md, "researched: true") {
		t.Fatalf("expected researched: true in frontmatter")
	}
	if !strings.Contains(md, "## Research Dossier") {
		t.Fatalf("missing Research Dossier heading")
	}
	if !strings.Contains(md, "**Playbook:** Deep Architecture Review") {
		t.Fatalf("missing Playbook name in research dossier")
	}
	if !strings.Contains(md, "**Completed:** "+finishedTime.Format(time.RFC3339)) {
		t.Fatalf("missing Completed timestamp in research dossier")
	}
	if !strings.Contains(md, "SQLite FTS5 outperforms dense embeddings on keyword-heavy local lookups.") {
		t.Fatalf("missing findings content in research dossier")
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

	// Verify files exist with deterministic <id>-<title>.md prefix
	file1 := filepath.Join(vaultPath, "1-Note One.md")
	content, err := os.ReadFile(file1)
	if err != nil {
		t.Fatalf("read note 1: %v", err)
	}
	if !strings.Contains(string(content), "# Note One") {
		t.Fatalf("unexpected note 1 content: %s", string(content))
	}

	file2 := filepath.Join(vaultPath, "2-Note Two.md")
	if _, err := os.Stat(file2); err != nil {
		t.Fatalf("note 2 missing: %v", err)
	}
}

func TestSyncCardExport_TitleChangeIdempotency(t *testing.T) {
	tempDir := t.TempDir()
	vaultPath := filepath.Join(tempDir, "ObsidianVault")

	expOriginal := port.CardExport{
		Card: port.Card{
			ID:        55,
			Title:     "Original Title",
			Summary:   "Summary text",
			Horizon:   "short-term",
			Status:    "inbox",
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		},
	}

	p1, err := SyncCardExport(vaultPath, expOriginal)
	if err != nil {
		t.Fatalf("SyncCardExport initial: %v", err)
	}
	expectedOriginalFile := filepath.Join(vaultPath, "55-Original Title.md")
	if p1 != expectedOriginalFile {
		t.Fatalf("expected p1 %s, got %s", expectedOriginalFile, p1)
	}
	if _, err := os.Stat(expectedOriginalFile); err != nil {
		t.Fatalf("original file does not exist: %v", err)
	}

	// Now modify title and export again
	expModified := port.CardExport{
		Card: port.Card{
			ID:        55,
			Title:     "Brand New Refined Title",
			Summary:   "Updated summary",
			Horizon:   "short-term",
			Status:    "inbox",
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		},
	}

	p2, err := SyncCardExport(vaultPath, expModified)
	if err != nil {
		t.Fatalf("SyncCardExport modified: %v", err)
	}
	expectedModifiedFile := filepath.Join(vaultPath, "55-Brand New Refined Title.md")
	if p2 != expectedModifiedFile {
		t.Fatalf("expected p2 %s, got %s", expectedModifiedFile, p2)
	}

	// Verify old file was cleanly removed
	if _, err := os.Stat(expectedOriginalFile); !os.IsNotExist(err) {
		t.Fatalf("expected old file %s to be deleted, but it still exists", expectedOriginalFile)
	}
	// Verify new file exists
	if _, err := os.Stat(expectedModifiedFile); err != nil {
		t.Fatalf("expected new file %s to exist: %v", expectedModifiedFile, err)
	}
}

func TestTestVaultDirectory(t *testing.T) {
	tempDir := t.TempDir()
	validVault := filepath.Join(tempDir, "valid_vault")

	if err := TestVaultDirectory(validVault); err != nil {
		t.Fatalf("expected validVault to pass, got: %v", err)
	}
	// Directory should have been created
	if info, err := os.Stat(validVault); err != nil || !info.IsDir() {
		t.Fatalf("expected validVault dir to be created")
	}

	// Empty path should fail
	if err := TestVaultDirectory(""); err == nil {
		t.Fatalf("expected error for empty vault path")
	}
}

func TestCardExportToMarkdown_LocalizedHeadings(t *testing.T) {
	locales := []string{"en", "ro", "es", "pt-BR", "fr", "de"}
	for _, loc := range locales {
		h := i18n.GetHeadings(loc)
		exp := port.CardExport{
			Locale: loc,
			Card: port.Card{
				ID:               77,
				Title:            "Localized Card Title",
				Summary:          "A localized summary.",
				ExecutiveSummary: "Exec summary text.",
				ValueProposition: "Value prop text.",
				ProposedActions:  []string{"Action 1", "Action 2"},
				CompletedActions: []string{"Done Action 1"},
				SourceNote:       "Source note text.",
				Horizon:          "short-term",
				Status:           "doing",
				SourceURL:        "https://example.com/test",
				Tags:             []string{"tag1", "tag2"},
				CreatedAt:        time.Date(2026, 10, 6, 8, 0, 0, 0, time.UTC),
				UpdatedAt:        time.Date(2026, 10, 6, 8, 30, 0, 0, time.UTC),
			},
			Research: &port.Research{
				ID:     12,
				CardID: 77,
				PlaybookSnapshot: &port.Playbook{
					Name: "Deep Dive",
				},
				Findings: "Key research findings.",
			},
		}

		md := CardExportToMarkdown(exp)

		// Frontmatter keys and values must remain in canonical English
		canonicalFrontmatter := []string{
			"id: 77",
			`title: "Localized Card Title"`,
			"horizon: short-term",
			"status: doing",
			`source_url: "https://example.com/test"`,
			"tags:",
			"created_at:",
			"updated_at:",
			"researched: true",
		}
		for _, key := range canonicalFrontmatter {
			if !strings.Contains(md, key) {
				t.Errorf("[%s] missing canonical frontmatter key/value: %q in\n%s", loc, key, md)
			}
		}

		// Section headings and labels must match workspace interface locale
		expectedHeadings := []string{
			"## " + h.ExecutiveSummary,
			"## " + h.ValueProposition,
			"## " + h.ProposedActions,
			"## " + h.SourceNotes,
			"## " + h.ResearchDossier,
			"**" + h.Playbook + ":** Deep Dive",
			"**" + h.Completed + ":**",
		}
		for _, head := range expectedHeadings {
			if !strings.Contains(md, head) {
				t.Errorf("[%s] expected localized heading/label %q in\n%s", loc, head, md)
			}
		}
	}
}
