// Package slack provides a Slack channel adapter for Sparkkeep.
// It supports delivering card notifications via Slack Webhook or Web API
// with Block Kit formatting and action buttons.
package slack

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"sparkkeep/internal/port"
)

var _ port.ChannelAdapter = (*Adapter)(nil)

type Config struct {
	WebhookURL string `json:"webhook_url"`
	BotToken   string `json:"bot_token,omitempty"`
	ChannelID  string `json:"channel_id,omitempty"`
	Enabled    bool   `json:"enabled"`
}

// Service abstracts the orchestration methods consumed by the Slack adapter.
type Service interface{}

type Adapter struct {
	WebhookURL string
	BotToken   string
	ChannelID  string
	PublicURL  string
	Service    Service
	Store      port.Store
	Logf       func(format string, args ...any)

	client *http.Client
}

func New(cfg Config, svc Service, st port.Store, publicURL string, logf func(format string, args ...any)) *Adapter {
	if logf == nil {
		logf = func(string, ...any) {}
	}
	return &Adapter{
		WebhookURL: strings.TrimSpace(cfg.WebhookURL),
		BotToken:   strings.TrimSpace(cfg.BotToken),
		ChannelID:  strings.TrimSpace(cfg.ChannelID),
		PublicURL:  publicURL,
		Service:    svc,
		Store:      st,
		Logf:       logf,
		client:     &http.Client{Timeout: 10 * time.Second},
	}
}

func (a *Adapter) ID() string {
	return "slack"
}

func (a *Adapter) Name() string {
	return "Slack"
}

func (a *Adapter) Capabilities() port.ChannelCapabilities {
	return port.ChannelCapabilities{
		SupportsInlineButtons: true,
		SupportsReactions:     true,
		SupportsThreads:       true,
		MarkdownFlavor:        "slack",
		MaxTextLength:         3000,
	}
}

func (a *Adapter) Start(ctx context.Context) error {
	a.logf("slack: adapter initialized")
	return nil
}

func (a *Adapter) logf(format string, args ...any) {
	if a.Logf != nil {
		a.Logf(format, args...)
	}
}

// Notify delivers notifications using Block Kit format.
func (a *Adapter) Notify(ctx context.Context, n port.Notification) error {
	if a.WebhookURL == "" && a.BotToken == "" {
		return nil
	}

	payload := a.buildBlockPayload(n)
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	targetURL := a.WebhookURL
	var req *http.Request
	if targetURL != "" {
		req, err = http.NewRequestWithContext(ctx, http.MethodPost, targetURL, bytes.NewReader(data))
	} else {
		targetURL = "https://slack.com/api/chat.postMessage"
		req, err = http.NewRequestWithContext(ctx, http.MethodPost, targetURL, bytes.NewReader(data))
		req.Header.Set("Authorization", "Bearer "+a.BotToken)
	}
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := a.client.Do(req)
	if err != nil {
		a.logf("slack: post error: %v", err)
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		a.logf("slack: status %d: %s", resp.StatusCode, string(body))
		return fmt.Errorf("slack: status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

func (a *Adapter) buildBlockPayload(n port.Notification) map[string]any {
	switch n.Kind {
	case "created":
		c := n.Card
		desc := strings.TrimSpace(c.TLDR)
		if desc == "" {
			desc = strings.TrimSpace(c.Summary)
		}

		blocks := []map[string]any{
			{
				"type": "header",
				"text": map[string]any{
					"type": "plain_text",
					"text": fmt.Sprintf("[%s] %s", strings.ToUpper(c.Type), c.Title),
				},
			},
			{
				"type": "section",
				"text": map[string]any{
					"type": "mrkdwn",
					"text": desc,
				},
			},
			{
				"type": "actions",
				"elements": []map[string]any{
					{
						"type":      "button",
						"text":      map[string]any{"type": "plain_text", "text": "🔬 Deep Research"},
						"style":     "primary",
						"action_id": "research",
						"value":     fmt.Sprintf("%d", c.ID),
					},
					{
						"type":      "button",
						"text":      map[string]any{"type": "plain_text", "text": "Short"},
						"action_id": "commit_short",
						"value":     fmt.Sprintf("%d", c.ID),
					},
					{
						"type":      "button",
						"text":      map[string]any{"type": "plain_text", "text": "Medium"},
						"action_id": "commit_med",
						"value":     fmt.Sprintf("%d", c.ID),
					},
					{
						"type":      "button",
						"text":      map[string]any{"type": "plain_text", "text": "Long"},
						"action_id": "commit_long",
						"value":     fmt.Sprintf("%d", c.ID),
					},
					{
						"type":      "button",
						"text":      map[string]any{"type": "plain_text", "text": "✕ Discard"},
						"style":     "danger",
						"action_id": "discard",
						"value":     fmt.Sprintf("%d", c.ID),
					},
				},
			},
		}

		res := map[string]any{
			"text":   c.Title,
			"blocks": blocks,
		}
		if a.ChannelID != "" {
			res["channel"] = a.ChannelID
		}
		return res

	case "research_done":
		res := map[string]any{
			"text": "🔬 Research Complete: " + n.Card.Title,
			"blocks": []map[string]any{
				{
					"type": "header",
					"text": map[string]any{"type": "plain_text", "text": "🔬 Research Complete: " + n.Card.Title},
				},
			},
		}
		if a.ChannelID != "" {
			res["channel"] = a.ChannelID
		}
		return res

	default:
		res := map[string]any{
			"text": fmt.Sprintf("*%s*\n%s", n.Card.Title, n.Card.Summary),
		}
		if a.ChannelID != "" {
			res["channel"] = a.ChannelID
		}
		return res
	}
}
