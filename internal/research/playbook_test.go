package research

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"sparkkeep/internal/port"
)

func TestValidatePlaybook_AllowsReadWithoutSearch(t *testing.T) {
	// Ordering constraint (read after search/refs) is relaxed to a soft advisory in UI.
	// Server validation must allow read as the first step or without search.
	cases := []struct {
		name string
		pb   port.Playbook
	}{
		{
			name: "read as first step before search",
			pb: port.Playbook{
				Name: "Read Before Search",
				Steps: []port.PlaybookStep{
					{Kind: port.StepKindRead, Name: "Read", Enabled: true},
					{Kind: port.StepKindSearch, Name: "Search", Enabled: true},
				},
			},
		},
		{
			name: "read only step",
			pb: port.Playbook{
				Name: "Read Only",
				Steps: []port.PlaybookStep{
					{Kind: port.StepKindRead, Name: "Read", Enabled: true},
				},
			},
		},
		{
			name: "ground then read without search",
			pb: port.Playbook{
				Name: "Ground and Read",
				Steps: []port.PlaybookStep{
					{Kind: port.StepKindGround, Name: "Ground", Enabled: true},
					{Kind: port.StepKindRead, Name: "Read", Enabled: true},
				},
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if err := ValidatePlaybook(tc.pb); err != nil {
				t.Fatalf("expected playbook to pass validation, got error: %v", err)
			}
		})
	}
}

func TestValidatePlaybook_Invariants(t *testing.T) {
	def := DefaultPlaybook()

	// 1. Name required
	pb := def
	pb.Name = "   "
	if err := ValidatePlaybook(pb); err == nil {
		t.Error("expected error for empty playbook name")
	}

	// 2. 1..12 steps required
	pb = def
	pb.Steps = nil
	if err := ValidatePlaybook(pb); err == nil {
		t.Error("expected error for 0 steps")
	}

	pb = def
	pb.Steps = make([]port.PlaybookStep, 13)
	for i := range pb.Steps {
		pb.Steps[i] = port.PlaybookStep{Kind: port.StepKindGround, Name: "Step"}
	}
	if err := ValidatePlaybook(pb); err == nil {
		t.Error("expected error for 13 steps")
	}

	// 3. Known step kinds only
	pb = def
	pb.Steps = []port.PlaybookStep{{Kind: "magic_research", Name: "Magic"}}
	if err := ValidatePlaybook(pb); err == nil {
		t.Error("expected error for unknown step kind")
	}

	// 4. Custom step: OutputHeading required
	pb = port.Playbook{
		Name: "Custom Missing Heading",
		Steps: []port.PlaybookStep{
			{Kind: port.StepKindCustom, Name: "Custom", Enabled: true, Config: port.CustomStepConfig{OutputHeading: ""}},
		},
	}
	if err := ValidatePlaybook(pb); err == nil {
		t.Error("expected error for custom step without output_heading")
	}

	// 5. Custom step: instruction <= 8000 chars
	pb = port.Playbook{
		Name: "Custom Over 8000 chars",
		Steps: []port.PlaybookStep{
			{
				Kind:    port.StepKindCustom,
				Name:    "Custom",
				Enabled: true,
				Config: port.CustomStepConfig{
					OutputHeading: "Heading",
					Instruction:   strings.Repeat("x", 8001),
				},
			},
		},
	}
	if err := ValidatePlaybook(pb); err == nil {
		t.Error("expected error for instruction exceeding 8000 characters")
	}

	// 6. Custom step: max_queries <= 5
	pb = port.Playbook{
		Name: "Custom Over 5 MaxQueries",
		Steps: []port.PlaybookStep{
			{
				Kind:    port.StepKindCustom,
				Name:    "Custom",
				Enabled: true,
				Config: port.CustomStepConfig{
					OutputHeading: "Heading",
					MaxQueries:    6,
				},
			},
		},
	}
	if err := ValidatePlaybook(pb); err == nil {
		t.Error("expected error for max_queries > 5")
	}
}

func TestFallbackReportSynthesizer_AllSections(t *testing.T) {
	card := port.Card{
		ID:    1,
		Title: "Distributed Consensus in Go",
	}
	state := NewRunState(card, 1, nil, 6000, 40000)

	// Populate Plan
	state.Plan = &port.ResearchPlan{
		Questions: []port.ResearchQuestion{
			{ID: "Q1", Question: "How does Raft handle partition?", Query: "raft network partition leader election"},
		},
	}

	// Populate Claims
	state.Result.Claims = []port.ClaimVerdict{
		{
			Claim:     "Raft guarantees safety under network partition",
			Status:    "supported",
			Rationale: "Verified via TLA+ specifications and paper",
			Sources:   []string{"S1"},
		},
	}

	// Populate Landscape
	state.Result.Landscape = []port.LandscapeItem{
		{
			Name:         "Paxos",
			URL:          "https://example.com/paxos",
			OneLiner:     "Classic consensus protocol",
			HowItDiffers: "More symmetric, harder to understand than Raft",
			Sources:      []string{"S1"},
		},
	}

	// Populate Verdict
	state.Result.Verdict = &port.ResearchVerdict{
		Recommendation: "pursue",
		Confidence:     "high",
		ForWhom:        "Distributed systems engineers",
		Risks:          []string{"Split brain risk if quorum misconfigured"},
		NextActions:    []string{"Implement log replication", "Add heartbeat tests", "Benchmark latency"},
	}

	// Populate Custom Section
	state.StepOutputs["custom_sections"] = []CustomSection{
		{
			StepID:  "custom_1",
			Heading: "Architecture Blueprint",
			Content: "State machine replication with append-only write-ahead log.",
		},
	}

	// Populate Registered Sources
	state.Sources.Add("https://raft.github.io", "Raft Consensus", "search", "Raft paper text", time.Now())

	report := FallbackReportSynthesizer(state)
	if report == "" {
		t.Fatal("expected non-empty report from FallbackReportSynthesizer")
	}

	// Verify state.StepOutputs["report"] was stored
	if stored, ok := state.StepOutputs["report"].(string); !ok || stored != report {
		t.Fatalf("expected state.StepOutputs['report'] to match synthesized report, got: %v", state.StepOutputs["report"])
	}

	// Verify sections exist in expected order
	expectedSections := []string{
		"# Research: Distributed Consensus in Go",
		"## Questions & Findings",
		"## Claim Verification",
		"## Competitive Landscape & Alternatives",
		"## Executive Verdict",
		"## Architecture Blueprint",
		"## Sources & Citations",
	}

	lastIdx := -1
	for _, sec := range expectedSections {
		idx := strings.Index(report, sec)
		if idx == -1 {
			t.Errorf("expected section %q not found in report:\n%s", sec, report)
			continue
		}
		if idx < lastIdx {
			t.Errorf("section %q appeared at pos %d, but previous section was at pos %d (out of order)", sec, idx, lastIdx)
		}
		lastIdx = idx
	}
}

func TestFallbackReportSynthesizer_EmptyReturnsEmptyString(t *testing.T) {
	card := port.Card{Title: "Empty Topic"}
	state := NewRunState(card, 0, nil, 6000, 40000)

	report := FallbackReportSynthesizer(state)
	if report != "" {
		t.Fatalf("expected empty string when no sections or content could be synthesized, got:\n%s", report)
	}
	if state.StepOutputs["report"] != nil {
		t.Fatalf("expected state.StepOutputs['report'] to remain nil, got: %v", state.StepOutputs["report"])
	}
}

func TestRunWithPlaybook_NoReportStep_GroundAndVerdict(t *testing.T) {
	llm := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		str := string(body)
		if strings.Contains(str, "research synthesis and executive decision assistant") {
			fmt.Fprintf(w, `{"choices":[{"message":{"content":%s}}]}`,
				strconv.Quote(`{"recommendation":"pursue","for_whom":"engineers","confidence":"high","risks":["Minor complexity"],"next_actions":["Read docs","Write POC","Ship to staging"]}`))
			return
		}
		fmt.Fprintf(w, `{"choices":[{"message":{"content":"Default LLM response"}}]}`)
	}))
	defer llm.Close()

	runner := stubRunner(llm, "")
	runner.Fetcher = newTraceFetcher()

	pb := port.Playbook{
		Name: "Ground + Verdict (No Report Step)",
		Steps: []port.PlaybookStep{
			{Position: 1, Kind: port.StepKindGround, Name: "Ground", Enabled: true},
			{Position: 2, Kind: port.StepKindVerdict, Name: "Verdict", Enabled: true},
		},
	}

	card := port.Card{
		ID:         10,
		Title:      "Go Concurrency Patterns",
		SourceURL:  "https://example.com/go",
		SourceNote: "Goroutines and channels in Go",
	}

	report, err := runner.RunWithPlaybook(context.Background(), card, 0, pb)
	if err != nil {
		t.Fatalf("RunWithPlaybook failed unexpectedly: %v", err)
	}

	if !strings.Contains(report, "# Research: Go Concurrency Patterns") {
		t.Errorf("expected title heading in report, got:\n%s", report)
	}
	if !strings.Contains(report, "## Executive Verdict") {
		t.Errorf("expected '## Executive Verdict' section, got:\n%s", report)
	}
	if !strings.Contains(report, "PURSUE") {
		t.Errorf("expected recommendation in report, got:\n%s", report)
	}
}

func TestRunWithPlaybook_NoReportStep_GroundAndCustomAnalysis(t *testing.T) {
	llm := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		str := string(body)
		if strings.Contains(str, "Analyze trade-offs") {
			fmt.Fprintf(w, `{"choices":[{"message":{"content":"Trade-off analysis shows low latency but high memory footprint."}}]}`)
			return
		}
		fmt.Fprintf(w, `{"choices":[{"message":{"content":"Default LLM response"}}]}`)
	}))
	defer llm.Close()

	runner := stubRunner(llm, "")
	runner.Fetcher = newTraceFetcher()

	pb := port.Playbook{
		Name: "Ground + Custom Analysis (No Report Step)",
		Steps: []port.PlaybookStep{
			{Position: 1, Kind: port.StepKindGround, Name: "Ground", Enabled: true},
			{
				Position: 2,
				Kind:     port.StepKindCustom,
				Name:     "Trade-off Analysis",
				Enabled:  true,
				Config: port.CustomStepConfig{
					Instruction:   "Analyze trade-offs for this architecture",
					OutputHeading: "Architecture Trade-offs",
					ToolPolicy:    "none",
				},
			},
		},
	}

	card := port.Card{
		ID:    20,
		Title: "Event-Driven Microservices",
	}

	report, err := runner.RunWithPlaybook(context.Background(), card, 0, pb)
	if err != nil {
		t.Fatalf("RunWithPlaybook failed unexpectedly: %v", err)
	}

	if !strings.Contains(report, "# Research: Event-Driven Microservices") {
		t.Errorf("expected title heading in report, got:\n%s", report)
	}
	if !strings.Contains(report, "## Architecture Trade-offs") {
		t.Errorf("expected custom heading '## Architecture Trade-offs' in report, got:\n%s", report)
	}
	if !strings.Contains(report, "Trade-off analysis shows low latency") {
		t.Errorf("expected custom analysis content in report, got:\n%s", report)
	}
}

func TestRunWithPlaybook_NoReportStep_NoContent_ReturnsErrEmptyReport(t *testing.T) {
	llm := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"choices":[{"message":{"content":"Default LLM response"}}]}`)
	}))
	defer llm.Close()

	runner := stubRunner(llm, "")
	runner.Fetcher = newTraceFetcher()

	// Playbook with only ground step on a card with no capture, refs, or sources
	pb := port.Playbook{
		Name: "Ground Only No Sources",
		Steps: []port.PlaybookStep{
			{Position: 1, Kind: port.StepKindGround, Name: "Ground", Enabled: true},
		},
	}

	card := port.Card{
		ID:    30,
		Title: "Empty Card",
	}

	_, err := runner.RunWithPlaybook(context.Background(), card, 0, pb)
	if err == nil {
		t.Fatal("expected ErrEmptyReport when no sections or content could be synthesized")
	}
	if err != ErrEmptyReport {
		t.Fatalf("expected ErrEmptyReport, got: %v", err)
	}
}
