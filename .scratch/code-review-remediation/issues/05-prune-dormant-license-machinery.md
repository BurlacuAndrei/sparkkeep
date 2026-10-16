# 05: Prune Dormant License Machinery & Middle-Man Forwarder

**What to build:**
Prune dormant paid-tier fields (`Email`, `ExpiresAt`, `IsLifetime`) from `internal/license/license.go` to reflect Sparkkeep's 100% open-source MIT commitment, eliminating dead schema. Remove the unnecessary middle-man method `s.LicenseStatus(ctx)` in `internal/core/core.go`, calling `license.Status()` directly in `internal/web/settings_handler.go`. Keep the `GET /api/v1/license/status` endpoint functional for external tooling compatibility.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] Clean `internal/license/license.go` struct to keep only essential fields (`tier`, `features`, `is_valid`)
- [x] Remove forwarding method `LicenseStatus` from `internal/core/core.go`
- [x] Update caller in `internal/web/settings_handler.go` and test in `internal/web/web_test.go`
- [x] Run `go test -v ./...` to verify all tests pass
