// Package research runs bounded, step-based investigation passes on a card:
// ground (capture + triage context) → resolve_refs (URL references) →
// plan (question planning) → search (SearXNG per question + domain ranking) →
// read (round-robin fair budget fetching) →
// synthesize (LLM report grouped per question with [S#] citations).
package research

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"sparkkeep/internal/analyze"
	"sparkkeep/internal/capture"
	"sparkkeep/internal/config"
	"sparkkeep/internal/port"
)

const (
	defaultMaxResults   = 6
	defaultMaxQuestions = 5
	defaultMaxFetches   = 12
	// Whole-run ceiling: includes LLM calls plus search and scraping.
	defaultTimeout = 1500 * time.Second
	// Search client timeout — bound for a single HTTP request.
	searchTimeout = 30 * time.Second
)

var (
	// ErrNoFetchableText is returned when no source produced usable text across all steps.
	ErrNoFetchableText = errors.New("research: no fetchable text")
	// ErrEmptyQuery is returned when the query generator produces an empty string.
	ErrEmptyQuery = errors.New("research: empty query from LLM")
	// ErrNoSearchResults is returned when SearXNG yields 0 URLs across all queries and no other sources exist.
	ErrNoSearchResults = errors.New("no search results")
	// ErrEmptyReport is returned when the synthesis prompt yields no output.
	ErrEmptyReport = errors.New("empty report from LLM")
)

type searchResp struct {
	Results []struct {
		URL string `json:"url"`
	} `json:"results"`
}

type Runner struct {
	SearchURL       string          // e.g. http://localhost:8080/search or empty in dev
	Client          *http.Client    // HTTP search client
	LLM             *analyze.Client // LLM fallback
	PlanLLM         *analyze.Client // LLM for planning / query generation (RoleResearchPlan)
	SynthesisLLM    *analyze.Client // LLM for synthesis (RoleResearchSynthesis)
	Fetcher         capture.Fetcher // fetcher for scraping URLs
	Store           port.Store      // store for progress updates and capture lookup
	MaxResults      int             // max search URLs per question (default 6)
	MaxQuestions    int             // max questions in plan (default 5)
	MaxFetches      int             // overall max fetches cap (default 12)
	ClipChars       int             // total rune budget (default 40,000)
	PerSourceBudget int             // per-source rune budget (default 6,000)
	Timeout         time.Duration   // whole-run timeout
}

func (r *Runner) planClient() *analyze.Client {
	if r.PlanLLM != nil {
		return r.PlanLLM
	}
	return r.LLM
}

func (r *Runner) synthesisClient() *analyze.Client {
	if r.SynthesisLLM != nil {
		return r.SynthesisLLM
	}
	return r.LLM
}

func (r *Runner) fetcher() capture.Fetcher {
	if r.Fetcher != nil {
		return r.Fetcher
	}
	return capture.Capture{HeadlessEnabled: true}
}

func (r *Runner) maxResults() int {
	if r.MaxResults > 0 {
		return r.MaxResults
	}
	return defaultMaxResults
}

func (r *Runner) maxQuestions() int {
	if r.MaxQuestions > 0 {
		return r.MaxQuestions
	}
	return defaultMaxQuestions
}

func (r *Runner) maxFetches() int {
	if r.MaxFetches > 0 {
		return r.MaxFetches
	}
	return defaultMaxFetches
}

// New returns a Runner with design defaults.
func New(cfg config.Config, llm *analyze.Client) *Runner {
	return &Runner{
		SearchURL:       cfg.SearchURL,
		Client:          &http.Client{Timeout: searchTimeout},
		LLM:             llm,
		PlanLLM:         llm,
		SynthesisLLM:    llm,
		Fetcher:         capture.Capture{HeadlessEnabled: cfg.HeadlessEnabled, ChromeBin: cfg.ChromeBin, YtDlpBin: cfg.YtDlpBin},
		MaxResults:      defaultMaxResults,
		MaxQuestions:    defaultMaxQuestions,
		MaxFetches:      defaultMaxFetches,
		ClipChars:       DefaultTotalBudget,
		PerSourceBudget: DefaultPerSourceBudget,
		Timeout:         defaultTimeout,
	}
}

// NewWithClients returns a Runner with distinct plan and synthesis clients.
func NewWithClients(cfg config.Config, planLLM, synthesisLLM *analyze.Client) *Runner {
	r := New(cfg, planLLM)
	r.PlanLLM = planLLM
	r.SynthesisLLM = synthesisLLM
	return r
}

// Run executes one research pass for a card with no active DB research row.
func (r *Runner) Run(ctx context.Context, card port.Card) (string, error) {
	return r.RunWithID(ctx, card, 0)
}

// RunWithID executes the step-based research pipeline, tracking progress mid-run
// against researchID in the configured Store.
func (r *Runner) RunWithID(ctx context.Context, card port.Card, researchID int64) (string, error) {
	timeout := r.Timeout
	if timeout <= 0 {
		timeout = defaultTimeout
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	perSource := r.PerSourceBudget
	if perSource <= 0 {
		perSource = DefaultPerSourceBudget
	}
	total := r.ClipChars
	if total <= 0 {
		total = DefaultTotalBudget
	}

	state := NewRunState(card, researchID, r.Store, perSource, total)

	pipeline := r.buildPipeline()
	for _, step := range pipeline {
		if ctx.Err() != nil {
			return "", ctx.Err()
		}

		startedAt := time.Now().Truncate(time.Second)
		stepRec := port.ResearchStep{
			ID:        step.ID,
			Status:    "running",
			StartedAt: startedAt,
		}
		state.Steps = append(state.Steps, stepRec)
		r.persistProgress(ctx, state, "running")

		err := step.Run(ctx, state)

		finishedAt := time.Now().Truncate(time.Second)
		idx := len(state.Steps) - 1
		state.Steps[idx].FinishedAt = finishedAt
		if note, ok := state.Notes[step.ID]; ok {
			state.Steps[idx].Note = note
		}

		if err != nil {
			state.Steps[idx].Status = "failed"
			state.Steps[idx].Note = err.Error()
			r.persistProgress(ctx, state, "failed")
			return "", fmt.Errorf("step %s: %w", step.ID, err)
		}

		state.Steps[idx].Status = "done"
		r.persistProgress(ctx, state, "running")
	}

	report, _ := state.StepOutputs["report"].(string)
	if report == "" {
		return "", ErrEmptyReport
	}
	r.writeBackCard(ctx, state)
	return report, nil
}

func (r *Runner) persistProgress(ctx context.Context, state *RunState, status string) {
	if state.Store == nil || state.ResearchID <= 0 {
		return
	}
	_ = state.Store.UpdateResearchProgress(ctx, state.ResearchID, status, state.Query, state.Steps, state.Sources.All(), state.Plan, state.Result, state.Tokens)
}

func (r *Runner) buildPipeline() []Step {
	return []Step{
		{ID: "ground", Name: "Ground context", Run: r.stepGround},
		{ID: "resolve_refs", Name: "Resolve URL references", Run: r.stepResolveRefs},
		{ID: "plan", Name: "Plan research questions", Run: r.stepPlan},
		{ID: "search", Name: "Search per question", Run: r.stepSearch},
		{ID: "read", Name: "Fetch search results", Run: r.stepRead},
		{ID: "verify_claims", Name: "Verify claims", Run: r.stepVerifyClaims},
		{ID: "landscape", Name: "Analyze landscape", Run: r.stepLandscape},
		{ID: "verdict", Name: "Synthesize verdict", Run: r.stepVerdict},
		{ID: "report", Name: "Generate final report", Run: r.stepReport},
	}
}

// 1. ground — load capture; restate claims/references.
func (r *Runner) stepGround(ctx context.Context, state *RunState) error {
	if state.Card.CaptureID != nil && state.Store != nil {
		cap, err := state.Store.GetCapture(ctx, *state.Card.CaptureID)
		if err == nil {
			state.Capture = &cap
			text := cap.Text
			if text == "" {
				text = cap.Description
			}
			if text != "" {
				title := cap.Title
				if title == "" {
					title = state.Card.Title
				}
				u := cap.SourceURL
				if u == "" {
					u = state.Card.SourceURL
				}
				state.Sources.Add(u, title, "capture", text, cap.CreatedAt)
			}
		}
	}

	if len(state.References) == 0 && len(state.Card.References) > 0 {
		state.References = state.Card.References
	}

	state.StepOutputs["ground"] = map[string]any{
		"claims":           state.Card.Claims,
		"references_count": len(state.References),
	}
	state.SetNote("ground", fmt.Sprintf("Grounded context (%d references)", len(state.References)))
	return nil
}

// 2. resolve_refs — fetch every URL reference directly before web search.
func (r *Runner) stepResolveRefs(ctx context.Context, state *RunState) error {
	var notes []string
	refs := state.References
	if len(refs) == 0 {
		refs = state.Card.References
	}

	for _, ref := range refs {
		u := strings.TrimSpace(ref.URL)
		if u == "" {
			continue
		}
		if state.Sources.HasURL(u) {
			continue
		}
		f := r.fetcher().FetchWithContext(ctx, capture.Share{Kind: capture.KindLink, URL: u})
		if f.Err != nil || strings.TrimSpace(f.Text) == "" {
			notes = append(notes, fmt.Sprintf("failed to fetch %s", u))
			continue
		}
		title := ref.Label
		if title == "" {
			title = f.Title
		}
		if title == "" {
			title = u
		}
		state.Sources.Add(u, title, "reference", f.Text, time.Now())
	}

	if len(notes) > 0 {
		state.SetNote("resolve_refs", strings.Join(notes, "; "))
	}
	return nil
}

// 3. plan — decompose into 3-5 sub-questions using research_plan model.
func (r *Runner) stepPlan(ctx context.Context, state *RunState) error {
	var b strings.Builder
	b.WriteString(`You are a research planning assistant. Decompose this research topic into 3 to 5 targeted sub-questions to investigate key claims, technical details, alternatives, pricing/open-source viability, and maintenance.
Reply with ONLY a strict JSON object with this exact structure:
{
  "questions": [
    {
      "id": "Q1",
      "question": "Clear question to answer?",
      "query": "concise web search query",
      "prefer_domains": ["github.com", "docs.python.org"]
    }
  ]
}

Topic Context:
Title: ` + state.Card.Title + "\n")
	tldr := state.Card.TLDR
	if tldr == "" {
		tldr = state.Card.Summary
	}
	if tldr != "" {
		b.WriteString("TL;DR / Summary: " + tldr + "\n")
	}
	if len(state.Card.Claims) > 0 {
		b.WriteString("Claims:\n")
		for _, cl := range state.Card.Claims {
			b.WriteString("- " + cl + "\n")
		}
	}
	if len(state.Card.OpenQuestions) > 0 {
		b.WriteString("Open Questions from Triage:\n")
		for _, q := range state.Card.OpenQuestions {
			b.WriteString("- " + q + "\n")
		}
	}
	if len(state.References) > 0 {
		b.WriteString("References:\n")
		for _, ref := range state.References {
			b.WriteString("- " + ref.Label + " (" + ref.URL + ")\n")
		}
	}
	if existingSources := state.Sources.All(); len(existingSources) > 0 {
		b.WriteString("Already grounded sources:\n")
		for _, s := range existingSources {
			b.WriteString("- " + s.Title + " (" + s.URL + ")\n")
		}
	}

	client := r.planClient()
	if client == nil {
		return errors.New("research: no LLM client configured for plan")
	}

	out, err := client.Ask(ctx, b.String())
	if err == nil {
		out = strings.TrimSpace(out)
		// Clean markdown code fence if present
		if strings.HasPrefix(out, "```") {
			lines := strings.Split(out, "\n")
			if len(lines) >= 3 {
				out = strings.Join(lines[1:len(lines)-1], "\n")
			}
		}
		var plan port.ResearchPlan
		if jerr := json.Unmarshal([]byte(out), &plan); jerr == nil && len(plan.Questions) > 0 {
			maxQ := r.maxQuestions()
			if len(plan.Questions) > maxQ {
				plan.Questions = plan.Questions[:maxQ]
			}
			state.Plan = &plan
			state.Query = plan.Questions[0].Query
			state.SetNote("plan", fmt.Sprintf("Planned %d questions", len(plan.Questions)))
			return nil
		}
	}

	// Fallback to single-query behavior from Prompt 8 (do not fail)
	singleQuery, qerr := r.buildSingleQuery(ctx, state.Card, state.References)
	if qerr != nil {
		singleQuery = state.Card.Title
	}
	state.Plan = &port.ResearchPlan{
		Questions: []port.ResearchQuestion{
			{ID: "Q1", Question: "General investigation", Query: singleQuery},
		},
	}
	state.Query = singleQuery
	state.SetNote("plan", "Planning fallback to single query")
	return nil
}

// 4. search — execute searches per question, rank preferred domains, dedupe against registry.
func (r *Runner) stepSearch(ctx context.Context, state *RunState) error {
	if state.Plan == nil || len(state.Plan.Questions) == 0 {
		state.Plan = &port.ResearchPlan{
			Questions: []port.ResearchQuestion{{ID: "Q1", Question: "General", Query: state.Card.Title}},
		}
	}

	questionURLs := make(map[string][]string)
	totalResultsFound := 0

	for _, q := range state.Plan.Questions {
		urls, err := r.search(ctx, q.Query, state.Card.SourceURL)
		if err != nil || len(urls) == 0 {
			continue
		}
		totalResultsFound += len(urls)

		// Rank preferred domains first
		ranked := rankURLs(urls, q.PreferDomains)

		// Filter out URLs already in registry
		var deduped []string
		for _, u := range ranked {
			if !state.Sources.HasURL(u) {
				deduped = append(deduped, u)
			}
		}
		questionURLs[q.ID] = deduped
	}

	if totalResultsFound == 0 {
		// If SearXNG returned 0 results but references or capture already produced text, continue!
		if len(state.Sources.All()) > 0 {
			state.SetNote("search", "0 search results; continuing with grounded sources")
			state.StepOutputs["question_urls"] = questionURLs
			return nil
		}
		return ErrNoSearchResults
	}

	state.StepOutputs["question_urls"] = questionURLs
	return nil
}

func rankURLs(urls []string, preferDomains []string) []string {
	if len(preferDomains) == 0 {
		return urls
	}
	var preferred []string
	var standard []string
	for _, u := range urls {
		isPref := false
		lowerU := strings.ToLower(u)
		for _, dom := range preferDomains {
			dom = strings.ToLower(strings.TrimSpace(dom))
			if dom != "" && strings.Contains(lowerU, dom) {
				isPref = true
				break
			}
		}
		if isPref {
			preferred = append(preferred, u)
		} else {
			standard = append(standard, u)
		}
	}
	return append(preferred, standard...)
}

// 5. read — fetch budget split fairly across questions (round-robin) up to MaxFetches cap.
func (r *Runner) stepRead(ctx context.Context, state *RunState) error {
	questionURLs, _ := state.StepOutputs["question_urls"].(map[string][]string)
	if questionURLs == nil {
		questionURLs = make(map[string][]string)
	}

	maxFetches := r.maxFetches()
	qIndices := make(map[string]int)
	seenInRead := make(map[string]bool)
	fetchesDone := 0
	var notes []string

	for fetchesDone < maxFetches {
		progress := false
		for _, q := range state.Plan.Questions {
			if fetchesDone >= maxFetches {
				break
			}
			urls := questionURLs[q.ID]
			idx := qIndices[q.ID]
			for idx < len(urls) {
				u := urls[idx]
				idx++
				qIndices[q.ID] = idx

				if seenInRead[u] || state.Sources.HasURL(u) {
					// Mark that this source serves question q.ID as well
					state.Sources.Add(u, "", "search", "", time.Now(), q.ID)
					continue
				}

				seenInRead[u] = true
				fetchesDone++
				progress = true

				f := r.fetcher().FetchWithContext(ctx, capture.Share{Kind: capture.KindLink, URL: u})
				if f.Err != nil || strings.TrimSpace(f.Text) == "" {
					notes = append(notes, fmt.Sprintf("failed to read %s", u))
				} else {
					title := f.Title
					if title == "" {
						title = u
					}
					state.Sources.Add(u, title, "search", f.Text, time.Now(), q.ID)
				}
				break // round-robin to next question
			}
		}
		if !progress {
			break
		}
	}

	if len(notes) > 0 {
		state.SetNote("read", strings.Join(notes, "; "))
	}

	if len(state.Sources.All()) == 0 {
		return ErrNoFetchableText
	}
	return nil
}

// 6. verify_claims — evaluates each Triage claim; downgrades verdicts without valid S#.
func (r *Runner) stepVerifyClaims(ctx context.Context, state *RunState) error {
	if len(state.Card.Claims) == 0 {
		state.Result.Claims = []port.ClaimVerdict{}
		state.SetNote("verify_claims", "No claims to verify")
		return nil
	}

	client := r.synthesisClient()
	if client == nil {
		return errors.New("research: no LLM client configured for verify_claims")
	}

	var b strings.Builder
	b.WriteString(`You are a fact-checking assistant. Evaluate each claim extracted from the original capture against the collected research sources.
For each claim, determine if it is "supported", "disputed", or "unverified".
Provide a 1-line rationale and list the relevant source IDs (e.g. ["S1", "S2"]). If no source supports or disputes the claim, status MUST be "unverified" with empty sources [].

Claims to verify:
`)
	for _, c := range state.Card.Claims {
		b.WriteString(fmt.Sprintf("- %s\n", c))
	}
	b.WriteString("\nAvailable Sources:\n")
	b.WriteString(state.Sources.FormatForSynthesis())
	b.WriteString("\nReply with ONLY a strict JSON object with this exact structure:\n" + schemaClaims + "\n")

	var resp struct {
		Claims []port.ClaimVerdict `json:"claims"`
	}
	err := askJSON(ctx, client, b.String(), &resp, schemaClaims)
	if err != nil {
		state.SetNote("verify_claims", fmt.Sprintf("Failed to parse claims verification: %v", err))
		for _, c := range state.Card.Claims {
			resp.Claims = append(resp.Claims, port.ClaimVerdict{
				Claim:     c,
				Status:    "unverified",
				Rationale: "Verification unavailable",
				Sources:   []string{},
			})
		}
	}

	validSourceIDs := make(map[string]bool)
	for _, s := range state.Sources.All() {
		validSourceIDs[s.ID] = true
	}

	received := make(map[string]port.ClaimVerdict)
	for _, cv := range resp.Claims {
		received[strings.TrimSpace(strings.ToLower(cv.Claim))] = cv
	}

	var finalVerdicts []port.ClaimVerdict
	for _, origClaim := range state.Card.Claims {
		norm := strings.TrimSpace(strings.ToLower(origClaim))
		v, ok := received[norm]
		if !ok {
			matched := false
			for k, cv := range received {
				if strings.Contains(k, norm) || strings.Contains(norm, k) {
					v = cv
					matched = true
					break
				}
			}
			if !matched {
				v = port.ClaimVerdict{
					Claim:     origClaim,
					Status:    "unverified",
					Rationale: "No analysis returned",
					Sources:   []string{},
				}
			}
		}
		v.Claim = origClaim

		// Enforce: filter sources against valid sources
		var validSources []string
		for _, sid := range v.Sources {
			sid = strings.TrimSpace(sid)
			if validSourceIDs[sid] {
				validSources = append(validSources, sid)
			}
		}
		v.Sources = validSources

		// Normalize status
		status := strings.ToLower(strings.TrimSpace(v.Status))
		if status != "supported" && status != "disputed" && status != "unverified" {
			status = "unverified"
		}

		// Enforce: claims citing no valid S# must be unverified
		if len(v.Sources) == 0 && (status == "supported" || status == "disputed") {
			status = "unverified"
			if v.Rationale == "" {
				v.Rationale = "Unverified (no valid sources cited)"
			} else if !strings.Contains(v.Rationale, "no valid sources") {
				v.Rationale = strings.TrimSpace(v.Rationale) + " (Downgraded: no valid sources cited)"
			}
		}
		v.Status = status
		finalVerdicts = append(finalVerdicts, v)
	}

	state.Result.Claims = finalVerdicts
	state.StepOutputs["verify_claims"] = finalVerdicts
	if _, ok := state.Notes["verify_claims"]; !ok {
		state.SetNote("verify_claims", fmt.Sprintf("Verified %d claims", len(finalVerdicts)))
	}
	return nil
}

// 7. landscape — up to 5 alternatives/prior art.
func (r *Runner) stepLandscape(ctx context.Context, state *RunState) error {
	client := r.synthesisClient()
	if client == nil {
		return errors.New("research: no LLM client configured for landscape")
	}

	var b strings.Builder
	b.WriteString(`You are a competitive and technology landscape analyst. Identify up to 5 alternatives, competitors, or prior art related to this topic.
For each item, specify its name, optional URL, a 1-line summary, how it differs from the topic, and relevant source IDs (e.g. ["S1"]).

Topic: ` + state.Card.Title + "\n")
	if state.Card.Summary != "" {
		b.WriteString("Summary: " + state.Card.Summary + "\n")
	}
	b.WriteString("\nAvailable Sources:\n")
	b.WriteString(state.Sources.FormatForSynthesis())
	b.WriteString("\nReply with ONLY a strict JSON object with this exact structure:\n" + schemaLandscape + "\n")

	var resp struct {
		Landscape []port.LandscapeItem `json:"landscape"`
	}
	err := askJSON(ctx, client, b.String(), &resp, schemaLandscape)
	if err != nil {
		state.SetNote("landscape", fmt.Sprintf("Failed to parse landscape: %v", err))
		resp.Landscape = []port.LandscapeItem{}
	}

	validSourceIDs := make(map[string]bool)
	for _, s := range state.Sources.All() {
		validSourceIDs[s.ID] = true
	}

	if len(resp.Landscape) > 5 {
		resp.Landscape = resp.Landscape[:5]
	}
	for i := range resp.Landscape {
		var validSources []string
		for _, sid := range resp.Landscape[i].Sources {
			sid = strings.TrimSpace(sid)
			if validSourceIDs[sid] {
				validSources = append(validSources, sid)
			}
		}
		resp.Landscape[i].Sources = validSources
	}

	state.Result.Landscape = resp.Landscape
	state.StepOutputs["landscape"] = resp.Landscape
	if _, ok := state.Notes["landscape"]; !ok {
		state.SetNote("landscape", fmt.Sprintf("Identified %d alternatives/prior art", len(resp.Landscape)))
	}
	return nil
}

// 8. verdict — strategic recommendation, risks, confidence, next actions (research_synthesis).
func (r *Runner) stepVerdict(ctx context.Context, state *RunState) error {
	client := r.synthesisClient()
	if client == nil {
		return errors.New("research: no LLM client configured for verdict")
	}

	var b strings.Builder
	b.WriteString(`You are a research synthesis and executive decision assistant. Provide a strategic verdict on this card based on the findings, claims verification, and competitive landscape.
Recommendation must be exactly "pursue", "watch", or "skip".
Confidence must be "high", "medium", or "low".
Next actions must contain 3 to 5 concrete, actionable steps.
Suggested horizon must be one of: "short-term", "medium-term", "long-term", "lifetime" (or omit if unsure).

Topic Context:
Title: ` + state.Card.Title + "\n")
	if state.Card.Summary != "" {
		b.WriteString("Summary: " + state.Card.Summary + "\n")
	}
	if len(state.Result.Claims) > 0 {
		b.WriteString("\nClaim Verifications:\n")
		for _, cv := range state.Result.Claims {
			b.WriteString(fmt.Sprintf("- %s: %s (%s)\n", cv.Claim, cv.Status, cv.Rationale))
		}
	}
	if len(state.Result.Landscape) > 0 {
		b.WriteString("\nCompetitive Landscape:\n")
		for _, li := range state.Result.Landscape {
			b.WriteString(fmt.Sprintf("- %s: %s (diff: %s)\n", li.Name, li.OneLiner, li.HowItDiffers))
		}
	}
	b.WriteString("\nSources:\n")
	b.WriteString(state.Sources.FormatForSynthesis())
	b.WriteString("\nReply with ONLY a strict JSON object with this exact structure:\n" + schemaVerdict + "\n")

	var resp port.ResearchVerdict
	err := askJSON(ctx, client, b.String(), &resp, schemaVerdict)
	if err != nil {
		state.SetNote("verdict", fmt.Sprintf("Verdict failed: %v", err))
		return fmt.Errorf("verdict parse failed: %w", err)
	}

	rec := strings.ToLower(strings.TrimSpace(resp.Recommendation))
	switch rec {
	case "pursue", "watch", "skip":
		resp.Recommendation = rec
	default:
		resp.Recommendation = "watch"
	}

	conf := strings.ToLower(strings.TrimSpace(resp.Confidence))
	switch conf {
	case "high", "medium", "low":
		resp.Confidence = conf
	default:
		resp.Confidence = "medium"
	}

	if len(resp.NextActions) > 5 {
		resp.NextActions = resp.NextActions[:5]
	}
	if len(resp.NextActions) < 3 {
		if len(resp.NextActions) == 0 {
			resp.NextActions = []string{
				"Review research findings",
				"Evaluate technical feasibility",
				"Decide next milestone",
			}
		} else if len(resp.NextActions) == 1 {
			resp.NextActions = append(resp.NextActions, "Assess integration requirements", "Review community feedback")
		} else if len(resp.NextActions) == 2 {
			resp.NextActions = append(resp.NextActions, "Define implementation roadmap")
		}
	}

	if resp.SuggestedHorizon != "" && !port.ValidHorizon(resp.SuggestedHorizon) {
		resp.SuggestedHorizon = ""
	}

	state.Result.Verdict = &resp
	state.StepOutputs["verdict"] = resp
	state.SetNote("verdict", fmt.Sprintf("Verdict: %s (confidence: %s)", resp.Recommendation, resp.Confidence))
	return nil
}

// 9. report — renders deterministic markdown report from structured outputs.
func (r *Runner) stepReport(ctx context.Context, state *RunState) error {
	var b strings.Builder

	b.WriteString(fmt.Sprintf("# Research: %s\n\n", state.Card.Title))

	// Verdict section
	if state.Result != nil && state.Result.Verdict != nil {
		v := state.Result.Verdict
		b.WriteString("## Executive Verdict\n\n")
		b.WriteString(fmt.Sprintf("- **Recommendation:** `%s` (Confidence: `%s`)\n", strings.ToUpper(v.Recommendation), strings.ToUpper(v.Confidence)))
		if v.ForWhom != "" {
			b.WriteString(fmt.Sprintf("- **For Whom:** %s\n", v.ForWhom))
		}
		if len(v.Risks) > 0 {
			b.WriteString("\n### Key Risks\n")
			for _, rk := range v.Risks {
				b.WriteString(fmt.Sprintf("- %s\n", rk))
			}
		}
		if len(v.NextActions) > 0 {
			b.WriteString("\n### Recommended Next Actions\n")
			for i, act := range v.NextActions {
				b.WriteString(fmt.Sprintf("%d. %s\n", i+1, act))
			}
		}
		b.WriteString("\n")
	}

	// Claim Verification section
	if state.Result != nil && len(state.Result.Claims) > 0 {
		b.WriteString("## Claim Verification\n\n")
		for _, cv := range state.Result.Claims {
			badge := strings.ToUpper(cv.Status)
			citations := ""
			if len(cv.Sources) > 0 {
				var citeParts []string
				for _, sid := range cv.Sources {
					citeParts = append(citeParts, fmt.Sprintf("[%s]", sid))
				}
				citations = " " + strings.Join(citeParts, " ")
			}
			b.WriteString(fmt.Sprintf("- **%s** — `[%s]`%s\n", cv.Claim, badge, citations))
			if cv.Rationale != "" {
				b.WriteString(fmt.Sprintf("  %s\n", cv.Rationale))
			}
		}
		b.WriteString("\n")
	}

	// Competitive Landscape & Alternatives
	if state.Result != nil && len(state.Result.Landscape) > 0 {
		b.WriteString("## Competitive Landscape & Alternatives\n\n")
		for _, li := range state.Result.Landscape {
			citations := ""
			if len(li.Sources) > 0 {
				var citeParts []string
				for _, sid := range li.Sources {
					citeParts = append(citeParts, fmt.Sprintf("[%s]", sid))
				}
				citations = " " + strings.Join(citeParts, " ")
			}
			nameHeader := li.Name
			if li.URL != "" {
				nameHeader = fmt.Sprintf("[%s](%s)", li.Name, li.URL)
			}
			b.WriteString(fmt.Sprintf("### %s%s\n", nameHeader, citations))
			if li.OneLiner != "" {
				b.WriteString(fmt.Sprintf("%s\n\n", li.OneLiner))
			}
			if li.HowItDiffers != "" {
				b.WriteString(fmt.Sprintf("**How it differs:** %s\n\n", li.HowItDiffers))
			}
		}
	}

	// Questions & Findings
	if state.Plan != nil && len(state.Plan.Questions) > 0 {
		b.WriteString("## Questions & Findings\n\n")
		for _, q := range state.Plan.Questions {
			b.WriteString(fmt.Sprintf("### %s: %s\n", q.ID, q.Question))
			b.WriteString(fmt.Sprintf("Search query: `%s`\n\n", q.Query))
		}
	}

	// Sources section
	b.WriteString("## Sources & Citations\n\n")
	b.WriteString(state.Sources.FormatCitations())
	b.WriteString("\n")

	rendered := strings.TrimSpace(b.String())
	state.StepOutputs["report"] = rendered
	state.SetNote("report", "Report compiled successfully")
	return nil
}

func (r *Runner) writeBackCard(ctx context.Context, state *RunState) {
	if state.Store == nil || state.Card.ID <= 0 || state.Result == nil || state.Result.Verdict == nil {
		return
	}
	verdict := state.Result.Verdict

	card, err := state.Store.GetCard(ctx, state.Card.ID)
	if err != nil {
		return
	}

	patch := port.CardPatch{
		ResearchVerdict:    &verdict.Recommendation,
		ResearchConfidence: &verdict.Confidence,
	}
	if verdict.SuggestedHorizon != "" && port.ValidHorizon(verdict.SuggestedHorizon) {
		patch.SuggestedHorizon = &verdict.SuggestedHorizon
	}
	if len(verdict.SuggestedTags) > 0 {
		patch.SuggestedTags = &verdict.SuggestedTags
	}

	// proposed_actions ← verdict.next_actions
	// replace only if the user hasn't edited actions; track actions_source: "triage"|"research"|"user"
	if card.ActionsSource != "user" && len(verdict.NextActions) > 0 {
		patch.ProposedActions = &verdict.NextActions
		src := "research"
		patch.ActionsSource = &src
	}

	_, _ = state.Store.UpdateCard(ctx, state.Card.ID, patch)
}

const schemaClaims = `{
  "claims": [
    {
      "claim": "claim text",
      "status": "supported | disputed | unverified",
      "rationale": "one line rationale",
      "sources": ["S1"]
    }
  ]
}`

const schemaLandscape = `{
  "landscape": [
    {
      "name": "Alternative name",
      "url": "https://example.com",
      "one_liner": "Brief summary",
      "how_it_differs": "Key differences",
      "sources": ["S1"]
    }
  ]
}`

const schemaVerdict = `{
  "recommendation": "pursue | watch | skip",
  "for_whom": "Target audience",
  "risks": ["Risk 1", "Risk 2"],
  "confidence": "high | medium | low",
  "next_actions": ["Action 1", "Action 2", "Action 3"],
  "suggested_horizon": "short-term",
  "suggested_tags": ["tag1", "tag2"]
}`

func extractJSON(s string) string {
	s = strings.TrimSpace(s)
	if idx := strings.Index(s, "```json"); idx != -1 {
		s = s[idx+len("```json"):]
		if end := strings.Index(s, "```"); end != -1 {
			s = s[:end]
		}
	} else if idx := strings.Index(s, "```"); idx != -1 {
		s = s[idx+3:]
		if end := strings.Index(s, "```"); end != -1 {
			s = s[:end]
		}
	}
	s = strings.TrimSpace(s)
	first := strings.IndexByte(s, '{')
	last := strings.LastIndexByte(s, '}')
	if first != -1 && last > first {
		return s[first : last+1]
	}
	return s
}

func askJSON(ctx context.Context, client *analyze.Client, prompt string, target any, schemaDesc string) error {
	out, err := client.Ask(ctx, prompt)
	if err != nil {
		return err
	}
	cleaned := extractJSON(out)
	if jerr := json.Unmarshal([]byte(cleaned), target); jerr == nil {
		return nil
	}

	repairPrompt := fmt.Sprintf(
		"The previous output was not valid JSON conforming to the schema.\nError: Output could not be parsed as JSON.\nPrevious output:\n%s\n\nPlease return ONLY a valid JSON object conforming to this schema:\n%s",
		out, schemaDesc,
	)
	retryOut, rerr := client.Ask(ctx, repairPrompt)
	if rerr != nil {
		return rerr
	}
	cleanedRetry := extractJSON(retryOut)
	return json.Unmarshal([]byte(cleanedRetry), target)
}

// buildSingleQuery derives a single search query fallback.
func (r *Runner) buildSingleQuery(ctx context.Context, card port.Card, refs []port.Reference) (string, error) {
	var b strings.Builder
	b.WriteString("Create a concise web search query for investigating this idea. Reply with one line: the query.\n\n")
	b.WriteString("Title: " + card.Title + "\n")
	if card.TLDR != "" {
		b.WriteString("TL;DR: " + card.TLDR + "\n")
	} else if card.Summary != "" {
		b.WriteString("Summary: " + card.Summary + "\n")
	}
	if len(card.Claims) > 0 {
		b.WriteString("Claims: " + strings.Join(card.Claims, "; ") + "\n")
	}
	if len(refs) > 0 {
		var labels []string
		for _, ref := range refs {
			if ref.Label != "" {
				labels = append(labels, ref.Label)
			}
		}
		if len(labels) > 0 {
			b.WriteString("References: " + strings.Join(labels, ", ") + "\n")
		}
	}

	client := r.planClient()
	if client == nil {
		return "", errors.New("research: no LLM client configured for plan")
	}
	out, err := client.Ask(ctx, b.String())
	if err != nil {
		return "", err
	}
	for _, line := range strings.Split(out, "\n") {
		if line = strings.TrimSpace(line); line != "" {
			return line, nil
		}
	}
	return "", ErrEmptyQuery
}

// search queries the SearXNG JSON API.
func (r *Runner) search(ctx context.Context, query, fallbackURL string) ([]string, error) {
	var urls []string
	if r.SearchURL != "" {
		u := fmt.Sprintf("%s?q=%s&format=json", r.SearchURL, url.QueryEscape(query))
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
		if err != nil {
			return nil, err
		}
		resp, err := r.Client.Do(req)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, err
		}
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("search status %d", resp.StatusCode)
		}
		urls, err = parseSearch(body)
		if err != nil {
			return nil, err
		}
	}
	return urls, nil
}

func parseSearch(body []byte) ([]string, error) {
	var resp searchResp
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("search JSON: %w", err)
	}
	var urls []string
	for _, res := range resp.Results {
		if res.URL != "" {
			urls = append(urls, res.URL)
		}
	}
	return urls, nil
}
