# Sparkkeep Agent Navigation Pointers

Read [`CODING_STANDARDS.md`](CODING_STANDARDS.md) during code review for architectural seams and standards.

## Navigation Pointers

- **Go Domain Core (`internal/core`):** Workflow orchestration, background tasks, card mutation pipeline.
- **Go Channel Adapters (`internal/channel/`):** Thin protocol bridges (Discord, Slack, Telegram). No direct SQL storage access.
- **Frontend Utilities (`frontend/src/utils/cardUtils.tsx`):** Canonical normalizers for URL hostname extraction, relative age, and platform metadata.
- **Frontend Localization (`frontend/src/i18n/`):** Source of truth for UI copy. Register a new locale in the `catalogs` map and `locales` options; never hardcode UI strings in components. Catalog parity and coverage tests enforce completeness.
- **Frontend Modular Styles (`frontend/src/styles/`):** Feature stylesheets (`playbooks.css`, `triage-deck.css`, `digest-brief.css`). Keep `components.css` reserved for shared primitives.
- **Frontend Production Distribution (`internal/web/dist`):** Synchronized on every frontend build (`npm run build`). Must be committed with frontend changes.
- **Fast Localized TDD:** Run `npm test -- <path-to-test>` (e.g. `npm test -- src/components/PlaybookManager.test.tsx`) from `frontend/` for fast feedback during feature work, followed by `make check` before proposing commits.

## Verification Gate

Run `make check` before proposing commits to satisfy all CI invariants (lint, test, build, dist freshness, Go race tests).
