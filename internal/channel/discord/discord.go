// Package discord provides a native Discord channel adapter for Sparkkeep.
// It delivers card and research notifications with rich embeds and interactive
// action buttons (Deep Research, Horizons, Discard) and handles button interactions.
package discord

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"sparkkeep/internal/capture"
	"sparkkeep/internal/port"
)

var _ port.ChannelAdapter = (*Adapter)(nil)

const discordAPIBase = "https://discord.com/api/v10"

// maxInteractionBody caps the interaction body read for signature verification.
const maxInteractionBody = 1 << 20 // 1 MB

type Config struct {
	BotToken  string `json:"bot_token"`
	ChannelID string `json:"channel_id"`
	GuildID   string `json:"guild_id,omitempty"`
	PublicKey string `json:"public_key,omitempty"` // For ED25519 interaction signature verification
	Enabled   bool   `json:"enabled"`
}

// Service abstracts the orchestration methods consumed by the Discord adapter.
type Service interface {
	CaptureShare(ctx context.Context, share capture.Share) ([]int64, error)
	GoResearch(ctx context.Context, cardID int64, playbookID ...*int64)
	UpdateCard(ctx context.Context, id int64, patch port.CardPatch) (port.Card, error)
}

type Adapter struct {
	BotToken  string
	ChannelID string
	PublicKey string
	PublicURL string
	Service   Service
	Logf      func(format string, args ...any)

	apiBase string
	client  *http.Client

	// pubKey is the decoded Ed25519 key used to verify interaction signatures.
	// nil when PublicKey is empty or malformed, in which case requests are rejected.
	pubKey ed25519.PublicKey
}

func New(cfg Config, svc Service, publicURL string, logf func(format string, args ...any)) *Adapter {
	if logf == nil {
		logf = func(string, ...any) {}
	}
	pub, _ := hex.DecodeString(strings.TrimSpace(cfg.PublicKey))
	var pubKey ed25519.PublicKey
	if len(pub) == ed25519.PublicKeySize {
		pubKey = ed25519.PublicKey(pub)
	}
	return &Adapter{
		BotToken:  strings.TrimSpace(cfg.BotToken),
		ChannelID: strings.TrimSpace(cfg.ChannelID),
		PublicKey: strings.TrimSpace(cfg.PublicKey),
		PublicURL: publicURL,
		Service:   svc,
		Logf:      logf,
		apiBase:   discordAPIBase,
		client:    &http.Client{Timeout: 10 * time.Second},
		pubKey:    pubKey,
	}
}

func (a *Adapter) ID() string {
	return "discord"
}

func (a *Adapter) Name() string {
	return "Discord"
}

func (a *Adapter) Capabilities() port.ChannelCapabilities {
	return port.ChannelCapabilities{
		SupportsInlineButtons: true,
		SupportsReactions:     true,
		SupportsThreads:       true,
		MarkdownFlavor:        "discord",
		MaxTextLength:         2000,
	}
}

func (a *Adapter) Start(ctx context.Context) error {
	a.logf("discord: adapter initialized (channel: %s)", a.ChannelID)
	return nil
}

func (a *Adapter) logf(format string, args ...any) {
	if a.Logf != nil {
		a.Logf(format, args...)
	}
}

// Notify delivers notifications as Discord Rich Embeds with ActionRow buttons.
func (a *Adapter) Notify(ctx context.Context, n port.Notification) error {
	if a.BotToken == "" || a.ChannelID == "" {
		return nil
	}

	payload := a.buildMessagePayload(n)
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("%s/channels/%s/messages", a.apiBase, a.ChannelID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bot "+a.BotToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := a.client.Do(req)
	if err != nil {
		a.logf("discord: post message error: %v", err)
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		a.logf("discord: post message status %d: %s", resp.StatusCode, string(body))
		return fmt.Errorf("discord: status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

type discordMessage struct {
	Content    string             `json:"content,omitempty"`
	Embeds     []discordEmbed     `json:"embeds,omitempty"`
	Components []discordActionRow `json:"components,omitempty"`
}

type discordEmbed struct {
	Title       string         `json:"title"`
	Description string         `json:"description,omitempty"`
	Color       int            `json:"color,omitempty"`
	Fields      []discordField `json:"fields,omitempty"`
	Footer      *discordFooter `json:"footer,omitempty"`
	URL         string         `json:"url,omitempty"`
}

type discordField struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Inline bool   `json:"inline,omitempty"`
}

type discordFooter struct {
	Text string `json:"text"`
}

type discordActionRow struct {
	Type       int             `json:"type"` // 1 = Action Row
	Components []discordButton `json:"components"`
}

type discordButton struct {
	Type     int    `json:"type"`  // 2 = Button
	Style    int    `json:"style"` // 1=Primary, 2=Secondary, 3=Success, 4=Danger
	Label    string `json:"label"`
	CustomID string `json:"custom_id"`
}

func (a *Adapter) buildMessagePayload(n port.Notification) discordMessage {
	switch n.Kind {
	case "created":
		c := n.Card
		desc := strings.TrimSpace(c.TLDR)
		if desc == "" {
			desc = strings.TrimSpace(c.Summary)
		}

		fields := []discordField{}
		if c.Worthiness.Level != "" {
			val := c.Worthiness.Level
			if c.Worthiness.Reason != "" {
				val += " — " + c.Worthiness.Reason
			}
			fields = append(fields, discordField{Name: "Worth Researching", Value: val, Inline: true})
		}
		if c.Horizon != "" {
			fields = append(fields, discordField{Name: "Horizon", Value: c.Horizon, Inline: true})
		}
		if len(c.Tags) > 0 {
			fields = append(fields, discordField{Name: "Tags", Value: "#" + strings.Join(c.Tags, " #"), Inline: false})
		}

		embed := discordEmbed{
			Title:       fmt.Sprintf("[%s] %s", strings.ToUpper(c.Type), c.Title),
			Description: desc,
			Color:       0x0ea5e9, // ocean blue
			Fields:      fields,
			URL:         c.SourceURL,
			Footer:      &discordFooter{Text: fmt.Sprintf("Sparkkeep • Card #%d", c.ID)},
		}

		// Action buttons
		row1 := discordActionRow{
			Type: 1,
			Components: []discordButton{
				{Type: 2, Style: 1, Label: "🔬 Deep Research", CustomID: fmt.Sprintf("card:%d:research", c.ID)},
			},
		}
		row2 := discordActionRow{
			Type: 1,
			Components: []discordButton{
				{Type: 2, Style: 2, Label: "Short", CustomID: fmt.Sprintf("card:%d:commit:short-term", c.ID)},
				{Type: 2, Style: 2, Label: "Medium", CustomID: fmt.Sprintf("card:%d:commit:medium-term", c.ID)},
				{Type: 2, Style: 2, Label: "Long", CustomID: fmt.Sprintf("card:%d:commit:long-term", c.ID)},
				{Type: 2, Style: 4, Label: "✕ Discard", CustomID: fmt.Sprintf("card:%d:dismiss", c.ID)},
			},
		}

		return discordMessage{
			Embeds:     []discordEmbed{embed},
			Components: []discordActionRow{row1, row2},
		}

	case "research_done":
		findingsSnippet := ""
		if n.Res != nil && n.Res.Findings != "" {
			lines := strings.Split(n.Res.Findings, "\n")
			findingsSnippet = strings.Join(lines[:min(6, len(lines))], "\n")
		}
		embed := discordEmbed{
			Title:       "🔬 Research Completed: " + n.Card.Title,
			Description: findingsSnippet,
			Color:       0x10b981, // emerald green
			Footer:      &discordFooter{Text: "Sparkkeep Deep Research"},
		}
		if a.PublicURL != "" {
			embed.URL = fmt.Sprintf("%s/research/%d", strings.TrimRight(a.PublicURL, "/"), n.Card.ID)
		}
		return discordMessage{Embeds: []discordEmbed{embed}}

	case "duplicate":
		return discordMessage{Content: "ℹ️ " + n.Text}

	case "morning_digest":
		return discordMessage{Content: n.Text}

	default:
		return discordMessage{Content: fmt.Sprintf("**%s**\n%s", n.Card.Title, n.Card.Summary)}
	}
}

// DiscordInteraction represents an inbound webhook from Discord interactions.
type DiscordInteraction struct {
	Type int `json:"type"` // 1 = Ping, 2 = ApplicationCommand, 3 = MessageComponent
	Data struct {
		CustomID string `json:"custom_id"`
	} `json:"data"`
	Message struct {
		ID string `json:"id"`
	} `json:"message"`
}

// HandleInteraction processes Discord button clicks (message components) and pings.
func (a *Adapter) HandleInteraction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Verify Discord's Ed25519 signature before trusting anything in the body.
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxInteractionBody))
	if err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	sig, err := hex.DecodeString(r.Header.Get("X-Signature-Ed25519"))
	timestamp := r.Header.Get("X-Signature-Timestamp")
	if err != nil || timestamp == "" || a.pubKey == nil ||
		!ed25519.Verify(a.pubKey, append([]byte(timestamp), body...), sig) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var interaction DiscordInteraction
	if err := json.Unmarshal(body, &interaction); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	// Discord Ping healthcheck
	if interaction.Type == 1 {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"type": 1})
		return
	}

	// Message Component button click (Type 3)
	if interaction.Type == 3 {
		customID := interaction.Data.CustomID
		parts := strings.Split(customID, ":")
		if len(parts) >= 3 && parts[0] == "card" {
			cardID, _ := strconv.ParseInt(parts[1], 10, 64)
			action := parts[2]

			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			defer cancel()

			switch action {
			case "research":
				if a.Service != nil {
					a.Service.GoResearch(context.Background(), cardID)
				}
			case "commit":
				if len(parts) >= 4 && a.Service != nil {
					horizon := parts[3]
					status := port.StatusInProgress
					if horizon == port.HorizonMediumTerm || horizon == port.HorizonLongTerm {
						status = port.StatusToDo
					}
					_, _ = a.Service.UpdateCard(ctx, cardID, port.CardPatch{Horizon: &horizon, Status: &status})
				}
			case "dismiss":
				if a.Service != nil {
					status := port.StatusShelved
					_, _ = a.Service.UpdateCard(ctx, cardID, port.CardPatch{Status: &status})
				}
			}
		}

		// Acknowledge interaction (Type 6 = DEFERRED_UPDATE_MESSAGE)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"type": 6})
		return
	}

	w.WriteHeader(http.StatusOK)
}

// InboundMessagePayload represents a shared link or message forwarded to Discord capture endpoint.
type InboundMessagePayload struct {
	Content   string `json:"content"`
	Author    string `json:"author,omitempty"`
	MessageID string `json:"message_id,omitempty"`
}

// HandleCapture processes inbound captured messages from Discord bots or webhooks.
func (a *Adapter) HandleCapture(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var p InboundMessagePayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	text := strings.TrimSpace(p.Content)
	if text == "" {
		http.Error(w, "empty content", http.StatusBadRequest)
		return
	}

	share := capture.Share{
		Kind:                capture.KindLink,
		URL:                 text,
		Caption:             text,
		SourceChannel:       "discord",
		SourceChannelChatID: a.ChannelID,
		SourceChannelMsgID:  p.MessageID,
	}
	if !strings.HasPrefix(text, "http://") && !strings.HasPrefix(text, "https://") {
		share.Kind = capture.KindText
		share.URL = ""
	}

	if a.Service == nil {
		http.Error(w, "service unavailable", http.StatusServiceUnavailable)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Minute)
	defer cancel()

	ids, err := a.Service.CaptureShare(ctx, share)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "card_ids": ids})
}
