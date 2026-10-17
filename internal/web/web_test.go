package web

import (
	"context"
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

	"golang.org/x/crypto/bcrypt"

	"sparkkeep/internal/analyze"
	"sparkkeep/internal/channel"
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
		nextPb:     6,
	}
	for _, pb := range research.BuiltinPlaybooks() {
		st.playbooks[pb.ID] = pb
	}
	return st
}

func (s *stubStore) CreateCard(_ context.Context, c port.Card) (port.Card, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
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
	s.mu.Lock()
	defer s.mu.Unlock()
	c, ok := s.cards[id]
	if !ok {
		return port.Card{}, port.ErrNotFound
	}
	return c, nil
}

func (s *stubStore) GetCardBySourceURL(_ context.Context, url string) (port.Card, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
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
	s.mu.Lock()
	defer s.mu.Unlock()
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
	s.mu.Lock()
	defer s.mu.Unlock()
	cutoff := time.Now().UTC().AddDate(0, 0, -days)
	var n int64
	for id, c := range s.cards {
		if (c.Status == port.StatusInbox || c.Status == port.StatusToDo || c.Status == port.StatusInProgress) && c.UpdatedAt.Before(cutoff) {
			c.Status, c.UpdatedAt = port.StatusShelved, time.Now().UTC()
			s.cards[id] = c
			n++
		}
	}
	return n, nil
}

func (s *stubStore) UpdateCard(_ context.Context, id int64, p port.CardPatch) (port.Card, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
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

func (s *stubStore) DeleteCard(_ context.Context, id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.cards[id]; !ok {
		return port.ErrNotFound
	}
	delete(s.cards, id)
	return nil
}

func (s *stubStore) SetCardTags(_ context.Context, id int64, tags []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	c, ok := s.cards[id]
	if !ok {
		return port.ErrNotFound
	}
	c.Tags = tags
	s.cards[id] = c
	return nil
}

func (s *stubStore) SetCardReferences(_ context.Context, id int64, refs []port.Reference) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	c, ok := s.cards[id]
	if !ok {
		return port.ErrNotFound
	}
	c.References = refs
	s.cards[id] = c
	return nil
}

func (s *stubStore) ListTags(context.Context) ([]port.Tag, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]port.Tag, len(s.tags))
	copy(out, s.tags)
	return out, nil
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

func (s *stubStore) ResolvePlaybook(_ context.Context, cardID int64, explicitPlaybookID ...*int64) (port.Playbook, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(explicitPlaybookID) > 0 && explicitPlaybookID[0] != nil {
		pb, ok := s.playbooks[*explicitPlaybookID[0]]
		if !ok {
			return port.Playbook{}, port.ErrNotFound
		}
		return pb, nil
	}
	var card port.Card
	if cardID > 0 {
		card = s.cards[cardID]
	}
	cardType := strings.TrimSpace(strings.ToLower(card.Type))
	if cardType != "" {
		for _, pb := range s.playbooks {
			if !pb.IsBuiltin {
				for _, ct := range pb.CardTypes {
					if strings.TrimSpace(strings.ToLower(ct)) == cardType {
						return pb, nil
					}
				}
			}
		}
		for _, pb := range s.playbooks {
			if pb.IsBuiltin {
				for _, ct := range pb.CardTypes {
					if strings.TrimSpace(strings.ToLower(ct)) == cardType {
						return pb, nil
					}
				}
			}
		}
	}
	if defVal, ok := s.settings["default_playbook_id"]; ok && defVal != "" {
		if defID, err := strconv.ParseInt(defVal, 10, 64); err == nil {
			if pb, ok := s.playbooks[defID]; ok {
				return pb, nil
			}
		}
	}
	for _, pb := range s.playbooks {
		if pb.IsBuiltin && pb.ID == 1 {
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

func (s *stubStore) SetResearchFeedback(_ context.Context, id int64, rating, comment string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.researches[id]
	if !ok {
		return port.ErrNotFound
	}
	r.FeedbackRating = &rating
	r.FeedbackComment = &comment
	now := time.Now().UTC()
	r.FeedbackAt = &now
	s.researches[id] = r
	return nil
}

func (s *stubStore) GetPipelineMetrics(_ context.Context) (port.PipelineMetrics, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return port.PipelineMetrics{
		RunsByPlaybook:  make(map[string]int),
		TriageByStatus:  make(map[string]int),
		AvgTokensByRole: make(map[string]int),
	}, nil
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

func (s *stubStore) GetCardTypes(_ context.Context) ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.settings != nil {
		if val, ok := s.settings["card_types"]; ok && strings.TrimSpace(val) != "" {
			var types []string
			if err := json.Unmarshal([]byte(val), &types); err == nil && types != nil {
				return types, nil
			}
		}
	}
	res := make([]string, len(port.DefaultCardTypes))
	copy(res, port.DefaultCardTypes)
	return res, nil
}

func (s *stubStore) SetCardTypes(_ context.Context, types []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.settings == nil {
		s.settings = make(map[string]string)
	}
	if types == nil {
		types = []string{}
	}
	data, err := json.Marshal(types)
	if err != nil {
		return err
	}
	s.settings["card_types"] = string(data)
	return nil
}

func (s *stubStore) RecoverInterruptedResearch(_ context.Context) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	n := 0
	for id, r := range s.researches {
		if r.Status == "running" {
			r.Status = "failed"
			r.Error = "interrupted by server restart"
			s.researches[id] = r
			n++
		}
	}
	return n, nil
}

func (s *stubStore) GetNextQueuedResearch(_ context.Context, asOf time.Time) (*port.Research, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var best *port.Research
	for _, r := range s.researches {
		if r.Status != "queued" {
			continue
		}
		if r.ScheduledFor != nil && r.ScheduledFor.After(asOf) {
			continue
		}
		if best == nil || r.ID < best.ID {
			curr := r
			best = &curr
		}
	}
	return best, nil
}

func (s *stubStore) CountQueuedAhead(_ context.Context, researchID int64) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	target, ok := s.researches[researchID]
	if !ok {
		return 0, nil
	}
	n := 0
	for _, r := range s.researches {
		if r.Status == "queued" && r.ID < target.ID {
			n++
		}
	}
	return n, nil
}

func (s *stubStore) BatchQueueResearch(ctx context.Context, cardIDs []int64, playbookID *int64, scheduledFor *time.Time, batchID string) ([]port.Research, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var queued []port.Research
	for _, cid := range cardIDs {
		// check active
		var active bool
		for _, r := range s.researches {
			if r.CardID == cid && (r.Status == "queued" || r.Status == "running") {
				active = true
				break
			}
		}
		if active {
			continue
		}
		id := int64(len(s.researches) + 1)
		r := port.Research{
			ID:           id,
			CardID:       cid,
			Status:       "queued",
			PlaybookID:   playbookID,
			ScheduledFor: scheduledFor,
			CreatedAt:    time.Now().UTC(),
		}
		if batchID != "" {
			r.BatchID = &batchID
		}
		s.researches[id] = r
		queued = append(queued, r)
	}
	return queued, nil
}

func (s *stubStore) FindCardsForRule(ctx context.Context, filter port.ResearchRuleFilter, maxCards int, asOf time.Time) ([]port.Card, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if maxCards <= 0 {
		maxCards = 10
	}
	var res []port.Card
	for _, c := range s.cards {
		if len(res) >= maxCards {
			break
		}
		var active bool
		for _, r := range s.researches {
			if r.CardID == c.ID && (r.Status == "queued" || r.Status == "running") {
				active = true
				break
			}
		}
		if active {
			continue
		}
		if filter.Status != "" && !strings.EqualFold(c.Status, filter.Status) {
			continue
		}
		if filter.Worthiness != "" && !strings.EqualFold(c.Worthiness.Level, filter.Worthiness) {
			continue
		}
		if filter.Type != "" && !strings.EqualFold(c.Type, filter.Type) {
			continue
		}
		res = append(res, c)
	}
	return res, nil
}

func (s *stubStore) ListCompletedResearchSince(_ context.Context, since time.Time) ([]port.Research, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var res []port.Research
	for _, r := range s.researches {
		if r.Status == "done" || r.Status == "failed" {
			if r.CreatedAt.After(since) || r.CreatedAt.Equal(since) {
				res = append(res, r)
			}
		}
	}
	return res, nil
}

func (s *stubStore) AddCardComment(_ context.Context, cardID int64, content string) (port.CardComment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return port.CardComment{ID: 1, CardID: cardID, Content: content, CreatedAt: time.Now().UTC()}, nil
}

func (s *stubStore) ListCardComments(_ context.Context, cardID int64) ([]port.CardComment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return nil, nil
}

func (s *stubStore) RecordChannelMessage(_ context.Context, _, _ string, _ int64) error {
	return nil
}

func (s *stubStore) GetCardIDByChannelMessage(_ context.Context, _, _ string) (int64, error) {
	return 0, port.ErrNotFound
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
	st.cards[4] = port.Card{ID: 4, Title: "same day as 2", Status: port.StatusInProgress, CreatedAt: now.AddDate(0, 0, -2).Add(time.Hour)}
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
	if body.ByStatus["inbox"] != 1 || body.ByStatus["done"] != 1 || body.ByStatus["in-progress"] != 1 {
		t.Fatalf("by_status = %v, want inbox:1 done:1 in-progress:1", body.ByStatus)
	}
	if len(body.Days) != 2 {
		t.Fatalf("days = %d, want 2", len(body.Days))
	}
	if body.Days[0].Date != now.Format("2006-01-02") {
		t.Fatalf("days[0].date = %q, want today", body.Days[0].Date)
	}
}

func TestWeeklyDigest_Extended(t *testing.T) {
	st := newStubStore()
	now := time.Now().UTC()
	st.cards[1] = port.Card{ID: 1, Title: "old prev window", Status: port.StatusDone, CreatedAt: now.AddDate(0, 0, -10)}
	st.cards[2] = port.Card{ID: 2, Title: "card current done", Status: port.StatusDone, Horizon: "short-term", CreatedAt: now.AddDate(0, 0, -2)}
	st.cards[3] = port.Card{ID: 3, Title: "card current todo", Status: port.StatusToDo, Horizon: "short-term", CreatedAt: now.AddDate(0, 0, -1), ResearchVerdict: "pursue", UpdatedAt: now.AddDate(0, 0, -6)}
	h := webHandler(st, &core.Service{Logf: t.Logf})

	rr := doJSON(t, h, http.MethodGet, "/api/v1/digest?days=7", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	var body struct {
		OK              bool           `json:"ok"`
		WeekTotal       int            `json:"week_total"`
		PrevTotal       int            `json:"prev_total"`
		WowDeltaPercent int            `json:"wow_delta_percent"`
		StaleCount      int            `json:"stale_count"`
		WeeklyWins      []port.Card    `json:"weekly_wins"`
		ResearchHarvest []port.Card    `json:"research_harvest"`
		ByStatus        map[string]int `json:"by_status"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("json: %v", err)
	}
	if body.WeekTotal != 2 {
		t.Errorf("WeekTotal = %d, want 2", body.WeekTotal)
	}
	if body.PrevTotal != 1 {
		t.Errorf("PrevTotal = %d, want 1", body.PrevTotal)
	}
	if body.WowDeltaPercent != 100 {
		t.Errorf("WowDeltaPercent = %d, want 100", body.WowDeltaPercent)
	}
	if len(body.WeeklyWins) != 1 {
		t.Errorf("WeeklyWins len = %d, want 1", len(body.WeeklyWins))
	}
	if len(body.ResearchHarvest) != 1 {
		t.Errorf("ResearchHarvest len = %d, want 1", len(body.ResearchHarvest))
	}
	if body.StaleCount != 1 {
		t.Errorf("StaleCount = %d, want 1", body.StaleCount)
	}
}

func TestSynthesizeDigest(t *testing.T) {
	st := newStubStore()
	now := time.Now().UTC()
	st.cards[1] = port.Card{ID: 1, Title: "AI Agent", Status: port.StatusDone, Tags: []string{"ai", "agents"}, CreatedAt: now.AddDate(0, 0, -1)}
	st.cards[2] = port.Card{ID: 2, Title: "SQLite WAL", Status: port.StatusToDo, Tags: []string{"sqlite"}, CreatedAt: now.AddDate(0, 0, -2)}
	h := webHandler(st, &core.Service{Logf: t.Logf})

	rr := doJSON(t, h, http.MethodPost, "/api/v1/digest/synthesize?days=7", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	var body struct {
		OK       bool   `json:"ok"`
		Briefing string `json:"briefing"`
		Themes   []struct {
			Title   string  `json:"title"`
			Summary string  `json:"summary"`
			CardIDs []int64 `json:"card_ids"`
		} `json:"themes"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("json: %v", err)
	}
	if !body.OK || body.Briefing == "" {
		t.Fatalf("got empty briefing or ok=false: %+v", body)
	}
	if len(body.Themes) == 0 {
		t.Fatalf("expected at least 1 theme in heuristic fallback, got 0")
	}
}

func TestDeleteCardEndpoint(t *testing.T) {
	st := newStubStore()
	c, _ := st.CreateCard(context.Background(), port.Card{Title: "To Be Deleted"})
	h := webHandler(st, nil)

	rr := doJSON(t, h, http.MethodDelete, fmt.Sprintf("/api/v1/cards/%d", c.ID), "")
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}

	// Should be deleted
	if _, ok := st.cards[c.ID]; ok {
		t.Fatalf("card still in stub store")
	}

	// Deleting again should be 404
	rr404 := doJSON(t, h, http.MethodDelete, fmt.Sprintf("/api/v1/cards/%d", c.ID), "")
	if rr404.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rr404.Code)
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
	st.cards[2] = port.Card{ID: 2, Title: "borderline", Status: port.StatusInProgress, UpdatedAt: now.AddDate(0, 0, -31)}
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
	st.cards[2] = port.Card{ID: 2, Title: "stale doing", Status: port.StatusInProgress, UpdatedAt: now.AddDate(0, 0, -35)}
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

	rr := doJSON(t, h, http.MethodPatch, "/api/v1/cards/5", `{"status":"in-progress"}`)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rr.Code, rr.Body.String())
	}
	if st.lastPatch.Status == nil || *st.lastPatch.Status != "in-progress" {
		t.Fatalf("patch = %+v, want status=in-progress", st.lastPatch)
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
	if !out.OK || out.Data.Status != "in-progress" {
		t.Fatalf("out = %+v, want status in-progress", out)
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

func TestRetryCardSubjectCardInPlace(t *testing.T) {
	llm := llmStub(http.StatusOK, `[{
		"title": "Synthesized Title",
		"summary": "Synthesized Summary",
		"tldr": "Synthesized TLDR Takeaway",
		"why_care": "Why this subject matters",
		"claims": ["Claim 1", "Claim 2"],
		"open_questions": ["Question 1"],
		"horizon": "medium-term",
		"tags": ["ai"]
	}]`)
	defer llm.Close()
	st := newStubStore()
	st.cards[42] = port.Card{
		ID:         42,
		Title:      "Manual Topic",
		Summary:    "Initial thoughts on topic",
		Status:     port.StatusInbox,
		SourceURL:  "",
		SourceNote: "User research note",
		Tags:       []string{"manual-tag"},
	}
	svc := &core.Service{Store: st, Analyze: analyzeClient(llm), Logf: t.Logf}
	h := webHandler(st, svc)

	rr := doJSON(t, h, http.MethodPost, "/api/v1/cards/42/retry", "")
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
		t.Fatalf("out = %+v, want OK:true", out)
	}
	if out.Data.ID != 42 {
		t.Errorf("ID = %d, want 42", out.Data.ID)
	}
	if out.Data.Title != "Manual Topic" {
		t.Errorf("Title = %q, want 'Manual Topic'", out.Data.Title)
	}
	if out.Data.TLDR != "Synthesized TLDR Takeaway" {
		t.Errorf("TLDR = %q", out.Data.TLDR)
	}
	if out.Data.WhyCare != "Why this subject matters" {
		t.Errorf("WhyCare = %q", out.Data.WhyCare)
	}
	if len(out.Data.Claims) != 2 {
		t.Errorf("Claims count = %d, want 2", len(out.Data.Claims))
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
		ShareToken: "tok-seven",
	}
	st.researches[8] = port.Research{
		ID: 8, CardID: 5, Status: "done", Findings: "other", ShareToken: "tok-eight",
	}
	st.researches[9] = port.Research{ID: 9, CardID: 5, Status: "done", Findings: "legacy"}
	h := webHandler(st, &core.Service{Logf: t.Logf})

	// Missing or wrong token → 404, without revealing whether the row exists.
	if rr := doJSON(t, h, http.MethodGet, "/api/v1/research/7", ""); rr.Code != http.StatusNotFound {
		t.Fatalf("no token: status = %d, want 404", rr.Code)
	}
	if rr := doJSON(t, h, http.MethodGet, "/api/v1/research/7?t=tok-eight", ""); rr.Code != http.StatusNotFound {
		t.Fatalf("another row's token: status = %d, want 404", rr.Code)
	}
	// A legacy row with no token is never shareable — even an empty ?t= must miss.
	if rr := doJSON(t, h, http.MethodGet, "/api/v1/research/9?t=", ""); rr.Code != http.StatusNotFound {
		t.Fatalf("empty token on legacy row: status = %d, want 404", rr.Code)
	}

	rr := doJSON(t, h, http.MethodGet, "/api/v1/research/7?t=tok-seven", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("with token: status = %d, want 200", rr.Code)
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
		{"/favicon.svg", "image/svg+xml", "<svg"},
		{"/favicon.ico", "image/svg+xml", "<svg"},
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
	} {
		if rr := do(http.MethodGet, tc.path, tc.bear, tc.cooke); rr.Code != http.StatusOK {
			t.Errorf("%s: status = %d, want 200", tc.name, rr.Code)
		}
	}

	// A token in the query string is no longer accepted (leak vector).
	if rr := do(http.MethodGet, "/api/v1/cards?token=secret123", "", ""); rr.Code != http.StatusUnauthorized {
		t.Errorf("query token: status = %d, want 401", rr.Code)
	}

	// A verified token is exchanged for the cookie.
	rr = doJSON(t, h, http.MethodPost, "/api/v1/auth/verify", `{"token":"secret123"}`)
	if rr.Code != http.StatusOK {
		t.Fatalf("verify: status = %d, want 200 (body %s)", rr.Code, rr.Body.String())
	}
	cookies := rr.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != authCookie {
		t.Fatalf("verify cookies = %+v, want a single %s cookie", cookies, authCookie)
	}
	// The cookie must carry an opaque session token, never the passphrase.
	if cookies[0].Value == "secret123" || cookies[0].Value == "" {
		t.Fatalf("cookie value = %q, want a random session token (not the passphrase)", cookies[0].Value)
	}
	// Cookie name is spec-mandated (brief §2).
	if cookies[0].Name != "sparkkeep_auth" {
		t.Fatalf("cookie name = %q, want sparkkeep_auth", cookies[0].Name)
	}
	wantMaxAge := int(sessionTTL / time.Second)
	if cookies[0].Path != "/" || cookies[0].MaxAge != wantMaxAge || cookies[0].SameSite != http.SameSiteLaxMode || !cookies[0].HttpOnly {
		t.Errorf("cookie attrs = %+v, want Path=/ Max-Age=%d SameSite=Lax HttpOnly", cookies[0], wantMaxAge)
	}
	// That session token authorizes later private requests.
	if rr := do(http.MethodGet, "/api/v1/cards", "", cookies[0].Value); rr.Code != http.StatusOK {
		t.Errorf("session cookie: status = %d, want 200", rr.Code)
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

// TestVerifyThrottle covers the failed-login limiter: after loginMaxFailures
// consecutive failures from one IP the verify endpoint returns 429, and a
// successful verify clears the counter.
func TestVerifyThrottle(t *testing.T) {
	st := newStubStore()
	h := New(st, &core.Service{Logf: t.Logf}, config.Config{MaxUploadMB: 25, AuthToken: "correct"})

	bad := func() int {
		return doJSON(t, h, http.MethodPost, "/api/v1/auth/verify", `{"token":"wrong"}`).Code
	}

	// Failures below the limit stay 401 (count starts reset after each check).
	for i := 0; i < loginMaxFailures-1; i++ {
		if code := bad(); code != http.StatusUnauthorized {
			t.Fatalf("failure %d: status = %d, want 401", i+1, code)
		}
	}
	// A successful verify clears the counter before reaching the limit.
	if code := doJSON(t, h, http.MethodPost, "/api/v1/auth/verify", `{"token":"correct"}`).Code; code != http.StatusOK {
		t.Fatalf("successful verify: status = %d, want 200", code)
	}
	// The counter is fresh again: the limit takes loginMaxFailures more failures.
	for i := 0; i < loginMaxFailures; i++ {
		if code := bad(); code != http.StatusUnauthorized {
			t.Fatalf("after clear, failure %d: status = %d, want 401", i+1, code)
		}
	}
	// The next attempt is throttled even with the correct token.
	if code := doJSON(t, h, http.MethodPost, "/api/v1/auth/verify", `{"token":"correct"}`).Code; code != http.StatusTooManyRequests {
		t.Fatalf("throttled verify: status = %d, want 429", code)
	}
}

// TestLoginFailMapSwept proves the failed-login map evicts expired entries once
// it grows past loginSweepThreshold, so a flood of distinct source IPs cannot
// grow it without bound.
func TestLoginFailMapSwept(t *testing.T) {
	a := &api{loginFails: map[string]loginFail{}}
	past := time.Now().Add(-time.Minute)
	live := time.Now().Add(time.Hour)
	for i := 0; i < loginSweepThreshold; i++ {
		a.loginFails[fmt.Sprintf("stale-%d", i)] = loginFail{count: 1, resetAt: past}
	}
	a.loginFails["stale-0"] = loginFail{count: 1, resetAt: live} // one still-valid entry

	a.recordLoginFailure("fresh")

	if got := len(a.loginFails); got != 2 {
		t.Fatalf("map size after sweep = %d, want 2 (expired evicted, live + fresh kept)", got)
	}
	if _, ok := a.loginFails["stale-0"]; !ok {
		t.Error("unexpired entry evicted, want kept")
	}
	if f, ok := a.loginFails["fresh"]; !ok || f.count != 1 {
		t.Errorf("fresh entry = %+v (present=%v), want count 1", f, ok)
	}
}

// TestSessionExpiry proves an expired session token is treated as absent, is
// swept from the map, and that an unexpired one still authorizes.
func TestSessionExpiry(t *testing.T) {
	a := &api{authToken: "correct"}
	ctx := context.Background()

	a.sessions.Store("expired", time.Now().Add(-time.Minute))
	if a.validateToken(ctx, "expired") {
		t.Fatal("expired session authorized, want rejected")
	}
	if _, ok := a.sessions.Load("expired"); ok {
		t.Fatal("expired session not swept from the map")
	}

	a.sessions.Store("live", time.Now().Add(time.Hour))
	if !a.validateToken(ctx, "live") {
		t.Fatal("unexpired session rejected, want authorized")
	}
}

// TestVerifyCookieSecure proves the auth cookie sets Secure behind a
// TLS-terminating proxy and omits it on plain HTTP.
func TestVerifyCookieSecure(t *testing.T) {
	st := newStubStore()
	h := New(st, &core.Service{Logf: t.Logf}, config.Config{MaxUploadMB: 25, AuthToken: "correct"})

	verify := func(proto string) *http.Cookie {
		r := httptest.NewRequest(http.MethodPost, "/api/v1/auth/verify", strings.NewReader(`{"token":"correct"}`))
		r.Header.Set("Content-Type", "application/json")
		if proto != "" {
			r.Header.Set("X-Forwarded-Proto", proto)
		}
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, r)
		if rr.Code != http.StatusOK {
			t.Fatalf("verify (%s): status = %d, want 200", proto, rr.Code)
		}
		cs := rr.Result().Cookies()
		if len(cs) != 1 {
			t.Fatalf("verify (%s): cookies = %+v, want one", proto, cs)
		}
		return cs[0]
	}

	if c := verify("https"); !c.Secure {
		t.Errorf("X-Forwarded-Proto https: cookie Secure = false, want true")
	}
	if c := verify(""); c.Secure {
		t.Errorf("plain HTTP: cookie Secure = true, want false")
	}
}

// TestAuthQueryTokenRejected confirms a request carrying only ?token=<valid> no
// longer authorizes, closing the token-in-URL leak.
func TestAuthQueryTokenRejected(t *testing.T) {
	st := newStubStore()
	h := New(st, &core.Service{Logf: t.Logf}, config.Config{MaxUploadMB: 25, AuthToken: "secret123"})

	rr := doJSON(t, h, http.MethodGet, "/api/v1/cards?token=secret123", "")
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("query token: status = %d, want 401", rr.Code)
	}
}

func TestAuthMiddleware_WebhookIngressAndMethodSafeValidation(t *testing.T) {
	t.Setenv("SPARKKEEP_AUTH_TOKEN", "secret123")
	cfg := config.Config{
		MaxUploadMB: 25,
		AuthToken:   os.Getenv("SPARKKEEP_AUTH_TOKEN"),
	}

	st := newStubStore()
	st.researches[42] = port.Research{
		ID:        42,
		CardID:    1,
		Status:    "done",
		Findings:  "Comprehensive analysis report",
		CreatedAt: time.Now().UTC(),
	}
	svc := &core.Service{Store: st, Logf: t.Logf}
	h := New(st, svc, cfg)

	// a) Discord interaction and OpenClaw webhook are allowed through auth middleware
	// without the app Bearer token. Discord has no configured adapter here, so the
	// handler itself answers 503; the OpenClaw handler authenticates the hook token.
	rDC := httptest.NewRequest(http.MethodPost, "/api/v1/channels/discord/interactions", strings.NewReader(`{"type": 1}`))
	rDC.Header.Set("Content-Type", "application/json")
	rrDC := httptest.NewRecorder()
	h.ServeHTTP(rrDC, rDC)
	if rrDC.Code != http.StatusServiceUnavailable {
		t.Fatalf("Discord interaction without Bearer token: status = %d, want 503 (body %s)", rrDC.Code, rrDC.Body.String())
	}

	if err := st.SetSetting(context.Background(), "openclaw_token", "hook-secret"); err != nil {
		t.Fatalf("set openclaw token: %v", err)
	}
	ocPayload := `{"channel":"whatsapp","sender":"+1555123","text":"/short 1"}`
	rOC := httptest.NewRequest(http.MethodPost, "/api/v1/channels/openclaw/webhook", strings.NewReader(ocPayload))
	rOC.Header.Set("Content-Type", "application/json")
	rOC.Header.Set("Authorization", "Bearer hook-secret")
	rrOC := httptest.NewRecorder()
	h.ServeHTTP(rrOC, rOC)
	if rrOC.Code != http.StatusOK {
		t.Fatalf("OpenClaw webhook without app Bearer token: status = %d, want 200 (body %s)", rrOC.Code, rrOC.Body.String())
	}

	// b) POST /api/v1/research/{id}/feedback with Accept: text/html is rejected with 401 when no token is provided.
	fbPayload := `{"rating":"thumbs_up","comment":"insightful"}`
	rFB := httptest.NewRequest(http.MethodPost, "/api/v1/research/42/feedback", strings.NewReader(fbPayload))
	rFB.Header.Set("Content-Type", "application/json")
	rFB.Header.Set("Accept", "text/html")
	rrFB := httptest.NewRecorder()
	h.ServeHTTP(rrFB, rFB)
	if rrFB.Code != http.StatusUnauthorized {
		t.Fatalf("POST /api/v1/research/42/feedback with Accept: text/html without token: status = %d, want 401", rrFB.Code)
	}

	// With Bearer token, the feedback request is accepted (not 401).
	rFBAuth := httptest.NewRequest(http.MethodPost, "/api/v1/research/42/feedback", strings.NewReader(fbPayload))
	rFBAuth.Header.Set("Content-Type", "application/json")
	rFBAuth.Header.Set("Accept", "text/html")
	rFBAuth.Header.Set("Authorization", "Bearer secret123")
	rrFBAuth := httptest.NewRecorder()
	h.ServeHTTP(rrFBAuth, rFBAuth)
	if rrFBAuth.Code != http.StatusOK {
		t.Fatalf("POST /api/v1/research/42/feedback with Bearer token: status = %d, want 200 (body %s)", rrFBAuth.Code, rrFBAuth.Body.String())
	}

	// c) GET /api/v1/research/{id} with Accept: text/html is public but now
	// requires the row's share token; row 42 has none, so the anonymous request
	// gets a 404 rather than the report.
	rGetHTML := httptest.NewRequest(http.MethodGet, "/api/v1/research/42", nil)
	rGetHTML.Header.Set("Accept", "text/html")
	rrGetHTML := httptest.NewRecorder()
	h.ServeHTTP(rrGetHTML, rGetHTML)
	if rrGetHTML.Code != http.StatusNotFound {
		t.Fatalf("GET /api/v1/research/42 with Accept: text/html without token: status = %d, want 404 (body %s)", rrGetHTML.Code, rrGetHTML.Body.String())
	}

	// With the app Bearer token the request is authenticated, so the share-token
	// requirement is skipped and the HTML report still renders.
	rGetAuthHTML := httptest.NewRequest(http.MethodGet, "/api/v1/research/42", nil)
	rGetAuthHTML.Header.Set("Accept", "text/html")
	rGetAuthHTML.Header.Set("Authorization", "Bearer secret123")
	rrGetAuthHTML := httptest.NewRecorder()
	h.ServeHTTP(rrGetAuthHTML, rGetAuthHTML)
	if rrGetAuthHTML.Code != http.StatusOK {
		t.Fatalf("GET /api/v1/research/42 with Bearer token: status = %d, want 200 (body %s)", rrGetAuthHTML.Code, rrGetAuthHTML.Body.String())
	}
	if !strings.Contains(rrGetAuthHTML.Body.String(), "<html") {
		t.Errorf("GET /api/v1/research/42 expected HTML body, got: %s", rrGetAuthHTML.Body.String())
	}

	// Confirm GET /api/v1/research/{id} with Accept: application/json without token is rejected with 401.
	rGetJSON := httptest.NewRequest(http.MethodGet, "/api/v1/research/42", nil)
	rGetJSON.Header.Set("Accept", "application/json")
	rrGetJSON := httptest.NewRecorder()
	h.ServeHTTP(rrGetJSON, rGetJSON)
	if rrGetJSON.Code != http.StatusUnauthorized {
		t.Fatalf("GET /api/v1/research/42 with Accept: application/json without token: status = %d, want 401", rrGetJSON.Code)
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
	rr = doJSON(t, h, http.MethodPatch, "/api/v1/cards/999", `{"status":"in-progress"}`)
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
	if len(cookies) == 0 || cookies[0].Name != authCookie || !cookies[0].HttpOnly {
		t.Fatalf("expected an HttpOnly auth cookie to be set, got %+v", cookies)
	}
	// The setup cookie is an opaque session token, not the passphrase.
	if cookies[0].Value == "my-master-token" || cookies[0].Value == "" {
		t.Fatalf("setup cookie must be an opaque session token, got %q", cookies[0].Value)
	}
	// The issued session cookie authorizes later private requests.
	cookieReq, _ := http.NewRequest(http.MethodGet, "/api/v1/cards", nil)
	cookieReq.AddCookie(&http.Cookie{Name: authCookie, Value: cookies[0].Value})
	cookieRR := httptest.NewRecorder()
	h.ServeHTTP(cookieRR, cookieReq)
	if cookieRR.Code != http.StatusOK {
		t.Fatalf("setup session cookie auth: status = %d, want 200", cookieRR.Code)
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

func TestLicenseStatusAndObsidianExport(t *testing.T) {
	st := newStubStore()
	svc := &core.Service{
		Store: st,
		Logf:  t.Logf,
	}
	h := New(st, svc, config.Config{MaxUploadMB: 25})

	// Add a sample card to store
	c, _ := st.CreateCard(context.Background(), port.Card{
		Title:   "MIT Feature Card",
		Summary: "Testing Obsidian export",
	})

	// 1. License status reports the community/MIT tier with every feature.
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
	if licResp.Status.Tier != license.TierCommunity || !licResp.Status.IsValid || len(licResp.Status.Features) == 0 {
		t.Fatalf("expected valid %s status with features, got %+v", license.TierCommunity, licResp.Status)
	}
	var rawResp struct {
		Status map[string]any `json:"status"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &rawResp); err != nil {
		t.Fatalf("unmarshal raw license status: %v", err)
	}
	for _, prunedKey := range []string{"email", "expires_at", "is_lifetime"} {
		if _, exists := rawResp.Status[prunedKey]; exists {
			t.Fatalf("expected pruned field %q to be absent from status response, got %v", prunedKey, rawResp.Status)
		}
	}

	// 2. Obsidian sync succeeds with no gating.
	tempVault := filepath.Join(t.TempDir(), "ObsidianVault")
	syncBody := fmt.Sprintf(`{"vault_path":%q}`, tempVault)
	rr = doJSON(t, h, http.MethodPost, "/api/v1/export/obsidian", syncBody)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on obsidian sync, got %d: %s", rr.Code, rr.Body.String())
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
	notePath := filepath.Join(tempVault, "MIT Feature Card.md")
	data, err := os.ReadFile(notePath)
	if err != nil {
		t.Fatalf("read synced note: %v", err)
	}
	if !strings.Contains(string(data), "# MIT Feature Card") {
		t.Fatalf("unexpected note content: %s", string(data))
	}
	_ = c
}

func TestWebhookEndpoint(t *testing.T) {
	st := newStubStore()
	svc := &core.Service{
		Store:   st,
		Webhook: webhook.NewDispatcher(st, t.Logf),
		Logf:    t.Logf,
	}
	h := New(st, svc, config.Config{MaxUploadMB: 25})

	mockTarget := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer mockTarget.Close()

	body := fmt.Sprintf(`{"url":%q}`, mockTarget.URL)
	rr := doJSON(t, h, http.MethodPost, "/api/v1/webhooks/test", body)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on webhook test, got %d: %s", rr.Code, rr.Body.String())
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
	ctx := context.Background()
	svc := &core.Service{
		Store:   st,
		Analyze: analyzeClient,
		Logf:    t.Logf,
	}
	h := New(st, svc, config.Config{MaxUploadMB: 25})

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
	requiredBuiltins := []string{"Tech Stack Evaluator", "Competitor Comparison", "Fact & Claim Checker", "Quick Executive Briefing"}
	for _, reqName := range requiredBuiltins {
		found := false
		for _, pb := range listResp.Playbooks {
			if pb.Name == reqName {
				found = true
				if len(pb.Steps) == 0 {
					t.Errorf("playbook %q steps is empty", reqName)
				}
				break
			}
		}
		if !found {
			t.Errorf("GET /api/v1/playbooks did not return %q", reqName)
		}
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
	if len(libResp.Templates) != 7 {
		t.Fatalf("expected 7 library templates, got %d", len(libResp.Templates))
	}
	// Verify general_analysis template is present
	foundGeneral := false
	for _, tpl := range libResp.Templates {
		if tpl.ID == "general_analysis" {
			foundGeneral = true
			if tpl.Heading != "General Analysis" || tpl.ToolPolicy != "search" {
				t.Errorf("unexpected general_analysis template config: %+v", tpl)
			}
		}
	}
	if !foundGeneral {
		t.Errorf("general_analysis template not found in library")
	}
}

func TestUserProfileSettings_RoundTripAndLengthValidation(t *testing.T) {
	st := newStubStore()
	h := webHandler(st, &core.Service{Store: st, Logf: t.Logf})

	// 1. Initial GET /api/v1/settings returns empty user_profile
	rrGet := doJSON(t, h, http.MethodGet, "/api/v1/settings", "")
	if rrGet.Code != http.StatusOK {
		t.Fatalf("GET /api/v1/settings failed: %d", rrGet.Code)
	}
	var getResp struct {
		Settings struct {
			UserProfile port.UserProfile `json:"user_profile"`
		} `json:"settings"`
	}
	if err := json.Unmarshal(rrGet.Body.Bytes(), &getResp); err != nil {
		t.Fatalf("unmarshal GET settings: %v", err)
	}
	if !getResp.Settings.UserProfile.IsEmpty() {
		t.Fatalf("expected empty user_profile initially, got: %+v", getResp.Settings.UserProfile)
	}

	// 2. PATCH /api/v1/settings with valid user_profile
	patchBody := `{
		"user_profile": {
			"goals": "Run self-hosted media apps on NAS",
			"skills": ["Go", "Docker", "Linux"],
			"stack": ["Postgres", "n8n", "Traefik"],
			"interests": ["Homelab", "Automation"],
			"constraints": "2 hours/week, low budget",
			"language": "Spanish"
		}
	}`
	rrPatch := doJSON(t, h, http.MethodPatch, "/api/v1/settings", patchBody)
	if rrPatch.Code != http.StatusOK {
		t.Fatalf("PATCH /api/v1/settings failed: %d: %s", rrPatch.Code, rrPatch.Body.String())
	}

	// 3. GET /api/v1/settings returns the saved profile
	rrGet2 := doJSON(t, h, http.MethodGet, "/api/v1/settings", "")
	if rrGet2.Code != http.StatusOK {
		t.Fatalf("GET 2 /api/v1/settings failed: %d", rrGet2.Code)
	}
	var getResp2 struct {
		Settings struct {
			UserProfile port.UserProfile `json:"user_profile"`
		} `json:"settings"`
	}
	if err := json.Unmarshal(rrGet2.Body.Bytes(), &getResp2); err != nil {
		t.Fatalf("unmarshal GET 2 settings: %v", err)
	}
	p := getResp2.Settings.UserProfile
	if p.Goals != "Run self-hosted media apps on NAS" {
		t.Errorf("expected goals to match, got %q", p.Goals)
	}
	if len(p.Skills) != 3 || p.Skills[0] != "Go" {
		t.Errorf("skills mismatch: %v", p.Skills)
	}
	if len(p.Stack) != 3 || p.Stack[1] != "n8n" {
		t.Errorf("stack mismatch: %v", p.Stack)
	}
	if p.Language != "Spanish" {
		t.Errorf("language mismatch: %q", p.Language)
	}

	// 4. PATCH /api/v1/settings with profile exceeding 1,500 chars -> HTTP 400 Bad Request
	longGoals := strings.Repeat("A", 1600)
	tooLongBody := fmt.Sprintf(`{"user_profile":{"goals":%q}}`, longGoals)
	rrTooLong := doJSON(t, h, http.MethodPatch, "/api/v1/settings", tooLongBody)
	if rrTooLong.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for oversized profile, got %d: %s", rrTooLong.Code, rrTooLong.Body.String())
	}
	if !strings.Contains(rrTooLong.Body.String(), "1,500 characters") {
		t.Errorf("expected error message to mention '1,500 characters', got: %s", rrTooLong.Body.String())
	}
}

func TestCardTypesSettings_RoundTripAndValidation(t *testing.T) {
	st := newStubStore()
	h := webHandler(st, &core.Service{Store: st, Logf: t.Logf})

	// 1. Initial GET /api/v1/settings returns default card_types
	rrGet := doJSON(t, h, http.MethodGet, "/api/v1/settings", "")
	if rrGet.Code != http.StatusOK {
		t.Fatalf("GET /api/v1/settings failed: %d", rrGet.Code)
	}
	var getResp struct {
		Settings struct {
			CardTypes []string `json:"card_types"`
		} `json:"settings"`
	}
	if err := json.Unmarshal(rrGet.Body.Bytes(), &getResp); err != nil {
		t.Fatalf("unmarshal GET settings: %v", err)
	}
	expectedDefaults := []string{"article", "video", "book", "guide", "product", "place", "idea", "quote"}
	if len(getResp.Settings.CardTypes) != len(expectedDefaults) {
		t.Fatalf("expected %d default card_types, got %d: %v", len(expectedDefaults), len(getResp.Settings.CardTypes), getResp.Settings.CardTypes)
	}
	for i, v := range expectedDefaults {
		if getResp.Settings.CardTypes[i] != v {
			t.Errorf("at index %d: expected %q, got %q", i, v, getResp.Settings.CardTypes[i])
		}
	}

	// 2. PATCH /api/v1/settings with valid card_types (trim, lowercase, deduplicate, filter 'other')
	patchBody := `{
		"card_types": ["  Tool ", "PRODUCT", "tool", "RESEARCH", "  ", "other", "OTHER"]
	}`
	rrPatch := doJSON(t, h, http.MethodPatch, "/api/v1/settings", patchBody)
	if rrPatch.Code != http.StatusOK {
		t.Fatalf("PATCH /api/v1/settings failed: %d: %s", rrPatch.Code, rrPatch.Body.String())
	}

	// Verify GET returns cleaned list: ["tool", "product", "research"]
	rrGet2 := doJSON(t, h, http.MethodGet, "/api/v1/settings", "")
	if rrGet2.Code != http.StatusOK {
		t.Fatalf("GET /api/v1/settings failed: %d", rrGet2.Code)
	}
	var getResp2 struct {
		Settings struct {
			CardTypes []string `json:"card_types"`
		} `json:"settings"`
	}
	if err := json.Unmarshal(rrGet2.Body.Bytes(), &getResp2); err != nil {
		t.Fatalf("unmarshal GET settings: %v", err)
	}
	expectedCleaned := []string{"tool", "product", "research"}
	if len(getResp2.Settings.CardTypes) != len(expectedCleaned) {
		t.Fatalf("expected %d card_types, got %d: %v", len(expectedCleaned), len(getResp2.Settings.CardTypes), getResp2.Settings.CardTypes)
	}
	for i, v := range expectedCleaned {
		if getResp2.Settings.CardTypes[i] != v {
			t.Errorf("at index %d: expected %q, got %q", i, v, getResp2.Settings.CardTypes[i])
		}
	}

	// 3. PATCH /api/v1/settings with > 20 entries is rejected (400)
	var tooMany []string
	for i := 1; i <= 21; i++ {
		tooMany = append(tooMany, fmt.Sprintf("type%d", i))
	}
	tooManyBytes, _ := json.Marshal(map[string]any{"card_types": tooMany})
	rrTooMany := doJSON(t, h, http.MethodPatch, "/api/v1/settings", string(tooManyBytes))
	if rrTooMany.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for > 20 card_types, got %d: %s", rrTooMany.Code, rrTooMany.Body.String())
	}
	if !strings.Contains(rrTooMany.Body.String(), "max") && !strings.Contains(rrTooMany.Body.String(), "20") {
		t.Errorf("expected error message to mention max/20, got: %s", rrTooMany.Body.String())
	}
}

func TestPlaybookCustomManagement(t *testing.T) {
	st := newStubStore()
	ctx := context.Background()

	h := webHandler(st, &core.Service{Store: st, Runner: &research.Runner{ClipChars: 100}, Logf: t.Logf})

	validCustomPB := `{
		"name": "Custom Playbook",
		"description": "Custom playbook",
		"steps": [
			{"position": 1, "kind": "ground", "name": "Ground", "enabled": true},
			{"position": 2, "kind": "report", "name": "Report", "enabled": true}
		]
	}`

	// Create succeeds: custom playbooks are always available.
	rrCreate := doJSON(t, h, http.MethodPost, "/api/v1/playbooks", validCustomPB)
	if rrCreate.Code != http.StatusCreated {
		t.Fatalf("expected 201 for create playbook, got %d: %s", rrCreate.Code, rrCreate.Body.String())
	}

	// Duplicate succeeds.
	rrDup := doJSON(t, h, http.MethodPost, "/api/v1/playbooks/1/duplicate", "")
	if rrDup.Code != http.StatusCreated {
		t.Fatalf("expected 201 for duplicate playbook, got %d", rrDup.Code)
	}

	// Update builtin playbook 1 fails with 403 (built-in playbooks are immutable).
	rrUpd := doJSON(t, h, http.MethodPut, "/api/v1/playbooks/1", validCustomPB)
	if rrUpd.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for updating builtin playbook, got %d", rrUpd.Code)
	}

	// Seed a custom playbook directly into the store.
	st.nextPb++
	customID := st.nextPb
	st.playbooks[customID] = port.Playbook{
		ID:        customID,
		Name:      "Legacy Custom Playbook",
		IsBuiltin: false,
		Steps: []port.PlaybookStep{
			{Position: 1, Kind: "ground", Name: "Ground", Enabled: true},
			{Position: 2, Kind: "report", Name: "Report", Enabled: true},
		},
	}

	// GET playbooks includes the custom entry.
	rrList := doJSON(t, h, http.MethodGet, "/api/v1/playbooks", "")
	if rrList.Code != http.StatusOK {
		t.Fatalf("expected 200 for GET playbooks, got %d", rrList.Code)
	}
	var listResp struct {
		Playbooks []port.Playbook `json:"playbooks"`
	}
	_ = json.Unmarshal(rrList.Body.Bytes(), &listResp)
	foundCustom := false
	for _, pb := range listResp.Playbooks {
		if pb.ID == customID {
			foundCustom = true
			break
		}
	}
	if !foundCustom {
		t.Errorf("expected custom playbook %d to be readable in list", customID)
	}

	// Trigger research with the custom playbook.
	card, _ := st.CreateCard(ctx, port.Card{Title: "AI Search Paper"})
	runCustomPayload := fmt.Sprintf(`{"card_id": %d, "playbook_id": %d}`, card.ID, customID)
	rrRunCustom := doJSON(t, h, http.MethodPost, "/api/v1/research", runCustomPayload)
	if rrRunCustom.Code != http.StatusOK {
		t.Fatalf("expected 200 for running custom playbook, got %d: %s", rrRunCustom.Code, rrRunCustom.Body.String())
	}

	// Trigger research without a playbook: uses the full default playbook.
	cardDef, _ := st.CreateCard(ctx, port.Card{Title: "AI Default Paper"})
	runDefPayload := fmt.Sprintf(`{"card_id": %d}`, cardDef.ID)
	rrRunDef := doJSON(t, h, http.MethodPost, "/api/v1/research", runDefPayload)
	if rrRunDef.Code != http.StatusOK {
		t.Fatalf("expected 200 for running default research, got %d: %s", rrRunDef.Code, rrRunDef.Body.String())
	}
	var runResp struct {
		OK       bool          `json:"ok"`
		Playbook port.Playbook `json:"playbook"`
	}
	_ = json.Unmarshal(rrRunDef.Body.Bytes(), &runResp)
	if len(runResp.Playbook.Steps) != 9 {
		t.Errorf("expected full default playbook with 9 steps, got %d steps", len(runResp.Playbook.Steps))
	}
}

func TestResearchFeedbackAPI(t *testing.T) {
	st := newStubStore()
	ctx := context.Background()
	svc := &core.Service{Store: st, Logf: t.Logf}
	h := webHandler(st, svc)

	// Seed research row
	res, err := st.CreateResearch(ctx, 42, "investigate vector db")
	if err != nil {
		t.Fatalf("CreateResearch: %v", err)
	}

	// 1. Submit valid thumbs_up feedback
	body := `{"rating": "thumbs_up", "comment": "Excellent synthesis with sources."}`
	rr := doJSON(t, h, http.MethodPost, fmt.Sprintf("/api/v1/research/%d/feedback", res.ID), body)
	if rr.Code != http.StatusOK {
		t.Fatalf("POST feedback: expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var resp struct {
		OK       bool          `json:"ok"`
		Research port.Research `json:"research"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal feedback response: %v", err)
	}
	if resp.Research.FeedbackRating == nil || *resp.Research.FeedbackRating != "thumbs_up" {
		t.Errorf("feedback_rating = %v, want thumbs_up", resp.Research.FeedbackRating)
	}
	if resp.Research.FeedbackComment == nil || *resp.Research.FeedbackComment != "Excellent synthesis with sources." {
		t.Errorf("feedback_comment = %v, want 'Excellent synthesis with sources.'", resp.Research.FeedbackComment)
	}

	// 2. Reject invalid rating
	badBody := `{"rating": "neutral"}`
	rrBad := doJSON(t, h, http.MethodPost, fmt.Sprintf("/api/v1/research/%d/feedback", res.ID), badBody)
	if rrBad.Code != http.StatusBadRequest {
		t.Fatalf("POST feedback with bad rating: expected 400, got %d", rrBad.Code)
	}
}

func TestPipelineMetricsAPI(t *testing.T) {
	st := newStubStore()
	svc := &core.Service{Store: st, Logf: t.Logf}
	h := webHandler(st, svc)

	rr := doJSON(t, h, http.MethodGet, "/api/v1/metrics/pipeline", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("GET /api/v1/metrics/pipeline: expected 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var resp struct {
		OK      bool                 `json:"ok"`
		Metrics port.PipelineMetrics `json:"metrics"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal metrics: %v", err)
	}
	if !resp.OK {
		t.Errorf("expected ok: true")
	}
}

func TestBatchAndScheduledResearchAPI(t *testing.T) {
	st := newStubStore()
	ctx := context.Background()

	c1, _ := st.CreateCard(ctx, port.Card{Title: "Card 1", Status: "inbox"})
	c2, _ := st.CreateCard(ctx, port.Card{Title: "Card 2", Status: "inbox"})

	// 1. First batch queues.
	commSvc := &core.Service{Store: st, Logf: t.Logf}
	commH := webHandler(st, commSvc)

	// Batch queue succeeds.
	batchPayload := fmt.Sprintf(`{"card_ids": [%d, %d]}`, c1.ID, c2.ID)
	rrBatchComm := doJSON(t, commH, http.MethodPost, "/api/v1/research/batch", batchPayload)
	if rrBatchComm.Code != http.StatusOK {
		t.Fatalf("batch: expected 200, got %d: %s", rrBatchComm.Code, rrBatchComm.Body.String())
	}
	var commBatchResp struct {
		OK     bool            `json:"ok"`
		Queued []port.Research `json:"queued"`
	}
	if err := json.Unmarshal(rrBatchComm.Body.Bytes(), &commBatchResp); err != nil {
		t.Fatalf("unmarshal batch response: %v", err)
	}
	if !commBatchResp.OK || len(commBatchResp.Queued) != 2 {
		t.Errorf("expected 2 queued research items, got %d", len(commBatchResp.Queued))
	}

	// 2. A second batch behaves the same.
	c3, _ := st.CreateCard(ctx, port.Card{Title: "Card 3", Status: "inbox"})
	c4, _ := st.CreateCard(ctx, port.Card{Title: "Card 4", Status: "inbox"})
	batchPayload2 := fmt.Sprintf(`{"card_ids": [%d, %d]}`, c3.ID, c4.ID)
	proSvc := &core.Service{Store: st, Logf: t.Logf}
	proH := webHandler(st, proSvc)

	// Batch queue succeeds
	rrBatch2 := doJSON(t, proH, http.MethodPost, "/api/v1/research/batch", batchPayload2)
	if rrBatch2.Code != http.StatusOK {
		t.Fatalf("batch: expected 200, got %d: %s", rrBatch2.Code, rrBatch2.Body.String())
	}
	var batchResp struct {
		OK     bool            `json:"ok"`
		Queued []port.Research `json:"queued"`
	}
	if err := json.Unmarshal(rrBatch2.Body.Bytes(), &batchResp); err != nil {
		t.Fatalf("unmarshal batch response: %v", err)
	}
	if !batchResp.OK || len(batchResp.Queued) != 2 {
		t.Errorf("expected 2 queued research items, got %d", len(batchResp.Queued))
	}

	// Create rule
	ruleBody := `{
		"id": "rule-nightly",
		"name": "Nightly High Priority",
		"time": "02:00",
		"enabled": true,
		"filters": {
			"status": "inbox",
			"worthiness": "high"
		},
		"max_cards": 5
	}`
	rrCreateRule := doJSON(t, proH, http.MethodPost, "/api/v1/research/rules", ruleBody)
	if rrCreateRule.Code != http.StatusCreated {
		t.Fatalf("create rule: expected 201, got %d: %s", rrCreateRule.Code, rrCreateRule.Body.String())
	}

	// List rules
	rrListRules := doJSON(t, proH, http.MethodGet, "/api/v1/research/rules", "")
	if rrListRules.Code != http.StatusOK {
		t.Fatalf("list rules: expected 200, got %d", rrListRules.Code)
	}
	var listResp struct {
		OK    bool                `json:"ok"`
		Rules []port.ResearchRule `json:"rules"`
	}
	_ = json.Unmarshal(rrListRules.Body.Bytes(), &listResp)
	if len(listResp.Rules) != 1 || listResp.Rules[0].ID != "rule-nightly" {
		t.Errorf("expected rule-nightly in rules list, got: %+v", listResp.Rules)
	}

	// Update rule
	ruleUpdateBody := `{
		"name": "Nightly High Priority Updated",
		"time": "03:00",
		"enabled": false,
		"filters": {
			"status": "inbox"
		},
		"max_cards": 10
	}`
	rrUpdateRule := doJSON(t, proH, http.MethodPut, "/api/v1/research/rules/rule-nightly", ruleUpdateBody)
	if rrUpdateRule.Code != http.StatusOK {
		t.Fatalf("update rule: expected 200, got %d", rrUpdateRule.Code)
	}

	// Run rule manually
	rrRunRule := doJSON(t, proH, http.MethodPost, "/api/v1/research/rules/rule-nightly/run", "")
	if rrRunRule.Code != http.StatusOK {
		t.Fatalf("run rule: expected 200, got %d: %s", rrRunRule.Code, rrRunRule.Body.String())
	}

	// Delete rule
	rrDelRule := doJSON(t, proH, http.MethodDelete, "/api/v1/research/rules/rule-nightly", "")
	if rrDelRule.Code != http.StatusOK {
		t.Fatalf("delete rule: expected 200, got %d", rrDelRule.Code)
	}

	// Quiet window
	qwBody := `{"enabled": true, "start": "23:00", "end": "07:00"}`
	rrSetQW := doJSON(t, proH, http.MethodPut, "/api/v1/research/quiet-window", qwBody)
	if rrSetQW.Code != http.StatusOK {
		t.Fatalf("set quiet window: expected 200, got %d: %s", rrSetQW.Code, rrSetQW.Body.String())
	}

	rrGetQW := doJSON(t, proH, http.MethodGet, "/api/v1/research/quiet-window", "")
	if rrGetQW.Code != http.StatusOK {
		t.Fatalf("get quiet window: expected 200, got %d: %s", rrGetQW.Code, rrGetQW.Body.String())
	}
	var qwResp struct {
		OK      bool   `json:"ok"`
		Enabled bool   `json:"enabled"`
		Start   string `json:"start"`
		End     string `json:"end"`
	}
	_ = json.Unmarshal(rrGetQW.Body.Bytes(), &qwResp)
	if !qwResp.Enabled || qwResp.Start != "23:00" || qwResp.End != "07:00" {
		t.Errorf("quiet window response mismatch: %+v", qwResp)
	}
}

type stubChannel struct{}

func (s *stubChannel) Notify(_ context.Context, _ port.Notification) error {
	return nil
}

func TestChannelEndpoints(t *testing.T) {
	st := newStubStore()
	svc := &core.Service{Store: st, Logf: t.Logf}
	h := webHandler(st, svc)

	// 1. List channels
	rr := doJSON(t, h, http.MethodGet, "/api/v1/channels", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("GET /api/v1/channels: expected 200, got %d", rr.Code)
	}
	var resp struct {
		OK       bool             `json:"ok"`
		Channels []map[string]any `json:"channels"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil || !resp.OK {
		t.Fatalf("failed to decode channels response: %v", err)
	}
	if len(resp.Channels) != 4 {
		t.Fatalf("expected 4 channels, got %d", len(resp.Channels))
	}

	// 2. OpenClaw Webhook without a configured hook token fails closed.
	ocPayload := `{"channel":"whatsapp","sender":"+1555123","text":"/short 1"}`
	rrOC := doJSON(t, h, http.MethodPost, "/api/v1/channels/openclaw/webhook", ocPayload)
	if rrOC.Code != http.StatusUnauthorized {
		t.Fatalf("POST /api/v1/channels/openclaw/webhook: expected 401, got %d: %s", rrOC.Code, rrOC.Body.String())
	}

	// 3. Discord Interactions with no configured adapter has nothing to authenticate against.
	dcPing := `{"type": 1}`
	rrDC := doJSON(t, h, http.MethodPost, "/api/v1/channels/discord/interactions", dcPing)
	if rrDC.Code != http.StatusServiceUnavailable {
		t.Fatalf("POST /api/v1/channels/discord/interactions: expected 503, got %d", rrDC.Code)
	}

	// 4. Test channel notification
	hub := &stubChannel{}
	svc.Channel = hub
	rrTest := doJSON(t, h, http.MethodPost, "/api/v1/channels/telegram/test", "")
	if rrTest.Code != http.StatusOK {
		t.Fatalf("POST /api/v1/channels/telegram/test: expected 200, got %d: %s", rrTest.Code, rrTest.Body.String())
	}

	// 5. Digest push
	rrDigest := doJSON(t, h, http.MethodPost, "/api/v1/digest/push?channel=telegram", "")
	if rrDigest.Code != http.StatusOK {
		t.Fatalf("POST /api/v1/digest/push: expected 200, got %d: %s", rrDigest.Code, rrDigest.Body.String())
	}
}

func TestDiscordInteractionsRequiresConfiguredAdapter(t *testing.T) {
	st := newStubStore()
	svc := &core.Service{Store: st, Logf: t.Logf}
	h := webHandler(st, svc)

	rr := doJSON(t, h, http.MethodPost, "/api/v1/channels/discord/interactions", `{"type":1}`)
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 Service Unavailable, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestPatchSettings_HotReloadsChannels(t *testing.T) {
	st := newStubStore()
	hub := channel.NewHub(t.Logf)
	svc := &core.Service{
		Store:   st,
		Hub:     hub,
		Channel: hub,
		Logf:    t.Logf,
	}
	h := webHandler(st, svc)

	// 1. Initial state: no adapters
	if len(hub.Adapters()) != 0 {
		t.Fatalf("expected 0 adapters initially, got %d", len(hub.Adapters()))
	}

	// 2. Patch discord credentials via API
	patchDC := `{"discord_token":"bot-tok","discord_channel_id":"998877"}`
	rrDC := doJSON(t, h, http.MethodPatch, "/api/v1/settings", patchDC)
	if rrDC.Code != http.StatusOK {
		t.Fatalf("PATCH discord settings: expected 200, got %d: %s", rrDC.Code, rrDC.Body.String())
	}
	if _, ok := hub.Get("discord"); !ok {
		t.Fatalf("expected discord adapter to be registered in svc.Hub")
	}

	// 3. Patch slack credentials via API
	patchSlack := `{"slack_webhook_url":"https://hooks.slack.com/test"}`
	rrSlack := doJSON(t, h, http.MethodPatch, "/api/v1/settings", patchSlack)
	if rrSlack.Code != http.StatusOK {
		t.Fatalf("PATCH slack settings: expected 200, got %d: %s", rrSlack.Code, rrSlack.Body.String())
	}
	if _, ok := hub.Get("slack"); !ok {
		t.Fatalf("expected slack adapter to be registered in svc.Hub")
	}

	// 4. Clear discord credentials via API -> should hot-reload and unregister from hub
	clearDC := `{"discord_token":""}`
	rrClearDC := doJSON(t, h, http.MethodPatch, "/api/v1/settings", clearDC)
	if rrClearDC.Code != http.StatusOK {
		t.Fatalf("PATCH clear discord settings: expected 200, got %d: %s", rrClearDC.Code, rrClearDC.Body.String())
	}
	if _, ok := hub.Get("discord"); ok {
		t.Fatalf("expected discord adapter to be unregistered from svc.Hub")
	}
	if _, ok := hub.Get("slack"); !ok {
		t.Fatalf("expected slack adapter to remain registered in svc.Hub")
	}
}

func TestAuthBcryptZeroLockoutAndAPIToken(t *testing.T) {
	ctx := context.Background()
	st := newStubStore()
	// Seed existing legacy plaintext passphrase
	if err := st.SetSetting(ctx, "auth_token", "my-legacy-passphrase"); err != nil {
		t.Fatalf("set setting: %v", err)
	}

	h := New(st, &core.Service{Logf: t.Logf}, config.Config{MaxUploadMB: 25})

	// 1. Unauthenticated request to private endpoint fails
	rUnauth := httptest.NewRequest(http.MethodGet, "/api/v1/cards", nil)
	rrUnauth := httptest.NewRecorder()
	h.ServeHTTP(rrUnauth, rUnauth)
	if rrUnauth.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated: status = %d, want 401", rrUnauth.Code)
	}

	// 2. Verify with legacy passphrase: works and sets HttpOnly cookie
	rrVerify := doJSON(t, h, http.MethodPost, "/api/v1/auth/verify", `{"token":"my-legacy-passphrase"}`)
	if rrVerify.Code != http.StatusOK {
		t.Fatalf("verify status = %d, want 200 (body: %s)", rrVerify.Code, rrVerify.Body.String())
	}
	cookies := rrVerify.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != authCookie || !cookies[0].HttpOnly {
		t.Fatalf("expected 1 HttpOnly auth cookie, got %+v", cookies)
	}
	// The cookie must be an opaque session token, not the passphrase itself.
	if cookies[0].Value == "my-legacy-passphrase" || cookies[0].Value == "" {
		t.Fatalf("cookie value = %q, want a random session token (not the passphrase)", cookies[0].Value)
	}

	// 2b. The issued session cookie authorizes a subsequent private request.
	rCookie := httptest.NewRequest(http.MethodGet, "/api/v1/cards", nil)
	rCookie.AddCookie(&http.Cookie{Name: authCookie, Value: cookies[0].Value})
	rrCookie := httptest.NewRecorder()
	h.ServeHTTP(rrCookie, rCookie)
	if rrCookie.Code != http.StatusOK {
		t.Fatalf("session cookie auth: status = %d, want 200 (body: %s)", rrCookie.Code, rrCookie.Body.String())
	}

	// 3. Verify that DB automatically upgraded to bcrypt hash (zero lockout)
	newHash, err := st.GetSetting(ctx, "auth_token")
	if err != nil {
		t.Fatalf("get auth_token: %v", err)
	}
	if !strings.HasPrefix(newHash, "$2a$") && !strings.HasPrefix(newHash, "$2b$") {
		t.Fatalf("expected auth_token to be auto-upgraded to bcrypt hash, got %q", newHash)
	}

	// 4. Authenticated request with the passphrase succeeds against bcrypt hash
	rAuth := httptest.NewRequest(http.MethodGet, "/api/v1/cards", nil)
	rAuth.Header.Set("Authorization", "Bearer my-legacy-passphrase")
	rrAuth := httptest.NewRecorder()
	h.ServeHTTP(rrAuth, rAuth)
	if rrAuth.Code != http.StatusOK {
		t.Fatalf("bearer auth with passphrase: status = %d, want 200", rrAuth.Code)
	}

	// 5. Test static API token (for external tools / CLI)
	if err := st.SetSetting(ctx, "api_token", "sk_live_test_12345"); err != nil {
		t.Fatalf("set api_token: %v", err)
	}
	rAPI := httptest.NewRequest(http.MethodGet, "/api/v1/cards", nil)
	rAPI.Header.Set("Authorization", "Bearer sk_live_test_12345")
	rrAPI := httptest.NewRecorder()
	h.ServeHTTP(rrAPI, rAPI)
	if rrAPI.Code != http.StatusOK {
		t.Fatalf("bearer auth with api_token: status = %d, want 200", rrAPI.Code)
	}

	// 6. Invalid token is refused
	rBad := httptest.NewRequest(http.MethodGet, "/api/v1/cards", nil)
	rBad.Header.Set("Authorization", "Bearer invalid-token")
	rrBad := httptest.NewRecorder()
	h.ServeHTTP(rrBad, rBad)
	if rrBad.Code != http.StatusUnauthorized {
		t.Fatalf("bad token: status = %d, want 401", rrBad.Code)
	}
}

// TestValidateTokenRechecksCredential proves successful credentials are not
// cached: an out-of-band passphrase change revokes the old one on the next
// request without recreating the api struct.
func TestValidateTokenRechecksCredential(t *testing.T) {
	ctx := context.Background()
	st := newStubStore()
	if err := st.SetSetting(ctx, "auth_token", "pass-A"); err != nil {
		t.Fatalf("set auth_token: %v", err)
	}

	h := New(st, &core.Service{Logf: t.Logf}, config.Config{MaxUploadMB: 25})

	auth := func(pass string) int {
		r := httptest.NewRequest(http.MethodGet, "/api/v1/cards", nil)
		r.Header.Set("Authorization", "Bearer "+pass)
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, r)
		return rr.Code
	}

	if code := auth("pass-A"); code != http.StatusOK {
		t.Fatalf("pass-A before change: status = %d, want 200", code)
	}

	// Simulate `sparkkeep auth set-passphrase pass-B` running in another process.
	hash, err := bcrypt.GenerateFromPassword([]byte("pass-B"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("bcrypt: %v", err)
	}
	if err := st.SetSetting(ctx, "auth_token", string(hash)); err != nil {
		t.Fatalf("update auth_token: %v", err)
	}

	if code := auth("pass-A"); code != http.StatusUnauthorized {
		t.Fatalf("pass-A after out-of-band change: status = %d, want 401 (credential must be re-verified)", code)
	}
	if code := auth("pass-B"); code != http.StatusOK {
		t.Fatalf("pass-B after change: status = %d, want 200", code)
	}
}

// TestSetupStatusHasAuthWithAPITokenOnly covers an api_token-only deployment,
// which must report has_auth (not just a stored auth_token).
func TestSetupStatusHasAuthWithAPITokenOnly(t *testing.T) {
	ctx := context.Background()
	st := newStubStore()
	if err := st.SetSetting(ctx, "api_token", "sk_live_only"); err != nil {
		t.Fatalf("set api_token: %v", err)
	}
	h := New(st, &core.Service{Logf: t.Logf}, config.Config{MaxUploadMB: 25})

	rr := doJSON(t, h, http.MethodGet, "/api/v1/setup/status", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("setup/status code = %d, want 200", rr.Code)
	}
	var status struct {
		HasAuth bool `json:"has_auth"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &status); err != nil {
		t.Fatalf("unmarshal status: %v", err)
	}
	if !status.HasAuth {
		t.Fatalf("has_auth = false, want true for an api_token-only deployment")
	}
}

// TestSetupReturnsDurableTokenNotSession proves the setup response never echoes
// the ephemeral session token as the JSON credential.
func TestSetupReturnsDurableTokenNotSession(t *testing.T) {
	st := newStubStore()
	h := New(st, &core.Service{Logf: t.Logf}, config.Config{MaxUploadMB: 25, AuthToken: "env-tok"})

	// Setup is reachable with a valid credential once auth is configured.
	r := httptest.NewRequest(http.MethodPost, "/api/v1/setup", strings.NewReader(`{}`))
	r.Header.Set("Authorization", "Bearer env-tok")
	r.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, r)
	if rr.Code != http.StatusOK {
		t.Fatalf("setup: status = %d, want 200 (body %s)", rr.Code, rr.Body.String())
	}

	var body struct {
		OK    bool   `json:"ok"`
		Token string `json:"token"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("json: %v", err)
	}
	if body.Token != "env-tok" {
		t.Fatalf("setup token = %q, want the durable env token %q", body.Token, "env-tok")
	}

	cookies := rr.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != authCookie || cookies[0].Value == "env-tok" || cookies[0].Value == "" {
		t.Fatalf("setup cookie = %+v, want one non-empty session token distinct from the credential", cookies)
	}
}

// TestSetupRejectsLongPassphrase covers bcrypt's 72-byte limit: a passphrase
// that bcrypt would reject must be refused, never stored raw as auth_token.
func TestSetupRejectsLongPassphrase(t *testing.T) {
	ctx := context.Background()
	st := newStubStore()
	h := New(st, &core.Service{Logf: t.Logf}, config.Config{MaxUploadMB: 25})

	long := strings.Repeat("a", 73)
	rr := doJSON(t, h, http.MethodPost, "/api/v1/setup", fmt.Sprintf(`{"auth_token":%q}`, long))
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("setup with 73-byte passphrase: status = %d, want 400 (body %s)", rr.Code, rr.Body.String())
	}
	val, _ := st.GetSetting(ctx, "auth_token")
	if val != "" || strings.HasPrefix(val, "$2") {
		t.Fatalf("auth_token changed on rejected setup: %q", val)
	}
}

// TestSetupAccepts72BytePassphrase proves the boundary still succeeds.
func TestSetupAccepts72BytePassphrase(t *testing.T) {
	ctx := context.Background()
	st := newStubStore()
	h := New(st, &core.Service{Logf: t.Logf}, config.Config{MaxUploadMB: 25})

	pass := strings.Repeat("a", 72)
	rr := doJSON(t, h, http.MethodPost, "/api/v1/setup", fmt.Sprintf(`{"auth_token":%q}`, pass))
	if rr.Code != http.StatusOK {
		t.Fatalf("setup with 72-byte passphrase: status = %d, want 200 (body %s)", rr.Code, rr.Body.String())
	}
	val, err := st.GetSetting(ctx, "auth_token")
	if err != nil || !strings.HasPrefix(val, "$2") {
		t.Fatalf("auth_token = %q (err %v), want a bcrypt hash", val, err)
	}
}

// TestPatchSettingsRejectsLongPassphrase covers the same limit on PATCH.
func TestPatchSettingsRejectsLongPassphrase(t *testing.T) {
	ctx := context.Background()
	st := newStubStore()
	h := New(st, &core.Service{Logf: t.Logf}, config.Config{MaxUploadMB: 25})

	long := strings.Repeat("a", 73)
	rr := doJSON(t, h, http.MethodPatch, "/api/v1/settings", fmt.Sprintf(`{"auth_token":%q}`, long))
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("patch with 73-byte passphrase: status = %d, want 400 (body %s)", rr.Code, rr.Body.String())
	}
	val, _ := st.GetSetting(ctx, "auth_token")
	if val != "" || strings.HasPrefix(val, "$2") {
		t.Fatalf("auth_token changed on rejected patch: %q", val)
	}
}

// TestSecurityHeaders asserts the four always-on hardening headers on a plain
// API response, and that HSTS only appears under the trusted TLS/proxy rule.
func TestSecurityHeaders(t *testing.T) {
	h := webHandler(newStubStore(), &core.Service{Logf: t.Logf})

	rr := doJSON(t, h, http.MethodGet, "/api/v1/health", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	want := map[string]string{
		"X-Content-Type-Options":  "nosniff",
		"Referrer-Policy":         "no-referrer",
		"X-Frame-Options":         "DENY",
		"Content-Security-Policy": csp,
	}
	for k, v := range want {
		if got := rr.Header().Get(k); got != v {
			t.Errorf("%s = %q, want %q", k, got, v)
		}
	}
	if got := rr.Header().Get("Strict-Transport-Security"); got != "" {
		t.Errorf("Strict-Transport-Security = %q without TLS, want absent", got)
	}

	// X-Forwarded-Proto: https is the same trusted signal the auth cookie uses.
	r := httptest.NewRequest(http.MethodGet, "/api/v1/health", nil)
	r.Header.Set("X-Forwarded-Proto", "https")
	rrHTTPS := httptest.NewRecorder()
	h.ServeHTTP(rrHTTPS, r)
	if got := rrHTTPS.Header().Get("Strict-Transport-Security"); got != "max-age=31536000" {
		t.Errorf("Strict-Transport-Security = %q with X-Forwarded-Proto: https, want max-age=31536000", got)
	}
}
