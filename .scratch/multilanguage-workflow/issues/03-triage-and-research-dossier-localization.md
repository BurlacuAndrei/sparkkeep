# 03: End-to-End Triage & Research Dossier Localization

**What to build:** Ensure AI Triage and Research pipelines produce fully localized prose in the user's configured `Output Language` while preserving canonical English JSON schema enum values for deterministic parsing and routing. Inject the `Output Language` instruction across every LLM-driven Research step (even when personal profile context is empty or disabled), keep Question Planning web search queries optimized for primary-source recall while localizing human-facing questions, localize compiled Markdown report headings in both the report step and `Fallback Report Synthesizer`, and preserve source-language fidelity during raw audio transcription and vision OCR.

**Blocked by:** 01 (#50), 02 (#51)

**Status:** ready-for-agent

- [ ] Triage and Research `Output Language` prompt instructions explicitly require structural JSON keys and enum literals (`type` for canonical types, `horizon`, `worthiness.level`, `signals.extraction`, `signals.source_quality`, `references.kind`, `claims[].status`, `verdict.recommendation`, `verdict.confidence`, `verdict.suggested_horizon`) to remain exact canonical English literals while all human-readable prose fields and generated `tags` are written in the target `Output Language`.
- [ ] Triage card normalization includes a reverse-lookup fallback so that if an LLM outputs a localized name of an active `Canonical Card Type`, it resolves to the canonical slug instead of falling back to `other`.
- [ ] The `Output Language` instruction is decoupled from personal profile fit context so it is injected into `plan`, `verify_claims`, `landscape`, `verdict`, and `custom` steps even when profile fields are empty or `UseProfile` is disabled.
- [ ] Question Planning (`plan`) instructs the model to write the display `question` in the target `Output Language` while generating the web search `query` in the optimal source/technical language for retrieving primary documentation.
- [ ] Compiled Markdown report headings and field labels (`Research`, `Executive Verdict`, `Recommendation`, `Confidence`, `For Whom`, `Key Risks`, `Recommended Next Actions`, `Claim Verification`, `Competitive Landscape & Alternatives`, `How it differs`, `Questions & Findings`, `Search query`, `Sources & Citations`) are localized in both the explicit report step and `Fallback Report Synthesizer` (and corresponding frontend dossier views).
- [ ] Raw audio transcription and vision OCR extraction remain faithful to the source media's original language prior to Triage synthesis.
- [ ] Automated unit and integration tests verify prompt contracts, normalizer reverse-lookup fallback, end-to-end research step localization, and localized Markdown report synthesis.
