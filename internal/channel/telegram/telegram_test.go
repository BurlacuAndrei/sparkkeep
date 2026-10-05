package telegram

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"slices"
	"strconv"
	"testing"

	"sparkkeep/internal/analyze"
	"sparkkeep/internal/capture"
	"sparkkeep/internal/config"
	"sparkkeep/internal/core"
	"sparkkeep/internal/port"
)

// stubStore embeds the interface so only the methods these tests exercise are
// implemented; anything else panics instead of pretending to work.
type stubStore struct {
	port.Store
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

func (s *stubStore) GetCard(_ context.Context, id int64) (port.Card, error) {
	c, ok := s.cards[id]
	if !ok {
		return port.Card{}, port.ErrNotFound
	}
	return c, nil
}

func (s *stubStore) UpdateCard(_ context.Context, id int64, p port.CardPatch) (port.Card, error) {
	c, ok := s.cards[id]
	if !ok {
		return port.Card{}, port.ErrNotFound
	}
	if p.Note != nil {
		c.SourceNote = *p.Note
	}
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

// stubTelegram points the adapter built by build at a stub Telegram API
// server, runs fn against it and returns the text of every message it posted.
func stubTelegram(t *testing.T, build func() *Adapter, fn func(a *Adapter)) []string {
	t.Helper()
	var sent []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var msg struct {
			Text string `json:"text"`
		}
		if err := json.NewDecoder(r.Body).Decode(&msg); err != nil {
			t.Errorf("decode sendMessage body: %v", err)
		}
		sent = append(sent, msg.Text)
		_, _ = w.Write([]byte(`{"ok":true,"result":{"message_id":7}}`))
	}))
	defer srv.Close()
	a := build()
	a.baseURL = srv.URL
	fn(a)
	return sent
}

// captureSendMessage runs fn against an Adapter wired to a stub Telegram API
// server and returns the text of the message it posted.
func captureSendMessage(t *testing.T, fn func(a *Adapter)) string {
	t.Helper()
	sent := stubTelegram(t, func() *Adapter { return &Adapter{Token: "tok", OwnerID: 1} }, fn)
	if len(sent) != 1 {
		t.Fatalf("posted %d messages, want 1", len(sent))
	}
	return sent[0]
}

// llmStub answers the analyze client's /chat/completions call with one card,
// so a reply that wrongly falls through to capture is visible as a new card.
func llmStub(t *testing.T, content string) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`, strconv.Quote(content))
	}))
	t.Cleanup(srv.Close)
	return srv
}

// stubService is a capture pipeline that never touches the network: a text
// share is echoed by the fetcher, the analyzer answers from llmStub.
func stubService(t *testing.T, st port.Store, llm *httptest.Server) *core.Service {
	t.Helper()
	ac := analyze.New(config.Config{LLMBase: llm.URL, LLMModel: "stub"}, llm.Client())
	return &core.Service{Store: st, Fetcher: capture.Capture{}, Analyze: ac, Logf: t.Logf}
}

func TestSendCardIncludesProposedActions(t *testing.T) {
	sent := captureSendMessage(t, func(a *Adapter) {
		err := a.sendCard(context.Background(), port.Card{
			ID:               7,
			Title:            "  Watch the talk  ",
			ExecutiveSummary: "Three takeaways.\n",
			Horizon:          port.HorizonShortTerm,
			Tags:             []string{"talks", "ml"},
			ProposedActions:  []string{" Read the paper ", "", "   ", "Share with the team"},
		})
		if err != nil {
			t.Errorf("sendCard: %v", err)
		}
	})
	want := "*Watch the talk*\n\nThree takeaways.\n\n*Next Steps:*\n" +
		"• Read the paper\n• Share with the team\n\n[short-term]\n#talks #ml"
	if sent != want {
		t.Errorf("caption =\n%q\nwant\n%q", sent, want)
	}
}

func TestSendCardNoProposedActions(t *testing.T) {
	sent := captureSendMessage(t, func(a *Adapter) {
		err := a.sendCard(context.Background(), port.Card{
			ID:              7,
			Title:           "Watch the talk",
			Summary:         "Plain summary.",
			Horizon:         port.HorizonLifetime,
			ProposedActions: []string{"", "  "},
		})
		if err != nil {
			t.Errorf("sendCard: %v", err)
		}
	})
	want := "*Watch the talk*\n\nPlain summary.\n\n[lifetime]"
	if sent != want {
		t.Errorf("caption =\n%q\nwant\n%q", sent, want)
	}
}

// Replying to a card message with "#tags + note" must merge the tags, append
// the note, and never capture a new card.
func TestOrganizeReplyUpdatesCardInPlace(t *testing.T) {
	st := newStubStore()
	st.cards[1] = port.Card{ID: 1, Title: "Watch the talk", Tags: []string{"ml"}, SourceNote: "first note"}
	svc := stubService(t, st, llmStub(t, `[{"title":"New","summary":"s","horizon":"short-term","tags":[],"links":[]}]`))

	sent := stubTelegram(t, func() *Adapter {
		a := &Adapter{Token: "tok", OwnerID: 1, Store: st, Service: svc}
		a.trackMessage(500, 1) // card 1 went out as bot message 500
		return a
	}, func(a *Adapter) {
		a.handleMessage(&message{
			MessageID:      501,
			Chat:           &chat{ID: 1},
			Text:           "#AI #ML reading list for later",
			ReplyToMessage: &message{MessageID: 500},
		})
	})

	if len(st.cards) != 1 {
		t.Fatalf("cards = %d, want 1 (an organized reply must not capture)", len(st.cards))
	}
	c := st.cards[1]
	if want := []string{"ml", "ai"}; !slices.Equal(c.Tags, want) {
		t.Errorf("tags = %v, want %v", c.Tags, want)
	}
	if want := "first note\nreading list for later"; c.SourceNote != want {
		t.Errorf("SourceNote = %q, want %q", c.SourceNote, want)
	}
	if want := []string{"Updated card #1\n#ml #ai"}; !slices.Equal(sent, want) {
		t.Errorf("sent = %v, want %v", sent, want)
	}
}

// A reply to a message that is not a tracked card is a normal share: it must
// fall through to CaptureShare instead of being swallowed.
func TestOrganizeReplyUntrackedFallsThroughToCapture(t *testing.T) {
	st := newStubStore()
	st.cards[1] = port.Card{ID: 1, Title: "Existing"}
	st.nextCard = 1
	svc := stubService(t, st, llmStub(t, `[{"title":"New","summary":"s","horizon":"short-term","tags":[],"links":[]}]`))

	sent := stubTelegram(t, func() *Adapter {
		return &Adapter{Token: "tok", OwnerID: 1, Store: st, Service: svc}
	}, func(a *Adapter) {
		a.handleMessage(&message{
			MessageID:      502,
			Chat:           &chat{ID: 1},
			Text:           "a brand new thought",
			ReplyToMessage: &message{MessageID: 999},
		})
	})

	if len(st.cards) != 2 {
		t.Fatalf("cards = %d, want 2 (untracked reply must capture)", len(st.cards))
	}
	if got := st.cards[2].Title; got != "New" {
		t.Errorf("captured title = %q, want New", got)
	}
	if len(sent) != 0 {
		t.Errorf("sent = %v, want no organize confirmation", sent)
	}
}
