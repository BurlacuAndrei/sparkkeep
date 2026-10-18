package web

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"sparkkeep/internal/analyze"
	"sparkkeep/internal/core"
	"sparkkeep/internal/obsidian"
	"sparkkeep/internal/port"
)

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

func normalizeReferences(refs []port.Reference) error {
	return analyze.NormalizeReferences(refs)
}

func (a *api) createCard(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Title            string           `json:"title"`
		Summary          string           `json:"summary"`
		Horizon          string           `json:"horizon"`
		Status           string           `json:"status"`
		SourceURL        string           `json:"source_url"`
		SourceNote       string           `json:"source_note"`
		Tags             []string         `json:"tags"`
		References       []port.Reference `json:"references"`
		Type             string           `json:"type"`
		TLDR             string           `json:"tldr"`
		WhyCare          string           `json:"why_care"`
		Claims           []string         `json:"claims"`
		OpenQuestions    []string         `json:"open_questions"`
		Signals          port.Signals     `json:"signals"`
		Worthiness       port.Worthiness  `json:"worthiness"`
		ExecutiveSummary string           `json:"executive_summary"`
		ValueProposition string           `json:"value_proposition"`
		ProposedActions  []string         `json:"proposed_actions"`
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
	if err := normalizeReferences(b.References); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	card, err := a.store.CreateCard(r.Context(), port.Card{
		Title:            b.Title,
		Summary:          b.Summary,
		Horizon:          b.Horizon,
		Status:           b.Status,
		SourceURL:        b.SourceURL,
		SourceNote:       b.SourceNote,
		Tags:             b.Tags,
		References:       b.References,
		Type:             b.Type,
		TLDR:             b.TLDR,
		WhyCare:          b.WhyCare,
		Claims:           b.Claims,
		OpenQuestions:    b.OpenQuestions,
		Signals:          b.Signals,
		Worthiness:       b.Worthiness,
		ExecutiveSummary: b.ExecutiveSummary,
		ValueProposition: b.ValueProposition,
		ProposedActions:  b.ProposedActions,
	})
	if err != nil {
		if errors.Is(err, port.ErrConflict) {
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
		Title              *string           `json:"title"`
		Status             *string           `json:"status"`
		Horizon            *string           `json:"horizon"`
		Note               *string           `json:"note"`
		Tags               []string          `json:"tags"`
		References         *[]port.Reference `json:"references"`
		Type               *string           `json:"type"`
		TLDR               *string           `json:"tldr"`
		WhyCare            *string           `json:"why_care"`
		Claims             *[]string         `json:"claims"`
		OpenQuestions      *[]string         `json:"open_questions"`
		Signals            *port.Signals     `json:"signals"`
		Worthiness         *port.Worthiness  `json:"worthiness"`
		ExecutiveSummary   *string           `json:"executive_summary"`
		ValueProposition   *string           `json:"value_proposition"`
		ProposedActions    *[]string         `json:"proposed_actions"`
		CompletedActions   *[]string         `json:"completed_actions"`
		ActionsSource      *string           `json:"actions_source"`
		AnalysisFailed     *bool             `json:"analysis_failed"`
		ResearchVerdict    *string           `json:"research_verdict"`
		ResearchConfidence *string           `json:"research_confidence"`
		SuggestedHorizon   *string           `json:"suggested_horizon"`
		SuggestedTags      *[]string         `json:"suggested_tags"`
		ResearchState      *string           `json:"research_state"`
	}
	if err := decodeJSON(w, r, &b); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request: "+err.Error())
		return
	}
	if b.Status != nil && *b.Status == "researching" {
		inbox := port.StatusInbox
		b.Status = &inbox
		rs := port.ResearchStateRunning
		b.ResearchState = &rs
	}
	if b.Status != nil && !port.ValidStatus(*b.Status) {
		writeErr(w, http.StatusBadRequest, "invalid status: "+*b.Status)
		return
	}
	if b.ResearchState != nil && !port.ValidResearchState(*b.ResearchState) {
		writeErr(w, http.StatusBadRequest, "invalid research_state: "+*b.ResearchState)
		return
	}
	if b.Horizon != nil && !port.ValidHorizon(*b.Horizon) {
		writeErr(w, http.StatusBadRequest, "invalid horizon: "+*b.Horizon)
		return
	}
	if b.References != nil {
		if err := normalizeReferences(*b.References); err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	card, err := a.store.GetCard(r.Context(), id)
	if err != nil {
		a.fail(w, err)
		return
	}
	oldStatus := card.Status
	patch := port.CardPatch{
		Title:              b.Title,
		Status:             b.Status,
		Horizon:            b.Horizon,
		Note:               b.Note,
		Type:               b.Type,
		TLDR:               b.TLDR,
		WhyCare:            b.WhyCare,
		Claims:             b.Claims,
		OpenQuestions:      b.OpenQuestions,
		Signals:            b.Signals,
		Worthiness:         b.Worthiness,
		ExecutiveSummary:   b.ExecutiveSummary,
		ValueProposition:   b.ValueProposition,
		ProposedActions:    b.ProposedActions,
		CompletedActions:   b.CompletedActions,
		ActionsSource:      b.ActionsSource,
		AnalysisFailed:     b.AnalysisFailed,
		ResearchVerdict:    b.ResearchVerdict,
		ResearchConfidence: b.ResearchConfidence,
		SuggestedHorizon:   b.SuggestedHorizon,
		SuggestedTags:      b.SuggestedTags,
		ResearchState:      b.ResearchState,
		References:         b.References,
	}
	if patch.Title != nil || patch.Status != nil || patch.Horizon != nil || patch.Note != nil || patch.Type != nil || patch.TLDR != nil || patch.WhyCare != nil || patch.Claims != nil || patch.OpenQuestions != nil || patch.Signals != nil || patch.Worthiness != nil || patch.ExecutiveSummary != nil || patch.ValueProposition != nil || patch.ProposedActions != nil || patch.CompletedActions != nil || patch.ActionsSource != nil || patch.AnalysisFailed != nil || patch.ResearchVerdict != nil || patch.ResearchConfidence != nil || patch.SuggestedHorizon != nil || patch.SuggestedTags != nil || patch.ResearchState != nil || patch.References != nil {
		if a.svc != nil {
			card, err = a.svc.UpdateCard(r.Context(), id, patch)
		} else {
			card, err = a.store.UpdateCard(r.Context(), id, patch)
		}
		if err != nil {
			a.fail(w, err)
			return
		}
		// Trigger auto-export on status transition into doing/done states
		if a.svc != nil && b.Status != nil && oldStatus != *b.Status {
			a.svc.TriggerAutoExportOnStatusChange(r.Context(), card, oldStatus, *b.Status)
		}
	}
	if b.Tags != nil {
		if a.svc != nil {
			if err := a.svc.SetCardTags(r.Context(), id, b.Tags); err != nil {
				a.fail(w, err)
				return
			}
		} else {
			if err := a.store.SetCardTags(r.Context(), id, b.Tags); err != nil {
				a.fail(w, err)
				return
			}
		}
		card, err = a.store.GetCard(r.Context(), id)
		if err != nil {
			a.fail(w, err)
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "data": card})
}

func (a *api) deleteCard(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, http.StatusBadRequest, "bad id")
		return
	}
	if err := a.store.DeleteCard(r.Context(), id); err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *api) createCardComment(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, http.StatusBadRequest, "bad id")
		return
	}
	var b struct {
		Content string `json:"content"`
	}
	if err := decodeJSON(w, r, &b); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request: "+err.Error())
		return
	}
	b.Content = strings.TrimSpace(b.Content)
	if b.Content == "" {
		writeErr(w, http.StatusBadRequest, "comment content cannot be empty")
		return
	}
	var comment port.CardComment
	var err error
	if a.svc != nil {
		comment, err = a.svc.AddCardComment(r.Context(), id, b.Content)
	} else {
		comment, err = a.store.AddCardComment(r.Context(), id, b.Content)
	}
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "data": comment})
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
	var n int
	var err error
	if a.svc != nil {
		n, err = a.svc.ShelveStaleCards(r.Context(), days)
	} else {
		var n64 int64
		n64, err = a.store.ShelveStale(r.Context(), days)
		n = int(n64)
	}
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "shelved_count": n})
}

// exportMarkdown renders a card as an Obsidian-compatible markdown note, including research dossier if present.
func (a *api) exportMarkdown(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, http.StatusBadRequest, "bad id")
		return
	}
	var exp port.CardExport
	if a.svc != nil {
		var err error
		exp, err = a.svc.BuildCardExport(r.Context(), id)
		if err != nil {
			if errors.Is(err, port.ErrNotFound) {
				writeErr(w, http.StatusNotFound, "card not found")
				return
			}
			a.fail(w, err)
			return
		}
	} else {
		card, err := a.store.GetCard(r.Context(), id)
		if err != nil {
			if errors.Is(err, port.ErrNotFound) {
				writeErr(w, http.StatusNotFound, "card not found")
				return
			}
			a.fail(w, err)
			return
		}
		var latestDone *port.Research
		if history, herr := a.store.ListResearchByCard(r.Context(), id); herr == nil && len(history) > 0 {
			for i := len(history) - 1; i >= 0; i-- {
				if history[i].Status == port.ResearchStateDone || history[i].Status == "done" {
					latestDone = &history[i]
					break
				}
			}
		}
		exp = port.CardExport{Card: card, Research: latestDone}
	}

	md := obsidian.CardExportToMarkdown(exp)
	w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
	fmt.Fprint(w, md)
}

func (a *api) getCardResearch(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, http.StatusBadRequest, "bad card id")
		return
	}
	history, err := a.store.ListResearchByCard(r.Context(), id)
	if err != nil {
		a.fail(w, err)
		return
	}
	if history == nil {
		history = []port.Research{}
	}
	var latest *port.Research
	if len(history) > 0 {
		latest = &history[0]
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true,
		"data": map[string]any{
			"latest":  latest,
			"history": history,
		},
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
