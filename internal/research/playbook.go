package research

import (
	"fmt"
	"strings"

	"sparkkeep/internal/port"
)

var ValidStepKinds = map[string]bool{
	port.StepKindGround:       true,
	port.StepKindResolveRefs:  true,
	port.StepKindPlan:         true,
	port.StepKindSearch:       true,
	port.StepKindRead:         true,
	port.StepKindVerifyClaims: true,
	port.StepKindLandscape:    true,
	port.StepKindVerdict:      true,
	port.StepKindReport:       true,
	port.StepKindCustom:       true,
}

// ValidatePlaybook enforces Prompt 12 validation rules:
// - name required
// - at least 1 step, max 12 steps
// - known step kinds only
// - ordering: read requires search or resolve_refs before it
// - ordering: verdict/report must be at the end
// - custom step instruction <= 2000 chars, output_heading required, max_queries <= 5
func ValidatePlaybook(pb port.Playbook) error {
	if strings.TrimSpace(pb.Name) == "" {
		return fmt.Errorf("playbook name is required: %w", port.ErrInvalidPlaybook)
	}
	if len(pb.Steps) == 0 {
		return fmt.Errorf("playbook must contain at least one step: %w", port.ErrInvalidPlaybook)
	}
	if len(pb.Steps) > 12 {
		return fmt.Errorf("playbook exceeds maximum of 12 steps (got %d): %w", len(pb.Steps), port.ErrInvalidPlaybook)
	}

	hasSearchOrRefs := false
	verdictOrReportSeen := false

	for i, step := range pb.Steps {
		if !ValidStepKinds[step.Kind] {
			return fmt.Errorf("step %d: unknown step kind %q: %w", i+1, step.Kind, port.ErrInvalidPlaybook)
		}

		if step.Enabled {
			// Once verdict or report is seen, only verdict or report can follow
			if verdictOrReportSeen && step.Kind != port.StepKindVerdict && step.Kind != port.StepKindReport {
				return fmt.Errorf("step %d (%s): verdict and report must be at the end of the playbook: %w", i+1, step.Kind, port.ErrInvalidPlaybook)
			}
			if step.Kind == port.StepKindVerdict || step.Kind == port.StepKindReport {
				verdictOrReportSeen = true
			}

			// read requires search or resolve_refs before it
			if step.Kind == port.StepKindRead && !hasSearchOrRefs {
				return fmt.Errorf("step %d (read): requires search or resolve_refs before it: %w", i+1, port.ErrInvalidPlaybook)
			}
			if step.Kind == port.StepKindSearch || step.Kind == port.StepKindResolveRefs {
				hasSearchOrRefs = true
			}
		}

		if step.Kind == port.StepKindCustom {
			if strings.TrimSpace(step.Config.OutputHeading) == "" {
				return fmt.Errorf("step %d (custom): output_heading is required: %w", i+1, port.ErrInvalidPlaybook)
			}
			if len(step.Config.Instruction) > 2000 {
				return fmt.Errorf("step %d (custom): instruction exceeds 2,000 characters (got %d): %w", i+1, len(step.Config.Instruction), port.ErrInvalidPlaybook)
			}
			if step.Config.MaxQueries > 5 {
				return fmt.Errorf("step %d (custom): max_queries exceeds cap of 5 (got %d): %w", i+1, step.Config.MaxQueries, port.ErrInvalidPlaybook)
			}
			if step.Config.ToolPolicy != "" && step.Config.ToolPolicy != "none" && step.Config.ToolPolicy != "search" {
				return fmt.Errorf("step %d (custom): invalid tool_policy %q (must be 'none' or 'search'): %w", i+1, step.Config.ToolPolicy, port.ErrInvalidPlaybook)
			}
			if step.Config.Role != "" && step.Config.Role != "research_plan" && step.Config.Role != "research_synthesis" {
				return fmt.Errorf("step %d (custom): invalid role %q (must be 'research_plan' or 'research_synthesis'): %w", i+1, step.Config.Role, port.ErrInvalidPlaybook)
			}
		}
	}

	return nil
}

// DefaultPlaybook returns the built-in Prompt 10 default playbook definition.
func DefaultPlaybook() port.Playbook {
	return port.Playbook{
		ID:          1,
		Name:        "Default",
		Description: "Standard deep research pipeline (grounding, plan, search, read, claims, landscape, verdict)",
		IsBuiltin:   true,
		CardTypes:   []string{},
		Version:     1,
		Steps: []port.PlaybookStep{
			{Position: 1, Kind: port.StepKindGround, Name: "Grounding", Enabled: true},
			{Position: 2, Kind: port.StepKindResolveRefs, Name: "Resolve References", Enabled: true},
			{Position: 3, Kind: port.StepKindPlan, Name: "Question Planning", Enabled: true},
			{Position: 4, Kind: port.StepKindSearch, Name: "Multi-query Search", Enabled: true},
			{Position: 5, Kind: port.StepKindRead, Name: "Round-robin Reading", Enabled: true},
			{Position: 6, Kind: port.StepKindVerifyClaims, Name: "Claim Verification", Enabled: true},
			{Position: 7, Kind: port.StepKindLandscape, Name: "Competitive Landscape", Enabled: true},
			{Position: 8, Kind: port.StepKindVerdict, Name: "Synthesis & Verdict", Enabled: true},
			{Position: 9, Kind: port.StepKindReport, Name: "Report Generation", Enabled: true},
		},
	}
}

// ClaimCheckPlaybook returns the built-in "Claim check only" playbook definition.
func ClaimCheckPlaybook() port.Playbook {
	return port.Playbook{
		ID:          2,
		Name:        "Claim check only",
		Description: "Fast claim verification pipeline without landscape or synthesis verdict",
		IsBuiltin:   true,
		CardTypes:   []string{},
		Version:     1,
		Steps: []port.PlaybookStep{
			{Position: 1, Kind: port.StepKindGround, Name: "Grounding", Enabled: true},
			{Position: 2, Kind: port.StepKindResolveRefs, Name: "Resolve References", Enabled: true},
			{Position: 3, Kind: port.StepKindPlan, Name: "Question Planning", Enabled: true},
			{Position: 4, Kind: port.StepKindSearch, Name: "Multi-query Search", Enabled: true},
			{Position: 5, Kind: port.StepKindRead, Name: "Round-robin Reading", Enabled: true},
			{Position: 6, Kind: port.StepKindVerifyClaims, Name: "Claim Verification", Enabled: true},
			{Position: 7, Kind: port.StepKindReport, Name: "Report Generation", Enabled: true},
		},
	}
}

