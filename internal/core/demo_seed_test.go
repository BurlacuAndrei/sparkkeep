package core

import (
	"context"
	"testing"

	"sparkkeep/internal/port"
)

func TestSeedDemoData_AllLocales(t *testing.T) {
	locales := []string{"en", "ro", "es", "pt-BR", "fr", "de"}

	expectedTitles := map[string]string{
		"en":    "Architecture of SQLite WAL Mode for Single-Binary Systems",
		"ro":    "Arhitectura modului SQLite WAL pentru sisteme cu binar unic",
		"es":    "Arquitectura del modo SQLite WAL para sistemas de binario único",
		"pt-BR": "Arquitetura do modo SQLite WAL para sistemas de binário único",
		"fr":    "Architecture du mode SQLite WAL pour systèmes à binaire unique",
		"de":    "Architektur des SQLite-WAL-Modus für Einzel-Binärsysteme",
	}

	for _, loc := range locales {
		t.Run("locale="+loc, func(t *testing.T) {
			store := newStubStore()
			svc := &Service{Store: store}

			err := svc.SeedDemoData(context.Background(), loc)
			if err != nil {
				t.Fatalf("SeedDemoData(%s) failed: %v", loc, err)
			}

			if len(store.cards) != 6 {
				t.Fatalf("expected 6 seeded cards, got %d", len(store.cards))
			}

			// Verify Card 1 title matches locale
			card1 := store.cards[1]
			if card1.Title != expectedTitles[loc] {
				t.Errorf("expected card 1 title %q, got %q", expectedTitles[loc], card1.Title)
			}

			// Verify canonical slugs
			expectedStatuses := map[int64]string{
				1: port.StatusInbox,
				2: port.StatusInProgress,
				3: port.StatusInProgress,
				4: port.StatusDone,
				5: port.StatusReview,
				6: port.StatusInbox,
			}
			expectedHorizons := map[int64]string{
				1: "short-term",
				2: "short-term",
				3: "medium-term",
				4: "short-term",
				5: "short-term",
				6: "long-term",
			}
			expectedTypes := map[int64]string{
				1: "article",
				2: "tool",
				3: "project",
				4: "article",
				5: "research",
				6: "idea",
			}

			for id := int64(1); id <= 6; id++ {
				card, ok := store.cards[id]
				if !ok {
					t.Fatalf("missing card %d", id)
				}
				if card.Status != expectedStatuses[id] {
					t.Errorf("card %d: expected status %q, got %q", id, expectedStatuses[id], card.Status)
				}
				if card.Horizon != expectedHorizons[id] {
					t.Errorf("card %d: expected horizon %q, got %q", id, expectedHorizons[id], card.Horizon)
				}
				if card.Type != expectedTypes[id] {
					t.Errorf("card %d: expected type %q, got %q", id, expectedTypes[id], card.Type)
				}
				if len(card.OpenQuestions) == 0 {
					t.Errorf("card %d: expected open questions to be populated", id)
				}
				if len(card.Tags) == 0 {
					t.Errorf("card %d: expected tags to be populated", id)
				}
			}

			// Verify Card 5 research canonical slugs
			resCard := store.cards[5]
			if resCard.ResearchVerdict != "pursue" {
				t.Errorf("expected research verdict 'pursue', got %q", resCard.ResearchVerdict)
			}
			if resCard.ResearchConfidence != "high" {
				t.Errorf("expected research confidence 'high', got %q", resCard.ResearchConfidence)
			}

			// Verify Completed Research Dossier
			if len(store.researches) != 1 {
				t.Fatalf("expected 1 research dossier item, got %d", len(store.researches))
			}
			var dossier port.Research
			for _, r := range store.researches {
				dossier = r
			}
			if dossier.Status != "done" {
				t.Errorf("expected dossier status 'done', got %q", dossier.Status)
			}
			if dossier.Findings == "" {
				t.Errorf("expected non-empty findings in dossier")
			}
			if len(dossier.Steps) != 3 {
				t.Fatalf("expected 3 dossier steps, got %d", len(dossier.Steps))
			}
			if dossier.Result == nil || dossier.Result.Verdict == nil {
				t.Fatalf("expected non-nil research verdict in dossier")
			}
			if dossier.Result.Verdict.Recommendation != "pursue" {
				t.Errorf("expected verdict recommendation 'pursue', got %q", dossier.Result.Verdict.Recommendation)
			}
			if dossier.Result.Verdict.Confidence != "high" {
				t.Errorf("expected verdict confidence 'high', got %q", dossier.Result.Verdict.Confidence)
			}
			if dossier.Result.Verdict.ForWhom == "" {
				t.Errorf("expected non-empty ForWhom in verdict")
			}
		})
	}
}

func TestSeedDemoData_FallbackFromSetting(t *testing.T) {
	store := newStubStore()
	store.settings["interface_locale"] = "de"
	svc := &Service{Store: store}

	if err := svc.SeedDemoData(context.Background()); err != nil {
		t.Fatalf("SeedDemoData() failed: %v", err)
	}

	if len(store.cards) != 6 {
		t.Fatalf("expected 6 cards, got %d", len(store.cards))
	}
	if store.cards[1].Title != "Architektur des SQLite-WAL-Modus für Einzel-Binärsysteme" {
		t.Errorf("expected German title from setting, got %q", store.cards[1].Title)
	}
}
