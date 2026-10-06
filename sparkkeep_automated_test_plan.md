# Sparkkeep Automated Test Plan

## Overview
This document outlines the comprehensive automated test plan for the `sparkkeep` service. As a single-binary, self-hosted Go application with an embedded React frontend, testing must ensure the stability of its API, the resilience of its external integrations (LLMs, media fetching), and the correctness of the frontend SPA.

## Test Pyramid Strategy
We will employ a standard test pyramid:
1. **Unit Tests (Backend & Frontend):** Fast, isolated tests for business logic, parsing, and component rendering.
2. **Integration Tests (Backend):** Tests validating the API layer, database queries (SQLite), and core orchestrations with mocked external boundaries.
3. **End-to-End (E2E) Tests:** Browser-based tests (Playwright) interacting with the fully assembled application to validate critical user journeys.

---

## Flow Analysis & Test Coverage

### 1. Authentication Flow
- **Description:** Verifies user access via `SPARKKEEP_AUTH_TOKEN`. Users submit a token, which is validated and exchanged for a long-lived cookie.
- **Automated Coverage:**
  - **Integration (Go):** Test the auth middleware (`authMiddleware`) against protected and public routes (e.g., `/api/v1/health` is public, `/api/v1/cards` is protected). Test the `/api/v1/auth/verify` endpoint with valid and invalid tokens.
  - **E2E (Playwright):** Visit the dashboard without a token -> assert unlock modal appears -> submit valid token -> assert dashboard loads and token is stored in cookie/localStorage.

### 2. Capture & Share Flow (`CaptureShare`)
- **Description:** The core orchestration flow. It receives raw text/links/media, fetches content, extracts audio/text, queries the LLM for analysis, handles uniqueness constraints, stores a card, and notifies the channel.
- **Automated Coverage:**
  - **Unit (Go - `core.Service`):**
    - Mock `capture.Fetcher`, `Describer`, `Transcriber`, `analyze.Client`, and `port.Store`.
    - *Scenario: Successful Link Capture:* Assert LLM is called and Card is created.
    - *Scenario: Degradation on LLM Failure:* Assert LLM error results in an "Analysis failed" card being created.
    - *Scenario: Duplicate Handling:* Assert that capturing an existing URL updates the note and fires a duplicate notification, rather than duplicating the card.
    - *Scenario: Audio/Video Extraction:* Assert `ffmpeg` degradation paths if the binary is missing.
  - **Integration (Go):** Test the `/api/v1/capture` endpoint with a mocked LLM server (httptest) and an in-memory SQLite store to verify end-to-end capture persistence.

### 3. Card Management (CRUD)
- **Description:** Creation, retrieval, updating (patching), and exporting of cards. Includes batch operations like shelving stale cards.
- **Automated Coverage:**
  - **Unit (Go - Store):** Test complex SQLite queries (`ListCards` with filters/pagination, `UpdateCard` with dynamic patches) directly against a `file::memory:?cache=shared` SQLite instance.
  - **Integration (Go - Web):**
    - `GET /api/v1/cards`: Test filtering by tag, status, horizon.
    - `PATCH /api/v1/cards/{id}`: Test partial updates (e.g., only updating status).
    - `GET /api/v1/cards/{id}/export.md`: Validate Markdown generation logic.
    - `POST /api/v1/cards/batch-shelve-stale`: Seed database with old cards and assert they are shelved.
  - **Unit (Frontend):** Test API utility functions (`api.ts`) using Mock Service Worker (MSW) or Jest mocks.
  - **E2E (Playwright):** Create a card manually via the UI -> Edit the card (move across Kanban columns) -> Assert UI optimistic updates and API persistence.

### 4. Background Research Flow
- **Description:** Asynchronous deep-dive research on a card using LLMs. Triggered via API, runs in a background goroutine, and updates the database upon completion/failure.
- **Automated Coverage:**
  - **Unit (Go - Core/Research):** Mock the LLM to return a predefined response. Trigger research and assert the database transitions from `queued` -> `done` and the correct findings are saved.
  - **Integration (Go):** Test `/api/v1/research` trigger endpoint returns 200 Accepted immediately (async behavior), and test `/api/v1/research/{id}` returns the expected HTML or JSON based on headers.
  - **E2E (Playwright):** Click "Research" on a card -> Assert loading state -> Intercept API response to mock completion -> Assert findings are displayed in the UI.

### 5. Media & Upload Management
- **Description:** Handling of uploaded files, transcription, and serving media.
- **Automated Coverage:**
  - **Unit (Go):** Test `resolveMedia` for different file types (image, audio, video). Assert it correctly delegates to `Describer` (Vision) or `Transcriber` (ASR) based on mime type.
  - **Integration (Go):** Upload a mock image, assert it is written to the configured `UploadDir` with a SHA256 filename, and fetch it via `/api/v1/media/{name}`.

### 6. Dashboard & Weekly Digest
- **Description:** Grouping cards by day for the last 7 days and calculating status totals.
- **Automated Coverage:**
  - **Integration (Go):** Seed the database with cards spanning 10 days. Call `/api/v1/digest` and assert only the last 7 days are returned, and totals are calculated accurately per day and status.
  - **Unit (Frontend):** Test React components rendering the digest, ensuring empty states and populated states render correctly.

---

## Tooling & Infrastructure Recommendations

1. **Backend (Go):**
   - **Testing Framework:** Standard `testing` package.
   - **Assertions:** `github.com/stretchr/testify/require` for readable assertions.
   - **Mocking:** `github.com/golang/mock` or manual interface mocks for `port.Store` and external clients.
   - **Database Testing:** Use in-memory SQLite (`sql.Open("sqlite3", "file::memory:?cache=shared")`) for fast integration tests without external dependencies.

2. **Frontend (React/TypeScript):**
   - **Unit Testing:** `Vitest` (since Vite is used) with `@testing-library/react` for component testing.
   - **API Mocking:** `Mock Service Worker (MSW)` to intercept frontend fetch calls in tests.

3. **End-to-End (E2E):**
   - **Framework:** `Playwright` for robust, cross-browser UI testing.
   - **Setup:** A global setup script should spin up the compiled Go binary with a temporary SQLite database and predefined `SPARKKEEP_AUTH_TOKEN`, allowing tests to run completely independently.

## Conclusion
Given the single-binary architecture, the highest ROI will come from **Backend Integration Tests** using an in-memory SQLite database and mocked LLM responses. This will cover the core business logic (orchestration and API) quickly. E2E tests should be reserved for the critical paths (Login, Kanban interactions, Capture UI) to avoid test flakiness.
