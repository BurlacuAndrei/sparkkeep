package capture

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestRecognizeLink(t *testing.T) {
	s := Recognize("https://example.com/foo")
	if s.Name != "link" || s.URL != "https://example.com/foo" || s.Caption != "" {
		t.Fatalf("got %+v", s)
	}
}

func TestRecognizeLinkWithCaption(t *testing.T) {
	s := Recognize("https://example.com/foo check this out")
	if s.Name != "link" || s.URL != "https://example.com/foo" || s.Caption != "check this out" {
		t.Fatalf("got %+v", s)
	}
}

func TestRecognizeText(t *testing.T) {
	raw := "just some notes, no url"
	s := Recognize(raw)
	if s.Name != "text" || s.Caption != raw {
		t.Fatalf("got %+v", s)
	}
}

func TestFetchText(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`<title>X</title><p>hello</p>`))
	}))
	defer srv.Close()

	f := Fetch(Share{Name: "link", URL: srv.URL})
	if f.Err != nil {
		t.Fatalf("Fetch err: %v", f.Err)
	}
	if f.Title != "X" {
		t.Fatalf("Title = %q, want X", f.Title)
	}
	if !strings.Contains(f.Text, "hello") {
		t.Fatalf("Text = %q, want it to contain hello", f.Text)
	}
}

func TestFetchTimeoutPeerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(2 * time.Second)
	}))
	defer srv.Close()

	old := fetchTimeout
	fetchTimeout = 50 * time.Millisecond
	defer func() { fetchTimeout = old }()

	start := time.Now()
	f := Fetch(Share{Name: "link", URL: srv.URL})
	elapsed := time.Since(start)

	if f.Err == nil {
		t.Fatal("Fetch err = nil, want non-nil on timeout")
	}
	if elapsed > time.Second {
		t.Fatalf("Fetch hung for %v, want prompt timeout-ish return", elapsed)
	}
}

func TestFetchNonHTML(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("not html"))
	}))
	defer srv.Close()

	f := Fetch(Share{Name: "link", URL: srv.URL})
	if f.Err != nil {
		t.Fatalf("Fetch err: %v", f.Err)
	}
	if f.Text != "not html" {
		t.Fatalf("Text = %q, want raw body", f.Text)
	}
}

func TestMediaMetaYTDLPStub(t *testing.T) {
	script := filepath.Join(t.TempDir(), "fake-ytdlp")
	if err := os.WriteFile(script, []byte("#!/bin/sh\necho '{\"title\":\"T\",\"description\":\"D\"}'\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("SPARKKEEP_YTDLP", script)

	f := MediaMeta(Share{Name: "link", URL: "https://youtube.com/watch?v=x"})
	if f.Err != nil {
		t.Fatalf("MediaMeta err: %v", f.Err)
	}
	if f.Title != "T" || f.Description != "D" {
		t.Fatalf("got Title=%q Description=%q, want T/D", f.Title, f.Description)
	}
}

func TestStripTags(t *testing.T) {
	got := stripTagsAndCondense("<b>hi</b>\n\n\nworld")
	if got != "hi\nworld\n" {
		t.Fatalf("got %q, want %q", got, "hi\nworld\n")
	}
	if strings.Contains(got, "<") || strings.Contains(got, ">") {
		t.Fatalf("remnants: %q", got)
	}
	if strings.Contains(got, "\n\n\n") {
		t.Fatalf("blank lines not collapsed: %q", got)
	}
}
