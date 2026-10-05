package telegram

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

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

// captureSendMessage runs fn against an Adapter wired to a stub Telegram API
// server and returns the text of the message it posted.
func captureSendMessage(t *testing.T, fn func(a *Adapter)) string {
	t.Helper()
	var sent string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var msg struct {
			Text string `json:"text"`
		}
		if err := json.NewDecoder(r.Body).Decode(&msg); err != nil {
			t.Errorf("decode sendMessage body: %v", err)
		}
		sent = msg.Text
		_, _ = w.Write([]byte(`{"ok":true,"result":{"message_id":7}}`))
	}))
	defer srv.Close()
	fn(&Adapter{Token: "tok", OwnerID: 1, baseURL: srv.URL})
	return sent
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
