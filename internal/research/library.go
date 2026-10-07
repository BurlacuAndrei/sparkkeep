package research

// LibraryStepTemplate defines a pre-tuned custom step template available in the step library.
type LibraryStepTemplate struct {
	ID          string   `json:"id"`
	Icon        string   `json:"icon"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Heading     string   `json:"heading"`
	Instruction string   `json:"instruction"`
	ToolPolicy  string   `json:"tool_policy"`
	Role        string   `json:"role"`
	Inputs      []string `json:"inputs"`
	MaxQueries  int      `json:"max_queries"`
}

// BuiltinStepTemplates returns the 6 curated built-in library step templates.
func BuiltinStepTemplates() []LibraryStepTemplate {
	return []LibraryStepTemplate{
		{
			ID:          "monetization",
			Icon:        "💰",
			Name:        "Monetization angle",
			Description: "Business models, who pays, pricing comparables, effort-to-first-dollar.",
			Heading:     "Monetization Angle",
			Instruction: "Analyze how this idea, tool, or product can generate revenue. Identify potential business models (e.g. SaaS, freemium, usage-based, marketplace, consulting), target buyer personas (who pays and why), existing pricing benchmarks and comparables, and the realistic effort/timeline to first dollar. Cite relevant sources using [S#] where applicable.",
			ToolPolicy:  "search",
			Role:        "research_synthesis",
			Inputs:      []string{"capture", "sources", "previous_steps"},
			MaxQueries:  2,
		},
		{
			ID:          "tech_feasibility",
			Icon:        "🛠️",
			Name:        "Tech feasibility",
			Description: "Self-hostability, stack, license, maintenance health (commits, issues, bus factor), integration effort.",
			Heading:     "Technical Feasibility",
			Instruction: "Assess the technical feasibility and implementation complexity. Cover self-hostability vs cloud requirements, programming stack and architecture, licensing constraints (permissive vs copyleft/commercial), open-source maintenance health (activity, issue triage, bus factor), and estimated integration effort. Cite sources using [S#].",
			ToolPolicy:  "search",
			Role:        "research_synthesis",
			Inputs:      []string{"capture", "sources", "previous_steps"},
			MaxQueries:  2,
		},
		{
			ID:          "landscape_extended",
			Icon:        "🥊",
			Name:        "Competitive landscape (extended)",
			Description: "In-depth alternative comparison table with strengths, trade-offs, and market positioning.",
			Heading:     "Competitive Landscape (Extended)",
			Instruction: "Provide a deep competitive analysis. Include a structured Markdown comparison table contrasting this project/concept with top direct and indirect alternatives. Detail core differentiators, key trade-offs, moats, and pricing or adoption differences. Cite sources using [S#].",
			ToolPolicy:  "search",
			Role:        "research_synthesis",
			Inputs:      []string{"capture", "sources", "previous_steps"},
			MaxQueries:  3,
		},
		{
			ID:          "learning_path",
			Icon:        "📚",
			Name:        "Learning path",
			Description: "Prerequisites, best resources, and an actionable 1-week mastery plan.",
			Heading:     "Learning Path & Curriculum",
			Instruction: "Construct a focused learning roadmap to understand and master this subject. Outline foundational prerequisites, recommended documentation, tutorials, or authoritative books/papers, and an actionable 1-week day-by-day plan for rapid onboarding. Cite verified sources using [S#].",
			ToolPolicy:  "none",
			Role:        "research_plan",
			Inputs:      []string{"capture", "sources", "previous_steps"},
			MaxQueries:  0,
		},
		{
			ID:          "risk_flags",
			Icon:        "⚠️",
			Name:        "Risk & red flags",
			Description: "Hype check, conflicts of interest, security/privacy vulnerabilities, and legal or regulatory risks.",
			Heading:     "Risks & Red Flags",
			Instruction: "Conduct a rigorous critical analysis. Identify potential red flags including exaggerated hype vs proven reality, security and data privacy implications, licensing or regulatory hurdles, dependency lock-in, and vendor sustainability risks. Cite sources with [S#].",
			ToolPolicy:  "search",
			Role:        "research_synthesis",
			Inputs:      []string{"capture", "sources", "previous_steps"},
			MaxQueries:  2,
		},
		{
			ID:          "personal_fit",
			Icon:        "👤",
			Name:        "Personal fit",
			Description: "Evaluates alignment with your saved skills, active projects, and personal knowledge base.",
			Heading:     "Personal Fit & Alignment",
			Instruction: "Evaluate how well this project or concept aligns with personal goals, existing skillsets, and active workflows. Highlight practical quick wins, potential friction points, and whether investing time now yields high leverage. Cite sources with [S#].",
			ToolPolicy:  "none",
			Role:        "research_synthesis",
			Inputs:      []string{"capture", "sources", "previous_steps"},
			MaxQueries:  0,
		},
	}
}
