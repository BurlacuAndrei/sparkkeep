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

// BuiltinStepTemplates returns the 7 curated built-in library step templates.
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
		{
			ID:          "tech_stack_deepdive",
			Icon:        "🛠️",
			Name:        "Tech stack & architecture",
			Description: "Detailed engineering evaluation covering architecture, repo health, dependency debt, and license viability.",
			Heading:     "Tech Stack & Architecture",
			Instruction: "Perform an exhaustive technical stack and architecture evaluation. Structure your assessment with: 1. **Architecture & System Design** (Component modularity, data flow, extensibility, and scalability patterns). 2. **Repository & Community Health** (Commit velocity, maintenance cadence, contributor diversity, issue backlog resolution). 3. **Dependency Debt & Modernity** (Outdated packages, vulnerability surface, architectural coupling). 4. **License & Operational Viability** (Open-source license compliance, commercial constraints, production readiness). Cite sources using [S#].",
			ToolPolicy:  "search",
			Role:        "research_synthesis",
			Inputs:      []string{"capture", "sources", "previous_steps"},
			MaxQueries:  3,
		},
		{
			ID:          "moat_pricing",
			Icon:        "💰",
			Name:        "Moat & pricing economics",
			Description: "Unit economics, switching costs, pricing tier dynamics, and competitive moat defensibility.",
			Heading:     "Moat & Pricing Economics",
			Instruction: "Analyze the economic fundamentals, pricing models, and competitive defensibility. Structure your assessment into: 1. **Unit Economics & Margin Structure** (Cost drivers, infrastructure overhead, scaling margins). 2. **Pricing Models & Tiers** (Packaging, monetization strategy, free tier boundaries). 3. **Switching Costs & Lock-in** (Data portability, migration friction, workflow integration stickiness). 4. **Moat Defensibility** (Network effects, IP, economies of scale, long-term durable advantages). Cite sources using [S#].",
			ToolPolicy:  "search",
			Role:        "research_synthesis",
			Inputs:      []string{"capture", "sources", "previous_steps"},
			MaxQueries:  2,
		},
		{
			ID:          "regulatory_compliance",
			Icon:        "⚖️",
			Name:        "Regulatory & compliance",
			Description: "Comprehensive compliance assessment covering GDPR/HIPAA, licensing traps, and regulatory exposure.",
			Heading:     "Regulatory & Compliance",
			Instruction: "Conduct a comprehensive legal, regulatory, and compliance evaluation. Structure your assessment into: 1. **Data Privacy & Jurisdictional Hurdles** (GDPR, HIPAA, CCPA compliance, cross-border data transfer, sensitive data handling). 2. **Licensing Traps & Legal Liabilities** (Copyright, patent risks, copyleft clauses, third-party attribution obligations). 3. **Regulatory Requirements & Frameworks** (Industry standards, security accreditations like SOC2/ISO, audit trail needs). 4. **Legal & Compliance Risks** (Litigation surface, regulatory exposure, upcoming policy risks). Cite sources using [S#].",
			ToolPolicy:  "search",
			Role:        "research_synthesis",
			Inputs:      []string{"capture", "sources", "previous_steps"},
			MaxQueries:  2,
		},
		{
			ID:          "executive_memo",
			Icon:        "📋",
			Name:        "Executive 1-page memo",
			Description: "Board-level executive briefing summarizing strategic fit, ROI, and core decision points.",
			Heading:     "Executive Memo",
			Instruction: "Deliver a concise, board-level executive 1-page memorandum. Structure your memo into: 1. **Executive Brief** (Context, strategic relevance, and high-level synthesis). 2. **Financial Impact & Expected ROI** (Cost vs. return expectations, efficiency opportunities, resource requirements). 3. **3 Core Strategic Decisions** (Detail exactly three decisive, actionable strategic choices requiring immediate executive sign-off). Maintain a crisp, authoritative tone suitable for C-suite decision-makers. Cite sources using [S#].",
			ToolPolicy:  "search",
			Role:        "research_synthesis",
			Inputs:      []string{"capture", "sources", "previous_steps"},
			MaxQueries:  2,
		},
	}
}
