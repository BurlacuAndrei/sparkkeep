package asr

import (
	"context"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"sparkkeep/internal/capture"
	"sparkkeep/internal/config"
)

func TestDisabledReturnsEmpty(t *testing.T) {
	c := New(config.Config{ASRURL: ""})
	got, err := c.Transcribe(context.Background(), capture.File{Name: "v.ogg", Data: []byte("x")})
	if err != nil || got != "" {
		t.Fatalf("disabled client returned (%q, %v), want (\"\", nil)", got, err)
	}
}

func TestTranscribePostsMultipart(t *testing.T) {
	var gotField, gotFilename string
	var gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/transcribe" {
			t.Errorf("path = %q, want /transcribe", r.URL.Path)
		}
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Errorf("parse multipart: %v", err)
			return
		}
		f, hdr, err := r.FormFile("file")
		if err != nil {
			t.Errorf("form file: %v", err)
			return
		}
		gotField = "file"
		gotFilename = hdr.Filename
		b, _ := io.ReadAll(f)
		gotBody = string(b)
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"text":"hello from the voice note"}`)
	}))
	defer srv.Close()

	c := New(config.Config{ASRURL: srv.URL})
	c.HTTP = srv.Client()
	got, err := c.Transcribe(context.Background(), capture.File{
		Name: "voice.ogg", Mime: "audio/ogg", Data: []byte("OggS-fake"),
	})
	if err != nil {
		t.Fatalf("Transcribe: %v", err)
	}
	if got != "hello from the voice note" {
		t.Errorf("text = %q", got)
	}
	if gotField != "file" || gotFilename != "voice.ogg" || gotBody != "OggS-fake" {
		t.Errorf("multipart field=%q filename=%q body=%q", gotField, gotFilename, gotBody)
	}
}

func TestTranscribeServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer srv.Close()
	c := New(config.Config{ASRURL: srv.URL})
	c.HTTP = srv.Client()
	if _, err := c.Transcribe(context.Background(), capture.File{Data: []byte("x")}); err == nil {
		t.Fatal("want error on 500")
	}
}

// compile-time guard that multipart is used as expected
var _ = multipart.NewReader
var _ = strings.TrimSpace
