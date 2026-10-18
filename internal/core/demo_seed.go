package core

import (
	"context"
	"fmt"
	"time"

	"sparkkeep/internal/port"
)

// SeedDemoData seeds the library with a realistic, high-signal multi-horizon showcase dataset.
func (s *Service) SeedDemoData(ctx context.Context) error {
	if s.Store == nil {
		return fmt.Errorf("seed: store not configured")
	}

	now := time.Now().UTC()

	// 1. Article in Inbox (Ready to Triage)
	_, _ = s.Store.CreateCard(ctx, port.Card{
		Title:            "Architecture of SQLite WAL Mode for Single-Binary Systems",
		Summary:          "Deep dive into SQLite Write-Ahead Logging (WAL) concurrency, memory-mapped I/O, and zero-CGO single-binary distribution.",
		Horizon:          "short-term",
		Status:           port.StatusInbox,
		Type:             "article",
		SourceURL:        "https://sqlite.org/wal.html",
		SourceNote:       "Recommended by senior systems team for zero-maintenance embedded storage.",
		TLDR:             "WAL mode replaces traditional rollback journals with an append-only log, allowing concurrent readers alongside a serialized writer.",
		WhyCare:          "Enables high-throughput read scaling without external database daemons or network latency.",
		Claims:           []string{"Readers do not block writers and writers do not block readers in WAL mode", "Single-binary deployment drastically simplifies operations"},
		Worthiness:       port.Worthiness{Level: "high", Reason: "Foundational architectural pattern for single-binary self-hosted applications."},
		SuggestedHorizon: "short-term",
		SuggestedTags:    []string{"sqlite", "architecture", "database"},
		ExecutiveSummary: "An analysis of SQLite's WAL storage engine, focusing on concurrency, checkpointing discipline, and memory mapped I/O.",
		ValueProposition: "Eliminate PostgreSQL/MySQL infrastructure operational overhead for homelab and edge deployments.",
		ProposedActions:  []string{"Benchmark PRAGMA busy_timeout under concurrent load", "Verify memory mapped I/O settings on Linux NAS", "Test checkpoint behavior during automated backups"},
		Tags:             []string{"sqlite", "architecture", "database"},
	})

	// 2. Tool in Doing (Short-term Execution)
	_, _ = s.Store.CreateCard(ctx, port.Card{
		Title:            "Model Context Protocol (MCP) Multi-Agent Orchestration",
		Summary:          "Open standard protocol for connecting AI coding agents directly to local and remote tool endpoints with typed schemas.",
		Horizon:          "short-term",
		Status:           port.StatusInProgress,
		Type:             "tool",
		SourceURL:        "https://modelcontextprotocol.io",
		SourceNote:       "Investigate stdio vs SSE transports for Sparkkeep MCP server.",
		TLDR:             "MCP provides standardized JSON-RPC interfaces for tool discovery, execution, and resource context.",
		WhyCare:          "Allows external agents like Claude, Gemini, and local LLMs to interact directly with your Sparkkeep library.",
		Worthiness:       port.Worthiness{Level: "high", Reason: "Standardizing AI tool interfaces avoids proprietary SDK lock-in."},
		SuggestedHorizon: "short-term",
		SuggestedTags:    []string{"ai", "mcp", "agents"},
		ProposedActions:  []string{"Expose Sparkkeep search and capture over stdio MCP", "Test cursor and claude desktop client connections"},
		CompletedActions: []string{"Expose Sparkkeep search and capture over stdio MCP"},
		Tags:             []string{"ai", "mcp", "agents"},
	})

	// 3. Project in Medium-term (Doing)
	_, _ = s.Store.CreateCard(ctx, port.Card{
		Title:            "Automated Media Retention & Storage Garbage Collection",
		Summary:          "Background LRU pruner and age-based expiration for uploaded images and audio voice memos.",
		Horizon:          "medium-term",
		Status:           port.StatusInProgress,
		Type:             "project",
		SourceNote:       "Implemented via 24h ticker and graceful shutdown in Sparkkeep core.",
		TLDR:             "Prevents unmanaged media growth on resource-constrained NAS and VPS disks.",
		WhyCare:          "Ensures long-term zero-touch unattended operation.",
		Worthiness:       port.Worthiness{Level: "medium", Reason: "Crucial operational maintenance for self-hosted servers."},
		SuggestedHorizon: "medium-term",
		SuggestedTags:    []string{"infra", "storage"},
		ProposedActions:  []string{"Implement PurgeOldUploads ticker", "Add disk quota validation in readyz probe"},
		CompletedActions: []string{"Implement PurgeOldUploads ticker"},
		Tags:             []string{"infra", "storage"},
	})

	// 4. Milestone in Done (Weekly Win)
	_, _ = s.Store.CreateCard(ctx, port.Card{
		Title:            "Deploy ModernC CGO-Free SQLite Engine with FTS5 Full-Text Search",
		Summary:          "Migrated to pure Go modernc.org/sqlite with compiled FTS5 extension for cross-compilation across Linux, macOS, and Windows.",
		Horizon:          "short-term",
		Status:           port.StatusDone,
		Type:             "article",
		SourceURL:        "https://pkg.go.dev/modernc.org/sqlite",
		SourceNote:       "Enables cross-compilation with CGO_ENABLED=0.",
		TLDR:             "Pure Go SQLite translation enables true static binary distribution without cross-compiler toolchains.",
		WhyCare:          "Zero cross-compilation errors across amd64 and arm64 targets.",
		Worthiness:       port.Worthiness{Level: "high", Reason: "Major release engineering simplification."},
		SuggestedHorizon: "short-term",
		SuggestedTags:    []string{"go", "sqlite", "build"},
		CompletedActions: []string{"Verify FTS5 match queries", "Run go test -race across all packages"},
		Tags:             []string{"go", "sqlite", "build"},
	})

	// 5. Research Card in Review with Complete Research Dossier
	researchCard, err := s.Store.CreateCard(ctx, port.Card{
		Title:              "Vector Embeddings vs SQLite FTS5 for Personal Knowledge Bases",
		Summary:            "Deterministic benchmark comparing BM25 keyword search with dense vector embeddings on a 10,000 document corpus.",
		Horizon:            "short-term",
		Status:             port.StatusReview,
		Type:               "research",
		SourceNote:         "Benchmark conducted across local Ollama nomic-embed-text vs SQLite FTS5 trigrams.",
		TLDR:               "FTS5 BM25 delivers sub-millisecond keyword lookup with zero memory overhead; hybrid vector reranking offers minor recall gains at 10x compute cost.",
		WhyCare:            "Validates keeping Sparkkeep lean without requiring heavy vector databases like Chroma or Qdrant.",
		Worthiness:         port.Worthiness{Level: "high", Reason: "Core architectural validation for personal intelligence."},
		SuggestedHorizon:   "short-term",
		SuggestedTags:      []string{"research", "search", "benchmarks"},
		ResearchVerdict:    "pursue",
		ResearchConfidence: "high",
		ProposedActions:    []string{"Document hybrid FTS5 search architecture in README", "Benchmark FTS5 ranking functions with Porter stemming"},
		Tags:               []string{"research", "search", "benchmarks"},
	})

	if err == nil && researchCard.ID > 0 {
		r, rerr := s.Store.CreateResearch(ctx, researchCard.ID, "Vector Embeddings vs SQLite FTS5 for Personal Knowledge Bases")
		if rerr == nil {
			findings := "Comprehensive analysis reveals that SQLite FTS5 achieves 94% relevant retrieval accuracy for technical personal notes while consuming < 5MB RAM and 0.4ms query time."
			_, _ = s.Store.SetResearch(ctx, r.ID, "done", findings, "")
			steps := []port.ResearchStep{
				{ID: "step-1", Status: "done", StartedAt: now, FinishedAt: now, Note: "Research Scope & Query Strategy: Evaluated 10,000 document library on Apple M-series and AMD64 NAS."},
				{ID: "step-2", Status: "done", StartedAt: now, FinishedAt: now, Note: "Search Engine Landscape: SQLite FTS5 provides instantaneous start, 0 MB baseline RAM, and sub-millisecond query latency."},
				{ID: "step-3", Status: "done", StartedAt: now, FinishedAt: now, Note: "Synthesis & Verdict: PURSUE SQLite FTS5 as default. Dense vectors add latency without significant signal for personal libraries."},
			}
			resResult := &port.ResearchResult{
				Verdict: &port.ResearchVerdict{
					Recommendation: "pursue",
					Confidence:     "high",
					ForWhom:        "Personal knowledge base users and local-first self-hosters.",
					Risks:          []string{"Dense semantic synonym search requires keyword matches"},
					NextActions:    []string{"Document hybrid FTS5 search architecture in README"},
				},
			}
			_ = s.Store.UpdateResearchProgress(ctx, r.ID, "done", "Vector Embeddings vs SQLite FTS5 for Personal Knowledge Bases", steps, nil, nil, resResult, 1500)
		}
	}

	// 6. Later / Long-term Horizon Idea
	_, _ = s.Store.CreateCard(ctx, port.Card{
		Title:            "Local Audio Transcription with Whisper.cpp on Edge NPU",
		Summary:          "Investigate hardware-accelerated local transcription for voice memos via Telegram and mobile browser voice notes.",
		Horizon:          "long-term",
		Status:           port.StatusInbox,
		Type:             "idea",
		SourceNote:       "Captured via mobile voice note idea.",
		TLDR:             "Transcribe voice memos on local hardware using quantized Whisper models.",
		WhyCare:          "Complete privacy for personal voice thoughts without cloud API leaks.",
		Worthiness:       port.Worthiness{Level: "medium", Reason: "Valuable addition for mobile capture workflows."},
		SuggestedHorizon: "long-term",
		SuggestedTags:    []string{"ai", "audio", "whisper"},
		ProposedActions:  []string{"Prototype whisper.cpp CLI integration", "Benchmark tiny.en vs base.en models on 4-core NAS"},
		Tags:             []string{"ai", "audio", "whisper"},
	})

	return nil
}
