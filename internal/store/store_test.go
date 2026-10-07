package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"sparkkeep/internal/port"
)

func newTestStore(t *testing.T) (*Store, context.Context) {
	t.Helper()
	s, err := New(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s, context.Background()
}

func TestMigrate(t *testing.T) {
	s, _ := newTestStore(t)
	var version int
	if err := s.db.QueryRow(`SELECT MAX(version) FROM schema_version`).Scan(&version); err != nil {
		t.Fatalf("schema_version: %v", err)
	}
	if version != 12 {
		t.Fatalf("version = %d, want 12", version)
	}
	if _, err := s.db.Exec(`SELECT 1 FROM cards LIMIT 1`); err != nil {
		t.Fatalf("cards table: %v", err)
	}
	if _, err := s.db.Exec(`SELECT 1 FROM card_references LIMIT 1`); err != nil {
		t.Fatalf("card_references table: %v", err)
	}
}

func TestCreateAndGetCard(t *testing.T) {
	s, ctx := newTestStore(t)
	c, err := s.CreateCard(ctx, port.Card{
		Title:   "Idea",
		Summary: "Short",
		Horizon: port.HorizonLifetime,
		Tags:    []string{"trading", "ideas"},
	})
	if err != nil {
		t.Fatalf("CreateCard: %v", err)
	}
	if c.ID == 0 {
		t.Fatal("CreateCard: zero id")
	}
	got, err := s.GetCard(ctx, c.ID)
	if err != nil {
		t.Fatalf("GetCard: %v", err)
	}
	if got.Title != "Idea" || got.Horizon != port.HorizonLifetime {
		t.Fatalf("got %+v", got)
	}
	if len(got.Tags) != 2 {
		t.Fatalf("tags = %v, want 2", got.Tags)
	}
	if got.CreatedAt.IsZero() || !got.CreatedAt.Equal(got.UpdatedAt) {
		t.Fatalf("bad times: %+v", got)
	}
}

func TestCreateCardNotFound(t *testing.T) {
	s, ctx := newTestStore(t)
	_, err := s.GetCard(ctx, 999)
	if !errors.Is(err, port.ErrNotFound) {
		t.Fatalf("err = %v, want port.ErrNotFound", err)
	}
}

func TestListCardsFilter(t *testing.T) {
	s, ctx := newTestStore(t)
	short := []string{"alpha idea", "beta idea"}
	long := []string{"gamma vision"}
	for _, title := range append(short, long...) {
		h := port.HorizonShortTerm
		if title == "gamma vision" {
			h = port.HorizonLifetime
		}
		if _, err := s.CreateCard(ctx, port.Card{Title: title, Summary: "seed", Horizon: h}); err != nil {
			t.Fatalf("CreateCard: %v", err)
		}
	}
	cards, err := s.ListCards(ctx, port.CardFilter{Horizon: port.HorizonShortTerm})
	if err != nil {
		t.Fatalf("ListCards horizon: %v", err)
	}
	if len(cards) != 2 {
		t.Fatalf("horizon filter: got %d, want 2", len(cards))
	}

	alpha, err := s.ListCards(ctx, port.CardFilter{Query: "alpha"})
	if err != nil {
		t.Fatalf("ListCards query: %v", err)
	}
	if len(alpha) != 1 || alpha[0].Title != "alpha idea" {
		t.Fatalf("query filter: got %+v", alpha)
	}

	if err := s.SetCardTags(ctx, alpha[0].ID, []string{"trading"}); err != nil {
		t.Fatalf("SetCardTags: %v", err)
	}
	tagged, err := s.ListCards(ctx, port.CardFilter{Tag: "trading"})
	if err != nil {
		t.Fatalf("ListCards tag: %v", err)
	}
	if len(tagged) != 1 || tagged[0].ID != alpha[0].ID {
		t.Fatalf("tag filter: got %+v", tagged)
	}

	limited, err := s.ListCards(ctx, port.CardFilter{Limit: 2})
	if err != nil {
		t.Fatalf("ListCards limit: %v", err)
	}
	if len(limited) != 2 {
		t.Fatalf("limit: got %d, want 2", len(limited))
	}

	sincePast, err := s.ListCards(ctx, port.CardFilter{Since: time.Now().UTC().Add(-time.Hour)})
	if err != nil {
		t.Fatalf("ListCards since past: %v", err)
	}
	if len(sincePast) != 3 {
		t.Fatalf("since past: got %d, want 3", len(sincePast))
	}

	sinceFuture, err := s.ListCards(ctx, port.CardFilter{Since: time.Now().UTC().Add(time.Hour)})
	if err != nil {
		t.Fatalf("ListCards since future: %v", err)
	}
	if len(sinceFuture) != 0 {
		t.Fatalf("since future: got %d, want 0", len(sinceFuture))
	}
}

func TestListCardsStaleFilter(t *testing.T) {
	s, ctx := newTestStore(t)
	// Two cards backdated past the 30-day cutoff, two left fresh.
	var old []port.Card
	for _, title := range []string{"ancient", "older"} {
		c, err := s.CreateCard(ctx, port.Card{Title: title, Status: port.StatusInbox})
		if err != nil {
			t.Fatalf("CreateCard: %v", err)
		}
		old = append(old, c)
	}
	for _, title := range []string{"recent", "brand new"} {
		if _, err := s.CreateCard(ctx, port.Card{Title: title, Status: port.StatusInbox}); err != nil {
			t.Fatalf("CreateCard: %v", err)
		}
	}
	backdate := func(id int64, d time.Duration) {
		if _, err := s.db.Exec(`UPDATE cards SET updated_at = ? WHERE id = ?`,
			time.Now().UTC().Add(-d).Format(timeLayout), id); err != nil {
			t.Fatalf("backdate: %v", err)
		}
	}
	backdate(old[0].ID, 45*24*time.Hour)
	backdate(old[1].ID, 31*24*time.Hour)

	stale, err := s.ListCards(ctx, port.CardFilter{StaleDays: 30})
	if err != nil {
		t.Fatalf("ListCards stale: %v", err)
	}
	if len(stale) != 2 {
		t.Fatalf("stale_days=30 returned %d cards, want 2: %+v", len(stale), stale)
	}
	for _, c := range stale {
		if c.Title != "ancient" && c.Title != "older" {
			t.Fatalf("unexpected card in stale set: %q", c.Title)
		}
	}

	// The 31d card is stale at 7 days too; only the two untouched ones drop out.
	fresh, err := s.ListCards(ctx, port.CardFilter{StaleDays: 7})
	if err != nil {
		t.Fatalf("ListCards 7d: %v", err)
	}
	if len(fresh) != 2 {
		t.Fatalf("stale_days=7 returned %d cards, want 2", len(fresh))
	}

	none, err := s.ListCards(ctx, port.CardFilter{StaleDays: 400})
	if err != nil {
		t.Fatalf("ListCards 400d: %v", err)
	}
	if len(none) != 0 {
		t.Fatalf("stale_days=400 returned %d cards, want 0", len(none))
	}
}

func TestShelveStale(t *testing.T) {
	s, ctx := newTestStore(t)
	mk := func(title, status string, age time.Duration) port.Card {
		c, err := s.CreateCard(ctx, port.Card{Title: title, Status: status})
		if err != nil {
			t.Fatalf("CreateCard: %v", err)
		}
		if _, err := s.db.Exec(`UPDATE cards SET updated_at = ? WHERE id = ?`,
			time.Now().UTC().Add(-age).Format(timeLayout), c.ID); err != nil {
			t.Fatalf("backdate: %v", err)
		}
		return c
	}
	staleInbox := mk("stale inbox", port.StatusInbox, 40*24*time.Hour)
	staleDoing := mk("stale doing", port.StatusDoing, 60*24*time.Hour)
	freshInbox := mk("fresh inbox", port.StatusInbox, time.Hour)
	staleDone := mk("already done", port.StatusDone, 90*24*time.Hour)

	n, err := s.ShelveStale(ctx, 30)
	if err != nil {
		t.Fatalf("ShelveStale: %v", err)
	}
	if n != 2 {
		t.Fatalf("shelved %d cards, want 2", n)
	}
	for _, id := range []int64{staleInbox.ID, staleDoing.ID} {
		got, err := s.GetCard(ctx, id)
		if err != nil {
			t.Fatalf("GetCard: %v", err)
		}
		if got.Status != port.StatusShelved {
			t.Fatalf("card %d status = %q, want shelved", id, got.Status)
		}
	}
	for _, c := range []port.Card{freshInbox, staleDone} {
		got, err := s.GetCard(ctx, c.ID)
		if err != nil {
			t.Fatalf("GetCard: %v", err)
		}
		if got.Status != c.Status {
			t.Fatalf("card %q status = %q, want %q untouched", c.Title, got.Status, c.Status)
		}
	}

	// Shelfing bumps updated_at, so a second pass is a no-op.
	if n, err := s.ShelveStale(ctx, 30); err != nil || n != 0 {
		t.Fatalf("second pass: n=%d err=%v, want 0 nil", n, err)
	}
}

func TestUpdateCardPatch(t *testing.T) {
	s, ctx := newTestStore(t)
	c, err := s.CreateCard(ctx, port.Card{Title: "Idea", Summary: "s", SourceNote: "note"})
	if err != nil {
		t.Fatalf("CreateCard: %v", err)
	}
	status := port.StatusDoing
	got, err := s.UpdateCard(ctx, c.ID, port.CardPatch{Status: &status})
	if err != nil {
		t.Fatalf("UpdateCard: %v", err)
	}
	if got.Status != port.StatusDoing || got.Summary != "s" || got.Title != "Idea" || got.SourceNote != "note" {
		t.Fatalf("patch touched too much: %+v", got)
	}

	// Empty patch now returns the existing card unchanged
	got, err = s.UpdateCard(ctx, c.ID, port.CardPatch{})
	if err != nil {
		t.Fatalf("empty patch: err = %v, want nil", err)
	}
	if got.ID != c.ID || got.Title != "Idea" {
		t.Fatalf("empty patch returned wrong card: %+v", got)
	}
	_, err = s.UpdateCard(ctx, 999, port.CardPatch{Status: &status})
	if !errors.Is(err, port.ErrNotFound) {
		t.Fatalf("unknown id: err = %v, want port.ErrNotFound", err)
	}
}

func TestSetCardTagsReplace(t *testing.T) {
	s, ctx := newTestStore(t)
	c, err := s.CreateCard(ctx, port.Card{Title: "Idea"})
	if err != nil {
		t.Fatalf("CreateCard: %v", err)
	}
	if err := s.SetCardTags(ctx, c.ID, []string{"a", "b"}); err != nil {
		t.Fatalf("set A: %v", err)
	}
	if err := s.SetCardTags(ctx, c.ID, []string{"b", "c"}); err != nil {
		t.Fatalf("set B: %v", err)
	}
	got, err := s.GetCard(ctx, c.ID)
	if err != nil {
		t.Fatalf("GetCard: %v", err)
	}
	if len(got.Tags) != 2 {
		t.Fatalf("tags = %v, want exactly {b, c}", got.Tags)
	}
	for _, want := range []string{"b", "c"} {
		found := false
		for _, have := range got.Tags {
			if have == want {
				found = true
			}
		}
		if !found {
			t.Fatalf("missing tag %q in %v", want, got.Tags)
		}
	}
}

func TestListTagsCounts(t *testing.T) {
	s, ctx := newTestStore(t)
	for _, title := range []string{"one", "two", "three"} {
		c, err := s.CreateCard(ctx, port.Card{Title: title})
		if err != nil {
			t.Fatalf("CreateCard: %v", err)
		}
		if err := s.SetCardTags(ctx, c.ID, []string{"shared"}); err != nil {
			t.Fatalf("SetCardTags: %v", err)
		}
	}
	tags, err := s.ListTags(ctx)
	if err != nil {
		t.Fatalf("ListTags: %v", err)
	}
	if len(tags) != 1 || tags[0].Name != "shared" || tags[0].Count != 3 {
		t.Fatalf("tags = %+v, want [{shared 3}]", tags)
	}
}

func TestResearchCRUD(t *testing.T) {
	s, ctx := newTestStore(t)
	c, err := s.CreateCard(ctx, port.Card{Title: "Idea"})
	if err != nil {
		t.Fatalf("CreateCard: %v", err)
	}
	r, err := s.CreateResearch(ctx, c.ID, "how to do it")
	if err != nil {
		t.Fatalf("CreateResearch: %v", err)
	}
	if r.Status != "queued" || r.Query != "how to do it" {
		t.Fatalf("created: %+v", r)
	}
	nowTime := time.Now().Truncate(time.Second)
	step1 := port.ResearchStep{ID: "ground", Status: "done", StartedAt: nowTime, FinishedAt: nowTime, Note: "grounded"}
	src1 := port.Source{ID: "S1", URL: "https://example.com/1", Title: "Doc 1", Origin: "reference", ClippedText: "sample text", Questions: []string{"Q1"}}
	plan := &port.ResearchPlan{
		Questions: []port.ResearchQuestion{
			{ID: "Q1", Question: "What is it?", Query: "cli-fi reading list", PreferDomains: []string{"github.com"}},
		},
	}
	result := &port.ResearchResult{
		Claims: []port.ClaimVerdict{
			{Claim: "Claim 1", Status: "supported", Rationale: "Verified", Sources: []string{"S1"}},
		},
		Landscape: []port.LandscapeItem{
			{Name: "Alt 1", OneLiner: "Good alt", HowItDiffers: "Faster", Sources: []string{"S1"}},
		},
		Verdict: &port.ResearchVerdict{
			Recommendation:   "pursue",
			Confidence:       "high",
			NextActions:      []string{"step 1", "step 2", "step 3"},
			SuggestedHorizon: "short-term",
			SuggestedTags:    []string{"tech"},
		},
	}
	if err := s.UpdateResearchProgress(ctx, r.ID, "running", "refined query", []port.ResearchStep{step1}, []port.Source{src1}, plan, result, 150); err != nil {
		t.Fatalf("UpdateResearchProgress: %v", err)
	}

	progressGot, err := s.GetResearch(ctx, r.ID)
	if err != nil {
		t.Fatalf("GetResearch after progress: %v", err)
	}
	if progressGot.Status != "running" || progressGot.Query != "refined query" || len(progressGot.Steps) != 1 || len(progressGot.Sources) != 1 || progressGot.Tokens != 150 {
		t.Fatalf("unexpected progress got: %+v", progressGot)
	}
	if progressGot.Steps[0].ID != "ground" || progressGot.Sources[0].ID != "S1" || len(progressGot.Sources[0].Questions) != 1 {
		t.Fatalf("unexpected step/source content: %+v", progressGot)
	}
	if progressGot.Plan == nil || len(progressGot.Plan.Questions) != 1 || progressGot.Plan.Questions[0].ID != "Q1" {
		t.Fatalf("unexpected plan content: %+v", progressGot.Plan)
	}
	if progressGot.Result == nil || len(progressGot.Result.Claims) != 1 || progressGot.Result.Verdict == nil || progressGot.Result.Verdict.Recommendation != "pursue" {
		t.Fatalf("unexpected result content: %+v", progressGot.Result)
	}

	updated, err := s.SetResearch(ctx, r.ID, "done", "findings here", "")
	if err != nil {
		t.Fatalf("SetResearch: %v", err)
	}
	if updated.Status != "done" || updated.Findings != "findings here" || updated.Error != "" {
		t.Fatalf("updated: %+v", updated)
	}
	got, err := s.GetResearch(ctx, r.ID)
	if err != nil {
		t.Fatalf("GetResearch: %v", err)
	}
	if got.Status != "done" || len(got.Steps) != 1 || len(got.Sources) != 1 {
		t.Fatalf("got: %+v", got)
	}
	list, err := s.ListResearch(ctx)
	if err != nil {
		t.Fatalf("ListResearch: %v", err)
	}
	if len(list) != 1 || list[0].ID != r.ID || list[0].CardID != c.ID || len(list[0].Steps) != 1 {
		t.Fatalf("list: %+v", list)
	}
}

func TestGetCardBySourceURL(t *testing.T) {
	s, ctx := newTestStore(t)
	a, err := s.CreateCard(ctx, port.Card{Title: "A", SourceURL: "https://x.test/a"})
	if err != nil {
		t.Fatalf("CreateCard: %v", err)
	}
	b, err := s.CreateCard(ctx, port.Card{Title: "B", SourceURL: "https://x.test/b"})
	if err != nil {
		t.Fatalf("CreateCard: %v", err)
	}
	got, err := s.GetCardBySourceURL(ctx, " https://x.test/b ")
	if err != nil {
		t.Fatalf("GetCardBySourceURL: %v", err)
	}
	if got.ID != b.ID || got.Title != "B" {
		t.Fatalf("got %+v, want card B (%d)", got, b.ID)
	}
	if _, err := s.GetCardBySourceURL(ctx, "https://x.test/missing"); !errors.Is(err, port.ErrNotFound) {
		t.Fatalf("missing: err = %v, want ErrNotFound", err)
	}
	if _, err := s.GetCardBySourceURL(ctx, "  "); !errors.Is(err, port.ErrNotFound) {
		t.Fatalf("empty: err = %v, want ErrNotFound", err)
	}
	_ = a
}

func TestHasActiveResearch(t *testing.T) {
	s, ctx := newTestStore(t)
	c, err := s.CreateCard(ctx, port.Card{Title: "Idea"})
	if err != nil {
		t.Fatalf("CreateCard: %v", err)
	}
	if active, err := s.HasActiveResearch(ctx, c.ID); err != nil || active {
		t.Fatalf("no research: active=%v err=%v, want false nil", active, err)
	}
	r, err := s.CreateResearch(ctx, c.ID, "q")
	if err != nil {
		t.Fatalf("CreateResearch: %v", err)
	}
	if active, err := s.HasActiveResearch(ctx, c.ID); err != nil || !active {
		t.Fatalf("queued: active=%v err=%v, want true nil", active, err)
	}
	if _, err := s.SetResearch(ctx, r.ID, "done", "f", ""); err != nil {
		t.Fatalf("SetResearch done: %v", err)
	}
	if active, err := s.HasActiveResearch(ctx, c.ID); err != nil || active {
		t.Fatalf("done: active=%v err=%v, want false nil", active, err)
	}
	r2, err := s.CreateResearch(ctx, c.ID, "q2")
	if err != nil {
		t.Fatalf("CreateResearch 2: %v", err)
	}
	if _, err := s.SetResearch(ctx, r2.ID, "failed", "", "boom"); err != nil {
		t.Fatalf("SetResearch failed: %v", err)
	}
	if active, err := s.HasActiveResearch(ctx, c.ID); err != nil || active {
		t.Fatalf("failed: active=%v err=%v, want false nil", active, err)
	}
}

func TestCreateResearchBlockedWhileActive(t *testing.T) {
	s, ctx := newTestStore(t)
	c, err := s.CreateCard(ctx, port.Card{Title: "Idea"})
	if err != nil {
		t.Fatalf("CreateCard: %v", err)
	}
	r, err := s.CreateResearch(ctx, c.ID, "q")
	if err != nil {
		t.Fatalf("CreateResearch: %v", err)
	}
	if _, err := s.CreateResearch(ctx, c.ID, "q-again"); !errors.Is(err, port.ErrResearchActive) {
		t.Fatalf("second: err = %v, want ErrResearchActive", err)
	}
	if _, err := s.SetResearch(ctx, r.ID, "done", "f", ""); err != nil {
		t.Fatalf("SetResearch: %v", err)
	}
	if _, err := s.CreateResearch(ctx, c.ID, "q-after-done"); err != nil {
		t.Fatalf("after done: err = %v, want nil", err)
	}
}

func TestCloseDoubleClose(t *testing.T) {
	s, err := New(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if err := s.Close(); err != nil {
		t.Fatalf("first Close: %v", err)
	}
	if err := s.Close(); err != nil {
		t.Fatalf("second Close: %v", err)
	}
}

func TestCreateCardWithBriefing(t *testing.T) {
	s, ctx := newTestStore(t)
	c, err := s.CreateCard(ctx, port.Card{
		Title:            "Action Engine",
		Summary:          "A new system",
		Horizon:          port.HorizonShortTerm,
		ExecutiveSummary: "Sparkkeep v2 turns bookmarks into actions.",
		ValueProposition: "Eliminates read-it-later graveyards.",
		ProposedActions:  []string{"Review inbox", "Trigger research pass"},
		Tags:             []string{"productivity"},
	})
	if err != nil {
		t.Fatalf("CreateCard: %v", err)
	}
	got, err := s.GetCard(ctx, c.ID)
	if err != nil {
		t.Fatalf("GetCard: %v", err)
	}
	if got.ExecutiveSummary != "Sparkkeep v2 turns bookmarks into actions." {
		t.Errorf("ExecutiveSummary = %q", got.ExecutiveSummary)
	}
	if got.ValueProposition != "Eliminates read-it-later graveyards." {
		t.Errorf("ValueProposition = %q", got.ValueProposition)
	}
	if len(got.ProposedActions) != 2 || got.ProposedActions[0] != "Review inbox" || got.ProposedActions[1] != "Trigger research pass" {
		t.Errorf("ProposedActions = %+v", got.ProposedActions)
	}

	list, err := s.ListCards(ctx, port.CardFilter{Query: "bookmarks into actions"})
	if err != nil {
		t.Fatalf("ListCards: %v", err)
	}
	if len(list) != 1 || list[0].ID != c.ID {
		t.Errorf("ListCards search by executive summary failed: got %d cards", len(list))
	}
}

func TestUpdateCardBriefing(t *testing.T) {
	s, ctx := newTestStore(t)
	c, err := s.CreateCard(ctx, port.Card{
		Title:   "Draft",
		Summary: "Draft card",
		Horizon: port.HorizonShortTerm,
	})
	if err != nil {
		t.Fatalf("CreateCard: %v", err)
	}
	newExec := "Updated executive summary"
	newVal := "Updated value proposition"
	newActions := []string{"Step 1", "Step 2"}
	updated, err := s.UpdateCard(ctx, c.ID, port.CardPatch{
		ExecutiveSummary: &newExec,
		ValueProposition: &newVal,
		ProposedActions:  &newActions,
	})
	if err != nil {
		t.Fatalf("UpdateCard: %v", err)
	}
	if updated.ExecutiveSummary != newExec || updated.ValueProposition != newVal {
		t.Errorf("updated = %+v", updated)
	}
	if len(updated.ProposedActions) != 2 || updated.ProposedActions[1] != "Step 2" {
		t.Errorf("updated actions = %+v", updated.ProposedActions)
	}
}

func TestCreateCardWithEmptyTags(t *testing.T) {
	s, ctx := newTestStore(t)
	c, err := s.CreateCard(ctx, port.Card{
		Title:   "No Tags",
		Summary: "Card with empty tags",
		Tags:    []string{},
	})
	if err != nil {
		t.Fatalf("CreateCard: %v", err)
	}
	got, err := s.GetCard(ctx, c.ID)
	if err != nil {
		t.Fatalf("GetCard: %v", err)
	}
	if len(got.Tags) != 0 {
		t.Errorf("got tags = %v, want empty", got.Tags)
	}
}

func TestGetCardBySourceURL_NotFound(t *testing.T) {
	s, ctx := newTestStore(t)
	if _, err := s.GetCardBySourceURL(ctx, "https://nonexistent.test"); !errors.Is(err, port.ErrNotFound) {
		t.Fatalf("got err = %v, want port.ErrNotFound", err)
	}
}

func TestListCardsWithQueryFilter(t *testing.T) {
	s, ctx := newTestStore(t)
	_, err := s.CreateCard(ctx, port.Card{
		Title:   "Golang Microservices",
		Summary: "Building fast backends",
	})
	if err != nil {
		t.Fatalf("CreateCard: %v", err)
	}

	results, err := s.ListCards(ctx, port.CardFilter{Query: "GOLANG"})
	if err != nil {
		t.Fatalf("ListCards: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("got %d cards, want 1", len(results))
	}

	results, err = s.ListCards(ctx, port.CardFilter{Query: "backends"})
	if err != nil {
		t.Fatalf("ListCards: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("got %d cards, want 1", len(results))
	}
}

func TestUpdateCard_NotFound(t *testing.T) {
	s, ctx := newTestStore(t)
	note := "New Note"
	if _, err := s.UpdateCard(ctx, 999999, port.CardPatch{Note: &note}); !errors.Is(err, port.ErrNotFound) {
		t.Fatalf("got err = %v, want port.ErrNotFound", err)
	}
}

func TestCreateResearchDedup(t *testing.T) {
	s, ctx := newTestStore(t)
	c, err := s.CreateCard(ctx, port.Card{Title: "Card"})
	if err != nil {
		t.Fatalf("CreateCard: %v", err)
	}
	_, err = s.CreateResearch(ctx, c.ID, "query 1")
	if err != nil {
		t.Fatalf("CreateResearch: %v", err)
	}
	_, err = s.CreateResearch(ctx, c.ID, "query 2")
	if !errors.Is(err, port.ErrResearchActive) {
		t.Fatalf("got err = %v, want port.ErrResearchActive", err)
	}
}

func TestListCardsTagChunking(t *testing.T) {
	s, ctx := newTestStore(t)
	// Create multiple cards with tags to ensure chunked tag resolution works cleanly
	for i := 0; i < 15; i++ {
		_, err := s.CreateCard(ctx, port.Card{
			Title: fmt.Sprintf("Card %d", i),
			Tags:  []string{"chunk-test", fmt.Sprintf("tag-%d", i)},
		})
		if err != nil {
			t.Fatalf("CreateCard %d: %v", i, err)
		}
	}
	cards, err := s.ListCards(ctx, port.CardFilter{Limit: 20})
	if err != nil {
		t.Fatalf("ListCards: %v", err)
	}
	if len(cards) != 15 {
		t.Fatalf("got %d cards, want 15", len(cards))
	}
	for _, c := range cards {
		if len(c.Tags) != 2 {
			t.Fatalf("card %d (%s) expected 2 tags, got %d: %v", c.ID, c.Title, len(c.Tags), c.Tags)
		}
	}
}

func TestListCardsOffset(t *testing.T) {
	s, ctx := newTestStore(t)
	for i := 0; i < 10; i++ {
		_, err := s.CreateCard(ctx, port.Card{Title: fmt.Sprintf("Offset Card %d", i)})
		if err != nil {
			t.Fatalf("CreateCard %d: %v", i, err)
		}
	}
	page1, err := s.ListCards(ctx, port.CardFilter{Limit: 5, Offset: 0})
	if err != nil {
		t.Fatalf("page 1: %v", err)
	}
	if len(page1) != 5 {
		t.Fatalf("page 1 len = %d, want 5", len(page1))
	}
	page2, err := s.ListCards(ctx, port.CardFilter{Limit: 5, Offset: 5})
	if err != nil {
		t.Fatalf("page 2: %v", err)
	}
	if len(page2) != 5 {
		t.Fatalf("page 2 len = %d, want 5", len(page2))
	}
	// Verify no overlap
	for _, p1 := range page1 {
		for _, p2 := range page2 {
			if p1.ID == p2.ID {
				t.Fatalf("page 1 and page 2 contain duplicate card ID %d", p1.ID)
			}
		}
	}
}

func TestGetResearchFindings(t *testing.T) {
	s, ctx := newTestStore(t)
	c, err := s.CreateCard(ctx, port.Card{Title: "Research Findings Card"})
	if err != nil {
		t.Fatalf("CreateCard: %v", err)
	}
	r, err := s.CreateResearch(ctx, c.ID, "what is x?")
	if err != nil {
		t.Fatalf("CreateResearch: %v", err)
	}

	// Before findings are set, findings string should be empty
	findings, err := s.GetResearchFindings(ctx, r.ID)
	if err != nil {
		t.Fatalf("GetResearchFindings: %v", err)
	}
	if findings != "" {
		t.Fatalf("expected empty findings, got %q", findings)
	}

	// Update findings
	_, err = s.SetResearch(ctx, r.ID, "done", "Here are findings", "")
	if err != nil {
		t.Fatalf("SetResearch: %v", err)
	}

	findings, err = s.GetResearchFindings(ctx, r.ID)
	if err != nil {
		t.Fatalf("GetResearchFindings after set: %v", err)
	}
	if findings != "Here are findings" {
		t.Fatalf("expected 'Here are findings', got %q", findings)
	}

	// Non-existent research row
	_, err = s.GetResearchFindings(ctx, 999999)
	if !errors.Is(err, port.ErrNotFound) {
		t.Fatalf("expected ErrNotFound for missing research, got %v", err)
	}
}

func TestSettingsCRUD(t *testing.T) {
	s, ctx := newTestStore(t)

	// Initially missing
	_, err := s.GetSetting(ctx, "llm_key")
	if !errors.Is(err, port.ErrNotFound) {
		t.Fatalf("expected ErrNotFound for missing setting, got %v", err)
	}

	// Insert setting
	if err := s.SetSetting(ctx, "llm_key", "sk-test-12345"); err != nil {
		t.Fatalf("SetSetting: %v", err)
	}

	val, err := s.GetSetting(ctx, "llm_key")
	if err != nil {
		t.Fatalf("GetSetting: %v", err)
	}
	if val != "sk-test-12345" {
		t.Fatalf("got val = %q, want %q", val, "sk-test-12345")
	}

	// Update setting
	if err := s.SetSetting(ctx, "llm_key", "sk-updated-99999"); err != nil {
		t.Fatalf("SetSetting update: %v", err)
	}
	val, err = s.GetSetting(ctx, "llm_key")
	if err != nil {
		t.Fatalf("GetSetting updated: %v", err)
	}
	if val != "sk-updated-99999" {
		t.Fatalf("got val = %q, want %q", val, "sk-updated-99999")
	}

	// Add second setting and list
	if err := s.SetSetting(ctx, "auth_token", "super-secret"); err != nil {
		t.Fatalf("SetSetting auth_token: %v", err)
	}
	all, err := s.ListSettings(ctx)
	if err != nil {
		t.Fatalf("ListSettings: %v", err)
	}
	if len(all) != 2 || all["auth_token"] != "super-secret" || all["llm_key"] != "sk-updated-99999" {
		t.Fatalf("unexpected settings map: %+v", all)
	}
}

func TestCaptureCRUD(t *testing.T) {
	s, ctx := newTestStore(t)
	c, err := s.CreateCapture(ctx, port.Capture{
		Kind:        "link",
		SourceURL:   "https://example.com/post",
		Title:       "Post Title",
		Description: "Post Description",
		Text:        "Extracted article text",
		Caption:     "User caption",
		Transcript:  "Audio transcript",
		ImageDigest: "Image summary",
		Notes:       []string{"warning 1", "warning 2"},
	})
	if err != nil {
		t.Fatalf("CreateCapture: %v", err)
	}
	if c.ID <= 0 {
		t.Fatalf("CreateCapture returned non-positive ID: %d", c.ID)
	}
	if c.CreatedAt.IsZero() {
		t.Fatalf("CreateCapture zero CreatedAt")
	}

	got, err := s.GetCapture(ctx, c.ID)
	if err != nil {
		t.Fatalf("GetCapture: %v", err)
	}
	if got.ID != c.ID || got.Kind != "link" || got.SourceURL != "https://example.com/post" ||
		got.Title != "Post Title" || got.Description != "Post Description" ||
		got.Text != "Extracted article text" || got.Caption != "User caption" ||
		got.Transcript != "Audio transcript" || got.ImageDigest != "Image summary" {
		t.Fatalf("GetCapture fields mismatch: %+v", got)
	}
	if len(got.Notes) != 2 || got.Notes[0] != "warning 1" || got.Notes[1] != "warning 2" {
		t.Fatalf("GetCapture notes = %v, want 2 notes", got.Notes)
	}

	// Lookup by URL with whitespace
	byURL, err := s.GetCaptureBySourceURL(ctx, " https://example.com/post ")
	if err != nil {
		t.Fatalf("GetCaptureBySourceURL: %v", err)
	}
	if byURL.ID != c.ID {
		t.Fatalf("GetCaptureBySourceURL got id %d, want %d", byURL.ID, c.ID)
	}

	// Not found
	if _, err := s.GetCapture(ctx, 999999); !errors.Is(err, port.ErrNotFound) {
		t.Fatalf("GetCapture missing err = %v, want port.ErrNotFound", err)
	}
	if _, err := s.GetCaptureBySourceURL(ctx, "https://example.com/missing"); !errors.Is(err, port.ErrNotFound) {
		t.Fatalf("GetCaptureBySourceURL missing err = %v, want port.ErrNotFound", err)
	}
	if _, err := s.GetCaptureBySourceURL(ctx, "   "); !errors.Is(err, port.ErrNotFound) {
		t.Fatalf("GetCaptureBySourceURL whitespace err = %v, want port.ErrNotFound", err)
	}
}

func TestUpdateCapture(t *testing.T) {
	s, ctx := newTestStore(t)
	c, err := s.CreateCapture(ctx, port.Capture{
		Kind:      "link",
		SourceURL: "https://example.com/to-update",
		Title:     "Old Title",
	})
	if err != nil {
		t.Fatalf("CreateCapture: %v", err)
	}

	c.Title = "Updated Title"
	c.Text = "Updated Page Text"
	c.Notes = []string{"note1"}
	updated, err := s.UpdateCapture(ctx, c)
	if err != nil {
		t.Fatalf("UpdateCapture: %v", err)
	}
	if updated.Title != "Updated Title" || updated.Text != "Updated Page Text" {
		t.Fatalf("UpdateCapture mismatch: %+v", updated)
	}
	if len(updated.Notes) != 1 || updated.Notes[0] != "note1" {
		t.Fatalf("UpdateCapture notes: %+v", updated.Notes)
	}

	// Not found
	_, err = s.UpdateCapture(ctx, port.Capture{ID: 999999})
	if !errors.Is(err, port.ErrNotFound) {
		t.Fatalf("UpdateCapture missing err = %v, want port.ErrNotFound", err)
	}
}

func TestCaptureUniqueByURL(t *testing.T) {
	s, ctx := newTestStore(t)
	_, err := s.CreateCapture(ctx, port.Capture{
		Kind:      "link",
		SourceURL: "https://example.com/duplicate-test",
		Title:     "First",
	})
	if err != nil {
		t.Fatalf("first CreateCapture: %v", err)
	}

	// Duplicate URL should conflict
	_, err = s.CreateCapture(ctx, port.Capture{
		Kind:      "link",
		SourceURL: "https://example.com/duplicate-test",
		Title:     "Second",
	})
	if err == nil {
		t.Fatalf("expected error on duplicate SourceURL, got nil")
	}
	if !errors.Is(err, port.ErrConflict) {
		t.Fatalf("duplicate error = %v, want port.ErrConflict", err)
	}

	// Empty URLs must never conflict (partial index)
	c1, err := s.CreateCapture(ctx, port.Capture{Kind: "text", SourceURL: "", Text: "thought 1"})
	if err != nil {
		t.Fatalf("empty url c1: %v", err)
	}
	c2, err := s.CreateCapture(ctx, port.Capture{Kind: "text", SourceURL: "", Text: "thought 2"})
	if err != nil {
		t.Fatalf("empty url c2: %v", err)
	}
	if c1.ID == c2.ID {
		t.Fatalf("expected different IDs for empty url captures: %d == %d", c1.ID, c2.ID)
	}
}

func TestMigrationBackfill(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "backfill_test.db")

	// 1. Manually apply migrations 1..4 on a fresh DB
	db, err := sql.Open("sqlite", "file:"+dbPath+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		t.Fatalf("open seed db: %v", err)
	}
	if _, err := db.Exec(`CREATE TABLE schema_version (version INTEGER NOT NULL PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
		t.Fatalf("create schema_version: %v", err)
	}

	for v, file := range []string{
		"migrations/0001_init.sql",
		"migrations/0002_add_briefings.sql",
		"migrations/0003_dedup_source_url.sql",
		"migrations/0004_settings.sql",
	} {
		sqlBytes, err := migrationFS.ReadFile(file)
		if err != nil {
			t.Fatalf("read %s: %v", file, err)
		}
		if _, err := db.Exec(string(sqlBytes)); err != nil {
			t.Fatalf("apply %s: %v", file, err)
		}
		if _, err := db.Exec(`INSERT INTO schema_version (version, applied_at) VALUES (?, ?)`, v+1, "2026-01-01T00:00:00Z"); err != nil {
			t.Fatalf("record %s: %v", file, err)
		}
	}

	// 2. Seed cards: two with source_url, one without
	ts := "2026-01-01T12:00:00Z"
	if _, err := db.Exec(`INSERT INTO cards (title, summary, horizon, status, source_url, source_note, created_at, updated_at) VALUES
		('Seed Card 1', 'Summary 1', 'short-term', 'inbox', 'https://example.com/seed1', 'Note 1', ?, ?),
		('Seed Card 2', 'Summary 2', 'short-term', 'shelved', 'https://example.com/seed2', 'Note 2', ?, ?),
		('Seed Card 3', 'Summary 3', 'short-term', 'inbox', '', 'Note 3', ?, ?)`,
		ts, ts, ts, ts, ts, ts); err != nil {
		t.Fatalf("seed cards: %v", err)
	}
	db.Close()

	// 3. Open store with store.New to trigger migration 0005_captures.sql
	s, err := New(dbPath)
	if err != nil {
		t.Fatalf("store.New on seeded db: %v", err)
	}
	defer s.Close()
	ctx := context.Background()

	// Verify schema version is 10
	var version int
	if err := s.db.QueryRow(`SELECT MAX(version) FROM schema_version`).Scan(&version); err != nil {
		t.Fatalf("schema_version: %v", err)
	}
	if version != 12 {
		t.Fatalf("version = %d, want 12", version)
	}

	// Verify backfilled captures exist
	cap1, err := s.GetCaptureBySourceURL(ctx, "https://example.com/seed1")
	if err != nil {
		t.Fatalf("GetCaptureBySourceURL seed1: %v", err)
	}
	if cap1.Title != "Seed Card 1" || cap1.Caption != "Note 1" {
		t.Fatalf("cap1 mismatch: Title=%q, Caption=%q", cap1.Title, cap1.Caption)
	}

	cap2, err := s.GetCaptureBySourceURL(ctx, "https://example.com/seed2")
	if err != nil {
		t.Fatalf("GetCaptureBySourceURL seed2: %v", err)
	}
	if cap2.Title != "Seed Card 2" || cap2.Caption != "Note 2" {
		t.Fatalf("cap2 mismatch: Title=%q, Caption=%q", cap2.Title, cap2.Caption)
	}

	// Verify cards are linked
	cards, err := s.ListCards(ctx, port.CardFilter{})
	if err != nil {
		t.Fatalf("ListCards: %v", err)
	}
	if len(cards) != 3 {
		t.Fatalf("cards count = %d, want 3", len(cards))
	}
	for _, c := range cards {
		switch c.Title {
		case "Seed Card 1":
			if c.CaptureID == nil || *c.CaptureID != cap1.ID {
				t.Errorf("card 1 capture_id = %v, want %d", c.CaptureID, cap1.ID)
			}
		case "Seed Card 2":
			if c.CaptureID == nil || *c.CaptureID != cap2.ID {
				t.Errorf("card 2 capture_id = %v, want %d", c.CaptureID, cap2.ID)
			}
		case "Seed Card 3":
			if c.CaptureID != nil {
				t.Errorf("card 3 capture_id = %v, want nil", c.CaptureID)
			}
		}
	}

	// Verify that multiple cards can now share the same source_url (split cards supported)
	splitCard, err := s.CreateCard(ctx, port.Card{
		Title:     "Seed Card 1 Split",
		SourceURL: "https://example.com/seed1",
		CaptureID: &cap1.ID,
	})
	if err != nil {
		t.Fatalf("creating card with duplicate source_url failed: %v", err)
	}
	if splitCard.ID == 0 {
		t.Fatal("splitCard zero ID")
	}
}

func TestTriageBriefMigration(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "triage_brief_migration.db")

	// 1. Manually apply migrations 1..6 on a fresh DB
	db, err := sql.Open("sqlite", "file:"+dbPath+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		t.Fatalf("open seed db: %v", err)
	}
	if _, err := db.Exec(`CREATE TABLE schema_version (version INTEGER NOT NULL PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
		t.Fatalf("create schema_version: %v", err)
	}

	for v, file := range []string{
		"migrations/0001_init.sql",
		"migrations/0002_add_briefings.sql",
		"migrations/0003_dedup_source_url.sql",
		"migrations/0004_settings.sql",
		"migrations/0005_captures.sql",
		"migrations/0006_card_references.sql",
	} {
		sqlBytes, err := migrationFS.ReadFile(file)
		if err != nil {
			t.Fatalf("read %s: %v", file, err)
		}
		if _, err := db.Exec(string(sqlBytes)); err != nil {
			t.Fatalf("apply %s: %v", file, err)
		}
		if _, err := db.Exec(`INSERT INTO schema_version (version, applied_at) VALUES (?, ?)`, v+1, "2026-01-01T00:00:00Z"); err != nil {
			t.Fatalf("record %s: %v", file, err)
		}
	}

	// 2. Seed a legacy card with executive_summary and value_proposition
	ts := "2026-01-01T12:00:00Z"
	if _, err := db.Exec(`INSERT INTO cards (title, summary, horizon, status, source_url, source_note, executive_summary, value_proposition, proposed_actions, created_at, updated_at) VALUES
		('Legacy Brief Card', 'Old Summary', 'short-term', 'inbox', 'https://example.com/legacy', 'Legacy note', 'Legacy exec summary', 'Legacy val prop', '["act 1"]', ?, ?)`,
		ts, ts); err != nil {
		t.Fatalf("seed legacy card: %v", err)
	}
	db.Close()

	// 3. Open store with New() to trigger migration 0007_triage_brief.sql
	s, err := New(dbPath)
	if err != nil {
		t.Fatalf("store.New on seeded db: %v", err)
	}
	defer s.Close()
	ctx := context.Background()

	var version int
	if err := s.db.QueryRow(`SELECT MAX(version) FROM schema_version`).Scan(&version); err != nil {
		t.Fatalf("schema_version: %v", err)
	}
	if version != 12 {
		t.Fatalf("version = %d, want 12", version)
	}

	// 4. Verify the seeded legacy card backfilled tldr and why_care
	card, err := s.GetCardBySourceURL(ctx, "https://example.com/legacy")
	if err != nil {
		t.Fatalf("GetCardBySourceURL: %v", err)
	}
	if card.TLDR != "Legacy exec summary" {
		t.Errorf("card.TLDR = %q, want %q", card.TLDR, "Legacy exec summary")
	}
	if card.WhyCare != "Legacy val prop" {
		t.Errorf("card.WhyCare = %q, want %q", card.WhyCare, "Legacy val prop")
	}
	if card.Type != "idea" {
		t.Errorf("card.Type = %q, want 'idea'", card.Type)
	}

	// 5. Create a new card with all triage brief fields
	newCard, err := s.CreateCard(ctx, port.Card{
		Title:         "New Triage Card",
		Type:          port.CardTypeTool,
		TLDR:          "Fast local embedding server.",
		WhyCare:       "Reduces token costs to zero.",
		Claims:        []string{"Zero latency", "Fits on CPU"},
		OpenQuestions: []string{"Does it support multilingual?"},
		Signals: port.Signals{
			Extraction:    "full",
			Promo:         false,
			SourceQuality: "primary",
			PublishedAt:   "2026-03-01",
		},
		Worthiness: port.Worthiness{
			Level:  "high",
			Reason: "Fits existing infra stack",
		},
		Horizon: port.HorizonShortTerm,
	})
	if err != nil {
		t.Fatalf("CreateCard new schema: %v", err)
	}

	// 6. Verify GetCard returns all triage brief fields
	got, err := s.GetCard(ctx, newCard.ID)
	if err != nil {
		t.Fatalf("GetCard: %v", err)
	}
	if got.Type != port.CardTypeTool {
		t.Errorf("got.Type = %q, want %q", got.Type, port.CardTypeTool)
	}
	if got.TLDR != "Fast local embedding server." {
		t.Errorf("got.TLDR = %q", got.TLDR)
	}
	if got.WhyCare != "Reduces token costs to zero." {
		t.Errorf("got.WhyCare = %q", got.WhyCare)
	}
	if len(got.Claims) != 2 || got.Claims[0] != "Zero latency" {
		t.Errorf("got.Claims = %+v", got.Claims)
	}
	if len(got.OpenQuestions) != 1 || got.OpenQuestions[0] != "Does it support multilingual?" {
		t.Errorf("got.OpenQuestions = %+v", got.OpenQuestions)
	}
	if got.Signals.Extraction != "full" || got.Signals.SourceQuality != "primary" || got.Signals.PublishedAt != "2026-03-01" {
		t.Errorf("got.Signals = %+v", got.Signals)
	}
	if got.Worthiness.Level != "high" || got.Worthiness.Reason != "Fits existing infra stack" {
		t.Errorf("got.Worthiness = %+v", got.Worthiness)
	}
	// Verify legacy mappings for old clients
	if got.ExecutiveSummary != "Fast local embedding server." {
		t.Errorf("got.ExecutiveSummary = %q", got.ExecutiveSummary)
	}
	if got.ValueProposition != "Reduces token costs to zero." {
		t.Errorf("got.ValueProposition = %q", got.ValueProposition)
	}

	// 7. Test UpdateCard with patch
	newTLDR := "Updated embedding server."
	newLevel := "medium"
	patched, err := s.UpdateCard(ctx, got.ID, port.CardPatch{
		TLDR: &newTLDR,
		Worthiness: &port.Worthiness{
			Level:  newLevel,
			Reason: "Decided to evaluate later",
		},
	})
	if err != nil {
		t.Fatalf("UpdateCard: %v", err)
	}
	if patched.TLDR != newTLDR || patched.ExecutiveSummary != newTLDR {
		t.Errorf("patched.TLDR = %q, execSummary = %q", patched.TLDR, patched.ExecutiveSummary)
	}
	if patched.Worthiness.Level != "medium" {
		t.Errorf("patched.Worthiness = %+v", patched.Worthiness)
	}
}

func TestCardReferencesRoundTrip(t *testing.T) {
	s, ctx := newTestStore(t)

	refs := []port.Reference{
		{Kind: port.RefKindRepo, Label: "gin-gonic/gin", URL: "https://github.com/gin-gonic/gin"},
		{Kind: port.RefKindTool, Label: "ffmpeg"},
		{Kind: port.RefKindURL, Label: "https://example.com/docs", URL: "https://example.com/docs"},
	}

	c, err := s.CreateCard(ctx, port.Card{
		Title:      "Card with References",
		References: refs,
	})
	if err != nil {
		t.Fatalf("CreateCard: %v", err)
	}

	got, err := s.GetCard(ctx, c.ID)
	if err != nil {
		t.Fatalf("GetCard: %v", err)
	}
	if len(got.References) != 3 {
		t.Fatalf("got %d references, want 3", len(got.References))
	}
	if got.References[0].Kind != port.RefKindRepo || got.References[0].Label != "gin-gonic/gin" || got.References[0].URL != "https://github.com/gin-gonic/gin" {
		t.Errorf("ref 0 mismatch: %+v", got.References[0])
	}
	if got.References[1].Kind != port.RefKindTool || got.References[1].Label != "ffmpeg" || got.References[1].URL != "" {
		t.Errorf("ref 1 mismatch: %+v", got.References[1])
	}
	if got.References[2].Kind != port.RefKindURL || got.References[2].Label != "https://example.com/docs" || got.References[2].URL != "https://example.com/docs" {
		t.Errorf("ref 2 mismatch: %+v", got.References[2])
	}

	// ListCards batch-hydration check
	cards, err := s.ListCards(ctx, port.CardFilter{})
	if err != nil {
		t.Fatalf("ListCards: %v", err)
	}
	var found *port.Card
	for i := range cards {
		if cards[i].ID == c.ID {
			found = &cards[i]
			break
		}
	}
	if found == nil || len(found.References) != 3 {
		t.Fatalf("ListCards did not hydrate references correctly: %+v", found)
	}

	// UpdateCard with replacement references
	newRefs := []port.Reference{
		{Kind: port.RefKindPerson, Label: "Alan Turing"},
	}
	updated, err := s.UpdateCard(ctx, c.ID, port.CardPatch{
		References: &newRefs,
	})
	if err != nil {
		t.Fatalf("UpdateCard references: %v", err)
	}
	if len(updated.References) != 1 || updated.References[0].Label != "Alan Turing" {
		t.Fatalf("updated references mismatch: %+v", updated.References)
	}

	// Reload to verify DB state
	reloaded, err := s.GetCard(ctx, c.ID)
	if err != nil {
		t.Fatalf("reloaded: %v", err)
	}
	if len(reloaded.References) != 1 || reloaded.References[0].Label != "Alan Turing" {
		t.Fatalf("reloaded references mismatch: %+v", reloaded.References)
	}
}

func TestCardActionsSourceAndWriteback(t *testing.T) {
	s, ctx := newTestStore(t)

	card, err := s.CreateCard(ctx, port.Card{
		Title:           "Writeback Card",
		Summary:         "Summary",
		ProposedActions: []string{"Action from triage"},
	})
	if err != nil {
		t.Fatalf("CreateCard: %v", err)
	}
	if card.ActionsSource != "triage" {
		t.Fatalf("want actions_source triage, got %s", card.ActionsSource)
	}

	// Update actions without specifying source -> automatically becomes "user"
	userActions := []string{"User edited action"}
	card, err = s.UpdateCard(ctx, card.ID, port.CardPatch{
		ProposedActions: &userActions,
	})
	if err != nil {
		t.Fatalf("UpdateCard: %v", err)
	}
	if card.ActionsSource != "user" {
		t.Fatalf("want actions_source user, got %s", card.ActionsSource)
	}
	if len(card.ProposedActions) != 1 || card.ProposedActions[0] != "User edited action" {
		t.Fatalf("unexpected proposed actions: %+v", card.ProposedActions)
	}

	// Update research verdict and suggestions
	verdict := "pursue"
	confidence := "high"
	suggHorizon := "short-term"
	suggTags := []string{"ai", "nlp"}
	researchActions := []string{"Research action 1", "Research action 2"}
	src := "research"

	card, err = s.UpdateCard(ctx, card.ID, port.CardPatch{
		ResearchVerdict:    &verdict,
		ResearchConfidence: &confidence,
		SuggestedHorizon:   &suggHorizon,
		SuggestedTags:      &suggTags,
		ProposedActions:    &researchActions,
		ActionsSource:      &src,
	})
	if err != nil {
		t.Fatalf("UpdateCard writeback: %v", err)
	}
	if card.ActionsSource != "research" {
		t.Fatalf("want actions_source research, got %s", card.ActionsSource)
	}
	if card.ResearchVerdict != "pursue" || card.ResearchConfidence != "high" || card.SuggestedHorizon != "short-term" {
		t.Fatalf("unexpected verdict/suggestions: %+v", card)
	}
	if len(card.SuggestedTags) != 2 || card.SuggestedTags[0] != "ai" {
		t.Fatalf("unexpected suggested tags: %+v", card.SuggestedTags)
	}

	// Verify GetCard and ListCards return all fields
	got, err := s.GetCard(ctx, card.ID)
	if err != nil {
		t.Fatalf("GetCard: %v", err)
	}
	if got.ActionsSource != "research" || got.ResearchVerdict != "pursue" || len(got.SuggestedTags) != 2 {
		t.Fatalf("GetCard unexpected data: %+v", got)
	}

	list, err := s.ListCards(ctx, port.CardFilter{})
	if err != nil {
		t.Fatalf("ListCards: %v", err)
	}
	if len(list) != 1 || list[0].ActionsSource != "research" || list[0].ResearchVerdict != "pursue" || len(list[0].SuggestedTags) != 2 {
		t.Fatalf("ListCards unexpected data: %+v", list[0])
	}
}

func TestStore_Playbooks(t *testing.T) {
	s, ctx := newTestStore(t)

	// 1. Check seeded Default playbook
	def, err := s.GetDefaultPlaybook(ctx)
	if err != nil {
		t.Fatalf("GetDefaultPlaybook: %v", err)
	}
	if def.Name != "Default" || !def.IsBuiltin {
		t.Fatalf("expected Default built-in playbook, got %+v", def)
	}
	if len(def.Steps) != 9 {
		t.Fatalf("expected 9 steps in default playbook, got %d", len(def.Steps))
	}

	// 2. Built-in cannot be modified or deleted
	def.Description = "Modified description"
	if _, err := s.UpdatePlaybook(ctx, def); !errors.Is(err, port.ErrBuiltinReadOnly) {
		t.Fatalf("expected ErrBuiltinReadOnly on update, got: %v", err)
	}
	if err := s.DeletePlaybook(ctx, def.ID); !errors.Is(err, port.ErrBuiltinReadOnly) {
		t.Fatalf("expected ErrBuiltinReadOnly on delete, got: %v", err)
	}

	// 3. Create a custom playbook
	custom := port.Playbook{
		Name:        "Founder Scan",
		Description: "Playbook for startup analysis",
		Steps: []port.PlaybookStep{
			{Position: 1, Kind: port.StepKindGround, Name: "Ground", Enabled: true},
			{Position: 2, Kind: port.StepKindResolveRefs, Name: "Refs", Enabled: true},
			{
				Position: 3,
				Kind:     port.StepKindCustom,
				Name:     "TAM",
				Enabled:  true,
				Config: port.CustomStepConfig{
					Instruction:   "Estimate total addressable market",
					OutputHeading: "Market Size",
					ToolPolicy:    "none",
				},
			},
			{Position: 4, Kind: port.StepKindVerdict, Name: "Verdict", Enabled: true},
			{Position: 5, Kind: port.StepKindReport, Name: "Report", Enabled: true},
		},
	}
	created, err := s.CreatePlaybook(ctx, custom)
	if err != nil {
		t.Fatalf("CreatePlaybook: %v", err)
	}
	if created.ID <= 0 || created.IsBuiltin {
		t.Fatalf("unexpected created playbook: %+v", created)
	}
	if len(created.Steps) != 5 {
		t.Fatalf("expected 5 steps, got %d", len(created.Steps))
	}

	// 4. Duplicate custom playbook
	dup, err := s.DuplicatePlaybook(ctx, created.ID)
	if err != nil {
		t.Fatalf("DuplicatePlaybook: %v", err)
	}
	if dup.Name != "Founder Scan (Copy)" || dup.IsBuiltin {
		t.Fatalf("unexpected duplicate: %+v", dup)
	}
	if len(dup.Steps) != 5 {
		t.Fatalf("expected 5 steps in copy, got %d", len(dup.Steps))
	}

	// 5. Create card and research with created playbook
	c, _ := s.CreateCard(ctx, port.Card{Title: "Test Startup"})
	r, err := s.CreateResearch(ctx, c.ID, "analyze TAM", &created.ID)
	if err != nil {
		t.Fatalf("CreateResearch with playbook: %v", err)
	}
	if r.PlaybookID == nil || *r.PlaybookID != created.ID {
		t.Fatalf("expected playbook ID %d, got %v", created.ID, r.PlaybookID)
	}
	if r.PlaybookSnapshot == nil || len(r.PlaybookSnapshot.Steps) != 5 {
		t.Fatalf("expected 5-step snapshot, got: %+v", r.PlaybookSnapshot)
	}

	// 6. Update playbook and verify snapshot immutability
	created.Name = "Founder Scan v2"
	created.Steps = append(created.Steps[:2], created.Steps[3:]...) // Remove custom step
	updated, err := s.UpdatePlaybook(ctx, created)
	if err != nil {
		t.Fatalf("UpdatePlaybook: %v", err)
	}
	if len(updated.Steps) != 4 {
		t.Fatalf("expected 4 steps after update, got %d", len(updated.Steps))
	}

	// Reload original research row — its snapshot must remain untouched with 5 steps!
	loadedR, err := s.GetResearch(ctx, r.ID)
	if err != nil {
		t.Fatalf("GetResearch: %v", err)
	}
	if loadedR.PlaybookSnapshot == nil || len(loadedR.PlaybookSnapshot.Steps) != 5 {
		t.Fatalf("past research snapshot was mutated! expected 5 steps, got: %d", len(loadedR.PlaybookSnapshot.Steps))
	}
}



