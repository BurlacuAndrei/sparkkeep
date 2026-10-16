# 02: Execution Boards Header Stabilization & Contrast Overhaul

**What to build:**
Eliminate layout shift (Cumulative Layout Shift) when toggling between Active, Shelved, and Dismissed board modes by restructuring the header into a non-shifting two-tier toolbar (fixed upper control row + dedicated contextual sub-row for horizon tabs or archive banners). Re-theme horizon segmented controls, column container surfaces, status icons (To Do, In Progress, Done), and Shelved/Dismissed archive banners with high-contrast text and accessible tinted surfaces.

**Blocked by:** 01: Design Token System Foundation & Preference Surfaces

**Status:** resolved

- [x] Header toolbar layout remains stable and does not jump vertically or horizontally when toggling between Active, Shelved, and Dismissed modes.
- [x] Horizon segmented control in Light Mode renders with high-contrast text, clear borders, and an elevated white pill for the active tab.
- [x] Shelved archive banner renders with dark amber text (`#92400e`) on a warm tinted background (`#fffbeb`) with a subtle border.
- [x] Dismissed archive banner renders with dark rose/ruby text (`#9f1239`) on a soft rose background (`#fff1f2`) with a subtle border.
- [x] Kanban column surfaces in Light Mode render with `--surface-sunken` and crisp borders for visual depth.
- [x] Column header icons (To Do, In Progress, Done) render with deep, distinct semantic colors rather than faded grey.
- [x] Board title, card count indicator, and mode switcher buttons maintain WCAG AA contrast against light surfaces.
