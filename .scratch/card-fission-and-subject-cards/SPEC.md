# SPEC: Card Fission Policy, Triage Noise Gate, and Subject Cards

**Triage Label:** `ready-for-agent`  
**Status:** Ready for Ticket Breakdown  
**Related Documents:** [GLOSSARY.md](file:///home/capitanfg/media-server/nas/sparkkeep/GLOSSARY.md), [ADR 0004](file:///home/capitanfg/media-server/nas/sparkkeep/docs/adr/0004-card-fission-noise-gate-and-subject-cards.md)

---

## Problem Statement

Users of SparkKeep face significant friction and clutter during knowledge ingestion and subject exploration:
1. **Aggressive Card Over-Splitting:** When sharing social media posts, multi-tweet threads, or videos, the AI triage curator fragments the content into far too many separate cards. A single post containing a few bullet points or personal reflections produces 3 to 6 fragmented cards in the Inbox, creating review fatigue and breaking context continuity.
2. **Influencer Engagement-Bait Pollution:** Social feeds (X/Twitter, LinkedIn, Threads, Instagram) are flooded with engagement-farming prompts ("Which language is better? Comment below", "Agree or disagree?", "10 tools that feel illegal to know") and zero-substance promotional hype. SparkKeep currently ingests and generates cards for all of them, dumping low-value fluff into the user's primary Inbox.
3. **Second-Class Manual / Subject Cards:** When users want to research an open-ended topic, technology comparison, or thesis from scratch without an initial link, they can create a card manually, but that card is left completely un-analyzed (empty TLDR, no claims, no open questions). Attempting to re-analyze or extract a card without an external URL fails with an error, and the autonomous research engine lacks dedicated prompt guidance to treat user notes as a research thesis.

---

## Solution

1. **Consolidated Card Fission Policy:** Establish a strict single-card default for posts and threads, consolidating all key arguments and takeaways into one unified Triage Brief. Restrict multi-card splitting exclusively to sources with structurally distinct subjects (such as timestamped video chapters or reviews of independent standalone tools), bounded by a hard ceiling of at most 3 cards per capture.
2. **Triage Noise Gate (Full Discard of Engagement Bait):** Equip the triage curator with explicit criteria to detect engagement bait, discussion farming, and pure hype. If a capture lacks substantive technical or factual value, it is discarded entirely: zero cards are created, and an explicit notification informs the user that the post was filtered out.
3. **First-Class Subject Cards:** Elevate user-created cards into full research subjects. Enable on-demand in-place Triage Brief synthesis from user title and notes via the card drawer and retry pipeline, and empower autonomous Deep Research to ground directly on user notes as a research thesis, querying external web literature from scratch.

---

## User Stories

1. As an engineer capturing a technical Twitter/X thread, I want the entire thread synthesized into a single cohesive card, so that I don't have to triage five fragmented cards representing individual tweets.
2. As an operator sharing a long YouTube video with distinct tool reviews, I want SparkKeep to split only on genuinely distinct chapter subjects up to a maximum of 3 cards, so that multi-topic videos are organized cleanly without runaway card creation.
3. As a knowledge worker capturing articles and social posts, I want SparkKeep to never generate more than 3 cards from any single capture, so that my Inbox is never flooded by a single aggregate roundup.
4. As an operator curating an inbox, I want influencer engagement bait and rhetorical discussion hooks ("agree or disagree?", "comment below") to be discarded automatically, so that my Inbox contains only substantive knowledge and tools.
5. As an operator capturing content, I want promotional hype threads with zero technical substance to generate zero cards, so that low-signal noise is rejected at the gate.
6. As an operator who shared a post that was discarded by the Noise Gate, I want an explicit notification explaining that the capture was filtered as engagement bait, so that I immediately understand why no card appeared in my Inbox.
7. As an operator in Telegram, I want a reply message informing me when a shared link was filtered out by the Noise Gate, so that I am not left wondering if the bot crashed or ignored my message.
8. As a researcher exploring a new domain, I want to create a card with just a title and brief notes, so that I can capture research topics without needing an existing URL.
9. As an operator viewing a user-created card without a briefing, I want a prominent "Synthesize Brief" button in the card drawer, so that I can trigger AI analysis on my notes with a single click.
10. As an operator clicking "Synthesize Brief" on a user-authored card, I want the card updated in-place with a generated TLDR, why-care, claims, open questions, and horizon, so that my card identity, tags, and status are preserved.
11. As an operator who edited a card's notes, I want to re-run Triage Brief synthesis without needing an external URL, so that the card's briefing evolves alongside my thinking.
12. As a researcher launching Deep Research on a Subject Card, I want the research engine to treat my title, summary, and comments as the central research thesis, so that it autonomously plans web queries to validate claims and investigate competitive landscape across the internet.
13. As a researcher inspecting Deep Research results on a Subject Card, I want claim verification, competitive landscape, and recommended actions to be populated from external web evidence, so that I receive a rigorous research report on my custom topic.

---

## Implementation Decisions

### Ingestion & Analysis Seams
- **Single-Card Default Rule:** Update the triage curator prompt rules to enforce a single unified card as the default outcome for any article, post, or thread.
- **Strict Fission Conditions:** Fission into multiple cards is permitted only when structural separators exist (such as clear chapter markers or evaluations of completely independent standalone tools/products).
- **Hard Split Cap:** Enforce a hard ceiling in the triage prompt and JSON extraction logic: under no circumstances may `cards` exceed 3 items per capture.
- **Triage Noise Gate Schema:** Expand the analyzer output schema to allow returning an empty card list (`cards: []`) accompanied by a discard descriptor indicating the rejection reason (e.g., `discarded: true`, `reason: "engagement_bait"`).
- **Capture Ingestion Discard Handling:** In the core ingestion pipeline, when the curator discards content, bypass card creation entirely, record the discard event in the capture record/audit log, and return the discard status to API and channel callers.
- **Feedback & Notifications:** Update web API responses and Telegram/Discord notification adapters to surface an informative message when a capture is dropped by the Noise Gate.

### Subject Card Synthesis & Research Seams
- **Generalized Retry Pipeline:** Update the card retry/re-analyze pipeline to handle cards without an external URL or capture ID. When no URL is present, construct a synthesis prompt from the card's `title`, `summary`, and `source_note`, run triage analysis, and update the card's briefing fields in-place.
- **Card Drawer "Synthesize Brief" Action:** In the frontend Card Modal, detect when a card lacks a briefing (`claims` empty and `tldr` empty). When true, render a prominent "Synthesize Brief" button that triggers the retry endpoint and refreshes the card.
- **Research Engine Thesis Grounding:** In the autonomous research runner (`stepPlan`), detect when a card has no capture text or extracted claims. In this case, format the card's `title`, `summary`, and user comments as the primary research thesis and instruct the planning LLM to generate targeted investigative search queries to gather primary sources, benchmarks, and architectural alternatives across the web.

---

## Testing Decisions

### Core Ingestion & Triage Tests
- **Consolidation Test:** Verify that multi-paragraph or multi-tweet content yields exactly 1 comprehensive card.
- **Fission Boundary Test:** Verify that content with 5 distinct tool reviews or chapters splits into at most 3 cards (respecting the hard cap).
- **Noise Gate Discard Test:** Verify that pure engagement-farming text or hype tweets return `cards: []` and `discarded: true`, resulting in 0 created cards and an explicit discard response.

### Subject Card Synthesis Tests
- **In-Place Synthesis Test:** Verify that invoking the retry endpoint on a URL-less card populates `tldr`, `why_care`, `claims`, and `open_questions` in-place while preserving the card's ID, status, and tags.
- **No-Error Contract:** Verify that `ErrNothingToReanalyze` is no longer returned for cards with a valid user-provided title and notes.

### Deep Research Thesis Grounding Tests
- **Subject Research Test:** Verify that running research on a card without an external URL or capture grounds on the card's title and summary, generates valid web search queries, and compiles a complete research report without panics or empty-report errors.

### Frontend Component Tests
- **Synthesize Button Test:** In `CardModal.test.tsx`, verify that a card with empty briefing fields renders the "Synthesize Brief" button, and clicking it invokes the retry API and displays toast feedback.
- **Noise Gate Toast Test:** In `App.test.tsx`, verify that when `captureSpark` returns a discard response, the user receives an explicit toast explaining that the post was filtered as engagement bait.

---

## Out of Scope

- Building a machine learning classifier model outside the existing LLM triage client.
- Creating an interactive video player or manual chapter slicing tool in the UI.
- Bulk multi-subject batch research generation in a single click (handled via individual card research).

---

## Further Notes

All changes strictly follow the repository's MIT open-source ethos, Go domain separation in `internal/core` and `internal/analyze`, and the established React lifecycle testing guidelines (zero console warnings, proper `waitFor` assertions).
