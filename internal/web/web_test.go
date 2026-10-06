package web

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"sparkkeep/internal/analyze"
	"sparkkeep/internal/config"
	"sparkkeep/internal/core"
	"sparkkeep/internal/port"
	"sparkkeep/internal/research"
)

// --- stubs -------------------------------------------------------------------

// stubStore is an in-memory port.Store recording the last CardFilter and
// CardPatch (for forwarding assertions). Research rows are guarded by a mutex
// because the trigger endpoint runs Research in a goroutine.
type stubStore struct {
	mu         sync.Mutex
	cards      map[int64]port.Card
	researches map[int64]port.Research
	nextCard   int64
	nextRes    int64
	lastFilter port.CardFilter
	lastPatch  port.CardPatch
}

func newStubStore() *stubStore {
	return &stubStore{cards: map[int64]port.Card{}, researches: map[int64]port.Research{}}
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

func (s *stubStore) ListTags(context.Context) ([]port.Tag, error) {
	return nil, nil
}

func (s *stubStore) CreateResearch(_ context.Context, cardID int64, query string) (port.Research, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextRes++
	r := port.Research{ID: s.nextRes, CardID: cardID, Status: "queued", Query: query, CreatedAt: time.Now().UTC()}
	s.researches[r.ID] = r
	return r, nil
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

func (s *stubStore) GetResearchFindings(_ context.Context, id int64) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.researches[id]
	if !ok {
		return "", port.ErrNotFound
	}
	return r.Findings, nil
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
	st.cards[5] = port.Card{ID: 5, Title: "Analysis failed", Status: port.StatusInbox, SourceNote: "raw"}
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
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("json: %v", err)
	}
	if !out.OK || out.Data.Title != "Fixed" {
		t.Fatalf("out = %+v, want retried card titled Fixed", out)
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
