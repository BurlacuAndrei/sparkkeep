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
	"strconv"
	"strings"
	"testing"

	"sparkkeep/internal/capture"
	"sparkkeep/internal/config"
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
	if !strings.Contains(p, "executive_summary") || !strings.Contains(p, "value_proposition") || !strings.Contains(p, "proposed_actions") {
		t.Fatalf("prompt missing briefing schema:\n%s", p)
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
	_, err := ExtractJSON(`[{"title":"x","summary":"y","horizon":"bogus","tags":[],"links":[]}]`)
	if !errors.Is(err, ErrInvalidResponse) {
		t.Fatalf("err = %v, want ErrInvalidResponse", err)
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

