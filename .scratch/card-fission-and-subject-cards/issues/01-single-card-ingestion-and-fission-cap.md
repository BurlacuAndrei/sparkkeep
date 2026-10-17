# 01: Consolidated Single-Card Ingestion & 3-Card Fission Ceiling

**What to build:**
Capturing articles, single posts, and social threads defaults to generating exactly one unified card summarizing all core takeaways. Multi-chapter videos or multi-tool roundups split only when distinct standalone tools/subjects are present, bounded by a strict hard ceiling of at most 3 cards per capture.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Single post or thread captures generate exactly one consolidated card containing overall TLDR, why care, core claims, and takeaways.
- [ ] Ingestion splits only when the source structurally covers distinct standalone tools, products, or video chapters.
- [ ] Extracted card count never exceeds 3 cards per capture, regardless of source length.
- [ ] Golden and unit tests in `internal/analyze` verify the consolidated prompt rules and card count cap.
