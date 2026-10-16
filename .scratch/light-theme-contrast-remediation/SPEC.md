# SPEC: Light Theme Contrast Remediation, Layout Shift Elimination & Design System Stabilization

**Triage Label:** `resolved`  
**Status:** Implementation Complete  
**Related Documents:** [GLOSSARY.md](file:///home/capitanfg/media-server/nas/sparkkeep/GLOSSARY.md), [CODING_STANDARDS.md](file:///home/capitanfg/media-server/nas/sparkkeep/CODING_STANDARDS.md), [AGENTS.md](file:///home/capitanfg/media-server/nas/sparkkeep/AGENTS.md)

---

## Problem Statement

Operators using SparkKeep in brightly lit environments or who prefer light visual themes face severe usability, readability, and interaction barriers across the web portal. Because the dark theme was the primary design target during early development, the light theme (`data-theme="light"`) currently suffers from systemic defects:

1. **Illegible Typography & Unstyled Token Fallbacks:** Multiple primary surfaces (Execution Boards, Card Details Drawer, Platform Preferences, and New Spark Capture) display pure white or faint pastel text (`#ffffff`, `#f1f5f9`, `#cbd5e1`, `#e2e8f0`) against white or light-grey backgrounds. Essential text elements—such as Next Action checklist items, Deep Research Report markdown content, Key Claims, Source titles, Tags, and User Comments—are completely washed out or invisible (contrast ratios falling below 1.5:1 against the WCAG AA requirement of 4.5:1).
2. **Missing System Design Tokens & Dark Surface Inversions:** Several CSS custom properties referenced throughout setting panels and components (notably `--surface-sunken` and `--accent`) are undefined in the design token foundation. When rendered in light mode, these missing tokens trigger hardcoded dark-palette fallbacks (`#121217`, `#090a0f`), rendering character budgets, code blocks, and integration script boxes as pitch-black slabs.
3. **Severe Cumulative Layout Shift (CLS) on Execution Boards:** When operators switch between Active, Shelved, and Dismissed board modes, the top header bar visually jumps and shifts vertically and horizontally. This occurs because horizon filter tabs conditionally unmount, density toggles reposition across flex layouts, and inline explanation banners abruptly inject and collapse spacing.
4. **Poor State & Archive Banner Feedback:** Archive states (Shelved and Dismissed) render with yellow text on pale yellow banners and light pink text on light red banners, failing visual legibility standards. Kanban column icons (To Do, In Progress, Done) lack contrast and visual hierarchy on light column surfaces.
5. **Search Collision & Capture Dialog Contrast:** In the global search bar, placeholder and input text visually collides with the search magnifying glass icon due to insufficient inset padding, while search shortcut hints in the popover footer are unreadable against dark translucent gradients. In the quick capture modal, dark slate background layers clash with white input text.

---

## Solution

Deliver a comprehensive, WCAG 2.1 AA-compliant overhaul of the Light Theme design system across the entire SparkKeep portal, eliminating all hardcoded dark assumptions, stabilizing view layouts, and establishing robust design token foundations:

1. **Foundational Token Layer:** Formally define `--surface-sunken`, `--accent`, `--color-error`, `--color-warning`, and semantic status badge pairs (tinted backgrounds with deep high-contrast text) across all three theme modes (Light, Dark, and OLED), eliminating fallback to hardcoded dark hexes.
2. **Execution Boards Header Stabilization & Contrast:** Refactor the board header toolbar into a resilient, two-tier fixed-height layout where title, mode toggles, and view controls remain visually stationary regardless of active mode. Provide dedicated, non-shifting sub-rows for horizon filters and archive state descriptions. Re-theme column containers, icons, and horizon segmented controls with crisp borders, proper elevations, and compliant contrast.
3. **Card Details & Research Drawer Polish:** Audit and replace all hardcoded light-slate and white text colors with semantic tokens. Ensure Next Action checklist text, Deep Research markdown headings and prose, Key Claims, Source links, References chips, Tags, and Comment logs render with crisp, dark slate typography (minimum 4.5:1 contrast).
4. **Search Bar & Quick Capture Refinement:** Adjust search input icon alignment and typography padding to eliminate text collisions. Restyle search popover footers and keyboard shortcut hints for clean light-mode readability. Unify the quick capture modal with native card surface tokens.
5. **Preferences & Code Block Remediation:** Map platform preference containers, character budget trackers, channel passphrase blocks, and integration script boxes to semantic surface tokens and legible syntax-highlighted themes.

---

## User Stories

1. As an operator browsing the Execution Boards in Light Mode, I want the board title, card count badge, and mode buttons (Active, Shelved, Dismissed) to have crisp, high-contrast typography, so that I can easily distinguish the active board state.
2. As an operator switching between Active, Shelved, and Dismissed board modes, I want the top header bar and board view controls to maintain a stable, non-jumping layout, so that my focus is not disrupted by visual layout shifts.
3. As an operator filtering cards by horizon (Short-Term, Medium-Term, Long-Term, All), I want the segmented control in Light Mode to display dark, legible labels and a clear active pill indicator, so that I can clearly see which planning horizon is selected.
4. As an operator viewing Kanban columns in Light Mode, I want the column header icons (To Do, In Progress, Done) and column surfaces to have distinct, recognizable colors, so that I can instantly parse workflow stages.
5. As an operator viewing the Shelved Cards board, I want the archive notice banner to feature dark amber text on a soft, warm tinted background with clear borders, so that I can read the archive explanation without eye strain.
6. As an operator viewing the Dismissed Cards board, I want the dismissal notice banner to feature dark ruby text on a soft rose background, so that the status is clear and legible.
7. As an operator opening the Card Details modal in Light Mode, I want the card status badge to display high-contrast text against a tinted background, so that ticket status is immediately obvious.
8. As an operator reviewing a card's Next Action checklist in Light Mode, I want uncompleted action items to render with dark, readable typography instead of invisible white text, so that I know what tasks remain.
9. As an operator reading a Deep Research Report in Light Mode, I want section headings, markdown paragraphs, blockquotes, and lists to render in deep, legible slate text, so that I can read research findings comfortably.
10. As an operator inspecting Key Claims extracted from sources, I want claim statements and verification badges to render with sharp contrast, so that evidence is easy to review.
11. As an operator reviewing card provenance, I want the source platform label, original URL link, and sibling cards from the same source to have legible dark text and accessible hover states, so that I can navigate related cards without eye strain.
12. As an operator managing card taxonomy, I want tag chips and reference badges in the card details drawer to be cleanly outlined with dark text, so that metadata remains distinct.
13. As an operator reading or writing comments on a card, I want comment author timestamps, usernames, and comment bodies to render in dark, legible tones against the drawer background.
14. As an operator viewing a card's captured raw content or splitting an idea card, I want the modal dialogs and split action interfaces to render with proper light-mode surface tokens and readable text.
15. As an operator clicking into the global search bar, I want the search placeholder text and cursor to have adequate left spacing from the magnifying glass icon, so that typed queries do not collide with the icon.
16. As an operator navigating the search popover via keyboard, I want the footer navigation hints and `<kbd>` keys to render with crisp contrast against a soft footer background, so that keyboard shortcuts are easily discoverable.
17. As an operator creating a card via the New Spark modal, I want the capture textarea and context fields to render with soft light surfaces and high-contrast dark text, so that quick-capturing ideas feels native to the active theme.
18. As an operator configuring my profile in Platform Preferences, I want the "Profile Character Budget" box to use a soft sunken surface token rather than falling back to pitch black, so that the settings panel looks cohesive.
19. As an operator configuring a Telegram channel bridge, I want the `/start YOUR_MASTER_PASSPHRASE` code snippet and setup instructions to render with a modern light-mode code box and legible dark monospace font.
20. As an operator setting up webhook integrations, I want the script and payload `<pre>` code boxes to have clean light borders, subtle background tints, and high-contrast text.
21. As an operator using toast notifications, I want action buttons like "Undo" to render with deep accent colors that are easily readable against light toast surfaces.
22. As an operator scrolling through card details or board views, I want custom scrollbar tracks and thumbs to adapt to light mode with subtle grey tones rather than dark slate tracks.

---

## Implementation Decisions

### 1. Design Token Layer Expansion & Hardening
- **Missing Token Specifications:**
  - Define `--surface-sunken` across all themes: `#f1f5f9` (Light), `#0c0e14` (Dark), and `#000000` (OLED).
  - Define `--accent` as an alias to `--accent-indigo` across all themes to resolve unstyled fallbacks in forms, wizards, and integration tabs.
  - Define semantic error and warning variables (`--color-error`, `--color-warning`) paired with their light-mode text variants (`--color-error-text: #9f1239`, `--color-warning-text: #92400e`).
  - Introduce standardized semantic badge token pairs providing low-opacity tinted backgrounds with high-contrast foreground text for Emerald (Done/Active), Amber (Shelved/Warning), Rose (Dismissed/Error), Sky (In Progress/Info), and Indigo (Default/Primary).

### 2. Execution Boards Layout Stabilization (CLS Elimination)
- **Two-Tier Header Structure:**
  - Refactor the board header toolbar into two independent, fixed-geometry tiers:
    - *Tier 1 (Main Control Row):* Houses the board title, card count indicator, view mode switcher (Active | Shelved | Dismissed), and board density toggle. This tier maintains a fixed vertical height and flex structure across all modes, preventing buttons from jumping or sliding when modes change.
    - *Tier 2 (Contextual Sub-Row):* A dedicated sub-row that conditionally renders horizon segmented controls when in Active mode, or contextual archive explanation banners when in Shelved or Dismissed modes. Reserving a consistent layout container for Tier 2 prevents column headers and cards below from jittering.
- **Board Surface & Contrast Upgrades:**
  - Update Kanban column backgrounds in Light Mode to use `--surface-sunken` with a crisp border (`--border-subtle`), providing visual depth.
  - Re-theme column icons (To Do, In Progress, Done) with deep semantic accents rather than faded slate.
  - Update horizon segmented buttons with light-mode active states (solid white pill with subtle drop shadow and dark text).

### 3. Card Details Drawer & Subcomponent Contrast Overhaul
- **Checklist Contrast:**
  - Bind uncompleted action item text directly to `--text-main` (`#0f172a`), maintaining muted styling (`--text-muted`) only for checked/completed items.
- **Research Report & Content Typography:**
  - Remove all hardcoded light hexes (`#f8fafc`, `#cbd5e1`, `#e2e8f0`) from markdown rendering containers, binding headings, paragraphs, and list items to `--text-main` and `--text-dim`.
  - Style code blocks and table outputs inside research reports with light-mode borders, sunken backgrounds, and high-contrast monospace text.
- **Metadata Panels, Tags & Provenance:**
  - Re-style Key Claims cards, Source identity rows, Sibling card links, and Reference chips using semantic surface and border tokens.
  - Update Platform icon normalizers (e.g., GitHub icon) to use dark slate tones in light mode instead of washed-out grey.
  - Upgrade comments feed: author names to `--text-main`, timestamps to `--text-muted`, and comment body text to `--text-dim`.
- **Modals & Drawers:**
  - Update Raw Captured Content modal and Split Card modal surfaces to utilize theme tokens instead of dark modal styles.
  - Update custom drawer scrollbar track to use a transparent or subtle slate tint rather than dark blue-slate.

### 4. Omnisearch & Quick Capture Modernization
- **Omnisearch Alignment:**
  - Increase search input left padding and reposition the magnifying glass icon to establish clean visual breathing room.
  - Restyle search dropdown footer with a light neutral surface, subtle top border, and high-contrast `<kbd>` keycaps.
- **New Spark Modal:**
  - Eliminate dark translucent backgrounds on the hero capture container and textarea, replacing them with light surface tokens, subtle focus rings, and high-contrast dark text.

### 5. Platform Preferences & Code Display
- **Sunken Surface Binding:**
  - Ensure Character Budget counters, Telegram setup guides, passphrase code blocks, and integration `<pre>` boxes consume `--surface-sunken`, displaying dark monospace typography and crisp borders.

---

## Testing Decisions

### Behavior & Regression Seams
- **Testing Philosophy:**
  - Tests must verify rendered DOM characteristics, accessible labels, semantic styling contracts, and layout stability rather than fragile CSS file paths or internal class names.
  - All existing frontend unit and integration tests must continue passing without warnings.
- **Modules & Test Seams:**
  1. *Kanban Board Seam (`KanbanBoard.test.tsx`):*
     - Verify that switching between Active, Shelved, and Dismissed modes preserves view controls without throwing or unmounting the board header container.
     - Verify that horizon filter buttons render with appropriate aria attributes and remain accessible in all modes.
     - Verify archive banners render with appropriate semantic status roles and legible text.
  2. *Card Modal Seam (`CardModal.test.tsx` & subcomponents):*
     - Verify Next Action checklist items render with high-contrast text and correct toggle behavior.
     - Verify Research Report markdown displays structured headings and body text without unstyled fallback elements.
     - Verify Key Claims, Source metadata, and Comments render cleanly with accessible content.
  3. *Settings & Preferences Seam (`SettingsModal.test.tsx`, `UserProfileTab.test.tsx`):*
     - Verify that preference tabs render without unstyled dark fallback blocks.
  4. *Quick Capture Seam (`NewCardModal.test.tsx`):*
     - Verify capture textareas accept focus, display placeholder text cleanly, and trigger capture events.
- **Verification Invariant:**
  - Execution of `npm test` across all frontend suites with zero failures.
  - Execution of `make check` (CI gate) verifying `gofmt`, `go vet`, `go test -v -race`, `npm run lint`, `npm test`, and embedded asset synchronization (`internal/web/dist`).

---

## Out of Scope

- Modifying backend Go domain core logic, database models, or API endpoints.
- Introducing a completely new third-party CSS framework or CSS-in-JS library.
- Redesigning Kanban drag-and-drop mechanics or research pipeline execution logic.
- Adding new research tools or LLM orchestration features.

---

## Further Notes

- All changes must strictly follow the repository's modular styling architecture (`frontend/src/styles/`), reserving `components.css` for shared primitives and utilizing feature stylesheets for specific views.
- Production distribution bundle (`internal/web/dist`) must be updated via `npm run build` as part of the implementation.
