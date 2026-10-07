package research

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"sparkkeep/internal/port"
)

const (
	DefaultPerSourceBudget = 6000  // 6k runes per source
	DefaultTotalBudget     = 40000 // 40k runes total
)

// Registry attributes and holds fetched research sources S1..Sn with per-source
// and total rune-safe clipping budgets.
type Registry struct {
	PerSourceBudget int
	TotalBudget     int

	mu           sync.Mutex
	sources      []port.Source
	currentRunes int
	seenURLs     map[string]bool
}

func NewRegistry(perSourceBudget, totalBudget int) *Registry {
	if perSourceBudget <= 0 {
		perSourceBudget = DefaultPerSourceBudget
	}
	if totalBudget <= 0 {
		totalBudget = DefaultTotalBudget
	}
	return &Registry{
		PerSourceBudget: perSourceBudget,
		TotalBudget:     totalBudget,
		sources:         []port.Source{},
		seenURLs:        make(map[string]bool),
	}
}

func (r *Registry) HasURL(u string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.hasURL(u)
}

func (r *Registry) hasURL(u string) bool {
	norm := normalizeURL(u)
	if norm == "" {
		return false
	}
	return r.seenURLs[norm]
}

func normalizeURL(u string) string {
	u = strings.TrimSpace(u)
	u = strings.TrimRight(u, "/")
	return strings.ToLower(u)
}

// Add appends a document as S1..Sn if under budgets, performing rune-safe clipping.
// Returns the added source and true, or nil and false if duplicate or no budget.
func (r *Registry) Add(u, title, origin, text string, fetchedAt time.Time, questions ...string) (*port.Source, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	norm := normalizeURL(u)
	if norm != "" && r.seenURLs[norm] {
		// If duplicate URL, append any new questions to the existing source
		if len(questions) > 0 {
			for i, s := range r.sources {
				if normalizeURL(s.URL) == norm {
					for _, q := range questions {
						if !slicesContains(r.sources[i].Questions, q) {
							r.sources[i].Questions = append(r.sources[i].Questions, q)
						}
					}
					return &r.sources[i], false
				}
			}
		}
		return nil, false
	}

	remainingTotal := r.TotalBudget - r.currentRunes
	if remainingTotal <= 0 {
		return nil, false
	}

	runes := []rune(text)
	if len(runes) == 0 {
		return nil, false
	}

	// 1. Clip to per-source budget (rune-safe)
	if len(runes) > r.PerSourceBudget {
		runes = runes[:r.PerSourceBudget]
	}

	// 2. Clip to remaining total budget (rune-safe)
	if len(runes) > remainingTotal {
		runes = runes[:remainingTotal]
	}

	clippedText := string(runes)
	r.currentRunes += len(runes)
	if norm != "" {
		r.seenURLs[norm] = true
	}

	id := fmt.Sprintf("S%d", len(r.sources)+1)
	src := port.Source{
		ID:          id,
		URL:         u,
		Title:       title,
		FetchedAt:   fetchedAt,
		Origin:      origin,
		ClippedText: clippedText,
		Questions:   questions,
	}
	r.sources = append(r.sources, src)
	return &src, true
}

func slicesContains(slice []string, val string) bool {
	for _, s := range slice {
		if s == val {
			return true
		}
	}
	return false
}

func (r *Registry) All() []port.Source {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]port.Source, len(r.sources))
	copy(out, r.sources)
	return out
}

func (r *Registry) TotalRunes() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.currentRunes
}

// FormatForSynthesis prepares all sources tagged with [S#] markers for the synthesis model.
func (r *Registry) FormatForSynthesis() string {
	r.mu.Lock()
	defer r.mu.Unlock()

	var b strings.Builder
	for _, s := range r.sources {
		qTag := ""
		if len(s.Questions) > 0 {
			qTag = fmt.Sprintf(" [Serves: %s]", strings.Join(s.Questions, ", "))
		}
		header := fmt.Sprintf("[%s] %s (%s) [Origin: %s]%s:", s.ID, s.Title, s.URL, s.Origin, qTag)
		b.WriteString(header + "\n" + s.ClippedText + "\n\n")
	}
	return b.String()
}
