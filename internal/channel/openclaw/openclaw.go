// Package openclaw provides a bridge adapter to the OpenClaw AI assistant gateway,
// enabling Sparkkeep to capture shares and deliver notifications across OpenClaw's
// 15+ messaging channels (WhatsApp, Discord, Slack, Signal, iMessage, Matrix, etc.).
package openclaw

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"sparkkeep/internal/capture"
	"sparkkeep/internal/core"
	"sparkkeep/internal/port"
)

var _ port.ChannelAdapter = (*Adapter)(nil)

// Adapter connects Sparkkeep with a local or remote OpenClaw Gateway.
type Adapter struct {
	GatewayURL     string // e.g. "http://localhost:18789"
	HookToken      string // Bearer token for /hooks/agent
	DefaultChannel string // e.g. "whatsapp", "signal", "discord"
	DefaultTarget  string // e.g. "+15550199" or user ID
	PublicURL      string
	Service        *core.Service
	Store          port.Store
	Logf           func(format string, args ...any)

	client *http.Client
	mu     sync.RWMutex
}

// Config wraps runtime settings for the OpenClaw adapter.
type Config struct {
	GatewayURL     string `json:"gateway_url"`
	HookToken      string `json:"hook_token"`
	DefaultChannel string `json:"default_channel"`
	DefaultTarget  string `json:"default_target"`
	Enabled        bool   `json:"enabled"`
}

// New constructs an OpenClaw bridge adapter.
func New(cfg Config, svc *core.Service, st port.Store, publicURL string, logf func(format string, args ...any)) *Adapter {
	if logf == nil {
		logf = func(string, ...any) {}
	}
	gw := strings.TrimRight(strings.TrimSpace(cfg.GatewayURL), "/")
	if gw == "" {
		gw = "http://localhost:18789"
	}
	ch := strings.TrimSpace(cfg.DefaultChannel)
	if ch == "" {
		ch = "whatsapp"
	}
	return &Adapter{
		GatewayURL:     gw,
		HookToken:      strings.TrimSpace(cfg.HookToken),
		DefaultChannel: ch,
		DefaultTarget:  strings.TrimSpace(cfg.DefaultTarget),
		PublicURL:      publicURL,
		Service:        svc,
		Store:          st,
		Logf:           logf,
		client:         &http.Client{Timeout: 10 * time.Second},
	}
}

func (a *Adapter) ID() string {
	return "openclaw"
}

func (a *Adapter) Name() string {
	return "OpenClaw Bridge"
}

func (a *Adapter) Capabilities() port.ChannelCapabilities {
	return port.ChannelCapabilities{
		SupportsInlineButtons: false, // WhatsApp/Signal fall back to text replies & reaction shortcuts
		SupportsReactions:     true,
		SupportsThreads:       true,
		MarkdownFlavor:        "markdown",
		MaxTextLength:         4000,
	}
}

func (a *Adapter) logf(format string, args ...any) {
	if a.Logf != nil {
		a.Logf(format, args...)
	}
}

func (a *Adapter) Start(ctx context.Context) error {
	a.logf("openclaw: bridge adapter initialized (gateway: %s, default channel: %s)", a.GatewayURL, a.DefaultChannel)
	return nil
}

// Notify delivers card and research notifications to OpenClaw's Gateway HTTP hook.
func (a *Adapter) Notify(ctx context.Context, n port.Notification) error {
	if a.GatewayURL == "" {
		return nil
	}

	targetChannel := a.DefaultChannel
	targetRecipient := a.DefaultTarget

	// Inspect card provenance if set
	if strings.HasPrefix(n.Card.SourceChannel, "openclaw:") {
		sub := strings.TrimPrefix(n.Card.SourceChannel, "openclaw:")
		if sub != "" {
			targetChannel = sub
		}
	}
	if n.Card.SourceChannelChatID != "" {
		targetRecipient = n.Card.SourceChannelChatID
	}

	text := a.formatNotification(n)
	return a.sendToGateway(ctx, targetChannel, targetRecipient, text)
}

func (a *Adapter) formatNotification(n port.Notification) string {
	var b strings.Builder
	switch n.Kind {
	case "created":
		c := n.Card
		typ := strings.ToUpper(strings.TrimSpace(c.Type))
		if typ == "" {
			typ = "IDEA"
		}
		fmt.Fprintf(&b, "💡 [%s] %s\n\n", typ, strings.TrimSpace(c.Title))

		body := strings.TrimSpace(c.TLDR)
		if body == "" {
			body = strings.TrimSpace(c.Summary)
		}
		if body != "" {
			b.WriteString(body + "\n\n")
		}

		if len(c.Claims) > 0 {
			b.WriteString("Key claims:\n")
			for i, cl := range c.Claims {
				if i >= 3 {
					break
				}
				fmt.Fprintf(&b, "• %s\n", cl)
			}
			b.WriteString("\n")
		}

		if c.Worthiness.Level != "" {
			fmt.Fprintf(&b, "Worth researching: %s\n", c.Worthiness.Level)
		}
		if c.Horizon != "" {
			fmt.Fprintf(&b, "Horizon: %s\n", c.Horizon)
		}
		if len(c.Tags) > 0 {
			var tags []string
			for _, t := range c.Tags {
				tags = append(tags, "#"+t)
			}
			fmt.Fprintf(&b, "%s\n", strings.Join(tags, " "))
		}

		// Text action shortcuts for channels without inline buttons
		fmt.Fprintf(&b, "\nActions (reply with):\n")
		fmt.Fprintf(&b, "• /research %d — Trigger Deep Research\n", c.ID)
		fmt.Fprintf(&b, "• /short %d    — Set Short-term (Now)\n", c.ID)
		fmt.Fprintf(&b, "• /med %d      — Set Medium-term (Next)\n", c.ID)
		fmt.Fprintf(&b, "• /long %d     — Set Long-term (Later)\n", c.ID)
		fmt.Fprintf(&b, "• /discard %d  — Discard card\n", c.ID)

	case "research_done":
		fmt.Fprintf(&b, "🔬 *Research Complete: %s*\n\n", n.Card.Title)
		if n.Res != nil && n.Res.Findings != "" {
			lines := strings.Split(n.Res.Findings, "\n")
			snippet := strings.Join(lines[:min(8, len(lines))], "\n")
			b.WriteString(snippet + "\n\n")
		}
		if a.PublicURL != "" {
			fmt.Fprintf(&b, "Read full report: %s/research/%d\n", strings.TrimRight(a.PublicURL, "/"), n.Card.ID)
		}

	case "research_failed":
		fmt.Fprintf(&b, "⚠️ Research interrupted for: %s\n", n.Card.Title)

	case "duplicate":
		fmt.Fprintf(&b, "ℹ️ %s\n", n.Text)

	default:
		fmt.Fprintf(&b, "%s\n%s", n.Card.Title, n.Card.Summary)
	}

	return b.String()
}

type gatewayHookPayload struct {
	Message string `json:"message"`
	Name    string `json:"name"`
	AgentID string `json:"agentId,omitempty"`
	Deliver bool   `json:"deliver"`
	Channel string `json:"channel,omitempty"`
	Target  string `json:"target,omitempty"`
}

func (a *Adapter) sendToGateway(ctx context.Context, channel, target, message string) error {
	payload := gatewayHookPayload{
		Message: message,
		Name:    "Sparkkeep",
		AgentID: "main",
		Deliver: true,
		Channel: channel,
		Target:  target,
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	hookURL := fmt.Sprintf("%s/hooks/agent", a.GatewayURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, hookURL, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if a.HookToken != "" {
		req.Header.Set("Authorization", "Bearer "+a.HookToken)
	}

	resp, err := a.client.Do(req)
	if err != nil {
		a.logf("openclaw: failed to send to gateway %s: %v", hookURL, err)
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		a.logf("openclaw: gateway returned status %d: %s", resp.StatusCode, string(body))
		return fmt.Errorf("openclaw: gateway status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// InboundWebhookPayload is the JSON format expected when OpenClaw forwards a message.
type InboundWebhookPayload struct {
	Channel   string `json:"channel"`    // "whatsapp", "signal", "discord", "imessage", etc.
	Sender    string `json:"sender"`     // User ID or phone number
	ChatID    string `json:"chat_id"`    // Channel chat/thread ID
	MessageID string `json:"message_id"` // Platform message ID
	Text      string `json:"text"`       // Inbound text or link
	MediaURL  string `json:"media_url,omitempty"`
}

// HandleWebhook processes inbound messages from OpenClaw's webhook tool or agent forwarder.
func (a *Adapter) HandleWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Verify Bearer token if configured
	if a.HookToken != "" {
		auth := r.Header.Get("Authorization")
		token := strings.TrimPrefix(auth, "Bearer ")
		if token == "" {
			token = r.URL.Query().Get("token")
		}
		if token != a.HookToken {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
	}

	var p InboundWebhookPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "bad request: "+err.Error(), http.StatusBadRequest)
		return
	}

	text := strings.TrimSpace(p.Text)
	if text == "" && p.MediaURL == "" {
		http.Error(w, "empty content", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Minute)
	defer cancel()

	// Check if this is a command action replying to an existing card
	if handled, msg := a.handleActionCommand(ctx, text); handled {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "message": msg})
		return
	}

	// Otherwise, ingest as new capture
	sourceChan := "openclaw"
	if p.Channel != "" {
		sourceChan = "openclaw:" + p.Channel
	}

	share := capture.Share{
		Kind:                capture.KindLink,
		URL:                 text,
		Caption:             text,
		SourceChannel:       sourceChan,
		SourceChannelChatID: p.ChatID,
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

	ids, err := a.Service.CaptureShare(ctx, share)
	if err != nil {
		a.logf("openclaw: capture error: %v", err)
		http.Error(w, "capture failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":       true,
		"card_ids": ids,
		"count":    len(ids),
	})
}

// handleActionCommand parses action commands like "/research 42", "/short 42", "/discard 42".
func (a *Adapter) handleActionCommand(ctx context.Context, text string) (bool, string) {
	fields := strings.Fields(text)
	if len(fields) < 2 {
		return false, ""
	}
	cmd := strings.ToLower(strings.TrimPrefix(fields[0], "/"))
	cardID, err := strconv.ParseInt(fields[1], 10, 64)
	if err != nil || cardID <= 0 {
		return false, ""
	}

	switch cmd {
	case "research", "deep", "1":
		if a.Service != nil && a.Service.Runner != nil && a.Store != nil {
			card, err := a.Store.GetCard(ctx, cardID)
			if err == nil {
				go func() {
					_, _ = a.Service.Runner.Run(context.Background(), card)
				}()
				return true, fmt.Sprintf("Started Deep Research for card %d", cardID)
			}
		}
	case "short", "2":
		h := port.HorizonShortTerm
		st := port.StatusInProgress
		if a.Store != nil {
			_, _ = a.Store.UpdateCard(ctx, cardID, port.CardPatch{Horizon: &h, Status: &st})
			return true, fmt.Sprintf("Card %d moved to Short-term (Doing)", cardID)
		}
	case "med", "medium", "3":
		h := port.HorizonMediumTerm
		st := port.StatusToDo
		if a.Store != nil {
			_, _ = a.Store.UpdateCard(ctx, cardID, port.CardPatch{Horizon: &h, Status: &st})
			return true, fmt.Sprintf("Card %d moved to Medium-term (To Do)", cardID)
		}
	case "long", "4":
		h := port.HorizonLongTerm
		st := port.StatusToDo
		if a.Store != nil {
			_, _ = a.Store.UpdateCard(ctx, cardID, port.CardPatch{Horizon: &h, Status: &st})
			return true, fmt.Sprintf("Card %d moved to Long-term", cardID)
		}
	case "discard", "x", "shelve":
		st := port.StatusShelved
		if a.Store != nil {
			_, _ = a.Store.UpdateCard(ctx, cardID, port.CardPatch{Status: &st})
			return true, fmt.Sprintf("Card %d shelved", cardID)
		}
	}
	return false, ""
}
