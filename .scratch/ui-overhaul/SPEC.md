# SPEC: Comprehensive UI Modernization, Form Controls Overhaul & Light Mode Contrast Remediation

**Triage Label:** `ready-for-agent`  
**Status:** Ready for Ticket Breakdown  
**Related Documents:** [GLOSSARY.md](file:///home/capitanfg/media-server/nas/sparkkeep/GLOSSARY.md), [CODING_STANDARDS.md](file:///home/capitanfg/media-server/nas/sparkkeep/CODING_STANDARDS.md), [AGENTS.md](file:///home/capitanfg/media-server/nas/sparkkeep/AGENTS.md)

---

## Problem Statement

Users of SparkKeep experience significant visual and functional friction due to stark inconsistencies in UI polish, unstyled form elements, and poor Light Mode contrast. Specifically:

1. **Unstyled Form Controls Looking Outdated**: While certain text inputs have sleek styling, textareas (such as "Constraints & Operating Guidelines" and "Bio" in User Profile Preferences) and dropdowns (such as "Output Language for triage & research" and "Default Playbook for Untyped Cards") fall back to unstyled browser defaults with beveled borders and raw system controls, giving them an unpolished appearance.
2. **Severely Degraded Light Mode Experience**: Dark Mode was built first, leaving Light Mode with numerous illegibility bugs. Hardcoded light-slate and near-white text colors render almost invisibly against light backgrounds. Card surfaces appear flat and washed out without proper elevation, borders, or depth, falling far short of a modern software experience.
3. **Low-Information Playbook Cards**: In Playbook Studio, Research Playbook cards are visually plain boxes with simple colored left borders. They fail to convey pipeline execution flow, do not show which Card Types they target, and lack visual clarity regarding which playbook is the active system default.
4. **Architectural Style Leaks**: Playbook-specific card and editor styles are scattered inside shared component stylesheets rather than adhering to modular feature stylesheets.

---

## Solution

Deliver a cohesive, high-polish UI overhaul across form controls, theme contrast, and Research Playbook visualization:

1. **Universal Form Control Foundation**: Establish robust base styling so every raw input, textarea, and select element automatically adopts the active theme tokens, comfortable padding, rounded geometry, and subtle focus glow rings.
2. **Accessible CustomSelect Upgrade**: Transition key dropdowns across Platform Preferences, Playbook Studio, Step Editor, and Research Scheduler to the interactive, keyboard-navigable CustomSelect primitive with custom icons and popover menus.
3. **Refined Light Mode Design System**: Implement a modern SaaS aesthetic (Linear/Stripe style) with WCAG AA compliance (minimum 4.5:1 contrast ratio) across all typography, badges, and chips. Replace raw hex values with semantic CSS variables, and provide layered elevation and crisp borders on a subtle canvas.
4. **Rich Workflow Playbook Cards**: Redesign Research Playbook cards to feature a visual mini-pipeline flow strip connecting step badges, target Card Type chips, an unmistakable "Default" badge when active, and distinct Built-in versus Custom styling.
5. **Modular Stylesheet Enforcement**: Migrate all playbook-specific styles from the shared components stylesheet into the feature-specific playbooks stylesheet.

---

## User Stories

1. As an operator editing my User Profile in Platform Preferences, I want the "Constraints & Operating Guidelines" textarea to look modern and unified with surrounding inputs, so that my configuration workspace feels cohesive and pleasant.
2. As an operator configuring triage languages, I want the "Output Language" dropdown to render with modern typography, an icon, and a smooth popover list, so that selecting a language is effortless and visually polished.
3. As an operator using SparkKeep in a brightly lit environment, I want Light Mode text (such as briefing summaries, action bullets, and research findings) to be dark and crisp with at least 4.5:1 contrast, so that I can read comfortably without eye strain.
4. As an operator reviewing research findings in Light Mode, I want status badges, signal chips, and tags to have legible text on tinted pastel backgrounds, so that critical metadata stands out clearly without being washed out.
5. As an operator browsing Research Playbooks in Playbook Studio, I want each playbook card to display a mini-pipeline preview of its execution steps, so that I understand its research strategy at a glance before opening the editor.
6. As an operator managing multiple Research Playbooks, I want to clearly see which Card Types each playbook targets directly on the card, so that I can verify my taxonomy routing.
7. As an operator with a designated default pipeline, I want an unmistakable "Default" badge on the active default playbook card, so that I immediately know which pipeline executes on untyped cards.
8. As an operator distinguishing system playbooks from user playbooks, I want Built-in Playbooks and Custom Playbooks to have refined visual identities with clear icons and distinct border accents.
9. As an operator configuring a research step in the Step Editor Modal, I want the Tool Policy and LLM Role selectors to be sleek CustomSelect dropdowns, so that configuring tools feels modern and responsive.
10. As an operator setting automated research rules in the Research Scheduler, I want Card Status, Worthiness, and Card Type filters to use consistent, styled dropdowns, so that scheduling rules is intuitive.
11. As an operator typing in multi-line prompt fields, I want comfortable vertical resizing and monospace typography for technical guidelines, so that editing complex instructions is easy.
12. As a keyboard user, I want full keyboard navigation (Up/Down arrow keys, Enter, Escape) and proper ARIA listbox attributes across all upgraded dropdowns, so that I can operate the platform smoothly without a mouse.
13. As an operator switching between Dark, Light, and OLED themes, I want all input controls, cards, and modal dialogs to adapt smoothly without flashing or losing contrast.
14. As an operator hovering over playbook cards and form fields, I want subtle transition animations and focus rings, so that the application feels responsive and alive.

---

## Implementation Decisions

### 1. Form Controls & Dropdowns Architecture
- **Two-Tier System**:
  - Base layer: Raw HTML `input`, `textarea`, and `select` receive global CSS reset rules ensuring consistent font inheritance, surface background tokens, border tokens, focus ring shadows, and custom SVG chevrons for fallback native selects.
  - Component layer: High-impact dropdowns are upgraded to the shared `CustomSelect` component with ARIA 1.2 listbox patterns, keyboard navigation, and focus management.
- **Specific Dropdowns Upgraded**:
  - User Profile: Output Language selector (with custom language write-in handling).
  - AI Profile: Provider and LLM Role selectors.
  - Playbook Studio: Default Playbook for Untyped Cards selector.
  - Step Editor Modal: Tool Policy and LLM Role selectors.
  - Research Scheduler: Card Status, Worthiness, and Card Type selectors.
- **Input Styling Enhancements**:
  - Unify styling across setup inputs, textareas, and select wrappers with consistent padding, border radius, and transitions.
  - Monospace font styling for prompt engineering textareas and constraints.

### 2. Light Mode Aesthetic & Contrast Remediation
- **Design Language**: Linear/Stripe style with a soft canvas (`#f8fafc`), crisp card borders (`#e2e8f0`), and dual-layer subtle elevation shadows (`0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)`).
- **Token Enforcement**:
  - Audit and replace all hardcoded light-slate and near-white hex colors (`#cbd5e1`, `#f1f5f9`, `#818cf8`, `#34d399`, `#a5b4fc`, `#e0e7ff`) with semantic variables (`var(--text-main)`, `var(--text-dim)`, `var(--text-muted)`).
  - Define explicit light mode overrides for badges, chips, flow strips, and code blocks to maintain WCAG AA 4.5:1+ contrast against light surfaces.
  - Use saturated deep accents (indigo-600, emerald-600, amber-600, rose-600) on light backgrounds paired with low-opacity tinted backgrounds.

### 3. Playbook Cards Visual Redesign
- **Card Hierarchy**:
  - Top bar: Built-in / Custom pill badge, active step count, and an active "Default" badge when the playbook ID matches the configured default.
  - Title and Description: High-contrast typography with proper text truncation.
  - Pipeline Flow Strip: Visual step progression showing ordered step name badges connected by subtle arrows.
  - Card Types Bar: Clean chip tags indicating all Card Types assigned to the playbook.
  - Footer: Clean secondary action buttons (Duplicate, Edit, Delete).
- **Surface Polish**: Distinct accent borders, hover elevation, and responsive grid layout.

### 4. CSS Architecture & Seams
- **Stylesheet Seams**:
  - Relocate playbook-specific styles from the shared components stylesheet into the feature-specific playbooks stylesheet to comply with repository coding standards.
  - Keep the shared components stylesheet strictly focused on shared primitives (CustomSelect, form controls, modals, toasts).

---

## Testing Decisions

### Behavior-Driven Testing
- Tests must verify external behavior and rendered DOM characteristics (accessible labels, visible text, option selection, role attributes) rather than internal CSS file locations or implementation details.
- Verify that User Profile textareas and language dropdowns render correctly, update state on change, and save preferences.
- Verify that Playbook Studio displays Built-in and Custom Playbook cards with their respective step counts, default indicators, and action triggers.
- Verify that CustomSelect keyboard navigation (ArrowDown, ArrowUp, Enter, Escape) works properly across upgraded views.
- Prior art:
  - `UserProfileTab.test.tsx` for form interaction tests.
  - `PlaybookManager.test.tsx` for playbook card and studio tests.
  - `SettingsModal.test.tsx` for modal layout and preference tab tests.

---

## Out of Scope
- Backend API schema changes or database migrations (existing endpoints and data models already support all needed fields).
- Adding new research execution engines or altering LLM prompt evaluation logic.
- Reworking Kanban board drag-and-drop mechanics or Omnisearch indexing.

---

## Further Notes
- Frontend build distribution (`internal/web/dist`) must be synchronized via `npm run build` as required by repository rules.
- CI gate `make check` must pass cleanly before finalizing changes.
