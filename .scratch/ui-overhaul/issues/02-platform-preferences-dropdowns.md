# 02: Platform Preferences Form & Dropdown Modernization

**What to build:** High-polish modernization of the User Profile and AI Profile tabs in Platform Preferences. The "Constraints & Operating Guidelines" and "Bio" textareas adopt unified input styling with comfortable vertical resizing and monospace option for constraints. The "Output Language for triage & research" dropdown and AI provider/role selectors are upgraded to use the interactive, accessible `CustomSelect` component with icons and popovers.

**Blocked by:** 01: Universal Form Controls Foundation & CSS Modular Seam

**Status:** resolved

- [x] "Constraints & Operating Guidelines" textarea renders with modern styling, clear hint text, and focus states.
- [x] "Output Language for triage & research" uses `CustomSelect` with a globe icon, smooth popover, and support for custom language input.
- [x] AI Profile tab model provider and role dropdowns use `CustomSelect`.
- [x] Dirty state change and save handlers function seamlessly.
- [x] Component tests in `UserProfileTab.test.tsx` and `SettingsModal.test.tsx` pass cleanly.
