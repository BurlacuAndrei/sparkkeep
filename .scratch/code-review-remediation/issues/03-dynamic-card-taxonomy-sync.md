# 03: Dynamic Card Taxonomy Synchronization in Playbook Routing

**What to build:**
Synchronize card taxonomy in `frontend/src/components/PlaybookManager.tsx` with the dynamic settings API (`/api/v1/settings`) and canonical backend defaults (`DefaultCardTypes` in `internal/port/model.go`). Remove the static, out-of-sync fallback list `AVAILABLE_CARD_TYPES` (which currently contains non-canonical types `reading`, `architecture`, `research`). Ensure that any custom card types created by the user in Settings dynamically appear in the Playbook Manager's card type selector and are persisted to playbook routing configs.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] Align fallback card types in `PlaybookManager.tsx` with backend `DefaultCardTypes` (`tool`, `product`, `company`, `article`, `idea`, `repo`, `paper`)
- [x] Ensure `PlaybookManager.tsx` reliably fetches configured card types on mount from settings API
- [x] Add or update tests in `frontend/src/components/PlaybookManager.test.tsx` verifying dynamic card type chips and selection
- [x] Verify `npm test` and `npm run lint` pass cleanly
