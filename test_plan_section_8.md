## 8. Deployment, Packaging & End-to-End User Journeys

### 8.1 Full Ingest-to-Export End-to-End Journey
- [x] **E2E-01**: Execute end-to-end user journey: `POST /api/v1/capture` -> LLM Triage -> Horizon Assignment -> Deep Research -> Move to Done -> Export to Obsidian & ZIP Archive.
**Why it is done?**
Validates that all independent subsystems seamlessly interlock under real-world usage.
- Status: PASS
- Verified by / date / commit: Subagent 8 / 2026-10-24 / 276afd3
- Evidence: `go test -v -count=1 ./internal/e2e -run TestE2E_FullIngestToExportJourney` passed (0.04s). Verified sequence: `POST /api/v1/capture` -> LLM triage generated card with summary and claims -> `PATCH /api/v1/cards/1` set horizon to `medium-term` -> `service.Research(ctx, 1)` executed deep research and generated dossier findings with verified claims -> `PATCH /api/v1/cards/1` set status to `done` -> `GET /api/v1/cards/1/export.md` exported full markdown with frontmatter, executive summary, claim verification block, and research dossier -> `GET /api/v1/export/archive.zip` verified valid ZIP archive containing `cards/Done/1_Raft Consensus Protocol.md`.
- Edge case checked: Exported markdown file inspected: contains YAML frontmatter (`id`, `title`, `horizon`, `status: done`, `researched: true`, `tags`), `## Executive Summary`, `## Value Proposition`, `## Proposed Actions`, `## Source Notes`, `## References`, and `## Research Dossier` (including `## Claim Verification`). Archive zip verified with `archive/zip` reader.
- Links: [journey_e2e_test.go](file:///home/capitanfg/Programming/sparkkeep/internal/e2e/journey_e2e_test.go), [cards_handler.go](file:///home/capitanfg/Programming/sparkkeep/internal/web/cards_handler.go#L366-L410), [export_handler.go](file:///home/capitanfg/Programming/sparkkeep/internal/web/export_handler.go#L54-L116)

### 8.2 SPA Fallback Routing on Direct Sub-Paths
- [ ] **E2E-02**: Verify direct browser navigation or reload on `/cards`, `/triage`, `/playbooks`, or `/settings` serves `index.html` (HTTP 200) rather than HTTP 404.
**Why it is done?**
Ensures bookmarked links, shared URLs, and browser page refreshes load the web application properly.
- Status: FAIL
- Verified by / date / commit: Subagent 8 / 2026-10-24 / 276afd3
- Evidence: `TestE2E_SPAFallbackRouting` in `internal/e2e/journey_e2e_test.go` failed: direct `GET` requests to `/cards`, `/triage`, `/playbooks`, and `/settings` all returned HTTP 404 (`text/plain; charset=utf-8`) instead of HTTP 200 `index.html`. Root cause in `internal/web/static_handler.go:36-39`: `a.index` checks `if r.URL.Path != "/" { http.NotFound(w, r); return }`.
- Edge case checked: Evaluated `curl -i http://localhost:8080/triage` and sub-paths against web handler: all return HTTP 404 with plain text "404 page not found".
- Links: https://github.com/BurlacuAndrei/sparkkeep/issues/38, [static_handler.go](file:///home/capitanfg/Programming/sparkkeep/internal/web/static_handler.go#L35-L47), [journey_e2e_test.go](file:///home/capitanfg/Programming/sparkkeep/internal/e2e/journey_e2e_test.go#L187-L199)

### 8.3 Browser Extension Chrome MV3 Host Permissions & Clipping
- [ ] **E2E-03**: Verify `extension/manifest.json` declares required `host_permissions` (`["<all_urls>"]`) and successfully clips selection quotes to `/api/v1/capture`.
**Why it is done?**
Chrome Manifest V3 blocks cross-origin `fetch()` calls in background workers unless matching host permissions are declared.
- Status: FAIL
- Verified by / date / commit: Subagent 8 / 2026-10-24 / 276afd3
- Evidence: Inspected `extension/manifest.json`. Only declares `"permissions": ["activeTab", "storage", "contextMenus", "scripting"]`. Missing `"host_permissions": ["<all_urls>"]`. In Chrome MV3, `extension/background.js:50` (`fetch(`${serverUrl}/api/v1/capture`)`) is blocked by the browser on cross-origin targets without declared host permissions.
- Edge case checked: Clipping quote snippet from external origin (e.g. `https://en.wikipedia.org` or any third-party webpage) to configured server URL (`http://localhost:8080`) fails in Chrome MV3 service worker due to missing host permission grant.
- Links: https://github.com/BurlacuAndrei/sparkkeep/issues/39, [manifest.json](file:///home/capitanfg/Programming/sparkkeep/extension/manifest.json#L20-L25), [background.js](file:///home/capitanfg/Programming/sparkkeep/extension/background.js#L46-L65)

### 8.4 Rootless Docker Container & File Ownership
- [ ] **E2E-04**: Verify Docker container starts with `appuser` (UID 1000) and `/data/sparkkeep.db` has correct permissions without requiring root privileges.
**Why it is done?**
Enforces container security best practices in production homelab and NAS environments.
- Status: FAIL
- Verified by / date / commit: Subagent 8 / 2026-10-24 / 276afd3
- Evidence: Inspected `Dockerfile` and `entrypoint.sh`. `entrypoint.sh` unconditionally executes `exec su-exec appuser sparkkeep "$@"`. When launched rootless or with non-root UID (e.g. `docker run --user 1000:1000`), `su-exec` aborts with `setgroups: Operation not permitted` (requires `CAP_SETUID`/`CAP_SETGID`). Entrypoint lacks `[ "$(id -u)" = "0" ]` condition to bypass `su-exec` and `chown` when already non-root.
- Edge case checked: Rootless container startup under UID 1000 with volume on `/data`: `su-exec` unconditionally fails.
- Links: https://github.com/BurlacuAndrei/sparkkeep/issues/40, [entrypoint.sh](file:///home/capitanfg/Programming/sparkkeep/entrypoint.sh#L1-L7), [Dockerfile](file:///home/capitanfg/Programming/sparkkeep/Dockerfile#L18-L36)

### 8.5 Version Parity & Asset Synchronization Gate
- [x] **E2E-05**: Verify `make check` enforces strict version parity (`version.go` == `frontend/package.json`) and git-clean `internal/web/dist`.
**Why it is done?**
Prevents release drift and guarantees production binaries embed the exact compiled frontend assets.
- Status: PASS
- Verified by / date / commit: Subagent 8 / 2026-10-24 / 276afd3
- Evidence: `Makefile` check target executes:
  1. `GO_VER` (`0.9.2`) extraction from `version.go` vs `PKG_VER` (`0.9.2`) from `frontend/package.json`.
  2. `cd frontend && npm install && npm run lint && npm test && npm run build`.
  3. `test -z "$(git status --porcelain -- internal/web/dist)"` ensuring compiled distribution assets match Git index.
  4. Verified simulated version mismatch (`0.9.2` vs `0.9.99-test`) properly aborts build with exit code 1: `❌ Version drift: version.go (0.9.2) != frontend/package.json (0.9.99-test)`.
- Edge case checked: Simulated version mismatch in package.json exits code 1. `internal/web/dist` remains clean across rebuilds (`git status --porcelain -- internal/web/dist` is empty).
- Links: [Makefile](file:///home/capitanfg/Programming/sparkkeep/Makefile#L21-L29), [version.go](file:///home/capitanfg/Programming/sparkkeep/version.go#L4), [package.json](file:///home/capitanfg/Programming/sparkkeep/frontend/package.json#L3)
