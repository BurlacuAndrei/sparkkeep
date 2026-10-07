// Package web serves the JSON API (/api/v1) and the embedded dashboard
// (index.html + app.js) from one binary, same origin — no CORS, no build
// toolchain.
package web

import (
	"context"
	"crypto/subtle"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"io/fs"
	"net/http"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"sparkkeep/internal/config"
	"sparkkeep/internal/core"
	"sparkkeep/internal/license"
	"sparkkeep/internal/obsidian"
	"sparkkeep/internal/port"
	"sparkkeep/internal/webhook"
)

//go:embed dist/*
var distFS embed.FS

// researchReport renders a single research row as a readable page for the
// link Telegram sends. Findings are model markdown, kept as escaped
// pre-wrapped text — no markdown renderer dependency.
const researchReportHTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>sparkkeep · research #{{.ID}}</title>
<style>
  body { margin: 0 auto; max-width: 46rem; padding: 24px; font-family: system-ui, sans-serif; background: #111; color: #eee; }
  a { color: #9cdcfe; }
  .meta { color: #aaa; font-size: 13px; margin-bottom: 16px; }
  pre { white-space: pre-wrap; word-wrap: break-word; color: #ddd; font-family: inherit; line-height: 1.5; }
  .error { color: #ff8a8a; }
</style>
</head>
<body>
  <p><a href="/">&larr; sparkkeep dashboard</a></p>
  <h2>Research #{{.ID}} <span class="meta">[{{.Status}}]</span></h2>
  {{if .Query}}<p><strong>Query:</strong> {{.Query}}</p>{{end}}
  {{if .Error}}<p class="error">{{.Error}}</p>{{end}}
  <pre>{{.Findings}}</pre>
</body>
</html>`

// researchTmpl is the parsed template for the research report page.
// Parsed once at init — never changes between requests.
var researchTmpl = template.Must(template.New("research").Parse(researchReportHTML))

// api routes the mux to the injected Store and Service.
type api struct {
	store     port.Store
	svc       *core.Service
	uploadDir string
	maxUpload int64
	authToken string
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
	mux.HandleFunc("POST /api/v1/cards/{id}/retry", a.retryCard)
	mux.HandleFunc("POST /api/v1/cards/batch-shelve-stale", a.batchShelveStale)
	mux.HandleFunc("GET /api/v1/cards/{id}/export.md", a.exportMarkdown)
	mux.HandleFunc("GET /api/v1/tags", a.listTags)
	mux.HandleFunc("GET /api/v1/digest", a.weeklyDigest)
	mux.HandleFunc("GET /api/v1/research", a.listResearch)
	mux.HandleFunc("POST /api/v1/research", a.triggerResearch)
	mux.HandleFunc("GET /api/v1/research/{id}", a.getResearch)
	mux.HandleFunc("POST /api/v1/capture", a.capture)
	mux.HandleFunc("GET /api/v1/media/{name}", a.media)
	mux.HandleFunc("POST /api/v1/auth/verify", a.verifyToken)
	mux.HandleFunc("GET /api/v1/setup/status", a.setupStatus)
	mux.HandleFunc("POST /api/v1/setup", a.setup)
	mux.HandleFunc("GET /api/v1/settings", a.getSettings)
	mux.HandleFunc("PATCH /api/v1/settings", a.patchSettings)
	mux.HandleFunc("GET /api/v1/license/status", a.getLicenseStatus)
	mux.HandleFunc("POST /api/v1/license/activate", a.activateLicense)
	mux.HandleFunc("POST /api/v1/export/obsidian", a.syncObsidian)
	mux.HandleFunc("POST /api/v1/webhooks/test", a.testWebhook)
	return a.authMiddleware(mux)
}

// staticFiles roots the embed at the dist/assets subdirectory so /assets/app.js
// resolves to dist/assets/app.js.
func staticFiles() http.Handler {
	sub, err := fs.Sub(distFS, "dist/assets")
	if err != nil {
		panic(err)
	}
	return http.FileServer(http.FS(sub))
}

// cacheAssets marks built assets as cacheable; index.html (which can change
// between deploys) is deliberately excluded.
func cacheAssets(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=3600")
		h.ServeHTTP(w, r)
	})
}

func (a *api) index(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	b, err := distFS.ReadFile("dist/index.html")
	if err != nil {
		a.fail(w, err)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write(b)
}

// serveEmbedded returns a handler for one PWA file copied out of
// frontend/public/ by the Vite build. The content type is explicit because
// the browser rejects a manifest or a worker served as octet-stream.
func serveEmbedded(path, contentType string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		b, err := distFS.ReadFile(path)
		if err != nil {
			http.Error(w, "pwa asset not built", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", contentType)
		w.Write(b)
	}
}

// --- auth -------------------------------------------------------------------

// isPublicPath reports a request that must stay reachable without a token: the
// PWA shell and its assets (the SPA has to load to render the unlock prompt),
// the health probe, the standalone research report, and verify itself. The
// report exception is HTML-only — a JSON caller still needs the token.
func isPublicPath(r *http.Request) bool {
	p := r.URL.Path
	switch p {
	case "/api/v1/health", "/api/v1/auth/verify", "/api/v1/setup/status", "/api/v1/setup", "/manifest.json", "/sw.js", "/icon.svg":
		return true
	}
	if strings.HasPrefix(p, "/assets/") {
		return true
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

// verifyToken exchanges a token for the long-lived cookie the browser then
// sends on every request. It stays public because the token travels in the
// body, not a header.
func (a *api) verifyToken(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Token string `json:"token"`
	}
	if err := decodeJSON(w, r, &b); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request: "+err.Error())
		return
	}
	tok := b.Token
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		tok = strings.TrimPrefix(h, "Bearer ")
	}
	required := a.effectiveAuthToken(r.Context())
	if !tokenMatches(tok, required) {
		writeErr(w, http.StatusUnauthorized, "invalid token")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name: authCookie, Value: tok, Path: "/",
		SameSite: http.SameSiteLaxMode, MaxAge: 31536000,
	})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *api) isConfigured(ctx context.Context) bool {
	if a.authToken != "" {
		return true
	}
	if a.store != nil {
		if val, err := a.store.GetSetting(ctx, "setup_completed"); err == nil && val == "true" {
			return true
		}
		if val, err := a.store.GetSetting(ctx, "auth_token"); err == nil && val != "" {
			return true
		}
	}
	return false
}

func (a *api) setupStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	settings, err := a.store.ListSettings(ctx)
	if err != nil {
		settings = map[string]string{}
	}
	configured := a.isConfigured(ctx)
	hasAuth := a.effectiveAuthToken(ctx) != ""
	hasLLMKey := settings["llm_key"] != ""
	llmBase := settings["llm_base"]
	llmModel := settings["llm_model"]

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":            true,
		"is_configured": configured,
		"has_auth":      hasAuth,
		"has_llm_key":   hasLLMKey,
		"llm_base":      llmBase,
		"llm_model":     llmModel,
	})
}

func (a *api) setup(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if a.isConfigured(ctx) {
		token := a.effectiveAuthToken(ctx)
		if !tokenMatches(presentedToken(r), token) {
			writeErr(w, http.StatusForbidden, "forbidden: setup already completed")
			return
		}
	}

	var b struct {
		AuthToken string `json:"auth_token"`
		LLMBase   string `json:"llm_base"`
		LLMKey    string `json:"llm_key"`
		LLMModel  string `json:"llm_model"`
	}
	if err := decodeJSON(w, r, &b); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request: "+err.Error())
		return
	}

	if b.AuthToken != "" {
		if err := a.store.SetSetting(ctx, "auth_token", b.AuthToken); err != nil {
			a.fail(w, err)
			return
		}
	}
	if b.LLMBase != "" {
		if err := a.store.SetSetting(ctx, "llm_base", b.LLMBase); err != nil {
			a.fail(w, err)
			return
		}
	}
	if b.LLMKey != "" {
		if err := a.store.SetSetting(ctx, "llm_key", b.LLMKey); err != nil {
			a.fail(w, err)
			return
		}
	}
	if b.LLMModel != "" {
		if err := a.store.SetSetting(ctx, "llm_model", b.LLMModel); err != nil {
			a.fail(w, err)
			return
		}
	}
	if err := a.store.SetSetting(ctx, "setup_completed", "true"); err != nil {
		a.fail(w, err)
		return
	}

	if a.svc != nil {
		a.svc.UpdateLLMConfig(b.LLMBase, b.LLMKey, b.LLMModel)
	}

	if b.LLMModel != "" || b.LLMBase != "" {
		initial := []storedLLMProfile{{
			ID:        "default",
			Name:      "Default",
			BaseURL:   b.LLMBase,
			Model:     b.LLMModel,
			APIKey:    b.LLMKey,
			IsDefault: true,
		}}
		if data, err := json.Marshal(initial); err == nil && a.store != nil {
			_ = a.store.SetSetting(ctx, "llm_profiles", string(data))
		}
	}

	effectiveTok := a.effectiveAuthToken(ctx)
	if effectiveTok != "" {
		http.SetCookie(w, &http.Cookie{
			Name: authCookie, Value: effectiveTok, Path: "/",
			SameSite: http.SameSiteLaxMode, MaxAge: 31536000,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "token": effectiveTok})
}

// LLMProfile represents a configured LLM endpoint and model.
// API keys are never exposed in plaintext.
type LLMProfile struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	BaseURL   string `json:"base_url"`
	Model     string `json:"model"`
	HasKey    bool   `json:"has_key"`
	IsDefault bool   `json:"is_default"`
}

type storedLLMProfile struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	BaseURL   string `json:"base_url"`
	Model     string `json:"model"`
	APIKey    string `json:"api_key"`
	IsDefault bool   `json:"is_default"`
}

type llmProfileInput struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	BaseURL   string `json:"base_url"`
	Model     string `json:"model"`
	APIKey    string `json:"api_key,omitempty"`
	IsDefault bool   `json:"is_default"`
}

func (a *api) loadStoredProfiles(ctx context.Context) []storedLLMProfile {
	if a.store == nil {
		return nil
	}
	val, err := a.store.GetSetting(ctx, "llm_profiles")
	if err != nil || strings.TrimSpace(val) == "" {
		return nil
	}
	var profs []storedLLMProfile
	if err := json.Unmarshal([]byte(val), &profs); err != nil {
		return nil
	}
	return profs
}

func (a *api) ensureStoredProfiles(ctx context.Context, settings map[string]string) []storedLLMProfile {
	profs := a.loadStoredProfiles(ctx)
	if len(profs) > 0 {
		return profs
	}

	base := settings["llm_base"]
	model := settings["llm_model"]
	key := settings["llm_key"]
	if model == "" && a.svc != nil && a.svc.Analyze != nil {
		model = a.svc.Analyze.Model
		if base == "" {
			base = a.svc.Analyze.BaseURL
		}
		if key == "" {
			key = a.svc.Analyze.APIKey
		}
	}

	if model != "" || base != "" {
		initProf := storedLLMProfile{
			ID:        "default",
			Name:      "Default",
			BaseURL:   base,
			Model:     model,
			APIKey:    key,
			IsDefault: true,
		}
		profs = []storedLLMProfile{initProf}
		if data, err := json.Marshal(profs); err == nil && a.store != nil {
			_ = a.store.SetSetting(ctx, "llm_profiles", string(data))
		}
	} else {
		profs = []storedLLMProfile{}
	}
	return profs
}

func (a *api) getSettings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	settings, err := a.store.ListSettings(ctx)
	if err != nil {
		a.fail(w, err)
		return
	}

	storedProfs := a.ensureStoredProfiles(ctx, settings)
	hasDefault := false
	for _, p := range storedProfs {
		if p.IsDefault {
			hasDefault = true
			break
		}
	}
	if !hasDefault && len(storedProfs) > 0 {
		storedProfs[0].IsDefault = true
	}

	pubProfiles := make([]LLMProfile, len(storedProfs))
	for i, p := range storedProfs {
		pubProfiles[i] = LLMProfile{
			ID:        p.ID,
			Name:      p.Name,
			BaseURL:   p.BaseURL,
			Model:     p.Model,
			HasKey:    p.APIKey != "",
			IsDefault: p.IsDefault,
		}
	}

	activeBase := settings["llm_base"]
	activeModel := settings["llm_model"]
	hasKey := settings["llm_key"] != ""
	for _, p := range storedProfs {
		if p.IsDefault {
			if activeBase == "" {
				activeBase = p.BaseURL
			}
			if activeModel == "" {
				activeModel = p.Model
			}
			if !hasKey && p.APIKey != "" {
				hasKey = true
			}
			break
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true,
		"settings": map[string]any{
			"llm_base":       activeBase,
			"llm_model":      activeModel,
			"has_llm_key":    hasKey,
			"has_auth_token": a.effectiveAuthToken(ctx) != "",
			"llm_profiles":   pubProfiles,
		},
	})
}

func (a *api) patchSettings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var b struct {
		AuthToken        *string            `json:"auth_token,omitempty"`
		LLMBase          *string            `json:"llm_base,omitempty"`
		LLMKey           *string            `json:"llm_key,omitempty"`
		LLMModel         *string            `json:"llm_model,omitempty"`
		LLMProfiles      *[]llmProfileInput `json:"llm_profiles,omitempty"`
		DefaultProfileID *string            `json:"default_profile_id,omitempty"`
	}
	if err := decodeJSON(w, r, &b); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request: "+err.Error())
		return
	}

	if b.AuthToken != nil {
		if err := a.store.SetSetting(ctx, "auth_token", *b.AuthToken); err != nil {
			a.fail(w, err)
			return
		}
	}

	settings, _ := a.store.ListSettings(ctx)
	if settings == nil {
		settings = map[string]string{}
	}
	storedProfs := a.ensureStoredProfiles(ctx, settings)
	existingMap := make(map[string]storedLLMProfile, len(storedProfs))
	for _, p := range storedProfs {
		existingMap[p.ID] = p
	}

	profilesChanged := false

	if b.LLMProfiles != nil {
		profilesChanged = true
		newProfs := make([]storedLLMProfile, 0, len(*b.LLMProfiles))
		defaultIndex := -1
		for _, inp := range *b.LLMProfiles {
			id := strings.TrimSpace(inp.ID)
			if id == "" {
				id = fmt.Sprintf("prof-%d", time.Now().UnixNano())
			}
			key := inp.APIKey
			if key == "" {
				if ex, ok := existingMap[id]; ok {
					key = ex.APIKey
				}
			}
			isDef := inp.IsDefault
			if b.DefaultProfileID != nil {
				isDef = (id == *b.DefaultProfileID)
			}
			if isDef {
				if defaultIndex >= 0 {
					isDef = false
				} else {
					defaultIndex = len(newProfs)
				}
			}
			newProfs = append(newProfs, storedLLMProfile{
				ID:        id,
				Name:      inp.Name,
				BaseURL:   inp.BaseURL,
				Model:     inp.Model,
				APIKey:    key,
				IsDefault: isDef,
			})
		}
		if defaultIndex < 0 && len(newProfs) > 0 {
			newProfs[0].IsDefault = true
		}
		storedProfs = newProfs
	} else if b.DefaultProfileID != nil {
		profilesChanged = true
		targetID := *b.DefaultProfileID
		for i := range storedProfs {
			storedProfs[i].IsDefault = (storedProfs[i].ID == targetID)
		}
	}

	// Find the default profile (if any)
	var defProf *storedLLMProfile
	for i := range storedProfs {
		if storedProfs[i].IsDefault {
			defProf = &storedProfs[i]
			break
		}
	}

	// Legacy direct updates to llm_base, llm_key, llm_model
	if b.LLMBase != nil || b.LLMKey != nil || b.LLMModel != nil {
		profilesChanged = true
		if defProf != nil {
			if b.LLMBase != nil {
				defProf.BaseURL = *b.LLMBase
			}
			if b.LLMKey != nil {
				defProf.APIKey = *b.LLMKey
			}
			if b.LLMModel != nil {
				defProf.Model = *b.LLMModel
			}
		}
	}

	if defProf != nil {
		if err := a.store.SetSetting(ctx, "llm_base", defProf.BaseURL); err != nil {
			a.fail(w, err)
			return
		}
		if err := a.store.SetSetting(ctx, "llm_model", defProf.Model); err != nil {
			a.fail(w, err)
			return
		}
		if err := a.store.SetSetting(ctx, "llm_key", defProf.APIKey); err != nil {
			a.fail(w, err)
			return
		}
		if a.svc != nil {
			a.svc.UpdateLLMConfig(defProf.BaseURL, defProf.APIKey, defProf.Model)
		}
	} else if b.LLMBase != nil || b.LLMKey != nil || b.LLMModel != nil {
		var base, key, model string
		if b.LLMBase != nil {
			base = *b.LLMBase
			_ = a.store.SetSetting(ctx, "llm_base", base)
		}
		if b.LLMKey != nil {
			key = *b.LLMKey
			_ = a.store.SetSetting(ctx, "llm_key", key)
		}
		if b.LLMModel != nil {
			model = *b.LLMModel
			_ = a.store.SetSetting(ctx, "llm_model", model)
		}
		if a.svc != nil {
			a.svc.UpdateLLMConfig(base, key, model)
		}
	}

	if profilesChanged && len(storedProfs) > 0 {
		if data, err := json.Marshal(storedProfs); err == nil && a.store != nil {
			if err := a.store.SetSetting(ctx, "llm_profiles", string(data)); err != nil {
				a.fail(w, err)
				return
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *api) getLicenseStatus(w http.ResponseWriter, r *http.Request) {
	if a.svc == nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "status": license.LicenseStatus{Tier: license.TierCommunity, IsValid: true}})
		return
	}
	status := a.svc.LicenseStatus(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "status": status})
}

func (a *api) activateLicense(w http.ResponseWriter, r *http.Request) {
	if a.svc == nil {
		writeErr(w, http.StatusInternalServerError, "service not initialized")
		return
	}
	var b struct {
		Key string `json:"key"`
	}
	if err := decodeJSON(w, r, &b); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request: "+err.Error())
		return
	}
	status, err := a.svc.ActivateLicense(r.Context(), b.Key)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "status": status})
}

func (a *api) syncObsidian(w http.ResponseWriter, r *http.Request) {
	if a.svc == nil || !a.svc.HasCapability(r.Context(), license.FeatureObsidianSync) {
		writeErr(w, http.StatusPaymentRequired, "feature requires a pro license")
		return
	}
	var b struct {
		VaultPath string `json:"vault_path"`
	}
	_ = decodeJSON(w, r, &b)
	vaultPath := b.VaultPath
	if vaultPath == "" {
		vaultPath = filepath.Join(a.uploadDir, "obsidian_vault")
		if a.uploadDir == "" {
			vaultPath = "./data/obsidian_vault"
		}
	}

	cards, err := a.store.ListCards(r.Context(), port.CardFilter{})
	if err != nil {
		a.fail(w, err)
		return
	}

	written, err := obsidian.SyncCards(vaultPath, cards)
	if err != nil {
		a.fail(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":         true,
		"written":    written,
		"vault_path": vaultPath,
	})
}

func (a *api) testWebhook(w http.ResponseWriter, r *http.Request) {
	if a.svc == nil || a.svc.Webhook == nil || !a.svc.HasCapability(r.Context(), license.FeatureWebhooks) {
		writeErr(w, http.StatusPaymentRequired, "webhooks require a pro license")
		return
	}
	var b struct {
		URL    string `json:"url"`
		Secret string `json:"secret"`
	}
	if err := decodeJSON(w, r, &b); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request: "+err.Error())
		return
	}
	if b.URL == "" {
		writeErr(w, http.StatusBadRequest, "url is required")
		return
	}
	statusCode, err := a.svc.Webhook.SendSync(r.Context(), b.URL, b.Secret, webhook.EventPing, map[string]string{"message": "Sparkkeep webhook test ping"})
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "status_code": statusCode, "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "status_code": statusCode})
}

// --- API handlers -----------------------------------------------------------

func (a *api) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *api) listCards(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	f := port.CardFilter{
		Horizon: q.Get("horizon"),
		Status:  q.Get("status"),
		Tag:     q.Get("tag"),
		Query:   q.Get("q"),
	}
	if v := q.Get("limit"); v != "" {
		f.Limit, _ = strconv.Atoi(v)
	}
	if v := q.Get("offset"); v != "" {
		f.Offset, _ = strconv.Atoi(v)
	}
	if v := q.Get("stale_days"); v != "" {
		f.StaleDays, _ = strconv.Atoi(v)
	}
	cards, err := a.store.ListCards(r.Context(), f)
	if err != nil {
		a.fail(w, err)
		return
	}
	if cards == nil {
		cards = []port.Card{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "cards": cards})
}

func (a *api) createCard(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Title            string   `json:"title"`
		Summary          string   `json:"summary"`
		Horizon          string   `json:"horizon"`
		Status           string   `json:"status"`
		SourceURL        string   `json:"source_url"`
		SourceNote       string   `json:"source_note"`
		Tags             []string `json:"tags"`
		ExecutiveSummary string   `json:"executive_summary"`
		ValueProposition string   `json:"value_proposition"`
		ProposedActions  []string `json:"proposed_actions"`
	}
	if err := decodeJSON(w, r, &b); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request: "+err.Error())
		return
	}
	if strings.TrimSpace(b.Title) == "" {
		writeErr(w, http.StatusBadRequest, "title is required")
		return
	}
	if b.Status == "" {
		b.Status = port.StatusInbox
	} else if !port.ValidStatus(b.Status) {
		writeErr(w, http.StatusBadRequest, "invalid status: "+b.Status)
		return
	}
	if b.Horizon == "" {
		b.Horizon = port.HorizonShortTerm
	} else if !port.ValidHorizon(b.Horizon) {
		writeErr(w, http.StatusBadRequest, "invalid horizon: "+b.Horizon)
		return
	}
	if u := strings.TrimSpace(b.SourceURL); u != "" {
		b.SourceURL = u
	}
	card, err := a.store.CreateCard(r.Context(), port.Card{
		Title:            b.Title,
		Summary:          b.Summary,
		Horizon:          b.Horizon,
		Status:           b.Status,
		SourceURL:        b.SourceURL,
		SourceNote:       b.SourceNote,
		Tags:             b.Tags,
		ExecutiveSummary: b.ExecutiveSummary,
		ValueProposition: b.ValueProposition,
		ProposedActions:  b.ProposedActions,
	})
	if err != nil {
		if errors.Is(err, port.ErrConflict) || isUniqueConstraint(err) {
			if existing, gerr := a.store.GetCardBySourceURL(r.Context(), b.SourceURL); gerr == nil {
				writeErr(w, http.StatusConflict, "already captured: "+existing.Title)
				return
			}
		}
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "data": card})
}

func (a *api) getCard(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, http.StatusBadRequest, "bad id")
		return
	}
	card, err := a.store.GetCard(r.Context(), id)
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "data": card})
}

func (a *api) patchCard(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, http.StatusBadRequest, "bad id")
		return
	}
	var b struct {
		Status           *string   `json:"status"`
		Horizon          *string   `json:"horizon"`
		Note             *string   `json:"note"`
		Tags             []string  `json:"tags"`
		ExecutiveSummary *string   `json:"executive_summary"`
		ValueProposition *string   `json:"value_proposition"`
		ProposedActions  *[]string `json:"proposed_actions"`
	}
	if err := decodeJSON(w, r, &b); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request: "+err.Error())
		return
	}
	if b.Status != nil && !port.ValidStatus(*b.Status) {
		writeErr(w, http.StatusBadRequest, "invalid status: "+*b.Status)
		return
	}
	if b.Horizon != nil && !port.ValidHorizon(*b.Horizon) {
		writeErr(w, http.StatusBadRequest, "invalid horizon: "+*b.Horizon)
		return
	}
	card, err := a.store.GetCard(r.Context(), id)
	if err != nil {
		a.fail(w, err)
		return
	}
	patch := port.CardPatch{
		Status:           b.Status,
		Horizon:          b.Horizon,
		Note:             b.Note,
		ExecutiveSummary: b.ExecutiveSummary,
		ValueProposition: b.ValueProposition,
		ProposedActions:  b.ProposedActions,
	}
	if patch.Status != nil || patch.Horizon != nil || patch.Note != nil || patch.ExecutiveSummary != nil || patch.ValueProposition != nil || patch.ProposedActions != nil {
		card, err = a.store.UpdateCard(r.Context(), id, patch)
		if err != nil {
			a.fail(w, err)
			return
		}
	}
	if b.Tags != nil {
		if err := a.store.SetCardTags(r.Context(), id, b.Tags); err != nil {
			a.fail(w, err)
			return
		}
		card, err = a.store.GetCard(r.Context(), id)
		if err != nil {
			a.fail(w, err)
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "data": card})
}

func (a *api) retryCard(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, http.StatusBadRequest, "bad id")
		return
	}
	cards, err := a.svc.Retry(r.Context(), id)
	if err != nil {
		if errors.Is(err, core.ErrNothingToReanalyze) {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		a.fail(w, err)
		return
	}
	var first any
	if len(cards) > 0 {
		first = cards[0]
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "data": first, "cards": cards})
}

// batchShelveStale shelves every inbox/doing card untouched for more than
// ?days (default 30) and reports how many were archived.
func (a *api) batchShelveStale(w http.ResponseWriter, r *http.Request) {
	const defaultDays = 30
	days := defaultDays
	if v := r.URL.Query().Get("days"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n <= 0 {
			writeErr(w, http.StatusBadRequest, "invalid days: "+v)
			return
		}
		days = n
	}
	n, err := a.store.ShelveStale(r.Context(), days)
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "shelved_count": n})
}

// exportMarkdown renders a card as a markdown briefing — the payload for a
// one-click task-manager capture or a clipboard paste.
func (a *api) exportMarkdown(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, http.StatusBadRequest, "bad id")
		return
	}
	card, err := a.store.GetCard(r.Context(), id)
	if err != nil {
		a.fail(w, err)
		return
	}
	summary := card.ExecutiveSummary
	if summary == "" {
		summary = card.Summary
	}
	var b strings.Builder
	fmt.Fprintf(&b, "# [Spark] %s\n\n**Executive Summary:** %s\n", card.Title, summary)
	if card.ValueProposition != "" {
		fmt.Fprintf(&b, "**Value Proposition:** %s\n", card.ValueProposition)
	}
	if len(card.ProposedActions) > 0 {
		b.WriteString("\n### Proposed Actions\n")
		for _, act := range card.ProposedActions {
			fmt.Fprintf(&b, "- [ ] %s\n", act)
		}
	}
	b.WriteString("\n")
	if card.SourceURL != "" {
		fmt.Fprintf(&b, "**Source:** %s\n", card.SourceURL)
	}
	if len(card.Tags) > 0 {
		fmt.Fprintf(&b, "**Tags:** #%s\n", strings.Join(card.Tags, " #"))
	}
	w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
	fmt.Fprint(w, b.String())
}

// weeklyDigest groups cards created in the last 7 calendar days by day,
// newest first, with a total and per-status count.
func (a *api) weeklyDigest(w http.ResponseWriter, r *http.Request) {
	const days = 7
	now := time.Now().UTC()
	cards, err := a.store.ListCards(r.Context(), port.CardFilter{Since: now.AddDate(0, 0, -days)})
	if err != nil {
		a.fail(w, err)
		return
	}

	key := func(t time.Time) string { return t.Format("2006-01-02") }

	window := map[string]bool{}
	ordered := make([]string, 0, days)
	for i := 0; i < days; i++ {
		d := now.AddDate(0, 0, -i).Format("2006-01-02")
		window[d] = true
		ordered = append(ordered, d)
	}

	byDay := map[string][]port.Card{}
	byStatus := map[string]int{}
	var total int
	for _, c := range cards {
		dk := key(c.CreatedAt)
		if !window[dk] {
			continue
		}
		byDay[dk] = append(byDay[dk], c)
		byStatus[c.Status]++
		total++
	}

	type dayGroup struct {
		Date  string      `json:"date"`
		Cards []port.Card `json:"cards"`
	}
	groups := make([]dayGroup, 0, len(ordered))
	for _, d := range ordered {
		cs, ok := byDay[d]
		if !ok {
			continue
		}
		sort.Slice(cs, func(i, j int) bool { return cs[i].CreatedAt.After(cs[j].CreatedAt) })
		groups = append(groups, dayGroup{Date: d, Cards: cs})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":         true,
		"week_total": total,
		"by_status":  byStatus,
		"days":       groups,
	})
}

func (a *api) listTags(w http.ResponseWriter, r *http.Request) {
	tags, err := a.store.ListTags(r.Context())
	if err != nil {
		a.fail(w, err)
		return
	}
	if tags == nil {
		tags = []port.Tag{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "tags": tags})
}

func (a *api) listResearch(w http.ResponseWriter, r *http.Request) {
	list, err := a.store.ListResearch(r.Context())
	if err != nil {
		a.fail(w, err)
		return
	}
	if list == nil {
		list = []port.Research{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "research": list})
}

// triggerResearch ackboards the request immediately ({"accepted":true}) and
// runs the bounded research pass in the background — same goroutine pattern
// as the Telegram callback handler.
func (a *api) triggerResearch(w http.ResponseWriter, r *http.Request) {
	var b struct {
		CardID int64 `json:"card_id"`
	}
	if err := decodeJSON(w, r, &b); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request: "+err.Error())
		return
	}
	if b.CardID <= 0 {
		writeErr(w, http.StatusBadRequest, "bad card_id")
		return
	}
	if active, err := a.store.HasActiveResearch(r.Context(), b.CardID); err != nil {
		a.fail(w, err)
		return
	} else if active {
		writeErr(w, http.StatusConflict, "research already running")
		return
	}
	a.svc.GoResearch(r.Context(), b.CardID)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "accepted": true})
}

// getResearch serves the single-row report as HTML for the Telegram link.
// A JSON client (Accept: application/json or ?format=json) gets the raw row
// instead — the dashboard reads the findings to turn them into checklist items.
func (a *api) getResearch(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, http.StatusBadRequest, "bad id")
		return
	}
	row, err := a.store.GetResearch(r.Context(), id)
	if err != nil {
		a.fail(w, err)
		return
	}
	if r.Header.Get("Accept") == "application/json" || r.URL.Query().Get("format") == "json" {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "data": row})
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := researchTmpl.Execute(w, row); err != nil {
		a.fail(w, err)
		return
	}
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

// fail maps a store/service error to the envelope: ErrNotFound → 404, else
// 500.
func (a *api) fail(w http.ResponseWriter, err error) {
	if errors.Is(err, port.ErrNotFound) {
		writeErr(w, http.StatusNotFound, "not found")
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
