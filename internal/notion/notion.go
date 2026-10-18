package notion

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"sparkkeep/internal/port"
)

const (
	notionAPIBase     = "https://api.notion.com/v1"
	notionAPIVersion  = "2022-06-28"
	maxBlockChars     = 2000
	maxBlocksPerBatch = 100
)

// Config holds Notion integration settings.
type Config struct {
	Token      string // Internal Integration Token (secret_...)
	DatabaseID string // Target database ID
}

// Client is a Notion API client for Sparkkeep exports.
type Client struct {
	config Config
	http   *http.Client
}

// NewClient creates a new Notion client.
func NewClient(config Config) *Client {
	return &Client{
		config: config,
		http: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// SinkTestResult matches port.SinkTestResult for test connection results.
type SinkTestResult = port.SinkTestResult

// TestConnection validates the Notion token and database access.
func (c *Client) TestConnection(ctx context.Context) (SinkTestResult, error) {
	if c.config.Token == "" {
		return SinkTestResult{
			Success: false,
			Message: "Notion token is required",
		}, nil
	}
	if c.config.DatabaseID == "" {
		return SinkTestResult{
			Success: false,
			Message: "Notion database ID is required",
		}, nil
	}

	// Test token by retrieving the database
	url := fmt.Sprintf("%s/databases/%s", notionAPIBase, c.config.DatabaseID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return SinkTestResult{Success: false, Message: err.Error()}, err
	}
	c.setHeaders(req)

	resp, err := c.http.Do(req)
	if err != nil {
		return SinkTestResult{Success: false, Message: err.Error()}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 401 {
		return SinkTestResult{
			Success: false,
			Message: "Invalid Notion token (401 Unauthorized)",
		}, nil
	}
	if resp.StatusCode == 404 {
		return SinkTestResult{
			Success: false,
			Message: "Database not found (404) - check database ID and integration access",
		}, nil
	}
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return SinkTestResult{
			Success: false,
			Message: fmt.Sprintf("Notion API error %d: %s", resp.StatusCode, string(body)),
		}, nil
	}

	var dbResp struct {
		ID    string `json:"id"`
		Title []struct {
			PlainText string `json:"plain_text"`
		} `json:"title"`
		Properties map[string]json.RawMessage `json:"properties"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&dbResp); err != nil {
		return SinkTestResult{Success: false, Message: err.Error()}, err
	}

	title := ""
	if len(dbResp.Title) > 0 {
		title = dbResp.Title[0].PlainText
	}

	return SinkTestResult{
		Success: true,
		Message: fmt.Sprintf("Connected to Notion database: %s", title),
		Details: map[string]any{
			"database_id":    dbResp.ID,
			"database_title": title,
			"properties":     len(dbResp.Properties),
		},
	}, nil
}

// Property schema for database provisioning.
type databaseProperty struct {
	ID          string         `json:"id,omitempty"`
	Name        string         `json:"name"`
	Type        string         `json:"type"`
	Number      map[string]any `json:"number,omitempty"`
	Select      map[string]any `json:"select,omitempty"`
	MultiSelect map[string]any `json:"multi_select,omitempty"`
	URL         map[string]any `json:"url,omitempty"`
	Date        map[string]any `json:"date,omitempty"`
	Checkbox    map[string]any `json:"checkbox,omitempty"`
	Title       map[string]any `json:"title,omitempty"`
	RichText    map[string]any `json:"rich_text,omitempty"`
}

// EnsureDatabaseSchema provisions missing properties in the target database.
func (c *Client) EnsureDatabaseSchema(ctx context.Context) error {
	if c.config.Token == "" || c.config.DatabaseID == "" {
		return errors.New("notion: token and database_id required")
	}

	// Get current database schema
	url := fmt.Sprintf("%s/databases/%s", notionAPIBase, c.config.DatabaseID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	c.setHeaders(req)

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("notion: get database failed: %s", string(body))
	}

	var dbResp struct {
		Properties map[string]json.RawMessage `json:"properties"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&dbResp); err != nil {
		return err
	}

	// Define required properties
	requiredProps := map[string]databaseProperty{
		"Sparkkeep ID": {
			Name:   "Sparkkeep ID",
			Type:   "number",
			Number: map[string]any{},
		},
		"Card Type": {
			Name: "Card Type",
			Type: "select",
			Select: map[string]any{
				"options": []map[string]string{
					{"name": "article", "color": "blue"},
					{"name": "video", "color": "purple"},
					{"name": "book", "color": "green"},
					{"name": "guide", "color": "yellow"},
					{"name": "product", "color": "orange"},
					{"name": "place", "color": "pink"},
					{"name": "idea", "color": "gray"},
					{"name": "claim", "color": "red"},
					{"name": "tutorial", "color": "brown"},
					{"name": "repo", "color": "default"},
					{"name": "company", "color": "default"},
					{"name": "paper", "color": "default"},
					{"name": "quote", "color": "default"},
					{"name": "other", "color": "default"},
				},
			},
		},
		"Horizon": {
			Name: "Horizon",
			Type: "select",
			Select: map[string]any{
				"options": []map[string]string{
					{"name": "short-term", "color": "green"},
					{"name": "medium-term", "color": "yellow"},
					{"name": "long-term", "color": "red"},
				},
			},
		},
		"Status": {
			Name: "Status",
			Type: "select",
			Select: map[string]any{
				"options": []map[string]string{
					{"name": "inbox", "color": "gray"},
					{"name": "to-do", "color": "blue"},
					{"name": "in-progress", "color": "yellow"},
					{"name": "review", "color": "purple"},
					{"name": "done", "color": "green"},
					{"name": "shelved", "color": "gray"},
					{"name": "dismissed", "color": "red"},
				},
			},
		},
		"Tags": {
			Name: "Tags",
			Type: "multi_select",
			MultiSelect: map[string]any{
				"options": []map[string]string{},
			},
		},
		"Source URL": {
			Name: "Source URL",
			Type: "url",
			URL:  map[string]any{},
		},
		"Created At": {
			Name: "Created At",
			Type: "date",
			Date: map[string]any{},
		},
		"Updated At": {
			Name: "Updated At",
			Type: "date",
			Date: map[string]any{},
		},
		"Researched": {
			Name:     "Researched",
			Type:     "checkbox",
			Checkbox: map[string]any{},
		},
	}

	// Check which properties are missing
	toAdd := make(map[string]databaseProperty)
	for name, prop := range requiredProps {
		if _, exists := dbResp.Properties[name]; !exists {
			toAdd[name] = prop
		}
	}

	if len(toAdd) == 0 {
		return nil // All properties exist
	}

	// Build patch payload
	patchProps := make(map[string]databaseProperty)
	for name, prop := range toAdd {
		patchProps[name] = prop
	}

	payload := map[string]any{
		"properties": patchProps,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	// PATCH database to add properties
	patchURL := fmt.Sprintf("%s/databases/%s", notionAPIBase, c.config.DatabaseID)
	patchReq, err := http.NewRequestWithContext(ctx, http.MethodPatch, patchURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	c.setHeaders(patchReq)

	patchResp, err := c.http.Do(patchReq)
	if err != nil {
		return err
	}
	defer patchResp.Body.Close()

	if patchResp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(patchResp.Body)
		return fmt.Errorf("notion: provision properties failed: %s", string(respBody))
	}

	return nil
}

// UpsertCardExport performs idempotent upsert of a card export to Notion.
func (c *Client) UpsertCardExport(ctx context.Context, exp port.CardExport) (string, error) {
	if c.config.Token == "" || c.config.DatabaseID == "" {
		return "", errors.New("notion: token and database_id required")
	}

	card := exp.Card

	// 1. Query for existing page by Sparkkeep ID
	pageID, err := c.findPageBySparkkeepID(ctx, card.ID)
	if err != nil {
		return "", err
	}

	// 2. Build properties payload
	props := c.buildProperties(card, exp.Research != nil)

	// 3. Build blocks from markdown content
	blocks, err := c.buildBlocks(exp)
	if err != nil {
		return "", err
	}

	if pageID != "" {
		// Update existing page
		if err := c.updatePage(ctx, pageID, props, blocks); err != nil {
			return "", err
		}
		return pageID, nil
	}

	// Create new page
	return c.createPage(ctx, props, blocks)
}

// findPageBySparkkeepID queries the database for a page with matching Sparkkeep ID.
func (c *Client) findPageBySparkkeepID(ctx context.Context, sparkkeepID int64) (string, error) {
	url := fmt.Sprintf("%s/databases/%s/query", notionAPIBase, c.config.DatabaseID)

	filter := map[string]any{
		"filter": map[string]any{
			"property": "Sparkkeep ID",
			"number":   map[string]any{"equals": sparkkeepID},
		},
		"page_size": 1,
	}

	body, err := json.Marshal(filter)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	c.setHeaders(req)

	resp, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("notion: query failed: %s", string(respBody))
	}

	var queryResp struct {
		Results []struct {
			ID string `json:"id"`
		} `json:"results"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&queryResp); err != nil {
		return "", err
	}

	if len(queryResp.Results) > 0 {
		return queryResp.Results[0].ID, nil
	}
	return "", nil
}

// buildProperties creates the Notion page properties from a card.
func (c *Client) buildProperties(card port.Card, researched bool) map[string]any {
	props := map[string]any{
		"Sparkkeep ID": map[string]any{
			"number": card.ID,
		},
		"Card Type": map[string]any{
			"select": map[string]any{
				"name": card.Type,
			},
		},
		"Horizon": map[string]any{
			"select": map[string]any{
				"name": card.Horizon,
			},
		},
		"Status": map[string]any{
			"select": map[string]any{
				"name": card.Status,
			},
		},
		"Source URL": map[string]any{
			"url": card.SourceURL,
		},
		"Created At": map[string]any{
			"date": map[string]any{
				"start": card.CreatedAt.Format(time.RFC3339),
			},
		},
		"Updated At": map[string]any{
			"date": map[string]any{
				"start": card.UpdatedAt.Format(time.RFC3339),
			},
		},
		"Researched": map[string]any{
			"checkbox": researched,
		},
	}

	// Tags (multi_select)
	if len(card.Tags) > 0 {
		tagOptions := make([]map[string]string, len(card.Tags))
		for i, tag := range card.Tags {
			tagOptions[i] = map[string]string{"name": tag}
		}
		props["Tags"] = map[string]any{
			"multi_select": tagOptions,
		}
	} else {
		props["Tags"] = map[string]any{
			"multi_select": []map[string]string{},
		}
	}

	return props
}

// buildBlocks converts the card export to Notion blocks.
func (c *Client) buildBlocks(exp port.CardExport) ([]map[string]any, error) {
	var blocks []map[string]any
	card := exp.Card

	// Title as heading_1
	blocks = append(blocks, headingBlock(1, card.Title))

	// Executive Summary / Summary
	if card.ExecutiveSummary != "" {
		blocks = append(blocks, headingBlock(2, "Executive Summary"))
		blocks = append(blocks, paragraphBlocks(card.ExecutiveSummary)...)
	} else if card.Summary != "" {
		blocks = append(blocks, headingBlock(2, "Summary"))
		blocks = append(blocks, paragraphBlocks(card.Summary)...)
	}

	// Value Proposition
	if card.ValueProposition != "" {
		blocks = append(blocks, headingBlock(2, "Value Proposition"))
		blocks = append(blocks, paragraphBlocks(card.ValueProposition)...)
	}

	// Proposed Actions
	if len(card.ProposedActions) > 0 {
		blocks = append(blocks, headingBlock(2, "Proposed Actions"))
		for _, action := range card.ProposedActions {
			blocks = append(blocks, toDoBlock(action, false))
		}
	}

	// Source Note
	if card.SourceNote != "" {
		blocks = append(blocks, headingBlock(2, "Source Notes"))
		blocks = append(blocks, paragraphBlocks(card.SourceNote)...)
	}

	// References
	if len(card.References) > 0 {
		blocks = append(blocks, headingBlock(2, "References"))
		for _, ref := range card.References {
			if ref.URL != "" {
				blocks = append(blocks, bulletedListItemBlock(fmt.Sprintf("[%s](%s) (%s)", ref.Label, ref.URL, ref.Kind)))
			} else {
				blocks = append(blocks, bulletedListItemBlock(fmt.Sprintf("%s (%s)", ref.Label, ref.Kind)))
			}
		}
	}

	// Research Dossier
	if exp.Research != nil {
		blocks = append(blocks, c.buildResearchDossierBlocks(exp.Research)...)
	}

	return blocks, nil
}

// buildResearchDossierBlocks creates callout block for research dossier.
func (c *Client) buildResearchDossierBlocks(res *port.Research) []map[string]any {
	var blocks []map[string]any

	playbookName := "Deep Research"
	if res.PlaybookSnapshot != nil && res.PlaybookSnapshot.Name != "" {
		playbookName = res.PlaybookSnapshot.Name
	}

	completedAt := res.CreatedAt
	for _, s := range res.Steps {
		if !s.FinishedAt.IsZero() && s.FinishedAt.After(completedAt) {
			completedAt = s.FinishedAt
		}
	}

	// Build callout content
	calloutChildren := []map[string]any{
		paragraphBlock(fmt.Sprintf("**Playbook:** %s", playbookName)),
		paragraphBlock(fmt.Sprintf("**Completed:** %s", completedAt.Format(time.RFC3339))),
	}

	if strings.TrimSpace(res.Findings) != "" {
		calloutChildren = append(calloutChildren, paragraphBlock("**Findings**"))
		// Split findings into paragraphs/bullets
		findingsLines := strings.Split(strings.TrimSpace(res.Findings), "\n")
		for _, line := range findingsLines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			if strings.HasPrefix(line, "- ") || strings.HasPrefix(line, "* ") {
				calloutChildren = append(calloutChildren, bulletedListItemBlock(strings.TrimPrefix(strings.TrimPrefix(line, "- "), "* ")))
			} else {
				calloutChildren = append(calloutChildren, paragraphBlock(line))
			}
		}
	}

	// Add claims, sources, verdict if available in result
	if res.Result != nil {
		if len(res.Result.Claims) > 0 {
			calloutChildren = append(calloutChildren, paragraphBlock("**Claims**"))
			for _, claim := range res.Result.Claims {
				calloutChildren = append(calloutChildren, bulletedListItemBlock(fmt.Sprintf("%s — %s", claim.Claim, claim.Status)))
				if claim.Rationale != "" {
					calloutChildren = append(calloutChildren, bulletedListItemBlock(fmt.Sprintf("  Rationale: %s", claim.Rationale)))
				}
			}
		}
		if len(res.Result.Landscape) > 0 {
			calloutChildren = append(calloutChildren, paragraphBlock("**Landscape**"))
			for _, item := range res.Result.Landscape {
				calloutChildren = append(calloutChildren, bulletedListItemBlock(fmt.Sprintf("%s: %s", item.Name, item.OneLiner)))
			}
		}
		if res.Result.Verdict != nil {
			calloutChildren = append(calloutChildren, paragraphBlock("**Verdict**"))
			calloutChildren = append(calloutChildren, bulletedListItemBlock(fmt.Sprintf("Recommendation: %s", res.Result.Verdict.Recommendation)))
			calloutChildren = append(calloutChildren, bulletedListItemBlock(fmt.Sprintf("For whom: %s", res.Result.Verdict.ForWhom)))
			calloutChildren = append(calloutChildren, bulletedListItemBlock(fmt.Sprintf("Confidence: %s", res.Result.Verdict.Confidence)))
			if len(res.Result.Verdict.NextActions) > 0 {
				calloutChildren = append(calloutChildren, bulletedListItemBlock("Next actions: "+strings.Join(res.Result.Verdict.NextActions, "; ")))
			}
		}
	}

	blocks = append(blocks, calloutBlock("📋", calloutChildren...))
	return blocks
}

// createPage creates a new page in the database.
func (c *Client) createPage(ctx context.Context, props map[string]any, blocks []map[string]any) (string, error) {
	url := fmt.Sprintf("%s/pages", notionAPIBase)

	payload := map[string]any{
		"parent": map[string]any{
			"database_id": c.config.DatabaseID,
		},
		"properties": props,
		"children":   blocks,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	c.setHeaders(req)

	resp, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("notion: create page failed: %s", string(respBody))
	}

	var pageResp struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&pageResp); err != nil {
		return "", err
	}

	return pageResp.ID, nil
}

// updatePage updates an existing page's properties and replaces all blocks.
func (c *Client) updatePage(ctx context.Context, pageID string, props map[string]any, blocks []map[string]any) error {
	// 1. Update page properties
	url := fmt.Sprintf("%s/pages/%s", notionAPIBase, pageID)
	payload := map[string]any{"properties": props}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPatch, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	c.setHeaders(req)

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("notion: update page properties failed: %s", string(respBody))
	}

	// 2. Archive existing blocks
	if err := c.archiveAllBlocks(ctx, pageID); err != nil {
		return err
	}

	// 3. Append new blocks in batches
	return c.appendBlocks(ctx, pageID, blocks)
}

// archiveAllBlocks archives all child blocks of a page.
func (c *Client) archiveAllBlocks(ctx context.Context, blockID string) error {
	// Get all blocks
	url := fmt.Sprintf("%s/blocks/%s/children?page_size=100", notionAPIBase, blockID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	c.setHeaders(req)

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil // Best effort
	}

	var childrenResp struct {
		Results []struct {
			ID string `json:"id"`
		} `json:"results"`
		HasMore    bool   `json:"has_more"`
		NextCursor string `json:"next_cursor"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&childrenResp); err != nil {
		return err
	}

	// Archive each block
	for _, child := range childrenResp.Results {
		archiveURL := fmt.Sprintf("%s/blocks/%s", notionAPIBase, child.ID)
		archivePayload := map[string]any{"archived": true}
		archiveBody, _ := json.Marshal(archivePayload)
		archiveReq, _ := http.NewRequestWithContext(ctx, http.MethodPatch, archiveURL, bytes.NewReader(archiveBody))
		c.setHeaders(archiveReq)
		archiveResp, _ := c.http.Do(archiveReq)
		if archiveResp != nil {
			archiveResp.Body.Close()
		}
	}

	// Handle pagination if has_more (simplified - just first page for now)
	return nil
}

// appendBlocks appends blocks to a parent in batches of maxBlocksPerBatch.
func (c *Client) appendBlocks(ctx context.Context, parentID string, blocks []map[string]any) error {
	for i := 0; i < len(blocks); i += maxBlocksPerBatch {
		end := i + maxBlocksPerBatch
		if end > len(blocks) {
			end = len(blocks)
		}
		batch := blocks[i:end]

		url := fmt.Sprintf("%s/blocks/%s/children", notionAPIBase, parentID)
		payload := map[string]any{"children": batch}
		body, err := json.Marshal(payload)
		if err != nil {
			return err
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPatch, url, bytes.NewReader(body))
		if err != nil {
			return err
		}
		c.setHeaders(req)

		resp, err := c.http.Do(req)
		if err != nil {
			return err
		}
		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode == 429 {
			// Rate limited - wait and retry
			retryAfter := 1 * time.Second
			if ra := resp.Header.Get("Retry-After"); ra != "" {
				if d, err := time.ParseDuration(ra + "s"); err == nil {
					retryAfter = d
				}
			}
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(retryAfter):
				i -= maxBlocksPerBatch // Retry this batch
				continue
			}
		}

		if resp.StatusCode >= 400 {
			return fmt.Errorf("notion: append blocks failed: %s", string(respBody))
		}
	}
	return nil
}

// setHeaders sets required Notion API headers.
func (c *Client) setHeaders(req *http.Request) {
	req.Header.Set("Authorization", "Bearer "+c.config.Token)
	req.Header.Set("Notion-Version", notionAPIVersion)
	req.Header.Set("Content-Type", "application/json")
}

// --- Block builders ---

func headingBlock(level int, text string) map[string]any {
	return map[string]any{
		"type": fmt.Sprintf("heading_%d", level),
		fmt.Sprintf("heading_%d", level): map[string]any{
			"rich_text": []map[string]any{
				{"type": "text", "text": map[string]any{"content": text}},
			},
		},
	}
}

func paragraphBlock(text string) map[string]any {
	return map[string]any{
		"type": "paragraph",
		"paragraph": map[string]any{
			"rich_text": []map[string]any{
				{"type": "text", "text": map[string]any{"content": text}},
			},
		},
	}
}

func paragraphBlocks(text string) []map[string]any {
	var blocks []map[string]any
	// Split by double newline for paragraphs
	paragraphs := strings.Split(text, "\n\n")
	for _, p := range paragraphs {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		// Chunk long paragraphs
		chunks := chunkText(p, maxBlockChars)
		for _, chunk := range chunks {
			blocks = append(blocks, paragraphBlock(chunk))
		}
	}
	return blocks
}

func bulletedListItemBlock(text string) map[string]any {
	return map[string]any{
		"type": "bulleted_list_item",
		"bulleted_list_item": map[string]any{
			"rich_text": []map[string]any{
				{"type": "text", "text": map[string]any{"content": text}},
			},
		},
	}
}

func numberedListItemBlock(text string) map[string]any {
	return map[string]any{
		"type": "numbered_list_item",
		"numbered_list_item": map[string]any{
			"rich_text": []map[string]any{
				{"type": "text", "text": map[string]any{"content": text}},
			},
		},
	}
}

func toDoBlock(text string, checked bool) map[string]any {
	return map[string]any{
		"type": "to_do",
		"to_do": map[string]any{
			"rich_text": []map[string]any{
				{"type": "text", "text": map[string]any{"content": text}},
			},
			"checked": checked,
		},
	}
}

func codeBlock(text, language string) map[string]any {
	return map[string]any{
		"type": "code",
		"code": map[string]any{
			"rich_text": []map[string]any{
				{"type": "text", "text": map[string]any{"content": text}},
			},
			"language": language,
		},
	}
}

func quoteBlock(text string) map[string]any {
	return map[string]any{
		"type": "quote",
		"quote": map[string]any{
			"rich_text": []map[string]any{
				{"type": "text", "text": map[string]any{"content": text}},
			},
		},
	}
}

func dividerBlock() map[string]any {
	return map[string]any{
		"type":    "divider",
		"divider": map[string]any{},
	}
}

func calloutBlock(emoji string, children ...map[string]any) map[string]any {
	return map[string]any{
		"type": "callout",
		"callout": map[string]any{
			"icon": map[string]any{
				"type":  "emoji",
				"emoji": emoji,
			},
			"rich_text": []map[string]any{
				{"type": "text", "text": map[string]any{"content": ""}},
			},
			"children": children,
		},
	}
}

// chunkText splits text into chunks of maxChars at sentence boundaries.
func chunkText(text string, maxChars int) []string {
	if len(text) <= maxChars {
		return []string{text}
	}

	var chunks []string
	sentences := splitSentences(text)
	currentChunk := ""

	for _, sentence := range sentences {
		if len(currentChunk)+len(sentence)+1 <= maxChars {
			if currentChunk != "" {
				currentChunk += " "
			}
			currentChunk += sentence
		} else {
			if currentChunk != "" {
				chunks = append(chunks, currentChunk)
			}
			// If single sentence exceeds max, hard split
			if len(sentence) > maxChars {
				for len(sentence) > maxChars {
					chunks = append(chunks, sentence[:maxChars])
					sentence = sentence[maxChars:]
				}
				currentChunk = sentence
			} else {
				currentChunk = sentence
			}
		}
	}
	if currentChunk != "" {
		chunks = append(chunks, currentChunk)
	}
	return chunks
}

func splitSentences(text string) []string {
	// Simple sentence splitting - handles . ! ? followed by space or end
	var sentences []string
	current := ""
	for i := 0; i < len(text); i++ {
		current += string(text[i])
		if i+1 < len(text) && (text[i] == '.' || text[i] == '!' || text[i] == '?') && (text[i+1] == ' ' || text[i+1] == '\n') {
			sentences = append(sentences, strings.TrimSpace(current))
			current = ""
			i++ // Skip the space
		}
	}
	if strings.TrimSpace(current) != "" {
		sentences = append(sentences, strings.TrimSpace(current))
	}
	if len(sentences) == 0 {
		return []string{text}
	}
	return sentences
}
