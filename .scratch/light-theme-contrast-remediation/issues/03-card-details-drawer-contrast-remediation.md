# 03: Card Details Drawer & Markdown Contrast Remediation

**What to build:**
Eliminate all white-on-white and washed-out typography across the Card Details modal and drawer subviews. Uncompleted Next Action checklist items render in deep slate; Deep Research Report markdown headings, body prose, and tables render with high contrast; Key Claims, Source provenance, Sibling cards, Tags, Reference chips, and Comments render with distinct dark text and clean border geometry.

**Blocked by:** 01: Design Token System Foundation & Preference Surfaces

**Status:** resolved

- [x] Uncompleted Next Action checklist items render in `--text-main` (`#0f172a`), eliminating invisible white text on white backgrounds.
- [x] Completed Next Action checklist items retain muted styling (`--text-muted`).
- [x] Deep Research Report markdown headings (`#f8fafc`), body prose (`#cbd5e1`), lists, and tables consume `--text-main` and `--text-dim`.
- [x] Key Claims statements, verification badges, and source linkages render with WCAG AA contrast against light surfaces.
- [x] Source platform badges, original URL links, and "From same source" sibling cards render with distinct dark slate typography.
- [x] Platform icon normalizers (e.g., GitHub icon) render with dark slate colors in Light Mode.
- [x] Reference chips, tags, and comment author/timestamp/body text render with high contrast and subtle borders.
- [x] Raw Captured Content and Split Card modals render with native light theme surface tokens.
- [x] Custom drawer scrollbar track uses a subtle transparent or slate tint in Light Mode rather than dark blue-slate.

