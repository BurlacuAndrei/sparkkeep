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
	"net/http"
	"strings"

	"sparkkeep/internal/capture"
	"sparkkeep/internal/config"
	"sparkkeep/internal/port"
)

type Idea struct {
	Title   string   `json:"title"`
	Summary string   `json:"summary"`
	Horizon string   `json:"horizon"` // "short-term" | "lifetime"
	Tags    []string `json:"tags"`
	Links   []string `json:"links"`
}

// ErrInvalidResponse means the model answer was not a valid, non-empty JSON
// array of idea objects. Callers can retry.
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
		// No client-level timeout: a local CPU-only Ollama model can take
		// far longer than any fixed bound, and this service tolerates
		// waiting. Ask() is bounded by the caller's ctx (research run has a
		// 1500s context); Analyze() is intentionally unbounded.
		HTTP: &http.Client{},
	}
	if forceClient != nil {
		c.HTTP = forceClient
	}
	if c.MaxTokens <= 0 {
		c.MaxTokens = 2048
	}
	return c
}

// Analyze turns a Fetched payload into ideas. ErrInvalidResponse if the
// model answer is not a valid, non-empty JSON array (or array len 0).
func (c *Client) Analyze(payload capture.Fetched) ([]Idea, error) {
	reqBody, err := json.Marshal(map[string]any{
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
		return nil, err
	}

	req, err := http.NewRequest(http.MethodPost, c.BaseURL+"/chat/completions", bytes.NewReader(reqBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.APIKey)
	}

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("analyze: LLM status %d", resp.StatusCode)
	}

	var chat struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &chat); err != nil {
		return nil, err
	}
	if len(chat.Choices) == 0 || chat.Choices[0].Message.Content == "" {
		return nil, ErrInvalidResponse
	}
	return ExtractJSON(chat.Choices[0].Message.Content)
}

// Ask issues one chat completion for a free-text prompt and returns the raw
// message content. Research uses this for its query-build and synthesis
// calls, where the strict-JSON Analyze pipeline does not apply.
func (c *Client) Ask(ctx context.Context, prompt string) (string, error) {
	reqBody, err := json.Marshal(map[string]any{
		"model": c.Model,
		"messages": []map[string]string{
			{"role": "system", "content": "You are a rigorous research assistant."},
			{"role": "user", "content": prompt},
		},
		"max_tokens":  c.MaxTokens,
		"temperature": 0.3,
	})
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

// ExtractJSON parses the model's answer into ideas. It tolerates backtick
// fences and the {"ideas":[...]} wrapper that json_object mode produces.
// Returns ErrInvalidResponse on any malformed/empty payload (no partial
// parse).
func ExtractJSON(s string) ([]Idea, error) {
	s = stripFences(s)
	if s == "" {
		return nil, ErrInvalidResponse
	}
	switch s[0] {
	case '{':
		var wrapped struct {
			Ideas []Idea `json:"ideas"`
		}
		if err := json.Unmarshal([]byte(s), &wrapped); err == nil && wrapped.Ideas != nil {
			return validate(wrapped.Ideas)
		}
		var idea Idea
		if err := json.Unmarshal([]byte(s), &idea); err != nil {
			return nil, ErrInvalidResponse
		}
		return validate([]Idea{idea})
	case '[':
		var ideas []Idea
		if err := json.Unmarshal([]byte(s), &ideas); err != nil {
			return nil, ErrInvalidResponse
		}
		return validate(ideas)
	default:
		return nil, ErrInvalidResponse
	}
}

func validate(ideas []Idea) ([]Idea, error) {
	if len(ideas) == 0 {
		return nil, ErrInvalidResponse
	}
	for _, i := range ideas {
		if i.Horizon != port.HorizonShortTerm && i.Horizon != port.HorizonLifetime {
			return nil, ErrInvalidResponse
		}
	}
	return ideas, nil
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
	return fmt.Sprintf(`You receive a captured internet post. Split it into every distinct idea, tool, or takeaway. One JSON object per card; if one idea, exactly one object; never merge; never drop. Return ONLY a JSON array of objects:
[{"title":"short headline","summary":"2-3 lines","horizon":"short-term","tags":["≤5 lowercase"],"links":["original or sources"]}]
horizon="lifetime" when it is a long-horizon bucket item/trip/plan; "short-term" when actionable now. If media metadata, incorporate it into every card. Source:
TITLE: %s
DESCRIPTION: %s
BODY: %s
CAPTION: %s`, payload.Title, payload.Description, payload.Text, payload.Caption)
}
