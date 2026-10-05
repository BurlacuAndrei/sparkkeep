# Fix All Issues Plan

## P0 - Correctness/Availability (must fix)

### 1. Telegram hot-loop on non-200
- **Files**: `internal/channel/telegram/telegram.go:91-102`
- **Fix**: Add backoff sleep on non-200 status and bad payload, matching network-error path at :80
- **Agent**: telegram-fixes

### 2. Telegram offset persisted before handling
- **Files**: `internal/channel/telegram/telegram.go:106-122`
- **Fix**: Move `writeOffset` into per-update goroutine after `handleUpdate` returns, or use batch WaitGroup
- **Agent**: telegram-fixes

### 3. Semaphore can wedge bot forever
- **Files**: `internal/channel/telegram/telegram.go:57`, `analyze.go:68-77`, `telegram.go:379,512`
- **Fix**: Bound telegram-side context (e.g., 5 min) for CaptureShare and handleCallback; treat timeout as logged failure
- **Agent**: telegram-fixes

### 4. React hooks called conditionally (20 lint errors)
- **Files**: `frontend/src/components/CardModal.tsx:20-31`, `NewCardModal.tsx:13-24`, `App.tsx:203,213`
- **Fix**: Move hooks above early return, or render `{isNewModalOpen && <NewCardModal/>}` in parent, drop `key` prop
- **Agent**: frontend-hooks-fix

### 5. fetchAndClip slices bytes mid-rune + ignores ctx
- **Files**: `internal/research/research.go:199-201,72,184`
- **Fix**: Rune-safe slice; plumb ctx through fetchAndClip and Fetcher interface
- **Agent**: research-fixes

### 6. Dedup race: SELECT-then-INSERT, no unique index
- **Files**: `core.go:136`, `web.go:191`, `internal/store/migrations/0001_init.sql` (new 0003)
- **Fix**: Add migration `CREATE UNIQUE INDEX idx_cards_source ON cards(source_url) WHERE source_url <> ''`; treat constraint violation as duplicate; remove both dedup SELECTs
- **Agent**: store-dedup-fix

### 7. Card creation not atomic (two transactions)
- **Files**: `internal/store/store.go:92-96`
- **Fix**: Pass tx to CreateCard, do INSERT + tags in single transaction
- **Agent**: store-dedup-fix

### 8. Unbounded growth: ListResearch + persistUpload
- **Files**: `internal/store/store.go:408`, `web.go:376`, `api.ts`, `core.go:469`
- **Fix**: ListResearch returns metadata only (no findings); add /api/v1/research/{id}/findings endpoint; add UploadDir retention knob (e.g., max age/size) and cleanup job
- **Agent**: store-dedup-fix

### 9. UpdateCard returns ErrNotFound for empty patch
- **Files**: `internal/store/store.go:297-299`
- **Fix**: Return unchanged card (or distinct ErrEmptyPatch) instead of ErrNotFound
- **Agent**: store-dedup-fix

### 10. CI setup
- **Files**: `.github/workflows/ci.yml` (new)
- **Fix**: Add GitHub Actions workflow running `make fmt && make vet && make test && cd frontend && npm run lint`
- **Agent**: ci-setup

## Ugly - Cleanup

### 11. Dead graph feature
- **Files**: `internal/store/graph.go`, `internal/port/model.go:79-95`, `internal/port/store.go:32`, `internal/store/store.go:428`, test stubs
- **Decision**: DELETE (no endpoint exists, commit message lied)
- **Agent**: ugly-cleanup

### 12. api.public dead field + redundant param
- **Files**: `internal/web/web.go:62,70`, `cmd/sparkkeep/main.go:56`
- **Agent**: ugly-cleanup

### 13. Mangled doc comment + dead package-level Fetch/MediaMeta/DefaultCapture
- **Files**: `internal/capture/capture.go:112-126`
- **Agent**: ugly-cleanup

### 14. Duplicate idea→card mapping
- **Files**: `internal/core/core.go:158-182,256-280`
- **Agent**: ugly-cleanup

### 14b. regexp in function
- **Files**: `internal/core/core.go:461`
- **Agent**: ugly-cleanup

### 15. Dead assignment + typo
- **Files**: `internal/web/web.go:426,79,108`
- **Agent**: ugly-cleanup

### 16. Service.Ctx mutable field + 3-way fallback
- **Files**: `internal/core/core.go:43,58,62-70`, `cmd/sparkkeep/main.go:35`, `internal/web/web.go:410`
- **Agent**: ugly-cleanup

### 17. Stale ceiling comment (120s vs 1500s)
- **Files**: `internal/research/research.go:48,31,61`
- **Agent**: ugly-cleanup

### 18. Unreachable SearchURL=="" branch
- **Files**: `internal/research/research.go:149-151`, `internal/config/config.go:56`
- **Agent**: ugly-cleanup

### 19. prompts/ + docs/superpowers/ deletion
- **Files**: `prompts/`, `docs/superpowers/`
- **Agent**: ugly-cleanup

### 20. .dockerignore misses .opencode/
- **Files**: `.dockerignore`
- **Agent**: ugly-cleanup

### 21. Dockerfile: add HEALTHCHECK, remove baked env, non-root user
- **Files**: `Dockerfile`
- **Agent**: ugly-cleanup

### 22. Frontend template leftovers + dead state
- **Files**: `frontend/src/assets/{react.svg,vite.svg,hero.png}`, `CardModal.tsx` unused setSummary/setActions
- **Agent**: frontend-hooks-fix

### 23. Magic number 25MB in two places
- **Files**: `internal/config/config.go:63`, `internal/web/web.go:75`
- **Agent**: ugly-cleanup

### 24. gofmt cleanup
- **Files**: 5 files flagged by `gofmt -l`
- **Agent**: ugly-cleanup (run `make fmt` at end)