package webhook

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"sparkkeep/internal/port"
)

type EventType string

const (
	EventCardCreated       EventType = "card.created"
	EventCardUpdated       EventType = "card.updated"
	EventResearchCompleted EventType = "research.completed"
	EventPing              EventType = "ping"
)

type Payload struct {
	Event     EventType `json:"event"`
	Timestamp int64     `json:"timestamp"`
	Data      any       `json:"data"`
}

type Dispatcher struct {
	store  port.SettingsStore
	client *http.Client
	logf   func(format string, args ...any)
	wg     sync.WaitGroup
	mu     sync.RWMutex
	joinWG *sync.WaitGroup
}

func NewDispatcher(store port.SettingsStore, logf func(format string, args ...any)) *Dispatcher {
	if logf == nil {
		logf = func(string, ...any) {}
	}
	return &Dispatcher{
		store:  store,
		client: &http.Client{Timeout: 10 * time.Second},
		logf:   logf,
	}
}

// JoinWaitGroup registers an external WaitGroup that will be incremented for each in-flight dispatch.
func (d *Dispatcher) JoinWaitGroup(wg *sync.WaitGroup) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.joinWG = wg
}

// SetWaitGroup is an alias for JoinWaitGroup.
func (d *Dispatcher) SetWaitGroup(wg *sync.WaitGroup) {
	d.JoinWaitGroup(wg)
}

// Wait blocks until all in-flight background webhook dispatches have completed.
func (d *Dispatcher) Wait() {
	d.wg.Wait()
}

// Close waits for all in-flight background webhook dispatches to complete.
func (d *Dispatcher) Close() {
	d.Wait()
}

// Dispatch triggers an asynchronous outbound HTTP POST if a webhook URL is configured.
func (d *Dispatcher) Dispatch(ctx context.Context, event EventType, data any) {
	if d.store == nil {
		return
	}

	url, err := d.store.GetSetting(ctx, "webhook_url")
	if err != nil || strings.TrimSpace(url) == "" {
		return
	}

	secret, _ := d.store.GetSetting(ctx, "webhook_secret")

	payload := Payload{
		Event:     event,
		Timestamp: time.Now().Unix(),
		Data:      data,
	}

	d.mu.RLock()
	joinWG := d.joinWG
	d.mu.RUnlock()

	d.wg.Add(1)
	if joinWG != nil {
		joinWG.Add(1)
	}

	// Fire and forget in background, tracked by WaitGroup
	go func() {
		defer d.wg.Done()
		if joinWG != nil {
			defer joinWG.Done()
		}

		bgCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := d.send(bgCtx, url, secret, payload); err != nil {
			d.logf("webhook: dispatch failed for %s to %s: %v", event, url, err)
		}
	}()
}

// SendSync sends a webhook synchronously (used for test ping endpoint).
func (d *Dispatcher) SendSync(ctx context.Context, url, secret string, event EventType, data any) (int, error) {
	payload := Payload{
		Event:     event,
		Timestamp: time.Now().Unix(),
		Data:      data,
	}
	respCode := 0
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return 0, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Sparkkeep-Webhook/1.0")

	if secret != "" {
		sig := computeHMAC(bodyBytes, secret)
		req.Header.Set("X-Sparkkeep-Signature", "sha256="+sig)
	}

	resp, err := d.client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	respCode = resp.StatusCode

	if respCode >= 400 {
		return respCode, fmt.Errorf("remote endpoint returned HTTP %d", respCode)
	}
	return respCode, nil
}

func (d *Dispatcher) send(ctx context.Context, url, secret string, payload Payload) error {
	_, err := d.SendSync(ctx, url, secret, payload.Event, payload.Data)
	return err
}

func computeHMAC(message []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(message)
	return hex.EncodeToString(mac.Sum(nil))
}
