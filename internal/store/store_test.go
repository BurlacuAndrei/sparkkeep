package store

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

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
	if version != 1 {
		t.Fatalf("version = %d, want 1", version)
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

	_, err = s.UpdateCard(ctx, c.ID, port.CardPatch{})
	if !errors.Is(err, port.ErrNotFound) {
		t.Fatalf("empty patch: err = %v, want port.ErrNotFound", err)
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
