package web

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"sparkkeep/internal/analyze"
	"sparkkeep/internal/channel/discord"
	"sparkkeep/internal/channel/openclaw"
	"sparkkeep/internal/license"
	"sparkkeep/internal/obsidian"
	"sparkkeep/internal/port"
	"sparkkeep/internal/webhook"
)

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

// weeklyDigest groups cards created in the window (default 7 days) by day,
// newest first, with a total and per-status count, WoW delta, research harvest,
// wins, horizon balance, and stale alerts.
func (a *api) weeklyDigest(w http.ResponseWriter, r *http.Request) {
	days := 7
	if q := r.URL.Query().Get("days"); q != "" {
		if d, err := strconv.Atoi(q); err == nil && d > 0 && d <= 90 {
			days = d
		}
	}
	now := time.Now().UTC()
	since := now.AddDate(0, 0, -days)
	prevSince := now.AddDate(0, 0, -2*days)

	// List cards covering both current and previous windows (for WoW calculations)
	cards, err := a.store.ListCards(r.Context(), port.CardFilter{Since: prevSince, Limit: 2000})
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
	byHorizon := map[string]int{}
	var currentTotal, prevTotal int
	var weeklyWins []port.Card
	var researchHarvest []port.Card
	var staleCount int
	staleCutoff := now.AddDate(0, 0, -5)

	for _, c := range cards {
		if c.CreatedAt.Before(since) {
			prevTotal++
			continue
		}
		dk := key(c.CreatedAt)
		if !window[dk] {
			continue
		}
		byDay[dk] = append(byDay[dk], c)
		byStatus[c.Status]++
		byHorizon[c.Horizon]++
		currentTotal++

		if c.Status == port.StatusDone {
			weeklyWins = append(weeklyWins, c)
		}
		if c.ResearchVerdict != "" || c.ResearchState == "done" {
			researchHarvest = append(researchHarvest, c)
		}
		if c.Horizon == "short-term" && (c.Status == port.StatusInbox || c.Status == port.StatusToDo || c.Status == port.StatusInProgress) && c.UpdatedAt.Before(staleCutoff) {
			staleCount++
		}
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

	var wowDelta int
	if prevTotal > 0 {
		wowDelta = int(float64(currentTotal-prevTotal) / float64(prevTotal) * 100.0)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":                true,
		"week_total":        currentTotal,
		"prev_total":        prevTotal,
		"wow_delta_percent": wowDelta,
		"by_status":         byStatus,
		"by_horizon":        byHorizon,
		"weekly_wins":       weeklyWins,
		"research_harvest":  researchHarvest,
		"stale_count":       staleCount,
		"days":              groups,
	})
}

func heuristicSynthesis(cards []port.Card) (string, []map[string]any) {
	tagCounts := make(map[string][]int64)
	var doneCount int
	for _, c := range cards {
		if c.Status == port.StatusDone {
			doneCount++
		}
		for _, t := range c.Tags {
			t = strings.ToLower(strings.TrimSpace(t))
			if t != "" {
				tagCounts[t] = append(tagCounts[t], c.ID)
			}
		}
	}
	type tagPair struct {
		tag string
		ids []int64
	}
	var pairs []tagPair
	for t, ids := range tagCounts {
		pairs = append(pairs, tagPair{tag: t, ids: ids})
	}
	sort.Slice(pairs, func(i, j int) bool { return len(pairs[i].ids) > len(pairs[j].ids) })

	var themes []map[string]any
	for i, p := range pairs {
		if i >= 4 {
			break
		}
		themes = append(themes, map[string]any{
			"title":    strings.ToUpper(p.tag[:1]) + p.tag[1:],
			"summary":  fmt.Sprintf("%d spark(s) under #%s", len(p.ids), p.tag),
			"card_ids": p.ids,
		})
	}

	briefing := fmt.Sprintf("• Ingested %d sparks during this window across %d active topics.\n• %d card(s) marked as completed Done.\n• %d items categorized and ready for review.",
		len(cards), len(pairs), doneCount, len(cards)-doneCount)

	return briefing, themes
}

func (a *api) synthesizeDigest(w http.ResponseWriter, r *http.Request) {
	days := 7
	if q := r.URL.Query().Get("days"); q != "" {
		if d, err := strconv.Atoi(q); err == nil && d > 0 && d <= 90 {
			days = d
		}
	}
	now := time.Now().UTC()
	cards, err := a.store.ListCards(r.Context(), port.CardFilter{Since: now.AddDate(0, 0, -days), Limit: 500})
	if err != nil {
		a.fail(w, err)
		return
	}
	if len(cards) == 0 {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":       true,
			"briefing": "No cards captured in this period yet.",
			"themes":   []any{},
		})
		return
	}

	var llm *analyze.Client
	if a.svc != nil {
		llm = a.svc.Analyze
	}

	if llm == nil || llm.Model == "" {
		briefing, themes := heuristicSynthesis(cards)
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":       true,
			"briefing": briefing,
			"themes":   themes,
		})
		return
	}

	var sb strings.Builder
	sb.WriteString("Analyze this period's captured sparks for a personal intelligence digest.\n")
	sb.WriteString("Return ONLY a valid JSON object with:\n")
	sb.WriteString("1. \"briefing\": a 2-3 bullet string summarizing the main ideas, focus areas, and progress.\n")
	sb.WriteString("2. \"themes\": an array of 2-4 themes, each with \"title\" (short theme name), \"summary\" (1 sentence explanation), and \"card_ids\" (array of matching card IDs).\n\nSparks:\n")
	for i, c := range cards {
		if i >= 35 {
			break
		}
		tags := strings.Join(c.Tags, ", ")
		fmt.Fprintf(&sb, "- ID:%d | Title: %s | Tags: [%s] | Horizon: %s | Status: %s | TLDR: %s\n",
			c.ID, c.Title, tags, c.Horizon, c.Status, c.TLDR)
	}

	ans, err := llm.Ask(r.Context(), sb.String())
	if err != nil {
		briefing, themes := heuristicSynthesis(cards)
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":       true,
			"briefing": briefing,
			"themes":   themes,
		})
		return
	}

	clean := strings.TrimSpace(ans)
	if idx := strings.Index(clean, "{"); idx >= 0 {
		if end := strings.LastIndex(clean, "}"); end > idx {
			clean = clean[idx : end+1]
		}
	}

	var parsed struct {
		Briefing string `json:"briefing"`
		Themes   []struct {
			Title   string  `json:"title"`
			Summary string  `json:"summary"`
			CardIDs []int64 `json:"card_ids"`
		} `json:"themes"`
	}
	if err := json.Unmarshal([]byte(clean), &parsed); err != nil || parsed.Briefing == "" {
		briefing, themes := heuristicSynthesis(cards)
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":       true,
			"briefing": briefing,
			"themes":   themes,
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":       true,
		"briefing": parsed.Briefing,
		"themes":   parsed.Themes,
	})
}

func (a *api) pushDigest(w http.ResponseWriter, r *http.Request) {
	if a.svc == nil || a.svc.Channel == nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"ok":    false,
			"error": "No notification channels configured or available.",
		})
		return
	}

	days := 7
	if q := r.URL.Query().Get("days"); q != "" {
		if d, err := strconv.Atoi(q); err == nil && d > 0 && d <= 90 {
			days = d
		}
	}

	targetChannel := r.URL.Query().Get("channel")
	if targetChannel == "" {
		targetChannel = "all"
	}

	cards, err := a.store.ListCards(r.Context(), port.CardFilter{Since: time.Now().UTC().AddDate(0, 0, -days), Limit: 500})
	if err != nil {
		a.fail(w, err)
		return
	}

	var inbox, doing, done, shelved int
	for _, c := range cards {
		switch c.Status {
		case port.StatusInbox:
			inbox++
		case port.StatusToDo, port.StatusInProgress:
			doing++
		case port.StatusDone:
			done++
		case port.StatusShelved:
			shelved++
		}
	}

	var sb strings.Builder
	sb.WriteString("📊 *Sparkkeep Intelligence Digest*\n")
	fmt.Fprintf(&sb, "Window: Last %d days • Total: %d sparks\n\n", days, len(cards))
	fmt.Fprintf(&sb, "• 📥 Inbox: %d\n• ⚡ In Progress: %d\n• ✅ Done: %d\n• 📦 Shelved: %d\n\n",
		inbox, doing, done, shelved)

	if len(cards) > 0 {
		sb.WriteString("*Top Sparks:*\n")
		limit := 5
		if len(cards) < limit {
			limit = len(cards)
		}
		for i := 0; i < limit; i++ {
			c := cards[i]
			fmt.Fprintf(&sb, "%d. %s [%s]\n", i+1, strings.TrimSpace(c.Title), c.Horizon)
		}
	}

	err = a.svc.Channel.Notify(r.Context(), port.Notification{
		Kind: "digest",
		Card: port.Card{SourceChannel: targetChannel},
		Text: sb.String(),
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{
			"ok":    false,
			"error": err.Error(),
		})
		return
	}

	msg := "Digest successfully sent to configured channels!"
	if targetChannel != "all" {
		msg = fmt.Sprintf("Digest successfully sent to %s!", targetChannel)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"message": msg,
	})
}

func (a *api) pushDigestTelegram(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	q.Set("channel", "telegram")
	r.URL.RawQuery = q.Encode()
	a.pushDigest(w, r)
}

func (a *api) listChannels(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tgToken, _ := a.store.GetSetting(ctx, "tg_token")
	if tgToken == "" {
		tgToken = a.tgToken
	}
	tgChatID, _ := a.store.GetSetting(ctx, "tg_chat_id")

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
	slackWebhook, _ := a.store.GetSetting(ctx, "slack_webhook_url")
	slackBotToken, _ := a.store.GetSetting(ctx, "slack_bot_token")
	slackChanID, _ := a.store.GetSetting(ctx, "slack_channel_id")

	channels := []map[string]any{
		{
			"id":        "telegram",
			"name":      "Telegram",
			"enabled":   tgToken != "",
			"chat_id":   tgChatID,
			"has_token": tgToken != "",
			"capabilities": map[string]any{
				"buttons":   true,
				"reactions": true,
				"markdown":  "telegram",
			},
		},
		{
			"id":          "openclaw",
			"name":        "OpenClaw Bridge",
			"enabled":     openclawEnabled == "true" || openclawToken != "",
			"gateway_url": openclawURL,
			"channel":     openclawChan,
			"target":      openclawTarget,
			"has_token":   openclawToken != "",
			"capabilities": map[string]any{
				"buttons":   false,
				"reactions": true,
				"markdown":  "markdown",
			},
		},
		{
			"id":         "discord",
			"name":       "Discord",
			"enabled":    discordToken != "" && discordChanID != "",
			"channel_id": discordChanID,
			"has_token":  discordToken != "",
			"capabilities": map[string]any{
				"buttons":   true,
				"reactions": true,
				"markdown":  "discord",
			},
		},
		{
			"id":            "slack",
			"name":          "Slack",
			"enabled":       slackWebhook != "" || (slackBotToken != "" && slackChanID != ""),
			"has_webhook":   slackWebhook != "",
			"has_bot_token": slackBotToken != "",
			"capabilities": map[string]any{
				"buttons":   true,
				"reactions": true,
				"markdown":  "slack",
			},
		},
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "channels": channels})
}

func (a *api) testChannel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeErr(w, http.StatusBadRequest, "channel id required")
		return
	}

	testCard := port.Card{
		ID:            999,
		Title:         "Sparkkeep Channel Connectivity Test",
		Summary:       "This is a test notification confirming that Sparkkeep can deliver alerts and cards to this channel.",
		Type:          "tool",
		Horizon:       "short-term",
		SourceChannel: id,
		Worthiness:    port.Worthiness{Level: "High", Reason: "Testing connectivity"},
	}

	if a.svc == nil || a.svc.Channel == nil {
		writeErr(w, http.StatusServiceUnavailable, "channel service not available")
		return
	}

	err := a.svc.Channel.Notify(r.Context(), port.Notification{
		Kind: "created",
		Card: testCard,
		Text: "Sparkkeep Channel Connectivity Test: OK",
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"message": fmt.Sprintf("Test notification sent successfully to %s", id),
	})
}

func (a *api) openclawWebhook(w http.ResponseWriter, r *http.Request) {
	if a.svc != nil && a.svc.Hub != nil {
		if adapter, ok := a.svc.Hub.Get("openclaw"); ok {
			if oc, ok := adapter.(*openclaw.Adapter); ok {
				oc.HandleWebhook(w, r)
				return
			}
		}
	}
	gwURL, _ := a.store.GetSetting(r.Context(), "openclaw_url")
	gwTok, _ := a.store.GetSetting(r.Context(), "openclaw_token")
	oc := openclaw.New(openclaw.Config{
		GatewayURL: gwURL,
		HookToken:  gwTok,
	}, a.svc, a.store, "", nil)
	oc.HandleWebhook(w, r)
}

func (a *api) discordInteractions(w http.ResponseWriter, r *http.Request) {
	if a.svc != nil && a.svc.Hub != nil {
		if adapter, ok := a.svc.Hub.Get("discord"); ok {
			if dc, ok := adapter.(*discord.Adapter); ok {
				dc.HandleInteraction(w, r)
				return
			}
		}
	}
	dc := discord.New(discord.Config{}, a.svc, a.store, "", nil)
	dc.HandleInteraction(w, r)
}

func (a *api) discordCapture(w http.ResponseWriter, r *http.Request) {
	if a.svc != nil && a.svc.Hub != nil {
		if adapter, ok := a.svc.Hub.Get("discord"); ok {
			if dc, ok := adapter.(*discord.Adapter); ok {
				dc.HandleCapture(w, r)
				return
			}
		}
	}
	dc := discord.New(discord.Config{}, a.svc, a.store, "", nil)
	dc.HandleCapture(w, r)
}
