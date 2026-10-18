package joplin

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"sparkkeep/internal/port"
)

// Mode represents the Joplin integration mode.
type Mode string

const (
	ModeServer  Mode = "server"  // Self-hosted Joplin Server (requires email/password)
	ModeClipper Mode = "clipper" // Joplin Desktop Clipper API (requires token only)
)

// Config holds configuration for the Joplin client.
type Config struct {
	Mode     Mode   // "server" or "clipper"
	BaseURL  string // Server: https://joplin.example.com; Clipper: http://127.0.0.1:41184
	Token    string // Server: session token (after login); Clipper: clipper token
	Email    string // Server mode only
	Password string // Server mode only
}

// Client is the Joplin API client supporting both Server and Clipper modes.
type Client struct {
	config     Config
	httpClient *http.Client
	notebookID string // cached notebook ID
	token      string // session token for server mode
}

const (
	defaultTimeout  = 30 * time.Second
	notebookTitle   = "Sparkkeep"
	joplinUserAgent = "Sparkkeep/1.0"
)

// NewClient creates a new Joplin client.
func NewClient(config Config) *Client {
	if config.BaseURL == "" {
		if config.Mode == ModeClipper {
			config.BaseURL = "http://127.0.0.1:41184"
		}
	}
	return &Client{
		config: config,
		httpClient: &http.Client{
			Timeout: defaultTimeout,
		},
		token: config.Token,
	}
}

// CardNoteID returns a deterministic 32-char hex ID for a card.
// This enables stateless idempotent upsert: same cardID always produces same note ID.
func CardNoteID(cardID int64) string {
	h := sha256.Sum256([]byte(fmt.Sprintf("sparkkeep:card:%d", cardID)))
	return hex.EncodeToString(h[:])[:32]
}

// NotebookID returns a deterministic 32-char hex ID for the Sparkkeep notebook.
func NotebookID() string {
	h := sha256.Sum256([]byte("sparkkeep:notebook"))
	return hex.EncodeToString(h[:])[:32]
}

// TagID returns a deterministic 32-char hex ID for a tag.
func TagID(tag string) string {
	h := sha256.Sum256([]byte(fmt.Sprintf("sparkkeep:tag:%s", tag)))
	return hex.EncodeToString(h[:])[:32]
}

// TestConnection tests connectivity to the Joplin API.
func (c *Client) TestConnection(ctx context.Context) (port.SinkTestResult, error) {
	if c.config.Mode == ModeServer {
		if c.config.Email == "" || c.config.Password == "" {
			return port.SinkTestResult{
				Success: false,
				Message: "Joplin Server mode requires email and password",
			}, nil
		}
		if err := c.authenticate(ctx); err != nil {
			return port.SinkTestResult{
				Success: false,
				Message: fmt.Sprintf("Authentication failed: %v", err),
			}, nil
		}
	} else {
		// Clipper mode: test with a simple GET request
		if c.config.Token == "" {
			return port.SinkTestResult{
				Success: false,
				Message: "Joplin Clipper mode requires a token",
			}, nil
		}
		if err := c.doRequest(ctx, http.MethodGet, "/ping", nil, nil); err != nil {
			return port.SinkTestResult{
				Success: false,
				Message: fmt.Sprintf("Clipper connection failed: %v", err),
			}, nil
		}
	}

	// Test notebook access
	_, err := c.EnsureNotebook(ctx)
	if err != nil {
		return port.SinkTestResult{
			Success: false,
			Message: fmt.Sprintf("Notebook test failed: %v", err),
		}, nil
	}

	return port.SinkTestResult{
		Success: true,
		Message: fmt.Sprintf("Joplin %s connection successful", c.config.Mode),
		Details: map[string]any{
			"mode":     c.config.Mode,
			"base_url": c.config.BaseURL,
			"notebook": notebookTitle,
		},
	}, nil
}

// EnsureNotebook ensures the "Sparkkeep" notebook exists and returns its ID.
func (c *Client) EnsureNotebook(ctx context.Context) (string, error) {
	if c.notebookID != "" {
		return c.notebookID, nil
	}

	// Try to find existing notebook
	folders, err := c.listFolders(ctx)
	if err != nil {
		return "", fmt.Errorf("list folders: %w", err)
	}

	for _, f := range folders {
		if f.Title == notebookTitle {
			c.notebookID = f.ID
			return c.notebookID, nil
		}
	}

	// Create notebook with deterministic ID
	notebookID := NotebookID()
	if err := c.createFolder(ctx, notebookID, notebookTitle); err != nil {
		return "", fmt.Errorf("create notebook: %w", err)
	}

	c.notebookID = notebookID
	return notebookID, nil
}

// UpsertCardExport creates or updates a note for the card export.
func (c *Client) UpsertCardExport(ctx context.Context, exp port.CardExport) (string, error) {
	card := exp.Card
	noteID := CardNoteID(card.ID)

	// Check if note exists
	existing, err := c.getNote(ctx, noteID)
	if err != nil && !errors.Is(err, errNotFound) {
		return "", fmt.Errorf("get note: %w", err)
	}

	// Ensure notebook exists
	notebookID, err := c.EnsureNotebook(ctx)
	if err != nil {
		return "", err
	}

	// Prepare tags
	tagIDs, err := c.ensureTags(ctx, card.Tags)
	if err != nil {
		return "", fmt.Errorf("ensure tags: %w", err)
	}

	// Build markdown body
	body := c.buildMarkdownBody(exp)

	noteData := map[string]any{
		"id":        noteID,
		"title":     card.Title,
		"body":      body,
		"parent_id": notebookID,
		"tags":      tagIDs,
	}

	if existing != nil {
		// Update existing note
		if err := c.updateNote(ctx, noteID, noteData); err != nil {
			return "", fmt.Errorf("update note: %w", err)
		}
	} else {
		// Create new note
		if err := c.createNote(ctx, noteData); err != nil {
			return "", fmt.Errorf("create note: %w", err)
		}
	}

	return noteID, nil
}

// --- Internal HTTP methods ---

type joplinFolder struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

type joplinNote struct {
	ID       string   `json:"id"`
	Title    string   `json:"title"`
	Body     string   `json:"body"`
	ParentID string   `json:"parent_id"`
	Tags     []string `json:"tags"`
}

type joplinTag struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

type joplinListResponse[T any] struct {
	Items    []T  `json:"items"`
	HasMore  bool `json:"has_more"`
	Page     int  `json:"page"`
	PageSize int  `json:"page_size"`
}

var errNotFound = errors.New("not found")

func (c *Client) doRequest(ctx context.Context, method, path string, body any, out any) error {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		bodyReader = bytes.NewReader(data)
	}

	url := strings.TrimRight(c.config.BaseURL, "/") + path
	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", joplinUserAgent)

	if c.config.Mode == ModeServer {
		if c.token == "" {
			if err := c.authenticate(ctx); err != nil {
				return err
			}
		}
		req.Header.Set("Authorization", "Bearer "+c.token)
	} else {
		// Clipper mode
		if c.config.Token != "" {
			req.Header.Set("Authorization", "Bearer "+c.config.Token)
		}
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	// Handle 401 for server mode - re-authenticate and retry once
	if resp.StatusCode == http.StatusUnauthorized && c.config.Mode == ModeServer {
		if err := c.authenticate(ctx); err != nil {
			return err
		}
		// Retry the request with new token
		req.Header.Set("Authorization", "Bearer "+c.token)
		resp, err = c.httpClient.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		respBody, err = io.ReadAll(resp.Body)
		if err != nil {
			return err
		}
	}

	if resp.StatusCode >= 400 {
		if resp.StatusCode == http.StatusNotFound {
			return errNotFound
		}
		return fmt.Errorf("Joplin API error (%d): %s", resp.StatusCode, string(respBody))
	}

	if out != nil {
		return json.Unmarshal(respBody, out)
	}
	return nil
}

func (c *Client) authenticate(ctx context.Context) error {
	if c.config.Email == "" || c.config.Password == "" {
		return errors.New("email and password required for server mode authentication")
	}

	loginBody := map[string]string{
		"email":    c.config.Email,
		"password": c.config.Password,
	}

	data, err := json.Marshal(loginBody)
	if err != nil {
		return err
	}

	url := strings.TrimRight(c.config.BaseURL, "/") + "/api/sessions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", joplinUserAgent)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	if resp.StatusCode >= 400 {
		return fmt.Errorf("Joplin auth error (%d): %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return err
	}

	if result.Token == "" {
		return errors.New("empty token returned from Joplin server")
	}

	c.token = result.Token
	return nil
}

func (c *Client) listFolders(ctx context.Context) ([]joplinFolder, error) {
	var resp joplinListResponse[joplinFolder]
	path := "/api/folders?fields=id,title&page=1&limit=100"
	if c.config.Mode == ModeClipper {
		path = "/folders?fields=id,title&page=1&limit=100"
	}
	if err := c.doRequest(ctx, http.MethodGet, path, nil, &resp); err != nil {
		return nil, err
	}
	return resp.Items, nil
}

func (c *Client) createFolder(ctx context.Context, id, title string) error {
	body := map[string]any{
		"id":    id,
		"title": title,
	}
	path := "/api/folders"
	if c.config.Mode == ModeClipper {
		path = "/folders"
	}
	return c.doRequest(ctx, http.MethodPost, path, body, nil)
}

func (c *Client) getNote(ctx context.Context, noteID string) (*joplinNote, error) {
	var note joplinNote
	path := fmt.Sprintf("/api/notes/%s?fields=id,title,body,parent_id,tags", noteID)
	if c.config.Mode == ModeClipper {
		path = fmt.Sprintf("/notes/%s?fields=id,title,body,parent_id,tags", noteID)
	}
	if err := c.doRequest(ctx, http.MethodGet, path, nil, &note); err != nil {
		return nil, err
	}
	return &note, nil
}

func (c *Client) createNote(ctx context.Context, noteData map[string]any) error {
	path := "/api/notes"
	if c.config.Mode == ModeClipper {
		path = "/notes"
	}
	return c.doRequest(ctx, http.MethodPost, path, noteData, nil)
}

func (c *Client) updateNote(ctx context.Context, noteID string, noteData map[string]any) error {
	path := fmt.Sprintf("/api/notes/%s", noteID)
	if c.config.Mode == ModeClipper {
		path = fmt.Sprintf("/notes/%s", noteID)
	}
	return c.doRequest(ctx, http.MethodPut, path, noteData, nil)
}

func (c *Client) listTags(ctx context.Context) ([]joplinTag, error) {
	var resp joplinListResponse[joplinTag]
	path := "/api/tags?fields=id,title&page=1&limit=100"
	if c.config.Mode == ModeClipper {
		path = "/tags?fields=id,title&page=1&limit=100"
	}
	if err := c.doRequest(ctx, http.MethodGet, path, nil, &resp); err != nil {
		return nil, err
	}
	return resp.Items, nil
}

func (c *Client) createTag(ctx context.Context, id, title string) error {
	body := map[string]any{
		"id":    id,
		"title": title,
	}
	path := "/api/tags"
	if c.config.Mode == ModeClipper {
		path = "/tags"
	}
	return c.doRequest(ctx, http.MethodPost, path, body, nil)
}

func (c *Client) ensureTags(ctx context.Context, tags []string) ([]string, error) {
	if len(tags) == 0 {
		return nil, nil
	}

	// Get existing tags
	existingTags, err := c.listTags(ctx)
	if err != nil {
		return nil, err
	}
	tagMap := make(map[string]string)
	for _, t := range existingTags {
		tagMap[t.Title] = t.ID
	}

	var tagIDs []string
	for _, tag := range tags {
		tag = strings.TrimSpace(tag)
		if tag == "" {
			continue
		}
		if id, ok := tagMap[tag]; ok {
			tagIDs = append(tagIDs, id)
			continue
		}
		// Create tag with deterministic ID
		tagID := TagID(tag)
		if err := c.createTag(ctx, tagID, tag); err != nil {
			// If tag already exists (race), try to fetch it
			if strings.Contains(err.Error(), "conflict") || strings.Contains(err.Error(), "already exists") {
				refreshed, _ := c.listTags(ctx)
				for _, t := range refreshed {
					if t.Title == tag {
						tagIDs = append(tagIDs, t.ID)
						break
					}
				}
				continue
			}
			return nil, fmt.Errorf("create tag %q: %w", tag, err)
		}
		tagIDs = append(tagIDs, tagID)
	}

	return tagIDs, nil
}

// buildMarkdownBody converts CardExport to Joplin markdown format.
func (c *Client) buildMarkdownBody(exp port.CardExport) string {
	card := exp.Card
	var sb strings.Builder

	// Title
	sb.WriteString(fmt.Sprintf("# %s\n\n", card.Title))

	// Executive Summary
	if card.ExecutiveSummary != "" {
		sb.WriteString("## Executive Summary\n\n")
		sb.WriteString(card.ExecutiveSummary)
		sb.WriteString("\n\n")
	} else if card.Summary != "" {
		sb.WriteString("## Summary\n\n")
		sb.WriteString(card.Summary)
		sb.WriteString("\n\n")
	}

	// Value Proposition
	if card.ValueProposition != "" {
		sb.WriteString("## Value Proposition\n\n")
		sb.WriteString(card.ValueProposition)
		sb.WriteString("\n\n")
	}

	// Proposed Actions
	if len(card.ProposedActions) > 0 {
		sb.WriteString("## Proposed Actions\n\n")
		for _, a := range card.ProposedActions {
			sb.WriteString(fmt.Sprintf("- [ ] %s\n", a))
		}
		sb.WriteString("\n")
	}

	// Source Note
	if card.SourceNote != "" && card.SourceNote != card.SourceURL {
		sb.WriteString("## Source Notes\n\n")
		sb.WriteString(card.SourceNote)
		sb.WriteString("\n\n")
	}

	// References
	if len(card.References) > 0 {
		sb.WriteString("## References\n\n")
		for _, r := range card.References {
			if r.URL != "" {
				sb.WriteString(fmt.Sprintf("- [%s](%s) (%s)\n", r.Label, r.URL, r.Kind))
			} else {
				sb.WriteString(fmt.Sprintf("- %s (%s)\n", r.Label, r.Kind))
			}
		}
		sb.WriteString("\n")
	}

	// Research Dossier
	if exp.Research != nil {
		playbookName := ""
		if exp.Research.PlaybookSnapshot != nil && exp.Research.PlaybookSnapshot.Name != "" {
			playbookName = exp.Research.PlaybookSnapshot.Name
		}
		if playbookName == "" {
			playbookName = "Deep Research"
		}

		completedAt := exp.Research.CreatedAt
		for _, s := range exp.Research.Steps {
			if !s.FinishedAt.IsZero() && s.FinishedAt.After(completedAt) {
				completedAt = s.FinishedAt
			}
		}

		sb.WriteString("## Research Dossier\n\n")
		sb.WriteString(fmt.Sprintf("**Playbook:** %s\n", playbookName))
		sb.WriteString(fmt.Sprintf("**Completed:** %s\n\n", completedAt.Format(time.RFC3339)))
		if strings.TrimSpace(exp.Research.Findings) != "" {
			sb.WriteString(strings.TrimSpace(exp.Research.Findings))
			sb.WriteString("\n\n")
		}
	}

	return sb.String()
}
