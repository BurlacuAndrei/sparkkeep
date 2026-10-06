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
3. **Fail-Open Core:** The open-source core provides complete capture, AI analysis, horizon routing, search, and kanban triage without any paywall. Pro capabilities (like Obsidian sync and outbound webhooks) are gated via local Ed25519 signature checks.

## 🧪 Code Quality & CI

Before submitting a Pull Request, ensure:
- `gofmt -w .` has been run.
- `go vet ./...` passes without issues.
- `cd frontend && npm run lint` passes without errors or warnings.
- All Go tests pass with `-race`: `go test -race ./...`.
