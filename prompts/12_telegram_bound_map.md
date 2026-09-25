# Prompt 12 — Bound Telegram `msgCard` Map

## Goal
Prevent unbounded memory growth in the Telegram adapter's `msgCard` map.

## Problem
`trackMessage()` in `telegram.go` (lines 472-481) adds entries to `a.msgCard` (maps bot message_id → card_id for reaction handling) but never removes them. Over months of use, this map grows without bound.

## Changes Required

1. **`internal/channel/telegram/telegram.go`**:
   - Replace the unbounded `map[int64]int64` with a bounded approach. Options:
     - (a) **Simple ring buffer**: keep the last N entries (e.g., 500). Use a slice as a ring + a map.
     - (b) **LRU**: use a simple hand-rolled LRU (no external deps):
       ```go
       const maxTrackedMessages = 500
       
       func (a *Adapter) trackMessage(msgID, cardID int64) {
           if msgID == 0 || cardID == 0 { return }
           a.msgMu.Lock()
           defer a.msgMu.Unlock()
           if a.msgCard == nil { a.msgCard = map[int64]int64{} }
           if len(a.msgCard) >= maxTrackedMessages {
               // Evict oldest (any key — order doesn't matter for map)
               for k := range a.msgCard { delete(a.msgCard, k); break }
           }
           a.msgCard[msgID] = cardID
       }
       ```
     - Option (b) is simplest. For ordered eviction, track insertion order with a slice.

## Acceptance Criteria
- `msgCard` map never exceeds the configured maximum
- Reaction handling still works for recent messages
- All existing tests pass

## Severity: MEDIUM
