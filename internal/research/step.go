package research

import (
	"context"
	"strings"

	"sparkkeep/internal/port"
)

// Step encapsulates one discrete phase of the research pipeline.
type Step struct {
	ID   string
	Name string
	Run  func(ctx context.Context, state *RunState) error
}

// RunState holds contextual state, sources, outputs, and budgets across steps.
type RunState struct {
	Card          port.Card
	Capture       *port.Capture
	References    []port.Reference
	Sources       *Registry
	StepOutputs   map[string]any
	Steps         []port.ResearchStep
	Plan          *port.ResearchPlan
	Result        *port.ResearchResult
	Query         string
	Tokens        int
	ResearchID    int64
	Store         port.Store
	Notes         map[string]string // stepID -> note
	Profile       *port.UserProfile
	PlaybookSteps []port.PlaybookStep
}

func NewRunState(card port.Card, researchID int64, store port.Store, perSourceBudget, totalBudget int) *RunState {
	return &RunState{
		Card:        card,
		References:  card.References,
		Sources:     NewRegistry(perSourceBudget, totalBudget),
		StepOutputs: make(map[string]any),
		Steps:       []port.ResearchStep{},
		Result: &port.ResearchResult{
			Claims:    []port.ClaimVerdict{},
			Landscape: []port.LandscapeItem{},
		},
		ResearchID: researchID,
		Store:      store,
		Notes:      make(map[string]string),
	}
}

func (s *RunState) SetNote(stepID, note string) {
	if s.Notes == nil {
		s.Notes = make(map[string]string)
	}
	s.Notes[stepID] = note
}

// OutputLanguage returns the target language name (e.g. "German", "Spanish", "English").
func (s *RunState) OutputLanguage() string {
	if s != nil && s.Profile != nil && strings.TrimSpace(s.Profile.Language) != "" {
		lang := strings.TrimSpace(s.Profile.Language)
		if !strings.EqualFold(lang, "auto") && !strings.EqualFold(lang, "same as source") && !strings.EqualFold(lang, "default") {
			return lang
		}
	}
	if s != nil && s.Store != nil {
		if loc, err := s.Store.GetSetting(context.Background(), "interface_locale"); err == nil && strings.TrimSpace(loc) != "" {
			return port.LocaleToLanguageName(strings.TrimSpace(loc))
		}
	}
	return "English"
}

// TargetLocale returns the 2-letter or BCP47 locale code (e.g. "de", "es", "ro", "pt-BR", "fr", "en").
func (s *RunState) TargetLocale() string {
	if s == nil {
		return "en"
	}
	return port.ResolveLocale(s.OutputLanguage())
}
