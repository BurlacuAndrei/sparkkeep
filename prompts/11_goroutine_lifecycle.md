# Prompt 11 — Add Goroutine Lifecycle Management

## Goal
Track fire-and-forget goroutines (research, telegram capture) with a `sync.WaitGroup` so the server shuts down cleanly.

## Problem
- `web.go:376`: `go a.svc.Research(context.Background(), b.CardID)` — goroutine is orphaned on shutdown
- `telegram.go:367`: same pattern for research callback
- `telegram.go:333`: `Service.Capture` runs inline but with `context.Background()`

These goroutines use `context.Background()` so they ignore shutdown signals and can be killed mid-write.

## Changes Required

1. **`internal/core/core.go`**:
   - Add a `sync.WaitGroup` field to `Service`: `WG sync.WaitGroup`
   - Add a `Ctx context.Context` field (or a `cancel` func) set from the main app context
   - Add methods:
     ```go
     func (s *Service) GoResearch(ctx context.Context, cardID int64) {
         s.WG.Add(1)
         go func() {
             defer s.WG.Done()
             if err := s.Research(ctx, cardID); err != nil {
                 s.Logf("core: background research %d: %v", cardID, err)
             }
         }()
     }
     ```

2. **`internal/web/web.go`**:
   - Replace `go a.svc.Research(context.Background(), b.CardID)` with `a.svc.GoResearch(r.Context(), b.CardID)` (or use a shared app-level context)

3. **`internal/channel/telegram/telegram.go`**:
   - Replace `go func() { ... s.Service.Research(ctx, id) ... }()` with `a.Service.GoResearch(ctx, id)`

4. **`cmd/sparkkeep/main.go`**:
   - After `srv.Shutdown()`, call `svc.WG.Wait()` to drain in-flight background work before exiting

## Acceptance Criteria
- All background goroutines are tracked
- Clean shutdown waits for in-flight research to complete (with a timeout)
- All tests pass

## Severity: HIGH
