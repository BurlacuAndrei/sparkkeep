package feed

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"html/template"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	"sparkkeep/internal/port"
)

// FeedFilter holds query parameters for filtering the feed
type FeedFilter struct {
	Status       []string
	Type         []string
	ResearchOnly bool
	Since        *time.Time
	Limit        int
}

// RSS 2.0 structures
type rssChannel struct {
	Title       string    `xml:"title"`
	Link        string    `xml:"link"`
	Description string    `xml:"description"`
	Items       []rssItem `xml:"item"`
}

type rssItem struct {
	Title      string        `xml:"title"`
	Link       string        `xml:"link"`
	GUID       rssGUID       `xml:"guid"`
	PubDate    string        `xml:"pubDate"`
	Creator    string        `xml:"dc:creator"`
	Categories []string      `xml:"category"`
	ContentEnc template.HTML `xml:"content:encoded"`
}

type rssGUID struct {
	IsPermaLink bool   `xml:"isPermaLink,attr"`
	Value       string `xml:",chardata"`
}

type rssRoot struct {
	XMLName   xml.Name   `xml:"rss"`
	Version   string     `xml:"version,attr"`
	ContentNs string     `xml:"xmlns:content,attr"`
	DcNs      string     `xml:"xmlns:dc,attr"`
	Channel   rssChannel `xml:"channel"`
}

// GenerateFeed generates RSS 2.0 XML for the outbox feed
func GenerateFeed(ctx context.Context, store port.Store, token string, filter FeedFilter) ([]byte, error) {
	// 1. Validate token
	valid, err := ValidateToken(ctx, store, token)
	if err != nil {
		return nil, err
	}
	if !valid {
		return nil, fmt.Errorf("invalid token")
	}

	// 2. Query cards with filter
	cards, err := queryCards(ctx, store, filter)
	if err != nil {
		return nil, err
	}

	// 3. Get origin for links
	origin := getOrigin(ctx, store)
	if origin == "" {
		origin = "https://sparkkeep.local"
	}

	// 4. Build RSS items
	items := make([]rssItem, 0, len(cards))
	for _, card := range cards {
		// Get latest completed research
		var latestResearch *port.Research
		history, err := store.ListResearchByCard(ctx, card.ID)
		if err == nil && len(history) > 0 {
			for i := len(history) - 1; i >= 0; i-- {
				if history[i].Status == port.ResearchStateDone || history[i].Status == "done" {
					latestResearch = &history[i]
					break
				}
			}
		}

		item := buildRSSItem(card, latestResearch, origin)
		items = append(items, item)
	}

	// 5. Generate RSS XML
	feed := rssRoot{
		Version:   "2.0",
		ContentNs: "http://purl.org/rss/1.0/modules/content/",
		DcNs:      "http://purl.org/dc/elements/1.1/",
		Channel: rssChannel{
			Title:       "Sparkkeep Outbox",
			Link:        origin,
			Description: "Curated cards and research dossiers from Sparkkeep",
			Items:       items,
		},
	}

	output, err := xml.MarshalIndent(feed, "", "  ")
	if err != nil {
		return nil, err
	}

	// Add XML declaration
	return append([]byte(xml.Header), output...), nil
}

// queryCards queries cards with the given filter
func queryCards(ctx context.Context, store port.Store, filter FeedFilter) ([]port.Card, error) {
	// Build filter for store.ListCards
	cardFilter := port.CardFilter{
		Limit: filter.Limit,
	}

	if filter.Limit <= 0 {
		cardFilter.Limit = 100
	}
	if cardFilter.Limit > 100 {
		cardFilter.Limit = 100
	}

	if filter.Since != nil {
		cardFilter.Since = *filter.Since
	}

	// Get all cards first, then filter in memory for status/type/research_only
	// since the store doesn't support multi-value status/type filters
	cards, err := store.ListCards(ctx, cardFilter)
	if err != nil {
		return nil, err
	}

	// Filter by status
	if len(filter.Status) > 0 {
		statusSet := make(map[string]bool)
		for _, s := range filter.Status {
			statusSet[strings.ToLower(strings.TrimSpace(s))] = true
		}
		filtered := cards[:0]
		for _, c := range cards {
			if statusSet[strings.ToLower(c.Status)] {
				filtered = append(filtered, c)
			}
		}
		cards = filtered
	}

	// Filter by type
	if len(filter.Type) > 0 {
		typeSet := make(map[string]bool)
		for _, t := range filter.Type {
			typeSet[strings.ToLower(strings.TrimSpace(t))] = true
		}
		filtered := cards[:0]
		for _, c := range cards {
			if typeSet[strings.ToLower(c.Type)] {
				filtered = append(filtered, c)
			}
		}
		cards = filtered
	}

	// Filter by research_only
	if filter.ResearchOnly {
		filtered := cards[:0]
		for _, c := range cards {
			history, err := store.ListResearchByCard(ctx, c.ID)
			if err == nil {
				hasDone := false
				for i := len(history) - 1; i >= 0; i-- {
					if history[i].Status == port.ResearchStateDone || history[i].Status == "done" {
						hasDone = true
						break
					}
				}
				if hasDone {
					filtered = append(filtered, c)
				}
			}
		}
		cards = filtered
	}

	return cards, nil
}

// buildRSSItem creates an RSS item from a card and its research
func buildRSSItem(card port.Card, research *port.Research, origin string) rssItem {
	link := fmt.Sprintf("%s/cards/%d", origin, card.ID)
	pubDate := card.CreatedAt.UTC().Format(time.RFC1123Z)

	// Build HTML content
	htmlContent := buildItemHTML(card, research, origin)

	return rssItem{
		Title:      card.Title,
		Link:       link,
		GUID:       rssGUID{IsPermaLink: true, Value: link},
		PubDate:    pubDate,
		Creator:    "Sparkkeep",
		Categories: []string{card.Type, card.Horizon, card.Status},
		ContentEnc: template.HTML(htmlContent),
	}
}

// buildItemHTML builds the full HTML content for an RSS item
func buildItemHTML(card port.Card, research *port.Research, origin string) string {
	var b strings.Builder

	link := fmt.Sprintf("%s/cards/%d", origin, card.ID)

	// Card header
	b.WriteString("<div style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937;\">")

	// Title and meta
	b.WriteString(fmt.Sprintf("<h2 style=\"margin: 0 0 8px 0; font-size: 1.25rem; color: #111827;\">%s</h2>", xmlEscape(card.Title)))
	b.WriteString(fmt.Sprintf("<p style=\"margin: 0 0 16px 0; font-size: 0.875rem; color: #6b7280;\">"))
	b.WriteString(fmt.Sprintf("<span style=\"background: #e5e7eb; padding: 2px 8px; border-radius: 9999px; font-size: 0.75rem; margin-right: 8px;\">%s</span>", xmlEscape(card.Type)))
	b.WriteString(fmt.Sprintf("<span style=\"background: #dbeafe; padding: 2px 8px; border-radius: 9999px; font-size: 0.75rem; margin-right: 8px;\">%s</span>", xmlEscape(card.Horizon)))
	b.WriteString(fmt.Sprintf("<span style=\"background: #fef3c7; padding: 2px 8px; border-radius: 9999px; font-size: 0.75rem;\">%s</span>", xmlEscape(card.Status)))
	b.WriteString("</p>")

	// Executive Summary
	if card.ExecutiveSummary != "" {
		b.WriteString("<div style=\"margin-bottom: 16px;\">")
		b.WriteString("<h3 style=\"margin: 0 0 8px 0; font-size: 1rem; color: #374151;\">Executive Summary</h3>")
		b.WriteString(fmt.Sprintf("<p style=\"margin: 0; color: #374151;\">%s</p>", markdownToHTML(card.ExecutiveSummary)))
		b.WriteString("</div>")
	}

	// Value Proposition / Why Care
	if card.ValueProposition != "" {
		b.WriteString("<div style=\"margin-bottom: 16px;\">")
		b.WriteString("<h3 style=\"margin: 0 0 8px 0; font-size: 1rem; color: #374151;\">Why This Matters</h3>")
		b.WriteString(fmt.Sprintf("<p style=\"margin: 0; color: #374151;\">%s</p>", markdownToHTML(card.ValueProposition)))
		b.WriteString("</div>")
	}

	// Proposed Actions
	if len(card.ProposedActions) > 0 {
		b.WriteString("<div style=\"margin-bottom: 16px;\">")
		b.WriteString("<h3 style=\"margin: 0 0 8px 0; font-size: 1rem; color: #374151;\">Proposed Actions</h3>")
		b.WriteString("<ul style=\"margin: 0; padding-left: 20px;\">")
		for _, action := range card.ProposedActions {
			checked := false
			for _, completed := range card.CompletedActions {
				if completed == action {
					checked = true
					break
				}
			}
			if checked {
				b.WriteString(fmt.Sprintf("<li style=\"margin: 4px 0;\"><input type=\"checkbox\" checked disabled style=\"margin-right: 8px;\"> <del>%s</del></li>", xmlEscape(action)))
			} else {
				b.WriteString(fmt.Sprintf("<li style=\"margin: 4px 0;\"><input type=\"checkbox\" disabled style=\"margin-right: 8px;\"> %s</li>", xmlEscape(action)))
			}
		}
		b.WriteString("</ul>")
		b.WriteString("</div>")
	}

	// Research Dossier
	if research != nil && research.Findings != "" {
		b.WriteString("<div style=\"margin-bottom: 16px; padding: 16px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;\">")
		b.WriteString("<h3 style=\"margin: 0 0 12px 0; font-size: 1rem; color: #374151;\">📋 Research Dossier</h3>")

		if research.Query != "" {
			b.WriteString(fmt.Sprintf("<p style=\"margin: 0 0 12px 0; font-size: 0.875rem; color: #6b7280;\"><strong>Query:</strong> %s</p>", xmlEscape(research.Query)))
		}

		// Render findings as markdown
		b.WriteString(fmt.Sprintf("<div style=\"color: #374151;\">%s</div>", markdownToHTML(research.Findings)))

		// Verdict if present
		if research.Result != nil && research.Result.Verdict != nil {
			v := research.Result.Verdict
			badgeColor := "#d1fae5"
			badgeTextColor := "#065f46"
			switch v.Recommendation {
			case "watch":
				badgeColor = "#fef3c7"
				badgeTextColor = "#92400e"
			case "skip":
				badgeColor = "#fee2e2"
				badgeTextColor = "#991b1b"
			}
			b.WriteString(fmt.Sprintf("<div style=\"margin-top: 16px; padding: 12px; background: %s; border-radius: 6px;\">", badgeColor))
			b.WriteString(fmt.Sprintf("<strong style=\"color: %s;\">Recommendation: %s</strong> (Confidence: %s)", badgeTextColor, strings.Title(v.Recommendation), strings.Title(v.Confidence)))
			if v.ForWhom != "" {
				b.WriteString(fmt.Sprintf("<br><span style=\"font-size: 0.875rem; color: %s;\">For: %s</span>", badgeTextColor, xmlEscape(v.ForWhom)))
			}
			if len(v.NextActions) > 0 {
				b.WriteString("<ul style=\"margin: 8px 0 0 0; padding-left: 20px;\">")
				for _, a := range v.NextActions {
					b.WriteString(fmt.Sprintf("<li style=\"font-size: 0.875rem;\">%s</li>", xmlEscape(a)))
				}
				b.WriteString("</ul>")
			}
			b.WriteString("</div>")
		}

		// Claims
		if research.Result != nil && len(research.Result.Claims) > 0 {
			b.WriteString("<div style=\"margin-top: 16px;\">")
			b.WriteString("<h4 style=\"margin: 0 0 8px 0; font-size: 0.875rem; color: #374151;\">Claim Verification</h4>")
			b.WriteString("<table style=\"width: 100%%; border-collapse: collapse; font-size: 0.875rem;\">")
			b.WriteString("<thead><tr style=\"border-bottom: 1px solid #e5e7eb;\"><th style=\"text-align: left; padding: 4px 8px;\">Claim</th><th style=\"text-align: left; padding: 4px 8px;\">Status</th><th style=\"text-align: left; padding: 4px 8px;\">Rationale</th></tr></thead>")
			b.WriteString("<tbody>")
			for _, claim := range research.Result.Claims {
				statusColor := "#059669"
				switch claim.Status {
				case "disputed":
					statusColor = "#dc2626"
				case "unverified":
					statusColor = "#d97706"
				}
				b.WriteString(fmt.Sprintf("<tr style=\"border-bottom: 1px solid #e5e7eb;\"><td style=\"padding: 4px 8px;\">%s</td><td style=\"padding: 4px 8px; color: %s;\">%s</td><td style=\"padding: 4px 8px;\">%s</td></tr>", xmlEscape(claim.Claim), statusColor, xmlEscape(claim.Status), xmlEscape(claim.Rationale)))
			}
			b.WriteString("</tbody></table>")
			b.WriteString("</div>")
		}

		// Sources
		if len(research.Sources) > 0 {
			b.WriteString("<div style=\"margin-top: 16px;\">")
			b.WriteString("<h4 style=\"margin: 0 0 8px 0; font-size: 0.875rem; color: #374151;\">Sources</h4>")
			b.WriteString("<ul style=\"margin: 0; padding-left: 20px; font-size: 0.875rem;\">")
			for _, src := range research.Sources {
				b.WriteString(fmt.Sprintf("<li><a href=\"%s\" style=\"color: #2563eb;\" target=\"_blank\" rel=\"noopener\">%s</a> <span style=\"color: #9ca3af;\">[%s]</span></li>", xmlEscape(src.URL), xmlEscape(src.Title), xmlEscape(src.Origin)))
			}
			b.WriteString("</ul>")
			b.WriteString("</div>")
		}

		b.WriteString("</div>")
	}

	// References
	if len(card.References) > 0 {
		b.WriteString("<div style=\"margin-bottom: 16px;\">")
		b.WriteString("<h3 style=\"margin: 0 0 8px 0; font-size: 1rem; color: #374151;\">References</h3>")
		b.WriteString("<ul style=\"margin: 0; padding-left: 20px;\">")
		for _, ref := range card.References {
			if ref.URL != "" {
				b.WriteString(fmt.Sprintf("<li><a href=\"%s\" style=\"color: #2563eb;\" target=\"_blank\" rel=\"noopener\">%s</a>", xmlEscape(ref.URL), xmlEscape(ref.Label)))
				if ref.Kind != "" {
					b.WriteString(fmt.Sprintf(" <span style=\"color: #9ca3af; font-size: 0.875rem;\">[%s]</span>", xmlEscape(ref.Kind)))
				}
				b.WriteString("</li>")
			} else {
				b.WriteString(fmt.Sprintf("<li>%s", xmlEscape(ref.Label)))
				if ref.Kind != "" {
					b.WriteString(fmt.Sprintf(" <span style=\"color: #9ca3af; font-size: 0.875rem;\">[%s]</span>", xmlEscape(ref.Kind)))
				}
				b.WriteString("</li>")
			}
		}
		b.WriteString("</ul>")
		b.WriteString("</div>")
	}

	// Source link
	b.WriteString(fmt.Sprintf("<p style=\"margin: 16px 0 0 0; font-size: 0.875rem; color: #9ca3af;\"><a href=\"%s\" style=\"color: #6b7280;\" target=\"_blank\" rel=\"noopener\">View in Sparkkeep →</a></p>", xmlEscape(link)))

	b.WriteString("</div>")

	return b.String()
}

// xmlEscape escapes special XML characters
func xmlEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&")
	s = strings.ReplaceAll(s, "<", "<")
	s = strings.ReplaceAll(s, ">", ">")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	s = strings.ReplaceAll(s, "'", "&apos;")
	return s
}

// markdownToHTML converts basic markdown to HTML (simplified)
func markdownToHTML(md string) string {
	// Simple markdown conversion for common patterns
	// This is a basic implementation - could be enhanced with a proper markdown library
	html := xmlEscape(md)

	// Convert **bold** to <strong>
	for {
		idx := strings.Index(html, "**")
		if idx == -1 {
			break
		}
		html = html[:idx] + "<strong>" + html[idx+2:]
		idx2 := strings.Index(html, "**")
		if idx2 == -1 {
			break
		}
		html = html[:idx2] + "</strong>" + html[idx2+2:]
	}

	// Convert *italic* to <em>
	for {
		idx := strings.Index(html, "*")
		if idx == -1 {
			break
		}
		html = html[:idx] + "<em>" + html[idx+1:]
		idx2 := strings.Index(html, "*")
		if idx2 == -1 {
			break
		}
		html = html[:idx2] + "</em>" + html[idx2+1:]
	}

	// Convert newlines to <br>
	html = strings.ReplaceAll(html, "\n", "<br>")

	return html
}

// getOrigin returns the origin URL from settings
func getOrigin(ctx context.Context, store port.Store) string {
	if store == nil {
		return ""
	}
	val, err := store.GetSetting(ctx, "origin")
	if err != nil || val == "" {
		return ""
	}
	return val
}

// GenerateFeedToken generates a new random feed token (32 bytes, hex encoded)
func GenerateFeedToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// HashFeedToken hashes a feed token using bcrypt
func HashFeedToken(token string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(token), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// ValidateToken validates the feed token using constant-time comparison against bcrypt hash
func ValidateToken(ctx context.Context, store port.Store, providedToken string) (bool, error) {
	if providedToken == "" {
		return false, nil
	}

	storedHash, err := store.GetSetting(ctx, "outbox_feed_token")
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			return false, nil
		}
		return false, err
	}

	if storedHash == "" {
		return false, nil
	}

	// Use bcrypt to compare
	err = bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(providedToken))
	if err != nil {
		return false, nil
	}

	return true, nil
}
