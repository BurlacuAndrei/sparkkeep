package obsidian

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"sparkkeep/internal/i18n"
	"sparkkeep/internal/port"
)

var unsafeCharRe = regexp.MustCompile(`[<>:"/\\|?*\x00-\x1F]`)

// SanitizeFilename produces a safe file name from a note title.
func SanitizeFilename(id int64, title string) string {
	clean := unsafeCharRe.ReplaceAllString(title, " ")
	clean = strings.ReplaceAll(clean, "..", "")
	clean = strings.Trim(clean, ". ")
	// Collapse multiple spaces
	clean = strings.Join(strings.Fields(clean), " ")
	if clean == "" {
		return fmt.Sprintf("card_%d.md", id)
	}
	runes := []rune(clean)
	if len(runes) > 80 {
		clean = string(runes[:80])
	}
	return clean + ".md"
}

// CardExportToMarkdown converts a CardExport bundle (Card + Research) into an Obsidian note.
func CardExportToMarkdown(exp port.CardExport, loc ...string) string {
	c := exp.Card
	var sb strings.Builder

	locale := exp.Locale
	if len(loc) > 0 && loc[0] != "" {
		locale = loc[0]
	}
	h := i18n.GetHeadings(locale)

	// YAML Frontmatter
	sb.WriteString("---\n")
	sb.WriteString(fmt.Sprintf("id: %d\n", c.ID))
	sb.WriteString(fmt.Sprintf("title: %q\n", c.Title))
	sb.WriteString(fmt.Sprintf("horizon: %s\n", c.Horizon))
	sb.WriteString(fmt.Sprintf("status: %s\n", c.Status))
	if c.SourceURL != "" {
		sb.WriteString(fmt.Sprintf("source_url: %q\n", c.SourceURL))
	}
	if len(c.Tags) > 0 {
		sb.WriteString("tags:\n")
		for _, t := range c.Tags {
			sb.WriteString(fmt.Sprintf("  - %q\n", t))
		}
	}
	sb.WriteString(fmt.Sprintf("created_at: %s\n", c.CreatedAt.Format(time.RFC3339)))
	sb.WriteString(fmt.Sprintf("updated_at: %s\n", c.UpdatedAt.Format(time.RFC3339)))
	sb.WriteString(fmt.Sprintf("researched: %t\n", exp.Research != nil))
	sb.WriteString("---\n\n")

	// Title
	sb.WriteString(fmt.Sprintf("# %s\n\n", c.Title))

	// Executive Summary / Summary
	if c.ExecutiveSummary != "" {
		sb.WriteString(fmt.Sprintf("## %s\n\n", h.ExecutiveSummary))
		sb.WriteString(c.ExecutiveSummary)
		sb.WriteString("\n\n")
	} else if c.Summary != "" {
		sb.WriteString(fmt.Sprintf("## %s\n\n", h.Summary))
		sb.WriteString(c.Summary)
		sb.WriteString("\n\n")
	}

	// Value Proposition
	if c.ValueProposition != "" {
		sb.WriteString(fmt.Sprintf("## %s\n\n", h.ValueProposition))
		sb.WriteString(c.ValueProposition)
		sb.WriteString("\n\n")
	}

	// Proposed Actions
	if len(c.ProposedActions) > 0 {
		sb.WriteString(fmt.Sprintf("## %s\n\n", h.ProposedActions))
		for _, a := range c.ProposedActions {
			sb.WriteString(fmt.Sprintf("- [ ] %s\n", a))
		}
		sb.WriteString("\n")
	}

	// Source Note
	if c.SourceNote != "" {
		sb.WriteString(fmt.Sprintf("## %s\n\n", h.SourceNotes))
		sb.WriteString(c.SourceNote)
		sb.WriteString("\n\n")
	}

	// References
	if len(c.References) > 0 {
		sb.WriteString(fmt.Sprintf("## %s\n\n", h.References))
		for _, r := range c.References {
			if r.URL != "" {
				sb.WriteString(fmt.Sprintf("- [%s](%s) (%s)\n", r.Label, r.URL, r.Kind))
			} else {
				sb.WriteString(fmt.Sprintf("- %s (%s)\n", r.Label, r.Kind))
			}
		}
		sb.WriteString("\n")
	}

	// Completed Research Dossier
	if exp.Research != nil {
		playbookName := ""
		if exp.Research.PlaybookSnapshot != nil && exp.Research.PlaybookSnapshot.Name != "" {
			playbookName = exp.Research.PlaybookSnapshot.Name
		}
		if playbookName == "" {
			playbookName = "Deep Research"
		}

		completedAt := exp.Research.CreatedAt
		for _, s := range exp.Research.Steps {
			if !s.FinishedAt.IsZero() && s.FinishedAt.After(completedAt) {
				completedAt = s.FinishedAt
			}
		}

		sb.WriteString(fmt.Sprintf("## %s\n\n", h.ResearchDossier))
		sb.WriteString(fmt.Sprintf("**%s:** %s\n", h.Playbook, playbookName))
		sb.WriteString(fmt.Sprintf("**%s:** %s\n\n", h.Completed, completedAt.Format(time.RFC3339)))
		if strings.TrimSpace(exp.Research.Findings) != "" {
			sb.WriteString(strings.TrimSpace(exp.Research.Findings))
			sb.WriteString("\n\n")
		}
	}

	return sb.String()
}

// CardToMarkdown converts a Card into an Obsidian-compatible Markdown note with YAML frontmatter.
func CardToMarkdown(c port.Card, loc ...string) string {
	locale := ""
	if len(loc) > 0 {
		locale = loc[0]
	}
	return CardExportToMarkdown(port.CardExport{Card: c, Locale: locale}, loc...)
}

// SyncCardExport writes a single CardExport bundle atomically into vaultDir and cleans up any old title files for this card.
func SyncCardExport(vaultDir string, exp port.CardExport, loc ...string) (string, error) {
	if err := os.MkdirAll(vaultDir, 0755); err != nil {
		return "", fmt.Errorf("obsidian: mkdir %s: %w", vaultDir, err)
	}

	clean := SanitizeFilename(exp.Card.ID, exp.Card.Title)
	filename := fmt.Sprintf("%d-%s", exp.Card.ID, clean)
	targetPath := filepath.Join(vaultDir, filename)

	content := CardExportToMarkdown(exp, loc...)

	// Write to a temporary file in vaultDir first for atomic replacement.
	tmpFile, err := os.CreateTemp(vaultDir, fmt.Sprintf(".%d-*.tmp", exp.Card.ID))
	if err != nil {
		return "", fmt.Errorf("obsidian: create temp in %s: %w", vaultDir, err)
	}
	tmpPath := tmpFile.Name()

	if _, err := tmpFile.WriteString(content); err != nil {
		_ = tmpFile.Close()
		_ = os.Remove(tmpPath)
		return "", fmt.Errorf("obsidian: write temp %s: %w", tmpPath, err)
	}
	if err := tmpFile.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return "", fmt.Errorf("obsidian: close temp %s: %w", tmpPath, err)
	}

	// Clean up any existing <card.ID>-*.md files if the title has changed.
	matches, _ := filepath.Glob(filepath.Join(vaultDir, fmt.Sprintf("%d-*.md", exp.Card.ID)))
	for _, m := range matches {
		if m != targetPath {
			_ = os.Remove(m)
		}
	}

	if err := os.Rename(tmpPath, targetPath); err != nil {
		_ = os.Remove(tmpPath)
		return "", fmt.Errorf("obsidian: rename %s to %s: %w", tmpPath, targetPath, err)
	}

	return targetPath, nil
}

// SyncCard writes a single note into the target vault directory.
func SyncCard(vaultDir string, c port.Card, loc ...string) (string, error) {
	locale := ""
	if len(loc) > 0 {
		locale = loc[0]
	}
	return SyncCardExport(vaultDir, port.CardExport{Card: c, Locale: locale}, loc...)
}

// SyncCardExports batches multiple CardExport bundles into the vault directory.
func SyncCardExports(vaultDir string, exports []port.CardExport, loc ...string) ([]string, error) {
	var paths []string
	for _, exp := range exports {
		path, err := SyncCardExport(vaultDir, exp, loc...)
		if err != nil {
			return paths, err
		}
		paths = append(paths, path)
	}
	return paths, nil
}

// SyncCards batches cards into the vault directory.
func SyncCards(vaultDir string, cards []port.Card, loc ...string) (int, error) {
	exports := make([]port.CardExport, len(cards))
	for i, c := range cards {
		exports[i] = port.CardExport{Card: c}
	}
	paths, err := SyncCardExports(vaultDir, exports, loc...)
	return len(paths), err
}

// TestVaultDirectory tests that vaultDir exists or can be created and is writable.
func TestVaultDirectory(vaultDir string) error {
	vaultDir = strings.TrimSpace(vaultDir)
	if vaultDir == "" {
		return errors.New("obsidian vault directory path is required")
	}
	if err := os.MkdirAll(vaultDir, 0755); err != nil {
		return fmt.Errorf("obsidian: cannot create vault directory %s: %w", vaultDir, err)
	}
	probeFile, err := os.CreateTemp(vaultDir, ".sparkkeep_probe_*")
	if err != nil {
		return fmt.Errorf("obsidian: vault directory %s is not writable: %w", vaultDir, err)
	}
	probePath := probeFile.Name()
	_ = probeFile.Close()
	_ = os.Remove(probePath)
	return nil
}
