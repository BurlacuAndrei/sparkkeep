package web

import (
	"encoding/json"
	"errors"
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
	"sparkkeep/internal/i18n"
	"sparkkeep/internal/obsidian"
	"sparkkeep/internal/port"
	"sparkkeep/internal/webhook"
)

func (a *api) exportCardObsidian(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, http.StatusBadRequest, "bad card id")
		return
	}
	if a.svc == nil {
		writeErr(w, http.StatusServiceUnavailable, "service unavailable")
		return
	}
	if err := a.svc.ExportCardToSink(r.Context(), port.SinkObsidian, id); err != nil {
		if errors.Is(err, port.ErrNotFound) {
			writeErr(w, http.StatusNotFound, "card not found")
			return
		}
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"card_id": id,
		"sink":    port.SinkObsidian,
	})
}

func (a *api) syncObsidian(w http.ResponseWriter, r *http.Request) {
	var b struct {
		VaultPath string `json:"vault_path"`
	}
	_ = decodeJSON(w, r, &b)

	if a.svc != nil {
		written, err := a.svc.ExportLibraryToSink(r.Context(), port.SinkObsidian, b.VaultPath)
		if err != nil {
			a.fail(w, err)
			return
		}
		vaultPath, _ := a.svc.GetObsidianVaultDir(r.Context(), b.VaultPath)
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":         true,
			"written":    written,
			"vault_path": vaultPath,
		})
		return
	}

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

func (a *api) testObsidianSink(w http.ResponseWriter, r *http.Request) {
	var b struct {
		VaultPath string `json:"vault_path"`
	}
	_ = decodeJSON(w, r, &b)

	if a.svc == nil {
		writeErr(w, http.StatusServiceUnavailable, "service unavailable")
		return
	}
	res, err := a.svc.TestSinkConnection(r.Context(), port.SinkObsidian, b.VaultPath)
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      res.Success,
		"success": res.Success,
		"message": res.Message,
		"details": res.Details,
	})
}

func (a *api) testJoplinSink(w http.ResponseWriter, r *http.Request) {
	if a.svc == nil {
		writeErr(w, http.StatusServiceUnavailable, "service unavailable")
		return
	}
	res, err := a.svc.TestSinkConnection(r.Context(), port.SinkJoplin, "")
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      res.Success,
		"success": res.Success,
		"message": res.Message,
		"details": res.Details,
	})
}

func (a *api) syncJoplin(w http.ResponseWriter, r *http.Request) {
	if a.svc == nil {
		writeErr(w, http.StatusServiceUnavailable, "service unavailable")
		return
	}
	written, err := a.svc.ExportLibraryToSink(r.Context(), port.SinkJoplin, "")
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"written": written,
		"sink":    port.SinkJoplin,
	})
}

func (a *api) exportCardJoplin(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, http.StatusBadRequest, "bad card id")
		return
	}
	if a.svc == nil {
		writeErr(w, http.StatusServiceUnavailable, "service unavailable")
		return
	}
	if err := a.svc.ExportCardToSink(r.Context(), port.SinkJoplin, id); err != nil {
		if errors.Is(err, port.ErrNotFound) {
			writeErr(w, http.StatusNotFound, "card not found")
			return
		}
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"card_id": id,
		"sink":    port.SinkJoplin,
	})
}

func (a *api) testNotionSink(w http.ResponseWriter, r *http.Request) {
	if a.svc == nil {
		writeErr(w, http.StatusServiceUnavailable, "service unavailable")
		return
	}
	res, err := a.svc.TestSinkConnection(r.Context(), port.SinkNotion, "")
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      res.Success,
		"success": res.Success,
		"message": res.Message,
		"details": res.Details,
	})
}

func (a *api) syncNotion(w http.ResponseWriter, r *http.Request) {
	if a.svc == nil {
		writeErr(w, http.StatusServiceUnavailable, "service unavailable")
		return
	}
	written, err := a.svc.ExportLibraryToSink(r.Context(), port.SinkNotion, "")
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"written": written,
		"sink":    port.SinkNotion,
	})
}

func (a *api) exportCardNotion(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, http.StatusBadRequest, "bad card id")
		return
	}
	if a.svc == nil {
		writeErr(w, http.StatusServiceUnavailable, "service unavailable")
		return
	}
	if err := a.svc.ExportCardToSink(r.Context(), port.SinkNotion, id); err != nil {
		if errors.Is(err, port.ErrNotFound) {
			writeErr(w, http.StatusNotFound, "card not found")
			return
		}
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"card_id": id,
		"sink":    port.SinkNotion,
	})
}

func (a *api) testWebhook(w http.ResponseWriter, r *http.Request) {
	if a.svc == nil || a.svc.Webhook == nil {
		writeErr(w, http.StatusServiceUnavailable, "webhook dispatcher not available")
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
// wins, horizon balance, stale alerts, and cached executive synthesis.
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
	staleCutoff := now.AddDate(0, 0, -14)

	// List cards without a created_at filter so cards captured earlier but
	// completed, actioned, or researched in this window are tracked.
	cards, err := a.store.ListCards(r.Context(), port.CardFilter{Limit: 5000})
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
	weeklyWins := make([]port.Card, 0)
	researchHarvest := make([]port.Card, 0)
	staleCards := make([]port.Card, 0)
	var completedActionsCount int
	var prevWins int

	for _, c := range cards {
		// Group cards captured in current window
		if !c.CreatedAt.Before(since) && !c.CreatedAt.After(now) {
			dk := key(c.CreatedAt)
			if window[dk] {
				byDay[dk] = append(byDay[dk], c)
				byStatus[c.Status]++
				byHorizon[c.Horizon]++
				currentTotal++
			}
		} else if !c.CreatedAt.Before(prevSince) && c.CreatedAt.Before(since) {
			// Captured in previous comparison window
			prevTotal++
		}

		inWindow := c.UpdatedAt.After(since) || c.CreatedAt.After(since)

		// weekly_wins: status == 'done' AND (c.UpdatedAt.After(since) || c.CreatedAt.After(since))
		if c.Status == port.StatusDone && inWindow {
			weeklyWins = append(weeklyWins, c)
		}

		// completed_actions_count: sum of c.CompletedActions for cards with UpdatedAt/CreatedAt in window
		if inWindow {
			completedActionsCount += len(c.CompletedActions)
		}

		// research_harvest: (c.ResearchState == "done" || c.ResearchVerdict != "") AND (c.UpdatedAt.After(since) || c.CreatedAt.After(since))
		if (c.ResearchState == "done" || c.ResearchVerdict != "") && inWindow {
			researchHarvest = append(researchHarvest, c)
		}

		// prev_wins: done cards where UpdatedAt/CreatedAt fell between (since - days) and since
		if c.Status == port.StatusDone && !inWindow {
			inPrev := func(t time.Time) bool {
				return !t.IsZero() && t.After(prevSince) && !t.After(since)
			}
			if inPrev(c.UpdatedAt) || inPrev(c.CreatedAt) {
				prevWins++
			}
		}

		// stale_cards: short-term cards not updated in > 14 days
		checkTime := c.UpdatedAt
		if checkTime.IsZero() {
			checkTime = c.CreatedAt
		}
		if c.Horizon == "short-term" &&
			(c.Status == port.StatusInbox || c.Status == port.StatusToDo || c.Status == port.StatusInProgress) &&
			checkTime.Before(staleCutoff) {
			staleCards = append(staleCards, c)
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

	// Include cached synthesis if present under key digest_synthesis_<days>
	synthKey := fmt.Sprintf("digest_synthesis_%d", days)
	var cachedSynth any
	if raw, err := a.store.GetSetting(r.Context(), synthKey); err == nil && strings.TrimSpace(raw) != "" {
		var parsed any
		if err := json.Unmarshal([]byte(raw), &parsed); err == nil {
			cachedSynth = parsed
		}
	}

	resp := map[string]any{
		"ok":                      true,
		"week_total":              currentTotal,
		"prev_total":              prevTotal,
		"wow_delta_percent":       wowDelta,
		"by_status":               byStatus,
		"by_horizon":              byHorizon,
		"weekly_wins":             weeklyWins,
		"prev_wins":               prevWins,
		"completed_actions_count": completedActionsCount,
		"research_harvest":        researchHarvest,
		"stale_count":             len(staleCards),
		"stale_cards":             staleCards,
		"days":                    groups,
	}
	if cachedSynth != nil {
		resp["synthesis"] = cachedSynth
	}

	writeJSON(w, http.StatusOK, resp)
}

type digestFocusRecommendation struct {
	CardID    int64  `json:"card_id"`
	Title     string `json:"title,omitempty"`
	Reason    string `json:"reason,omitempty"`
	Rationale string `json:"rationale,omitempty"`
	Priority  string `json:"priority,omitempty"`
}

type digestSynthesisTheme struct {
	Title   string  `json:"title"`
	Summary string  `json:"summary"`
	CardIDs []int64 `json:"card_ids"`
}

type digestSynthesisResult struct {
	OK            bool                        `json:"ok"`
	Briefing      string                      `json:"briefing"`
	WinsNarrative string                      `json:"wins_narrative,omitempty"`
	Themes        []digestSynthesisTheme      `json:"themes,omitempty"`
	NextFocus     []digestFocusRecommendation `json:"next_focus,omitempty"`
	Model         string                      `json:"model,omitempty"`
	GeneratedAt   string                      `json:"generated_at,omitempty"`
}

func heuristicRetrospective(cards []port.Card, days int) digestSynthesisResult {
	now := time.Now().UTC()
	since := now.AddDate(0, 0, -days)

	tagCounts := make(map[string][]int64)
	var weeklyWins []port.Card
	var activeCards []port.Card
	var capturedCards []port.Card

	for _, c := range cards {
		inWindow := c.UpdatedAt.After(since) || c.CreatedAt.After(since)
		if !c.CreatedAt.Before(since) && !c.CreatedAt.After(now) {
			capturedCards = append(capturedCards, c)
		}
		if c.Status == port.StatusDone && inWindow {
			weeklyWins = append(weeklyWins, c)
		}
		if (c.Status == port.StatusInProgress || c.Status == port.StatusToDo || c.Status == port.StatusInbox) && inWindow {
			activeCards = append(activeCards, c)
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

	var themes []digestSynthesisTheme
	for i, p := range pairs {
		if i >= 4 {
			break
		}
		themes = append(themes, digestSynthesisTheme{
			Title:   strings.ToUpper(p.tag[:1]) + p.tag[1:],
			Summary: fmt.Sprintf("%d spark(s) under #%s", len(p.ids), p.tag),
			CardIDs: p.ids,
		})
	}

	briefing := fmt.Sprintf("• Ingested %d sparks during this window across %d active topics.\n• %d card(s) marked as completed Done.\n• %d items categorized and ready for review.",
		len(capturedCards), len(pairs), len(weeklyWins), len(cards)-len(weeklyWins))

	var winsNarrative string
	if len(weeklyWins) == 0 {
		winsNarrative = "No cards marked done in this period yet."
	} else {
		var winTitles []string
		for i, w := range weeklyWins {
			if i >= 5 {
				break
			}
			winTitles = append(winTitles, fmt.Sprintf("%q", strings.TrimSpace(w.Title)))
		}
		winsNarrative = fmt.Sprintf("Completed %d key initiative(s) this period: %s.", len(weeklyWins), strings.Join(winTitles, ", "))
	}

	sort.Slice(activeCards, func(i, j int) bool {
		statusScore := func(s string) int {
			switch s {
			case port.StatusInProgress:
				return 3
			case port.StatusToDo:
				return 2
			default:
				return 1
			}
		}
		horizonScore := func(h string) int {
			switch h {
			case "short-term":
				return 3
			case "medium-term":
				return 2
			default:
				return 1
			}
		}
		si, sj := statusScore(activeCards[i].Status), statusScore(activeCards[j].Status)
		if si != sj {
			return si > sj
		}
		hi, hj := horizonScore(activeCards[i].Horizon), horizonScore(activeCards[j].Horizon)
		if hi != hj {
			return hi > hj
		}
		return activeCards[i].CreatedAt.After(activeCards[j].CreatedAt)
	})

	var nextFocus []digestFocusRecommendation
	for i, c := range activeCards {
		if i >= 3 {
			break
		}
		reason := fmt.Sprintf("Active %s initiative in %s status", c.Horizon, c.Status)
		if c.TLDR != "" {
			reason = c.TLDR
		}
		prio := "high"
		if c.Horizon == "long-term" {
			prio = "medium"
		}
		nextFocus = append(nextFocus, digestFocusRecommendation{
			CardID:    c.ID,
			Title:     c.Title,
			Reason:    reason,
			Rationale: reason,
			Priority:  prio,
		})
	}

	return digestSynthesisResult{
		OK:            true,
		Briefing:      briefing,
		WinsNarrative: winsNarrative,
		Themes:        themes,
		NextFocus:     nextFocus,
		Model:         "heuristic",
		GeneratedAt:   now.Format(time.RFC3339),
	}
}

func (a *api) synthesizeDigest(w http.ResponseWriter, r *http.Request) {
	days := 7
	if q := r.URL.Query().Get("days"); q != "" {
		if d, err := strconv.Atoi(q); err == nil && d > 0 && d <= 90 {
			days = d
		}
	}
	now := time.Now().UTC()
	since := now.AddDate(0, 0, -days)
	cards, err := a.store.ListCards(r.Context(), port.CardFilter{Limit: 5000})
	if err != nil {
		a.fail(w, err)
		return
	}

	var capturedCards []port.Card
	var weeklyWins []port.Card
	var activeCandidates []port.Card
	for _, c := range cards {
		inWindow := c.UpdatedAt.After(since) || c.CreatedAt.After(since)
		if !c.CreatedAt.Before(since) && !c.CreatedAt.After(now) {
			capturedCards = append(capturedCards, c)
		}
		if c.Status == port.StatusDone && inWindow {
			weeklyWins = append(weeklyWins, c)
		}
		if (c.Status == port.StatusInProgress || c.Status == port.StatusToDo || c.Status == port.StatusInbox) && inWindow {
			activeCandidates = append(activeCandidates, c)
		}
	}

	var llm *analyze.Client
	if a.svc != nil {
		llm = a.svc.ClientFor(analyze.RoleDigestSynthesis)
	}

	synthKey := fmt.Sprintf("digest_synthesis_%d", days)

	if llm == nil || llm.Model == "" {
		res := heuristicRetrospective(cards, days)
		if data, err := json.Marshal(res); err == nil {
			_ = a.store.SetSetting(r.Context(), synthKey, string(data))
		}
		writeJSON(w, http.StatusOK, res)
		return
	}

	var prof *port.UserProfile
	if a.store != nil {
		if val, err := a.store.GetSetting(r.Context(), "user_profile"); err == nil && strings.TrimSpace(val) != "" {
			var p port.UserProfile
			if json.Unmarshal([]byte(val), &p) == nil && !p.IsEmpty() {
				prof = &p
			}
		}
		if prof == nil || prof.Language == "" {
			if loc, err := a.store.GetSetting(r.Context(), "interface_locale"); err == nil && strings.TrimSpace(loc) != "" {
				if prof == nil {
					prof = &port.UserProfile{}
				}
				prof.Language = port.LocaleToLanguageName(strings.TrimSpace(loc))
			}
		}
	}

	var sb strings.Builder
	sb.WriteString("You are an executive intelligence assistant analyzing the user's knowledge base sparks, accomplishments, and active work for a periodic retrospective.\n")
	if prof != nil {
		if prof.Language != "" {
			fmt.Fprintf(&sb, "Output Language: Respond entirely in %s.\n", prof.Language)
		}
		if prof.Goals != "" {
			fmt.Fprintf(&sb, "User Strategic Goals: %s\n", prof.Goals)
		}
		if len(prof.Stack) > 0 {
			fmt.Fprintf(&sb, "User Stack & Tools: %s\n", strings.Join(prof.Stack, ", "))
		}
		if len(prof.Interests) > 0 {
			fmt.Fprintf(&sb, "User Interests: %s\n", strings.Join(prof.Interests, ", "))
		}
		if prof.Constraints != "" {
			fmt.Fprintf(&sb, "User Constraints: %s\n", prof.Constraints)
		}
	}

	sb.WriteString(`
Return ONLY a valid JSON object matching this schema:
{
  "briefing": "A concise executive briefing (2-3 bullet lines) summarizing captured sparks, focus areas, and momentum across the window.",
  "wins_narrative": "A structured narrative highlighting key accomplishments, completed cards, and impact achieved during this period.",
  "themes": [
    {
      "title": "Short theme name",
      "summary": "1 sentence explanation of the theme",
      "card_ids": [123, 456]
    }
  ],
  "next_focus": [
    {
      "card_id": 123,
      "title": "Card title",
      "reason": "Why this card should be prioritized in the next period",
      "priority": "high"
    }
  ]
}

Ensure "next_focus" contains at most 3 high-impact cards selected from active/in-progress/to-do items.
`)

	sb.WriteString("\nSparks Captured in Window:\n")
	for i, c := range capturedCards {
		if i >= 30 {
			break
		}
		tags := strings.Join(c.Tags, ", ")
		fmt.Fprintf(&sb, "- ID:%d | Title: %s | Tags: [%s] | Horizon: %s | Status: %s | TLDR: %s\n",
			c.ID, c.Title, tags, c.Horizon, c.Status, c.TLDR)
	}

	if len(weeklyWins) > 0 {
		sb.WriteString("\nCompleted Period Wins:\n")
		for i, c := range weeklyWins {
			if i >= 20 {
				break
			}
			fmt.Fprintf(&sb, "- ID:%d | Title: %s | Horizon: %s | TLDR: %s\n",
				c.ID, c.Title, c.Horizon, c.TLDR)
		}
	}

	if len(activeCandidates) > 0 {
		sb.WriteString("\nActive Cards Eligible For Next-Period Focus:\n")
		for i, c := range activeCandidates {
			if i >= 20 {
				break
			}
			fmt.Fprintf(&sb, "- ID:%d | Title: %s | Horizon: %s | Status: %s | TLDR: %s\n",
				c.ID, c.Title, c.Horizon, c.Status, c.TLDR)
		}
	}

	ans, err := llm.Ask(r.Context(), sb.String())
	if err != nil {
		res := heuristicRetrospective(cards, days)
		if data, err := json.Marshal(res); err == nil {
			_ = a.store.SetSetting(r.Context(), synthKey, string(data))
		}
		writeJSON(w, http.StatusOK, res)
		return
	}

	clean := strings.TrimSpace(ans)
	if idx := strings.Index(clean, "{"); idx >= 0 {
		if end := strings.LastIndex(clean, "}"); end > idx {
			clean = clean[idx : end+1]
		}
	}

	var parsed struct {
		Briefing      string `json:"briefing"`
		WinsNarrative string `json:"wins_narrative"`
		Themes        []struct {
			Title   string  `json:"title"`
			Summary string  `json:"summary"`
			CardIDs []int64 `json:"card_ids"`
		} `json:"themes"`
		NextFocus []struct {
			CardID    int64  `json:"card_id"`
			Title     string `json:"title"`
			Reason    string `json:"reason"`
			Rationale string `json:"rationale"`
			Priority  string `json:"priority"`
		} `json:"next_focus"`
	}

	if err := json.Unmarshal([]byte(clean), &parsed); err != nil || strings.TrimSpace(parsed.Briefing) == "" {
		res := heuristicRetrospective(cards, days)
		if data, err := json.Marshal(res); err == nil {
			_ = a.store.SetSetting(r.Context(), synthKey, string(data))
		}
		writeJSON(w, http.StatusOK, res)
		return
	}

	var themes []digestSynthesisTheme
	for _, t := range parsed.Themes {
		themes = append(themes, digestSynthesisTheme{
			Title:   t.Title,
			Summary: t.Summary,
			CardIDs: t.CardIDs,
		})
	}
	if len(themes) == 0 {
		heuristicRes := heuristicRetrospective(cards, days)
		themes = heuristicRes.Themes
	}

	var nextFocus []digestFocusRecommendation
	for i, f := range parsed.NextFocus {
		if i >= 3 {
			break
		}
		reason := f.Reason
		if reason == "" {
			reason = f.Rationale
		}
		prio := f.Priority
		if prio == "" {
			prio = "high"
		}
		nextFocus = append(nextFocus, digestFocusRecommendation{
			CardID:    f.CardID,
			Title:     f.Title,
			Reason:    reason,
			Rationale: reason,
			Priority:  prio,
		})
	}
	if len(nextFocus) == 0 {
		heuristicRes := heuristicRetrospective(cards, days)
		nextFocus = heuristicRes.NextFocus
	}

	winsNarrative := parsed.WinsNarrative
	if strings.TrimSpace(winsNarrative) == "" {
		heuristicRes := heuristicRetrospective(cards, days)
		winsNarrative = heuristicRes.WinsNarrative
	}

	res := digestSynthesisResult{
		OK:            true,
		Briefing:      parsed.Briefing,
		WinsNarrative: winsNarrative,
		Themes:        themes,
		NextFocus:     nextFocus,
		Model:         llm.Model,
		GeneratedAt:   now.Format(time.RFC3339),
	}

	if data, err := json.Marshal(res); err == nil {
		_ = a.store.SetSetting(r.Context(), synthKey, string(data))
	}

	writeJSON(w, http.StatusOK, res)
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

	now := time.Now().UTC()
	since := now.AddDate(0, 0, -days)

	cards, err := a.store.ListCards(r.Context(), port.CardFilter{Limit: 5000})
	if err != nil {
		a.fail(w, err)
		return
	}

	var inbox, doing, done, shelved int
	var capturedCards []port.Card
	var weeklyWins []port.Card

	for _, c := range cards {
		if !c.CreatedAt.Before(since) && !c.CreatedAt.After(now) {
			capturedCards = append(capturedCards, c)
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

		inWindow := c.UpdatedAt.After(since) || c.CreatedAt.After(since)
		if c.Status == port.StatusDone && inWindow {
			weeklyWins = append(weeklyWins, c)
		}
	}

	loc, _ := a.store.GetSetting(r.Context(), "interface_locale")
	m := i18n.GetMessages(loc)

	var sb strings.Builder
	sb.WriteString(m.IntelligenceDigestTitle + "\n")
	fmt.Fprintf(&sb, m.IntelligenceDigestWindow+"\n\n", days, len(capturedCards))
	fmt.Fprintf(&sb, m.StatusInbox+"\n"+m.StatusInProgress+"\n"+m.StatusDone+"\n"+m.StatusShelved+"\n\n",
		inbox, doing, done, shelved)

	synthKey := fmt.Sprintf("digest_synthesis_%d", days)
	if raw, err := a.store.GetSetting(r.Context(), synthKey); err == nil && strings.TrimSpace(raw) != "" {
		var synth struct {
			Briefing      string `json:"briefing"`
			WinsNarrative string `json:"wins_narrative"`
		}
		if err := json.Unmarshal([]byte(raw), &synth); err == nil {
			if strings.TrimSpace(synth.Briefing) != "" {
				sb.WriteString("📋 Executive Briefing:\n" + strings.TrimSpace(synth.Briefing) + "\n\n")
			}
			if strings.TrimSpace(synth.WinsNarrative) != "" {
				sb.WriteString("🏆 Wins Narrative:\n" + strings.TrimSpace(synth.WinsNarrative) + "\n\n")
			}
		}
	}

	if len(capturedCards) > 0 {
		sb.WriteString(m.TopSparks + "\n")
		limit := 5
		if len(capturedCards) < limit {
			limit = len(capturedCards)
		}
		for i := 0; i < limit; i++ {
			c := capturedCards[i]
			fmt.Fprintf(&sb, "%d. %s [%s]\n", i+1, strings.TrimSpace(c.Title), c.Horizon)
		}
	}

	if len(weeklyWins) > 0 {
		sb.WriteString("\n🏆 Period Wins:\n")
		limit := 10
		if len(weeklyWins) < limit {
			limit = len(weeklyWins)
		}
		for i := 0; i < limit; i++ {
			wCard := weeklyWins[i]
			fmt.Fprintf(&sb, "• %s [%s]\n", strings.TrimSpace(wCard.Title), wCard.Horizon)
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
	}, a.svc, "", nil)
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
	// No configured adapter means there is no public key to authenticate against.
	writeErr(w, http.StatusServiceUnavailable, "discord channel not configured")
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
	dc := discord.New(discord.Config{}, a.svc, "", nil)
	dc.HandleCapture(w, r)
}
