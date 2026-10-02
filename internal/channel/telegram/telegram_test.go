package telegram

import (
    "context"
    "testing"
    "sort"

    "sparkkeep/internal/port"
)

type stubStore struct {
    cards      map[int64]port.Card
    researches map[int64]port.Research
    nextCard   int64
    nextRes    int64
}

func newStubStore() *stubStore {
    return &stubStore{cards: map[int64]port.Card{}, researches: map[int64]port.Research{}}
}

func (s *stubStore) CreateCard(_ context.Context, c port.Card) (port.Card, error) {
    s.nextCard++
    c.ID = s.nextCard
    s.cards[c.ID] = c
    return c, nil
}

func (s *stubStore) TagCoOccurrence(ctx context.Context, minWeight int) ([]port.TagPair, error) {
    if minWeight < 1 {
        minWeight = 1
    }
    counts := map[[2]string]int{}
    for _, c := range s.cards {
        if c.Status == port.StatusDismissed || c.Status == port.StatusShelved {
            continue
        }
        sorted := append([]string(nil), c.Tags...)
        sort.Strings(sorted)
        for i := range sorted {
            for j := i + 1; j < len(sorted); j++ {
                counts[[2]string{sorted[i], sorted[j]}]++
            }
        }
    }
    var out []port.TagPair
    for k, w := range counts {
        if w >= minWeight {
            out = append(out, port.TagPair{A: k[0], B: k[1], Weight: w})
        }
    }
    sort.Slice(out, func(i, j int) bool {
        if out[i].Weight != out[j].Weight {
            return out[i].Weight > out[j].Weight
        }
        if out[i].A != out[j].A {
            return out[i].A < out[j].A
        }
        return out[i].B < out[j].B
    })
    return out, nil
}

func TestTagCoOccurrence(t *testing.T) {
    s := newStubStore()
    s.cards[1] = port.Card{ID: 1, Status: port.StatusInbox, Tags: []string{"go", "concurrency"}}
    s.cards[2] = port.Card{ID: 2, Status: port.StatusInbox, Tags: []string{"go", "concurrency"}}
    s.cards[3] = port.Card{ID: 3, Status: port.StatusInbox, Tags: []string{"rust", "concurrency"}}
    s.cards[4] = port.Card{ID: 4, Status: port.StatusInbox, Tags: []string{"rust", "web"}}

    pairs, err := s.TagCoOccurrence(context.Background(), 2)
    if err != nil {
        t.Fatalf("TagCoOccurrence: %v", err)
    }
    found := false
    for _, p := range pairs {
        if (p.A == "concurrency" && p.B == "go" || p.A == "go" && p.B == "concurrency") && p.Weight == 2 {
            found = true
        }
    }
    if !found {
        t.Errorf("want go+concurrency weight 2, got %+v", pairs)
    }
    for _, p := range pairs {
        if p.Weight < 2 {
            t.Errorf("pair %+v below the threshold leaked through", p)
        }
    }
}

func TestTagCoOccurrenceEmpty(t *testing.T) {
    s := newStubStore()
    pairs, err := s.TagCoOccurrence(context.Background(), 2)
    if err != nil {
        t.Fatalf("TagCoOccurrence: %v", err)
    }
    if len(pairs) != 0 {
        t.Errorf("want no pairs, got %+v", pairs)
    }
}
