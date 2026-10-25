# 04: Docked Board Inspector in Digest & Interactive Stale Bottleneck Cleanup

**What to build:** Integrate the non-blocking **Board Inspector** (`480px` docked right pane on viewports `>= 1200px`) into the widescreen **Intelligence Digest** so clicking any card in Emergent Themes, Period Wins Showcase, Research Harvest, Next-Period Focus, or the Activity Timeline inspects and mutates the card side-by-side without a blocking modal, and upgrade the Strategic Health **Stale Bottleneck** alert with 1-click **Inspect Stale** and **Batch-Shelve Stale** actions.

**Blocked by:** 01: Dynamic Window Identity, Widescreen 3-Column Canvas & Accomplishment Telemetry, 02: Period Wins Showcase, Period Momentum Pulse & 1-Click Wins Export, 03: BYOK `digest_synthesis` Role & Persistent Executive Retrospective

**Status:** ready-for-agent

- [ ] On widescreen viewports (`>= 1200px`), clicking any card chip in Emergent Themes, any win card in the Period Wins Showcase, any item in Deep Research Harvest, any Next-Period Focus card, or any card in the Activity Timeline opens the card in the side-by-side **Board Inspector** docked on the right of the Digest workspace (supporting inline action checklist toggling, status/horizon changes, Brief/Research tabs, `Enter`/`Space` or Expand button to open the full `CardModal`, and `Escape` to close).
- [ ] On narrower viewports (`< 1200px`), clicking a card in the Digest continues to open the full `CardModal` directly.
- [ ] When `stale_count > 0`, the Strategic Health **Stale Bottleneck** banner renders interactive **Inspect Stale** (which opens the first stale short-term card in the docked inspector / modal and highlights stale items) and **Batch-Shelve Stale** (which calls `POST /api/v1/cards/batch-shelve-stale?days=5`, shows a confirmation toast, and refreshes the digest) buttons.
- [ ] All new strings are localized across all 8 Interface Locales and verified in `DigestView.test.tsx`.
