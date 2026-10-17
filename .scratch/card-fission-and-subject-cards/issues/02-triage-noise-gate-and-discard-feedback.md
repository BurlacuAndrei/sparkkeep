# 02: Triage Noise Gate & Discard Notification Feedback

**What to build:**
Influencer engagement bait, rhetorical interaction hooks ("agree or disagree?", "thoughts?"), and zero-substance promotional hype are discarded at the gate (0 cards created). The core ingestion pipeline surfaces an explicit discard descriptor, and the Web UI toast and Telegram channel notify the user that the capture was filtered out as low-signal engagement bait.

**Blocked by:** 01: Consolidated Single-Card Ingestion & 3-Card Fission Ceiling

**Status:** completed

- [x] Analyzer schema supports returning empty cards (`cards: []`) with a discard descriptor (`discarded: true`, `reason: "engagement_bait"`).
- [x] Core ingestion pipeline suppresses card creation when a capture is discarded by the Noise Gate.
- [x] The web capture API and frontend capture handler display an explicit feedback toast explaining the post was filtered out as engagement bait / promo hype.
- [x] Channel notification adapters (Telegram / Discord) inform the sender when a capture is dropped by the Noise Gate.
- [x] Tests verify that engagement-bait fixtures yield 0 cards and explicit discard responses.

