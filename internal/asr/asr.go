// Package asr transcribes audio bytes through an OpenAI-Whisper-compatible
// /transcribe endpoint. It is a thin multipart client: no retries, no
// chunking, no language detection. Absence of a configured endpoint is not an
// error, it returns ("", nil) so callers skip cleanly.
package asr

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"sparkkeep/internal/capture"
	"sparkkeep/internal/config"
)

// timeout bounds one transcription. Whisper on CPU transcribes slowly; this
// is the whole ceiling including upload.
const timeout = 10 * time.Minute

type Client struct {
	BaseURL string
	Model   string
	HTTP    *http.Client
}

// New returns a client bound to cfg. An empty cfg.ASRURL disables ASR.
func New(cfg config.Config) *Client {
	return &Client{
		BaseURL: strings.TrimRight(cfg.ASRURL, "/"),
		Model:   cfg.ASRModel,
		HTTP:    &http.Client{Timeout: timeout},
	}
}

// Transcribe sends f to <BaseURL>/transcribe and returns the transcript.
// Returns ("", nil) when ASR is not configured, so a deployment without
// whisper degrades to a Note rather than an error.
func (c *Client) Transcribe(ctx context.Context, f capture.File) (string, error) {
	if c == nil || c.BaseURL == "" {
		return "", nil
	}
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	part, err := mw.CreateFormFile("file", f.Name)
	if err != nil {
		return "", err
	}
	if _, err := part.Write(f.Data); err != nil {
		return "", err
	}
	if c.Model != "" {
		if err := mw.WriteField("model", c.Model); err != nil {
			return "", err
		}
	}
	if err := mw.Close(); err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/transcribe", &body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())

	httpc := c.HTTP
	if httpc == nil {
		httpc = http.DefaultClient
	}
	resp, err := httpc.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("asr: transcribe status %d", resp.StatusCode)
	}
	var out struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", fmt.Errorf("asr: bad response: %w", err)
	}
	return strings.TrimSpace(out.Text), nil
}

// Ext is a convenience for callers that only have a file extension.
func Ext(name string) string { return strings.TrimPrefix(filepath.Ext(name), ".") }
