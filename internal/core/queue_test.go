package core

import (
	"context"
	"strings"
	"testing"
	"time"

	"sparkkeep/internal/port"
)

func TestIsInRunWindow(t *testing.T) {
	tests := []struct {
		name     string
		enabled  bool
		start    string
		end      string
		timeStr  string // "15:04"
		expected bool
	}{
		{"disabled", false, "23:00", "07:00", "14:00", true},
		{"empty start/end", true, "", "", "14:00", true},
		{"same start and end", true, "10:00", "10:00", "14:00", true},
		{"day window inside", true, "09:00", "17:00", "12:30", true},
		{"day window before", true, "09:00", "17:00", "08:59", false},
		{"day window after", true, "09:00", "17:00", "17:01", false},
		{"day window at boundary start", true, "09:00", "17:00", "09:00", true},
		{"day window at boundary end", true, "09:00", "17:00", "17:00", false},
		{"overnight window late night inside", true, "23:00", "07:00", "23:30", true},
		{"overnight window early morning inside", true, "23:00", "07:00", "04:15", true},
		{"overnight window afternoon outside", true, "23:00", "07:00", "15:00", false},
		{"overnight window at boundary start", true, "23:00", "07:00", "23:00", true},
		{"overnight window at boundary end", true, "23:00", "07:00", "07:00", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ref, err := time.Parse("15:04", tt.timeStr)
			if err != nil {
				t.Fatalf("parse time: %v", err)
			}
			got := IsInRunWindow(ref, tt.enabled, tt.start, tt.end)
			if got != tt.expected {
				t.Errorf("IsInRunWindow(%s, %v, %s, %s) = %v, want %v", tt.timeStr, tt.enabled, tt.start, tt.end, got, tt.expected)
			}
		})
	}
}

func TestMatchSchedule(t *testing.T) {
	tests := []struct {
		name     string
		schedule string
		timeStr  string // "15:04"
		expected bool
	}{
		{"exact HH:MM match", "02:00", "02:00", true},
		{"HH:MM mismatch hour", "02:00", "03:00", false},
		{"HH:MM mismatch minute", "02:00", "02:01", false},
		{"cron 5 fields exact", "0 2 * * *", "02:00", true},
		{"cron 5 fields diff min", "30 2 * * *", "02:00", false},
		{"cron 5 fields diff min match", "30 2 * * *", "02:30", true},
		{"cron every hour at 00", "0 * * * *", "14:00", true},
		{"cron every hour at 00 mismatch", "0 * * * *", "14:05", false},
		{"empty schedule", "", "02:00", false},
		{"invalid format", "invalid", "02:00", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ref, err := time.Parse("15:04", tt.timeStr)
			if err != nil {
				t.Fatalf("parse time: %v", err)
			}
			got := MatchSchedule(tt.schedule, ref)
			if got != tt.expected {
				t.Errorf("MatchSchedule(%s, %s) = %v, want %v", tt.schedule, tt.timeStr, got, tt.expected)
			}
		})
	}
}

func TestFormatMorningResearchDigest(t *testing.T) {
	t.Run("empty runs", func(t *testing.T) {
		res := FormatMorningResearchDigest(nil, nil, "https://app.example.com")
		if !strings.Contains(res, "No research reports completed overnight") {
			t.Errorf("expected empty message, got: %s", res)
		}
	})

	t.Run("successful and failed runs", func(t *testing.T) {
		runs := []port.Research{
			{
				ID:     1,
				CardID: 101,
				Status: "done",
				Result: &port.ResearchResult{
					Verdict: &port.ResearchVerdict{
						Recommendation: "pursue",
						Confidence:     "high",
						ForWhom:        "Data engineers",
					},
				},
			},
			{
				ID:       2,
				CardID:   102,
				Status:   "done",
				Findings: "First line verdict\nSecond line details",
			},
			{
				ID:     3,
				CardID: 103,
				Status: "failed",
				Error:  "interrupted by server restart",
			},
		}

		cardTitles := map[int64]string{
			101: "Polars Rust Integration",
			102: "Vector Database Benchmark",
			103: "Broken Link Analysis",
		}

		out := FormatMorningResearchDigest(runs, cardTitles, "https://sparkkeep.local")
		if !strings.Contains(out, "2 report(s) ready") {
			t.Errorf("missing reports ready header: %s", out)
		}
		if !strings.Contains(out, "Polars Rust Integration") || !strings.Contains(out, "PURSUE (high confidence) — Data engineers") {
			t.Errorf("missing or incorrect verdict for card 101: %s", out)
		}
		if !strings.Contains(out, "https://sparkkeep.local/#card-101") {
			t.Errorf("missing web link: %s", out)
		}
		if !strings.Contains(out, "Vector Database Benchmark") || !strings.Contains(out, "First line verdict") {
			t.Errorf("missing or incorrect fallback findings for card 102: %s", out)
		}
		if !strings.Contains(out, "Failures (1):") || !strings.Contains(out, "<b>Broken Link Analysis</b>: interrupted by server restart") {
			t.Errorf("missing failure section: %s", out)
		}
	})
}

func TestQueueWorker_SequentialOrderingAndRecovery(t *testing.T) {
	st := newStubStore()
	ctx := context.Background()

	// Seed 5 cards
	c1, _ := st.CreateCard(ctx, port.Card{Title: "Card 1"})
	c2, _ := st.CreateCard(ctx, port.Card{Title: "Card 2"})
	c3, _ := st.CreateCard(ctx, port.Card{Title: "Card 3"})
	c4, _ := st.CreateCard(ctx, port.Card{Title: "Card 4"})
	c5, _ := st.CreateCard(ctx, port.Card{Title: "Card 5"})

	now := time.Date(2026, 10, 8, 2, 0, 0, 0, time.UTC)
	fakeClock := func() time.Time { return now }

	svc := &Service{
		Store:             st,
		Clock:             fakeClock,
		QueueConcurrency:  1,
		QueuePollInterval: 10 * time.Millisecond,
		Logf:              t.Logf,
	}

	// 1. Batch queue 5 cards
	queued, err := st.BatchQueueResearch(ctx, []int64{c1.ID, c2.ID, c3.ID, c4.ID, c5.ID}, nil, &now, "batch_1")
	if err != nil {
		t.Fatalf("BatchQueueResearch: %v", err)
	}
	if len(queued) != 5 {
		t.Fatalf("expected 5 queued, got %d", len(queued))
	}

	// 2. Mark card 1 as running to simulate in-flight run when server crashed
	st.researches[queued[0].ID] = port.Research{
		ID:        queued[0].ID,
		CardID:    c1.ID,
		Status:    "running",
		CreatedAt: now,
	}

	// 3. Restart recovery
	recovered, err := st.RecoverInterruptedResearch(ctx)
	if err != nil {
		t.Fatalf("RecoverInterruptedResearch: %v", err)
	}
	if recovered != 1 {
		t.Fatalf("expected 1 recovered, got %d", recovered)
	}
	r1 := st.researches[queued[0].ID]
	if r1.Status != "failed" || !strings.Contains(r1.Error, "interrupted by server restart") {
		t.Errorf("expected card 1 marked failed with interrupted: got %s, %s", r1.Status, r1.Error)
	}

	// 4. Sequential processing order for remaining items (c2, c3, c4, c5)
	var processedIDs []int64
	for {
		item, err := svc.Store.GetNextQueuedResearch(ctx, now)
		if err != nil {
			t.Fatalf("GetNextQueuedResearch: %v", err)
		}
		if item == nil {
			break
		}
		processedIDs = append(processedIDs, item.CardID)
		// Mark done
		_, _ = svc.Store.SetResearch(ctx, item.ID, "done", "findings", "")
	}

	if len(processedIDs) != 4 {
		t.Fatalf("expected 4 remaining processed, got %d", len(processedIDs))
	}
	expectedOrder := []int64{c2.ID, c3.ID, c4.ID, c5.ID}
	for i, wantID := range expectedOrder {
		if processedIDs[i] != wantID {
			t.Errorf("processed index %d: got card %d, want %d", i, processedIDs[i], wantID)
		}
	}
}

func TestQueueWorker_RuleEvaluationTable(t *testing.T) {
	st := newStubStore()
	ctx := context.Background()

	now := time.Date(2026, 10, 8, 2, 0, 0, 0, time.UTC)
	fakeClock := func() time.Time { return now }

	svc := &Service{
		Store: st,
		Clock: fakeClock,
		Logf:  t.Logf,
	}

	// Seed cards with various attributes
	cMatch1, _ := st.CreateCard(ctx, port.Card{Title: "High Inbox Article", Status: "inbox", Type: "article", Worthiness: port.Worthiness{Level: "high"}})
	cMatch2, _ := st.CreateCard(ctx, port.Card{Title: "High Inbox Article 2", Status: "inbox", Type: "article", Worthiness: port.Worthiness{Level: "high"}})
	cLow, _ := st.CreateCard(ctx, port.Card{Title: "Low Inbox Article", Status: "inbox", Type: "article", Worthiness: port.Worthiness{Level: "low"}})
	cDoing, _ := st.CreateCard(ctx, port.Card{Title: "High Doing Article", Status: "doing", Type: "article", Worthiness: port.Worthiness{Level: "high"}})
	cRepo, _ := st.CreateCard(ctx, port.Card{Title: "High Inbox Repo", Status: "inbox", Type: "repo", Worthiness: port.Worthiness{Level: "high"}})

	// Pre-queue cMatch2 so it already has an active research
	_, _ = st.CreateResearch(ctx, cMatch2.ID, "")

	tests := []struct {
		name          string
		rule          port.ResearchRule
		asOf          time.Time
		wantQueuedLen int
		wantCardIDs   []int64
	}{
		{
			name: "time mismatch should not evaluate",
			rule: port.ResearchRule{
				ID:      "rule-1",
				Name:    "Overnight high",
				Enabled: true,
				Time:    "03:00", // different time
				Filters: port.ResearchRuleFilter{
					Status:     "inbox",
					Worthiness: "high",
					Type:       "article",
				},
				MaxCards: 5,
			},
			asOf:          now, // 02:00
			wantQueuedLen: 0,
		},
		{
			name: "matches filter and skips already active card",
			rule: port.ResearchRule{
				ID:      "rule-2",
				Name:    "Overnight high",
				Enabled: true,
				Time:    "02:00",
				Filters: port.ResearchRuleFilter{
					Status:     "inbox",
					Worthiness: "high",
					Type:       "article",
				},
				MaxCards: 5,
			},
			asOf:          now,
			wantQueuedLen: 1, // Only cMatch1 (cMatch2 already active, cLow, cDoing, cRepo filtered out)
			wantCardIDs:   []int64{cMatch1.ID},
		},
		{
			name: "respects max cards limit",
			rule: port.ResearchRule{
				ID:      "rule-3",
				Name:    "Max 1 card",
				Enabled: true,
				Time:    "02:00",
				Filters: port.ResearchRuleFilter{
					Status: "inbox",
				},
				MaxCards: 1,
			},
			asOf:          now,
			wantQueuedLen: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if !MatchSchedule(tt.rule.Time, tt.asOf) {
				if tt.wantQueuedLen != 0 {
					t.Fatalf("expected rule not to fire")
				}
				return
			}
			queued, err := svc.ExecuteRule(ctx, tt.rule, tt.asOf)
			if err != nil {
				t.Fatalf("ExecuteRule: %v", err)
			}
			if len(queued) != tt.wantQueuedLen {
				t.Fatalf("got %d queued, want %d", len(queued), tt.wantQueuedLen)
			}
			if len(tt.wantCardIDs) > 0 {
				for i, wantID := range tt.wantCardIDs {
					if queued[i].CardID != wantID {
						t.Errorf("queued card %d: got %d, want %d", i, queued[i].CardID, wantID)
					}
				}
			}
		})
	}

	_ = cLow
	_ = cDoing
	_ = cRepo
}

func TestQueueWorker_QuietWindowEnforcement(t *testing.T) {
	st := newStubStore()
	ctx := context.Background()

	c, _ := st.CreateCard(ctx, port.Card{Title: "Test Card"})
	schedTime := time.Date(2026, 10, 8, 14, 0, 0, 0, time.UTC)

	// Set quiet window: only run between 23:00 and 07:00
	_ = st.SetSetting(ctx, "quiet_window_enabled", "true")
	_ = st.SetSetting(ctx, "quiet_window_start", "23:00")
	_ = st.SetSetting(ctx, "quiet_window_end", "07:00")

	// Queue card
	_, err := st.BatchQueueResearch(ctx, []int64{c.ID}, nil, &schedTime, "b1")
	if err != nil {
		t.Fatalf("BatchQueueResearch: %v", err)
	}

	var executions int32
	svc := &Service{
		Store:  st,
		Logf:   t.Logf,
		Runner: nil, // we don't need real runner here if we check isRunAllowed
	}

	// 1. Check at 14:00 (afternoon - outside quiet window)
	daytime := time.Date(2026, 10, 8, 14, 0, 0, 0, time.UTC)
	if svc.isRunAllowed(ctx, daytime) {
		t.Fatalf("expected isRunAllowed false at 14:00")
	}

	// 2. Check at 02:00 (overnight - inside quiet window)
	nighttime := time.Date(2026, 10, 8, 2, 0, 0, 0, time.UTC)
	if !svc.isRunAllowed(ctx, nighttime) {
		t.Fatalf("expected isRunAllowed true at 02:00")
	}

	_ = executions
}
