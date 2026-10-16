# 04: Shared Reference Normalizer & Provenance Clump Consolidation

**What to build:**
Refactor `internal/web/cards_handler.go` by extracting the duplicated reference normalization loop (URL trimming, canonicalization, GitHub repository detection, and default label resolution) into a shared domain helper in `internal/analyze` or `internal/port`. In `internal/port/model.go`, bundle the recurring channel provenance triplet (`SourceChannel`, `SourceChannelChatID`, `SourceChannelMsgID`) into a dedicated `port.Provenance` struct, preserving JSON backwards compatibility and cleaning up model signatures.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] Extract reference canonicalization and normalization from `createCard` and `updateCard` into a single shared helper
- [x] Define `port.Provenance` in `internal/port/model.go` with `Channel`, `ChatID`, and `MsgID` fields and appropriate JSON tags
- [x] Embed or reference `Provenance` in `Card` and `Capture` structs while preserving external REST API JSON contracts
- [x] Run `go test -v ./...` to verify all store, analyze, core, and web tests pass
