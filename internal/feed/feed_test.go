package feed

import (
	"context"
	"encoding/xml"
	"testing"
	"time"

	"sparkkeep/internal/port"
)

type mockStore struct {
	port.Store
	cards    []port.Card
	settings map[string]string
}

func (m *mockStore) ListCards(ctx context.Context, filter port.CardFilter) ([]port.Card, error) {
	return m.cards, nil
}

func (m *mockStore) ListResearchByCard(ctx context.Context, cardID int64) ([]port.Research, error) {
	return nil, nil
}

func (m *mockStore) GetSetting(ctx context.Context, key string) (string, error) {
	return m.settings[key], nil
}

func TestXMLEscape(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"AT&T & Verizon", "AT&amp;T &amp; Verizon"},
		{"<tag>", "&lt;tag&gt;"},
		{"foo > bar", "foo &gt; bar"},
		{`"quoted"`, "&quot;quoted&quot;"},
		{"'single'", "&apos;single&apos;"},
		{"url?a=1&b=2", "url?a=1&amp;b=2"},
	}

	for _, tc := range tests {
		got := xmlEscape(tc.input)
		if got != tc.expected {
			t.Errorf("xmlEscape(%q) = %q, want %q", tc.input, got, tc.expected)
		}

		// Verify it unmarshals back cleanly as XML text
		var parsed struct {
			Text string `xml:",chardata"`
		}
		xmlData := "<root>" + got + "</root>"
		if err := xml.Unmarshal([]byte(xmlData), &parsed); err != nil {
			t.Errorf("xml.Unmarshal failed for escaped %q: %v", tc.input, err)
		}
		if parsed.Text != tc.input {
			t.Errorf("xml.Unmarshal returned %q, want original %q", parsed.Text, tc.input)
		}
	}
}

func TestGenerateFeed_AmpersandParsesCleanly(t *testing.T) {
	token := "feed_token_123456"
	hash, err := HashFeedToken(token)
	if err != nil {
		t.Fatalf("hash token: %v", err)
	}

	store := &mockStore{
		settings: map[string]string{
			"outbox_feed_token": hash,
		},
		cards: []port.Card{
			{
				ID:               1,
				Title:            "AT&T & Verizon M&A Strategy",
				Type:             "Analysis & Research",
				Horizon:          "H1",
				Status:           port.StatusDone,
				ExecutiveSummary: "Comparing AT&T & Verizon 5G networks and R&D budgets.",
				CreatedAt:        time.Now(),
			},
		},
	}

	xmlBytes, err := GenerateFeed(context.Background(), store, token, FeedFilter{})
	if err != nil {
		t.Fatalf("GenerateFeed failed: %v", err)
	}

	var root rssRoot
	if err := xml.Unmarshal(xmlBytes, &root); err != nil {
		t.Fatalf("xml.Unmarshal failed on generated feed: %v\nFeed XML:\n%s", err, string(xmlBytes))
	}

	if len(root.Channel.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(root.Channel.Items))
	}
	if root.Channel.Items[0].Title != "AT&T & Verizon M&A Strategy" {
		t.Errorf("expected title to match, got %q", root.Channel.Items[0].Title)
	}
}
