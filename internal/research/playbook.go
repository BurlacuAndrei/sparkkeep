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

// DefaultLitePlaybook returns the community-tier Default (lite) playbook variant.
func DefaultLitePlaybook() port.Playbook {
	return port.Playbook{
		ID:          1,
		Name:        "Default (lite)",
		Description: "Fast community research pipeline (grounding, references, search, read, report)",
		IsBuiltin:   true,
		CardTypes:   []string{},
		Version:     1,
		Steps: []port.PlaybookStep{
			{Position: 1, Kind: port.StepKindGround, Name: "Grounding", Enabled: true},
			{Position: 2, Kind: port.StepKindResolveRefs, Name: "Resolve References", Enabled: true},
			{Position: 3, Kind: port.StepKindSearch, Name: "Search", Enabled: true},
			{Position: 4, Kind: port.StepKindRead, Name: "Reading", Enabled: true},
			{Position: 5, Kind: port.StepKindReport, Name: "Report Generation", Enabled: true},
		},
	}
}

// TechStackPlaybook returns the built-in "Tech Stack Evaluator" playbook.
func TechStackPlaybook() port.Playbook {
	return port.Playbook{
		ID:          3,
		Name:        "Tech Stack Evaluator",
		Description: "Evaluates architecture, repo health, license, and alternatives",
		IsBuiltin:   true,
		CardTypes:   []string{},
		Version:     1,
		Steps: []port.PlaybookStep{
			{Position: 1, Kind: port.StepKindGround, Name: "Grounding", Enabled: true},
			{Position: 2, Kind: port.StepKindResolveRefs, Name: "Resolve References", Enabled: true},
			{Position: 3, Kind: port.StepKindPlan, Name: "Architecture & Repo Health Planning", Enabled: true, Config: port.CustomStepConfig{
				Instruction: "Formulate technical evaluation questions focusing on architecture, dependencies, repo health, license viability, and ecosystem alternatives.",
				Role:        "research_plan",
			}},
			{Position: 4, Kind: port.StepKindSearch, Name: "Technical & Ecosystem Search", Enabled: true, Config: port.CustomStepConfig{
				Instruction: "Search for repository activity, maintainer reputation, security advisories, benchmarks, and competing libraries or tools.",
				ToolPolicy:  "search",
				MaxQueries:  5,
			}},
			{Position: 5, Kind: port.StepKindRead, Name: "Documentation & Source Reading", Enabled: true, Config: port.CustomStepConfig{
				Instruction: "Read repository documentation, architecture diagrams, benchmark results, and community discussions.",
			}},
			{Position: 6, Kind: port.StepKindLandscape, Name: "Ecosystem & Alternatives Matrix", Enabled: true, Config: port.CustomStepConfig{
				Instruction: "Compare against leading alternative frameworks and libraries on maintenance, performance, and ergonomics.",
			}},
			{Position: 7, Kind: port.StepKindVerdict, Name: "Architecture Assessment & Verdict", Enabled: true, Config: port.CustomStepConfig{
				Instruction: "Synthesize findings into an architectural assessment covering maintainability, production readiness, license risks, and recommended adoption path.",
				Role:        "research_synthesis",
			}},
			{Position: 8, Kind: port.StepKindReport, Name: "Report Generation", Enabled: true},
		},
	}
}

// CompetitorPlaybook returns the built-in "Competitor Comparison" playbook.
func CompetitorPlaybook() port.Playbook {
	return port.Playbook{
		ID:          4,
		Name:        "Competitor Comparison",
		Description: "Builds a feature matrix, pricing comparison, and pros/cons",
		IsBuiltin:   true,
		CardTypes:   []string{},
		Version:     1,
		Steps: []port.PlaybookStep{
			{Position: 1, Kind: port.StepKindGround, Name: "Grounding", Enabled: true},
			{Position: 2, Kind: port.StepKindResolveRefs, Name: "Resolve References", Enabled: true},
			{Position: 3, Kind: port.StepKindPlan, Name: "Market & Feature Planning", Enabled: true, Config: port.CustomStepConfig{
				Instruction: "Identify key product vectors: core capabilities, target customer profile, pricing tiers, and differentiation points.",
				Role:        "research_plan",
			}},
			{Position: 4, Kind: port.StepKindSearch, Name: "Competitor Intelligence Search", Enabled: true, Config: port.CustomStepConfig{
				Instruction: "Search for direct and indirect competitors, pricing pages, feature comparison breakdowns, and user reviews.",
				ToolPolicy:  "search",
				MaxQueries:  5,
			}},
			{Position: 5, Kind: port.StepKindRead, Name: "Product & Review Deep Dive", Enabled: true, Config: port.CustomStepConfig{
				Instruction: "Read competitive teardowns, pricing structures, customer complaints, and feature matrices.",
			}},
			{Position: 6, Kind: port.StepKindLandscape, Name: "Competitive Feature & Pricing Matrix", Enabled: true, Config: port.CustomStepConfig{
				Instruction: "Construct a comprehensive feature and pricing comparison matrix highlighting strengths, weaknesses, and unique selling points.",
			}},
			{Position: 7, Kind: port.StepKindVerdict, Name: "Competitive Advantage Verdict", Enabled: true, Config: port.CustomStepConfig{
				Instruction: "Deliver a clear competitive verdict evaluating market positioning, moat, threats, and strategic opportunities.",
				Role:        "research_synthesis",
			}},
			{Position: 8, Kind: port.StepKindReport, Name: "Report Generation", Enabled: true},
		},
	}
}

// FactCheckPlaybook returns the built-in "Fact & Claim Checker" playbook.
func FactCheckPlaybook() port.Playbook {
	return port.Playbook{
		ID:          5,
		Name:        "Fact & Claim Checker",
		Description: "Verifies specific claims against authoritative sources",
		IsBuiltin:   true,
		CardTypes:   []string{},
		Version:     1,
		Steps: []port.PlaybookStep{
			{Position: 1, Kind: port.StepKindGround, Name: "Grounding", Enabled: true},
			{Position: 2, Kind: port.StepKindResolveRefs, Name: "Resolve References", Enabled: true},
			{Position: 3, Kind: port.StepKindPlan, Name: "Claim Extraction & Verification Plan", Enabled: true, Config: port.CustomStepConfig{
				Instruction: "Deconstruct the primary assertions, quantitative metrics, and causal claims to be verified against primary sources.",
				Role:        "research_plan",
			}},
			{Position: 4, Kind: port.StepKindSearch, Name: "Authoritative Source Search", Enabled: true, Config: port.CustomStepConfig{
				Instruction: "Search peer-reviewed papers, primary documentation, official statistics, and reputable investigative sources.",
				ToolPolicy:  "search",
				MaxQueries:  5,
			}},
			{Position: 5, Kind: port.StepKindRead, Name: "Primary Evidence Reading", Enabled: true, Config: port.CustomStepConfig{
				Instruction: "Examine primary evidence, statistical context, methodologies, and original source citations.",
			}},
			{Position: 6, Kind: port.StepKindVerifyClaims, Name: "Claim Verification & Evidence Rating", Enabled: true, Config: port.CustomStepConfig{
				Instruction: "Evaluate veracity, nuance, potential misrepresentations, and confidence level for each claim.",
			}},
			{Position: 7, Kind: port.StepKindVerdict, Name: "Factual Accuracy Verdict", Enabled: true, Config: port.CustomStepConfig{
				Instruction: "Issue an authoritative truth-rating verdict with supporting evidence, caveats, and identified falsehoods or exaggerations.",
				Role:        "research_synthesis",
			}},
			{Position: 8, Kind: port.StepKindReport, Name: "Report Generation", Enabled: true},
		},
	}
}

// ExecutiveBriefingPlaybook returns the built-in "Quick Executive Briefing" playbook.
func ExecutiveBriefingPlaybook() port.Playbook {
	return port.Playbook{
		ID:          6,
		Name:        "Quick Executive Briefing",
		Description: "Fast 2-minute synthesis (TL;DR, target audience, key takeaways)",
		IsBuiltin:   true,
		CardTypes:   []string{},
		Version:     1,
		Steps: []port.PlaybookStep{
			{Position: 1, Kind: port.StepKindGround, Name: "Grounding", Enabled: true},
			{Position: 2, Kind: port.StepKindPlan, Name: "Executive Focus Plan", Enabled: true, Config: port.CustomStepConfig{
				Instruction: "Frame essential executive inquiries: business impact, target audience, urgency, and strategic ROI.",
				Role:        "research_plan",
			}},
			{Position: 3, Kind: port.StepKindSearch, Name: "Rapid Context Search", Enabled: true, Config: port.CustomStepConfig{
				Instruction: "Quickly gather macro industry context, market size, and primary stakeholder commentary.",
				ToolPolicy:  "search",
				MaxQueries:  3,
			}},
			{Position: 4, Kind: port.StepKindRead, Name: "High-Signal Synthesis Reading", Enabled: true, Config: port.CustomStepConfig{
				Instruction: "Filter for high-signal summaries, executive announcements, and core data points.",
			}},
			{Position: 5, Kind: port.StepKindVerdict, Name: "Executive Synthesis & Action Points", Enabled: true, Config: port.CustomStepConfig{
				Instruction: "Synthesize a high-impact executive briefing: 2-sentence executive summary, target stakeholders, 3 key takeaways, and immediate actionable decision points.",
				Role:        "research_synthesis",
			}},
			{Position: 6, Kind: port.StepKindReport, Name: "Report Generation", Enabled: true},
		},
	}
}

// BuiltinPlaybooks returns all built-in playbook definitions.
func BuiltinPlaybooks() []port.Playbook {
	return []port.Playbook{
		DefaultPlaybook(),
		ClaimCheckPlaybook(),
		TechStackPlaybook(),
		CompetitorPlaybook(),
		FactCheckPlaybook(),
		ExecutiveBriefingPlaybook(),
	}
}
