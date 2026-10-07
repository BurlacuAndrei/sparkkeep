# Prompt 2 — Persist raw captures; fix multi-card split collapse

**Type:** Bug + Foundation · **Size:** M · **Depends on:** 1

## Context
Two problems with one root cause — there is no "capture" entity:

1. **Split cards are lost.** `core.CaptureShare` gives every card from one post the
   same `SourceURL` (`firstURL`). Migration `0003_dedup_source_url.sql` puts a
   UNIQUE index on `cards.source_url`, so cards 2..N hit the constraint, are routed to
   `handleDuplicateCard`, and the user receives N-1 "Already captured" messages.
   A "10 tools" post yields 1 card.
2. **The raw payload is thrown away.** `capture.Fetched` (text, transcript,
   image digest, caption, notes, kind) lives only in memory. Retry and research can
   never see the original post again.

## Goal
One share = one persisted **capture** that owns 1..N cards. Deduplication
happens at the capture level, and the raw content is available to later stages.

## Scope
- New table `captures`: `id, kind, source_url, title, description, text, caption,
  transcript, image_digest, notes (JSON), created_at`. Partial UNIQUE index on
  `source_url WHERE source_url <> ''`.
- `cards.capture_id` (nullable FK, indexed). Drop the UNIQUE index on
  `cards.source_url` (keep a plain index for lookups).
- Backfill: create one capture per existing card with non-empty `source_url`
  (fields from card: title, source_note→caption) and link it.
- `port.Store`: `CreateCapture`, `GetCapture`, `GetCaptureBySourceURL`; `port.Card`
  gains `CaptureID`.
- `core.CaptureShare` flow:
  1. If a capture already exists for the source URL → run the existing duplicate
     behavior **once** (append caption note to the first card of that capture,
     reopen if shelved/dismissed, one "duplicate" notification). Do not re-analyze.
  2. Otherwise resolve → persist capture → analyze → create all cards linked to it.
- `failCard` also persists the capture so Retry (Prompt 3) has the content.
- Payload size: clip stored text fields to sane caps (e.g. text 20k, transcript
  50k runes) — rune-safe.

## Out of scope
Changing what research reads (Prompt 8), retry logic (Prompt 3).

## Acceptance criteria
- Capturing a URL whose analysis returns 3 cards stores 3 cards, all with the same
  `capture_id` and `source_url`, and sends 3 "created" notifications, 0 "duplicate".
- Capturing the same URL again creates no cards and sends exactly 1 "duplicate" notification.
- Text-only and media shares (no URL) never dedupe against each other.
- Migration applies cleanly on a copy of an existing DB; existing cards keep working.
- `GET /api/v1/cards` output is backward compatible (new field additive).

## Testing
- `store`: capture CRUD, unique-by-URL, migration/backfill on a seeded temp DB.
- `core`: stubbed LLM returning 3 cards → 3 stored; repeat capture → duplicate path once; failure path persists capture.
- Telegram adapter test for notification counts.
