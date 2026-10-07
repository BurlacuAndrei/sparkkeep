package analyze

import (
	"testing"

	"sparkkeep/internal/capture"
	"sparkkeep/internal/port"
)

func TestCanonicalURL(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "strip utm tracking parameters",
			in:   "https://example.com/article?utm_source=twitter&utm_medium=social&utm_campaign=winter2026",
			want: "https://example.com/article",
		},
		{
			name: "strip fbclid and keep non-tracking query params",
			in:   "https://example.com/product?id=42&fbclid=IwAR123456789&color=blue",
			want: "https://example.com/product?color=blue&id=42",
		},
		{
			name: "strip trailing sentence punctuation",
			in:   "https://example.com/post.,;",
			want: "https://example.com/post",
		},
		{
			name: "strip closing parenthesis from sentence",
			in:   "(https://example.com/page)",
			want: "https://example.com/page",
		},
		{
			name: "preserve parenthesis inside wikipedia URL",
			in:   "https://en.wikipedia.org/wiki/Go_(programming_language)",
			want: "https://en.wikipedia.org/wiki/Go_(programming_language)",
		},
		{
			name: "remove default ports and lowercase host",
			in:   "HTTPS://Example.COM:443/doc",
			want: "https://example.com/doc",
		},
		{
			name: "normalize root and trailing slashes",
			in:   "https://example.com/",
			want: "https://example.com",
		},
		{
			name: "normalize subpath trailing slash",
			in:   "https://example.com/docs/api/",
			want: "https://example.com/docs/api",
		},
		{
			name: "invalid URL returns empty string",
			in:   "not-a-valid-url",
			want: "",
		},
		{
			name: "non-http scheme returns empty string",
			in:   "ftp://ftp.example.com/file",
			want: "",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := CanonicalURL(tc.in)
			if got != tc.want {
				t.Errorf("CanonicalURL(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestExtractDeterministicReferences(t *testing.T) {
	payload := capture.Fetched{
		Text: "Here is a cool repo: https://github.com/gin-gonic/gin?utm_source=reddit, and a doc link: https://pkg.go.dev/net/http.",
		Caption: "Check also https://news.ycombinator.com/item?id=123&fbclid=abc and duplicate https://github.com/gin-gonic/gin?utm_medium=social",
	}

	refs := ExtractDeterministicReferences(payload)
	if len(refs) != 3 {
		t.Fatalf("got %d references, want 3", len(refs))
	}

	// Verify GitHub URL tagged as repo with owner/repo label
	var repoRef *port.Reference
	for i := range refs {
		if refs[i].Kind == port.RefKindRepo {
			repoRef = &refs[i]
			break
		}
	}
	if repoRef == nil {
		t.Fatal("missing repo reference")
	}
	if repoRef.URL != "https://github.com/gin-gonic/gin" || repoRef.Label != "gin-gonic/gin" {
		t.Errorf("unexpected repo reference: %+v", *repoRef)
	}

	// Verify tracking parameters were stripped from other URLs
	var hnRef *port.Reference
	for i := range refs {
		if refs[i].URL == "https://news.ycombinator.com/item?id=123" {
			hnRef = &refs[i]
			break
		}
	}
	if hnRef == nil {
		t.Fatal("missing HN reference with fbclid stripped")
	}
	if hnRef.Kind != port.RefKindURL {
		t.Errorf("HN reference kind = %q, want url", hnRef.Kind)
	}
}

func TestMergeReferencesAcceptanceCriteria(t *testing.T) {
	// Acceptance criterion:
	// A captured post containing 3 URLs (one GitHub) and mentioning a named tool yields
	// a card with ≥3 URL refs (repo tagged) + the tool entity.
	payload := capture.Fetched{
		Text: "We use ffmpeg for video encoding. See https://github.com/ffmpeg/ffmpeg?utm_source=twitter and docs at https://ffmpeg.org/documentation.html?fbclid=xyz. Also community: https://forum.videohelp.com/threads/123",
	}

	deterministic := ExtractDeterministicReferences(payload)
	if len(deterministic) != 3 {
		t.Fatalf("expected 3 deterministic refs, got %d: %+v", len(deterministic), deterministic)
	}

	llmRefs := []port.Reference{
		{Kind: port.RefKindTool, Label: "ffmpeg"},
	}

	merged := MergeReferences(llmRefs, deterministic)
	if len(merged) < 4 {
		t.Fatalf("expected >= 4 references, got %d: %+v", len(merged), merged)
	}

	// Check tool entity exists
	foundTool := false
	urlCount := 0
	foundRepo := false

	for _, r := range merged {
		if r.Kind == port.RefKindTool && r.Label == "ffmpeg" {
			foundTool = true
		}
		if r.Kind == port.RefKindRepo {
			foundRepo = true
		}
		if r.URL != "" {
			urlCount++
		}
	}

	if !foundTool {
		t.Errorf("tool entity ffmpeg not found in merged: %+v", merged)
	}
	if !foundRepo {
		t.Errorf("repo tagged reference not found in merged: %+v", merged)
	}
	if urlCount < 3 {
		t.Errorf("expected >= 3 URL refs, got %d in merged: %+v", urlCount, merged)
	}
}

func TestMergeReferencesDeduplication(t *testing.T) {
	// Duplicate URLs with different tracking params collapse
	r1 := []port.Reference{
		{Kind: port.RefKindRepo, Label: "Gin Framework", URL: "https://github.com/gin-gonic/gin?utm_source=a"},
	}
	r2 := []port.Reference{
		{Kind: port.RefKindURL, Label: "gin-gonic/gin", URL: "https://github.com/gin-gonic/gin?utm_source=b"},
	}

	merged := MergeReferences(r1, r2)
	if len(merged) != 1 {
		t.Fatalf("expected 1 merged reference, got %d: %+v", len(merged), merged)
	}
	if merged[0].Kind != port.RefKindRepo {
		t.Errorf("expected kind repo, got %s", merged[0].Kind)
	}
	if merged[0].Label != "Gin Framework" {
		t.Errorf("expected richer label 'Gin Framework', got %s", merged[0].Label)
	}
	if merged[0].URL != "https://github.com/gin-gonic/gin" {
		t.Errorf("expected canonical URL without utm, got %s", merged[0].URL)
	}

	// Case-insensitive entity label deduplication
	e1 := []port.Reference{
		{Kind: port.RefKindTool, Label: "FFmpeg"},
	}
	e2 := []port.Reference{
		{Kind: port.RefKindTool, Label: "ffmpeg"},
	}
	mergedEntities := MergeReferences(e1, e2)
	if len(mergedEntities) != 1 {
		t.Fatalf("expected 1 deduplicated entity, got %d: %+v", len(mergedEntities), mergedEntities)
	}
}
