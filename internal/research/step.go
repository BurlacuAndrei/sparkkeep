package research

import (
	"context"

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
	Card        port.Card
	Capture     *port.Capture
	References  []port.Reference
	Sources     *Registry
	StepOutputs map[string]any
	Steps       []port.ResearchStep
	Plan        *port.ResearchPlan
	Result      *port.ResearchResult
	Query       string
	Tokens      int
	ResearchID  int64
	Store       port.Store
	Notes       map[string]string // stepID -> note
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
		ResearchID:  researchID,
		Store:       store,
		Notes:       make(map[string]string),
	}
}

func (s *RunState) SetNote(stepID, note string) {
	if s.Notes == nil {
		s.Notes = make(map[string]string)
	}
	s.Notes[stepID] = note
}
