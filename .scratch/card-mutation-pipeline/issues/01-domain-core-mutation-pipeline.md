# 01: Domain Core Card Mutation Pipeline & Webhook Dispatch (Expand)

**What to build:** Comprehensive card lifecycle mutation methods on `core.Service` (`UpdateCard`, `SetCardTags`, `AddCardComment`, `ShelveStaleCards`, `LinkChannelMessage`, `GetCardIDByChannelMessage`, `HasActiveResearch`, `ListPlaybooks`, `GetPlaybook`). Domain core validates patches, updates storage, and dispatches a new `EventCardUpdated` webhook event upon card mutation.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `core.Service` exposes `UpdateCard(ctx context.Context, id int64, patch port.CardPatch) (port.Card, error)` which validates, mutates storage, and dispatches `EventCardUpdated`
- [ ] `core.Service` exposes `SetCardTags(ctx context.Context, id int64, tags []string) error` with lowercase deduplication
- [ ] `core.Service` exposes `AddCardComment(ctx context.Context, id int64, content string) (port.CardComment, error)`
- [ ] `core.Service` exposes `ShelveStaleCards(ctx context.Context, days int) (int, error)`
- [ ] `core.Service` exposes `LinkChannelMessage(ctx context.Context, channel, msgID string, cardID int64) error` and `GetCardIDByChannelMessage(ctx context.Context, channel, msgID string) (int64, error)`
- [ ] `core.Service` exposes `HasActiveResearch(ctx context.Context, cardID int64) (bool, error)` and playbook query helpers
- [ ] `webhook.Dispatcher` adds `EventCardUpdated = "card.updated"` and dispatches when card fields mutate
- [ ] Unit tests in `internal/core/core_test.go` verify all mutation behaviors, validation errors, and webhook dispatch
