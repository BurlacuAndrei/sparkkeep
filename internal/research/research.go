// Package research runs one deterministic, bounded "investigate this" pass
// on a card: build query (LLM) → search (SearXNG JSON) → fetch top N →
// clip to budget → one synthesis LLM call. It is a pure function of a card;
// persisting the findings row and notifying a channel is the caller's job.
// Hard stops everywhere, no agents, no recursion; any failure surfaces as an
// error so core can mark the research row "failed".
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
	defaultClipChars  = 8000
	// Whole-run ceiling: includes two LLM calls (query, synthesis over real
	// sourced text) plus search+fetch. CPU-only boxes need the headroom.
	defaultTimeout = 1500 * time.Second
)

// searchResp mirrors the SearXNG JSON API slice the pipeline consumes.
type searchResp struct {
	Results []struct {
		URL string `json:"url"`
	} `json:"results"`
}

type Runner struct {
	SearchURL  string          // e.g. http://localhost:8080/search or cleared for dev
	Client     *http.Client    // search client
	LLM        *analyze.Client // LLM reuse
	Fetcher    capture.Fetcher // fetcher for scraping search result URLs
	MaxResults int             // 6
	ClipChars  int             // 8000
	Timeout    time.Duration   // 120s
}

// New returns a Runner with the design defaults. Tests override the knobs
// directly (small MaxResults, short Timeout) so they run fast.
func New(cfg config.Config, llm *analyze.Client) *Runner {
	return &Runner{
		SearchURL:  cfg.SearchURL,
		Client:     &http.Client{Timeout: defaultTimeout},
		LLM:        llm,
		Fetcher:    capture.Capture{HeadlessEnabled: cfg.HeadlessEnabled, ChromeBin: cfg.ChromeBin, YtDlpBin: cfg.YtDlpBin},
		MaxResults: defaultMaxResults,
		ClipChars:  defaultClipChars,
		Timeout:    defaultTimeout,
	}
}

// Run executes one research pass for a card and returns the findings
// markdown (not yet persisted or notified — caller/core decides).
func (r *Runner) Run(ctx context.Context, card port.Card) (string, error) {
	timeout := r.Timeout
	if timeout <= 0 {
		timeout = defaultTimeout
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	query, err := r.buildQuery(ctx, card)
	if err != nil {
		return "", fmt.Errorf("research: build query: %w", err)
	}
	urls, err := r.search(ctx, query, card.SourceURL)
	if err != nil {
		return "", fmt.Errorf("research: search: %w", err)
	}
	if n := r.maxResults(); len(urls) > n {
		urls = urls[:n]
	}
	clip := r.fetchAndClip(urls)
	if clip == "" {
		return "", errors.New("research: no fetchable text")
	}
	report, err := r.synthesize(ctx, card, urls, clip)
	if err != nil {
		return "", fmt.Errorf("research: synthesize: %w", err)
	}
	return report, nil
}

func (r *Runner) maxResults() int {
	if r.MaxResults > 0 {
		return r.MaxResults
	}
	return defaultMaxResults
}

// buildQuery derives one search query from the card via a single LLM call.
// The answer is trimmed to its first non-empty line.
func (r *Runner) buildQuery(ctx context.Context, card port.Card) (string, error) {
	prompt := fmt.Sprintf("%s\n\nTitle: %s\nSummary: %s\nSource URL: %s",
		"Create a concise web search query for investigating this idea. Reply with one line: the query.",
		card.Title, card.Summary, card.SourceURL)
	out, err := r.LLM.Ask(ctx, prompt)
	if err != nil {
		return "", err
	}
	for _, line := range strings.Split(out, "\n") {
		if line = strings.TrimSpace(line); line != "" {
			return line, nil
		}
	}
	return "", errors.New("research: empty query from LLM")
}

// search queries the SearXNG JSON API and returns the result URLs. An empty
// SearchURL falls back to the card's own source for dev-only runs. An empty
// result set is an error — core marks the row failed.
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
	} else if fallbackURL != "" {
		urls = []string{fallbackURL}
	}
	if len(urls) == 0 {
		return nil, errors.New("no search results")
	}
	return urls, nil
}

// parseSearch extracts result URLs from a SearXNG JSON response body.
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

// fetchAndClip fetches each result URL sequentially (polite) and appends its
// text to a buffer capped at ClipChars total. Fetch errors are skipped, not
// fatal. ponytail: one flat budget, no per-source balancing — fine for a
// handful of sources.
func (r *Runner) fetcher() capture.Fetcher {
	if r.Fetcher != nil {
		return r.Fetcher
	}
	return capture.Capture{HeadlessEnabled: true}
}

func (r *Runner) fetchAndClip(urls []string) string {
	remaining := r.ClipChars
	if remaining <= 0 {
		remaining = defaultClipChars
	}
	var buf strings.Builder
	for _, u := range urls {
		if remaining <= 0 {
			break
		}
		f := r.fetcher().Fetch(capture.Share{Kind: capture.KindLink, URL: u})
		if f.Err != nil || f.Text == "" {
			continue
		}
		chunk := f.Text
		if len(chunk) > remaining {
			chunk = chunk[:remaining]
		}
		buf.WriteString(chunk)
		remaining -= len(chunk)
	}
	return buf.String()
}

// synthesize runs the single report LLM call. Any title prefix the model
// adds before the report structure is stripped.
func (r *Runner) synthesize(ctx context.Context, card port.Card, urls []string, clip string) (string, error) {
	prompt := fmt.Sprintf("Synthesize findings into actionable markdown report. Structure:\n## Findings, ## Sources, ## Next steps. Max 600 words. Source URLs:\n%s. Context: %s\n%s\n\nFetched text:\n%s",
		strings.Join(urls, ", "), card.Title, card.Summary, clip)
	out, err := r.LLM.Ask(ctx, prompt)
	if err != nil {
		return "", err
	}
	out = strings.TrimSpace(out)
	if out == "" {
		return "", errors.New("empty report from LLM")
	}
	if i := strings.Index(out, "## "); i > 0 {
		out = out[i:]
	}
	return out, nil
}
