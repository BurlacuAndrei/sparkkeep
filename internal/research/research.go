// Package research runs bounded, step-based investigation passes on a card:
// ground (capture + triage context) → resolve_refs (URL references) →
// search (query build + SearXNG) → read (fetch search results) →
// synthesize (LLM report with [S#] citations).
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
	defaultMaxResults = 6
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
	// ErrNoSearchResults is returned when SearXNG yields 0 URLs and no other sources exist.
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
	MaxResults      int             // max search URLs to read (default 6)
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
	return report, nil
}

func (r *Runner) persistProgress(ctx context.Context, state *RunState, status string) {
	if state.Store == nil || state.ResearchID <= 0 {
		return
	}
	_ = state.Store.UpdateResearchProgress(ctx, state.ResearchID, status, state.Query, state.Steps, state.Sources.All(), state.Tokens)
}

func (r *Runner) buildPipeline() []Step {
	return []Step{
		{ID: "ground", Name: "Ground context", Run: r.stepGround},
		{ID: "resolve_refs", Name: "Resolve URL references", Run: r.stepResolveRefs},
		{ID: "search", Name: "Build query and search", Run: r.stepSearch},
		{ID: "read", Name: "Fetch search results", Run: r.stepRead},
		{ID: "synthesize", Name: "Synthesize report", Run: r.stepSynthesize},
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

// 3. search — build query from TL;DR + claims + references, search SearXNG, dedupe.
func (r *Runner) stepSearch(ctx context.Context, state *RunState) error {
	query, err := r.buildQuery(ctx, state.Card, state.References)
	if err != nil {
		return fmt.Errorf("build query: %w", err)
	}
	state.Query = query

	urls, err := r.search(ctx, query, state.Card.SourceURL)
	if err != nil || len(urls) == 0 {
		// If SearXNG returned 0 results but references or capture already produced text, continue!
		if len(state.Sources.All()) > 0 {
			state.SetNote("search", "0 search results; continuing with grounded sources")
			state.StepOutputs["search_urls"] = []string{}
			return nil
		}
		if err != nil {
			return fmt.Errorf("search: %w", err)
		}
		return ErrNoSearchResults
	}

	// Dedupe against already-fetched URLs in registry
	var deduplicated []string
	for _, u := range urls {
		if !state.Sources.HasURL(u) {
			deduplicated = append(deduplicated, u)
		}
	}
	state.StepOutputs["search_urls"] = deduplicated
	return nil
}

// 4. read — fetch top N search results into the registry.
func (r *Runner) stepRead(ctx context.Context, state *RunState) error {
	rawURLs, _ := state.StepOutputs["search_urls"].([]string)
	limit := r.maxResults()
	if len(rawURLs) > limit {
		rawURLs = rawURLs[:limit]
	}

	var notes []string
	for _, u := range rawURLs {
		f := r.fetcher().FetchWithContext(ctx, capture.Share{Kind: capture.KindLink, URL: u})
		if f.Err != nil || strings.TrimSpace(f.Text) == "" {
			notes = append(notes, fmt.Sprintf("failed to read %s", u))
			continue
		}
		title := f.Title
		if title == "" {
			title = u
		}
		state.Sources.Add(u, title, "search", f.Text, time.Now())
	}

	if len(notes) > 0 {
		state.SetNote("read", strings.Join(notes, "; "))
	}

	if len(state.Sources.All()) == 0 {
		return ErrNoFetchableText
	}
	return nil
}

// 5. synthesize — research_synthesis model cites [S#] sources.
func (r *Runner) stepSynthesize(ctx context.Context, state *RunState) error {
	sourcesText := state.Sources.FormatForSynthesis()
	if strings.TrimSpace(sourcesText) == "" {
		return ErrNoFetchableText
	}

	tldr := state.Card.TLDR
	if tldr == "" {
		tldr = state.Card.Summary
	}
	claimsStr := strings.Join(state.Card.Claims, "; ")

	prompt := fmt.Sprintf(`Synthesize the research findings into an actionable markdown report.
You MUST cite sources using their bracketed identifiers (e.g. [S1], [S2]) throughout the report.
Structure the report with the following exact sections:
## What the source says
## Findings
## Sources
## Next steps

Context:
Title: %s
Summary / TLDR: %s
Claims: %s

Sources:
%s`, state.Card.Title, tldr, claimsStr, sourcesText)

	client := r.synthesisClient()
	if client == nil {
		return errors.New("research: no LLM client configured for synthesis")
	}

	out, err := client.Ask(ctx, prompt)
	if err != nil {
		return err
	}
	out = strings.TrimSpace(out)
	if out == "" {
		return ErrEmptyReport
	}
	if i := strings.Index(out, "## "); i > 0 {
		out = out[i:]
	}
	state.StepOutputs["report"] = out
	return nil
}

// buildQuery derives one search query from the card via the plan LLM.
func (r *Runner) buildQuery(ctx context.Context, card port.Card, refs []port.Reference) (string, error) {
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
