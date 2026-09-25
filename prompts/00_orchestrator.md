# Sparkkeep Refactoring Orchestrator

## Overview
This orchestrator executes 20 atomic refactoring prompts identified during a principal-engineer code review of the Sparkkeep codebase. Each prompt is designed to be executed by a **separate subagent** in a single focused session.

## Execution Strategy

### Dependency Graph
Some prompts depend on others. Execute in this order, parallelizing where possible:

```
Phase 1 (Independent — run in parallel):
├── 01_analyze_add_context.md      (HIGH)
├── 05_web_parse_template_once.md  (MEDIUM)
├── 09_capture_rune_truncation.md  (LOW)
├── 12_telegram_bound_map.md       (MEDIUM)
├── 14_telegram_use_config.md      (LOW)
├── 16_frontend_card_modal_key.md  (HIGH)
├── 17_frontend_error_boundary.md  (MEDIUM)
├── 18_config_warn_parse_errors.md (LOW)
└── 20_capture_dedicated_http_client.md (MEDIUM)

Phase 2 (Depends on Phase 1):
├── 02_analyze_dedup_http.md       (MEDIUM) — depends on 01
├── 04_web_body_size_limit.md      (HIGH)
├── 06_web_add_digest_filter.md    (MEDIUM)
├── 07_web_validate_inputs.md      (HIGH)
├── 08_capture_inject_config.md    (MEDIUM) — depends on 18, 20
├── 10_core_retry_cleanup.md       (MEDIUM)
├── 13_telegram_concurrency.md     (HIGH) — depends on 12
└── 15_research_inject_fetcher.md  (MEDIUM)

Phase 3 (Depends on Phase 2):
├── 03_store_fix_n_plus_1.md       (HIGH) — depends on 06
├── 11_goroutine_lifecycle.md      (HIGH) — depends on 13
└── 19_test_coverage_web_store.md  (MEDIUM) — depends on 04, 06, 07
```

## Subagent Instructions

For each prompt, execute a subagent with these instructions:

### Template

```
You are a Go/TypeScript refactoring agent. Your task is to implement exactly ONE
atomic refactoring from the prompt file provided below.

**Rules:**
1. Read the prompt file FIRST, entirely
2. Read all files mentioned in the prompt to understand current state
3. Make ONLY the changes described in the prompt — nothing more
4. After making changes, run the test command specified in the prompt
5. If tests fail, debug and fix until they pass
6. Preserve all existing comments and docstrings unrelated to your changes
7. Report: which files changed, which tests pass, any issues encountered

**Prompt file to execute:**
./prompts/<PROMPT_FILENAME>

**Test verification command:**
go test ./internal/... (for Go changes)
cd frontend && npm run build (for frontend changes)
```

### Execution Commands

Execute each prompt as a subagent. For each phase, wait for all prompts in that phase to complete before proceeding to the next.

**Phase 1** — Execute these 9 prompts in parallel:
```
Subagent 1:  Read and execute ./prompts/01_analyze_add_context.md      → verify: go test ./internal/analyze/... ./internal/core/...
Subagent 2:  Read and execute ./prompts/05_web_parse_template_once.md  → verify: go test ./internal/web/...
Subagent 3:  Read and execute ./prompts/09_capture_rune_truncation.md  → verify: go test ./internal/capture/...
Subagent 4:  Read and execute ./prompts/12_telegram_bound_map.md       → verify: go test ./internal/channel/...
Subagent 5:  Read and execute ./prompts/14_telegram_use_config.md      → verify: go test ./internal/channel/...
Subagent 6:  Read and execute ./prompts/16_frontend_card_modal_key.md  → verify: cd frontend && npm run build
Subagent 7:  Read and execute ./prompts/17_frontend_error_boundary.md  → verify: cd frontend && npm run build
Subagent 8:  Read and execute ./prompts/18_config_warn_parse_errors.md → verify: go test ./internal/config/...
Subagent 9:  Read and execute ./prompts/20_capture_dedicated_http_client.md → verify: go test ./internal/capture/...
```

**Phase 2** — Execute these 8 prompts in parallel:
```
Subagent 10: Read and execute ./prompts/02_analyze_dedup_http.md       → verify: go test ./internal/analyze/... ./internal/core/...
Subagent 11: Read and execute ./prompts/04_web_body_size_limit.md      → verify: go test ./internal/web/...
Subagent 12: Read and execute ./prompts/06_web_add_digest_filter.md    → verify: go test ./internal/web/... ./internal/store/...
Subagent 13: Read and execute ./prompts/07_web_validate_inputs.md      → verify: go test ./internal/web/...
Subagent 14: Read and execute ./prompts/08_capture_inject_config.md    → verify: go test ./internal/capture/... ./internal/core/...
Subagent 15: Read and execute ./prompts/10_core_retry_cleanup.md       → verify: go test ./internal/core/...
Subagent 16: Read and execute ./prompts/13_telegram_concurrency.md     → verify: go test ./internal/channel/...
Subagent 17: Read and execute ./prompts/15_research_inject_fetcher.md  → verify: go test ./internal/research/... ./internal/core/...
```

**Phase 3** — Execute these 3 prompts in parallel:
```
Subagent 18: Read and execute ./prompts/03_store_fix_n_plus_1.md       → verify: go test ./internal/store/...
Subagent 19: Read and execute ./prompts/11_goroutine_lifecycle.md      → verify: go test ./internal/core/... ./internal/web/... ./internal/channel/...
Subagent 20: Read and execute ./prompts/19_test_coverage_web_store.md  → verify: go test ./internal/web/... ./internal/store/...
```

**Final Verification** — After all phases:
```
go test ./...
cd frontend && npm run build
go vet ./...
```

## Priority Ranking (If Time-Constrained)

If you can only execute a subset, prioritize by severity:

### Must Do (HIGH severity):
1. `01_analyze_add_context.md` — Analyze() un-cancellable
2. `03_store_fix_n_plus_1.md` — N+1 query performance
3. `04_web_body_size_limit.md` — OOM vulnerability
4. `07_web_validate_inputs.md` — No input validation
5. `11_goroutine_lifecycle.md` — Orphaned goroutines
6. `13_telegram_concurrency.md` — Unbounded concurrency
7. `16_frontend_card_modal_key.md` — Visible UI bug

### Should Do (MEDIUM severity):
8-15. All MEDIUM prompts

### Nice to Have (LOW severity):
16-20. All LOW prompts

## Success Criteria
- All 20 prompts executed and verified
- `go test ./...` passes
- `cd frontend && npm run build` succeeds
- `go vet ./...` has no warnings
- No regressions in existing functionality
