package channel

import (
	"context"
	"errors"
	"testing"

	"sparkkeep/internal/port"
)

type mockAdapter struct {
	id     string
	name   string
	notifs []port.Notification
	err    error
}

func (m *mockAdapter) ID() string                        { return m.id }
func (m *mockAdapter) Name() string                      { return m.name }
func (m *mockAdapter) Start(ctx context.Context) error   { return nil }
func (m *mockAdapter) Capabilities() port.ChannelCapabilities {
	return port.ChannelCapabilities{SupportsInlineButtons: true, MarkdownFlavor: "standard"}
}
func (m *mockAdapter) Notify(ctx context.Context, n port.Notification) error {
	m.notifs = append(m.notifs, n)
	return m.err
}

func TestHubRouting(t *testing.T) {
	hub := NewHub(nil)
	tg := &mockAdapter{id: "telegram", name: "Telegram"}
	discord := &mockAdapter{id: "discord", name: "Discord"}
	openclaw := &mockAdapter{id: "openclaw", name: "OpenClaw Bridge"}

	hub.Register(tg)
	hub.Register(discord)
	hub.Register(openclaw)

	if len(hub.Adapters()) != 3 {
		t.Fatalf("expected 3 adapters, got %d", len(hub.Adapters()))
	}

	ctx := context.Background()

	// 1. Direct targeted routing to telegram
	err := hub.Notify(ctx, port.Notification{
		Kind: "created",
		Card: port.Card{ID: 1, Title: "TG Card", SourceChannel: "telegram"},
	})
	if err != nil {
		t.Fatalf("unexpected notify error: %v", err)
	}
	if len(tg.notifs) != 1 || len(discord.notifs) != 0 || len(openclaw.notifs) != 0 {
		t.Fatalf("expected only telegram to receive notification, got tg=%d dc=%d oc=%d", len(tg.notifs), len(discord.notifs), len(openclaw.notifs))
	}

	// 2. Prefix targeted routing (openclaw:whatsapp -> openclaw adapter)
	err = hub.Notify(ctx, port.Notification{
		Kind: "created",
		Card: port.Card{ID: 2, Title: "WA Card", SourceChannel: "openclaw:whatsapp"},
	})
	if err != nil {
		t.Fatalf("unexpected notify error: %v", err)
	}
	if len(openclaw.notifs) != 1 || len(discord.notifs) != 0 || len(tg.notifs) != 1 {
		t.Fatalf("expected openclaw to receive prefixed notification")
	}

	// 3. Broadcast when source is empty or "all"
	err = hub.Notify(ctx, port.Notification{
		Kind: "hello",
		Card: port.Card{ID: 3, Title: "Broadcast Card", SourceChannel: "all"},
	})
	if err != nil {
		t.Fatalf("unexpected broadcast notify error: %v", err)
	}
	if len(tg.notifs) != 2 || len(discord.notifs) != 1 || len(openclaw.notifs) != 2 {
		t.Fatalf("expected all adapters to receive broadcast")
	}

	// 4. Unregister
	hub.Unregister("discord")
	if _, ok := hub.Get("discord"); ok {
		t.Fatalf("expected discord to be unregistered")
	}
	if len(hub.Adapters()) != 2 {
		t.Fatalf("expected 2 adapters after unregister")
	}
}

func TestHubErrorAggregation(t *testing.T) {
	hub := NewHub(nil)
	failing := &mockAdapter{id: "failing", name: "Failing", err: errors.New("network down")}
	working := &mockAdapter{id: "working", name: "Working"}

	hub.Register(failing)
	hub.Register(working)

	err := hub.Notify(context.Background(), port.Notification{
		Kind: "created",
		Card: port.Card{ID: 1, SourceChannel: "all"},
	})
	if err == nil {
		t.Fatalf("expected error from failing adapter, got nil")
	}
	if len(working.notifs) != 1 {
		t.Fatalf("working adapter should still have received notification despite failing peer")
	}
}
