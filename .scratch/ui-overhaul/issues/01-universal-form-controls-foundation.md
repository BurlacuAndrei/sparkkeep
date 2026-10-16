# 01: Universal Form Controls Foundation & CSS Modular Seam

**What to build:** Universal theme-reactive base styles for all raw `input`, `textarea`, and `select` elements across the platform so that no control falls back to raw 90s browser defaults. Add complete styling for `.setup-textarea`, `.setup-select`, `.input-text`, `.input-select`, `.form-textarea`, and `.form-select` with subtle focus rings and theme-aware backgrounds. Relocate all playbook-specific CSS from the shared components stylesheet into the modular playbooks stylesheet to comply with repository coding standards.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Raw `input`, `textarea`, and `select` elements have default font inheritance, proper box-sizing, background, border, and focus outline in base styles.
- [ ] `.setup-textarea` and `.setup-select` classes are defined and visually styled matching `.setup-input`.
- [ ] `.input-text` and `.input-select` classes are defined and styled.
- [ ] Native select elements have custom theme-reactive SVG chevrons and proper padding.
- [ ] Playbook-specific CSS selectors are moved from `components.css` to `playbooks.css`.
- [ ] Existing component tests continue to pass.
