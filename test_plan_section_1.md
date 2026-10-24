## 1. Security, Authentication & Access Control

### 1.1 Unauthenticated Setup & Demo Endpoint Lockout
- [x] **SEC-01**: Verify `POST /api/v1/setup/demo` and `POST /api/v1/setup` reject unauthenticated requests once an instance is configured.
**Why it is done?**
Prevents an external attacker from invoking demo initialization to overwrite the master passphrase, reset LLM provider configs, or pollute production databases.
- Status: FAIL
- Verified by / date / commit: Subagent 1 / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: `POST /api/v1/setup` correctly checks `a.isConfigured(ctx)` and returns 403 Forbidden (`web_test.go:2512`). However, `POST /api/v1/setup/demo` in `internal/web/settings_handler.go:199-246` completely lacks an `isConfigured` check, and `/api/v1/setup/demo` is listed in `isPublicPath` (`internal/web/web.go:204`). An unauthenticated attacker can invoke `POST /api/v1/setup/demo` at any time to overwrite the master passphrase, wipe LLM configs, and re-seed demo data on an already configured instance.
- Edge case checked: Unauthenticated `POST /api/v1/setup` with forged bearer token returns 403 Forbidden. Unauthenticated `POST /api/v1/setup/demo` with `{"auth_token":"hacker"}` on configured instance returns 200 OK and overwrites database settings.
- Links: Defect identified in `internal/web/settings_handler.go:199-246`; gh issue creation blocked by sandbox network isolation / invalid CLI token.

### 1.2 Master Passphrase & Session Cookie Issuance
- [x] **SEC-02**: Verify `POST /api/v1/auth/verify` validates passphrase, mints HttpOnly `sparkkeep_auth` session cookie, and rejects URL query string credentials.
**Why it is done?**
Ensures credentials cannot leak via browser history, server access logs, or referer headers, maintaining strict session security.
- Status: PASS
- Verified by / date / commit: Subagent 1 / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: `internal/web/settings_handler.go:32-62` validates token against store/env and issues a random 32-byte opaque session token via `a.newSession()`. Cookie `sparkkeep_auth` is written with `HttpOnly: true`, `SameSite: Lax`, `Path: /`, and `MaxAge: 259200` (72h TTL). Query parameter tokens (`?token=...`) are explicitly ignored by `presentedToken` and rejected by `authMiddleware` with 401 Unauthorized (`internal/web/web_test.go:2133-2140: TestAuthQueryTokenRejected`).
- Edge case checked: Cookie flags behind plain HTTP (`Secure: false`) vs HTTPS with `X-Forwarded-Proto: https` (`Secure: true`) verified in `TestVerifyCookieSecure` (`internal/web/web_test.go:2099-2130`).
- Links: `internal/web/settings_handler.go:21-27`, `internal/web/web_test.go:2099-2140`.

### 1.3 Login Brute-Force Throttling
- [x] **SEC-03**: Verify `POST /api/v1/auth/verify` enforces rate limiting (`loginMaxFailures = 5`, `loginFailWindow = 15m`).
**Why it is done?**
Protects instances against credential stuffing and password brute-force attacks.
- Status: PASS
- Verified by / date / commit: Subagent 1 / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: `internal/web/web.go:343-384` and `internal/web/settings_handler.go:41-54` enforce per-IP rate limiting (`RemoteAddr` extracted via `net.SplitHostPort`, ignoring spoofable `X-Forwarded-For`). After 5 consecutive failures within 15 minutes, subsequent requests immediately return `429 Too Many Requests` (`too many attempts`). A successful login clears the failure counter. Eviction of expired entries occurs after 1000 tracked IPs (`TestLoginFailMapSwept`).
- Edge case checked: 5 failed attempts return 401; the 6th attempt (even with valid passphrase) returns 429 Too Many Requests. Verified in `TestVerifyThrottle` (`internal/web/web_test.go:2021-2052`).
- Links: `internal/web/web.go:343-384`, `internal/web/web_test.go:2021-2052`.

### 1.4 Browser Extension Magic Connect Origin Validation
- [x] **SEC-04**: Verify `extension/content.js` validates `window.postMessage` origin and sender before pairing.
**Why it is done?**
Prevents malicious web pages visited by the user from dispatching `SPARKKEEP_PAIR_EXTENSION` messages to hijack server URLs or clip credentials.
- Status: FAIL
- Verified by / date / commit: Subagent 1 / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: `extension/content.js:5-46` only checks `if (event.source !== window) return;` and does NOT check `event.origin`. Because `extension/manifest.json` injects `content.js` into `<all_urls>`, any visited webpage (e.g. `https://evil.example.com`) can emit a `SPARKKEEP_PAIR_EXTENSION` message to overwrite `sparkkeep_url` and `sparkkeep_token` in `chrome.storage.local`, exfiltrating all future user clips to an attacker's server.
- Edge case checked: Dispatched `postMessage` from untrusted third-party web origin with `SPARKKEEP_PAIR_EXTENSION`; event is accepted and written to extension local storage without origin verification.
- Links: Defect identified in `extension/content.js:5-46`; gh issue creation blocked by sandbox network isolation / invalid CLI token.

### 1.5 NetGuard SSRF & Link-Local IP Protection
- [x] **SEC-05**: Verify `internal/netguard` blocks cloud metadata addresses (`169.254.169.254`, `[fe80::]`, `[::ffff:169.254.169.254]`) across HTTP fetching and headless Chrome.
**Why it is done?**
Prevents Server-Side Request Forgery (SSRF) targeting cloud instance metadata endpoints (AWS, GCP, Azure, OpenStack).
- Status: PARTIAL
- Verified by / date / commit: Subagent 1 / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence:
  - HTTP fetching (`httpClient.Do` in `internal/capture/capture.go:122` and `internal/research/research.go:124`): PASS. `netguard.DialContext` intercepts resolved IP addresses post-DNS in `dialer.Control` and blocks `169.254.0.0/16`, `fe80::/10`, and `[::ffff:169.254.169.254]`. Verified in `internal/netguard/netguard_test.go: TestBlockedAddr`, `TestDialContextRefusesMetadata`, `TestDialContextChainsNextControl`.
  - Headless Chrome (`HeadlessExtract` in `internal/capture/capture.go:318-361`): FAIL. Headless Chrome runs via external `chromedp` process without `netguard.DialContext` or Chrome host-resolver blocking rules (`--host-rules`). If a capture URL matches `gatedRe` (`internal/capture/capture.go:94`) pointing to metadata IP (e.g. `instagram.com.169.254.169.254.nip.io`), headless Chrome navigates directly without metadata filtering.
- Edge case checked: DNS rebinding domain resolving to 169.254.169.254 on HTTP redirect is blocked by `netguard.DialContext`. However, headless Chrome navigation bypasses `netguard`.
- Links: `internal/netguard/netguard.go:1-50`, `internal/capture/capture.go:122,318-361`.

### 1.6 Research Dossier Public ID Enumeration Defense
- [x] **SEC-06**: Verify `GET /api/v1/research/{id}` requires authentication or is protected against sequential ID scraping.
**Why it is done?**
Prevents automated crawlers and unauthenticated parties from scraping private research dossiers by enumerating integer IDs.
- Status: PASS
- Verified by / date / commit: Subagent 1 / 2026-10-24 / 276afd3d8a2984b7a56d4675996e94e0c70f76d1
- Evidence: In `internal/web/web.go:213-228` (`isPublicPath`), JSON calls require authentication and return 401 Unauthorized if unauthenticated. HTML calls (`Accept: text/html`) are routed to `getResearch` (`internal/web/research_handler.go:214-223`), which validates `?t=` against the row's cryptographically unguessable `ShareToken` using `subtle.ConstantTimeCompare`. Requests with missing or incorrect tokens return `404 Not Found` without revealing whether the record exists.
- Edge case checked: Sequential requests for IDs 1..10 with `Accept: text/html` and no cookies/tokens return 404 Not Found for all IDs (`TestGetResearchReport` in `internal/web/web_test.go:1601-1643`).
- Links: `internal/web/web.go:213-228`, `internal/web/research_handler.go:199-229`, `internal/web/web_test.go:1601-1643`.
