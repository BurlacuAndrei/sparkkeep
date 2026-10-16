// Package web serves the JSON API (/api/v1) and the embedded dashboard
// (index.html + app.js) from one binary, same origin — no CORS, no build
// toolchain.
package web

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"

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
	// sessions maps a minted session token to its expiry time.
	sessions sync.Map

	loginMu    sync.Mutex
	loginFails map[string]loginFail // keyed by client IP
}

// authCookie holds an opaque session token minted by verifyToken/setup, so the
// dashboard survives a reload without re-sending the Authorization header.
const authCookie = "sparkkeep_auth"

const (
	// sessionTTL bounds how long a minted cookie authorizes before re-verifying.
	// It matches the cookie Max-Age so both expire together.
	sessionTTL = 30 * 24 * time.Hour
	// loginMaxFailures consecutive failed verify attempts from one IP within
	// loginFailWindow are rejected with 429 until the window passes.
	loginMaxFailures = 5
	loginFailWindow  = 15 * time.Minute
	// loginSweepThreshold caps the failed-login map: once it holds this many
	// entries, expired ones are evicted before a new one is added so a flood of
	// distinct source IPs cannot grow it without bound.
	loginSweepThreshold = 1024
)

// loginFail tracks failed verify attempts for one client IP.
type loginFail struct {
	count   int
	resetAt time.Time
}

// New returns a http.Handler routing /api/v1/* and the /assets static files
// (/ serves index.html). When cfg.AuthToken is set every request must carry a
// matching token.
func New(store port.Store, svc *core.Service, cfg config.Config) http.Handler {
	if svc != nil && svc.Store == nil {
		svc.Store = store
	}
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
	mux.HandleFunc("POST /api/v1/export/obsidian", a.syncObsidian)
	mux.HandleFunc("POST /api/v1/webhooks/test", a.testWebhook)
	return securityHeaders(a.authMiddleware(mux))
}

// csp is the Content-Security-Policy sent on every response. 'unsafe-inline'
// styles are required: React injects inline styles and the standalone research
// report template carries an inline <style>.
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'"

// securityHeaders sets hardening headers on every response. It wraps the whole
// handler so static assets and public paths get them too. HSTS is only sent
// when secureCookie reports a trusted TLS/proxy request.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Content-Security-Policy", csp)
		if secureCookie(r) {
			h.Set("Strict-Transport-Security", "max-age=31536000")
		}
		next.ServeHTTP(w, r)
	})
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
	if strings.HasPrefix(p, "/api/v1/research/") {
		rest := strings.TrimPrefix(p, "/api/v1/research/")
		if rest == "" || strings.Contains(rest, "/") {
			return false
		}
		if _, err := strconv.ParseInt(rest, 10, 64); err != nil {
			return false
		}
		return html
	}
	return false
}
func (a *api) hasAuth(ctx context.Context) bool {
	if a.authToken != "" {
		return true
	}
	if a.store != nil {
		if tok, err := a.store.GetSetting(ctx, "auth_token"); err == nil && tok != "" {
			return true
		}
		if apiTok, err := a.store.GetSetting(ctx, "api_token"); err == nil && apiTok != "" {
			return true
		}
	}
	return false
}

func (a *api) validateToken(ctx context.Context, got string) bool {
	if got == "" {
		return false
	}
	// Only minted session tokens are served from the cache. Credentials are
	// re-verified every request so an out-of-band passphrase change revokes the
	// old one without a restart.
	// shortcut: raw credentials re-run bcrypt per request for prompt revocation; rate-limit at the proxy if exposed publicly.
	if v, ok := a.sessions.Load(got); ok {
		if exp, ok := v.(time.Time); ok && time.Now().Before(exp) {
			return true
		}
		a.sessions.Delete(got)
	}
	if a.authToken != "" {
		if subtle.ConstantTimeCompare([]byte(got), []byte(a.authToken)) == 1 {
			return true
		}
	}
	if a.store != nil {
		if apiTok, err := a.store.GetSetting(ctx, "api_token"); err == nil && apiTok != "" {
			if subtle.ConstantTimeCompare([]byte(got), []byte(apiTok)) == 1 {
				return true
			}
		}
		if stored, err := a.store.GetSetting(ctx, "auth_token"); err == nil && stored != "" {
			if strings.HasPrefix(stored, "$2a$") || strings.HasPrefix(stored, "$2b$") {
				if bcrypt.CompareHashAndPassword([]byte(stored), []byte(got)) == nil {
					return true
				}
			} else {
				if subtle.ConstantTimeCompare([]byte(got), []byte(stored)) == 1 {
					// Auto-upgrade legacy plaintext passphrase to salted bcrypt hash
					if hash, err := bcrypt.GenerateFromPassword([]byte(got), bcrypt.DefaultCost); err == nil {
						_ = a.store.SetSetting(ctx, "auth_token", string(hash))
					}
					return true
				}
			}
		}
	}
	return false
}

// clearSessions drops every minted session, revoking cookies without touching
// verified credentials.
func (a *api) clearSessions() {
	a.sessions.Range(func(key, value any) bool {
		a.sessions.Delete(key)
		return true
	})
}

// newSessionToken mints an opaque cookie value so the auth cookie never carries
// the passphrase or its hash.
func newSessionToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// newSession mints a session token and records its expiry, opportunistically
// sweeping expired entries so the map cannot grow without bound.
func (a *api) newSession() (string, error) {
	tok, err := newSessionToken()
	if err != nil {
		return "", err
	}
	now := time.Now()
	a.sessions.Range(func(key, value any) bool {
		if exp, ok := value.(time.Time); ok && now.After(exp) {
			a.sessions.Delete(key)
		}
		return true
	})
	a.sessions.Store(tok, now.Add(sessionTTL))
	return tok, nil
}

// secureCookie reports whether the auth cookie should carry the Secure flag:
// when the request is served over TLS, or when X-Forwarded-Proto says so. The
// header is trusted unconditionally — strip it at the edge when not behind a
// TLS-terminating proxy.
func secureCookie(r *http.Request) bool {
	return r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

// clientIP is the peer host from RemoteAddr. X-Forwarded-For is deliberately
// ignored: it is spoofable and would let an attacker evade the login throttle.
func clientIP(r *http.Request) string {
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

// loginAllowed reports whether ip has not exceeded the failed-attempt limit.
func (a *api) loginAllowed(ip string) bool {
	a.loginMu.Lock()
	defer a.loginMu.Unlock()
	f, ok := a.loginFails[ip]
	if !ok || time.Now().After(f.resetAt) {
		return true
	}
	return f.count < loginMaxFailures
}

// recordLoginFailure counts a failed verify attempt, starting a fresh window
// after the previous one elapsed. Once the map is large it evicts expired
// entries so a flood of distinct source IPs cannot grow it without bound.
func (a *api) recordLoginFailure(ip string) {
	a.loginMu.Lock()
	defer a.loginMu.Unlock()
	if a.loginFails == nil {
		a.loginFails = map[string]loginFail{}
	}
	now := time.Now()
	if len(a.loginFails) >= loginSweepThreshold {
		for k, v := range a.loginFails {
			if now.After(v.resetAt) {
				delete(a.loginFails, k)
			}
		}
	}
	f := a.loginFails[ip]
	if f.resetAt.IsZero() || now.After(f.resetAt) {
		f = loginFail{resetAt: now.Add(loginFailWindow)}
	}
	f.count++
	a.loginFails[ip] = f
}

// clearLoginFailures resets the counter after a successful verify.
func (a *api) clearLoginFailures(ip string) {
	a.loginMu.Lock()
	defer a.loginMu.Unlock()
	delete(a.loginFails, ip)
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

// presentedToken reads the token from Authorization: Bearer or the auth cookie.
// Query parameters are never accepted (a token in the URL leaks into logs,
// referrers, and browser history).
func presentedToken(r *http.Request) string {
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	if c, err := r.Cookie(authCookie); err == nil {
		return c.Value
	}
	return ""
}

// authMiddleware rejects requests without the configured token. An empty
// token leaves everything open, which is the default. An HTML request without
// a token still gets the SPA shell so the dashboard can ask for one; the API
// gets a 401 and the client shows the unlock modal.
func (a *api) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !a.hasAuth(r.Context()) || isPublicPath(r) || a.validateToken(r.Context(), presentedToken(r)) {
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
