package obsidian

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

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

// CardToMarkdown converts a Card into an Obsidian-compatible Markdown note with YAML frontmatter.
func CardToMarkdown(c port.Card) string {
	var sb strings.Builder

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
	sb.WriteString("---\n\n")

	// Title
	sb.WriteString(fmt.Sprintf("# %s\n\n", c.Title))

	// Executive Summary / Summary
	if c.ExecutiveSummary != "" {
		sb.WriteString("## Executive Summary\n\n")
		sb.WriteString(c.ExecutiveSummary)
		sb.WriteString("\n\n")
	} else if c.Summary != "" {
		sb.WriteString("## Summary\n\n")
		sb.WriteString(c.Summary)
		sb.WriteString("\n\n")
	}

	// Value Proposition
	if c.ValueProposition != "" {
		sb.WriteString("## Value Proposition\n\n")
		sb.WriteString(c.ValueProposition)
		sb.WriteString("\n\n")
	}

	// Proposed Actions
	if len(c.ProposedActions) > 0 {
		sb.WriteString("## Proposed Actions\n\n")
		for _, a := range c.ProposedActions {
			sb.WriteString(fmt.Sprintf("- [ ] %s\n", a))
		}
		sb.WriteString("\n")
	}

	// Source Note
	if c.SourceNote != "" {
		sb.WriteString("## Source Notes\n\n")
		sb.WriteString(c.SourceNote)
		sb.WriteString("\n\n")
	}

	// References
	if len(c.References) > 0 {
		sb.WriteString("## References\n\n")
		for _, r := range c.References {
			if r.URL != "" {
				sb.WriteString(fmt.Sprintf("- [%s](%s) (%s)\n", r.Label, r.URL, r.Kind))
			} else {
				sb.WriteString(fmt.Sprintf("- %s (%s)\n", r.Label, r.Kind))
			}
		}
		sb.WriteString("\n")
	}

	return sb.String()
}

// SyncCard writes a single note into the target vault directory.
func SyncCard(vaultDir string, c port.Card) (string, error) {
	if err := os.MkdirAll(vaultDir, 0755); err != nil {
		return "", fmt.Errorf("obsidian: mkdir %s: %w", vaultDir, err)
	}

	filename := SanitizeFilename(c.ID, c.Title)
	filePath := filepath.Join(vaultDir, filename)

	content := CardToMarkdown(c)
	if err := os.WriteFile(filePath, []byte(content), 0644); err != nil {
		return "", fmt.Errorf("obsidian: write %s: %w", filePath, err)
	}

	return filePath, nil
}

// SyncCards batches cards into the vault directory.
func SyncCards(vaultDir string, cards []port.Card) (int, error) {
	written := 0
	for _, c := range cards {
		if _, err := SyncCard(vaultDir, c); err != nil {
			return written, err
		}
		written++
	}
	return written, nil
}
