// Package analyze turns a captured post into idea cards via one
// OpenAI-compatible chat completion call. Strict parse + validation so a
// malformed model response fails loudly and retryable.
package analyze

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	"sparkkeep/internal/capture"
	"sparkkeep/internal/config"
	"sparkkeep/internal/port"
)

type Idea struct {
	Title            string   `json:"title"`
	Summary          string   `json:"summary"`
	Horizon          string   `json:"horizon"` // "short-term" | "lifetime"
	Tags             []string `json:"tags"`
	Links            []string `json:"links"`
	ExecutiveSummary string   `json:"executive_summary,omitempty"`
	ValueProposition string   `json:"value_proposition,omitempty"`
	ProposedActions  []string `json:"proposed_actions,omitempty"`
}

type AnalysisResult struct {
	ExecutiveSummary string   `json:"executive_summary"`
	ValueProposition string   `json:"value_proposition"`
	ProposedActions  []string `json:"proposed_actions"`
	Cards            []Idea   `json:"cards"`
}

// ErrInvalidResponse means the model answer was not a valid, non-empty JSON
// response containing cards. Callers can retry.
var ErrInvalidResponse = errors.New("analyze: invalid model response")

type Client struct {
	BaseURL   string
	APIKey    string
	Model     string
	MaxTokens int
	HTTP      *http.Client
}

// New returns a client bound to the endpoint/key/model. A non-nil
// forceClient (tests) replaces the default client.
func New(cfg config.Config, forceClient *http.Client) *Client {
	c := &Client{
		BaseURL:   cfg.LLMBase,
		APIKey:    cfg.LLMKey,
		Model:     cfg.LLMModel,
		MaxTokens: cfg.MaxAnalyzeTokens,
		// No client-level response timeout: a local CPU-only Ollama model can
		// take far longer than any fixed bound, and this service tolerates
		// waiting. Ask() is bounded by the caller's ctx (research run has a
		// 1500s context); Analyze() is intentionally unbounded on response.
		// Connection establishment is still bounded so a dead endpoint fails
		// at connect instead of hanging a goroutine forever.
		HTTP: &http.Client{Transport: &http.Transport{
			DialContext: (&net.Dialer{Timeout: 30 * time.Second}).DialContext,
		}},
	}
	if forceClient != nil {
		c.HTTP = forceClient
	}
	if c.MaxTokens <= 0 {
		c.MaxTokens = 2048
	}
	return c
}

// doCompletion performs a single OpenAI-compatible chat completion call and
// returns the raw message content string. Shared by Analyze and Ask.
func (c *Client) doCompletion(ctx context.Context, body map[string]any) (string, error) {
	reqBody, err := json.Marshal(body)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/chat/completions", bytes.NewReader(reqBody))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.APIKey)
	}

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("analyze: LLM status %d", resp.StatusCode)
	}

	var chat struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &chat); err != nil {
		return "", err
	}
	if len(chat.Choices) == 0 || chat.Choices[0].Message.Content == "" {
		return "", ErrInvalidResponse
	}
	return chat.Choices[0].Message.Content, nil
}

// Analyze turns a Fetched payload into an AnalysisResult containing the briefing
// and idea cards. ErrInvalidResponse if the model answer is invalid or empty.
func (c *Client) Analyze(ctx context.Context, payload capture.Fetched) (AnalysisResult, error) {
	content, err := c.doCompletion(ctx, map[string]any{
		"model": c.Model,
		"messages": []map[string]string{
			{"role": "system", "content": "You are a curator that returns strict JSON."},
			{"role": "user", "content": promptFor(payload)},
		},
		"response_format": map[string]string{"type": "json_object"},
		"max_tokens":      c.MaxTokens,
		"temperature":     0.3,
	})
	if err != nil {
		return AnalysisResult{}, err
	}
	return ExtractJSON(content)
}

// Ask issues one chat completion for a free-text prompt and returns the raw
// message content. Research uses this for its query-build and synthesis
// calls, where the strict-JSON Analyze pipeline does not apply.
func (c *Client) Ask(ctx context.Context, prompt string) (string, error) {
	return c.doCompletion(ctx, map[string]any{
		"model": c.Model,
		"messages": []map[string]string{
			{"role": "system", "content": "You are a rigorous research assistant."},
			{"role": "user", "content": prompt},
		},
		"max_tokens":  c.MaxTokens,
		"temperature": 0.3,
	})
}

// ExtractJSON parses the model's answer into an AnalysisResult. It tolerates
// the new Action Engine briefing schema, legacy idea arrays, and markdown fences.
// Returns ErrInvalidResponse on any malformed/empty payload.
func ExtractJSON(s string) (AnalysisResult, error) {
	s = stripFences(s)
	if s == "" {
		return AnalysisResult{}, ErrInvalidResponse
	}
	switch s[0] {
	case '{':
		var rawMap map[string]json.RawMessage
		if err := json.Unmarshal([]byte(s), &rawMap); err != nil {
			return AnalysisResult{}, ErrInvalidResponse
		}

		var res AnalysisResult
		if ex, ok := rawMap["executive_summary"]; ok {
			_ = json.Unmarshal(ex, &res.ExecutiveSummary)
		}
		if vp, ok := rawMap["value_proposition"]; ok {
			_ = json.Unmarshal(vp, &res.ValueProposition)
		}
		if pa, ok := rawMap["proposed_actions"]; ok {
			_ = json.Unmarshal(pa, &res.ProposedActions)
		}
		if res.ProposedActions == nil {
			res.ProposedActions = []string{}
		}

		if cardsRaw, ok := rawMap["cards"]; ok {
			_ = json.Unmarshal(cardsRaw, &res.Cards)
		} else if ideasRaw, ok := rawMap["ideas"]; ok {
			_ = json.Unmarshal(ideasRaw, &res.Cards)
		} else if _, ok := rawMap["title"]; ok {
			var single Idea
			if err := json.Unmarshal([]byte(s), &single); err == nil {
				res.Cards = []Idea{single}
			}
		}

		if len(res.Cards) == 0 {
			return AnalysisResult{}, ErrInvalidResponse
		}
		if err := validateCards(res.Cards); err != nil {
			return AnalysisResult{}, err
		}
		if res.ExecutiveSummary == "" && len(res.Cards) > 0 {
			res.ExecutiveSummary = res.Cards[0].Summary
		}
		return res, nil

	case '[':
		var cards []Idea
		if err := json.Unmarshal([]byte(s), &cards); err != nil {
			return AnalysisResult{}, ErrInvalidResponse
		}
		if err := validateCards(cards); err != nil {
			return AnalysisResult{}, err
		}
		var exec string
		if len(cards) > 0 {
			exec = cards[0].Summary
		}
		return AnalysisResult{
			ExecutiveSummary: exec,
			ProposedActions:  []string{},
			Cards:            cards,
		}, nil

	default:
		return AnalysisResult{}, ErrInvalidResponse
	}
}

func validateCards(cards []Idea) error {
	if len(cards) == 0 {
		return ErrInvalidResponse
	}
	for _, i := range cards {
		if i.Horizon != port.HorizonShortTerm && i.Horizon != port.HorizonLifetime {
			return ErrInvalidResponse
		}
	}
	return nil
}

// stripFences removes ```json / ``` code fences and surrounding whitespace.
func stripFences(s string) string {
	var b strings.Builder
	for _, line := range strings.Split(s, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "```") {
			continue
		}
		b.WriteString(line)
		b.WriteString("\n")
	}
	return strings.TrimSpace(b.String())
}

func promptFor(payload capture.Fetched) string {
	return fmt.Sprintf(`You receive a captured internet post. You are the Sparkkeep Action Engine curator.
Your mission is to provide a concise "So What?" briefing and split the content into actionable idea cards.
Return ONLY a valid JSON object matching this schema:
{
  "executive_summary": "1-3 sentences answering 'What is this?'",
  "value_proposition": "1-2 sentences answering 'Why is this useful or important?'",
  "proposed_actions": ["2 to 3 concrete next steps or immediate action items"],
  "cards": [
    {
      "title": "short headline",
      "summary": "2-3 lines summarizing this distinct takeaway, project, or tool",
      "horizon": "short-term",
      "tags": ["lowercase tags, max 5"],
      "links": ["source links or references"]
    }
  ]
}

Rules:
- horizon must be "short-term" (actionable now/soon) or "lifetime" (long-horizon bucket item/trip/vision).
- One card per distinct idea or tool; if one idea, exactly one card; never merge; never drop.
- If media metadata exists, incorporate it into the briefing and cards.

Source:
TITLE: %s
DESCRIPTION: %s
BODY: %s
CAPTION: %s`, payload.Title, payload.Description, payload.Text, payload.Caption)
}
