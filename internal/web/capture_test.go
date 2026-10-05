package web

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"sparkkeep/internal/config"
	"sparkkeep/internal/core"
	"sparkkeep/internal/store"
)

func testHandler(t *testing.T, uploadDir string) (http.Handler, *store.Store) {
	t.Helper()
	st, err := store.New(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatalf("store.New: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	ctx := t.Context()
	svc := core.New(ctx, st, config.Config{
		LLMModel: "m", LLMBase: "http://127.0.0.1:1/v1",
		ASRURL: "", HeadlessEnabled: false,
		UploadDir: uploadDir, // core retains uploads itself, not the web layer
	}, t.Logf)
	cfg := config.Config{UploadDir: uploadDir, MaxUploadMB: 1}
	return New(st, svc, cfg), st
}

func multipartBody(t *testing.T, fields map[string]string, fileField, fileName, fileMime string, fileData []byte) (io.Reader, string) {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	for k, v := range fields {
		if err := mw.WriteField(k, v); err != nil {
			t.Fatal(err)
		}
	}
	if fileField != "" {
		fw, err := mw.CreateFormFile(fileField, fileName)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := fw.Write(fileData); err != nil {
			t.Fatal(err)
		}
	}
	if err := mw.Close(); err != nil {
		t.Fatal(err)
	}
	return &buf, mw.FormDataContentType()
}

func TestCaptureRejectsEmpty(t *testing.T) {
	h, _ := testHandler(t, t.TempDir())
	req := httptest.NewRequest("POST", "/api/v1/capture", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("code = %d, want 400", rec.Code)
	}
}

func TestCaptureRejectsOversizedUpload(t *testing.T) {
	dir := t.TempDir()
	h, _ := testHandler(t, dir)
	body, ct := multipartBody(t, nil, "file", "big.bin", "application/octet-stream", make([]byte, 2<<20))
	req := httptest.NewRequest("POST", "/api/v1/capture", body)
	req.Header.Set("Content-Type", ct)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("code = %d, want 413", rec.Code)
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 0 {
		t.Errorf("oversized upload left %d files on disk", len(entries))
	}
}

func TestCaptureUnknownFieldRejected(t *testing.T) {
	h, _ := testHandler(t, t.TempDir())
	body, ct := multipartBody(t, map[string]string{"notes": "hi"}, "", "", "", nil)
	req := httptest.NewRequest("POST", "/api/v1/capture", body)
	req.Header.Set("Content-Type", ct)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("code = %d, want 400", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "provide a file, url, or text") {
		t.Errorf("body = %s, want the provide-a-file message", rec.Body.String())
	}
}

func TestCaptureTextAndURL(t *testing.T) {
	page := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		io.WriteString(w, "<html><title>Local</title><body>A local page about Go.</body></html>")
	}))
	defer page.Close()
	for _, tc := range []struct{ name, field, value string }{
		{"text", "text", "a note about Go"},
		{"url", "url", page.URL + "/post"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h, _ := testHandler(t, t.TempDir())
			body, ct := multipartBody(t, map[string]string{tc.field: tc.value}, "", "", "", nil)
			req := httptest.NewRequest("POST", "/api/v1/capture", body)
			req.Header.Set("Content-Type", ct)
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != http.StatusOK {
				t.Fatalf("code = %d, body = %s", rec.Code, rec.Body.String())
			}
			var out struct {
				OK      bool    `json:"ok"`
				CardIDs []int64 `json:"card_ids"`
			}
			if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
				t.Fatalf("json: %v", err)
			}
			if !out.OK || len(out.CardIDs) != 1 {
				t.Errorf("body = %s, want ok + one card id", rec.Body.String())
			}
		})
	}
}

func TestMediaServesUploadedFile(t *testing.T) {
	dir := t.TempDir()
	h, _ := testHandler(t, dir)
	if err := os.WriteFile(filepath.Join(dir, "abc.jpg"), []byte("JPEGDATA"), 0o644); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("GET", "/api/v1/media/abc.jpg", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d, want 200", rec.Code)
	}
	if rec.Body.String() != "JPEGDATA" {
		t.Errorf("body = %q", rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "image/jpeg" {
		t.Errorf("content-type = %q, want image/jpeg", ct)
	}
}

// A single file over the cap is rejected per-file (MaxBytesReader only bounds
// the whole request, so several small files could still slip past it).
func TestCaptureRejectsOversizedSingleFile(t *testing.T) {
	dir := t.TempDir()
	h, _ := testHandler(t, dir)
	body, ct := multipartBody(t, nil, "file", "one.bin", "application/octet-stream", make([]byte, 1500<<10))
	req := httptest.NewRequest("POST", "/api/v1/capture", body)
	req.Header.Set("Content-Type", ct)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("code = %d, want 413", rec.Code)
	}
}

// An upload runs the pipeline (LLM unreachable -> "Analysis failed" card) and
// the retained upload is then served back by the media endpoint.
func TestCaptureFileIsRetainedAndServed(t *testing.T) {
	dir := t.TempDir()
	h, _ := testHandler(t, dir)
	body, ct := multipartBody(t, nil, "file", "shot.jpg", "image/jpeg", []byte("JPEGDATA"))
	req := httptest.NewRequest("POST", "/api/v1/capture", body)
	req.Header.Set("Content-Type", ct)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d, body = %s", rec.Code, rec.Body.String())
	}
	var out struct {
		OK      bool    `json:"ok"`
		CardIDs []int64 `json:"card_ids"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("json: %v", err)
	}
	if !out.OK || len(out.CardIDs) != 1 {
		t.Fatalf("body = %s, want ok + one card id", rec.Body.String())
	}

	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 1 {
		t.Fatalf("uploads on disk = %d (%v), want 1", len(entries), err)
	}
	mreq := httptest.NewRequest("GET", "/api/v1/media/"+entries[0].Name(), nil)
	mrec := httptest.NewRecorder()
	h.ServeHTTP(mrec, mreq)
	if mrec.Code != http.StatusOK || mrec.Body.String() != "JPEGDATA" {
		t.Errorf("media: code = %d, body = %q; want 200 JPEGDATA", mrec.Code, mrec.Body.String())
	}
}

func TestMediaRejectsTraversal(t *testing.T) {
	dir := t.TempDir()
	h, _ := testHandler(t, dir)
	req := httptest.NewRequest("GET", "/api/v1/media/..%2F..%2Fetc%2Fpasswd", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("code = %d, want 404", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "root:") {
		t.Error("traversal leaked file contents")
	}
}

// An unknown extension must not be sniffed into an executable inline type.
func TestMediaUnknownTypeIsAttachment(t *testing.T) {
	dir := t.TempDir()
	h, _ := testHandler(t, dir)
	if err := os.WriteFile(filepath.Join(dir, "evil.svg"),
		[]byte(`<svg onload="alert(1)"></svg>`), 0o644); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("GET", "/api/v1/media/evil.svg", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if ct := rec.Header().Get("Content-Type"); ct != "application/octet-stream" {
		t.Errorf("content-type = %q, want application/octet-stream", ct)
	}
	if got := rec.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Errorf("X-Content-Type-Options = %q, want nosniff", got)
	}
	if got := rec.Header().Get("Content-Disposition"); !strings.Contains(got, "attachment") {
		t.Errorf("Content-Disposition = %q, want attachment", got)
	}
}
