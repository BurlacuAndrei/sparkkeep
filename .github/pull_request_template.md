## Summary
<!-- Provide a clear, concise summary of the changes and motivation. -->

## Related Issues
<!-- Link related issues, e.g. Closes #123 -->

## Pre-Flight Verification Checklist
Please ensure all checks pass before submitting:
- [ ] Ran `make check` locally (gofmt, go vet, vitest, oxlint, build, and race tests all pass).
- [ ] If frontend code was modified, compiled and committed the production bundle (`internal/web/dist`) via `npm run build` or `make check`.
- [ ] Added or updated unit/integration tests for any changed logic.
- [ ] Preserved architectural boundaries: channel adapters remain thin protocol bridges and do not touch storage directly.
- [ ] Verified documentation and environment examples match the implementation.
