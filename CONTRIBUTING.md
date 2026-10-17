# Contributing to Sparkkeep

Thank you for your interest in contributing to Sparkkeep! 

Sparkkeep is built as a single-binary, self-hosted web app with an embedded React frontend and an embedded SQLite database.

## 🛠️ Development Setup

### Prerequisites
- **Go 1.26+**
- **Node.js 22+** & **npm**

### Quick Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/BurlacuAndrei/sparkkeep.git
   cd sparkkeep
   ```

2. **Build frontend assets:**
   ```bash
   cd frontend
   npm install
   npm run build
   cd ..
   ```

3. **Run tests:**
   ```bash
   go test -v ./...
   ```

4. **Run locally:**
   ```bash
   go run ./cmd/sparkkeep
   ```
   Open `http://localhost:8080` in your browser.

## 📐 Architecture Principles

1. **Zero External DB Dependencies:** All persistence uses local SQLite with embedded SQL migrations (`internal/store/migrations`).
2. **Single Binary:** Production releases embed the Vite frontend bundle (`internal/web/dist`) directly into the Go binary using `//go:embed`.
3. **Fail-Open Core, No Gating:** Every capability — capture, AI analysis, horizon routing, search, kanban triage, research playbooks, Obsidian sync, and outbound webhooks — is always on. There is no paywall, license key, or capability flag; nothing may be made conditional on a tier.

## 🏷️ Finding Tasks to Work On

Check our [GitHub Issues](https://github.com/BurlacuAndrei/sparkkeep/issues) tab. We label beginner-friendly tasks with:
- **`good first issue`**: Well-scoped starter tasks ideal for first-time contributors.
- **`help wanted`**: Clear feature requests or enhancements needing community hands.
- **`documentation`**: Improvements to user guides, setup scripts, or architecture docs.

## 🧪 Code Quality & Pre-Flight Verification

Sparkkeep enforces strict CI invariants. Before submitting a Pull Request, run the single unified verification command from the repo root:

```bash
make check
```

This command runs:
1. `gofmt -w .` (Go code formatting)
2. `go vet ./...` (Go static analysis)
3. `cd frontend && npm run lint` (Frontend linting with oxlint)
4. `cd frontend && npm test` (Frontend Vitest test suite)
5. `cd frontend && npm run build` (Compiles production React bundle)
6. Verifies that `internal/web/dist` is synchronized and committed.
7. `go test -race ./...` (Runs all Go unit, integration, and concurrency tests with race detector enabled)

Ensure all checks pass with zero errors and zero warnings before opening your PR.
