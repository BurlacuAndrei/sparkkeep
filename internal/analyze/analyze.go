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
	Summary          string           `json:"summary,omitempty"`
	Horizon          string           `json:"horizon"` // "short-term" | "medium-term" | "long-term" | "lifetime"
	Tags             []string         `json:"tags"`
	Links            []string         `json:"links,omitempty"`
	References       []port.Reference `json:"references,omitempty"`
	Type             string           `json:"type,omitempty"`
	TLDR             string           `json:"tldr,omitempty"`
	WhyCare          string           `json:"why_care,omitempty"`
	Claims           []string         `json:"claims,omitempty"`
	OpenQuestions    []string         `json:"open_questions,omitempty"`
	Signals          *port.Signals    `json:"signals,omitempty"`
	Worthiness       *port.Worthiness `json:"worthiness,omitempty"`
	ExecutiveSummary string           `json:"executive_summary,omitempty"`
	ValueProposition string           `json:"value_proposition,omitempty"`
	ProposedActions  []string         `json:"proposed_actions,omitempty"`
}

type AnalysisResult struct {
	ExecutiveSummary string   `json:"executive_summary,omitempty"`
	ValueProposition string   `json:"value_proposition,omitempty"`
	ProposedActions  []string `json:"proposed_actions,omitempty"`
	Discarded        bool     `json:"discarded"`
	DiscardReason    string   `json:"discard_reason,omitempty"`
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
	CardTypes   []string
	HTTP        *http.Client
}

type contextKey string

const cardTypesContextKey contextKey = "card_types"

// WithCardTypes stores active card types into context.
func WithCardTypes(ctx context.Context, types []string) context.Context {
	return context.WithValue(ctx, cardTypesContextKey, types)
}

// CardTypesFromContext retrieves active card types from context if present.
func CardTypesFromContext(ctx context.Context) ([]string, bool) {
	if ctx == nil {
		return nil, false
	}
	val, ok := ctx.Value(cardTypesContextKey).([]string)
	return val, ok
}

// CleanCardTypes trims, resolves aliases, lowercases, deduplicates, and removes "other".
func CleanCardTypes(types []string) []string {
	var cleaned []string
	seen := make(map[string]bool)
	for _, t := range types {
		s := port.ResolveCardType(t)
		if s == "" || s == "other" {
			continue
		}
		if !seen[s] {
			seen[s] = true
			cleaned = append(cleaned, s)
		}
	}
	return cleaned
}

// SystemPrompt returns the triage curator system prompt with active card types injected.
func SystemPrompt(cardTypes []string) string {
	cleaned := CleanCardTypes(cardTypes)
	if len(cleaned) == 0 {
		return "You are a curator that returns strict JSON."
	}
	return fmt.Sprintf("You are a curator that returns strict JSON. 'type' must be one of: %s, other.", strings.Join(cleaned, ", "))
}

func (c *Client) getActiveTypes(ctx context.Context) []string {
	if ctx != nil {
		if types, ok := CardTypesFromContext(ctx); ok && len(types) > 0 {
			return types
		}
	}
	if len(c.CardTypes) > 0 {
		return c.CardTypes
	}
	return port.DefaultCardTypes
}

// New returns a client bound to the endpoint/key/model. A non-nil
// forceClient (tests) replaces the default client.
func New(cfg config.Config, forceClient *http.Client) *Client {
	c := &Client{
		BaseURL:   cfg.LLMBase,
		APIKey:    cfg.LLMKey,
		Model:     cfg.LLMModel,
		MaxTokens: cfg.MaxAnalyzeTokens,
		CardTypes: append([]string(nil), port.DefaultCardTypes...),
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
		hint = "Describe this image. Transcribe any visible text verbatim in its original source language without translation. State clearly if the image is unreadable or contains no useful information."
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
	if model, _ := body["model"].(string); strings.TrimSpace(model) == "" {
		return "", fmt.Errorf("analyze: no LLM model configured")
	}

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
func (c *Client) Analyze(ctx context.Context, payload capture.Fetched, profile ...*port.UserProfile) (AnalysisResult, error) {
	activeTypes := c.getActiveTypes(ctx)
	content, err := c.doCompletion(ctx, map[string]any{
		"model": c.Model,
		"messages": []map[string]any{
			{"role": "system", "content": SystemPrompt(activeTypes)},
			{"role": "user", "content": PromptForWithTypes(payload, activeTypes, profile...)},
		},
		"response_format": map[string]string{"type": "json_object"},
		"max_tokens":      c.MaxTokens,
		"temperature":     0.3,
	})
	if err != nil {
		return AnalysisResult{}, err
	}
	res, err := ExtractJSON(content, activeTypes)
	if err != nil {
		return AnalysisResult{}, err
	}
	deterministic := ExtractDeterministicReferences(payload)
	isLoginWall := hasLoginWallOrThinNote(payload.Notes)
	for i := range res.Cards {
		res.Cards[i].References = MergeReferences(res.Cards[i].References, deterministic)
		if isLoginWall {
			if res.Cards[i].Signals == nil {
				res.Cards[i].Signals = &port.Signals{Extraction: "thin", SourceQuality: "unknown"}
			} else if res.Cards[i].Signals.Extraction == "full" || res.Cards[i].Signals.Extraction == "" {
				if strings.TrimSpace(payload.Text) != "" {
					res.Cards[i].Signals.Extraction = "partial"
				} else {
					res.Cards[i].Signals.Extraction = "thin"
				}
			}
		}
	}
	return res, nil
}

func hasLoginWallOrThinNote(notes []string) bool {
	for _, note := range notes {
		nl := strings.ToLower(note)
		if strings.Contains(nl, "login") || strings.Contains(nl, "wall") || strings.Contains(nl, "auth") || strings.Contains(nl, "blocked") || strings.Contains(nl, "not extract") || strings.Contains(nl, "unreadable") {
			return true
		}
	}
	return false
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
// ExtractJSON parses the model's answer into an AnalysisResult. It tolerates
// the new Action Engine briefing schema, legacy idea arrays, and markdown fences.
// Returns ErrInvalidResponse on any malformed/empty payload.
func ExtractJSON(s string, activeTypes ...[]string) (AnalysisResult, error) {
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

		if disc, ok := rawMap["discarded"]; ok {
			_ = json.Unmarshal(disc, &res.Discarded)
		}
		if dReason, ok := rawMap["discard_reason"]; ok {
			_ = json.Unmarshal(dReason, &res.DiscardReason)
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

		if res.Discarded || (len(res.Cards) == 0 && res.DiscardReason != "") {
			res.Discarded = true
			res.Cards = []Idea{}
			return res, nil
		}

		if len(res.Cards) == 0 {
			return AnalysisResult{}, ErrInvalidResponse
		}
		if len(res.Cards) > 3 {
			res.Cards = res.Cards[:3]
		}
		res.Cards = normalizeIdeaCards(res.Cards, activeTypes...)
		if err := validateCards(res.Cards); err != nil {
			return AnalysisResult{}, err
		}
		if res.ExecutiveSummary == "" && len(res.Cards) > 0 {
			res.ExecutiveSummary = res.Cards[0].TLDR
			if res.ExecutiveSummary == "" {
				res.ExecutiveSummary = res.Cards[0].Summary
			}
		}
		if res.ValueProposition == "" && len(res.Cards) > 0 {
			res.ValueProposition = res.Cards[0].WhyCare
		}
		return res, nil

	case '[':
		var cards []Idea
		if err := json.Unmarshal([]byte(s), &cards); err != nil {
			return AnalysisResult{}, ErrInvalidResponse
		}
		if len(cards) > 3 {
			cards = cards[:3]
		}
		cards = normalizeIdeaCards(cards, activeTypes...)
		if err := validateCards(cards); err != nil {
			return AnalysisResult{}, err
		}
		var exec, valProp string
		if len(cards) > 0 {
			exec = cards[0].TLDR
			if exec == "" {
				exec = cards[0].Summary
			}
			valProp = cards[0].WhyCare
		}
		return AnalysisResult{
			ExecutiveSummary: exec,
			ValueProposition: valProp,
			ProposedActions:  []string{},
			Cards:            cards,
		}, nil

	default:
		return AnalysisResult{}, ErrInvalidResponse
	}
}

func normalizeIdeaCards(cards []Idea, activeTypes ...[]string) []Idea {
	var allowed map[string]bool
	if len(activeTypes) > 0 && len(activeTypes[0]) > 0 {
		allowed = make(map[string]bool)
		for _, t := range CleanCardTypes(activeTypes[0]) {
			allowed[t] = true
		}
	} else {
		allowed = make(map[string]bool)
		for _, t := range CleanCardTypes(port.DefaultCardTypes) {
			allowed[t] = true
		}
	}
	allowed["other"] = true

	for i := range cards {
		cards[i].Horizon = normalizeHorizon(cards[i].Horizon)
		if cards[i].Summary == "" && cards[i].TLDR != "" {
			cards[i].Summary = cards[i].TLDR
		}
		rawType := strings.TrimSpace(cards[i].Type)
		resolved := port.ResolveCardType(rawType)
		if rawType == "" || resolved == "" {
			if allowed[port.CardTypeIdea] {
				cards[i].Type = port.CardTypeIdea
			} else {
				cards[i].Type = port.CardTypeOther
			}
		} else if !allowed[resolved] {
			cards[i].Type = port.CardTypeOther
		} else {
			cards[i].Type = resolved
		}
		if cards[i].Claims == nil {
			cards[i].Claims = []string{}
		} else if len(cards[i].Claims) > 3 {
			cards[i].Claims = cards[i].Claims[:3]
		}
		if cards[i].OpenQuestions == nil {
			cards[i].OpenQuestions = []string{}
		} else if len(cards[i].OpenQuestions) > 3 {
			cards[i].OpenQuestions = cards[i].OpenQuestions[:3]
		}
		if cards[i].Signals == nil {
			cards[i].Signals = &port.Signals{Extraction: "full", SourceQuality: "unknown"}
		}
		if cards[i].Signals.Extraction == "" {
			cards[i].Signals.Extraction = "full"
		}
		if cards[i].Signals.SourceQuality == "" {
			cards[i].Signals.SourceQuality = "unknown"
		}
		if cards[i].Worthiness == nil {
			cards[i].Worthiness = &port.Worthiness{Level: "medium"}
		}
		if cards[i].Worthiness.Level == "" {
			cards[i].Worthiness.Level = "medium"
		} else {
			lvl := strings.ToLower(strings.TrimSpace(cards[i].Worthiness.Level))
			switch lvl {
			case "high", "hoch", "haute", "alta", "ridicata", "ridicată":
				cards[i].Worthiness.Level = "high"
			case "medium", "mittel", "moyenne", "media", "medie":
				cards[i].Worthiness.Level = "medium"
			case "low", "niedrig", "faible", "baja", "scazuta", "scăzută":
				cards[i].Worthiness.Level = "low"
			default:
				cards[i].Worthiness.Level = "medium"
			}
		}

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
		for j := range cards[i].References {
			cards[i].References[j].Kind = port.ResolveReferenceKind(cards[i].References[j].Kind)
		}
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
	return port.NormalizeHorizon(raw)
}

func validateCards(cards []Idea) error {
	if len(cards) == 0 {
		return ErrInvalidResponse
	}
	for _, i := range cards {
		tldr := i.TLDR
		if tldr == "" {
			tldr = i.Summary
		}
		if tldr == "" {
			tldr = i.ExecutiveSummary
		}
		if strings.TrimSpace(i.Title) == "" || strings.TrimSpace(tldr) == "" || !port.ValidHorizon(i.Horizon) {
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

// PromptFor builds the curator prompt for the Triage Brief. Notes are labelled
// explicitly as extraction warnings so the model qualifies the card instead of
// treating a login wall or a missing transcript as content. If a non-empty user profile
// is provided, a compact USER PROFILE block is appended for personal fit tailoring.
// It references the card types declared in the system prompt without contradictory lists.
func PromptFor(payload capture.Fetched, profile ...*port.UserProfile) string {
	return PromptForWithTypes(payload, nil, profile...)
}

// PromptForWithTypes builds the curator prompt for the Triage Brief with active card types.
// If activeTypes is provided, the card type schema and rules match those active types.
// If activeTypes is empty or nil, the prompt references the types declared in the system prompt.
func PromptForWithTypes(payload capture.Fetched, activeTypes []string, profile ...*port.UserProfile) string {
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

	typeSchema := "allowed card type"
	typeRule := `- "type" must be one of the card types declared in the system prompt (or "other").`
	cleaned := CleanCardTypes(activeTypes)
	if len(cleaned) > 0 {
		all := append(cleaned, "other")
		typeSchema = strings.Join(all, "|")
		typeRule = fmt.Sprintf(`- "type" must be one of: %s.`, strings.Join(all, ", "))
	}

	base := fmt.Sprintf(`You receive captured content of kind %q. You are the Sparkkeep Action Engine curator.
Analyze the source and produce a Triage Brief for each distinct idea, tool, or takeaway.
Return ONLY a valid JSON object matching this schema:
{
  "discarded": false,
  "discard_reason": "optional reason if discarded",
  "cards": [
    {
      "title": "short headline",
      "type": "%s",
      "tldr": "1 sentence summarizing what this is",
      "why_care": "1-2 sentences on why it matters or is worth investigating",
      "horizon": "short-term|medium-term|long-term",
      "tags": ["lowercase tags, max 5"],
      "claims": ["up to 3 concrete assertions or takeaways from the source"],
      "open_questions": ["up to 3 questions deep-dive research should answer"],
      "signals": {
        "extraction": "full|partial|thin",
        "promo": false,
        "source_quality": "primary|secondary|social|unknown",
        "published_at": "optional ISO date or string"
      },
      "worthiness": {
        "level": "high|medium|low",
        "reason": "why it is worth researching or reviewing"
      },
      "references": [
        {
          "kind": "tool|repo|product|person|org|paper|url|other",
          "label": "name or label",
          "url": "optional url"
        }
      ]
    }
  ]
}

Rules:
- Each card MUST have distinct, specific "tldr" and "why_care" reflecting that individual idea (no generic shared text).
%s
- "horizon" must be "short-term" (actionable now/soon), "medium-term" (planned), or "long-term" (vision).
- "claims": up to 3 core claims or assertions made by the source.
- "open_questions": up to 3 key questions research would need to answer.
- "signals":
  - "extraction": "full", "partial", or "thin".
  - "promo": true if primarily promotional/sponsored/ad, false otherwise.
  - "source_quality": "primary" (author/creator/paper), "secondary" (review/news/blog), "social" (tweet/comment/forum), or "unknown".
  - "published_at": publication date if mentioned, else omit or empty.
- "worthiness": "level" ("high", "medium", or "low") and a brief "reason".
- "references": extract named entities and explicit links.
- By default, produce exactly ONE consolidated card per post, thread, or video, uniting all key takeaways and claims into a single coherent brief. Never fragment a single narrative post into multiple cards.
- Multi-card splitting (card fission) is strictly permitted ONLY if the source explicitly covers distinct, structurally separated standalone topics (e.g., named video chapters or reviews of independent standalone tools/projects).
- Hard ceiling of at most 3 cards per capture: never create more than 3 cards total, regardless of source length. If content covers many items, summarize them or produce a collection card rather than exceeding 3 cards.
- Triage Noise Gate: If the captured content is purely engagement bait, discussion farming (e.g. 'thoughts?', 'agree or disagree?', 'which is better?'), follower/comment gates ('comment X to get link'), or promotional hype with zero technical or factual substance, set "discarded": true with a brief "discard_reason", and return an empty "cards": [] array. In multi-slide or carousel captures (e.g. marked with [Slide X of Y]), the first slide (cover hook) and final slide/caption are frequently promotional hooks, discussion farming, or follower/comment gates (e.g., 'comment X to get links', 'follow for more'). Do NOT discard the capture if the middle slides contain concrete tools, technical architectures, actionable code, or substantive takeaways. Extract the substantive ideas from the legitimate slides and ignore the intro/outro bait. Only set 'discarded': true if ALL slides, captions, and text lack technical or factual substance.
- EXTRACTION NOTES are warnings about what could NOT be read. Never treat notes as content learned. If extraction notes indicate a login wall, paywall, unreadable content, or missing text/transcript, "signals.extraction" MUST be "partial" or "thin", NEVER "full".

TITLE: %s
DESCRIPTION: %s
BODY: %s
CAPTION: %s
TRANSCRIPT: %s
IMAGE READING: %s
EXTRACTION NOTES: %s`,
		payload.Kind,
		typeSchema,
		typeRule,
		clip(payload.Title, 300), clip(payload.Description, 600),
		clip(payload.Text, 4000), clip(payload.Caption, 2000),
		clip(transcript, 6000), clip(digest, 5000), notes)

	if len(profile) > 0 && profile[0] != nil && !profile[0].IsEmpty() {
		if block := FormatProfileBlock(profile[0]); block != "" {
			return base + "\n\n" + block
		}
	}
	return base
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
