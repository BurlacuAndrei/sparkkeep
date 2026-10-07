// Package analyze turns a captured post into idea cards via one
// OpenAI-compatible chat completion call. Strict parse + validation so a
// malformed model response fails loudly and retryable.
package analyze

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/draw"
	_ "image/gif" // registers GIF decoding
	"image/jpeg"
	_ "image/png" // registers PNG decoding for Telegram screenshots
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"sparkkeep/internal/capture"
	"sparkkeep/internal/config"
	"sparkkeep/internal/port"
)

type Idea struct {
	Title            string           `json:"title"`
	Summary          string           `json:"summary"`
	Horizon          string           `json:"horizon"` // "short-term" | "medium-term" | "long-term" | "lifetime"
	Tags             []string         `json:"tags"`
	Links            []string         `json:"links,omitempty"`
	References       []port.Reference `json:"references,omitempty"`
	ExecutiveSummary string           `json:"executive_summary,omitempty"`
	ValueProposition string           `json:"value_proposition,omitempty"`
	ProposedActions  []string         `json:"proposed_actions,omitempty"`
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
	BaseURL     string
	APIKey      string
	Model       string
	VisionModel string
	MaxTokens   int
	HTTP        *http.Client
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
	c.VisionModel = cfg.VisionModel
	if c.VisionModel == "" {
		c.VisionModel = c.Model
	}
	return c
}

// visionMaxEdge bounds the long edge of an image before it is sent to a
// vision model. A 12MP phone photo through a 4B model on CPU is minutes of
// wall clock; 768px is legible for captions and screenshots.
const visionMaxEdge = 768

// minDigestChars is the floor for a usable image description. Below it the
// model returned nothing, and a card built on that would be a fabrication.
const minDigestChars = 20

// Describe asks the vision model what an image contains. It returns
// ("", error) when the image cannot be decoded or the model is unreachable;
// the caller turns that into an "image unreadable" Note.
func (c *Client) Describe(ctx context.Context, img capture.File, hint string) (string, error) {
	enc, mime, err := encodeForVision(img.Data)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(hint) == "" {
		hint = "Describe this image. Transcribe any visible text verbatim. State clearly if the image is unreadable or contains no useful information."
	}
	maxTokens := c.MaxTokens
	if maxTokens <= 0 {
		maxTokens = 512
	}
	content, err := c.doCompletion(ctx, map[string]any{
		"model": c.VisionModel,
		"messages": []map[string]any{{
			"role": "user",
			"content": []map[string]any{
				{"type": "text", "text": hint},
				{"type": "image_url", "image_url": map[string]string{
					"url": "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(enc),
				}},
			},
		}},
		"max_tokens":  maxTokens,
		"temperature": 0.1,
	})
	if err != nil {
		return "", err
	}
	content = strings.TrimSpace(content)
	if len(content) < minDigestChars {
		return "", fmt.Errorf("analyze: vision reply too short (%d chars)", len(content))
	}
	return content, nil
}

// encodeForVision downscales raw image bytes to visionMaxEdge and re-encodes
// as JPEG. Decoding is stdlib (the jpeg and blank-imported png packages
// register their decoders) and scaling is a nearest-neighbour loop over
// image.Image, so no dependency.
func encodeForVision(raw []byte) ([]byte, string, error) {
	img, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, "", fmt.Errorf("analyze: decode image: %w", err)
	}
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= 0 || h <= 0 {
		return nil, "", fmt.Errorf("analyze: empty image %dx%d", w, h)
	}
	if w > visionMaxEdge || h > visionMaxEdge {
		scale := float64(visionMaxEdge) / float64(max(w, h))
		nw, nh := int(float64(w)*scale), int(float64(h)*scale)
		if nw < 1 {
			nw = 1
		}
		if nh < 1 {
			nh = 1
		}
		dst := image.NewRGBA(image.Rect(0, 0, nw, nh))
		for y := 0; y < nh; y++ {
			for x := 0; x < nw; x++ {
				sx := b.Min.X + x*w/nw
				sy := b.Min.Y + y*h/nh
				dst.Set(x, y, img.At(sx, sy))
			}
		}
		img = dst
	}
	// JPEG has no alpha; composite onto white so transparent PNG regions do not
	// encode as black (common for screenshots).
	b = img.Bounds()
	flat := image.NewRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	draw.Draw(flat, flat.Bounds(), image.White, image.Point{}, draw.Src)
	draw.Draw(flat, flat.Bounds(), img, b.Min, draw.Over)
	img = flat
	var out bytes.Buffer
	if err := jpeg.Encode(&out, img, &jpeg.Options{Quality: 80}); err != nil {
		return nil, "", fmt.Errorf("analyze: encode jpeg: %w", err)
	}
	return out.Bytes(), "image/jpeg", nil
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
		"messages": []map[string]any{
			{"role": "system", "content": "You are a curator that returns strict JSON."},
			{"role": "user", "content": PromptFor(payload)},
		},
		"response_format": map[string]string{"type": "json_object"},
		"max_tokens":      c.MaxTokens,
		"temperature":     0.3,
	})
	if err != nil {
		return AnalysisResult{}, err
	}
	res, err := ExtractJSON(content)
	if err != nil {
		return AnalysisResult{}, err
	}
	deterministic := ExtractDeterministicReferences(payload)
	for i := range res.Cards {
		res.Cards[i].References = MergeReferences(res.Cards[i].References, deterministic)
	}
	return res, nil
}

// Ask issues one chat completion for a free-text prompt and returns the raw
// message content. Research uses this for its query-build and synthesis
// calls, where the strict-JSON Analyze pipeline does not apply.
func (c *Client) Ask(ctx context.Context, prompt string) (string, error) {
	return c.doCompletion(ctx, map[string]any{
		"model": c.Model,
		"messages": []map[string]any{
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
	if s[0] != '{' && s[0] != '[' {
		startObj := strings.Index(s, "{")
		startArr := strings.Index(s, "[")
		if startObj >= 0 && (startArr < 0 || startObj < startArr) {
			end := strings.LastIndex(s, "}")
			if end > startObj {
				s = s[startObj : end+1]
			}
		} else if startArr >= 0 {
			end := strings.LastIndex(s, "]")
			if end > startArr {
				s = s[startArr : end+1]
			}
		}
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
		res.Cards = normalizeIdeaCards(res.Cards)
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
		cards = normalizeIdeaCards(cards)
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

func normalizeIdeaCards(cards []Idea) []Idea {
	for i := range cards {
		cards[i].Horizon = normalizeHorizon(cards[i].Horizon)
		var legacyRefs []port.Reference
		for _, l := range cards[i].Links {
			l = strings.TrimSpace(l)
			if l == "" {
				continue
			}
			canon := CanonicalURL(l)
			if canon == "" {
				canon = l
			}
			kind := port.RefKindURL
			label := canon
			if IsGitHubURL(canon) {
				kind = port.RefKindRepo
				label = GitHubRepoLabel(canon)
			}
			legacyRefs = append(legacyRefs, port.Reference{
				Kind:  kind,
				Label: label,
				URL:   canon,
			})
		}
		cards[i].References = MergeReferences(cards[i].References, legacyRefs)
		if cards[i].Tags == nil {
			cards[i].Tags = []string{}
		}
		if cards[i].ProposedActions == nil {
			cards[i].ProposedActions = []string{}
		}
	}
	return cards
}

func normalizeHorizon(raw string) string {
	cleaned := strings.ToLower(strings.TrimSpace(raw))
	cleaned = strings.ReplaceAll(cleaned, "_", " ")
	cleaned = strings.ReplaceAll(cleaned, "-", " ")
	cleaned = strings.Join(strings.Fields(cleaned), " ")

	switch cleaned {
	case "short term", "shortterm", "short", "now", "soon", "immediate":
		return port.HorizonShortTerm
	case "medium term", "mediumterm", "medium":
		return port.HorizonMediumTerm
	case "long term", "longterm", "long":
		return port.HorizonLongTerm
	case "lifetime", "life time", "bucket", "bucket list", "bucketlist", "someday":
		return port.HorizonLifetime
	default:
		slog.Debug("analyze: unknown or empty horizon, defaulting to short-term", "horizon", raw)
		return port.HorizonShortTerm
	}
}

func validateCards(cards []Idea) error {
	if len(cards) == 0 {
		return ErrInvalidResponse
	}
	for _, i := range cards {
		if !port.ValidHorizon(i.Horizon) {
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

// PromptFor builds the curator prompt. Notes are labelled explicitly as
// extraction warnings so the model qualifies the card instead of treating a
// login wall or a missing transcript as content.
func PromptFor(payload capture.Fetched) string {
	notes := "(none)"
	if len(payload.Notes) > 0 {
		notes = strings.Join(payload.Notes, "; ")
	}
	transcript := payload.Transcript
	if strings.TrimSpace(transcript) == "" {
		transcript = "(none)"
	}
	digest := payload.ImageDigest
	if strings.TrimSpace(digest) == "" {
		digest = "(none)"
	}
	return fmt.Sprintf(`You receive captured content of kind %q. You are the Sparkkeep Action Engine curator.
Give a concise "So What?" briefing and split the content into actionable idea cards.
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
      "references": [
        {
          "kind": "tool",
          "label": "name or label",
          "url": "optional url"
        }
      ]
    }
  ]
}

Rules:
- horizon must be "short-term" (actionable now/soon), "medium-term" (planned), "long-term" (vision), or "lifetime" (bucket item).
- references: extract named entities (kind: tool, product, person, org, paper, repo, other) and any explicit links (kind: url or repo). url is optional for entities.
- One card per distinct idea or tool; if one idea, exactly one card; never merge; never drop.
- EXTRACTION NOTES are warnings about what could NOT be read. Never present a note's
  subject as content you learned. If content is missing, say so plainly in the summary.
- If the source is thin, produce one honest card rather than padding to look substantial.

TITLE: %s
DESCRIPTION: %s
BODY: %s
CAPTION: %s
TRANSCRIPT: %s
IMAGE READING: %s
EXTRACTION NOTES: %s`,
		payload.Kind,
		clip(payload.Title, 300), clip(payload.Description, 600),
		clip(payload.Text, 4000), clip(payload.Caption, 2000),
		clip(transcript, 6000), clip(digest, 2000), notes)
}

// clip truncates at a rune boundary so a long transcript cannot split a
// multi-byte character.
func clip(s string, max int) string {
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	return string(runes[:max]) + "\n[truncated]"
}
