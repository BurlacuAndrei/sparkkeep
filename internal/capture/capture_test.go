package capture

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
	"unicode/utf8"
)

func TestRecognizeLink(t *testing.T) {
	s := Recognize("https://example.com/foo")
	if s.Kind != KindLink || s.URL != "https://example.com/foo" || s.Caption != "" {
		t.Fatalf("got %+v", s)
	}
}

func TestRecognizeLinkWithCaption(t *testing.T) {
	s := Recognize("https://example.com/foo check this out")
	if s.Kind != KindLink || s.URL != "https://example.com/foo" || s.Caption != "check this out" {
		t.Fatalf("got %+v", s)
	}
}

func TestRecognizeText(t *testing.T) {
	raw := "just some notes, no url"
	s := Recognize(raw)
	if s.Kind != KindText || s.Caption != raw {
		t.Fatalf("got %+v", s)
	}
}

func TestFetchText(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`<title>X</title><p>hello</p>`))
	}))
	defer srv.Close()

	c := Capture{}
	f := c.Fetch(Share{Kind: KindLink, URL: srv.URL})
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

	c := Capture{}
	start := time.Now()
	f := c.Fetch(Share{Kind: KindLink, URL: srv.URL})
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

	c := Capture{}
	f := c.Fetch(Share{Kind: KindLink, URL: srv.URL})
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
	c := Capture{YtDlpBin: script}
	f := c.MediaMeta(Share{Kind: KindLink, URL: "https://youtube.com/watch?v=x"})
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

func TestStripTagsAndCondense_MultiByteUnicodeBoundary(t *testing.T) {
	// A string with multi-byte runes where byte length > condenseMax (4000)
	// but rune count < condenseMax (e.g. 2500 3-byte runes = 7500 bytes).
	// This previously triggered a slice bounds out of range panic [:4000] with capacity 2500.
	input := strings.Repeat("€", 2500)
	got := stripTagsAndCondense(input)
	if utf8.RuneCountInString(strings.TrimSuffix(got, "\n")) != 2500 {
		t.Fatalf("expected 2500 runes, got %d", utf8.RuneCountInString(strings.TrimSuffix(got, "\n")))
	}

	// Input where rune count > condenseMax
	longInput := strings.Repeat("€", 5000)
	longGot := stripTagsAndCondense(longInput)
	if utf8.RuneCountInString(strings.TrimSuffix(longGot, "\n")) != condenseMax {
		t.Fatalf("expected %d runes, got %d", condenseMax, utf8.RuneCountInString(strings.TrimSuffix(longGot, "\n")))
	}
}

func TestGatedDomainRecognition(t *testing.T) {
	cases := []struct {
		url   string
		gated bool
	}{
		{"https://instagram.com/p/C_abc123", true},
		{"https://www.facebook.com/reel/123", true},
		{"https://twitter.com/user/status/456", true},
		{"https://x.com/user/status/789", true},
		{"https://threads.net/@user/post/xyz", true},
		{"https://github.com/torvalds/linux", false},
		{"https://news.ycombinator.com", false},
	}

	for _, tc := range cases {
		if got := isGatedDomain(tc.url); got != tc.gated {
			t.Errorf("isGatedDomain(%q) = %v, want %v", tc.url, got, tc.gated)
		}
	}
}

func TestNeedsHeadlessFallback(t *testing.T) {
	// Gated domain triggers fallback
	if !needsHeadlessFallback(Share{URL: "https://instagram.com/p/123"}, Fetched{}) {
		t.Error("expected gated domain to need fallback")
	}

	// 403 Forbidden error triggers fallback
	if !needsHeadlessFallback(Share{URL: "https://example.com"}, Fetched{Err: fmt.Errorf("status 403")}) {
		t.Error("expected 403 to need fallback")
	}

	// Bot wall keyword triggers fallback
	if !needsHeadlessFallback(Share{URL: "https://example.com"}, Fetched{Text: "Please verify you are human to access the page."}) {
		t.Error("expected bot verification to need fallback")
	}

	// Normal content does not trigger fallback
	normalText := strings.Repeat("A comprehensive guide to distributed systems architecture and consensus protocols. ", 5)
	if needsHeadlessFallback(Share{URL: "https://example.com"}, Fetched{Text: normalText}) {
		t.Error("expected normal text not to need fallback")
	}
}

func TestHeadlessEnabledConfig(t *testing.T) {
	c1 := Capture{HeadlessEnabled: false}
	if c1.HeadlessEnabled {
		t.Error("want false")
	}

	c2 := Capture{HeadlessEnabled: true}
	if !c2.HeadlessEnabled {
		t.Error("want true")
	}
}

func TestRecognizeSetsKind(t *testing.T) {
	if got := Recognize("just some text").Kind; got != KindText {
		t.Errorf("Kind = %q, want %q", got, KindText)
	}
	if got := Recognize("look at https://example.com/x").Kind; got != KindLink {
		t.Errorf("Kind = %q, want %q", got, KindLink)
	}
}

func TestKindForMime(t *testing.T) {
	cases := map[string]string{
		"image/jpeg":      KindImage,
		"image/png":       KindImage,
		"image/webp":      KindImage,
		"audio/ogg":       KindAudio,
		"audio/mpeg":      KindAudio,
		"audio/webm":      KindAudio,
		"video/mp4":       KindVideo,
		"video/quicktime": KindVideo,
		"application/pdf": KindFile,
		"text/plain":      KindFile,
	}
	for mime, want := range cases {
		if got := KindForMime(mime); got != want {
			t.Errorf("KindForMime(%q) = %q, want %q", mime, got, want)
		}
	}
	if got := KindForMime("application/octet-stream"); got != KindFile {
		t.Errorf("unknown mime should be a file, got %q", got)
	}
}

func TestLoginWallTextIsNotContent(t *testing.T) {
	for _, wall := range []string{
		"Log in to Instagram\nNice photo! From your friends on Instagram.",
		"Please enable JavaScript to continue",
		"Just a moment...\nChecking your browser before accessing.",
	} {
		if !IsLoginWall(wall) {
			t.Errorf("IsLoginWall(%q) = false, want true", wall)
		}
	}
	if IsLoginWall("An interesting article about distributed systems.") {
		t.Error("IsLoginWall gave a false positive on real content")
	}
}

func TestParseVTTStripsCues(t *testing.T) {
	vtt := "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nhello there\n\n00:00:04.000 --> 00:00:07.000\ngeneral kenobi\n"
	got := ParseVTT(vtt)
	if strings.Contains(got, "-->") || strings.Contains(got, "WEBVTT") {
		t.Errorf("timestamps survived: %q", got)
	}
	if !strings.Contains(got, "hello there") || !strings.Contains(got, "general kenobi") {
		t.Errorf("cue text missing: %q", got)
	}
}

func TestExtractTitlePrefersCardMetadata(t *testing.T) {
	cases := []struct {
		name string
		html string
		want string
	}{
		{"standard title only", `<html><head><title>Real Headline</title></head></html>`, "Real Headline"},
		{"og:title no title tag", `<html><head><meta property="og:title" content="OG Headline"></head></html>`, "OG Headline"},
		{"og:title content first", `<html><head><meta content="OG Headline" property="og:title"></head></html>`, "OG Headline"},
		{"og:title beats generic title", `<html><head><title>Twitter</title><meta property="og:title" content="Real Post"></head></html>`, "Real Post"},
		{"og:title beats real title", `<html><head><title>Home</title><meta property="og:title" content="Real Post"></head></html>`, "Real Post"},
		{"twitter:title with generic title", `<html><head><title>Instagram</title><meta name="twitter:title" content="Tweet Body"></head></html>`, "Tweet Body"},
		{"twitter:title content first", `<html><head><meta content="Tweet Body" name="twitter:title"></head></html>`, "Tweet Body"},
		{"single quotes", `<html><head><meta property='og:title' content='Quoted Headline'></head></html>`, "Quoted Headline"},
		{"entities unescaped and trimmed", `<html><head><meta property="og:title" content="  Tom &amp; Jerry  "></head></html>`, "Tom & Jerry"},
		{"nothing at all", `<html><body>no head</body></html>`, ""},
	}
	for _, tc := range cases {
		if got := extractTitle(tc.html); got != tc.want {
			t.Errorf("%s: extractTitle = %q, want %q", tc.name, got, tc.want)
		}
	}
}

func TestExtractDescriptionPrecedence(t *testing.T) {
	cases := []struct {
		name string
		html string
		want string
	}{
		{"standard only", `<meta name="description" content="Standard Desc">`, "Standard Desc"},
		{"standard content first", `<meta content="Standard Desc" name="description">`, "Standard Desc"},
		{"summary fallback", `<meta name="summary" content="Summary Desc">`, "Summary Desc"},
		{"og:description wins", `<meta name="description" content="Standard"><meta property="og:description" content="OG Desc">`, "OG Desc"},
		{"og:description content first", `<meta content="OG Desc" property="og:description">`, "OG Desc"},
		{"standard beats twitter:description", `<meta name="description" content="Standard"><meta name="twitter:description" content="TW Desc">`, "Standard"},
		{"twitter:description name first", `<meta name="twitter:description" content="TW Desc">`, "TW Desc"},
		{"twitter:description content first", `<meta content="TW Desc" name="twitter:description">`, "TW Desc"},
		{"empty og:description skipped", `<meta property="og:description" content="  "><meta name="description" content="Standard">`, "Standard"},
		{"none", `<html><body>hi</body></html>`, ""},
	}
	for _, tc := range cases {
		if got := extractDescription(tc.html); got != tc.want {
			t.Errorf("%s: extractDescription = %q, want %q", tc.name, got, tc.want)
		}
	}
}

func TestFetchUsesCardMetadata(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`<html><head><title>X</title><meta property="og:title" content="Card Headline">` +
			`<meta content="Card Blurb" property="og:description"></head><body>` +
			strings.Repeat("body text ", 40) + `</body></html>`))
	}))
	defer srv.Close()

	f := Capture{}.Fetch(Share{Kind: KindLink, URL: srv.URL})
	if f.Err != nil {
		t.Fatalf("Fetch err: %v", f.Err)
	}
	if f.Title != "Card Headline" {
		t.Errorf("Title = %q, want Card Headline", f.Title)
	}
	if f.Description != "Card Blurb" {
		t.Errorf("Description = %q, want Card Blurb", f.Description)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

// serveHTML makes httpClient answer every request with body, so gated URLs can
// be exercised without touching the network.
func serveHTML(t *testing.T, body string) {
	t.Helper()
	old := httpClient
	httpClient = &http.Client{Timeout: 5 * time.Second, Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"text/html; charset=utf-8"}},
			Body:       io.NopCloser(strings.NewReader(body)),
			Request:    r,
		}, nil
	})}
	t.Cleanup(func() { httpClient = old })
}

// chromeSentinel returns a fake Chrome binary that drops markerFile if it is
// ever exec'd.
func chromeSentinel(t *testing.T) (bin, marker string) {
	t.Helper()
	dir := t.TempDir()
	bin, marker = filepath.Join(dir, "fake-chrome"), filepath.Join(dir, "chrome-ran")
	if err := os.WriteFile(bin, []byte("#!/bin/sh\ntouch "+marker+"\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	return bin, marker
}

func TestHeadlessDisabledNeverExecsChrome(t *testing.T) {
	serveHTML(t, `<html><head><title>Twitter</title></head><body>Log in to Twitter</body></html>`)
	bin, marker := chromeSentinel(t)

	for _, gated := range []string{"https://twitter.com/user/status/123", "https://www.instagram.com/p/C_abc"} {
		c := Capture{HeadlessEnabled: false, ChromeBin: bin}

		start := time.Now()
		f := c.Fetch(Share{Kind: KindLink, URL: gated})
		if elapsed := time.Since(start); elapsed > 5*time.Second {
			t.Errorf("Fetch(%s) took %v, want the plain HTTP path", gated, elapsed)
		}
		if _, err := os.Stat(marker); !os.IsNotExist(err) {
			t.Errorf("Fetch(%s) exec'd Chrome with headless disabled", gated)
		}
		if f.Err != nil {
			t.Errorf("Fetch(%s) err = %v, want clean HTTP fallback", gated, f.Err)
		}
		// Login wall text must not become content.
		if f.Text != "" {
			t.Errorf("Fetch(%s) Text = %q, want empty on login wall", gated, f.Text)
		}
		if len(f.Notes) == 0 || !strings.Contains(f.Notes[0], "login wall") {
			t.Errorf("Fetch(%s) Notes = %v, want login wall note", gated, f.Notes)
		}
	}
}

func TestHeadlessDisabledFetchWithContextNeverExecsChrome(t *testing.T) {
	serveHTML(t, `<html><head><title>Facebook</title></head><body>Log in to Facebook</body></html>`)
	bin, marker := chromeSentinel(t)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	f := Capture{HeadlessEnabled: false, ChromeBin: bin}.FetchWithContext(ctx, Share{Kind: KindLink, URL: "https://www.facebook.com/reel/1"})
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Error("FetchWithContext exec'd Chrome with headless disabled")
	}
	if f.Text != "" || len(f.Notes) == 0 {
		t.Errorf("got Text=%q Notes=%v, want empty text and a note", f.Text, f.Notes)
	}
}

func TestHeadlessDisabledMediaMetaNeverExecsChrome(t *testing.T) {
	serveHTML(t, `<html><head><title>Instagram</title></head><body>Log in to Instagram</body></html>`)
	bin, marker := chromeSentinel(t)
	// yt-dlp stub that always fails, forcing the headless fallback branch.
	script := filepath.Join(t.TempDir(), "fake-ytdlp")
	if err := os.WriteFile(script, []byte("#!/bin/sh\nexit 1\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	c := Capture{HeadlessEnabled: false, ChromeBin: bin, YtDlpBin: script}
	f := c.MediaMeta(Share{Kind: KindLink, URL: "https://instagram.com/p/C_abc"})
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Error("MediaMeta exec'd Chrome with headless disabled")
	}
	if f.Err == nil {
		t.Error("MediaMeta Err = nil, want the yt-dlp failure reported")
	}
}
