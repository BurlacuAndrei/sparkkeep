# Sparkkeep Codebase Analysis Report

## Overview
This report provides an analysis of the `sparkkeep` codebase from the perspective of a new Team Lead. It evaluates the project's folder structure, package organization, clean code practices, and identifies areas of technical debt.

## 1. Folders & Package Organization
**Rating: Excellent**

The project adheres strongly to the standard Go project layout and a pragmatic, single-binary architecture.
- **Root Structure:** `cmd/` (entrypoints), `internal/` (private app code), `docs/` (design docs), and `frontend/` (SPA codebase).
- **Domain Separation (Hexagonal/Ports & Adapters):** 
  - `internal/port/` defines clean boundaries (`Store` and `Channel` interfaces).
  - `internal/core/` acts as the orchestrator (`Service`), coordinating domain packages without directly depending on their implementations.
  - Domain-specific logic is well encapsulated in `internal/analyze/` (LLMs), `internal/store/` (SQLite persistence), `internal/capture/` (fetching/parsing), and `internal/research/`.
- **Frontend Integration:** The React SPA lives in `frontend/`, and its built assets (`dist/`) are cleanly embedded into the Go binary via `embed.FS` in `internal/web/`. This achieves a single-container deployment beautifully.

## 2. Clean Code Practices
**Rating: Good**

- **Dependency Injection:** Dependencies are explicitly wired in `cmd/sparkkeep/main.go`. `core.Service` is injected with its dependencies (`port.Store`, `analyze.Client`, etc.), making testing easier.
- **Context Usage:** `context.Context` is passed consistently through the call stack (API → Core → External APIs/DB). Timeouts and cancellations are handled correctly (e.g., bounded context for LLM research, `exec.CommandContext` for `ffmpeg`).
- **Graceful Shutdown:** The main application waits for background goroutines (`WG.Wait()`) and active HTTP requests before exiting, which prevents data loss during SIGTERM.
- **React Components:** The frontend leverages React 19 features, functional components, and hooks (`useCallback`, `useEffect`). API logic is cleanly extracted into `api.ts`.

## 3. Technical Debt & Areas for Improvement
**Rating: Moderate**

While the codebase is robust for a v1, there are several areas of technical debt that need addressing before scaling:

### Backend (Go)
1. **Unbounded/Limited List API (Pagination Missing):** 
   - `GET /api/v1/cards` accepts a `limit` but lacks cursor or offset pagination. The dashboard loads all matching cards up to the limit. As the user accumulates thousands of cards, this will bloat memory and slow down the frontend.
2. **SQLite `IN` Clause Limitation:**
   - In `internal/store/store.go` (`ListCards`), tags are fetched using an `IN (...)` clause based on card IDs. SQLite has a hard limit on query variables (often 999 or 32766). If a large batch of cards is queried, this could trigger a driver error.
3. **Procedural Orchestration in `core.go`:**
   - `CaptureShare` in `internal/core/core.go` is massive. It handles API fetching, analysis, error degradation (storing an "Analysis failed" card), uniqueness constraints, and notifying channels all in one function. This violates the Single Responsibility Principle and is hard to unit test comprehensively.
4. **Error Handling Types:**
   - Most errors are returned via `fmt.Errorf` or `errors.New` (e.g., in `research.go`). This makes programmatic error inspection difficult. Defining concrete error types (like `port.ErrNotFound`) across all layers would improve resilience.
5. **LLM Parsing Brittleness:**
   - `ExtractJSON` in `internal/analyze/analyze.go` uses a cascade of struct mapping fallbacks (`cards`, `ideas`, `title`). While pragmatic for prompt drift, it masks structural regressions. Switching to OpenAI's structured outputs (`response_format: json_schema`) could eliminate this parsing debt.
6. **SQL String Concatenation:**
   - `UpdateCard` in `store.go` builds the `UPDATE` statement dynamically via string concatenation. While arguments are parameterized, this approach is error-prone. A lightweight query builder (like Squirrel) would be safer.

### Frontend (React/TypeScript)
1. **Prop Drilling:**
   - State and callbacks in `App.tsx` are drilled down several layers (e.g., `handleStatusChange`, `handleResearch` passing through `KanbanBoard` down to cards). Introducing React Context or a lightweight store (Zustand) would flatten this structure.
2. **TS `any` in Error Handling:**
   - Throughout `App.tsx` and `TriageView.tsx`, error catches use `catch (err: any)`. This circumvents TypeScript's type safety. Typing errors properly (or checking `if (err instanceof Error)`) is standard practice.
3. **Global CSS Scaling:**
   - The UI uses vanilla CSS (`App.css`, `index.css`). As the application grows, global CSS classes (e.g., `.app-container`, `.modal-content`) will risk collisions. Adopting CSS Modules or a utility framework like Tailwind (if desired) would mitigate this.

## Conclusion
The repository is in a healthy state for its current scope (single-user, single-binary self-hosted tool). The folder and architecture patterns are excellent. The primary focus for the next iterations should be implementing API pagination, refactoring the `CaptureShare` orchestration, and tidying up the frontend state management.
