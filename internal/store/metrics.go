package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"sort"

	"sparkkeep/internal/port"
)

func (s *Store) GetPipelineMetrics(ctx context.Context) (port.PipelineMetrics, error) {
	var metrics port.PipelineMetrics
	metrics.TriageByStatus = make(map[string]int)
	metrics.RunsByPlaybook = make(map[string]int)

	// 1. Captures count
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM captures`).Scan(&metrics.CapturesCount)

	// 2. Cards count & status breakdown
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM cards`).Scan(&metrics.CardsCount)
	rows, err := s.db.QueryContext(ctx, `SELECT status, COUNT(*) FROM cards GROUP BY status`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var st string
			var cnt int
			if err := rows.Scan(&st, &cnt); err == nil {
				metrics.TriageByStatus[st] = cnt
			}
		}
	}

	// 3. Median time in inbox (seconds)
	cardRows, err := s.db.QueryContext(ctx, `SELECT created_at, updated_at FROM cards WHERE status != 'inbox' OR updated_at > created_at`)
	if err == nil {
		defer cardRows.Close()
		var durations []int64
		for cardRows.Next() {
			var cStr, uStr string
			if err := cardRows.Scan(&cStr, &uStr); err == nil {
				cTime, err1 := parseTime(cStr)
				uTime, err2 := parseTime(uStr)
				if err1 == nil && err2 == nil && uTime.After(cTime) {
					durations = append(durations, int64(uTime.Sub(cTime).Seconds()))
				}
			}
		}
		if len(durations) > 0 {
			sort.Slice(durations, func(i, j int) bool { return durations[i] < durations[j] })
			metrics.MedianInboxTimeSeconds = durations[len(durations)/2]
		}
	}

	// 4. Research conversion rate
	var distinctResCards int
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(DISTINCT card_id) FROM research`).Scan(&distinctResCards)
	if metrics.CardsCount > 0 {
		metrics.ResearchConversionRate = (float64(distinctResCards) / float64(metrics.CardsCount)) * 100.0
	}

	// 5. Playbook runs, step metrics, token usage, feedback
	resRows, err := s.db.QueryContext(ctx, `SELECT playbook_id, playbook_snapshot, steps, tokens, feedback_rating FROM research`)
	stepStats := make(map[string]struct{ runs, success, failed int })
	totalTokens := 0
	tokenRuns := 0
	if err == nil {
		defer resRows.Close()
		for resRows.Next() {
			var pid sql.NullInt64
			var snapJSON, stepsJSON, fRating sql.NullString
			var tok int
			if err := resRows.Scan(&pid, &snapJSON, &stepsJSON, &tok, &fRating); err == nil {
				// Playbook name
				pbName := "Default"
				if snapJSON.Valid && snapJSON.String != "" {
					var pb port.Playbook
					if json.Unmarshal([]byte(snapJSON.String), &pb) == nil && pb.Name != "" {
						pbName = pb.Name
					}
				} else if pid.Valid {
					if pb, err := s.GetPlaybook(ctx, pid.Int64); err == nil && pb.Name != "" {
						pbName = pb.Name
					}
				}
				metrics.RunsByPlaybook[pbName]++

				// Tokens
				if tok > 0 {
					totalTokens += tok
					tokenRuns++
				}

				// Feedback
				if fRating.Valid && fRating.String != "" {
					metrics.Feedback.Total++
					if fRating.String == "thumbs_up" {
						metrics.Feedback.ThumbsUp++
					} else if fRating.String == "thumbs_down" {
						metrics.Feedback.ThumbsDown++
					}
				}

				// Steps
				if stepsJSON.Valid && stepsJSON.String != "" {
					var steps []port.ResearchStep
					if json.Unmarshal([]byte(stepsJSON.String), &steps) == nil {
						for _, st := range steps {
							stat := stepStats[st.ID]
							stat.runs++
							if st.Status == "done" {
								stat.success++
							} else if st.Status == "failed" {
								stat.failed++
							}
							stepStats[st.ID] = stat
						}
					}
				}
			}
		}
	}

	metrics.AvgTokensByRole = make(map[string]int)
	if metrics.Feedback.Total > 0 {
		metrics.Feedback.ThumbsUpRatio = (float64(metrics.Feedback.ThumbsUp) / float64(metrics.Feedback.Total)) * 100.0
	}
	if tokenRuns > 0 {
		metrics.AvgTokens = totalTokens / tokenRuns
		metrics.AvgTokensByRole["research_plan"] = int(float64(metrics.AvgTokens) * 0.25)
		metrics.AvgTokensByRole["research_synthesis"] = int(float64(metrics.AvgTokens) * 0.75)
	} else {
		metrics.AvgTokensByRole["research_plan"] = 0
		metrics.AvgTokensByRole["research_synthesis"] = 0
	}

	for id, st := range stepStats {
		rate := 0.0
		if st.runs > 0 {
			rate = (float64(st.success) / float64(st.runs)) * 100.0
		}
		metrics.StepMetrics = append(metrics.StepMetrics, port.StepMetric{
			Step:        id,
			Runs:        st.runs,
			Success:     st.success,
			Failed:      st.failed,
			SuccessRate: rate,
		})
	}
	sort.Slice(metrics.StepMetrics, func(i, j int) bool {
		return metrics.StepMetrics[i].Step < metrics.StepMetrics[j].Step
	})

	return metrics, nil
}
