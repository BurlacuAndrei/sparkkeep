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
	svc := core.New(st, config.Config{
		LLMModel: "m", LLMBase: "http://127.0.0.1:1/v1",
		ASRURL: "", HeadlessEnabled: false,
		UploadDir: uploadDir, // core retains uploads itself, not the web layer
	}, t.Logf)
	cfg := config.Config{UploadDir: uploadDir, MaxUploadMB: 1}
	return New(st, svc, "http://localhost:8080", cfg), st
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
	if rec.Code != http.StatusRequestEntityTooLarge && rec.Code != http.StatusBadRequest {
		t.Errorf("code = %d, want 413 or 400", rec.Code)
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 0 {
		t.Errorf("oversized upload left %d files on disk", len(entries))
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
	if rec.Code == http.StatusOK {
		t.Error("path traversal was served, want rejection")
	}
}
