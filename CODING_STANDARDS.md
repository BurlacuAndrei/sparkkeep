# Coding Standards & Architectural Seams

## 1. Architectural Boundaries & Domain Ownership
- **Core Orchestration (`internal/core`):** All business workflows, scheduled tasks, background queue processing, and event fan-outs belong in `internal/core/Service`.
- **Channel Adapters (`internal/channel/*`):** Channel adapters (Telegram, Discord, Slack) must remain thin protocol bridges. They are strictly responsible for:
  1. Translating incoming transport payloads into `port.Capture` / `port.Notification` requests.
  2. Formatting domain notifications into platform-specific UI (Markdown, buttons, embeds).
  - **No Direct Storage Mutations:** Adapters must never query SQLite directly or persist settings. All state operations must go through `core.Service` or `ChannelHub`.
- **Single Channel Hub (`internal/channel/hub.go`):** Outbound notifications flow through `port.ChannelHub.Notify`, which handles targeted routing to originating channels and concurrent broadcast fallback with per-adapter timeout and error isolation.

## 2. API & Model Discipline
- **Shared Normalizers:** Parsing, canonicalization, URL cleaning, and entity validation must live in dedicated domain functions (e.g. `analyze` or `port`), never copy-pasted across handler methods.
- **Provenance Encapsulation:** Multi-channel provenance tracking must use the standard `port.Provenance` construct (`Channel`, `ChatID`, `MsgID`).
- **Zero Paywalls & Open Source Integrity:** Sparkkeep is 100% open-source under MIT. No gating, license tiers, or paywall metadata structures.

## 3. Frontend Quality & React Lifecycle
- **Zero Console Warnings in Vitest:** All tests must run cleanly with zero un-wrapped `act(...)` or React state leak warnings. Asynchronous state changes must be awaited with `waitFor` or `await userEvent`.
- **Dynamic Taxonomy:** All card type options and chips must consume the active taxonomy from `/api/v1/settings/card-types`, with fallbacks strictly reflecting backend `DefaultCardTypes`.
- **Component Sizing:** UI components should adhere to single responsibility. Complex canvases, inspectors, and modal sheets must be split into dedicated domain subcomponents.

## 4. CI Invariants
Every commit must satisfy:
1. `gofmt -l .` has zero output.
2. `go vet ./...` passes without warnings.
3. `go test -v -race ./...` passes all unit and integration tests.
4. `npm run lint` and `npm test` in `frontend/` pass with zero errors and zero warnings.
5. Embedded assets (`internal/web/dist`) remain synchronized with production builds.
