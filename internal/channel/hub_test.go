package channel

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"sparkkeep/internal/port"
)

type mockAdapter struct {
	mu     sync.Mutex
	id     string
	name   string
	notifs []port.Notification
	err    error
	delay  time.Duration
}

func (m *mockAdapter) ID() string                        { return m.id }
func (m *mockAdapter) Name() string                      { return m.name }
func (m *mockAdapter) Start(ctx context.Context) error   { return nil }
func (m *mockAdapter) Capabilities() port.ChannelCapabilities {
	return port.ChannelCapabilities{SupportsInlineButtons: true, MarkdownFlavor: "standard"}
}
func (m *mockAdapter) Notify(ctx context.Context, n port.Notification) error {
	if m.delay > 0 {
		select {
		case <-time.After(m.delay):
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	m.mu.Lock()
	m.notifs = append(m.notifs, n)
	m.mu.Unlock()
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

func TestHubBroadcastParallel(t *testing.T) {
	hub := NewHub(nil)
	delay := 50 * time.Millisecond
	a1 := &mockAdapter{id: "mock1", name: "Mock 1", delay: delay}
	a2 := &mockAdapter{id: "mock2", name: "Mock 2", delay: delay}

	hub.Register(a1)
	hub.Register(a2)

	start := time.Now()
	err := hub.Notify(context.Background(), port.Notification{
		Kind: "created",
		Card: port.Card{ID: 10, Title: "Parallel Broadcast", SourceChannel: "all"},
	})
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("unexpected notify error: %v", err)
	}

	if len(a1.notifs) != 1 || len(a2.notifs) != 1 {
		t.Fatalf("expected both adapters to receive notification, got a1=%d, a2=%d", len(a1.notifs), len(a2.notifs))
	}

	// Two adapters each sleeping 50ms would take >= 100ms sequentially.
	// In parallel, they should complete together in roughly 50-60ms.
	if elapsed >= 90*time.Millisecond {
		t.Fatalf("expected parallel execution (<90ms), took %v", elapsed)
	}
}

func TestHubBroadcastErrorResilience(t *testing.T) {
	hub := NewHub(nil)
	delay := 20 * time.Millisecond
	errAdapter := &mockAdapter{
		id:    "failing",
		name:  "Failing Adapter",
		err:   errors.New("adapter failed"),
		delay: delay,
	}
	okAdapter1 := &mockAdapter{
		id:    "ok1",
		name:  "OK Adapter 1",
		delay: delay,
	}
	okAdapter2 := &mockAdapter{
		id:    "ok2",
		name:  "OK Adapter 2",
		delay: delay,
	}

	hub.Register(errAdapter)
	hub.Register(okAdapter1)
	hub.Register(okAdapter2)

	err := hub.Notify(context.Background(), port.Notification{
		Kind: "alert",
		Card: port.Card{ID: 20, Title: "Broadcast Resilience", SourceChannel: ""},
	})

	if err == nil {
		t.Fatalf("expected combined error, got nil")
	}
	if !strings.Contains(err.Error(), "adapter failed") {
		t.Fatalf("expected error to contain adapter error, got: %v", err)
	}

	// Verify that error in failing adapter did not cancel or prevent delivery to the other adapters
	if len(okAdapter1.notifs) != 1 {
		t.Fatalf("okAdapter1 should have received notification, got %d", len(okAdapter1.notifs))
	}
	if len(okAdapter2.notifs) != 1 {
		t.Fatalf("okAdapter2 should have received notification, got %d", len(okAdapter2.notifs))
	}
	if len(errAdapter.notifs) != 1 {
		t.Fatalf("errAdapter should have processed notification, got %d", len(errAdapter.notifs))
	}
}

func TestHubBroadcastTimeout(t *testing.T) {
	hub := NewHub(nil)
	hub.SetAdapterTimeout(40 * time.Millisecond)

	hanging := &mockAdapter{
		id:    "hanging",
		name:  "Hanging Adapter",
		delay: 500 * time.Millisecond,
	}
	fast := &mockAdapter{
		id:   "fast",
		name: "Fast Adapter",
	}

	hub.Register(hanging)
	hub.Register(fast)

	start := time.Now()
	err := hub.Notify(context.Background(), port.Notification{
		Kind: "created",
		Card: port.Card{ID: 30, Title: "Timeout Broadcast", SourceChannel: "web"},
	})
	elapsed := time.Since(start)

	if err == nil {
		t.Fatalf("expected timeout error from hanging adapter, got nil")
	}
	if !strings.Contains(err.Error(), "context deadline exceeded") {
		t.Fatalf("expected context deadline exceeded error, got: %v", err)
	}
	if len(fast.notifs) != 1 {
		t.Fatalf("fast adapter should succeed despite hanging adapter")
	}
	if elapsed >= 250*time.Millisecond {
		t.Fatalf("expected hub to return after adapter timeout (~40ms), took %v", elapsed)
	}
}
