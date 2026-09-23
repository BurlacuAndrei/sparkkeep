// Package web serves the JSON API (/api/v1) and the embedded dashboard
// (index.html + app.js) from one binary, same origin — no CORS, no build
// toolchain.
package web

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"io/fs"
	"net/http"
	"sort"
	"strconv"
	"time"

	"sparkkeep/internal/core"
	"sparkkeep/internal/port"
)

//go:embed static/*
var staticFS embed.FS

// api routes the mux to the injected Store and Service. publicURL is
// accepted for the dashboard's absolute links (e.g. research reports).
type api struct {
	store  port.Store
	svc    *core.Service
	public string
}

// New returns a http.Handler routing /api/v1/* and the /assets static files
// (/ serves index.html).
func New(store port.Store, svc *core.Service, publicURL string) http.Handler {
	a := &api{store: store, svc: svc, public: publicURL}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /", a.index)
	mux.Handle("GET /assets/", cacheAsssets(http.StripPrefix("/assets/", staticFiles())))
	mux.HandleFunc("GET /api/v1/health", a.health)
	mux.HandleFunc("GET /api/v1/cards", a.listCards)
	mux.HandleFunc("POST /api/v1/cards", a.createCard)
	mux.HandleFunc("GET /api/v1/cards/{id}", a.getCard)
	mux.HandleFunc("PATCH /api/v1/cards/{id}", a.patchCard)
	mux.HandleFunc("POST /api/v1/cards/{id}/retry", a.retryCard)
	mux.HandleFunc("GET /api/v1/tags", a.listTags)
	mux.HandleFunc("GET /api/v1/digest", a.weeklyDigest)
	mux.HandleFunc("GET /api/v1/research", a.listResearch)
	mux.HandleFunc("POST /api/v1/research", a.triggerResearch)
	return mux
}

// staticFiles roots the embed at the static/ subdirectory so /assets/app.js
// resolves to static/app.js.
func staticFiles() http.Handler {
	sub, err := fs.Sub(staticFS, "static")
	if err != nil {
		panic(err)
	}
	return http.FileServer(http.FS(sub))
}

// cacheAsssets marks built assets as cacheable; index.html (which can change
// between deploys) is deliberately excluded.
func cacheAsssets(h http.Handler) http.Handler {
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
	b, err := staticFS.ReadFile("static/index.html")
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
		Title      string   `json:"title"`
		Summary    string   `json:"summary"`
		Horizon    string   `json:"horizon"`
		Status     string   `json:"status"`
		SourceURL  string   `json:"source_url"`
		SourceNote string   `json:"source_note"`
		Tags       []string `json:"tags"`
	}
	if err := decodeJSON(r, &b); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request: "+err.Error())
		return
	}
	if b.Status == "" {
		b.Status = port.StatusInbox
	}
	card, err := a.store.CreateCard(r.Context(), port.Card{
		Title:      b.Title,
		Summary:    b.Summary,
		Horizon:    b.Horizon,
		Status:     b.Status,
		SourceURL:  b.SourceURL,
		SourceNote: b.SourceNote,
		Tags:       b.Tags,
	})
	if err != nil {
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
		Status  *string  `json:"status"`
		Horizon *string  `json:"horizon"`
		Note    *string  `json:"note"`
		Tags    []string `json:"tags"`
	}
	if err := decodeJSON(r, &b); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request: "+err.Error())
		return
	}
	card, err := a.store.GetCard(r.Context(), id)
	if err != nil {
		a.fail(w, err)
		return
	}
	patch := port.CardPatch{Status: b.Status, Horizon: b.Horizon, Note: b.Note}
	if patch.Status != nil || patch.Horizon != nil || patch.Note != nil {
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

// weeklyDigest groups cards created in the last 7 calendar days by day,
// newest first, with a total and per-status count.
// ponytail: full-table scan per digest call, fine for thousands of rows; add a
// created_at filter to port.CardFilter/ListCards when it stops being fine.
func (a *api) weeklyDigest(w http.ResponseWriter, r *http.Request) {
	cards, err := a.store.ListCards(r.Context(), port.CardFilter{})
	if err != nil {
		a.fail(w, err)
		return
	}

	const days = 7
	now := time.Now().UTC()
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
	if err := decodeJSON(r, &b); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request: "+err.Error())
		return
	}
	if b.CardID <= 0 {
		writeErr(w, http.StatusBadRequest, "bad card_id")
		return
	}
	go a.svc.Research(context.Background(), b.CardID)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "accepted": true})
}

// --- plumbing ---------------------------------------------------------------

func pathID(r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	return id, err == nil && id > 0
}

func decodeJSON(r *http.Request, v any) error {
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
