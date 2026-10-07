package core

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"sparkkeep/internal/port"
)

// parseHM parses "HH:MM" into hour (0-23) and minute (0-59).
func parseHM(s string) (int, int, error) {
	parts := strings.Split(strings.TrimSpace(s), ":")
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("invalid time format: %q", s)
	}
	h, err := strconv.Atoi(parts[0])
	if err != nil || h < 0 || h > 23 {
		return 0, 0, fmt.Errorf("invalid hour: %q", parts[0])
	}
	m, err := strconv.Atoi(parts[1])
	if err != nil || m < 0 || m > 59 {
		return 0, 0, fmt.Errorf("invalid minute: %q", parts[1])
	}
	return h, m, nil
}

// IsInRunWindow checks whether current time t is within allowed execution window.
// If enabled is false or start/end is empty, it returns true.
// If start < end (e.g. 02:00 to 06:00): allowed if [start, end).
// If start > end (e.g. 23:00 to 07:00, crosses midnight): allowed if >= start OR < end.
func IsInRunWindow(t time.Time, enabled bool, startStr, endStr string) bool {
	if !enabled || strings.TrimSpace(startStr) == "" || strings.TrimSpace(endStr) == "" {
		return true
	}
	sh, sm, err1 := parseHM(startStr)
	eh, em, err2 := parseHM(endStr)
	if err1 != nil || err2 != nil {
		return true
	}
	curMinutes := t.Hour()*60 + t.Minute()
	startMinutes := sh*60 + sm
	endMinutes := eh*60 + em

	if startMinutes == endMinutes {
		return true
	}
	if startMinutes < endMinutes {
		return curMinutes >= startMinutes && curMinutes < endMinutes
	}
	// Crosses midnight (e.g. 23:00 to 07:00)
	return curMinutes >= startMinutes || curMinutes < endMinutes
}

// MatchSchedule checks if a schedule string matches the given time.
// Supports:
// - "HH:MM" (e.g. "02:00", "14:30")
// - Cron-like 5 fields: "M H * * *" (or "* * * * *")
func MatchSchedule(schedule string, t time.Time) bool {
	schedule = strings.TrimSpace(schedule)
	if schedule == "" {
		return false
	}
	if strings.Contains(schedule, ":") && !strings.Contains(schedule, " ") {
		h, m, err := parseHM(schedule)
		if err != nil {
			return false
		}
		return t.Hour() == h && t.Minute() == m
	}
	fields := strings.Fields(schedule)
	if len(fields) == 5 {
		minField, hourField := fields[0], fields[1]
		if minField != "*" {
			m, err := strconv.Atoi(minField)
			if err != nil || t.Minute() != m {
				return false
			}
		}
		if hourField != "*" {
			h, err := strconv.Atoi(hourField)
			if err != nil || t.Hour() != h {
				return false
			}
		}
		return true
	}
	return false
}

// FormatMorningResearchDigest formats completed research runs for morning Telegram summary.
func FormatMorningResearchDigest(runs []port.Research, cardTitles map[int64]string, baseURL string) string {
	if len(runs) == 0 {
		return "☀️ <b>Morning Research Digest</b>\n\nNo research reports completed overnight."
	}

	var doneRuns []port.Research
	var failedRuns []port.Research
	for _, r := range runs {
		if r.Status == "done" {
			doneRuns = append(doneRuns, r)
		} else if r.Status == "failed" {
			failedRuns = append(failedRuns, r)
		}
	}

	var sb strings.Builder
	sb.WriteString("☀️ <b>Morning Research Digest</b>\n")
	if len(doneRuns) > 0 {
		sb.WriteString(fmt.Sprintf("%d report(s) ready:\n\n", len(doneRuns)))
		for i, r := range doneRuns {
			title := ""
			if cardTitles != nil {
				title = cardTitles[r.CardID]
			}
			if title == "" {
				title = fmt.Sprintf("Card #%d", r.CardID)
			}
			sb.WriteString(fmt.Sprintf("• <b>%s</b>\n", title))
			verdict := ""
			if r.Result != nil && r.Result.Verdict != nil {
				rec := strings.ToUpper(r.Result.Verdict.Recommendation)
				if rec != "" {
					verdict = rec
				}
				if r.Result.Verdict.Confidence != "" {
					if verdict != "" {
						verdict += fmt.Sprintf(" (%s confidence)", r.Result.Verdict.Confidence)
					} else {
						verdict = fmt.Sprintf("Confidence: %s", r.Result.Verdict.Confidence)
					}
				}
				if r.Result.Verdict.ForWhom != "" {
					verdict += " — " + r.Result.Verdict.ForWhom
				}
			} else if strings.TrimSpace(r.Findings) != "" {
				lines := strings.Split(strings.TrimSpace(r.Findings), "\n")
				verdict = strings.TrimSpace(lines[0])
			}
			if verdict != "" {
				sb.WriteString(fmt.Sprintf("Verdict: %s\n", verdict))
			}
			if baseURL != "" {
				sb.WriteString(fmt.Sprintf("🔗 %s/#card-%d\n", strings.TrimRight(baseURL, "/"), r.CardID))
			}
			if i < len(doneRuns)-1 {
				sb.WriteString("\n")
			}
		}
	} else {
		sb.WriteString("0 completed reports ready.\n")
	}

	if len(failedRuns) > 0 {
		if len(doneRuns) > 0 {
			sb.WriteString("\n")
		}
		sb.WriteString(fmt.Sprintf("⚠️ <b>Failures (%d):</b>\n", len(failedRuns)))
		for _, r := range failedRuns {
			title := ""
			if cardTitles != nil {
				title = cardTitles[r.CardID]
			}
			if title == "" {
				title = fmt.Sprintf("Card #%d", r.CardID)
			}
			errStr := r.Error
			if errStr == "" {
				errStr = "unknown error"
			}
			sb.WriteString(fmt.Sprintf("• <b>%s</b>: %s\n", title, errStr))
		}
	}

	return strings.TrimSpace(sb.String())
}

// GetResearchRules returns all configured research rules from settings.
func (s *Service) GetResearchRules(ctx context.Context) ([]port.ResearchRule, error) {
	if s.Store == nil {
		return []port.ResearchRule{}, nil
	}
	raw, err := s.Store.GetSetting(ctx, "research_rules")
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			return []port.ResearchRule{}, nil
		}
		return []port.ResearchRule{}, nil
	}
	if strings.TrimSpace(raw) == "" {
		return []port.ResearchRule{}, nil
	}
	var rules []port.ResearchRule
	if err := json.Unmarshal([]byte(raw), &rules); err != nil {
		return []port.ResearchRule{}, err
	}
	return rules, nil
}

// SaveResearchRule adds or updates a rule in settings.
func (s *Service) SaveResearchRule(ctx context.Context, rule port.ResearchRule) error {
	if s.Store == nil {
		return port.ErrNotFound
	}
	rules, err := s.GetResearchRules(ctx)
	if err != nil {
		rules = []port.ResearchRule{}
	}
	found := false
	for i, r := range rules {
		if r.ID == rule.ID {
			rules[i] = rule
			found = true
			break
		}
	}
	if !found {
		rules = append(rules, rule)
	}
	data, err := json.Marshal(rules)
	if err != nil {
		return err
	}
	return s.Store.SetSetting(ctx, "research_rules", string(data))
}

// DeleteResearchRule deletes a rule by ID from settings.
func (s *Service) DeleteResearchRule(ctx context.Context, id string) error {
	if s.Store == nil {
		return port.ErrNotFound
	}
	rules, err := s.GetResearchRules(ctx)
	if err != nil {
		return err
	}
	var filtered []port.ResearchRule
	for _, r := range rules {
		if r.ID != id {
			filtered = append(filtered, r)
		}
	}
	data, err := json.Marshal(filtered)
	if err != nil {
		return err
	}
	return s.Store.SetSetting(ctx, "research_rules", string(data))
}

// GetQuietWindow retrieves quiet window settings.
func (s *Service) GetQuietWindow(ctx context.Context) (bool, string, string, error) {
	if s.Store == nil {
		return false, "", "", nil
	}
	enabledStr, _ := s.Store.GetSetting(ctx, "quiet_window_enabled")
	start, _ := s.Store.GetSetting(ctx, "quiet_window_start")
	end, _ := s.Store.GetSetting(ctx, "quiet_window_end")
	return enabledStr == "true" || enabledStr == "1", start, end, nil
}

// SetQuietWindow saves quiet window settings.
func (s *Service) SetQuietWindow(ctx context.Context, enabled bool, start, end string) error {
	if s.Store == nil {
		return nil
	}
	enVal := "false"
	if enabled {
		enVal = "true"
	}
	if err := s.Store.SetSetting(ctx, "quiet_window_enabled", enVal); err != nil {
		return err
	}
	if err := s.Store.SetSetting(ctx, "quiet_window_start", start); err != nil {
		return err
	}
	return s.Store.SetSetting(ctx, "quiet_window_end", end)
}

func (s *Service) isRunAllowed(ctx context.Context, asOf time.Time) bool {
	enabled, start, end, err := s.GetQuietWindow(ctx)
	if err != nil || !enabled {
		return true
	}
	return IsInRunWindow(asOf, enabled, start, end)
}

// WakeQueueWorker wakes up queue worker immediately to check for pending work.
func (s *Service) WakeQueueWorker() {
	if s.queueWakeup != nil {
		select {
		case s.queueWakeup <- struct{}{}:
		default:
		}
	}
}

// ProcessNextQueued checks and processes one queued research item if allowed.
// Returns (true, err) if an item was processed, or (false, nil) if no item was processed.
func (s *Service) ProcessNextQueued(ctx context.Context, asOf time.Time) (bool, error) {
	if s.Store == nil {
		return false, nil
	}
	if !s.isRunAllowed(ctx, asOf) {
		return false, nil
	}

	s.workerMu.Lock()
	item, err := s.Store.GetNextQueuedResearch(ctx, asOf)
	if err != nil {
		s.workerMu.Unlock()
		return false, err
	}
	if item == nil {
		s.workerMu.Unlock()
		return false, nil
	}

	runningItem, err := s.Store.SetResearch(ctx, item.ID, "running", "", "")
	s.workerMu.Unlock()

	if err != nil {
		return false, err
	}

	card, err := s.Store.GetCard(ctx, runningItem.CardID)
	if err != nil {
		_, _ = s.Store.SetResearch(ctx, runningItem.ID, "failed", "", fmt.Sprintf("card not found: %v", err))
		return true, err
	}

	rsStatus := "researching"
	if _, cerr := s.Store.UpdateCard(ctx, card.ID, port.CardPatch{Status: &rsStatus}); cerr != nil {
		s.Logf("core: failed to set card %d to researching: %v", card.ID, cerr)
	}

	err = s.executeResearch(ctx, runningItem, card)
	return true, err
}

// ExecuteRule evaluates a single rule and queues matching cards.
func (s *Service) ExecuteRule(ctx context.Context, rule port.ResearchRule, asOf time.Time) ([]port.Research, error) {
	if s.Store == nil {
		return nil, nil
	}
	cards, err := s.Store.FindCardsForRule(ctx, rule.Filters, rule.MaxCards, asOf)
	if err != nil {
		return nil, err
	}
	if len(cards) == 0 {
		return nil, nil
	}

	cardIDs := make([]int64, len(cards))
	for i, c := range cards {
		cardIDs[i] = c.ID
	}

	batchID := fmt.Sprintf("rule_%s_%s", rule.ID, asOf.Format("20060102150405"))
	queued, err := s.Store.BatchQueueResearch(ctx, cardIDs, rule.PlaybookID, &asOf, batchID)
	if err != nil {
		return nil, err
	}
	s.WakeQueueWorker()
	return queued, nil
}

// EvaluateRules evaluates all configured rules against the current time.
func (s *Service) EvaluateRules(ctx context.Context, asOf time.Time) ([]port.Research, error) {
	rules, err := s.GetResearchRules(ctx)
	if err != nil {
		return nil, err
	}
	var totalQueued []port.Research
	for _, r := range rules {
		if !r.Enabled {
			continue
		}
		if !MatchSchedule(r.Time, asOf) {
			continue
		}
		if r.LastRunAt != nil && r.LastRunAt.Format("2006-01-02 15:04") == asOf.Format("2006-01-02 15:04") {
			continue
		}
		queued, err := s.ExecuteRule(ctx, r, asOf)
		if err != nil {
			s.Logf("core: execute rule %s failed: %v", r.ID, err)
			continue
		}
		totalQueued = append(totalQueued, queued...)
		r.LastRunAt = &asOf
		_ = s.SaveResearchRule(ctx, r)
	}
	return totalQueued, nil
}

// StartQueueWorker starts background workers to process queued research items
// sequentially (or up to s.QueueConcurrency) and evaluate research rules periodically.
func (s *Service) StartQueueWorker(parentCtx context.Context) {
	s.mu.Lock()
	if s.queueWorkerStop != nil {
		s.mu.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(parentCtx)
	s.queueWorkerStop = cancel
	if s.queueWakeup == nil {
		s.queueWakeup = make(chan struct{}, 1)
	}
	concurrency := s.QueueConcurrency
	if concurrency <= 0 {
		concurrency = 1
	}
	pollInterval := s.QueuePollInterval
	if pollInterval <= 0 {
		pollInterval = 1 * time.Second
	}
	s.mu.Unlock()

	// Recover any stale running tasks on startup
	if s.Store != nil {
		if recovered, err := s.Store.RecoverInterruptedResearch(ctx); err == nil && recovered > 0 {
			s.Logf("core: recovered %d interrupted research runs on startup", recovered)
		}
	}

	// Workers waitgroup
	var workerWG sync.WaitGroup

	// Rule evaluator ticker
	s.WG.Add(1)
	go func() {
		defer s.WG.Done()
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				_, _ = s.EvaluateRules(ctx, s.now())
			}
		}
	}()

	// Spawn concurrency workers
	for i := 0; i < concurrency; i++ {
		workerWG.Add(1)
		s.WG.Add(1)
		go func(workerID int) {
			defer s.WG.Done()
			defer workerWG.Done()

			ticker := time.NewTicker(pollInterval)
			defer ticker.Stop()

			for {
				select {
				case <-ctx.Done():
					return
				case <-s.queueWakeup:
				case <-ticker.C:
				}

				for {
					if ctx.Err() != nil {
						return
					}
					processed, err := s.ProcessNextQueued(ctx, s.now())
					if err != nil {
						s.Logf("core: queue worker %d error: %v", workerID, err)
					}
					if !processed {
						break
					}
				}
			}
		}(i)
	}
}

// StopQueueWorker stops any running background queue workers.
func (s *Service) StopQueueWorker() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.queueWorkerStop != nil {
		s.queueWorkerStop()
		s.queueWorkerStop = nil
	}
}
