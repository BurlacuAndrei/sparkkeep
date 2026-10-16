# 04: Global Omnisearch & Quick Capture Modal Modernization

**What to build:**
Fix text-and-icon collisions in the global search bar by adjusting inset padding and icon alignment. Re-theme search popover footers and `<kbd>` shortcuts for clean light-mode contrast. Upgrades the New Spark modal hero capture container and textarea with light surface tokens, high-contrast dark text, and subtle focus rings.

**Blocked by:** 01: Design Token System Foundation & Preference Surfaces

**Status:** resolved

- [x] Global search input has adequate left padding (`38px`+) and icon offset (`14px`) so placeholder and typed text do not overlap the magnifying glass icon.
- [x] Omnisearch popover footer renders with a soft neutral surface, subtle border, and high-contrast `<kbd>` keyboard shortcut badges in Light Mode.
- [x] New Spark modal capture hero box, textarea, and context inputs render with `--surface-sunken` or card background tokens instead of dark blue translucent overlays.
- [x] New Spark modal placeholder and input text render in `--text-main` and `--text-muted` rather than white.

