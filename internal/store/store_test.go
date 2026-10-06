package store

import (
	"context"
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
	if version != 3 {
		t.Fatalf("version = %d, want 3", version)
	}
	if _, err := s.db.Exec(`SELECT 1 FROM cards LIMIT 1`); err != nil {
		t.Fatalf("cards table: %v", err)
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
	if got.Status != "done" {
		t.Fatalf("got: %+v", got)
	}
	list, err := s.ListResearch(ctx)
	if err != nil {
		t.Fatalf("ListResearch: %v", err)
	}
	if len(list) != 1 || list[0].ID != r.ID || list[0].CardID != c.ID {
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
