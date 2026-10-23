# Multilanguage (i18n) Integration Investigation

## Problem Statement

Sparkkeep's user interface is hardcoded in English. A non-English-speaking user cannot switch the interface to their native language. All visible text—navigation labels, buttons, form fields, modal titles, error messages, success toasts, and backend-generated notifications (digests, card updates, research reports)—appears only in English. The platform already stores a `user_profile.language` field, but this field controls LLM output language, not UI language. There is no infrastructure for UI translation, no language selector, and no mechanism to persist or apply a user's preferred display language.

---

## 1. Frontend Architecture

**Entry point:** `frontend/src/App.tsx` → `main.tsx`

**Settings UI:** `frontend/src/components/SettingsModal.tsx` (7 tabs: appearance, profile, ai, integrations, schedule, channels, security)

**Settings persistence:**
- **Display preferences** (card density, reduce motion, theme): `localStorage` keys `sparkkeep_card_density`, `sparkkeep_reduce_motion`, `sparkkeep_theme`
- **Backend settings** (card types, user profile, LLM config, channels, auth token): `api.patchSettings()` → backend SQLite `settings` table (key-value store)

**Theme context precedent:** `frontend/src/context/ThemeContext.tsx` (104 lines)
- Pattern: `createContext` + `ThemeProvider` component + `useTheme()` hook
- Initialization: read from `localStorage`, fallback to prop default
- Persistence: write to `localStorage` on change
- System integration: listen to `prefers-color-scheme` media query
- DOM application: set `data-theme` attribute on `document.documentElement`

**Hardcoded English string volume:** 53 TSX/TS files (excluding tests). Top 8 heaviest components by string count:

1. `components/settings/ChannelsTab.tsx`: 45 strings (channel names, labels, status badges)
2. `components/settings/IntegrationsTab.tsx`: 39 strings (form labels, section titles, helper text)
3. `components/CardItem.tsx`: 32 strings (action labels, submenu items, tooltips)
4. `components/playbooks/StepEditorModal.tsx`: 31 strings (form fields, modal titles, button labels)
5. `components/CardModal.tsx`: 31 strings (tab labels, action buttons, metadata fields)
6. `components/card-modal/CardHeaderActions.tsx`: 24 strings (export targets, confirmation prompts)
7. `components/ResearchReportView.tsx`: 24 strings (report metadata, action buttons, status labels)
8. `components/SettingsModal.tsx`: 21 strings (tab labels, section titles, button text)

Total estimated user-facing strings: 250-350 across all components.

---

## 2. Existing i18n Infrastructure

**None.** 

- `frontend/package.json`: No `react-i18next`, `next-intl`, `react-intl`, `@lingui/react`, or similar.
- `go.mod`: No `github.com/nicksnyder/go-i18n`, `golang.org/x/text/message`, or similar.
- Zero translation files, zero locale directories, zero language constants.

---

## 3. Backend Text Generation

**Digest generation:**
- `internal/channel/telegram/digest.go:11` — `FormatMorningResearchDigest()` builds HTML-formatted morning summary with hardcoded English phrases: "☀️ Morning Research Digest", "No research reports completed overnight", "Card #%d", "Confidence: %s", "Verdict: %s", "Failures (%d)", "unknown error"

**Notification formatting:**
- `internal/channel/telegram/telegram.go:238` — `Notify()` renders card creation messages with English text: "Analysis failed", "Updated card #%d", inline button labels
- `internal/channel/discord/discord.go:216` — `Notify()` embed footer: "Sparkkeep • Card #%d"
- `internal/channel/slack/slack.go:87` — `Notify()` block payload with English labels: "Short", "Medium", "Long"
- `internal/channel/openclaw/openclaw.go:382-409` — Action responses: "Started Deep Research for card %d", "Card %d moved to Short-term (Doing)", "Card %d shelved"

**API error messages:**
- `internal/web/*.go` handlers use `http.Error(w, "message", code)` with English strings. No centralized error catalog.

**Settings persistence layer:**
- `internal/store/settings.go` — `GetSetting(key)`, `SetSetting(key, value)`, `ListSettings()`
- SQLite schema: `settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)` (migration `0004_settings.sql`)
- Language setting would be a new key: `ui_language` or `display_language`

---

## 4. Testing Setup

**Frontend:**
- Vitest config: embedded in `frontend/vite.config.ts` (no separate vitest.config.ts)
- Test pattern for context providers: `ThemeSelector.test.tsx` wraps component in `<ThemeProvider defaultTheme="light">` and asserts rendered output
- Component tests use `@testing-library/react` + `userEvent`
- Zero console warnings policy (CODING_STANDARDS.md §3)

**Backend:**
- Go tests: `internal/store/store_test.go:921` — `TestSettingsCRUD` tests `GetSetting`/`SetSetting`/`ListSettings` with `newTestStore(t)` helper
- Test pattern: create in-memory SQLite, insert, retrieve, assert values
- Race detection: `go test -race ./...` (Makefile line 29)

---

## 5. Deployment

**Build:**
- `Makefile:31` — `docker: docker compose up -d --build`
- `Dockerfile` — Multi-stage: `node:22-alpine` builds frontend → `golang:1.26-alpine` builds backend → `alpine:3.20` runtime
- Frontend assets copied to `internal/web/dist` and embedded in Go binary

**Version convention:**
- `version.go:4` — `const Version = "0.9.0"`
- `frontend/package.json:4` — `"version": "0.9.0"`
- `Makefile:21-26` — `make check` enforces version parity: "Version drift" error if mismatched

**Runtime:**
- `docker-compose.yml` — Single service, port 8080, volume `./data:/data`
- SQLite DB at `/data/sparkkeep.db`

---

## 6. Constraints from Coding Standards

**From CODING_STANDARDS.md:**
- §3: Zero console warnings in Vitest (i18n provider must not leak warnings)
- §3: Component sizing — max 8-10 props per component (i18n hook avoids prop drilling)
- §3: Modular feature styles — i18n strings must not break CSS layout (RTL support if targeting Arabic/Hebrew)
- §4: CI invariants — `gofmt`, `go vet`, `go test -race`, `npm run lint`, `npm test`, embedded assets synced after frontend build

**From AGENTS.md:**
- Frontend utilities (`cardUtils.tsx`) contain canonical normalizers — must remain i18n-neutral (no locale-dependent formatting)
- Frontend production distribution (`internal/web/dist`) must be rebuilt and committed with every frontend change
- `make check` is the verification gate — must pass before commits

---

## Summary of Findings

1. **Frontend scope:** ~300 hardcoded English strings across 53 components; top 8 components hold ~250 strings. Settings UI exists (7 tabs), persistence split between `localStorage` (display) and backend API (config).
2. **Theme context precedent:** `ThemeContext.tsx` provides the exact pattern for a `LocaleContext` — read from storage, fallback to system/default, persist on change, apply to DOM.
3. **Zero existing i18n:** No libraries, no translation files, no locale detection. Must build from scratch.
4. **Backend text generation:** 4 channel adapters (Telegram, Discord, Slack, OpenClaw) + digest formatter emit hardcoded English. Must parameterize or extract to translation catalogs.
5. **Settings layer:** SQLite key-value store (`settings` table) already supports arbitrary keys. Adding `ui_language` requires no schema migration.
6. **Testing:** Frontend tests wrap components in providers (Theme pattern). Backend tests use in-memory SQLite with `newTestStore(t)`. Both patterns extend cleanly to i18n.
7. **Deployment:** Docker multi-stage build, embedded frontend assets, version parity enforced. Language files must be bundled in frontend build output.
8. **CI gate:** `make check` runs lint + test + build + dist sync + Go race tests. i18n changes must pass all five.
9. **No RTL or locale formatting yet:** If targeting Arabic/Hebrew, CSS must be audited for RTL safety. Number/date formatting currently uses JS defaults (locale-agnostic).
10. **Version bump:** Any i18n feature requires coordinated bump of `version.go` + `package.json` (currently `0.9.0`).
