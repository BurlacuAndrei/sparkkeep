package channel

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"sparkkeep/internal/port"
)

var _ port.ChannelHub = (*Hub)(nil)

const defaultAdapterTimeout = 10 * time.Second

// Hub manages multiple channel adapters and routes notifications.
type Hub struct {
	mu             sync.RWMutex
	adapters       map[string]port.ChannelAdapter
	logf           func(format string, args ...any)
	adapterTimeout time.Duration
}

// NewHub constructs an empty channel hub.
func NewHub(logf func(format string, args ...any)) *Hub {
	if logf == nil {
		logf = func(string, ...any) {}
	}
	return &Hub{
		adapters:       make(map[string]port.ChannelAdapter),
		logf:           logf,
		adapterTimeout: defaultAdapterTimeout,
	}
}

// SetAdapterTimeout overrides the per-adapter timeout for broadcast notifications.
func (h *Hub) SetAdapterTimeout(d time.Duration) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.adapterTimeout = d
}

// Register adds or replaces a channel adapter in the hub.
func (h *Hub) Register(adapter port.ChannelAdapter) {
	if adapter == nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	h.adapters[adapter.ID()] = adapter
	h.logf("channel: registered adapter %s (%s)", adapter.ID(), adapter.Name())
}

// Unregister removes a channel adapter by ID.
func (h *Hub) Unregister(id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.adapters[id]; ok {
		delete(h.adapters, id)
		h.logf("channel: unregistered adapter %s", id)
	}
}

// Get returns the adapter with the given ID.
func (h *Hub) Get(id string) (port.ChannelAdapter, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	a, ok := h.adapters[id]
	return a, ok
}

// Adapters returns a slice of all registered adapters.
func (h *Hub) Adapters() []port.ChannelAdapter {
	h.mu.RLock()
	defer h.mu.RUnlock()
	list := make([]port.ChannelAdapter, 0, len(h.adapters))
	for _, a := range h.adapters {
		list = append(list, a)
	}
	return list
}

// Notify routes notifications to the originating channel adapter, or broadcasts
// to all registered adapters when the source channel is empty, "all", or "web".
func (h *Hub) Notify(ctx context.Context, n port.Notification) error {
	h.mu.RLock()
	adapters := make(map[string]port.ChannelAdapter, len(h.adapters))
	for k, v := range h.adapters {
		adapters[k] = v
	}
	timeout := h.adapterTimeout
	if timeout <= 0 {
		timeout = defaultAdapterTimeout
	}
	h.mu.RUnlock()

	if len(adapters) == 0 {
		return nil
	}

	src := strings.TrimSpace(n.Card.SourceChannel)
	// Specific channel targeted (e.g. "telegram", "discord", "openclaw:whatsapp")
	if src != "" && src != "all" && src != "web" {
		// 1. Direct exact ID match
		if target, ok := adapters[src]; ok {
			return target.Notify(ctx, n)
		}
		// 2. Prefix match (e.g., "openclaw:whatsapp" -> adapter "openclaw")
		if parts := strings.SplitN(src, ":", 2); len(parts) > 1 {
			if target, ok := adapters[parts[0]]; ok {
				return target.Notify(ctx, n)
			}
		}
	}

	// Broadcast to all adapters concurrently
	var (
		wg    sync.WaitGroup
		errMu sync.Mutex
		errs  []error
	)

	wg.Add(len(adapters))
	for id, a := range adapters {
		go func(id string, a port.ChannelAdapter) {
			defer wg.Done()

			actx, cancel := context.WithTimeout(ctx, timeout)
			defer cancel()

			if err := a.Notify(actx, n); err != nil {
				h.logf("channel: notify %s error: %v", id, err)
				errMu.Lock()
				errs = append(errs, fmt.Errorf("%s: %w", id, err))
				errMu.Unlock()
			}
		}(id, a)
	}
	wg.Wait()

	return errors.Join(errs...)
}
