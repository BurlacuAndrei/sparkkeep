package port

import "context"

type Notification struct {
	Kind string // "created"|"done"|"research_done"|"research_failed"|"analysis_failed"|"duplicate"|"hello"
	Card Card
	Res  *Research // set when Kind is research_*
	Text string
}

type Channel interface {
	Notify(ctx context.Context, n Notification) error
}

// ChannelCapabilities describes what rich features a channel adapter supports.
type ChannelCapabilities struct {
	SupportsInlineButtons bool   `json:"supports_inline_buttons"`
	SupportsReactions     bool   `json:"supports_reactions"`
	SupportsThreads       bool   `json:"supports_threads"`
	MarkdownFlavor        string `json:"markdown_flavor"` // "telegram" | "discord" | "slack" | "markdown"
	MaxTextLength         int    `json:"max_text_length"`
}

// ChannelAdapter is a pluggable transport connector (Telegram, Discord, Slack, OpenClaw, etc.).
type ChannelAdapter interface {
	Channel
	ID() string
	Name() string
	Start(ctx context.Context) error
	Capabilities() ChannelCapabilities
}

// ChannelHub coordinates multiple registered channel adapters and handles routing/broadcasting.
type ChannelHub interface {
	Channel
	Register(adapter ChannelAdapter)
	Unregister(id string)
	Get(id string) (ChannelAdapter, bool)
	Adapters() []ChannelAdapter
}
