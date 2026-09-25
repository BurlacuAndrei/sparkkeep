# Prompt 13 — Add Concurrency Limit to Telegram Update Handling

## Goal
Prevent unbounded goroutine spawning when processing Telegram updates.

## Problem
`Run()` in `telegram.go` (line 106) dispatches every update to its own goroutine: `go a.handleUpdate(u)`. Each handler can trigger `Service.Capture()` → LLM analysis (expensive). A burst of 50 messages would spawn 50 parallel LLM calls with no semaphore, potentially exhausting memory or hitting rate limits.

## Changes Required

1. **`internal/channel/telegram/telegram.go`**:
   - Add a semaphore to limit concurrent update processing:
     ```go
     // In Adapter struct:
     sem chan struct{} // concurrency limiter, initialized in Run()
     ```
   - In `Run()`, initialize: `a.sem = make(chan struct{}, 3)` (3 concurrent handlers)
   - Replace `go a.handleUpdate(u)` with:
     ```go
     go func(u update) {
         a.sem <- struct{}{}
         defer func() { <-a.sem }()
         a.handleUpdate(u)
     }(u)
     ```

2. **Alternative**: Use a worker pool with a fixed number of workers consuming from a channel.

## Acceptance Criteria
- At most N update handlers run concurrently (N configurable, default 3)
- Updates are still processed in parallel (not serialized)
- No goroutine leaks
- All tests pass

## Severity: HIGH
