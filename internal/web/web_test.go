package web

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"sparkkeep/internal/analyze"
	"sparkkeep/internal/config"
	"sparkkeep/internal/core"
	"sparkkeep/internal/license"
	"sparkkeep/internal/port"
	"sparkkeep/internal/research"
	"sparkkeep/internal/webhook"
)

// --- stubs -------------------------------------------------------------------

// stubStore is an in-memory port.Store recording the last CardFilter and
// CardPatch (for forwarding assertions). Research rows are guarded by a mutex
// because the trigger endpoint runs Research in a goroutine.
type stubStore struct {
	mu         sync.Mutex
	cards      map[int64]port.Card
	captures   map[int64]port.Capture
	researches map[int64]port.Research
	playbooks  map[int64]port.Playbook
	tags       []port.Tag
	settings   map[string]string
	nextCard   int64
	nextCap    int64
	nextRes    int64
	nextPb     int64
	lastFilter port.CardFilter
	lastPatch  port.CardPatch
}

func newStubStore() *stubStore {
	st := &stubStore{
		cards:      map[int64]port.Card{},
		captures:   map[int64]port.Capture{},
		researches: map[int64]port.Research{},
		playbooks:  map[int64]port.Playbook{},
		settings:   map[string]string{},
		nextPb:     2,
	}
	st.playbooks[1] = research.DefaultPlaybook()
	st.playbooks[2] = research.ClaimCheckPlaybook()
	return st
}


func (s *stubStore) CreateCard(_ context.Context, c port.Card) (port.Card, error) {
	if c.SourceURL != "" {
		for _, existing := range s.cards {
			if existing.SourceURL == c.SourceURL {
				return port.Card{}, fmt.Errorf("UNIQUE constraint failed: idx_cards_source")
			}
		}
	}
	s.nextCard++
	c.ID = s.nextCard
	if c.References == nil {
		c.References = []port.Reference{}
	}
	c.CreatedAt = time.Now().UTC()
	c.UpdatedAt = c.CreatedAt
	s.cards[c.ID] = c
	return c, nil
}

func (s *stubStore) GetCard(_ context.Context, id int64) (port.Card, error) {
	c, ok := s.cards[id]
	if !ok {
		return port.Card{}, port.ErrNotFound
	}
	return c, nil
}

func (s *stubStore) GetCardBySourceURL(_ context.Context, url string) (port.Card, error) {
	url = strings.TrimSpace(url)
	if url == "" {
		return port.Card{}, port.ErrNotFound
	}
	for _, c := range s.cards {
		if c.SourceURL == url {
			return c, nil
		}
	}
	return port.Card{}, port.ErrNotFound
}

func (s *stubStore) CreateCapture(_ context.Context, c port.Capture) (port.Capture, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if c.SourceURL != "" {
		for _, existing := range s.captures {
			if existing.SourceURL == c.SourceURL {
				return port.Capture{}, fmt.Errorf("UNIQUE constraint failed: idx_captures_source")
			}
		}
	}
	s.nextCap++
	c.ID = s.nextCap
	c.CreatedAt = time.Now().UTC()
	s.captures[c.ID] = c
	return c, nil
}

func (s *stubStore) GetCapture(_ context.Context, id int64) (port.Capture, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c, ok := s.captures[id]
	if !ok {
		return port.Capture{}, port.ErrNotFound
	}
	return c, nil
}

func (s *stubStore) GetCaptureBySourceURL(_ context.Context, url string) (port.Capture, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	url = strings.TrimSpace(url)
	if url == "" {
		return port.Capture{}, port.ErrNotFound
	}
	for _, c := range s.captures {
		if c.SourceURL == url {
			return c, nil
		}
	}
	return port.Capture{}, port.ErrNotFound
}

func (s *stubStore) UpdateCapture(_ context.Context, c port.Capture) (port.Capture, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.captures[c.ID]; !ok {
		return port.Capture{}, port.ErrNotFound
	}
	s.captures[c.ID] = c
	return c, nil
}

func (s *stubStore) ListCards(_ context.Context, f port.CardFilter) ([]port.Card, error) {
	s.lastFilter = f
	var out []port.Card
	for _, c := range s.cards {
		if f.Horizon != "" && c.Horizon != f.Horizon {
			continue
		}
		if f.Status != "" && c.Status != f.Status {
			continue
		}
		if f.Tag != "" && !contains(c.Tags, f.Tag) {
			continue
		}
		if f.Query != "" && !strings.Contains(strings.ToLower(c.Title), strings.ToLower(f.Query)) {
			continue
		}
		if !f.Since.IsZero() && c.CreatedAt.Before(f.Since) {
			continue
		}
		if f.StaleDays > 0 && !c.UpdatedAt.Before(time.Now().UTC().AddDate(0, 0, -f.StaleDays)) {
			continue
		}
		out = append(out, c)
	}
	if f.Offset > 0 {
		if f.Offset >= len(out) {
			out = nil
		} else {
			out = out[f.Offset:]
		}
	}
	if f.Limit > 0 && len(out) > f.Limit {
		out = out[:f.Limit]
	}
	return out, nil
}

// ShelveStale mirrors the store: inbox/doing cards untouched for more than
// days become shelved.
func (s *stubStore) ShelveStale(_ context.Context, days int) (int64, error) {
	cutoff := time.Now().UTC().AddDate(0, 0, -days)
	var n int64
	for id, c := range s.cards {
		if (c.Status == port.StatusInbox || c.Status == port.StatusDoing) && c.UpdatedAt.Before(cutoff) {
			c.Status, c.UpdatedAt = port.StatusShelved, time.Now().UTC()
			s.cards[id] = c
			n++
		}
	}
	return n, nil
}

func (s *stubStore) UpdateCard(_ context.Context, id int64, p port.CardPatch) (port.Card, error) {
	s.lastPatch = p
	c, ok := s.cards[id]
	if !ok {
		return port.Card{}, port.ErrNotFound
	}
	if p.Status != nil {
		c.Status = *p.Status
	}
	if p.Horizon != nil {
		c.Horizon = *p.Horizon
	}
	if p.Note != nil {
		c.SourceNote = *p.Note
	}
	if p.SourceURL != nil {
		c.SourceURL = *p.SourceURL
	}
	if p.References != nil {
		c.References = *p.References
	}
	if p.Type != nil {
		c.Type = *p.Type
	}
	if p.TLDR != nil {
		c.TLDR = *p.TLDR
	}
	if p.WhyCare != nil {
		c.WhyCare = *p.WhyCare
	}
	if p.Claims != nil {
		c.Claims = *p.Claims
	}
	if p.OpenQuestions != nil {
		c.OpenQuestions = *p.OpenQuestions
	}
	if p.Signals != nil {
		c.Signals = *p.Signals
	}
	if p.Worthiness != nil {
		c.Worthiness = *p.Worthiness
	}
	if p.ProposedActions != nil {
		c.ProposedActions = *p.ProposedActions
		if p.ActionsSource == nil {
			c.ActionsSource = "user"
		}
	}
	if p.ActionsSource != nil {
		c.ActionsSource = *p.ActionsSource
	}
	if p.ResearchVerdict != nil {
		c.ResearchVerdict = *p.ResearchVerdict
	}
	if p.ResearchConfidence != nil {
		c.ResearchConfidence = *p.ResearchConfidence
	}
	if p.SuggestedHorizon != nil {
		c.SuggestedHorizon = *p.SuggestedHorizon
	}
	if p.SuggestedTags != nil {
		c.SuggestedTags = *p.SuggestedTags
	}
	c.UpdatedAt = time.Now().UTC()
	s.cards[id] = c
	return c, nil
}

func (s *stubStore) SetCardTags(_ context.Context, id int64, tags []string) error {
	c, ok := s.cards[id]
	if !ok {
		return port.ErrNotFound
	}
	c.Tags = tags
	s.cards[id] = c
	return nil
}

func (s *stubStore) SetCardReferences(_ context.Context, id int64, refs []port.Reference) error {
	c, ok := s.cards[id]
	if !ok {
		return port.ErrNotFound
	}
	c.References = refs
	s.cards[id] = c
	return nil
}

func (s *stubStore) ListTags(context.Context) ([]port.Tag, error) {
	return s.tags, nil
}

func (s *stubStore) CreateResearch(_ context.Context, cardID int64, query string, playbookID ...*int64) (port.Research, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextRes++
	var pid *int64
	if len(playbookID) > 0 {
		pid = playbookID[0]
	}
	r := port.Research{ID: s.nextRes, CardID: cardID, Status: "queued", Query: query, PlaybookID: pid, CreatedAt: time.Now().UTC()}
	s.researches[r.ID] = r
	return r, nil
}

func (s *stubStore) CreatePlaybook(_ context.Context, pb port.Playbook) (port.Playbook, error) {
	if err := research.ValidatePlaybook(pb); err != nil {
		return port.Playbook{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextPb++
	pb.ID = s.nextPb
	pb.CreatedAt = time.Now().UTC()
	pb.UpdatedAt = pb.CreatedAt
	s.playbooks[pb.ID] = pb
	return pb, nil
}

func (s *stubStore) GetPlaybook(_ context.Context, id int64) (port.Playbook, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	pb, ok := s.playbooks[id]
	if !ok {
		return port.Playbook{}, port.ErrNotFound
	}
	return pb, nil
}

func (s *stubStore) ListPlaybooks(_ context.Context) ([]port.Playbook, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var list []port.Playbook
	for _, pb := range s.playbooks {
		list = append(list, pb)
	}
	return list, nil
}

func (s *stubStore) UpdatePlaybook(_ context.Context, pb port.Playbook) (port.Playbook, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	existing, ok := s.playbooks[pb.ID]
	if !ok {
		return port.Playbook{}, port.ErrNotFound
	}
	if existing.IsBuiltin {
		return port.Playbook{}, port.ErrBuiltinReadOnly
	}
	if err := research.ValidatePlaybook(pb); err != nil {
		return port.Playbook{}, err
	}
	pb.UpdatedAt = time.Now().UTC()
	s.playbooks[pb.ID] = pb
	return pb, nil
}

func (s *stubStore) DeletePlaybook(_ context.Context, id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	existing, ok := s.playbooks[id]
	if !ok {
		return port.ErrNotFound
	}
	if existing.IsBuiltin {
		return port.ErrBuiltinReadOnly
	}
	delete(s.playbooks, id)
	return nil
}

func (s *stubStore) DuplicatePlaybook(_ context.Context, id int64) (port.Playbook, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	src, ok := s.playbooks[id]
	if !ok {
		return port.Playbook{}, port.ErrNotFound
	}
	s.nextPb++
	clone := port.Playbook{
		ID:          s.nextPb,
		Name:        src.Name + " (Copy)",
		Description: src.Description,
		IsBuiltin:   false,
		CardTypes:   src.CardTypes,
		Version:     1,
		Steps:       src.Steps,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}
	s.playbooks[clone.ID] = clone
	return clone, nil
}

func (s *stubStore) GetDefaultPlaybook(_ context.Context) (port.Playbook, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, pb := range s.playbooks {
		if pb.IsBuiltin {
			return pb, nil
		}
	}
	return port.Playbook{ID: 1, Name: "Default", IsBuiltin: true}, nil
}


func (s *stubStore) HasActiveResearch(_ context.Context, cardID int64) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, r := range s.researches {
		if r.CardID == cardID && (r.Status == "queued" || r.Status == "running") {
			return true, nil
		}
	}
	return false, nil
}

func (s *stubStore) SetResearch(_ context.Context, id int64, status, findings, errMsg string) (port.Research, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.researches[id]
	if !ok {
		return port.Research{}, port.ErrNotFound
	}
	r.Status, r.Findings, r.Error = status, findings, errMsg
	s.researches[id] = r
	return r, nil
}

func (s *stubStore) UpdateResearchProgress(_ context.Context, id int64, status, query string, steps []port.ResearchStep, sources []port.Source, plan *port.ResearchPlan, result *port.ResearchResult, tokens int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.researches[id]
	if !ok {
		return port.ErrNotFound
	}
	r.Status = status
	if query != "" {
		r.Query = query
	}
	r.Steps = steps
	r.Sources = sources
	r.Plan = plan
	r.Result = result
	r.Tokens = tokens
	s.researches[id] = r
	return nil
}

func (s *stubStore) GetResearch(_ context.Context, id int64) (port.Research, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.researches[id]
	if !ok {
		return port.Research{}, port.ErrNotFound
	}
	return r, nil
}

func (s *stubStore) ListResearch(context.Context) ([]port.Research, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []port.Research
	for _, r := range s.researches {
		out = append(out, r)
	}
	return out, nil
}

func (s *stubStore) ListResearchByCard(_ context.Context, cardID int64) ([]port.Research, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []port.Research
	for _, r := range s.researches {
		if r.CardID == cardID {
			out = append(out, r)
		}
	}
	return out, nil
}

func (s *stubStore) GetResearchFindings(_ context.Context, id int64) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.researches[id]
	if !ok {
		return "", port.ErrNotFound
	}
	return r.Findings, nil
}

func (s *stubStore) GetSetting(_ context.Context, key string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.settings == nil {
		return "", port.ErrNotFound
	}
	val, ok := s.settings[key]
	if !ok {
		return "", port.ErrNotFound
	}
	return val, nil
}

func (s *stubStore) SetSetting(_ context.Context, key, value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.settings == nil {
		s.settings = make(map[string]string)
	}
	s.settings[key] = value
	return nil
}

func (s *stubStore) ListSettings(_ context.Context) (map[string]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	res := make(map[string]string)
	for k, v := range s.settings {
		res[k] = v
	}
	return res, nil
}

func (s *stubStore) Close() error { return nil }

func (s *stubStore) researchFor(cardID int64) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, r := range s.researches {
		if r.CardID == cardID {
			return true
		}
	}
	return false
}

func contains(xs []string, v string) bool {
	for _, x := range xs {
		if x == v {
			return true
		}
	}
	return false
}

// llmStub answers /chat/completions with a canned content (200) or a bare
// status — same shape as the core tests' stub.
func llmStub(status int, content string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if status != http.StatusOK {
			w.WriteHeader(status)
			return
		}
		fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`, strconv.Quote(content))
	}))
}

func analyzeClient(llm *httptest.Server) *analyze.Client {
	return analyze.New(config.Config{LLMBase: llm.URL, LLMModel: "stub"}, llm.Client())
}

func webHandler(st port.Store, svc *core.Service) http.Handler {
	return New(st, svc, config.Config{MaxUploadMB: 25})
}

func doJSON(t *testing.T, h http.Handler, method, path string, body string) *httptest.ResponseRecorder {
	t.Helper()
	var r *http.Request
	if body == "" {
		r = httptest.NewRequest(method, path, nil)
	} else {
		r = httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, r)
	return rr
}

// --- API tests ---------------------------------------------------------------

func TestWeeklyDigest(t *testing.T) {
	st := newStubStore()
	now := time.Now().UTC()
	st.cards[1] = port.Card{ID: 1, Title: "old", Status: port.StatusInbox, CreatedAt: now.AddDate(0, 0, -20)}
	st.cards[2] = port.Card{ID: 2, Title: "two days ago", Status: port.StatusDone, CreatedAt: now.AddDate(0, 0, -2)}
	st.cards[3] = port.Card{ID: 3, Title: "today", Status: port.StatusInbox, CreatedAt: now}
	st.cards[4] = port.Card{ID: 4, Title: "same day as 2", Status: port.StatusDoing, CreatedAt: now.AddDate(0, 0, -2).Add(time.Hour)}
	h := webHandler(st, &core.Service{Logf: t.Logf})

	rr := doJSON(t, h, http.MethodGet, "/api/v1/digest", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	var body struct {
		OK        bool           `json:"ok"`
		WeekTotal int            `json:"week_total"`
		ByStatus  map[string]int `json:"by_status"`
		Days      []struct {
			Date  string      `json:"date"`
			Cards []port.Card `json:"cards"`
		} `json:"days"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("json: %v", err)
	}
	if !body.OK {
		t.Fatalf("ok = false, want true")
	}
	if body.WeekTotal != 3 {
		t.Fatalf("week_total = %d, want 3 (old card excluded)", body.WeekTotal)
	}
	if body.ByStatus["inbox"] != 1 || body.ByStatus["done"] != 1 || body.ByStatus["doing"] != 1 {
		t.Fatalf("by_status = %v, want inbox:1 done:1 doing:1", body.ByStatus)
	}
	if len(body.Days) != 2 {
		t.Fatalf("days = %d, want 2", len(body.Days))
	}
	if body.Days[0].Date != now.Format("2006-01-02") {
		t.Fatalf("days[0].date = %q, want today", body.Days[0].Date)
	}
}

func TestHealth(t *testing.T) {
	h := webHandler(newStubStore(), &core.Service{Logf: t.Logf})
	rr := doJSON(t, h, http.MethodGet, "/api/v1/health", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("json: %v", err)
	}
	if body["ok"] != true {
		t.Fatalf("body = %v, want ok:true", body)
	}
}

func TestListCardsStaleDays(t *testing.T) {
	st := newStubStore()
	now := time.Now().UTC()
	st.cards[1] = port.Card{ID: 1, Title: "ancient", Status: port.StatusInbox, UpdatedAt: now.AddDate(0, 0, -40)}
	st.cards[2] = port.Card{ID: 2, Title: "borderline", Status: port.StatusDoing, UpdatedAt: now.AddDate(0, 0, -31)}
	st.cards[3] = port.Card{ID: 3, Title: "recent", Status: port.StatusInbox, UpdatedAt: now.AddDate(0, 0, -2)}
	h := webHandler(st, &core.Service{Logf: t.Logf})

	rr := doJSON(t, h, http.MethodGet, "/api/v1/cards?stale_days=30", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	if st.lastFilter.StaleDays != 30 {
		t.Fatalf("filter StaleDays = %d, want 30", st.lastFilter.StaleDays)
	}
	var body struct {
		OK    bool        `json:"ok"`
		Cards []port.Card `json:"cards"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("json: %v", err)
	}
	if !body.OK {
		t.Fatalf("ok = false, want true")
	}
	if len(body.Cards) != 2 {
		t.Fatalf("cards = %d, want 2 (only the 31d+ cards)", len(body.Cards))
	}
	for _, c := range body.Cards {
		if c.Title == "recent" {
			t.Fatalf("fresh card leaked into stale filter: %+v", c)
		}
	}

	// No stale_days param leaves the filter unset.
	doJSON(t, h, http.MethodGet, "/api/v1/cards", "")
	if st.lastFilter.StaleDays != 0 {
		t.Fatalf("StaleDays = %d without the param, want 0", st.lastFilter.StaleDays)
	}
}

func TestBatchShelveStale(t *testing.T) {
	st := newStubStore()
	now := time.Now().UTC()
	st.cards[1] = port.Card{ID: 1, Title: "stale inbox", Status: port.StatusInbox, UpdatedAt: now.AddDate(0, 0, -60)}
	st.cards[2] = port.Card{ID: 2, Title: "stale doing", Status: port.StatusDoing, UpdatedAt: now.AddDate(0, 0, -35)}
	st.cards[3] = port.Card{ID: 3, Title: "fresh inbox", Status: port.StatusInbox, UpdatedAt: now}
	st.cards[4] = port.Card{ID: 4, Title: "stale done", Status: port.StatusDone, UpdatedAt: now.AddDate(0, 0, -90)}
	h := webHandler(st, &core.Service{Logf: t.Logf})

	rr := doJSON(t, h, http.MethodPost, "/api/v1/cards/batch-shelve-stale", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (default days)", rr.Code)
	}
	var body struct {
		OK           bool  `json:"ok"`
		ShelvedCount int64 `json:"shelved_count"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("json: %v", err)
	}
	if !body.OK {
		t.Fatalf("ok = false, want true")
	}
	if body.ShelvedCount != 2 {
		t.Fatalf("shelved_count = %d, want 2", body.ShelvedCount)
	}
	for _, id := range []int64{1, 2} {
		if got := st.cards[id].Status; got != port.StatusShelved {
			t.Fatalf("card %d status = %q, want shelved", id, got)
		}
	}
	for _, id := range []int64{3, 4} {
		if st.cards[id].Status == port.StatusShelved {
			t.Fatalf("card %d must not be shelved", id)
		}
	}

	// Explicit days window: 100 days still matches, 200 does not.
	rr = doJSON(t, h, http.MethodPost, "/api/v1/cards/batch-shelve-stale?days=100", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("json: %v", err)
	}
	if body.ShelvedCount != 0 {
		t.Fatalf("shelved_count = %d, want 0", body.ShelvedCount)
	}

	for _, bad := range []string{"days=abc", "days=0", "days=-5"} {
		rr := doJSON(t, h, http.MethodPost, "/api/v1/cards/batch-shelve-stale?"+bad, "")
		if rr.Code != http.StatusBadRequest {
			t.Fatalf("%s: status = %d, want 400", bad, rr.Code)
		}
	}
}

func TestListCardsNoFilters(t *testing.T) {
	st := newStubStore()
	st.cards[1] = port.Card{ID: 1, Title: "one", Status: port.StatusInbox}
	st.cards[2] = port.Card{ID: 2, Title: "two", Status: port.StatusInbox}
	h := webHandler(st, &core.Service{Logf: t.Logf})

	rr := doJSON(t, h, http.MethodGet, "/api/v1/cards", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	var body struct {
		OK    bool        `json:"ok"`
		Cards []port.Card `json:"cards"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("json: %v", err)
	}
	if !body.OK {
		t.Fatalf("ok = false, want true")
	}
	if len(body.Cards) != 2 {
		t.Fatalf("cards = %d, want 2", len(body.Cards))
	}
}

func TestListCardsFilters(t *testing.T) {
	st := newStubStore()
	h := webHandler(st, &core.Service{Logf: t.Logf})

	rr := doJSON(t, h, http.MethodGet, "/api/v1/cards?horizon=short-term&status=inbox&tag=go&q=idea&limit=5&offset=10", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	want := port.CardFilter{Horizon: "short-term", Status: "inbox", Tag: "go", Query: "idea", Limit: 5, Offset: 10}
	if st.lastFilter != want {
		t.Fatalf("filter = %+v, want %+v", st.lastFilter, want)
	}
}

func TestCreateCard(t *testing.T) {
	st := newStubStore()
	h := webHandler(st, &core.Service{Logf: t.Logf})

	body := `{"title":"Do it","summary":"now","horizon":"short-term","tags":["go"]}`
	rr := doJSON(t, h, http.MethodPost, "/api/v1/cards", body)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rr.Code, rr.Body.String())
	}
	var out struct {
		OK   bool `json:"ok"`
		Data struct {
			ID        int64  `json:"id"`
			Title     string `json:"title"`
			Status    string `json:"status"`
			Horizon   string `json:"horizon"`
			SourceURL string `json:"source_url"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("json: %v", err)
	}
	if !out.OK || out.Data.ID == 0 {
		t.Fatalf("out = %+v, want ok + id", out)
	}
	if out.Data.Title != "Do it" || out.Data.Status != port.StatusInbox || out.Data.Horizon != "short-term" {
		t.Fatalf("data = %+v", out.Data)
	}
}

func TestPatchCard(t *testing.T) {
	st := newStubStore()
	st.cards[5] = port.Card{ID: 5, Title: "t", Status: port.StatusInbox}
	h := webHandler(st, &core.Service{Logf: t.Logf})

	rr := doJSON(t, h, http.MethodPatch, "/api/v1/cards/5", `{"status":"doing"}`)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rr.Code, rr.Body.String())
	}
	if st.lastPatch.Status == nil || *st.lastPatch.Status != "doing" {
		t.Fatalf("patch = %+v, want status=doing", st.lastPatch)
	}
	var out struct {
		OK   bool `json:"ok"`
		Data struct {
			ID     int64  `json:"id"`
			Status string `json:"status"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("json: %v", err)
	}
	if !out.OK || out.Data.Status != "doing" {
		t.Fatalf("out = %+v, want status doing", out)
	}
}

func TestPatchCardReferences(t *testing.T) {
	st := newStubStore()
	st.cards[5] = port.Card{
		ID:         5,
		Title:      "Card 5",
		Status:     port.StatusInbox,
		References: []port.Reference{{Kind: port.RefKindURL, Label: "old", URL: "https://old.com"}},
	}
	h := webHandler(st, &core.Service{Logf: t.Logf})

	// 1. Full replacement list of references
	patchJSON := `{
		"references": [
			{"kind": "repo", "label": "gin-gonic/gin", "url": "https://github.com/gin-gonic/gin?utm_source=test"},
			{"kind": "tool", "label": "ffmpeg"}
		]
	}`
	rr := doJSON(t, h, http.MethodPatch, "/api/v1/cards/5", patchJSON)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rr.Code, rr.Body.String())
	}

	var out struct {
		OK   bool      `json:"ok"`
		Data port.Card `json:"data"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("json: %v", err)
	}
	if !out.OK {
		t.Fatalf("expected ok=true, got response: %s", rr.Body.String())
	}
	if len(out.Data.References) != 2 {
		t.Fatalf("expected 2 references in response, got %d", len(out.Data.References))
	}
	if out.Data.References[0].Kind != port.RefKindRepo || out.Data.References[0].URL != "https://github.com/gin-gonic/gin" {
		t.Errorf("ref 0 mismatch (tracking params stripped): %+v", out.Data.References[0])
	}
	if out.Data.References[1].Kind != port.RefKindTool || out.Data.References[1].Label != "ffmpeg" {
		t.Errorf("ref 1 mismatch: %+v", out.Data.References[1])
	}

	// 2. Invalid reference kind returns 400 Bad Request
	badJSON := `{"references": [{"kind": "unsupported_kind", "label": "bad"}]}`
	rrBad := doJSON(t, h, http.MethodPatch, "/api/v1/cards/5", badJSON)
	if rrBad.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request, got %d", rrBad.Code)
	}

	// 3. Clear references with empty list
	clearJSON := `{"references": []}`
	rrClear := doJSON(t, h, http.MethodPatch, "/api/v1/cards/5", clearJSON)
	if rrClear.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on clear, got %d", rrClear.Code)
	}
	var clearOut struct {
		OK   bool      `json:"ok"`
		Data port.Card `json:"data"`
	}
	_ = json.Unmarshal(rrClear.Body.Bytes(), &clearOut)
	if len(clearOut.Data.References) != 0 {
		t.Errorf("expected 0 references, got %d", len(clearOut.Data.References))
	}
}

func TestCardNotFound(t *testing.T) {
	h := webHandler(newStubStore(), &core.Service{Logf: t.Logf})

	rr := doJSON(t, h, http.MethodGet, "/api/v1/cards/99", "")
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rr.Code)
	}
	var body struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("json: %v", err)
	}
	if body.OK || body.Error == "" {
		t.Fatalf("body = %+v, want ok:false with error", body)
	}
}

func TestRetryCard(t *testing.T) {
	llm := llmStub(http.StatusOK, `[{"title":"Fixed","summary":"now works","horizon":"short-term","tags":[],"links":[]}]`)
	defer llm.Close()
	st := newStubStore()
	capID := int64(1)
	st.captures[capID] = port.Capture{ID: capID, Text: "raw"}
	st.cards[5] = port.Card{ID: 5, CaptureID: &capID, Title: "Analysis failed", Status: port.StatusInbox, SourceNote: "raw"}
	svc := &core.Service{Store: st, Analyze: analyzeClient(llm), Logf: t.Logf}
	h := webHandler(st, svc)

	rr := doJSON(t, h, http.MethodPost, "/api/v1/cards/5/retry", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rr.Code, rr.Body.String())
	}
	var out struct {
		OK   bool `json:"ok"`
		Data struct {
			ID    int64  `json:"id"`
			Title string `json:"title"`
		} `json:"data"`
		Cards []port.Card `json:"cards"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("json: %v", err)
	}
	if !out.OK || out.Data.Title != "Fixed" {
		t.Fatalf("out = %+v, want retried card titled Fixed", out)
	}
	if len(out.Cards) != 1 || out.Cards[0].Title != "Fixed" {
		t.Fatalf("out.Cards = %+v, want 1 card titled Fixed", out.Cards)
	}
}

func TestRetryCardMultiIdea(t *testing.T) {
	llm := llmStub(http.StatusOK, `[
		{"title":"Idea 1","summary":"first","horizon":"short-term","tags":[],"links":[]},
		{"title":"Idea 2","summary":"second","horizon":"medium-term","tags":[],"links":[]}
	]`)
	defer llm.Close()
	st := newStubStore()
	capID := int64(10)
	st.captures[capID] = port.Capture{ID: capID, Text: "full page text with two ideas"}
	st.cards[5] = port.Card{ID: 5, CaptureID: &capID, Title: "Analysis failed", Status: port.StatusInbox}
	svc := &core.Service{Store: st, Analyze: analyzeClient(llm), Logf: t.Logf}
	h := webHandler(st, svc)

	rr := doJSON(t, h, http.MethodPost, "/api/v1/cards/5/retry", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rr.Code, rr.Body.String())
	}
	var out struct {
		OK    bool        `json:"ok"`
		Cards []port.Card `json:"cards"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("json: %v", err)
	}
	if !out.OK || len(out.Cards) != 2 {
		t.Fatalf("out = %+v, want 2 cards", out)
	}
	if out.Cards[0].Title != "Idea 1" || out.Cards[1].Title != "Idea 2" {
		t.Fatalf("unexpected cards: %+v", out.Cards)
	}
}

func TestResearchTrigger(t *testing.T) {
	llm := llmStub(http.StatusInternalServerError, "")
	defer llm.Close()
	st := newStubStore()
	st.cards[7] = port.Card{ID: 7, Title: "T"}
	svc := &core.Service{Store: st, Runner: research.New(config.Config{}, analyzeClient(llm)), Logf: t.Logf}
	h := webHandler(st, svc)

	rr := doJSON(t, h, http.MethodPost, "/api/v1/research", `{"card_id":7}`)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rr.Code, rr.Body.String())
	}
	var out struct {
		OK       bool `json:"ok"`
		Accepted bool `json:"accepted"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("json: %v", err)
	}
	if !out.OK || !out.Accepted {
		t.Fatalf("out = %+v, want accepted", out)
	}

	deadline := time.Now().Add(3 * time.Second)
	for !st.researchFor(7) {
		if time.Now().After(deadline) {
			t.Fatal("research never invoked for card 7")
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestResearchTriggerActiveConflict(t *testing.T) {
	llm := llmStub(http.StatusInternalServerError, "")
	defer llm.Close()
	st := newStubStore()
	st.cards[7] = port.Card{ID: 7, Title: "T"}
	st.researches[1] = port.Research{ID: 1, CardID: 7, Status: "queued", CreatedAt: time.Now().UTC()}
	st.nextRes = 1
	svc := &core.Service{Store: st, Runner: research.New(config.Config{}, analyzeClient(llm)), Logf: t.Logf}
	h := webHandler(st, svc)

	rr := doJSON(t, h, http.MethodPost, "/api/v1/research", `{"card_id":7}`)
	if rr.Code != http.StatusConflict {
		t.Fatalf("status = %d, body = %s; want 409", rr.Code, rr.Body.String())
	}
	var body struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("json: %v", err)
	}
	if body.OK || !strings.Contains(body.Error, "research already running") {
		t.Fatalf("body = %+v, want error mentioning research already running", body)
	}
	deadline := time.Now().Add(200 * time.Millisecond)
	for time.Now().Before(deadline) {
		if st.nextRes > 1 {
			t.Fatal("second research row created despite conflict")
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestCardResearchHistoryEndpoint(t *testing.T) {
	st := newStubStore()
	st.cards[7] = port.Card{ID: 7, Title: "Card 7"}
	st.researches[1] = port.Research{
		ID:        1,
		CardID:    7,
		Status:    "done",
		Query:     "query 1",
		Findings:  "findings 1",
		CreatedAt: time.Now().Add(-time.Hour).UTC(),
	}
	st.researches[2] = port.Research{
		ID:        2,
		CardID:    7,
		Status:    "done",
		Query:     "query 2",
		Findings:  "findings 2",
		CreatedAt: time.Now().UTC(),
	}
	svc := &core.Service{Store: st, Logf: t.Logf}
	h := webHandler(st, svc)

	rr := doJSON(t, h, http.MethodGet, "/api/v1/cards/7/research", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rr.Code, rr.Body.String())
	}
	var out struct {
		OK   bool `json:"ok"`
		Data struct {
			Latest  *port.Research  `json:"latest"`
			History []port.Research `json:"history"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("json: %v", err)
	}
	if !out.OK {
		t.Fatalf("expected ok: true")
	}
	if len(out.Data.History) != 2 {
		t.Fatalf("history length = %d, want 2", len(out.Data.History))
	}
	if out.Data.Latest == nil {
		t.Fatalf("expected latest research")
	}
}


func TestCreateCardDuplicateSourceURLConflict(t *testing.T) {
	st := newStubStore()
	st.cards[3] = port.Card{ID: 3, Title: "Existing", SourceURL: "https://x.test/a"}
	h := webHandler(st, &core.Service{Logf: t.Logf})

	rr := doJSON(t, h, http.MethodPost, "/api/v1/cards",
		`{"title":"Copy","source_url":" https://x.test/a "}`)
	if rr.Code != http.StatusConflict {
		t.Fatalf("status = %d, body = %s; want 409", rr.Code, rr.Body.String())
	}
	var body struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("json: %v", err)
	}
	if body.OK || !strings.Contains(body.Error, "already captured") {
		t.Fatalf("body = %+v, want error mentioning already captured", body)
	}
	if len(st.cards) != 1 {
		t.Fatalf("cards = %d, want 1 (no duplicate created)", len(st.cards))
	}
}

func TestGetResearchReport(t *testing.T) {
	st := newStubStore()
	st.researches[7] = port.Research{
		ID: 7, CardID: 5, Status: "done",
		Query: "cli-fi reading list", Findings: "# Found\n\nSome **markdown** & <raw> text.",
	}
	h := webHandler(st, &core.Service{Logf: t.Logf})

	rr := doJSON(t, h, http.MethodGet, "/api/v1/research/7", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	if ct := rr.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/html") {
		t.Fatalf("Content-Type = %q, want text/html", ct)
	}
	body := rr.Body.String()
	if !strings.Contains(body, "cli-fi reading list") {
		t.Fatalf("report missing query: %s", body)
	}
	if !strings.Contains(body, "&lt;raw&gt;") {
		t.Fatalf("findings not HTML-escaped: %s", body)
	}
	if strings.Contains(body, "<raw>") {
		t.Fatalf("findings injected raw html: %s", body)
	}
}

func TestGetResearchNotFound(t *testing.T) {
	h := webHandler(newStubStore(), &core.Service{Logf: t.Logf})
	rr := doJSON(t, h, http.MethodGet, "/api/v1/research/99", "")
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rr.Code)
	}
}

func TestGetResearchJSON(t *testing.T) {
	st := newStubStore()
	st.researches[1] = port.Research{
		ID: 1, CardID: 5, Status: "done",
		Query: "cli-fi reading list", Findings: "# Found\n\nSome **markdown** text.",
	}
	h := webHandler(st, &core.Service{Logf: t.Logf})

	for _, path := range []string{"/api/v1/research/1?format=json", "/api/v1/research/1"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		if !strings.Contains(path, "format=") {
			req.Header.Set("Accept", "application/json")
		}
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("%s: status = %d, want 200", path, rr.Code)
		}
		if ct := rr.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
			t.Fatalf("%s: Content-Type = %q, want application/json", path, ct)
		}
		var out struct {
			OK   bool          `json:"ok"`
			Data port.Research `json:"data"`
		}
		if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
			t.Fatalf("%s: json: %v", path, err)
		}
		if !out.OK {
			t.Fatalf("%s: ok = false, want true", path)
		}
		if out.Data.ID != 1 || out.Data.CardID != 5 || out.Data.Status != "done" {
			t.Fatalf("%s: data = %+v, want research #1 for card 5", path, out.Data)
		}
		if out.Data.Query != "cli-fi reading list" || !strings.Contains(out.Data.Findings, "markdown") {
			t.Fatalf("%s: data missing findings/query: %+v", path, out.Data)
		}
	}
}

// --- static ------------------------------------------------------------------

func TestStaticIndexServed(t *testing.T) {
	h := webHandler(newStubStore(), &core.Service{Logf: t.Logf})

	rr := doJSON(t, h, http.MethodGet, "/", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	if ct := rr.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/html") {
		t.Fatalf("Content-Type = %q, want text/html", ct)
	}
	if !strings.Contains(rr.Body.String(), "app.js") {
		t.Fatalf("index.html does not reference app.js")
	}
}

func TestStaticAssetCached(t *testing.T) {
	h := webHandler(newStubStore(), &core.Service{Logf: t.Logf})

	rr := doJSON(t, h, http.MethodGet, "/assets/app.js", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	if ct := rr.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/javascript") {
		t.Fatalf("Content-Type = %q, want text/javascript", ct)
	}
	if cc := rr.Header().Get("Cache-Control"); cc != "public, max-age=3600" {
		t.Fatalf("Cache-Control = %q, want public, max-age=3600", cc)
	}
}

func TestPWAAssetsServed(t *testing.T) {
	h := webHandler(newStubStore(), &core.Service{Logf: t.Logf})

	for _, tc := range []struct{ path, contentType, body string }{
		{"/manifest.json", "application/manifest+json", "Sparkkeep Action Engine"},
		{"/sw.js", "application/javascript", "addEventListener"},
		{"/icon.svg", "image/svg+xml", "<svg"},
	} {
		rr := doJSON(t, h, http.MethodGet, tc.path, "")
		if rr.Code != http.StatusOK {
			t.Errorf("%s: status = %d, want 200", tc.path, rr.Code)
			continue
		}
		if ct := rr.Header().Get("Content-Type"); !strings.HasPrefix(ct, tc.contentType) {
			t.Errorf("%s: Content-Type = %q, want %s", tc.path, ct, tc.contentType)
		}
		if !strings.Contains(rr.Body.String(), tc.body) {
			t.Errorf("%s: body missing %q", tc.path, tc.body)
		}
	}
}

func TestServiceWorkerScopeHeader(t *testing.T) {
	h := webHandler(newStubStore(), &core.Service{Logf: t.Logf})

	rr := doJSON(t, h, http.MethodGet, "/sw.js", "")
	if got := rr.Header().Get("Service-Worker-Allowed"); got != "/" {
		t.Fatalf("Service-Worker-Allowed = %q, want /", got)
	}
}

func TestOversizedRequestBodyRejected(t *testing.T) {
	h := webHandler(newStubStore(), &core.Service{Logf: t.Logf})

	// Generate payload > maxBodyBytes (1 MB)
	largeTitle := strings.Repeat("A", 1<<20+100)
	body := fmt.Sprintf(`{"title":%q}`, largeTitle)

	rr := doJSON(t, h, http.MethodPost, "/api/v1/cards", body)
	if rr.Code != http.StatusBadRequest && rr.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want 400 or 413", rr.Code)
	}
}

func TestValidation(t *testing.T) {
	st := newStubStore()
	st.cards[1] = port.Card{ID: 1, Title: "Existing", Status: port.StatusInbox, Horizon: port.HorizonShortTerm}
	h := webHandler(st, &core.Service{Logf: t.Logf})

	// Empty title
	rr := doJSON(t, h, http.MethodPost, "/api/v1/cards", `{"title":"   "}`)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("empty title: got status %d, want 400", rr.Code)
	}

	// Invalid status on create
	rr = doJSON(t, h, http.MethodPost, "/api/v1/cards", `{"title":"Test","status":"banana"}`)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("invalid status create: got status %d, want 400", rr.Code)
	}

	// Invalid horizon on create
	rr = doJSON(t, h, http.MethodPost, "/api/v1/cards", `{"title":"Test","horizon":"banana"}`)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("invalid horizon create: got status %d, want 400", rr.Code)
	}

	// Invalid status on patch
	rr = doJSON(t, h, http.MethodPatch, "/api/v1/cards/1", `{"status":"banana"}`)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("invalid status patch: got status %d, want 400", rr.Code)
	}

	// Invalid horizon on patch
	rr = doJSON(t, h, http.MethodPatch, "/api/v1/cards/1", `{"horizon":"banana"}`)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("invalid horizon patch: got status %d, want 400", rr.Code)
	}
}

func TestCreateCard_BadRequest(t *testing.T) {
	h := webHandler(newStubStore(), &core.Service{Logf: t.Logf})
	rr := doJSON(t, h, http.MethodPost, "/api/v1/cards", `{"title": not-json}`)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rr.Code)
	}
}

func TestWeeklyDigest_Empty(t *testing.T) {
	st := newStubStore()
	h := webHandler(st, &core.Service{Logf: t.Logf})
	rr := doJSON(t, h, http.MethodGet, "/api/v1/digest", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	var body struct {
		OK        bool  `json:"ok"`
		WeekTotal int   `json:"week_total"`
		Days      []any `json:"days"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("json: %v", err)
	}
	if !body.OK || body.WeekTotal != 0 || len(body.Days) != 0 {
		t.Fatalf("empty digest: got %+v", body)
	}
}

func TestTriggerResearch_DuplicateRejects(t *testing.T) {
	st := newStubStore()
	st.cards[5] = port.Card{ID: 5, Title: "Card"}
	st.researches[1] = port.Research{ID: 1, CardID: 5, Status: "queued"}
	h := webHandler(st, &core.Service{Store: st, Runner: &research.Runner{ClipChars: 100}, Logf: t.Logf})

	rr := doJSON(t, h, http.MethodPost, "/api/v1/research", `{"card_id":5}`)
	if rr.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409 Conflict", rr.Code)
	}
}

func TestExportMarkdown(t *testing.T) {
	st := newStubStore()
	st.cards[7] = port.Card{
		ID: 7, Title: "Neural Interfaces", Status: port.StatusInbox,
		ExecutiveSummary: "BCI is mainstreaming.", ValueProposition: "Big upside.",
		ProposedActions: []string{"Read the paper", "Prototype a demo"},
		SourceURL:       "https://example.com/bci", Tags: []string{"ai", "research"},
	}
	h := webHandler(st, &core.Service{Logf: t.Logf})

	rr := doJSON(t, h, http.MethodGet, "/api/v1/cards/7/export.md", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	want := "# [Spark] Neural Interfaces\n\n" +
		"**Executive Summary:** BCI is mainstreaming.\n" +
		"**Value Proposition:** Big upside.\n\n" +
		"### Proposed Actions\n- [ ] Read the paper\n- [ ] Prototype a demo\n\n" +
		"**Source:** https://example.com/bci\n" +
		"**Tags:** #ai #research\n"
	if got := rr.Body.String(); got != want {
		t.Fatalf("markdown:\ngot:\n%s\nwant:\n%s", got, want)
	}

	rr = doJSON(t, h, http.MethodGet, "/api/v1/cards/999/export.md", "")
	if rr.Code != http.StatusNotFound {
		t.Fatalf("missing card: status = %d, want 404", rr.Code)
	}
}

func TestAuthMiddleware(t *testing.T) {
	st := newStubStore()
	h := New(st, &core.Service{Logf: t.Logf}, config.Config{MaxUploadMB: 25, AuthToken: "secret123"})

	// do issues a request with optional header/cookie/query credentials.
	do := func(method, path, bearer, cookie string) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, path, nil)
		if bearer != "" {
			r.Header.Set("Authorization", "Bearer "+bearer)
		}
		if cookie != "" {
			r.AddCookie(&http.Cookie{Name: authCookie, Value: cookie})
		}
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, r)
		return rr
	}

	// No credentials on a private endpoint → 401 JSON envelope.
	rr := do(http.MethodGet, "/api/v1/cards", "", "")
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("no auth: status = %d, want 401", rr.Code)
	}
	var env struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &env); err != nil {
		t.Fatalf("json: %v", err)
	}
	if env.OK || env.Error != "unauthorized" {
		t.Fatalf("body = %+v, want {ok:false error:unauthorized}", env)
	}

	// The health probe stays public so orchestrators can still see the service.
	if rr := do(http.MethodGet, "/api/v1/health", "", ""); rr.Code != http.StatusOK {
		t.Fatalf("health: status = %d, want 200", rr.Code)
	}

	// A wrong token is still a 401.
	if rr := do(http.MethodGet, "/api/v1/cards", "wrong", ""); rr.Code != http.StatusUnauthorized {
		t.Fatalf("wrong token: status = %d, want 401", rr.Code)
	}

	// The dashboard shell loads without a token — the SPA asks for one itself.
	rr = do(http.MethodGet, "/", "", "")
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), "<html") {
		t.Fatalf("/: status = %d body = %.40q, want the index shell", rr.Code, rr.Body.String())
	}

	for _, tc := range []struct {
		name  string
		bear  string
		cooke string
		path  string
	}{
		{"bearer", "secret123", "", "/api/v1/cards"},
		{"cookie", "", "secret123", "/api/v1/cards"},
		{"query", "secret123", "", "/api/v1/cards?token=secret123"},
	} {
		if rr := do(http.MethodGet, tc.path, tc.bear, tc.cooke); rr.Code != http.StatusOK {
			t.Errorf("%s: status = %d, want 200", tc.name, rr.Code)
		}
	}

	// A verified token is exchanged for the cookie.
	rr = doJSON(t, h, http.MethodPost, "/api/v1/auth/verify", `{"token":"secret123"}`)
	if rr.Code != http.StatusOK {
		t.Fatalf("verify: status = %d, want 200 (body %s)", rr.Code, rr.Body.String())
	}
	cookies := rr.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != authCookie || cookies[0].Value != "secret123" {
		t.Fatalf("verify cookies = %+v, want a single %s cookie", cookies, authCookie)
	}
	if cookies[0].Path != "/" || cookies[0].MaxAge != 31536000 || cookies[0].SameSite != http.SameSiteLaxMode {
		t.Errorf("cookie attrs = %+v, want Path=/ Max-Age=31536000 SameSite=Lax", cookies[0])
	}

	// A wrong token is refused without a cookie.
	rr = doJSON(t, h, http.MethodPost, "/api/v1/auth/verify", `{"token":"nope"}`)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("verify bad token: status = %d, want 401", rr.Code)
	}
	if cs := rr.Result().Cookies(); len(cs) != 0 {
		t.Errorf("verify bad token set cookies: %+v", cs)
	}
}

func TestListTagsEndpoint(t *testing.T) {
	st := newStubStore()
	h := webHandler(st, nil)

	// Empty tags
	rr := doJSON(t, h, http.MethodGet, "/api/v1/tags", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	var res struct {
		OK   bool       `json:"ok"`
		Tags []port.Tag `json:"tags"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &res); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !res.OK || len(res.Tags) != 0 {
		t.Fatalf("expected empty tags, got %+v", res)
	}

	// Populated tags
	st.tags = []port.Tag{
		{Name: "ai", Count: 5},
		{Name: "go", Count: 2},
	}
	rr = doJSON(t, h, http.MethodGet, "/api/v1/tags", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &res); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !res.OK || len(res.Tags) != 2 || res.Tags[0].Name != "ai" || res.Tags[1].Count != 2 {
		t.Fatalf("tags unexpected: %+v", res)
	}
}

func TestListResearchEndpoint(t *testing.T) {
	st := newStubStore()
	h := webHandler(st, nil)

	// Empty research list
	rr := doJSON(t, h, http.MethodGet, "/api/v1/research", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	var res struct {
		OK       bool            `json:"ok"`
		Research []port.Research `json:"research"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &res); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !res.OK || len(res.Research) != 0 {
		t.Fatalf("expected empty research, got %+v", res)
	}

	// Add research row
	st.researches[1] = port.Research{ID: 1, CardID: 10, Status: "done", Query: "q1", Findings: "f1"}
	rr = doJSON(t, h, http.MethodGet, "/api/v1/research", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &res); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !res.OK || len(res.Research) != 1 || res.Research[0].CardID != 10 {
		t.Fatalf("research list unexpected: %+v", res)
	}
}

func TestTriggerResearchErrors(t *testing.T) {
	st := newStubStore()
	h := webHandler(st, &core.Service{Logf: t.Logf})

	// Missing / invalid card_id (<= 0)
	rr := doJSON(t, h, http.MethodPost, "/api/v1/research", `{"card_id": 0}`)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for card_id 0", rr.Code)
	}

	rr = doJSON(t, h, http.MethodPost, "/api/v1/research", `{"card_id": -5}`)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for negative card_id", rr.Code)
	}

	// Bad json
	rr = doJSON(t, h, http.MethodPost, "/api/v1/research", `{bad-json}`)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for bad json", rr.Code)
	}

	// Active research conflict
	st.researches[1] = port.Research{ID: 1, CardID: 42, Status: "queued"}
	rr = doJSON(t, h, http.MethodPost, "/api/v1/research", `{"card_id": 42}`)
	if rr.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409 conflict for active research", rr.Code)
	}
}

func TestPatchCardEdgeCases(t *testing.T) {
	st := newStubStore()
	st.cards[1] = port.Card{ID: 1, Title: "Existing Card", Status: port.StatusInbox, Horizon: port.HorizonShortTerm, Tags: []string{"old"}}
	h := webHandler(st, nil)

	// Bad ID
	rr := doJSON(t, h, http.MethodPatch, "/api/v1/cards/abc", `{"status":"doing"}`)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for bad id", rr.Code)
	}

	// Invalid status
	rr = doJSON(t, h, http.MethodPatch, "/api/v1/cards/1", `{"status":"bogus_status"}`)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for bogus status", rr.Code)
	}

	// Invalid horizon
	rr = doJSON(t, h, http.MethodPatch, "/api/v1/cards/1", `{"horizon":"bogus_horizon"}`)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for bogus horizon", rr.Code)
	}

	// Missing card (404)
	rr = doJSON(t, h, http.MethodPatch, "/api/v1/cards/999", `{"status":"doing"}`)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 for missing card", rr.Code)
	}

	// Update tags only
	rr = doJSON(t, h, http.MethodPatch, "/api/v1/cards/1", `{"tags":["ai","automation"]}`)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 for tags update", rr.Code)
	}
	var res struct {
		OK   bool      `json:"ok"`
		Data port.Card `json:"data"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &res); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(res.Data.Tags) != 2 || res.Data.Tags[0] != "ai" {
		t.Fatalf("updated tags unexpected: %+v", res.Data.Tags)
	}
}

func TestGetCardEdgeCases(t *testing.T) {
	st := newStubStore()
	h := webHandler(st, nil)

	// Bad ID
	rr := doJSON(t, h, http.MethodGet, "/api/v1/cards/abc", "")
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for non-numeric id", rr.Code)
	}

	// Not Found
	rr = doJSON(t, h, http.MethodGet, "/api/v1/cards/404", "")
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 for missing id", rr.Code)
	}
}

func TestRetryCardErrors(t *testing.T) {
	st := newStubStore()
	svc := &core.Service{Store: st, Logf: t.Logf}
	h := webHandler(st, svc)

	// Bad ID
	rr := doJSON(t, h, http.MethodPost, "/api/v1/cards/invalid/retry", "")
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for bad id", rr.Code)
	}

	// Not Found
	rr = doJSON(t, h, http.MethodPost, "/api/v1/cards/999/retry", "")
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 for missing id", rr.Code)
	}

	// Nothing to re-analyze (empty capture, no URL)
	capID := int64(100)
	st.captures[capID] = port.Capture{ID: capID} // all content empty, source_url empty
	st.cards[10] = port.Card{ID: 10, CaptureID: &capID, Title: "Analysis failed", Status: port.StatusInbox}
	rr = doJSON(t, h, http.MethodPost, "/api/v1/cards/10/retry", "")
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for nothing to re-analyze, body: %s", rr.Code, rr.Body.String())
	}
	var body struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	_ = json.Unmarshal(rr.Body.Bytes(), &body)
	if body.OK || !strings.Contains(body.Error, "nothing to re-analyze") {
		t.Fatalf("expected error containing 'nothing to re-analyze', got: %+v", body)
	}
}

func TestSetupFlowAndSettings(t *testing.T) {
	st := newStubStore()
	svc := &core.Service{Logf: t.Logf}
	h := New(st, svc, config.Config{MaxUploadMB: 25})

	// 1. Initial setup status: not configured
	rr := doJSON(t, h, http.MethodGet, "/api/v1/setup/status", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("setup/status code = %d, want 200", rr.Code)
	}
	var status struct {
		OK           bool   `json:"ok"`
		IsConfigured bool   `json:"is_configured"`
		HasAuth      bool   `json:"has_auth"`
		HasLLMKey    bool   `json:"has_llm_key"`
		LLMBase      string `json:"llm_base"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &status); err != nil {
		t.Fatalf("unmarshal status: %v", err)
	}
	if status.IsConfigured || status.HasAuth || status.HasLLMKey {
		t.Fatalf("expected unconfigured initial state, got %+v", status)
	}

	// 2. Perform initial setup (publicly allowed)
	setupBody := `{"auth_token":"my-master-token","llm_key":"sk-secret-byok","llm_base":"https://api.openai.com/v1","llm_model":"gpt-4o"}`
	rr = doJSON(t, h, http.MethodPost, "/api/v1/setup", setupBody)
	if rr.Code != http.StatusOK {
		t.Fatalf("setup post code = %d, want 200, body = %s", rr.Code, rr.Body.String())
	}
	cookies := rr.Result().Cookies()
	if len(cookies) == 0 || cookies[0].Value != "my-master-token" {
		t.Fatalf("expected auth cookie to be set, got %+v", cookies)
	}

	// 3. Status is now configured
	rr = doJSON(t, h, http.MethodGet, "/api/v1/setup/status", "")
	if err := json.Unmarshal(rr.Body.Bytes(), &status); err != nil {
		t.Fatalf("unmarshal status: %v", err)
	}
	if !status.IsConfigured || !status.HasAuth || !status.HasLLMKey {
		t.Fatalf("expected configured state, got %+v", status)
	}

	// 4. Unauthenticated access to /api/v1/cards is now blocked!
	rr = doJSON(t, h, http.MethodGet, "/api/v1/cards", "")
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 unauthorized on /api/v1/cards after setup, got %d", rr.Code)
	}

	// 5. Authenticated access to /api/v1/cards succeeds with bearer token
	req, _ := http.NewRequest(http.MethodGet, "/api/v1/cards", nil)
	req.Header.Set("Authorization", "Bearer my-master-token")
	rr2 := httptest.NewRecorder()
	h.ServeHTTP(rr2, req)
	if rr2.Code != http.StatusOK {
		t.Fatalf("expected 200 on /api/v1/cards with token, got %d", rr2.Code)
	}

	// 6. Unauthenticated setup call is now rejected with 403 Forbidden
	rr = doJSON(t, h, http.MethodPost, "/api/v1/setup", `{"auth_token":"hacker-token"}`)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("expected 403 forbidden on setup when already configured, got %d", rr.Code)
	}

	// 7. Get settings returns masked settings
	reqSettings, _ := http.NewRequest(http.MethodGet, "/api/v1/settings", nil)
	reqSettings.Header.Set("Authorization", "Bearer my-master-token")
	rrSettings := httptest.NewRecorder()
	h.ServeHTTP(rrSettings, reqSettings)
	if rrSettings.Code != http.StatusOK {
		t.Fatalf("expected 200 on /api/v1/settings, got %d", rrSettings.Code)
	}
	var setResp struct {
		OK       bool `json:"ok"`
		Settings struct {
			LLMBase      string `json:"llm_base"`
			LLMModel     string `json:"llm_model"`
			HasLLMKey    bool   `json:"has_llm_key"`
			HasAuthToken bool   `json:"has_auth_token"`
		} `json:"settings"`
	}
	if err := json.Unmarshal(rrSettings.Body.Bytes(), &setResp); err != nil {
		t.Fatalf("unmarshal settings: %v", err)
	}
	if !setResp.Settings.HasLLMKey || !setResp.Settings.HasAuthToken || setResp.Settings.LLMModel != "gpt-4o" {
		t.Fatalf("unexpected settings response: %+v", setResp)
	}

	// 8. Patch settings updates configuration
	reqPatch, _ := http.NewRequest(http.MethodPatch, "/api/v1/settings", strings.NewReader(`{"llm_model":"claude-3-5-sonnet"}`))
	reqPatch.Header.Set("Authorization", "Bearer my-master-token")
	reqPatch.Header.Set("Content-Type", "application/json")
	rrPatch := httptest.NewRecorder()
	h.ServeHTTP(rrPatch, reqPatch)
	if rrPatch.Code != http.StatusOK {
		t.Fatalf("expected 200 on patch /api/v1/settings, got %d", rrPatch.Code)
	}

	val, err := st.GetSetting(context.Background(), "llm_model")
	if err != nil || val != "claude-3-5-sonnet" {
		t.Fatalf("expected patched model in store, got %q, err=%v", val, err)
	}
}

func TestLicenseAndObsidianGating(t *testing.T) {
	st := newStubStore()
	svc := &core.Service{
		Store:   st,
		License: license.NewManager(st),
		Logf:    t.Logf,
	}
	h := New(st, svc, config.Config{MaxUploadMB: 25})

	// Add a sample card to store
	c, _ := st.CreateCard(context.Background(), port.Card{
		Title:   "Tier 2 Pro Feature Card",
		Summary: "Testing Obsidian Sync gating",
	})

	// 1. Check initial license status (should be Community)
	rr := doJSON(t, h, http.MethodGet, "/api/v1/license/status", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("license status code = %d", rr.Code)
	}
	var licResp struct {
		OK     bool                  `json:"ok"`
		Status license.LicenseStatus `json:"status"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &licResp); err != nil {
		t.Fatalf("unmarshal license status: %v", err)
	}
	if licResp.Status.Tier != license.TierCommunity {
		t.Fatalf("expected tier community, got %s", licResp.Status.Tier)
	}

	// 2. Obsidian sync should be blocked with 402 Payment Required for Community tier
	tempVault := filepath.Join(t.TempDir(), "ObsidianVault")
	syncBody := fmt.Sprintf(`{"vault_path":%q}`, tempVault)
	rr = doJSON(t, h, http.MethodPost, "/api/v1/export/obsidian", syncBody)
	if rr.Code != http.StatusPaymentRequired {
		t.Fatalf("expected 402 Payment Required on obsidian sync, got %d", rr.Code)
	}

	// 3. Generate a valid Pro license key with test Ed25519 keypair
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	svc.License.SetPublicKeyForTest(pub)

	validPayload := license.LicensePayload{
		Email:     "pro-user@sparkkeep.dev",
		Tier:      license.TierPro,
		Features:  []string{license.FeatureObsidianSync, license.FeatureWebhooks},
		IssuedAt:  time.Now().Unix(),
		ExpiresAt: 0,
	}
	signedKey, err := license.SignLicenseForTest(priv, validPayload)
	if err != nil {
		t.Fatalf("SignLicense: %v", err)
	}

	// 4. Activate Pro license
	activateBody := fmt.Sprintf(`{"key":%q}`, signedKey)
	rr = doJSON(t, h, http.MethodPost, "/api/v1/license/activate", activateBody)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on license activate, got %d, body: %s", rr.Code, rr.Body.String())
	}

	// 5. License status is now Pro
	rr = doJSON(t, h, http.MethodGet, "/api/v1/license/status", "")
	if err := json.Unmarshal(rr.Body.Bytes(), &licResp); err != nil {
		t.Fatalf("unmarshal license: %v", err)
	}
	if licResp.Status.Tier != license.TierPro || licResp.Status.Email != "pro-user@sparkkeep.dev" {
		t.Fatalf("expected pro status, got %+v", licResp.Status)
	}

	// 6. Obsidian sync now succeeds!
	rr = doJSON(t, h, http.MethodPost, "/api/v1/export/obsidian", syncBody)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on obsidian sync as Pro, got %d, body: %s", rr.Code, rr.Body.String())
	}
	var syncResp struct {
		OK        bool   `json:"ok"`
		Written   int    `json:"written"`
		VaultPath string `json:"vault_path"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &syncResp); err != nil {
		t.Fatalf("unmarshal sync resp: %v", err)
	}
	if syncResp.Written != 1 {
		t.Fatalf("expected 1 written note, got %d", syncResp.Written)
	}

	// Verify markdown file exists on disk
	notePath := filepath.Join(tempVault, "Tier 2 Pro Feature Card.md")
	data, err := os.ReadFile(notePath)
	if err != nil {
		t.Fatalf("read synced note: %v", err)
	}
	if !strings.Contains(string(data), "# Tier 2 Pro Feature Card") {
		t.Fatalf("unexpected note content: %s", string(data))
	}
	_ = c
}

func TestWebhookEndpointAndGating(t *testing.T) {
	st := newStubStore()
	licMgr := license.NewManager(st)
	svc := &core.Service{
		Store:   st,
		License: licMgr,
		Webhook: webhook.NewDispatcher(st, licMgr, t.Logf),
		Logf:    t.Logf,
	}
	h := New(st, svc, config.Config{MaxUploadMB: 25})

	mockTarget := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer mockTarget.Close()

	// 1. Community tier should receive 402 Payment Required
	body := fmt.Sprintf(`{"url":%q}`, mockTarget.URL)
	rr := doJSON(t, h, http.MethodPost, "/api/v1/webhooks/test", body)
	if rr.Code != http.StatusPaymentRequired {
		t.Fatalf("expected 402 on webhook test for community tier, got %d", rr.Code)
	}

	// 2. Activate Pro license
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	svc.License.SetPublicKeyForTest(pub)
	key, _ := license.SignLicense(priv, license.LicensePayload{
		Email:    "webhook-pro@example.com",
		Tier:     license.TierPro,
		Features: []string{license.FeatureWebhooks},
	})
	_, _ = svc.License.Activate(context.Background(), key)

	// 3. Pro tier now succeeds
	rr = doJSON(t, h, http.MethodPost, "/api/v1/webhooks/test", body)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on webhook test as Pro, got %d, body: %s", rr.Code, rr.Body.String())
	}
	var resp struct {
		OK         bool `json:"ok"`
		StatusCode int  `json:"status_code"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal resp: %v", err)
	}
	if !resp.OK || resp.StatusCode != http.StatusOK {
		t.Fatalf("unexpected webhook test resp: %+v", resp)
	}
}

func TestMultipleLLMProfiles(t *testing.T) {
	st := newStubStore()
	analyzeClient := analyze.New(config.Config{
		LLMBase:  "https://api.openai.com/v1",
		LLMKey:   "sk-secret-initial",
		LLMModel: "gpt-4o",
	}, nil)
	svc := &core.Service{
		Store:   st,
		Analyze: analyzeClient,
		Logf:    t.Logf,
	}
	h := New(st, svc, config.Config{MaxUploadMB: 25})

	// Pre-populate initial legacy settings in store
	ctx := context.Background()
	_ = st.SetSetting(ctx, "llm_base", "https://api.openai.com/v1")
	_ = st.SetSetting(ctx, "llm_model", "gpt-4o")
	_ = st.SetSetting(ctx, "llm_key", "sk-secret-initial")

	// 1. GET /api/v1/settings should auto-create initial default profile
	reqGet, _ := http.NewRequest(http.MethodGet, "/api/v1/settings", nil)
	rrGet := httptest.NewRecorder()
	h.ServeHTTP(rrGet, reqGet)
	if rrGet.Code != http.StatusOK {
		t.Fatalf("expected 200 on GET /api/v1/settings, got %d", rrGet.Code)
	}

	bodyStr := rrGet.Body.String()
	if strings.Contains(bodyStr, "sk-secret-initial") {
		t.Fatalf("API key leaked in plain text in GET /api/v1/settings response: %s", bodyStr)
	}

	var getResp struct {
		OK       bool `json:"ok"`
		Settings struct {
			LLMBase     string       `json:"llm_base"`
			LLMModel    string       `json:"llm_model"`
			HasLLMKey   bool         `json:"has_llm_key"`
			LLMProfiles []LLMProfile `json:"llm_profiles"`
		} `json:"settings"`
	}
	if err := json.Unmarshal(rrGet.Body.Bytes(), &getResp); err != nil {
		t.Fatalf("unmarshal GET settings: %v", err)
	}

	if len(getResp.Settings.LLMProfiles) != 1 {
		t.Fatalf("expected 1 auto-created profile, got %d", len(getResp.Settings.LLMProfiles))
	}
	p1 := getResp.Settings.LLMProfiles[0]
	if p1.ID != "default" || p1.Model != "gpt-4o" || !p1.HasKey || !p1.IsDefault {
		t.Fatalf("unexpected auto-created profile: %+v", p1)
	}

	// Verify llm_profiles was persisted into database
	storedJSON, err := st.GetSetting(ctx, "llm_profiles")
	if err != nil || storedJSON == "" {
		t.Fatalf("expected llm_profiles stored in db, got err=%v val=%q", err, storedJSON)
	}

	// 2. PATCH /api/v1/settings: add a new profile and set it as default
	patchPayload := `{
		"llm_profiles": [
			{
				"id": "default",
				"name": "OpenAI Default",
				"base_url": "https://api.openai.com/v1",
				"model": "gpt-4o",
				"is_default": false
			},
			{
				"id": "groq-fast",
				"name": "Groq Llama 3.3",
				"base_url": "https://api.groq.com/openai/v1",
				"model": "llama-3.3-70b-versatile",
				"api_key": "gsk-groqkey-12345",
				"is_default": true
			}
		]
	}`
	reqPatch, _ := http.NewRequest(http.MethodPatch, "/api/v1/settings", strings.NewReader(patchPayload))
	reqPatch.Header.Set("Content-Type", "application/json")
	rrPatch := httptest.NewRecorder()
	h.ServeHTTP(rrPatch, reqPatch)
	if rrPatch.Code != http.StatusOK {
		t.Fatalf("expected 200 on PATCH /api/v1/settings, got %d: %s", rrPatch.Code, rrPatch.Body.String())
	}

	// Verify active settings in store were updated to Groq
	activeModel, _ := st.GetSetting(ctx, "llm_model")
	activeBase, _ := st.GetSetting(ctx, "llm_base")
	activeKey, _ := st.GetSetting(ctx, "llm_key")
	if activeModel != "llama-3.3-70b-versatile" || activeBase != "https://api.groq.com/openai/v1" || activeKey != "gsk-groqkey-12345" {
		t.Fatalf("store active settings not updated: model=%q base=%q key=%q", activeModel, activeBase, activeKey)
	}

	// Verify svc.Analyze was notified and updated dynamically
	if svc.Analyze.Model != "llama-3.3-70b-versatile" || svc.Analyze.BaseURL != "https://api.groq.com/openai/v1" || svc.Analyze.APIKey != "gsk-groqkey-12345" {
		t.Fatalf("svc.Analyze LLM config not updated: model=%q base=%q key=%q", svc.Analyze.Model, svc.Analyze.BaseURL, svc.Analyze.APIKey)
	}

	// 3. PATCH update profile without api_key: preserves existing key
	patchPreserveKey := `{
		"llm_profiles": [
			{
				"id": "default",
				"name": "OpenAI Default Updated",
				"base_url": "https://api.openai.com/v1",
				"model": "gpt-4o-mini",
				"is_default": false
			},
			{
				"id": "groq-fast",
				"name": "Groq Llama 3.3",
				"base_url": "https://api.groq.com/openai/v1",
				"model": "llama-3.3-70b-versatile",
				"is_default": true
			}
		]
	}`
	reqPatch2, _ := http.NewRequest(http.MethodPatch, "/api/v1/settings", strings.NewReader(patchPreserveKey))
	reqPatch2.Header.Set("Content-Type", "application/json")
	rrPatch2 := httptest.NewRecorder()
	h.ServeHTTP(rrPatch2, reqPatch2)
	if rrPatch2.Code != http.StatusOK {
		t.Fatalf("expected 200 on PATCH 2, got %d", rrPatch2.Code)
	}

	// Verify default profile still retained "sk-secret-initial" even though api_key was empty in patch
	storedJSON2, _ := st.GetSetting(ctx, "llm_profiles")
	if !strings.Contains(storedJSON2, "sk-secret-initial") {
		t.Fatalf("expected preserved API key in stored profiles, got: %s", storedJSON2)
	}

	// 4. Switch default back using default_profile_id
	patchSwitch := `{"default_profile_id": "default"}`
	reqPatch3, _ := http.NewRequest(http.MethodPatch, "/api/v1/settings", strings.NewReader(patchSwitch))
	reqPatch3.Header.Set("Content-Type", "application/json")
	rrPatch3 := httptest.NewRecorder()
	h.ServeHTTP(rrPatch3, reqPatch3)
	if rrPatch3.Code != http.StatusOK {
		t.Fatalf("expected 200 on PATCH default switch, got %d", rrPatch3.Code)
	}

	activeModel3, _ := st.GetSetting(ctx, "llm_model")
	activeKey3, _ := st.GetSetting(ctx, "llm_key")
	if activeModel3 != "gpt-4o-mini" || activeKey3 != "sk-secret-initial" {
		t.Fatalf("expected switched back to default model: model=%q key=%q", activeModel3, activeKey3)
	}
	if svc.Analyze.Model != "gpt-4o-mini" || svc.Analyze.APIKey != "sk-secret-initial" {
		t.Fatalf("svc.Analyze not switched back: model=%q key=%q", svc.Analyze.Model, svc.Analyze.APIKey)
	}
}

func TestSettingsLLMRolesRoundTrip(t *testing.T) {
	st := newStubStore()
	analyzeClient := analyze.New(config.Config{
		LLMBase:  "https://api.openai.com/v1",
		LLMModel: "gpt-4o",
		LLMKey:   "sk-openai-key",
	}, nil)
	svc := &core.Service{
		Store:   st,
		Analyze: analyzeClient,
		Logf:    t.Logf,
	}
	h := New(st, svc, config.Config{MaxUploadMB: 25})
	ctx := context.Background()

	// Initial profiles in store: prof-a (default) and prof-b
	profiles := []analyze.Profile{
		{
			ID:        "prof-a",
			Name:      "Model A",
			BaseURL:   "https://api.a.com/v1",
			Model:     "model-a",
			APIKey:    "key-a",
			IsDefault: true,
		},
		{
			ID:        "prof-b",
			Name:      "Model B",
			BaseURL:   "https://api.b.com/v1",
			Model:     "model-b",
			APIKey:    "key-b",
			IsDefault: false,
		},
	}
	profsData, _ := json.Marshal(profiles)
	_ = st.SetSetting(ctx, "llm_profiles", string(profsData))
	_ = svc.RebuildRouter(ctx)

	// 1. GET /api/v1/settings returns empty llm_roles initially
	reqGet, _ := http.NewRequest(http.MethodGet, "/api/v1/settings", nil)
	rrGet := httptest.NewRecorder()
	h.ServeHTTP(rrGet, reqGet)
	if rrGet.Code != http.StatusOK {
		t.Fatalf("GET /api/v1/settings failed: %d", rrGet.Code)
	}
	var getResp struct {
		Settings struct {
			LLMRoles map[string]string `json:"llm_roles"`
		} `json:"settings"`
	}
	if err := json.Unmarshal(rrGet.Body.Bytes(), &getResp); err != nil {
		t.Fatalf("unmarshal GET settings: %v", err)
	}
	if getResp.Settings.LLMRoles == nil {
		t.Fatal("expected non-nil llm_roles in GET settings")
	}

	// 2. PUT /api/v1/settings updates llm_roles
	putBody := `{"llm_roles": {"research_synthesis": "prof-b", "triage": "prof-a"}}`
	reqPut, _ := http.NewRequest(http.MethodPut, "/api/v1/settings", strings.NewReader(putBody))
	reqPut.Header.Set("Content-Type", "application/json")
	rrPut := httptest.NewRecorder()
	h.ServeHTTP(rrPut, reqPut)
	if rrPut.Code != http.StatusOK {
		t.Fatalf("PUT /api/v1/settings failed: %d: %s", rrPut.Code, rrPut.Body.String())
	}

	// 3. GET /api/v1/settings round-trip reflects updated roles
	reqGet2, _ := http.NewRequest(http.MethodGet, "/api/v1/settings", nil)
	rrGet2 := httptest.NewRecorder()
	h.ServeHTTP(rrGet2, reqGet2)
	if rrGet2.Code != http.StatusOK {
		t.Fatalf("GET 2 /api/v1/settings failed: %d", rrGet2.Code)
	}
	var getResp2 struct {
		Settings struct {
			LLMRoles map[string]string `json:"llm_roles"`
		} `json:"settings"`
	}
	if err := json.Unmarshal(rrGet2.Body.Bytes(), &getResp2); err != nil {
		t.Fatalf("unmarshal GET settings 2: %v", err)
	}
	if getResp2.Settings.LLMRoles["research_synthesis"] != "prof-b" {
		t.Fatalf("expected research_synthesis -> prof-b, got: %v", getResp2.Settings.LLMRoles)
	}
	if getResp2.Settings.LLMRoles["triage"] != "prof-a" {
		t.Fatalf("expected triage -> prof-a, got: %v", getResp2.Settings.LLMRoles)
	}

	// 4. Verify svc router was rebuilt and routes research_synthesis to prof-b
	if svc.Router == nil {
		t.Fatal("expected svc.Router to be initialized")
	}
	synthClient := svc.Router.For("research_synthesis")
	if synthClient.BaseURL != "https://api.b.com/v1" || synthClient.Model != "model-b" {
		t.Fatalf("synth client not routed to prof-b: base=%s model=%s", synthClient.BaseURL, synthClient.Model)
	}
	triageClient := svc.Router.For("triage")
	if triageClient.BaseURL != "https://api.a.com/v1" || triageClient.Model != "model-a" {
		t.Fatalf("triage client not routed to prof-a: base=%s model=%s", triageClient.BaseURL, triageClient.Model)
	}
}

func TestTriageBriefAPIFields(t *testing.T) {
	st := newStubStore()
	h := webHandler(st, &core.Service{Logf: t.Logf})

	// 1. Create a card with full triage brief payload
	createPayload := `{
		"title": "API Triage Card",
		"type": "repo",
		"tldr": "High speed embeddings in Go.",
		"why_care": "Allows sub-millisecond similarity search.",
		"claims": ["Zero alloc in hot path", "SIMD accelerated"],
		"open_questions": ["What is max batch size?"],
		"signals": {
			"extraction": "full",
			"promo": false,
			"source_quality": "primary",
			"published_at": "2026-03-10"
		},
		"worthiness": {
			"level": "high",
			"reason": "Solves our bottleneck"
		},
		"horizon": "short-term"
	}`
	rrPost := doJSON(t, h, http.MethodPost, "/api/v1/cards", createPayload)
	if rrPost.Code != http.StatusOK {
		t.Fatalf("POST /api/v1/cards failed: %d: %s", rrPost.Code, rrPost.Body.String())
	}
	var postResp struct {
		Data port.Card `json:"data"`
		OK   bool      `json:"ok"`
	}
	if err := json.Unmarshal(rrPost.Body.Bytes(), &postResp); err != nil {
		t.Fatalf("unmarshal postResp: %v", err)
	}
	created := postResp.Data
	if created.Type != "repo" || created.TLDR != "High speed embeddings in Go." {
		t.Errorf("created mismatch: %+v", created)
	}
	if created.WhyCare != "Allows sub-millisecond similarity search." {
		t.Errorf("created why_care: %q", created.WhyCare)
	}
	if len(created.Claims) != 2 || created.Claims[0] != "Zero alloc in hot path" {
		t.Errorf("created claims: %+v", created.Claims)
	}
	if len(created.OpenQuestions) != 1 || created.OpenQuestions[0] != "What is max batch size?" {
		t.Errorf("created open_questions: %+v", created.OpenQuestions)
	}
	if created.Signals.Extraction != "full" || created.Signals.PublishedAt != "2026-03-10" {
		t.Errorf("created signals: %+v", created.Signals)
	}
	if created.Worthiness.Level != "high" || created.Worthiness.Reason != "Solves our bottleneck" {
		t.Errorf("created worthiness: %+v", created.Worthiness)
	}

	// 2. GET /api/v1/cards/{id}
	rrGet := doJSON(t, h, http.MethodGet, fmt.Sprintf("/api/v1/cards/%d", created.ID), "")
	if rrGet.Code != http.StatusOK {
		t.Fatalf("GET card: %d", rrGet.Code)
	}
	var getResp struct {
		Data port.Card `json:"data"`
		OK   bool      `json:"ok"`
	}
	if err := json.Unmarshal(rrGet.Body.Bytes(), &getResp); err != nil {
		t.Fatalf("unmarshal getResp: %v", err)
	}
	got := getResp.Data
	if got.TLDR != created.TLDR || got.WhyCare != created.WhyCare || got.Type != created.Type {
		t.Errorf("GET mismatch: %+v", got)
	}

	// 3. PATCH /api/v1/cards/{id}
	patchPayload := `{
		"tldr": "Updated embeddings in Go.",
		"worthiness": {
			"level": "medium",
			"reason": "Wait for benchmarks"
		}
	}`
	rrPatch := doJSON(t, h, http.MethodPatch, fmt.Sprintf("/api/v1/cards/%d", created.ID), patchPayload)
	if rrPatch.Code != http.StatusOK {
		t.Fatalf("PATCH card: %d: %s", rrPatch.Code, rrPatch.Body.String())
	}
	var patchResp struct {
		Data port.Card `json:"data"`
		OK   bool      `json:"ok"`
	}
	if err := json.Unmarshal(rrPatch.Body.Bytes(), &patchResp); err != nil {
		t.Fatalf("unmarshal patchResp: %v", err)
	}
	patched := patchResp.Data
	if patched.TLDR != "Updated embeddings in Go." || patched.Worthiness.Level != "medium" {
		t.Errorf("patched mismatch: %+v", patched)
	}
}

func TestPlaybookAPI(t *testing.T) {
	st := newStubStore()
	h := webHandler(st, &core.Service{Store: st, Runner: &research.Runner{ClipChars: 100}, Logf: t.Logf})

	// 1. GET /api/v1/playbooks (should contain Default)
	rr := doJSON(t, h, http.MethodGet, "/api/v1/playbooks", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("GET playbooks: %d: %s", rr.Code, rr.Body.String())
	}
	var listResp struct {
		Playbooks []port.Playbook `json:"playbooks"`
		OK        bool            `json:"ok"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &listResp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(listResp.Playbooks) == 0 {
		t.Fatalf("expected at least default playbook, got 0")
	}

	// 2. Reject invalid playbook creation (empty name or invalid steps)
	rr = doJSON(t, h, http.MethodPost, "/api/v1/playbooks", `{"name": "", "steps": []}`)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty playbook, got %d", rr.Code)
	}

	// 3. Create valid custom playbook
	createPayload := `{
		"name": "Custom Monetization",
		"description": "Test custom playbook",
		"steps": [
			{"position": 1, "kind": "ground", "name": "Grounding", "enabled": true},
			{"position": 2, "kind": "custom", "name": "Monetization", "enabled": true, "config": {"output_heading": "Monetization Strategy", "instruction": "Evaluate cash flow."}},
			{"position": 3, "kind": "verdict", "name": "Verdict", "enabled": true},
			{"position": 4, "kind": "report", "name": "Report", "enabled": true}
		]
	}`
	rr = doJSON(t, h, http.MethodPost, "/api/v1/playbooks", createPayload)
	if rr.Code != http.StatusCreated {
		t.Fatalf("create playbook failed: %d: %s", rr.Code, rr.Body.String())
	}
	var createResp struct {
		Playbook port.Playbook `json:"playbook"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &createResp); err != nil {
		t.Fatalf("unmarshal created playbook: %v", err)
	}
	customPB := createResp.Playbook
	if customPB.ID == 0 || customPB.Name != "Custom Monetization" {
		t.Fatalf("unexpected custom playbook: %+v", customPB)
	}

	// 4. GET /api/v1/playbooks/{id}
	rr = doJSON(t, h, http.MethodGet, fmt.Sprintf("/api/v1/playbooks/%d", customPB.ID), "")
	if rr.Code != http.StatusOK {
		t.Fatalf("get custom playbook: %d", rr.Code)
	}

	// 5. Try modifying built-in playbook (id=1) -> 403 Forbidden
	rr = doJSON(t, h, http.MethodPut, "/api/v1/playbooks/1", createPayload)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("expected 403 when updating builtin playbook, got %d", rr.Code)
	}

	// 6. Try deleting built-in playbook (id=1) -> 403 Forbidden
	rr = doJSON(t, h, http.MethodDelete, "/api/v1/playbooks/1", "")
	if rr.Code != http.StatusForbidden {
		t.Fatalf("expected 403 when deleting builtin playbook, got %d", rr.Code)
	}

	// 7. Duplicate built-in playbook
	rr = doJSON(t, h, http.MethodPost, "/api/v1/playbooks/1/duplicate", "")
	if rr.Code != http.StatusCreated {
		t.Fatalf("duplicate builtin playbook failed: %d: %s", rr.Code, rr.Body.String())
	}
	var dupResp struct {
		Playbook port.Playbook `json:"playbook"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &dupResp); err != nil {
		t.Fatalf("unmarshal duplicated playbook: %v", err)
	}
	if dupResp.Playbook.IsBuiltin {
		t.Errorf("duplicated playbook should not be builtin")
	}

	// 8. Delete custom playbook -> 200 OK
	rr = doJSON(t, h, http.MethodDelete, fmt.Sprintf("/api/v1/playbooks/%d", customPB.ID), "")
	if rr.Code != http.StatusOK {
		t.Fatalf("delete custom playbook failed: %d: %s", rr.Code, rr.Body.String())
	}

	// 9. Trigger research with playbook_id
	c, _ := st.CreateCard(context.Background(), port.Card{Title: "Card for Research"})
	triggerPayload := fmt.Sprintf(`{"card_id": %d, "playbook_id": %d}`, c.ID, dupResp.Playbook.ID)
	rr = doJSON(t, h, http.MethodPost, "/api/v1/research", triggerPayload)
	if rr.Code != http.StatusOK {
		t.Fatalf("trigger research with playbook failed: %d: %s", rr.Code, rr.Body.String())
	}

	// 10. GET /api/v1/playbook-steps/library
	rr = doJSON(t, h, http.MethodGet, "/api/v1/playbook-steps/library", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("get step library failed: %d: %s", rr.Code, rr.Body.String())
	}
	var libResp struct {
		Templates []research.LibraryStepTemplate `json:"templates"`
		OK        bool                           `json:"ok"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &libResp); err != nil {
		t.Fatalf("unmarshal library templates: %v", err)
	}
	if len(libResp.Templates) != 6 {
		t.Fatalf("expected 6 library templates, got %d", len(libResp.Templates))
	}
	// Verify monetization template is present
	foundMonetization := false
	for _, tpl := range libResp.Templates {
		if tpl.ID == "monetization" {
			foundMonetization = true
			if tpl.Heading != "Monetization Angle" || tpl.ToolPolicy != "search" {
				t.Errorf("unexpected monetization template config: %+v", tpl)
			}
		}
	}
	if !foundMonetization {
		t.Errorf("monetization template not found in library")
	}
}

