package web

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"sparkkeep/internal/feed"
	"sparkkeep/internal/port"
)

func (a *api) serveFeed(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Get token from query parameter
	token := r.URL.Query().Get("token")
	if token == "" {
		writeErr(w, http.StatusUnauthorized, "token required")
		return
	}

	// Parse filters
	filter := feed.FeedFilter{}

	// status=doing,done
	if status := r.URL.Query().Get("status"); status != "" {
		for _, s := range strings.Split(status, ",") {
			s = strings.TrimSpace(s)
			if s != "" {
				filter.Status = append(filter.Status, s)
			}
		}
	}

	// type=article,tool
	if cardType := r.URL.Query().Get("type"); cardType != "" {
		for _, t := range strings.Split(cardType, ",") {
			t = strings.TrimSpace(t)
			if t != "" {
				filter.Type = append(filter.Type, t)
			}
		}
	}

	// research_only=1
	if researchOnly := r.URL.Query().Get("research_only"); researchOnly == "1" || strings.ToLower(researchOnly) == "true" {
		filter.ResearchOnly = true
	}

	// since=RFC3339
	if sinceStr := r.URL.Query().Get("since"); sinceStr != "" {
		if since, err := time.Parse(time.RFC3339, sinceStr); err == nil {
			filter.Since = &since
		} else {
			writeErr(w, http.StatusBadRequest, "invalid since parameter (use RFC3339)")
			return
		}
	}

	// limit (max 100)
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if limit, err := strconv.Atoi(limitStr); err == nil {
			filter.Limit = limit
		}
	}

	// Generate feed
	xmlBytes, err := feed.GenerateFeed(ctx, a.store, token, filter)
	if err != nil {
		if strings.Contains(err.Error(), "invalid token") {
			writeErr(w, http.StatusUnauthorized, "invalid token")
			return
		}
		a.fail(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/rss+xml; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store, max-age=0")
	w.Write(xmlBytes)
}

func (a *api) getOutboxToken(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if a.svc == nil {
		writeErr(w, http.StatusInternalServerError, "service not initialized")
		return
	}

	// Check if token exists
	storedHash, err := a.store.GetSetting(ctx, "outbox_feed_token")
	if err != nil && !strings.Contains(err.Error(), "not found") {
		a.fail(w, err)
		return
	}

	if storedHash == "" {
		// No token exists, generate one
		token, err := a.svc.GetOutboxFeedToken(ctx)
		if err != nil {
			// If error is "token exists but plaintext not available", try regenerate
			if strings.Contains(err.Error(), "plaintext not available") {
				token, err = a.svc.RegenerateOutboxFeedToken(ctx)
			}
			if err != nil {
				a.fail(w, err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"ok": true, "token": token})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "token": token})
		return
	}

	// Token exists but we only have the hash - can't show plaintext
	// Return masked version
	masked := maskToken(storedHash)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "token": masked, "has_token": true})
}

func (a *api) regenerateOutboxToken(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if a.svc == nil {
		writeErr(w, http.StatusInternalServerError, "service not initialized")
		return
	}

	token, err := a.svc.RegenerateOutboxFeedToken(ctx)
	if err != nil {
		a.fail(w, err)
		return
	}

	// Build feed URL
	origin := getOrigin(ctx, a.store)
	if origin == "" {
		origin = "https://" + r.Host
	}
	feedURL := origin + "/api/v1/feed.xml?token=" + token

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":       true,
		"token":    token,
		"feed_url": feedURL,
	})
}

// maskToken creates a masked version of a token for display
func maskToken(hash string) string {
	// Since we only have the bcrypt hash, we can't show the actual token
	// Return a placeholder indicating a token exists
	return "sk_••••••••••••••••"
}

// getOrigin returns the origin URL from settings or request
func getOrigin(ctx context.Context, store port.Store) string {
	if store == nil {
		return ""
	}
	val, err := store.GetSetting(ctx, "origin")
	if err != nil || val == "" {
		return ""
	}
	return val
}
