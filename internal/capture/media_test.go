package capture

import "testing"

func TestInstagramEmbedURL(t *testing.T) {
	cases := map[string]string{
		"https://www.instagram.com/p/ABC123/": "https://www.instagram.com/p/ABC123/embed/captioned/",
		"https://instagram.com/reel/ABC123/": "https://www.instagram.com/reel/ABC123/embed/captioned/",
		"https://example.com/p/ABC123/":      "",
		"https://youtube.com/watch?v=x":      "",
	}
	for in, want := range cases {
		if got := InstagramEmbedURL(in); got != want {
			t.Errorf("InstagramEmbedURL(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestExtractInstagramCaptionFallsBackToOGDescription(t *testing.T) {
	// Rendered embeds put the caption in a Caption div; when the markup is
	// unavailable the og:description meta is the guaranteed fallback.
	html := `<html><head><meta property="og:description" content="A cat doing backflips"></head><body></body></html>`
	if got := ExtractInstagramCaption(html); got != "A cat doing backflips" {
		t.Errorf("caption = %q, want the og:description text", got)
	}
}

func TestExtractInstagramCaptionFromCaptionDiv(t *testing.T) {
	html := `<html><body><div class="Caption">Spilled my coffee on the keyboard
	again</div><div class="CaptionAndHashtags">#fail</div></body></html>`
	got := ExtractInstagramCaption(html)
	if got == "" {
		t.Fatal("caption is empty, want the Caption div text")
	}
	if !contains(got, "Spilled my coffee") {
		t.Errorf("caption = %q, want it to contain the div text", got)
	}
}

func TestIsLoginWall(t *testing.T) {
	if !IsLoginWall("Log in to Instagram\nFrom your friends on Instagram.") {
		t.Error("instagram wall not detected")
	}
	if !IsLoginWall("Please enable JavaScript to continue") {
		t.Error("js wall not detected")
	}
	if IsLoginWall("A post about Go concurrency patterns and channels.") {
		t.Error("false positive on real content")
	}
}

func TestApplyHeadlessTurnsLoginWallIntoNote(t *testing.T) {
	got := applyHeadless(Fetched{}, "Instagram", "", "Log in to Instagram\nFrom your friends.")
	if got.Text != "" {
		t.Errorf("Text = %q, want empty for a login wall", got.Text)
	}
	if len(got.Notes) != 1 || got.Notes[0] != "instagram login wall — caption unavailable" {
		t.Errorf("Notes = %v, want the login-wall note", got.Notes)
	}
}

func TestApplyHeadlessKeepsRealContent(t *testing.T) {
	real := "A long article about Go generics and the type system, with examples."
	got := applyHeadless(Fetched{}, "Generics in Go", "about types", real)
	if got.Text != real {
		t.Errorf("Text = %q, want the page text preserved", got.Text)
	}
	if len(got.Notes) != 0 {
		t.Errorf("Notes = %v, want none for real content", got.Notes)
	}
}

func contains(haystack, needle string) bool {
	return len(haystack) >= len(needle) && (haystack == needle ||
		len(needle) == 0 || indexOf(haystack, needle) >= 0)
}

func indexOf(h, n string) int {
	for i := 0; i+len(n) <= len(h); i++ {
		if h[i:i+len(n)] == n {
			return i
		}
	}
	return -1
}