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
			ID:          "general_analysis",
			Icon:        "🧠",
			Name:        "General Analysis",
			Description: "Deep dive analysis of the topic, breaking down core concepts and implications.",
			Heading:     "General Analysis",
			Instruction: "Perform a comprehensive, first-principles breakdown of the topic. Structure your response with the following sections: 1. **Executive Summary** (TL;DR). 2. **Core Mechanics** (How it works under the hood). 3. **Market & Broader Implications** (Why it matters right now). 4. **Key Insights & Actionable Takeaways**. Do not hallucinate; rely strictly on the provided context. Cite every factual claim using [S#]. Maintain an objective, highly analytical tone.",
			ToolPolicy:  "search",
			Role:        "research_synthesis",
			Inputs:      []string{"capture", "sources", "previous_steps"},
			MaxQueries:  2,
		},
		{
			ID:          "landscape_extended",
			Icon:        "🥊",
			Name:        "Competitive landscape",
			Description: "In-depth alternative comparison table with strengths, trade-offs, and market positioning.",
			Heading:     "Competitive Landscape",
			Instruction: "Deliver a rigorous competitive analysis. You MUST include a highly structured Markdown comparison table contrasting this subject against its top 3-5 direct and indirect alternatives. The table should compare columns such as: Core Differentiator, Key Trade-offs, Target Audience, and Relative Pricing/Adoption. Below the table, provide a narrative breakdown of the subject's competitive 'moat' and its greatest vulnerabilities. Cite all sources using [S#].",
			ToolPolicy:  "search",
			Role:        "research_synthesis",
			Inputs:      []string{"capture", "sources", "previous_steps"},
			MaxQueries:  3,
		},
		{
			ID:          "risk_flags",
			Icon:        "⚠️",
			Name:        "Risk & red flags",
			Description: "Hype check, conflicts of interest, security/privacy vulnerabilities, and legal or regulatory risks.",
			Heading:     "Risks & Red Flags",
			Instruction: "Conduct a ruthless, skeptical analysis of the subject to uncover potential risks. You must identify and categorize: 1. **Security & Privacy Vulnerabilities**. 2. **Hype vs. Reality** (Where do the marketing claims fall short of the technical reality?). 3. **Lock-in & Vendor Risks** (Dependency traps, licensing gotchas, or ecosystem fragility). 4. **Regulatory & Compliance Hurdles**. Be specific, avoiding generic warnings. Base all concerns on the provided context. Cite sources using [S#].",
			ToolPolicy:  "search",
			Role:        "research_synthesis",
			Inputs:      []string{"capture", "sources", "previous_steps"},
			MaxQueries:  2,
		},
	}
}
