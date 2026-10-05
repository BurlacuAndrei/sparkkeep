// Package web serves the JSON API (/api/v1) and the embedded dashboard
// (index.html + app.js) from one binary, same origin — no CORS, no build
// toolchain.
package web

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"io/fs"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"sparkkeep/internal/config"
	"sparkkeep/internal/core"
	"sparkkeep/internal/port"
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
}

// New returns a http.Handler routing /api/v1/* and the /assets static files
// (/ serves index.html).
func New(store port.Store, svc *core.Service, cfg config.Config) http.Handler {
	a := &api{
		store: store, svc: svc,
		uploadDir: cfg.UploadDir,
		maxUpload: int64(cfg.MaxUploadMB) << 20,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /", a.index)
	mux.Handle("GET /assets/", cacheAssets(http.StripPrefix("/assets/", staticFiles())))
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
	return mux
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
		if isUniqueConstraint(err) {
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
	card, err := a.svc.Retry(r.Context(), id)
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "data": card})
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
	msg := err.Error()
	return strings.Contains(msg, "UNIQUE constraint failed") ||
		strings.Contains(msg, "unique constraint") ||
		strings.Contains(msg, "idx_cards_source")
}
