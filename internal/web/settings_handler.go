package web

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"sparkkeep/internal/analyze"
	"sparkkeep/internal/license"
	"sparkkeep/internal/port"
)

// setAuthCookie writes the session cookie, marking it Secure when the request
// arrives over TLS (directly or via a TLS-terminating proxy).
func setAuthCookie(w http.ResponseWriter, r *http.Request, session string) {
	http.SetCookie(w, &http.Cookie{
		Name: authCookie, Value: session, Path: "/",
		HttpOnly: true, SameSite: http.SameSiteLaxMode,
		MaxAge: int(sessionTTL / time.Second), Secure: secureCookie(r),
	})
}

// verifyToken exchanges a token for the long-lived cookie the browser then
// sends on every request. It stays public because the token travels in the
// body, not a header. Repeated failures from one IP are throttled (429).
func (a *api) verifyToken(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Token string `json:"token"`
	}
	if err := decodeJSON(w, r, &b); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request: "+err.Error())
		return
	}
	ip := clientIP(r)
	if !a.loginAllowed(ip) {
		writeErr(w, http.StatusTooManyRequests, "too many attempts")
		return
	}
	tok := b.Token
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		tok = strings.TrimPrefix(h, "Bearer ")
	}
	if !a.validateToken(r.Context(), tok) {
		a.recordLoginFailure(ip)
		writeErr(w, http.StatusUnauthorized, "invalid token")
		return
	}
	a.clearLoginFailures(ip)
	session, err := a.newSession()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "session error")
		return
	}
	setAuthCookie(w, r, session)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *api) isConfigured(ctx context.Context) bool {
	if a.hasAuth(ctx) {
		return true
	}
	if a.store != nil {
		if val, err := a.store.GetSetting(ctx, "setup_completed"); err == nil && val == "true" {
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
	hasAuth := a.hasAuth(ctx)
	hasLLMKey := settings["llm_key"] != ""
	llmBase := settings["llm_base"]
	llmModel := settings["llm_model"]
	interfaceLocale := settings["interface_locale"]
	if interfaceLocale == "" || !port.IsValidInterfaceLocale(interfaceLocale) {
		interfaceLocale = port.DefaultInterfaceLocale
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":               true,
		"is_configured":    configured,
		"has_auth":         hasAuth,
		"has_llm_key":      hasLLMKey,
		"llm_base":         llmBase,
		"llm_model":        llmModel,
		"interface_locale": interfaceLocale,
	})
}

func (a *api) setup(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if a.isConfigured(ctx) {
		token := presentedToken(r)
		if !a.validateToken(ctx, token) {
			writeErr(w, http.StatusForbidden, "forbidden: setup already completed")
			return
		}
	}

	var b struct {
		AuthToken       string `json:"auth_token"`
		LLMBase         string `json:"llm_base"`
		LLMKey          string `json:"llm_key"`
		LLMModel        string `json:"llm_model"`
		TGToken         string `json:"tg_token,omitempty"`
		InterfaceLocale string `json:"interface_locale,omitempty"`
	}
	if err := decodeJSON(w, r, &b); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request: "+err.Error())
		return
	}

	if b.AuthToken != "" {
		if len(b.AuthToken) > 72 {
			writeErr(w, http.StatusBadRequest, "passphrase too long (max 72 bytes)")
			return
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(b.AuthToken), bcrypt.DefaultCost)
		if err != nil {
			a.fail(w, err)
			return
		}
		if err := a.store.SetSetting(ctx, "auth_token", string(hash)); err != nil {
			a.fail(w, err)
			return
		}
		a.clearSessions()
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
	if b.TGToken != "" {
		if err := a.store.SetSetting(ctx, "tg_token", b.TGToken); err != nil {
			a.fail(w, err)
			return
		}
	}

	if b.InterfaceLocale != "" {
		if !port.IsValidInterfaceLocale(b.InterfaceLocale) {
			writeErr(w, http.StatusBadRequest, "unsupported interface_locale")
			return
		}
		if err := a.store.SetSetting(ctx, "interface_locale", b.InterfaceLocale); err != nil {
			a.fail(w, err)
			return
		}
	}
	targetLocale := b.InterfaceLocale
	if targetLocale == "" {
		targetLocale, _ = a.store.GetSetting(ctx, "interface_locale")
		if targetLocale == "" || !port.IsValidInterfaceLocale(targetLocale) {
			targetLocale = port.DefaultInterfaceLocale
		}
	}
	langName := port.LocaleToLanguageName(targetLocale)
	upJSON, _ := a.store.GetSetting(ctx, "user_profile")
	var up port.UserProfile
	if strings.TrimSpace(upJSON) != "" {
		_ = json.Unmarshal([]byte(upJSON), &up)
	}
	if up.Language == "" || up.Language == "English" || up.Language == "Same as source / English" || !a.isConfigured(ctx) {
		up.Language = langName
		if data, err := json.Marshal(up); err == nil {
			_ = a.store.SetSetting(ctx, "user_profile", string(data))
		}
	}

	if err := a.store.SetSetting(ctx, "setup_completed", "true"); err != nil {
		a.fail(w, err)
		return
	}

	if a.svc != nil {
		a.svc.UpdateLLMConfig(b.LLMBase, b.LLMKey, b.LLMModel)
		if b.TGToken != "" {
			_ = a.svc.ReloadChannels(ctx)
		}
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

	// Mint an opaque session for the cookie. The JSON token is the durable
	// env-configured credential only — never the stored passphrase hash and
	// never the ephemeral session, which clients must not persist.
	effectiveTok := a.authToken
	if effectiveTok != "" || a.hasAuth(ctx) {
		if session, err := a.newSession(); err == nil {
			setAuthCookie(w, r, session)
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "token": effectiveTok})
}

func (a *api) setupDemo(w http.ResponseWriter, r *http.Request) {
	if a.isConfigured(r.Context()) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "instance already configured"})
		return
	}
	ctx := r.Context()
	var b struct {
		AuthToken       string `json:"auth_token"`
		InterfaceLocale string `json:"interface_locale,omitempty"`
	}
	_ = decodeJSON(w, r, &b)

	if b.InterfaceLocale != "" {
		if !port.IsValidInterfaceLocale(b.InterfaceLocale) {
			writeErr(w, http.StatusBadRequest, "unsupported interface_locale")
			return
		}
		_ = a.store.SetSetting(ctx, "interface_locale", b.InterfaceLocale)
	}
	targetLocale := b.InterfaceLocale
	if targetLocale == "" {
		targetLocale, _ = a.store.GetSetting(ctx, "interface_locale")
		if targetLocale == "" || !port.IsValidInterfaceLocale(targetLocale) {
			targetLocale = port.DefaultInterfaceLocale
		}
	}
	langName := port.LocaleToLanguageName(targetLocale)
	upJSON, _ := a.store.GetSetting(ctx, "user_profile")
	var up port.UserProfile
	if strings.TrimSpace(upJSON) != "" {
		_ = json.Unmarshal([]byte(upJSON), &up)
	}
	up.Language = langName
	if data, err := json.Marshal(up); err == nil {
		_ = a.store.SetSetting(ctx, "user_profile", string(data))
	}

	pass := b.AuthToken
	if pass == "" {
		pass = "sparkkeep"
	}
	if len(pass) > 72 {
		writeErr(w, http.StatusBadRequest, "passphrase too long (max 72 bytes)")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(pass), bcrypt.DefaultCost)
	if err != nil {
		a.fail(w, err)
		return
	}
	if err := a.store.SetSetting(ctx, "auth_token", string(hash)); err != nil {
		a.fail(w, err)
		return
	}
	_ = a.store.SetSetting(ctx, "setup_completed", "true")
	_ = a.store.SetSetting(ctx, "llm_model", "llama3.2-demo")
	_ = a.store.SetSetting(ctx, "llm_base", "http://localhost:11434/v1")

	// Seed showcase dataset
	if a.svc != nil {
		if err := a.svc.SeedDemoData(ctx, targetLocale); err != nil {
			a.fail(w, err)
			return
		}
	}

	session, err := a.newSession()
	if err == nil {
		setAuthCookie(w, r, session)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":    true,
		"token": a.authToken,
		"demo":  true,
	})
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

type storedLLMProfile = analyze.Profile

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

	rolesJSON, _ := a.store.GetSetting(ctx, "llm_roles")
	llmRoles := map[string]string{}
	if strings.TrimSpace(rolesJSON) != "" {
		_ = json.Unmarshal([]byte(rolesJSON), &llmRoles)
	}

	capsJSON, _ := a.store.GetSetting(ctx, "llm_token_caps")
	tokenCaps := map[string]int{}
	if strings.TrimSpace(capsJSON) != "" {
		_ = json.Unmarshal([]byte(capsJSON), &tokenCaps)
	}

	defPbID, _ := a.store.GetSetting(ctx, "default_playbook_id")
	var defaultPlaybookID *int64
	if strings.TrimSpace(defPbID) != "" {
		if idVal, err := strconv.ParseInt(defPbID, 10, 64); err == nil {
			defaultPlaybookID = &idVal
		}
	}

	userProfJSON, _ := a.store.GetSetting(ctx, "user_profile")
	var userProfile port.UserProfile
	if strings.TrimSpace(userProfJSON) != "" {
		_ = json.Unmarshal([]byte(userProfJSON), &userProfile)
	}

	tgChatID, _ := a.store.GetSetting(ctx, "tg_chat_id")
	tgToken, _ := a.store.GetSetting(ctx, "tg_token")
	if tgToken == "" {
		tgToken = a.tgToken
	}

	openclawURL, _ := a.store.GetSetting(ctx, "openclaw_url")
	if openclawURL == "" {
		openclawURL = "http://localhost:18789"
	}
	openclawToken, _ := a.store.GetSetting(ctx, "openclaw_token")
	openclawChan, _ := a.store.GetSetting(ctx, "openclaw_channel")
	if openclawChan == "" {
		openclawChan = "whatsapp"
	}
	openclawTarget, _ := a.store.GetSetting(ctx, "openclaw_target")
	openclawEnabled, _ := a.store.GetSetting(ctx, "openclaw_enabled")

	discordToken, _ := a.store.GetSetting(ctx, "discord_token")
	discordChanID, _ := a.store.GetSetting(ctx, "discord_channel_id")
	discordPubKey, _ := a.store.GetSetting(ctx, "discord_public_key")
	slackWebhook, _ := a.store.GetSetting(ctx, "slack_webhook_url")
	slackBotToken, _ := a.store.GetSetting(ctx, "slack_bot_token")
	slackChanID, _ := a.store.GetSetting(ctx, "slack_channel_id")
	obsidianVaultPath, _ := a.store.GetSetting(ctx, "obsidian_vault_path")
	obsidianAutoExport, _ := a.store.GetSetting(ctx, "obsidian_auto_export")

	interfaceLocale, _ := a.store.GetSetting(ctx, "interface_locale")
	if interfaceLocale == "" || !port.IsValidInterfaceLocale(interfaceLocale) {
		interfaceLocale = port.DefaultInterfaceLocale
	}

	cardTypes, err := a.store.GetCardTypes(ctx)
	if err != nil || cardTypes == nil {
		cardTypes = append([]string(nil), port.DefaultCardTypes...)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true,
		"settings": map[string]any{
			"interface_locale":       interfaceLocale,
			"card_types":             cardTypes,
			"llm_base":               activeBase,
			"llm_model":              activeModel,
			"has_llm_key":            hasKey,
			"has_auth_token":         a.effectiveAuthToken(ctx) != "",
			"llm_profiles":           pubProfiles,
			"llm_roles":              llmRoles,
			"llm_token_caps":         tokenCaps,
			"default_playbook_id":    defaultPlaybookID,
			"user_profile":           userProfile,
			"tg_chat_id":             tgChatID,
			"has_tg_token":           tgToken != "",
			"openclaw_url":           openclawURL,
			"openclaw_channel":       openclawChan,
			"openclaw_target":        openclawTarget,
			"openclaw_enabled":       openclawEnabled == "true",
			"has_openclaw_token":     openclawToken != "",
			"discord_channel_id":     discordChanID,
			"has_discord_token":      discordToken != "",
			"has_discord_public_key": discordPubKey != "",
			"has_slack_webhook":      slackWebhook != "",
			"has_slack_bot_token":    slackBotToken != "",
			"slack_channel_id":       slackChanID,
			"obsidian_vault_path":    obsidianVaultPath,
			"obsidian_auto_export":   obsidianAutoExport == "true",
		},
	})
}

func (a *api) patchSettings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var b struct {
		CardTypes          *[]string          `json:"card_types,omitempty"`
		AuthToken          *string            `json:"auth_token,omitempty"`
		LLMBase            *string            `json:"llm_base,omitempty"`
		LLMKey             *string            `json:"llm_key,omitempty"`
		LLMModel           *string            `json:"llm_model,omitempty"`
		LLMProfiles        *[]llmProfileInput `json:"llm_profiles,omitempty"`
		DefaultProfileID   *string            `json:"default_profile_id,omitempty"`
		LLMRoles           *map[string]string `json:"llm_roles,omitempty"`
		LLMTokenCaps       *map[string]int    `json:"llm_token_caps,omitempty"`
		DefaultPlaybookID  *int64             `json:"default_playbook_id,omitempty"`
		UserProfile        *port.UserProfile  `json:"user_profile,omitempty"`
		TGToken            *string            `json:"tg_token,omitempty"`
		TGChatID           *string            `json:"tg_chat_id,omitempty"`
		OpenClawURL        *string            `json:"openclaw_url,omitempty"`
		OpenClawToken      *string            `json:"openclaw_token,omitempty"`
		OpenClawChannel    *string            `json:"openclaw_channel,omitempty"`
		OpenClawTarget     *string            `json:"openclaw_target,omitempty"`
		OpenClawEnabled    *bool              `json:"openclaw_enabled,omitempty"`
		DiscordToken       *string            `json:"discord_token,omitempty"`
		DiscordChannelID   *string            `json:"discord_channel_id,omitempty"`
		DiscordPublicKey   *string            `json:"discord_public_key,omitempty"`
		SlackWebhookURL    *string            `json:"slack_webhook_url,omitempty"`
		SlackBotToken      *string            `json:"slack_bot_token,omitempty"`
		SlackChannelID     *string            `json:"slack_channel_id,omitempty"`
		ObsidianVaultPath  *string            `json:"obsidian_vault_path,omitempty"`
		ObsidianAutoExport *bool              `json:"obsidian_auto_export,omitempty"`
		InterfaceLocale    *string            `json:"interface_locale,omitempty"`
	}
	if err := decodeJSON(w, r, &b); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request: "+err.Error())
		return
	}

	if b.InterfaceLocale != nil {
		if !port.IsValidInterfaceLocale(*b.InterfaceLocale) {
			writeErr(w, http.StatusBadRequest, "unsupported interface_locale")
			return
		}
		if err := a.store.SetSetting(ctx, "interface_locale", *b.InterfaceLocale); err != nil {
			a.fail(w, err)
			return
		}
		if !a.isConfigured(ctx) && b.UserProfile == nil {
			langName := port.LocaleToLanguageName(*b.InterfaceLocale)
			upJSON, _ := a.store.GetSetting(ctx, "user_profile")
			var up port.UserProfile
			if strings.TrimSpace(upJSON) != "" {
				_ = json.Unmarshal([]byte(upJSON), &up)
			}
			if up.Language == "" || up.Language == "English" || up.Language == "Same as source / English" {
				up.Language = langName
				if data, err := json.Marshal(up); err == nil {
					_ = a.store.SetSetting(ctx, "user_profile", string(data))
				}
			}
		}
	}

	if b.CardTypes != nil {
		if len(*b.CardTypes) > 20 {
			writeErr(w, http.StatusBadRequest, "card_types exceeds maximum limit of 20")
			return
		}
		var cleaned []string
		seen := make(map[string]bool)
		for _, ct := range *b.CardTypes {
			t := port.ResolveCardType(ct)
			if t == "" || t == "other" {
				continue
			}
			if !seen[t] {
				seen[t] = true
				cleaned = append(cleaned, t)
			}
		}
		if len(cleaned) > 20 {
			writeErr(w, http.StatusBadRequest, "card_types exceeds maximum limit of 20")
			return
		}
		if cleaned == nil {
			cleaned = []string{}
		}
		if err := a.store.SetCardTypes(ctx, cleaned); err != nil {
			a.fail(w, err)
			return
		}
	}

	if b.UserProfile != nil {
		if b.UserProfile.TotalChars() > 1500 {
			writeErr(w, http.StatusBadRequest, "user profile exceeds 1,500 characters limit")
			return
		}
		data, err := json.Marshal(b.UserProfile)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "invalid user profile: "+err.Error())
			return
		}
		if err := a.store.SetSetting(ctx, "user_profile", string(data)); err != nil {
			a.fail(w, err)
			return
		}
	}

	if b.DefaultPlaybookID != nil {
		if err := a.store.SetSetting(ctx, "default_playbook_id", strconv.FormatInt(*b.DefaultPlaybookID, 10)); err != nil {
			a.fail(w, err)
			return
		}
	}

	if b.AuthToken != nil {
		hashVal := *b.AuthToken
		if hashVal != "" {
			if len(hashVal) > 72 {
				writeErr(w, http.StatusBadRequest, "passphrase too long (max 72 bytes)")
				return
			}
			hash, err := bcrypt.GenerateFromPassword([]byte(hashVal), bcrypt.DefaultCost)
			if err != nil {
				a.fail(w, err)
				return
			}
			hashVal = string(hash)
		}
		if err := a.store.SetSetting(ctx, "auth_token", hashVal); err != nil {
			a.fail(w, err)
			return
		}
		a.clearSessions()
	}

	if b.TGToken != nil {
		if err := a.store.SetSetting(ctx, "tg_token", *b.TGToken); err != nil {
			a.fail(w, err)
			return
		}
	}

	if b.TGChatID != nil {
		if err := a.store.SetSetting(ctx, "tg_chat_id", *b.TGChatID); err != nil {
			a.fail(w, err)
			return
		}
	}

	if b.OpenClawURL != nil {
		_ = a.store.SetSetting(ctx, "openclaw_url", *b.OpenClawURL)
	}
	if b.OpenClawToken != nil {
		_ = a.store.SetSetting(ctx, "openclaw_token", *b.OpenClawToken)
	}
	if b.OpenClawChannel != nil {
		_ = a.store.SetSetting(ctx, "openclaw_channel", *b.OpenClawChannel)
	}
	if b.OpenClawTarget != nil {
		_ = a.store.SetSetting(ctx, "openclaw_target", *b.OpenClawTarget)
	}
	if b.OpenClawEnabled != nil {
		val := "false"
		if *b.OpenClawEnabled {
			val = "true"
		}
		_ = a.store.SetSetting(ctx, "openclaw_enabled", val)
	}
	if b.DiscordToken != nil {
		_ = a.store.SetSetting(ctx, "discord_token", *b.DiscordToken)
	}
	if b.DiscordChannelID != nil {
		_ = a.store.SetSetting(ctx, "discord_channel_id", *b.DiscordChannelID)
	}
	if b.DiscordPublicKey != nil {
		_ = a.store.SetSetting(ctx, "discord_public_key", *b.DiscordPublicKey)
	}
	if b.SlackWebhookURL != nil {
		_ = a.store.SetSetting(ctx, "slack_webhook_url", *b.SlackWebhookURL)
	}
	if b.SlackBotToken != nil {
		_ = a.store.SetSetting(ctx, "slack_bot_token", *b.SlackBotToken)
	}
	if b.SlackChannelID != nil {
		_ = a.store.SetSetting(ctx, "slack_channel_id", *b.SlackChannelID)
	}
	if b.ObsidianVaultPath != nil {
		_ = a.store.SetSetting(ctx, "obsidian_vault_path", strings.TrimSpace(*b.ObsidianVaultPath))
	}
	if b.ObsidianAutoExport != nil {
		val := "false"
		if *b.ObsidianAutoExport {
			val = "true"
		}
		_ = a.store.SetSetting(ctx, "obsidian_auto_export", val)
	}

	channelsChanged := b.TGToken != nil ||
		b.TGChatID != nil ||
		b.OpenClawURL != nil ||
		b.OpenClawToken != nil ||
		b.OpenClawChannel != nil ||
		b.OpenClawTarget != nil ||
		b.OpenClawEnabled != nil ||
		b.DiscordToken != nil ||
		b.DiscordChannelID != nil ||
		b.DiscordPublicKey != nil ||
		b.SlackWebhookURL != nil ||
		b.SlackBotToken != nil ||
		b.SlackChannelID != nil

	if a.svc != nil && channelsChanged {
		if err := a.svc.ReloadChannels(ctx); err != nil {
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

	if b.LLMRoles != nil && a.store != nil {
		if data, err := json.Marshal(*b.LLMRoles); err == nil {
			if err := a.store.SetSetting(ctx, "llm_roles", string(data)); err != nil {
				a.fail(w, err)
				return
			}
		}
	}

	if b.LLMTokenCaps != nil && a.store != nil {
		if data, err := json.Marshal(*b.LLMTokenCaps); err == nil {
			if err := a.store.SetSetting(ctx, "llm_token_caps", string(data)); err != nil {
				a.fail(w, err)
				return
			}
		}
	}

	if a.svc != nil && (profilesChanged || b.LLMRoles != nil || b.LLMTokenCaps != nil) {
		_ = a.svc.RebuildRouter(ctx)
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *api) getLicenseStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "status": license.Status()})
}
