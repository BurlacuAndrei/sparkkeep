package web

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"sparkkeep/internal/metrics"
)

func (a *api) livez(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":     true,
		"status": "live",
		"time":   time.Now().UTC().Format(time.RFC3339),
	})
}

func (a *api) readyz(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	// 1. Database Ping
	if a.store != nil {
		if err := a.store.Ping(ctx); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{
				"ok":       false,
				"status":   "not_ready",
				"database": "unreachable: " + err.Error(),
			})
			return
		}
	}

	// 2. Storage Writable Check
	uploadDir := a.uploadDir
	if uploadDir != "" {
		if err := os.MkdirAll(uploadDir, 0o755); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{
				"ok":      false,
				"status":  "not_ready",
				"storage": "cannot create upload dir: " + err.Error(),
			})
			return
		}
		probeFile := filepath.Join(uploadDir, fmt.Sprintf(".readyz_%d.tmp", time.Now().UnixNano()))
		if err := os.WriteFile(probeFile, []byte("ok"), 0o600); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{
				"ok":      false,
				"status":  "not_ready",
				"storage": "upload dir not writable: " + err.Error(),
			})
			return
		}
		_ = os.Remove(probeFile)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":       true,
		"status":   "ready",
		"database": "connected",
		"storage":  "writable",
	})
}

func (a *api) prometheusMetrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	_ = metrics.WritePrometheus(w, a.store)
}
