// Package web serves the JSON API (/api/v1) and the embedded dashboard
// (index.html + app.js) from one binary, same origin — no CORS, no build
// toolchain.
package web

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"sparkkeep/internal/config"
	"sparkkeep/internal/core"
	"sparkkeep/internal/port"
)

// api routes the mux to the injected Store and Service.
type api struct {
	store     port.Store
	svc       *core.Service
	uploadDir string
	maxUpload int64
	authToken string
	tgToken   string
}

// authCookie holds a token the client has already verified, so the dashboard
// survives a reload without re-sending the Authorization header.
const authCookie = "sparkkeep_token"

// New returns a http.Handler routing /api/v1/* and the /assets static files
// (/ serves index.html). When cfg.AuthToken is set every request must carry a
// matching token.
func New(store port.Store, svc *core.Service, cfg config.Config) http.Handler {
	a := &api{
		store: store, svc: svc,
		uploadDir: cfg.UploadDir,
		maxUpload: int64(cfg.MaxUploadMB) << 20,
		authToken: cfg.AuthToken,
		tgToken:   cfg.TGToken,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /", a.index)
	mux.Handle("GET /assets/", cacheAssets(http.StripPrefix("/assets/", staticFiles())))
	mux.HandleFunc("GET /manifest.json", serveEmbedded("dist/manifest.json", "application/manifest+json; charset=utf-8"))
	sw := serveEmbedded("dist/sw.js", "application/javascript; charset=utf-8")
	mux.HandleFunc("GET /sw.js", func(w http.ResponseWriter, r *http.Request) {
		// Scopes the worker at the root so /assets/ and /api/ are covered.
		w.Header().Set("Service-Worker-Allowed", "/")
		sw(w, r)
	})
	mux.HandleFunc("GET /icon.svg", serveEmbedded("dist/icon.svg", "image/svg+xml"))
	mux.HandleFunc("GET /api/v1/health", a.health)
	mux.HandleFunc("GET /api/v1/cards", a.listCards)
	mux.HandleFunc("POST /api/v1/cards", a.createCard)
	mux.HandleFunc("GET /api/v1/cards/{id}", a.getCard)
	mux.HandleFunc("PATCH /api/v1/cards/{id}", a.patchCard)
	mux.HandleFunc("DELETE /api/v1/cards/{id}", a.deleteCard)
	mux.HandleFunc("POST /api/v1/cards/{id}/comments", a.createCardComment)
	mux.HandleFunc("POST /api/v1/cards/{id}/retry", a.retryCard)
	mux.HandleFunc("POST /api/v1/cards/batch-shelve-stale", a.batchShelveStale)
	mux.HandleFunc("GET /api/v1/cards/{id}/export.md", a.exportMarkdown)
	mux.HandleFunc("GET /api/v1/cards/{id}/research", a.getCardResearch)
	mux.HandleFunc("GET /api/v1/tags", a.listTags)
	mux.HandleFunc("GET /api/v1/digest", a.weeklyDigest)
	mux.HandleFunc("POST /api/v1/digest/synthesize", a.synthesizeDigest)
	mux.HandleFunc("GET /api/v1/channels", a.listChannels)
	mux.HandleFunc("POST /api/v1/channels/{id}/test", a.testChannel)
	mux.HandleFunc("POST /api/v1/channels/openclaw/webhook", a.openclawWebhook)
	mux.HandleFunc("POST /api/v1/channels/discord/interactions", a.discordInteractions)
	mux.HandleFunc("POST /api/v1/channels/discord/capture", a.discordCapture)
	mux.HandleFunc("POST /api/v1/digest/push", a.pushDigest)
	mux.HandleFunc("POST /api/v1/digest/telegram", a.pushDigestTelegram)
	mux.HandleFunc("GET /api/v1/research", a.listResearch)
	mux.HandleFunc("POST /api/v1/research", a.triggerResearch)
	mux.HandleFunc("GET /api/v1/research/{id}", a.getResearch)
	mux.HandleFunc("POST /api/v1/research/{id}/feedback", a.setResearchFeedback)
	mux.HandleFunc("GET /api/v1/metrics/pipeline", a.getPipelineMetrics)
	mux.HandleFunc("GET /api/v1/playbooks", a.listPlaybooks)
	mux.HandleFunc("POST /api/v1/playbooks", a.createPlaybook)
	mux.HandleFunc("GET /api/v1/playbooks/{id}", a.getPlaybook)
	mux.HandleFunc("PUT /api/v1/playbooks/{id}", a.updatePlaybook)
	mux.HandleFunc("DELETE /api/v1/playbooks/{id}", a.deletePlaybook)
	mux.HandleFunc("POST /api/v1/playbooks/{id}/duplicate", a.duplicatePlaybook)
	mux.HandleFunc("GET /api/v1/playbook-steps/library", a.getPlaybookStepLibrary)
	mux.HandleFunc("POST /api/v1/research/batch", a.batchQueueResearch)
	mux.HandleFunc("GET /api/v1/research/rules", a.listResearchRules)
	mux.HandleFunc("POST /api/v1/research/rules", a.createResearchRule)
	mux.HandleFunc("PUT /api/v1/research/rules/{id}", a.updateResearchRule)
	mux.HandleFunc("DELETE /api/v1/research/rules/{id}", a.deleteResearchRule)
	mux.HandleFunc("POST /api/v1/research/rules/{id}/run", a.runResearchRule)
	mux.HandleFunc("GET /api/v1/research/quiet-window", a.getQuietWindow)
	mux.HandleFunc("PUT /api/v1/research/quiet-window", a.setQuietWindow)

	mux.HandleFunc("POST /api/v1/capture", a.capture)
	mux.HandleFunc("GET /api/v1/captures/{id}", a.getCapture)
	mux.HandleFunc("GET /api/v1/media/{name}", a.media)
	mux.HandleFunc("POST /api/v1/auth/verify", a.verifyToken)
	mux.HandleFunc("GET /api/v1/setup/status", a.setupStatus)
	mux.HandleFunc("POST /api/v1/setup", a.setup)
	mux.HandleFunc("GET /api/v1/settings", a.getSettings)
	mux.HandleFunc("PATCH /api/v1/settings", a.patchSettings)
	mux.HandleFunc("PUT /api/v1/settings", a.patchSettings)
	mux.HandleFunc("GET /api/v1/license/status", a.getLicenseStatus)
	mux.HandleFunc("POST /api/v1/license/activate", a.activateLicense)
	mux.HandleFunc("POST /api/v1/export/obsidian", a.syncObsidian)
	mux.HandleFunc("POST /api/v1/webhooks/test", a.testWebhook)
	return a.authMiddleware(mux)
}

// --- auth -------------------------------------------------------------------

// isPublicPath reports a request that must stay reachable without a token: the
// PWA shell and its assets (the SPA has to load to render the unlock prompt),
// the health probe, public webhook ingresses (Discord, OpenClaw), verify itself,
// and the standalone research report view. The research report exception is
// GET HTML-only — non-GET methods and JSON callers still need the token.
func isPublicPath(r *http.Request) bool {
	p := r.URL.Path
	switch p {
	case "/api/v1/health", "/api/v1/auth/verify", "/api/v1/setup/status", "/api/v1/setup", "/manifest.json", "/sw.js", "/icon.svg",
		"/api/v1/channels/discord/interactions", "/api/v1/channels/openclaw/webhook":
		return true
	}
	if strings.HasPrefix(p, "/assets/") {
		return true
	}
	if r.Method != http.MethodGet {
		return false
	}
	html := !strings.Contains(r.Header.Get("Accept"), "application/json") &&
		r.URL.Query().Get("format") != "json"
	return html && strings.HasPrefix(p, "/api/v1/research/")
}

func (a *api) effectiveAuthToken(ctx context.Context) string {
	if a.authToken != "" {
		return a.authToken
	}
	if a.store != nil {
		if tok, err := a.store.GetSetting(ctx, "auth_token"); err == nil && tok != "" {
			return tok
		}
	}
	return ""
}

// presentedToken reads the token from Authorization: Bearer, the auth cookie,
// or ?token= (for links opened from another app).
func presentedToken(r *http.Request) string {
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	if c, err := r.Cookie(authCookie); err == nil {
		return c.Value
	}
	return r.URL.Query().Get("token")
}

func tokenMatches(got, want string) bool {
	return got != "" && subtle.ConstantTimeCompare([]byte(got), []byte(want)) == 1
}

// authMiddleware rejects requests without the configured token. An empty
// token leaves everything open, which is the default. An HTML request without
// a token still gets the SPA shell so the dashboard can ask for one; the API
// gets a 401 and the client shows the unlock modal.
func (a *api) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := a.effectiveAuthToken(r.Context())
		if token == "" || isPublicPath(r) || tokenMatches(presentedToken(r), token) {
			next.ServeHTTP(w, r)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/") {
			writeErr(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *api) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// --- plumbing ---------------------------------------------------------------

func pathID(r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	return id, err == nil && id > 0
}

// maxBodyBytes is the limit on request body size for JSON endpoints.
const maxBodyBytes = 1 << 20 // 1 MB

func decodeJSON(w http.ResponseWriter, r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(v)
}

// fail maps a store/service error to the envelope: ErrNotFound → 404, ErrBuiltinReadOnly → 403,
// ErrInvalidPlaybook → 400, else 500.
func (a *api) fail(w http.ResponseWriter, err error) {
	if errors.Is(err, port.ErrNotFound) {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	if errors.Is(err, port.ErrBuiltinReadOnly) {
		writeErr(w, http.StatusForbidden, "builtin playbook is read-only")
		return
	}
	if errors.Is(err, port.ErrInvalidPlaybook) {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeErr(w, http.StatusInternalServerError, err.Error())
}

// writeJSON writes the {ok:..., ...} envelope as application/json.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{"ok": false, "error": msg})
}

func isUniqueConstraint(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, port.ErrConflict) {
		return true
	}
	msg := err.Error()
	return strings.Contains(msg, "UNIQUE constraint failed") ||
		strings.Contains(msg, "unique constraint") ||
		strings.Contains(msg, "idx_cards_source")
}
