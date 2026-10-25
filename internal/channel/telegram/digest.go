package telegram

import (
	"fmt"
	"strings"

	"sparkkeep/internal/i18n"
	"sparkkeep/internal/port"
)

// FormatMorningResearchDigest formats completed research runs for morning Telegram summary.
func FormatMorningResearchDigest(runs []port.Research, cardTitles map[int64]string, baseURL string, loc ...string) string {
	locale := "en"
	if len(loc) > 0 && loc[0] != "" {
		locale = loc[0]
	}
	m := i18n.GetMessages(locale)

	if len(runs) == 0 {
		return m.MorningDigestTitle + "\n\n" + m.NoResearchOvernight
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
	sb.WriteString(m.MorningDigestTitle + "\n")
	if len(doneRuns) > 0 {
		sb.WriteString(fmt.Sprintf(m.ReportsReady, len(doneRuns)))
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
						verdict += fmt.Sprintf(m.ConfidenceSuffix, r.Result.Verdict.Confidence)
					} else {
						verdict = fmt.Sprintf("%s: %s", m.Confidence, r.Result.Verdict.Confidence)
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
				sb.WriteString(fmt.Sprintf("%s: %s\n", m.Verdict, verdict))
			}
			if baseURL != "" {
				sb.WriteString(fmt.Sprintf("🔗 %s/#card-%d\n", strings.TrimRight(baseURL, "/"), r.CardID))
			}
			if i < len(doneRuns)-1 {
				sb.WriteString("\n")
			}
		}
	} else {
		sb.WriteString(m.NoReportsReady)
	}

	if len(failedRuns) > 0 {
		if len(doneRuns) > 0 {
			sb.WriteString("\n")
		}
		sb.WriteString(fmt.Sprintf(m.MorningFailures, len(failedRuns)))
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
				errStr = m.UnknownError
			}
			sb.WriteString(fmt.Sprintf("• <b>%s</b>: %s\n", title, errStr))
		}
	}

	return strings.TrimSpace(sb.String())
}
