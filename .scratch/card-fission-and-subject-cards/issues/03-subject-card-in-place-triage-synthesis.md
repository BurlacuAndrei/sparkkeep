# 03: In-Place Subject Card Triage Synthesis & Drawer Action

**What to build:**
Users who create cards without an external URL can click a new "Synthesize Brief" button in the Card Drawer. The backend `Retry` pipeline synthesizes a complete Triage Brief (TLDR, why-care, claims, open questions, and horizon) in-place from the user's title and notes, preserving card ID, status, and tags without `ErrNothingToReanalyze`.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Core `Retry` pipeline handles cards without `source_url` or `capture_id` by synthesizing a Triage Brief directly from the card's `title`, `summary`, and `source_note`.
- [ ] Card updates occur in-place, preserving card ID, status, and existing custom tags.
- [ ] Card Drawer renders a visible "Synthesize Brief" action when briefing fields (`claims`, `tldr`) are unpopulated.
- [ ] Clicking "Synthesize Brief" calls the retry API, refreshes card state, and displays toast feedback.
- [ ] Backend tests in `internal/core` and `internal/web`, and frontend tests in `CardModal.test.tsx` pass cleanly.
