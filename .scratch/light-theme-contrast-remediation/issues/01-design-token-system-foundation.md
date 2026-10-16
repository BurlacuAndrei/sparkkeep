# 01: Design Token System Foundation & Preference Surfaces

**What to build:**
Formally define missing design tokens (`--surface-sunken`, `--accent`, `--color-error`, `--color-warning`, and semantic badge pairs) across Light, Dark, and OLED themes in the design token stylesheet. Eliminate hardcoded dark hex fallbacks across Platform Preferences so that the Profile Character Budget box, Telegram `/start` passphrase guide, and Webhook script `<pre>` boxes render with native light-theme surfaces, crisp borders, and dark monospace typography.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] `--surface-sunken` is defined across all three themes: `#f1f5f9` (Light), `#0c0e14` (Dark), and `#000000` (OLED).
- [x] `--accent` is formally defined as an alias to `--accent-indigo` across all themes.
- [x] Semantic error and warning tokens (`--color-error`, `--color-warning`, and light-mode text variants `#9f1239` and `#92400e`) and badge color pairs are established.
- [x] Platform Preferences Profile Character Budget box renders using `--surface-sunken` with visible dark typography in Light Mode.
- [x] Telegram setup instructions, `/start YOUR_MASTER_PASSPHRASE` block, and Webhook integration `<pre>` code boxes render with high-contrast text and light borders in Light Mode.
- [x] Existing Dark and OLED theme preferences and code displays remain visually unchanged.
