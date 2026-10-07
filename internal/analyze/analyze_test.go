package analyze

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"

	"sparkkeep/internal/capture"
	"sparkkeep/internal/config"
	"sparkkeep/internal/port"
)

// stubServer returns an httptest server answering /chat/completions with a
// chat response whose message content is the given string (200), or a bare
// status when non-200.
func stubServer(status int, content string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if status != http.StatusOK {
			w.WriteHeader(status)
			return
		}
		fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`, strconv.Quote(content))
	}))
}

func newStubbed(st *httptest.Server, key string) *Client {
	return New(config.Config{LLMBase: st.URL, LLMModel: "stub", LLMKey: key}, st.Client())
}

func TestAnalyzeParsesBriefing(t *testing.T) {
	jsonPayload := `{
		"executive_summary": "High performance vector database for local models.",
		"value_proposition": "Allows fast semantic search completely offline.",
		"proposed_actions": ["Download the repo", "Run the local benchmark"],
		"cards": [
			{"title":"Deploy Qdrant","summary":"Setup local docker container","horizon":"short-term","tags":["vector","db"],"links":["https://example.com"]},
			{"title":"Long term migration","summary":"Evaluate lifetime durability","horizon":"lifetime","tags":["arch"],"links":[]}
		]
	}`
	st := stubServer(http.StatusOK, jsonPayload)
	defer st.Close()

	res, err := newStubbed(st, "").Analyze(context.Background(), capture.Fetched{Title: "Vector DBs"})
	if err != nil {
		t.Fatalf("Analyze err: %v", err)
	}
	if res.ExecutiveSummary != "High performance vector database for local models." {
		t.Errorf("ExecutiveSummary = %q", res.ExecutiveSummary)
	}
	if res.ValueProposition != "Allows fast semantic search completely offline." {
		t.Errorf("ValueProposition = %q", res.ValueProposition)
	}
	if len(res.ProposedActions) != 2 || res.ProposedActions[0] != "Download the repo" {
		t.Errorf("ProposedActions = %+v", res.ProposedActions)
	}
	if len(res.Cards) != 2 {
		t.Fatalf("len(Cards) = %d, want 2", len(res.Cards))
	}
	if res.Cards[0].Title != "Deploy Qdrant" || res.Cards[0].Horizon != "short-term" {
		t.Errorf("Cards[0] = %+v", res.Cards[0])
	}
	if res.Cards[1].Horizon != "lifetime" {
		t.Errorf("Cards[1].Horizon = %q", res.Cards[1].Horizon)
	}
}

func TestAnalyzeParsesArray(t *testing.T) {
	st := stubServer(http.StatusOK, `[{"title":"A","summary":"sum A","horizon":"short-term","tags":["go"],"links":["u1"]},{"title":"B","summary":"sum B","horizon":"lifetime","tags":[],"links":[]}]`)
	defer st.Close()

	res, err := newStubbed(st, "").Analyze(context.Background(), capture.Fetched{Title: "t"})
	if err != nil {
		t.Fatalf("Analyze err: %v", err)
	}
	if len(res.Cards) != 2 {
		t.Fatalf("len = %d, want 2", len(res.Cards))
	}
	if res.Cards[0].Title != "A" || res.Cards[0].Summary != "sum A" || res.Cards[0].Horizon != "short-term" {
		t.Fatalf("cards[0] = %+v", res.Cards[0])
	}
	if len(res.Cards[0].Tags) != 1 || res.Cards[0].Tags[0] != "go" || res.Cards[0].Links[0] != "u1" {
		t.Fatalf("cards[0] tags/links = %+v %+v", res.Cards[0].Tags, res.Cards[0].Links)
	}
	if res.Cards[1].Horizon != "lifetime" {
		t.Fatalf("cards[1].Horizon = %q", res.Cards[1].Horizon)
	}
	if res.ExecutiveSummary != "sum A" {
		t.Errorf("ExecutiveSummary fallback = %q, want sum A", res.ExecutiveSummary)
	}
}

func TestAnalyzeEmptyResult(t *testing.T) {
	st := stubServer(http.StatusOK, `[]`)
	defer st.Close()

	_, err := newStubbed(st, "").Analyze(context.Background(), capture.Fetched{})
	if !errors.Is(err, ErrInvalidResponse) {
		t.Fatalf("err = %v, want ErrInvalidResponse", err)
	}
}

func TestAnalyzeMalformed(t *testing.T) {
	st := stubServer(http.StatusOK, `{"x":1}`)
	defer st.Close()

	_, err := newStubbed(st, "").Analyze(context.Background(), capture.Fetched{})
	if !errors.Is(err, ErrInvalidResponse) {
		t.Fatalf("err = %v, want ErrInvalidResponse", err)
	}
}

func TestAnalyzeFencedJSON(t *testing.T) {
	st := stubServer(http.StatusOK, "```json\n[{\"title\":\"F\",\"summary\":\"s\",\"horizon\":\"short-term\",\"tags\":[],\"links\":[]}]\n```")
	defer st.Close()

	res, err := newStubbed(st, "").Analyze(context.Background(), capture.Fetched{})
	if err != nil {
		t.Fatalf("Analyze err: %v", err)
	}
	if len(res.Cards) != 1 || res.Cards[0].Title != "F" {
		t.Fatalf("cards = %+v", res.Cards)
	}
}

func TestExtractJSONFenced(t *testing.T) {
	res, err := ExtractJSON("```json\n[{\"title\":\"F\",\"summary\":\"s\",\"horizon\":\"short-term\",\"tags\":[],\"links\":[]}]\n```")
	if err != nil {
		t.Fatalf("ExtractJSON err: %v", err)
	}
	if len(res.Cards) != 1 || res.Cards[0].Title != "F" {
		t.Fatalf("cards = %+v", res.Cards)
	}
}

func TestExtractJSONWrapper(t *testing.T) {
	res, err := ExtractJSON(`{"ideas":[{"title":"W","summary":"s","horizon":"lifetime","tags":[],"links":[]}]}`)
	if err != nil {
		t.Fatalf("ExtractJSON err: %v", err)
	}
	if len(res.Cards) != 1 || res.Cards[0].Title != "W" {
		t.Fatalf("cards = %+v", res.Cards)
	}
}

func TestExtractJSONConversational(t *testing.T) {
	raw := "Here is the requested analysis:\n```json\n{\"cards\":[{\"title\":\"Conv\",\"summary\":\"ok\",\"horizon\":\"short-term\",\"tags\":[],\"links\":[]}]}\n```\nHope this is helpful!"
	res, err := ExtractJSON(raw)
	if err != nil {
		t.Fatalf("ExtractJSON conversational err: %v", err)
	}
	if len(res.Cards) != 1 || res.Cards[0].Title != "Conv" {
		t.Fatalf("cards = %+v", res.Cards)
	}
}

func TestPromptForContainsBriefing(t *testing.T) {
	p := PromptFor(capture.Fetched{Title: "Test Title", Caption: "my caption text"})
	for _, field := range []string{"tldr", "why_care", "claims", "open_questions", "signals", "worthiness"} {
		if !strings.Contains(p, field) {
			t.Fatalf("prompt missing triage brief field %q:\n%s", field, p)
		}
	}
	if !strings.Contains(p, "CAPTION:") || !strings.Contains(p, "my caption text") {
		t.Fatalf("prompt missing caption:\n%s", p)
	}
}

func TestAuthorizationHeader(t *testing.T) {
	var got string
	st := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"choices":[{"message":{"content":"[]"}}]}`)
	}))
	defer st.Close()

	_, _ = newStubbed(st, "secret-key").Analyze(context.Background(), capture.Fetched{})
	if got != "Bearer secret-key" {
		t.Fatalf("Authorization = %q, want %q", got, "Bearer secret-key")
	}
}

func TestAnalyzeServerError(t *testing.T) {
	st := stubServer(http.StatusInternalServerError, "")
	defer st.Close()

	_, err := newStubbed(st, "").Analyze(context.Background(), capture.Fetched{})
	if err == nil || errors.Is(err, ErrInvalidResponse) {
		t.Fatalf("err = %v, want non-ErrInvalidResponse error", err)
	}
}

func TestHorizonConstraint(t *testing.T) {
	err := validateCards([]Idea{{Title: "x", Summary: "y", Horizon: "bogus", Tags: []string{}, Links: []string{}}})
	if !errors.Is(err, ErrInvalidResponse) {
		t.Fatalf("err = %v, want ErrInvalidResponse", err)
	}
}

func TestNormalizeHorizon(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{"exact short-term", "short-term", port.HorizonShortTerm},
		{"exact medium-term", "medium-term", port.HorizonMediumTerm},
		{"exact long-term", "long-term", port.HorizonLongTerm},
		{"exact lifetime", "lifetime", port.HorizonLifetime},

		{"case insensitive Short Term", "Short Term", port.HorizonShortTerm},
		{"case insensitive SHORT-TERM", "SHORT-TERM", port.HorizonShortTerm},
		{"case insensitive Medium-Term", "Medium-Term", port.HorizonMediumTerm},
		{"case insensitive Long-Term", "Long-Term", port.HorizonLongTerm},
		{"case insensitive Lifetime", "Lifetime", port.HorizonLifetime},

		{"underscore short_term", "short_term", port.HorizonShortTerm},
		{"underscore medium_term", "medium_term", port.HorizonMediumTerm},
		{"underscore long_term", "long_term", port.HorizonLongTerm},
		{"underscore life_time", "life_time", port.HorizonLifetime},
		{"underscore bucket_list", "bucket_list", port.HorizonLifetime},

		{"whitespace padding", "  short-term  ", port.HorizonShortTerm},
		{"whitespace short term", "short term", port.HorizonShortTerm},
		{"whitespace medium term", "medium term", port.HorizonMediumTerm},
		{"whitespace long term", "long term", port.HorizonLongTerm},
		{"whitespace life time", "life time", port.HorizonLifetime},

		{"synonym medium", "medium", port.HorizonMediumTerm},
		{"synonym Medium", "Medium", port.HorizonMediumTerm},
		{"synonym long", "long", port.HorizonLongTerm},
		{"synonym Long", "Long", port.HorizonLongTerm},
		{"synonym now", "now", port.HorizonShortTerm},
		{"synonym soon", "soon", port.HorizonShortTerm},
		{"synonym immediate", "immediate", port.HorizonShortTerm},
		{"synonym bucket", "bucket", port.HorizonLifetime},
		{"synonym bucket list", "bucket list", port.HorizonLifetime},
		{"synonym bucket-list", "bucket-list", port.HorizonLifetime},
		{"synonym Bucket List", "Bucket List", port.HorizonLifetime},
		{"synonym someday", "someday", port.HorizonLifetime},

		{"no separator shortterm", "shortterm", port.HorizonShortTerm},
		{"no separator mediumterm", "mediumterm", port.HorizonMediumTerm},
		{"no separator longterm", "longterm", port.HorizonLongTerm},
		{"no separator bucketlist", "bucketlist", port.HorizonLifetime},

		{"empty string", "", port.HorizonShortTerm},
		{"whitespace only", "   ", port.HorizonShortTerm},
		{"unknown bogus", "bogus", port.HorizonShortTerm},
		{"unknown unmapped", "random value", port.HorizonShortTerm},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := normalizeHorizon(tt.input)
			if got != tt.want {
				t.Errorf("normalizeHorizon(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestExtractJSONHorizons(t *testing.T) {
	tests := []struct {
		name        string
		payload     string
		wantHorizon string
		wantErr     bool
	}{
		{"short-term", `[{"title":"t","summary":"s","horizon":"short-term"}]`, port.HorizonShortTerm, false},
		{"medium-term", `[{"title":"t","summary":"s","horizon":"medium-term"}]`, port.HorizonMediumTerm, false},
		{"long-term", `[{"title":"t","summary":"s","horizon":"long-term"}]`, port.HorizonLongTerm, false},
		{"lifetime", `[{"title":"t","summary":"s","horizon":"lifetime"}]`, port.HorizonLifetime, false},
		{"Short Term mixed case", `[{"title":"t","summary":"s","horizon":"Short Term"}]`, port.HorizonShortTerm, false},
		{"short_term underscore", `[{"title":"t","summary":"s","horizon":"short_term"}]`, port.HorizonShortTerm, false},
		{"medium synonym", `[{"title":"t","summary":"s","horizon":"medium"}]`, port.HorizonMediumTerm, false},
		{"long synonym", `[{"title":"t","summary":"s","horizon":"long"}]`, port.HorizonLongTerm, false},
		{"now synonym", `[{"title":"t","summary":"s","horizon":"now"}]`, port.HorizonShortTerm, false},
		{"soon synonym", `[{"title":"t","summary":"s","horizon":"soon"}]`, port.HorizonShortTerm, false},
		{"immediate synonym", `[{"title":"t","summary":"s","horizon":"immediate"}]`, port.HorizonShortTerm, false},
		{"bucket synonym", `[{"title":"t","summary":"s","horizon":"bucket"}]`, port.HorizonLifetime, false},
		{"bucket list synonym", `[{"title":"t","summary":"s","horizon":"bucket list"}]`, port.HorizonLifetime, false},
		{"bucket-list synonym", `[{"title":"t","summary":"s","horizon":"bucket-list"}]`, port.HorizonLifetime, false},
		{"someday synonym", `[{"title":"t","summary":"s","horizon":"someday"}]`, port.HorizonLifetime, false},
		{"empty horizon", `[{"title":"t","summary":"s","horizon":""}]`, port.HorizonShortTerm, false},
		{"missing horizon field", `[{"title":"t","summary":"s"}]`, port.HorizonShortTerm, false},
		{"unknown horizon bogus", `[{"title":"t","summary":"s","horizon":"bogus"}]`, port.HorizonShortTerm, false},
		{"briefing object with medium-term", `{"executive_summary":"exec","cards":[{"title":"t","summary":"s","horizon":"medium-term"}]}`, port.HorizonMediumTerm, false},
		{"briefing object with long-term", `{"executive_summary":"exec","cards":[{"title":"t","summary":"s","horizon":"long-term"}]}`, port.HorizonLongTerm, false},
		{"briefing object with empty horizon", `{"cards":[{"title":"t","summary":"s"}]}`, port.HorizonShortTerm, false},
		{"empty cards array", `[]`, "", true},
		{"malformed JSON", `{invalid`, "", true},
		{"no cards in object", `{"other":"val"}`, "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res, err := ExtractJSON(tt.payload)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ExtractJSON() err = %v, wantErr = %v", err, tt.wantErr)
			}
			if !tt.wantErr {
				if len(res.Cards) == 0 {
					t.Fatalf("ExtractJSON() returned 0 cards")
				}
				if res.Cards[0].Horizon != tt.wantHorizon {
					t.Errorf("ExtractJSON() card horizon = %q, want %q", res.Cards[0].Horizon, tt.wantHorizon)
				}
			}
		})
	}
}

func TestAnalyzeAcceptsMediumAndLongTerm(t *testing.T) {
	jsonPayload := `{
		"cards": [
			{"title":"Medium term plan","summary":"Plan for next quarter","horizon":"medium-term","tags":[],"links":[]},
			{"title":"Long term vision","summary":"Five year outlook","horizon":"long-term","tags":[],"links":[]}
		]
	}`
	st := stubServer(http.StatusOK, jsonPayload)
	defer st.Close()

	res, err := newStubbed(st, "").Analyze(context.Background(), capture.Fetched{Title: "Roadmap"})
	if err != nil {
		t.Fatalf("Analyze err: %v", err)
	}
	if len(res.Cards) != 2 {
		t.Fatalf("len(Cards) = %d, want 2", len(res.Cards))
	}
	if res.Cards[0].Horizon != port.HorizonMediumTerm {
		t.Errorf("Cards[0].Horizon = %q, want %q", res.Cards[0].Horizon, port.HorizonMediumTerm)
	}
	if res.Cards[1].Horizon != port.HorizonLongTerm {
		t.Errorf("Cards[1].Horizon = %q, want %q", res.Cards[1].Horizon, port.HorizonLongTerm)
	}
}

func TestDefaultClientBoundedDial(t *testing.T) {
	c := New(config.Config{LLMBase: "http://127.0.0.1:1", LLMModel: "stub"}, nil)
	tr, ok := c.HTTP.Transport.(*http.Transport)
	if !ok {
		t.Fatalf("default client Transport = %T, want *http.Transport", c.HTTP.Transport)
	}
	if tr.DialContext == nil {
		t.Fatal("default client Transport has no DialContext: response time is intentionally unbounded, but connection establishment must still be bounded so a dead endpoint fails at connect")
	}
}

// tinyJPEG encodes a real n×n JPEG so the test exercises the same decode path
// Describe uses. Hand-written JPEG magic bytes are not decodable.
func tinyJPEG(t *testing.T, n int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, n, n))
	for y := 0; y < n; y++ {
		for x := 0; x < n; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x * 7), G: uint8(y * 7), B: 0x40, A: 0xff})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, nil); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestDescribeSendsImageDataURL(t *testing.T) {
	var body map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&body)
		io.WriteString(w, `{"choices":[{"message":{"content":"A dog on a skateboard."}}]}`)
	}))
	defer srv.Close()

	c := New(config.Config{LLMBase: srv.URL, LLMModel: "gemma3:4b", VisionModel: "gemma3:4b"}, srv.Client())
	got, err := c.Describe(context.Background(), capture.File{
		Name: "dog.jpg", Mime: "image/jpeg", Data: tinyJPEG(t, 64),
	}, "Describe this image.")
	if err != nil {
		t.Fatalf("Describe: %v", err)
	}
	if got != "A dog on a skateboard." {
		t.Errorf("digest = %q", got)
	}
	if body["model"] != "gemma3:4b" {
		t.Errorf("model = %v, want the vision model", body["model"])
	}
	msgs, _ := body["messages"].([]any)
	if len(msgs) != 1 {
		t.Fatalf("messages = %v, want one user message", body["messages"])
	}
	parts, _ := msgs[0].(map[string]any)["content"].([]any)
	if len(parts) != 2 {
		t.Fatalf("content parts = %v, want text + image", parts[0])
	}
	imgPart, _ := parts[1].(map[string]any)
	if imgPart["type"] != "image_url" {
		t.Fatalf("second part = %v, want image_url", imgPart)
	}
	url, _ := imgPart["image_url"].(map[string]any)["url"].(string)
	if !strings.HasPrefix(url, "data:image/jpeg;base64,") {
		t.Errorf("image url = %.40q, want a data: URL", url)
	}
}

// Review Focus: a 12MP phone photo must be downscaled, not sent at full size.
// Build the large image cheaply as a flat colour so the test stays fast.
func TestEncodeForVisionDownscalesLargePhoto(t *testing.T) {
	raw := tinyJPEG(t, 3000)
	enc, mime, err := encodeForVision(raw)
	if err != nil {
		t.Fatalf("encodeForVision: %v", err)
	}
	if mime != "image/jpeg" {
		t.Errorf("mime = %q, want image/jpeg", mime)
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(enc))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Width > visionMaxEdge || cfg.Height > visionMaxEdge {
		t.Errorf("encoded %dx%d, want both edges <= %d", cfg.Width, cfg.Height, visionMaxEdge)
	}
	// Aspect ratio must survive the nearest-neighbour scale.
	wantRatio := 1.0
	if got := float64(cfg.Width) / float64(cfg.Height); got < wantRatio*0.95 || got > wantRatio*1.05 {
		t.Errorf("aspect ratio %.3f, want ~1.0 for a square source", got)
	}
	// And the downscale must actually shrink the payload.
	if len(enc) >= len(raw) {
		t.Errorf("downscaled %d bytes from %d, expected smaller", len(enc), len(raw))
	}
}

func TestEncodeForVisionLeavesSmallImageAlone(t *testing.T) {
	enc, _, err := encodeForVision(tinyJPEG(t, 128))
	if err != nil {
		t.Fatalf("encodeForVision: %v", err)
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(enc))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Width != 128 || cfg.Height != 128 {
		t.Errorf("got %dx%d, want 128x128 untouched", cfg.Width, cfg.Height)
	}
}

func TestEncodeForVisionFlattensAlphaOntoWhite(t *testing.T) {
	transparent := image.NewRGBA(image.Rect(0, 0, 8, 8))
	var pngBuf bytes.Buffer
	if err := png.Encode(&pngBuf, transparent); err != nil {
		t.Fatal(err)
	}
	enc, _, err := encodeForVision(pngBuf.Bytes())
	if err != nil {
		t.Fatalf("encodeForVision: %v", err)
	}
	got, _, err := image.Decode(bytes.NewReader(enc))
	if err != nil {
		t.Fatal(err)
	}
	r, g, b, _ := got.At(4, 4).RGBA()
	if r < 0xf000 || g < 0xf000 || b < 0xf000 {
		t.Errorf("transparent pixel encoded as (%d,%d,%d), want near-white",
			r>>8, g>>8, b>>8)
	}
}

func TestDescribeSkipsUnusableImage(t *testing.T) {
	// Bytes that are not an image cannot be decoded, so Describe must decline
	// rather than send garbage and invite a hallucination.
	c := New(config.Config{LLMBase: "http://127.0.0.1:1/v1", LLMModel: "m", VisionModel: "m"}, &http.Client{})
	got, err := c.Describe(context.Background(), capture.File{
		Name: "x.jpg", Mime: "image/jpeg", Data: []byte("not an image"),
	}, "")
	if err == nil {
		t.Fatal("want an error for undecodable image data")
	}
	if got != "" {
		t.Errorf("digest = %q, want empty on error", got)
	}
}

func TestPromptForCarriesTranscriptAndNotes(t *testing.T) {
	p := PromptFor(capture.Fetched{
		Kind:       capture.KindVideo,
		Title:      "Some talk",
		Transcript: "the actual spoken words",
		Notes:      []string{"no transcript available"},
	})
	for _, want := range []string{"the actual spoken words", "no transcript available", "EXTRACTION NOTES"} {
		if !strings.Contains(p, want) {
			t.Errorf("prompt missing %q", want)
		}
	}
}

func TestClipMultiByteUnicode(t *testing.T) {
	// Byte length is 300 (100 * 3 bytes), but rune count is 100.
	// Calling clip with max=200 should NOT panic with slice bounds out of range.
	input := strings.Repeat("€", 100)
	got := clip(input, 200)
	if got != input {
		t.Fatalf("expected untouched input, got %q", got)
	}

	// Calling clip with max=50 should truncate to 50 runes
	gotTrunc := clip(input, 50)
	expected := strings.Repeat("€", 50) + "\n[truncated]"
	if gotTrunc != expected {
		t.Fatalf("expected %q, got %q", expected, gotTrunc)
	}
}

func TestExtractJSONNewAndLegacyShapes(t *testing.T) {
	// 1. New shape with references
	newPayload := `{
		"executive_summary": "Summary",
		"cards": [
			{
				"title": "FFmpeg Tooling",
				"summary": "Video CLI tool",
				"horizon": "short-term",
				"tags": ["video"],
				"references": [
					{"kind": "tool", "label": "ffmpeg"},
					{"kind": "repo", "label": "ffmpeg/ffmpeg", "url": "https://github.com/ffmpeg/ffmpeg"}
				]
			}
		]
	}`
	resNew, err := ExtractJSON(newPayload)
	if err != nil {
		t.Fatalf("ExtractJSON(newPayload): %v", err)
	}
	if len(resNew.Cards[0].References) != 2 {
		t.Fatalf("got %d references, want 2", len(resNew.Cards[0].References))
	}
	if resNew.Cards[0].References[0].Kind != port.RefKindTool || resNew.Cards[0].References[0].Label != "ffmpeg" {
		t.Errorf("ref 0 mismatch: %+v", resNew.Cards[0].References[0])
	}
	if resNew.Cards[0].References[1].Kind != port.RefKindRepo || resNew.Cards[0].References[1].Label != "ffmpeg/ffmpeg" {
		t.Errorf("ref 1 mismatch: %+v", resNew.Cards[0].References[1])
	}

	// 2. Legacy shape with links[] mapped to kind:url / kind:repo
	legacyPayload := `{
		"cards": [
			{
				"title": "Legacy Links Card",
				"summary": "Summary",
				"horizon": "short-term",
				"tags": [],
				"links": [
					"https://example.com/guide?utm_source=hackernews",
					"https://github.com/gin-gonic/gin"
				]
			}
		]
	}`
	resLegacy, err := ExtractJSON(legacyPayload)
	if err != nil {
		t.Fatalf("ExtractJSON(legacyPayload): %v", err)
	}
	if len(resLegacy.Cards[0].References) != 2 {
		t.Fatalf("got %d references, want 2", len(resLegacy.Cards[0].References))
	}
	if resLegacy.Cards[0].References[0].Kind != port.RefKindURL || resLegacy.Cards[0].References[0].URL != "https://example.com/guide" {
		t.Errorf("legacy link 0 mismatch (tracking param should be stripped): %+v", resLegacy.Cards[0].References[0])
	}
	if resLegacy.Cards[0].References[1].Kind != port.RefKindRepo || resLegacy.Cards[0].References[1].URL != "https://github.com/gin-gonic/gin" {
		t.Errorf("legacy link 1 mismatch (github should be repo): %+v", resLegacy.Cards[0].References[1])
	}

	// 3. Legacy array shape
	arrayPayload := `[
		{
			"title": "Array Card",
			"summary": "Summary",
			"horizon": "medium-term",
			"tags": [],
			"links": ["https://golang.org"]
		}
	]`
	resArr, err := ExtractJSON(arrayPayload)
	if err != nil {
		t.Fatalf("ExtractJSON(arrayPayload): %v", err)
	}
	if len(resArr.Cards[0].References) != 1 || resArr.Cards[0].References[0].Kind != port.RefKindURL || resArr.Cards[0].References[0].URL != "https://golang.org" {
		t.Errorf("legacy array ref mismatch: %+v", resArr.Cards[0].References)
	}
}

func TestPromptForGoldenSnapshot(t *testing.T) {
	fixture := capture.Fetched{
		Kind:        capture.KindLink,
		Title:       "Snapshot Test Title",
		Description: "Snapshot description of the captured content",
		Text:        "Snapshot body text content explaining the project in detail.",
		Caption:     "Snapshot user caption",
		Transcript:  "Snapshot transcript line 1\nSnapshot transcript line 2",
		ImageDigest: "Snapshot visual digest: diagram with 3 boxes",
		Notes:       []string{"extraction note: partial rate limit", "another note"},
	}
	got := strings.TrimSpace(PromptFor(fixture))

	goldenBytes, err := os.ReadFile("testdata/prompt_for_golden.txt")
	if err != nil {
		t.Fatalf("read prompt_for_golden.txt: %v", err)
	}
	want := strings.TrimSpace(string(goldenBytes))
	if got != want {
		t.Fatalf("PromptFor output does not match golden snapshot:\nGOT:\n%s\n\nWANT:\n%s", got, want)
	}
}

func TestAnalyzeLoginWallExtractionSignal(t *testing.T) {
	// Acceptance criterion: A capture with a "login wall" Note yields signals.extraction != "full".
	jsonPayload := `{
		"cards": [
			{
				"title": "Paywalled Paper",
				"tldr": "Paywalled research on LLM routing.",
				"why_care": "Relevant for our architecture.",
				"horizon": "medium-term",
				"signals": {
					"extraction": "full",
					"promo": false,
					"source_quality": "primary"
				}
			}
		]
	}`
	st := stubServer(http.StatusOK, jsonPayload)
	defer st.Close()

	client := newStubbed(st, "")
	res, err := client.Analyze(context.Background(), capture.Fetched{
		Title: "Paywalled Paper",
		Notes: []string{"login wall encountered; body empty"},
	})
	if err != nil {
		t.Fatalf("Analyze: %v", err)
	}
	if len(res.Cards) != 1 {
		t.Fatalf("len(Cards) = %d, want 1", len(res.Cards))
	}
	if res.Cards[0].Signals.Extraction == "full" {
		t.Errorf("expected signals.extraction != 'full' due to login wall, got %q", res.Cards[0].Signals.Extraction)
	}
}

func TestExtractJSONTriageBriefFullAndPartial(t *testing.T) {
	// Full triage brief schema
	fullJSON := `{
		"cards": [
			{
				"title": "Local LLM Router",
				"type": "tool",
				"tldr": "Dynamic role-based router for local model deployments.",
				"why_care": "Saves 90% latency by using specialized smaller models.",
				"horizon": "short-term",
				"tags": ["llm", "routing"],
				"claims": ["10x throughput", "0 memory leak"],
				"open_questions": ["What is cold start latency?"],
				"signals": {
					"extraction": "full",
					"promo": false,
					"source_quality": "primary",
					"published_at": "2026-02-15"
				},
				"worthiness": {
					"level": "high",
					"reason": "Direct drop-in for our pipeline"
				},
				"references": [
					{"kind": "repo", "label": "router-go", "url": "https://github.com/example/router-go"}
				]
			}
		]
	}`
	res, err := ExtractJSON(fullJSON)
	if err != nil {
		t.Fatalf("ExtractJSON full: %v", err)
	}
	if len(res.Cards) != 1 {
		t.Fatalf("len = %d, want 1", len(res.Cards))
	}
	card := res.Cards[0]
	if card.Type != "tool" || card.TLDR != "Dynamic role-based router for local model deployments." {
		t.Errorf("mismatch card basic: %+v", card)
	}
	if card.WhyCare != "Saves 90% latency by using specialized smaller models." {
		t.Errorf("mismatch why_care: %q", card.WhyCare)
	}
	if len(card.Claims) != 2 || card.Claims[0] != "10x throughput" {
		t.Errorf("claims: %+v", card.Claims)
	}
	if len(card.OpenQuestions) != 1 || card.OpenQuestions[0] != "What is cold start latency?" {
		t.Errorf("open_questions: %+v", card.OpenQuestions)
	}
	if card.Signals.Extraction != "full" || card.Signals.PublishedAt != "2026-02-15" {
		t.Errorf("signals: %+v", card.Signals)
	}
	if card.Worthiness.Level != "high" || card.Worthiness.Reason != "Direct drop-in for our pipeline" {
		t.Errorf("worthiness: %+v", card.Worthiness)
	}

	// Partial / tolerant schema (missing optional fields)
	partialJSON := `{
		"cards": [
			{
				"title": "Minimal Idea",
				"tldr": "Minimal description sentence.",
				"horizon": "long-term"
			}
		]
	}`
	pRes, err := ExtractJSON(partialJSON)
	if err != nil {
		t.Fatalf("ExtractJSON partial: %v", err)
	}
	pCard := pRes.Cards[0]
	if pCard.Type != "idea" {
		t.Errorf("expected default type 'idea', got %q", pCard.Type)
	}
	if pCard.Signals == nil || pCard.Signals.Extraction != "full" {
		t.Errorf("expected default signals.extraction 'full', got %+v", pCard.Signals)
	}
	if pCard.Worthiness == nil || pCard.Worthiness.Level != "medium" {
		t.Errorf("expected default worthiness 'medium', got %+v", pCard.Worthiness)
	}
	if len(pCard.Claims) != 0 || len(pCard.OpenQuestions) != 0 {
		t.Errorf("claims/open_questions should default to empty slice: %+v %+v", pCard.Claims, pCard.OpenQuestions)
	}
}

func TestStrictTitleTLDRHorizon(t *testing.T) {
	// Missing title -> error
	if _, err := ExtractJSON(`{"cards":[{"tldr":"ok","horizon":"short-term"}]}`); err == nil {
		t.Fatal("expected error on missing title")
	}
	// Missing tldr & summary -> error
	if _, err := ExtractJSON(`{"cards":[{"title":"ok","horizon":"short-term"}]}`); err == nil {
		t.Fatal("expected error on missing tldr")
	}
}


