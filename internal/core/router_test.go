package core

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"sparkkeep/internal/analyze"
	"sparkkeep/internal/capture"
	"sparkkeep/internal/config"
	"sparkkeep/internal/license"
	"sparkkeep/internal/port"
)

func testJPEG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 32, 32))
	for y := 0; y < 32; y++ {
		for x := 0; x < 32; x++ {
			img.Set(x, y, color.RGBA{R: 100, G: 150, B: 200, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, nil); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// stubSearchServer returns a canned SearXNG JSON response with one search result.
func stubSearchServer() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"results":[{"url":"https://example.com/source"}]}`)
	}))
}

// stubTestFetcher implements capture.Fetcher for router tests.
type stubTestFetcher struct{}

func (s stubTestFetcher) Recognize(raw string) capture.Share {
	return capture.Share{Kind: capture.KindLink, URL: raw}
}

func (s stubTestFetcher) Fetch(share capture.Share) capture.Fetched {
	return capture.Fetched{URL: share.URL, Text: "Extracted source content for synthesis", Title: "Sample Source"}
}

func (s stubTestFetcher) FetchWithContext(ctx context.Context, share capture.Share) capture.Fetched {
	return s.Fetch(share)
}

func (s stubTestFetcher) MediaMeta(share capture.Share) capture.Fetched {
	return s.Fetch(share)
}

func (s stubTestFetcher) Subtitles(share capture.Share) string {
	return ""
}

// TestCoreRouterPerRoleEndpoints verifies:
// With two profiles A (default) and B, mapping research_synthesis→B sends synthesis
// requests to B's base URL/model and everything else (triage, vision, plan) to A.
func TestCoreRouterPerRoleEndpoints(t *testing.T) {
	var aTriageHits, aVisionHits, aPlanHits int64
	var bSynthesisHits int64

	serverA := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Model    string `json:"model"`
			Messages []struct {
				Role    string `json:"role"`
				Content any    `json:"content"`
			} `json:"messages"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)

		// Check if vision call (user message content is array of parts with image_url)
		for _, m := range req.Messages {
			if arr, ok := m.Content.([]any); ok && len(arr) > 0 {
				atomic.AddInt64(&aVisionHits, 1)
				w.Header().Set("Content-Type", "application/json")
				fmt.Fprint(w, `{"choices":[{"message":{"content":"A detailed diagram of architecture and system components."}}]}`)
				return
			}
		}

		// Check if plan call or triage call
		isPlan := false
		for _, m := range req.Messages {
			if str, ok := m.Content.(string); ok && (strings.Contains(str, "Create a concise web search query") || strings.Contains(str, "research planning assistant")) {
				isPlan = true
				break
			}
		}

		if isPlan {
			atomic.AddInt64(&aPlanHits, 1)
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprint(w, `{"choices":[{"message":{"content":"{\"questions\":[{\"id\":\"Q1\",\"question\":\"vector search query\",\"query\":\"vector search query\"}]}"}}]}`)
			return
		}

		// Otherwise triage / analyze call
		atomic.AddInt64(&aTriageHits, 1)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"choices":[{"message":{"content":"{\"cards\":[{\"title\":\"Idea 1\",\"summary\":\"Summary 1\",\"horizon\":\"short-term\",\"tags\":[\"ai\"]}]}"}}]}`)
	}))
	defer serverA.Close()

	serverB := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&bSynthesisHits, 1)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"choices":[{"message":{"content":"{\"recommendation\":\"pursue\",\"for_whom\":\"engineers\",\"risks\":[],\"confidence\":\"high\",\"next_actions\":[\"act1\",\"act2\",\"act3\"],\"landscape\":[],\"claims\":[]}"}}]}`)
	}))
	defer serverB.Close()

	searchSrv := stubSearchServer()
	defer searchSrv.Close()

	st := newStubStore()
	ctx := context.Background()

	profA := analyze.Profile{
		ID:        "prof-a",
		Name:      "Model A",
		BaseURL:   serverA.URL,
		Model:     "model-a",
		APIKey:    "key-a",
		IsDefault: true,
	}
	profB := analyze.Profile{
		ID:        "prof-b",
		Name:      "Model B",
		BaseURL:   serverB.URL,
		Model:     "model-b",
		APIKey:    "key-b",
		IsDefault: false,
	}

	profsJSON, _ := json.Marshal([]analyze.Profile{profA, profB})
	rolesJSON, _ := json.Marshal(map[string]string{
		analyze.RoleResearchSynthesis: "prof-b",
	})
	_ = st.SetSetting(ctx, "llm_profiles", string(profsJSON))
	_ = st.SetSetting(ctx, "llm_roles", string(rolesJSON))

	svc := New(ctx, st, config.Config{SearchURL: searchSrv.URL}, t.Logf)
	svc.License = license.SetupProForTest(ctx, st)
	svc.Fetcher = stubTestFetcher{}
	// Use test http client so httptest servers work
	svc.Router = analyze.NewRouter(analyze.RouterConfig{
		Profiles:   []analyze.Profile{profA, profB},
		Roles:      map[string]string{analyze.RoleResearchSynthesis: "prof-b"},
		HTTPClient: serverA.Client(),
	})
	svc.Analyze = svc.Router.For(analyze.RoleTriage)
	svc.Vision = svc.Router.For(analyze.RoleVision)
	svc.Runner.PlanLLM = svc.Router.For(analyze.RoleResearchPlan)
	svc.Runner.SynthesisLLM = svc.Router.For(analyze.RoleResearchSynthesis)
	svc.Runner.Fetcher = stubTestFetcher{}
	svc.Runner.Timeout = 5 * time.Second

	// 1. Run Triage (Capture) -> should hit Server A
	cardIDs, err := svc.Capture(ctx, "Check this AI architecture")
	if err != nil || len(cardIDs) == 0 {
		t.Fatalf("Capture failed: %v, cards=%v", err, cardIDs)
	}
	if atomic.LoadInt64(&aTriageHits) != 1 {
		t.Fatalf("expected 1 triage hit on Server A, got %d", atomic.LoadInt64(&aTriageHits))
	}

	// 2. Run Vision (CaptureShare image) -> should hit Server A
	_, err = svc.CaptureShare(ctx, capture.Share{
		Kind:  capture.KindImage,
		Files: []capture.File{{Name: "test.jpg", Mime: "image/jpeg", Data: testJPEG(t)}},
	})
	if err != nil {
		t.Fatalf("CaptureShare image failed: %v", err)
	}
	if atomic.LoadInt64(&aVisionHits) != 1 {
		t.Fatalf("expected 1 vision hit on Server A, got %d", atomic.LoadInt64(&aVisionHits))
	}

	// 3. Run Research -> Plan hits Server A, Synthesis hits Server B
	cardID := cardIDs[0]
	err = svc.Research(ctx, cardID)
	if err != nil {
		t.Fatalf("Research failed: %v", err)
	}

	if atomic.LoadInt64(&aPlanHits) != 1 {
		t.Fatalf("expected 1 research plan hit on Server A, got %d", atomic.LoadInt64(&aPlanHits))
	}
	if atomic.LoadInt64(&bSynthesisHits) < 1 {
		t.Fatalf("expected at least 1 research synthesis hit on Server B, got %d", atomic.LoadInt64(&bSynthesisHits))
	}
}

// TestCoreRouterDeletionFallback verifies:
// Deleting profile B falls back to default without errors.
func TestCoreRouterDeletionFallback(t *testing.T) {
	var aSynthesisHits int64

	serverA := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Messages []struct {
				Content any `json:"content"`
			} `json:"messages"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		for _, m := range req.Messages {
			if str, ok := m.Content.(string); ok && (strings.Contains(str, "Create a concise web search query") || strings.Contains(str, "research planning assistant")) {
				w.Header().Set("Content-Type", "application/json")
				fmt.Fprint(w, `{"choices":[{"message":{"content":"{\"questions\":[{\"id\":\"Q1\",\"question\":\"search query\",\"query\":\"search query\"}]}"}}]}`)
				return
			}
		}
		// synthesis call on Server A fallback
		atomic.AddInt64(&aSynthesisHits, 1)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"choices":[{"message":{"content":"{\"recommendation\":\"pursue\",\"for_whom\":\"engineers\",\"risks\":[],\"confidence\":\"high\",\"next_actions\":[\"act1\",\"act2\",\"act3\"],\"landscape\":[],\"claims\":[]}"}}]}`)
	}))
	defer serverA.Close()

	searchSrv := stubSearchServer()
	defer searchSrv.Close()

	st := newStubStore()
	ctx := context.Background()

	profA := analyze.Profile{
		ID:        "prof-a",
		Name:      "Model A",
		BaseURL:   serverA.URL,
		Model:     "model-a",
		APIKey:    "key-a",
		IsDefault: true,
	}

	// Only profA exists in profiles, but role mapping points to deleted "prof-b"
	profsJSON, _ := json.Marshal([]analyze.Profile{profA})
	rolesJSON, _ := json.Marshal(map[string]string{
		analyze.RoleResearchSynthesis: "prof-b", // deleted profile
	})
	_ = st.SetSetting(ctx, "llm_profiles", string(profsJSON))
	_ = st.SetSetting(ctx, "llm_roles", string(rolesJSON))

	svc := New(ctx, st, config.Config{SearchURL: searchSrv.URL}, t.Logf)
	svc.License = license.SetupProForTest(ctx, st)
	svc.Fetcher = stubTestFetcher{}
	svc.Router = analyze.NewRouter(analyze.RouterConfig{
		Profiles:   []analyze.Profile{profA},
		Roles:      map[string]string{analyze.RoleResearchSynthesis: "prof-b"},
		HTTPClient: serverA.Client(),
	})
	svc.Runner.Fetcher = stubTestFetcher{}
	svc.Runner.Timeout = 5 * time.Second

	card, err := st.CreateCard(ctx, port.Card{Title: "Idea", Summary: "Summary"})
	if err != nil {
		t.Fatalf("CreateCard failed: %v", err)
	}

	err = svc.Research(ctx, card.ID)
	if err != nil {
		t.Fatalf("expected fallback to default profile without error, got: %v", err)
	}
	if atomic.LoadInt64(&aSynthesisHits) < 1 {
		t.Fatalf("expected synthesis hit on Server A as fallback, got %d", atomic.LoadInt64(&aSynthesisHits))
	}
}

// TestCoreRouterSettingsChangeTakesEffectWithoutRestart verifies:
// Changing mappings in Settings takes effect on the next request without restart.
func TestCoreRouterSettingsChangeTakesEffectWithoutRestart(t *testing.T) {
	var aSynthesisHits, bSynthesisHits int64

	serverA := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Messages []struct {
				Content any `json:"content"`
			} `json:"messages"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		for _, m := range req.Messages {
			if str, ok := m.Content.(string); ok && (strings.Contains(str, "Create a concise web search query") || strings.Contains(str, "research planning assistant")) {
				w.Header().Set("Content-Type", "application/json")
				fmt.Fprint(w, `{"choices":[{"message":{"content":"{\"questions\":[{\"id\":\"Q1\",\"question\":\"query\",\"query\":\"query\"}]}"}}]}`)
				return
			}
		}
		atomic.AddInt64(&aSynthesisHits, 1)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"choices":[{"message":{"content":"{\"recommendation\":\"pursue\",\"for_whom\":\"engineers\",\"risks\":[],\"confidence\":\"high\",\"next_actions\":[\"act1\",\"act2\",\"act3\"],\"landscape\":[],\"claims\":[]}"}}]}`)
	}))
	defer serverA.Close()

	serverB := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&bSynthesisHits, 1)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"choices":[{"message":{"content":"{\"recommendation\":\"pursue\",\"for_whom\":\"engineers\",\"risks\":[],\"confidence\":\"high\",\"next_actions\":[\"act1\",\"act2\",\"act3\"],\"landscape\":[],\"claims\":[]}"}}]}`)
	}))
	defer serverB.Close()

	searchSrv := stubSearchServer()
	defer searchSrv.Close()

	st := newStubStore()
	ctx := context.Background()

	profA := analyze.Profile{
		ID:        "prof-a",
		Name:      "Model A",
		BaseURL:   serverA.URL,
		Model:     "model-a",
		IsDefault: true,
	}
	profB := analyze.Profile{
		ID:        "prof-b",
		Name:      "Model B",
		BaseURL:   serverB.URL,
		Model:     "model-b",
		IsDefault: false,
	}

	profsJSON, _ := json.Marshal([]analyze.Profile{profA, profB})
	_ = st.SetSetting(ctx, "llm_profiles", string(profsJSON))

	svc := New(ctx, st, config.Config{SearchURL: searchSrv.URL}, t.Logf)
	svc.License = license.SetupProForTest(ctx, st)
	svc.Fetcher = stubTestFetcher{}
	// Initially no role mapping -> synthesis goes to server A
	svc.Router = analyze.NewRouter(analyze.RouterConfig{
		Profiles:   []analyze.Profile{profA, profB},
		HTTPClient: serverA.Client(),
	})
	svc.Runner.Fetcher = stubTestFetcher{}
	svc.Runner.Timeout = 5 * time.Second

	card1, _ := st.CreateCard(ctx, port.Card{Title: "Card 1", Summary: "Summary 1"})
	if err := svc.Research(ctx, card1.ID); err != nil {
		t.Fatalf("first research failed: %v", err)
	}
	if atomic.LoadInt64(&aSynthesisHits) < 1 || atomic.LoadInt64(&bSynthesisHits) != 0 {
		t.Fatalf("first run: want aHits>=1, bHits=0, got a=%d b=%d", atomic.LoadInt64(&aSynthesisHits), atomic.LoadInt64(&bSynthesisHits))
	}

	// Change mapping in settings to prof-b and rebuild router (no process restart)
	newRolesJSON, _ := json.Marshal(map[string]string{
		analyze.RoleResearchSynthesis: "prof-b",
	})
	_ = st.SetSetting(ctx, "llm_roles", string(newRolesJSON))
	_ = svc.RebuildRouter(ctx)

	// Second request should now immediately hit server B for synthesis
	card2, _ := st.CreateCard(ctx, port.Card{Title: "Card 2", Summary: "Summary 2"})
	if err := svc.Research(ctx, card2.ID); err != nil {
		t.Fatalf("second research failed: %v", err)
	}
	if atomic.LoadInt64(&bSynthesisHits) < 1 {
		t.Fatalf("second run: want bHits>=1, got %d", atomic.LoadInt64(&bSynthesisHits))
	}
}

// TestCoreFreshInstallWithOneProfile verifies:
// Fresh install with one profile behaves exactly as today.
func TestCoreFreshInstallWithOneProfile(t *testing.T) {
	var triageHits int64
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&triageHits, 1)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"choices":[{"message":{"content":"{\"cards\":[{\"title\":\"Card Fresh\",\"summary\":\"Summary Fresh\",\"horizon\":\"short-term\"}]}"}}]}`)
	}))
	defer server.Close()

	st := newStubStore()
	ctx := context.Background()

	// Only SPARKKEEP_LLM_* config, no stored profiles or roles
	cfg := config.Config{
		LLMBase:  server.URL,
		LLMModel: "fresh-model",
		LLMKey:   "fresh-key",
	}

	svc := New(ctx, st, cfg, t.Logf)
	svc.Fetcher = stubTestFetcher{}
	// Hook client for httptest
	svc.Router = analyze.NewRouter(analyze.RouterConfig{
		Profiles: []analyze.Profile{{
			ID:        "default",
			Name:      "Default",
			BaseURL:   server.URL,
			Model:     "fresh-model",
			APIKey:    "fresh-key",
			IsDefault: true,
		}},
		HTTPClient: server.Client(),
	})
	svc.Analyze = svc.Router.For(analyze.RoleTriage)

	cards, err := svc.Capture(ctx, "Fresh install content")
	if err != nil || len(cards) == 0 {
		t.Fatalf("Capture on fresh install failed: %v", err)
	}
	if atomic.LoadInt64(&triageHits) != 1 {
		t.Fatalf("expected 1 triage hit on fresh install, got %d", atomic.LoadInt64(&triageHits))
	}
}

// TestCaptureTriageBriefDistinctCards verifies that:
// 1. Analysis requests go to the triage profile
// 2. Sibling cards from one post have distinct tldr and why_care
// 3. All triage brief fields are persisted on the created cards
func TestCaptureTriageBriefDistinctCards(t *testing.T) {
	var triageHits int64
	var otherHits int64

	triageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&triageHits, 1)
		w.Header().Set("Content-Type", "application/json")
		resp := `{
			"cards": [
				{
					"title": "Card 1 Tool",
					"type": "tool",
					"tldr": "Distinct TLDR for first tool.",
					"why_care": "Distinct reason why we care about tool 1.",
					"horizon": "short-term",
					"tags": ["tool1"],
					"claims": ["Claim 1A", "Claim 1B"],
					"open_questions": ["Question 1A"],
					"signals": {
						"extraction": "full",
						"promo": false,
						"source_quality": "primary",
						"published_at": "2026-04-01"
					},
					"worthiness": {
						"level": "high",
						"reason": "Direct relevance"
					}
				},
				{
					"title": "Card 2 Idea",
					"type": "idea",
					"tldr": "Distinct TLDR for second idea.",
					"why_care": "Distinct reason why we care about idea 2.",
					"horizon": "long-term",
					"tags": ["idea2"],
					"claims": ["Claim 2A"],
					"open_questions": ["Question 2A", "Question 2B"],
					"signals": {
						"extraction": "full",
						"promo": true,
						"source_quality": "social"
					},
					"worthiness": {
						"level": "low",
						"reason": "Speculative"
					}
				}
			]
		}`
		fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`, strconv.Quote(resp))
	}))
	defer triageServer.Close()

	otherServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&otherHits, 1)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer otherServer.Close()

	st := newStubStore()
	ctx := context.Background()

	svc := New(ctx, st, config.Config{}, t.Logf)
	svc.License = license.SetupProForTest(ctx, st)
	svc.Fetcher = stubTestFetcher{}
	svc.Router = analyze.NewRouter(analyze.RouterConfig{
		Profiles: []analyze.Profile{
			{
				ID:        "default-prof",
				Name:      "Default",
				BaseURL:   otherServer.URL,
				Model:     "other-model",
				IsDefault: true,
			},
			{
				ID:      "triage-prof",
				Name:    "Triage Fast",
				BaseURL: triageServer.URL,
				Model:   "triage-model",
			},
		},
		Roles: map[string]string{
			"triage": "triage-prof",
		},
		HTTPClient: triageServer.Client(),
	})
	svc.Analyze = svc.Router.For(analyze.RoleTriage)

	ids, err := svc.Capture(ctx, "https://example.com/multi-post")
	if err != nil {
		t.Fatalf("Capture: %v", err)
	}
	if len(ids) != 2 {
		t.Fatalf("len(ids) = %d, want 2", len(ids))
	}

	// 1. Routing check: triageServer must receive the call, otherServer must not
	if atomic.LoadInt64(&triageHits) != 1 {
		t.Errorf("triageHits = %d, want 1", atomic.LoadInt64(&triageHits))
	}
	if atomic.LoadInt64(&otherHits) != 0 {
		t.Errorf("otherHits = %d, want 0", atomic.LoadInt64(&otherHits))
	}

	card1, err := st.GetCard(ctx, ids[0])
	if err != nil {
		t.Fatalf("GetCard 1: %v", err)
	}
	card2, err := st.GetCard(ctx, ids[1])
	if err != nil {
		t.Fatalf("GetCard 2: %v", err)
	}

	// 2. Distinct tldr and why_care check (no shared post-level fallback!)
	if card1.TLDR == card2.TLDR {
		t.Errorf("expected distinct TLDRs, but both were %q", card1.TLDR)
	}
	if card1.WhyCare == card2.WhyCare {
		t.Errorf("expected distinct WhyCare, but both were %q", card1.WhyCare)
	}
	if card1.TLDR != "Distinct TLDR for first tool." {
		t.Errorf("card1.TLDR = %q", card1.TLDR)
	}
	if card2.TLDR != "Distinct TLDR for second idea." {
		t.Errorf("card2.TLDR = %q", card2.TLDR)
	}
	if card1.WhyCare != "Distinct reason why we care about tool 1." {
		t.Errorf("card1.WhyCare = %q", card1.WhyCare)
	}
	if card2.WhyCare != "Distinct reason why we care about idea 2." {
		t.Errorf("card2.WhyCare = %q", card2.WhyCare)
	}

	// 3. New fields persisted
	if card1.Type != "tool" || card2.Type != "idea" {
		t.Errorf("types: %q, %q", card1.Type, card2.Type)
	}
	if len(card1.Claims) != 2 || card1.Claims[0] != "Claim 1A" {
		t.Errorf("card1.Claims: %+v", card1.Claims)
	}
	if len(card2.OpenQuestions) != 2 || card2.OpenQuestions[0] != "Question 2A" {
		t.Errorf("card2.OpenQuestions: %+v", card2.OpenQuestions)
	}
	if card1.Signals.Extraction != "full" || card1.Signals.PublishedAt != "2026-04-01" {
		t.Errorf("card1.Signals: %+v", card1.Signals)
	}
	if card1.Worthiness.Level != "high" || card2.Worthiness.Level != "low" {
		t.Errorf("worthiness: %+v, %+v", card1.Worthiness, card2.Worthiness)
	}
}

func TestCommunitySingleModelRouting(t *testing.T) {
	st := newStubStore()
	ctx := context.Background()

	profDefault := analyze.Profile{
		ID:        "prof-default",
		Name:      "Default Model",
		BaseURL:   "https://api.default.com/v1",
		Model:     "gpt-4o",
		IsDefault: true,
	}
	profOther := analyze.Profile{
		ID:        "prof-other",
		Name:      "Other Model",
		BaseURL:   "https://api.other.com/v1",
		Model:     "claude-3-opus",
		IsDefault: false,
	}
	profsJSON, _ := json.Marshal([]analyze.Profile{profDefault, profOther})
	rolesJSON, _ := json.Marshal(map[string]string{
		analyze.RoleResearchPlan:      "prof-other",
		analyze.RoleResearchSynthesis: "prof-other",
	})
	_ = st.SetSetting(ctx, "llm_profiles", string(profsJSON))
	_ = st.SetSetting(ctx, "llm_roles", string(rolesJSON))

	// In Community (no Pro license), role mappings are ignored and all roles route to the default profile.
	svc := New(ctx, st, config.Config{}, t.Logf)
	if err := svc.RebuildRouter(ctx); err != nil {
		t.Fatalf("RebuildRouter: %v", err)
	}

	planCl := svc.clientFor(analyze.RoleResearchPlan)
	if planCl.BaseURL != "https://api.default.com/v1" || planCl.Model != "gpt-4o" {
		t.Errorf("Community: expected plan role to route to default profile, got base=%s model=%s", planCl.BaseURL, planCl.Model)
	}
	synthCl := svc.clientFor(analyze.RoleResearchSynthesis)
	if synthCl.BaseURL != "https://api.default.com/v1" || synthCl.Model != "gpt-4o" {
		t.Errorf("Community: expected synth role to route to default profile, got base=%s model=%s", synthCl.BaseURL, synthCl.Model)
	}
}
