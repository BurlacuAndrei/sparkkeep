# 01: Top-Level Playbook Studio Workspace Navigation & Full-Width Canvas

**What to build:**
Elevate Research Playbooks to a primary top-level navigation mode in the application header (`App.tsx`, `Header.tsx`), rendering Playbook Studio in a distraction-free, full-width workspace (`no-sidebar` mode). Provide a catalog view with distinct status badges (Built-in vs Custom), step count indicators, and a shortcut link in the Settings modal.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Add `'playbooks'` to the primary `viewMode` in `App.tsx` and header navigation items in `Header.tsx`.
- [x] Render the Playbook Studio workspace full-width without the card-tag sidebar when `viewMode === 'playbooks'`.
- [x] Display the catalog of built-in and custom playbooks with distinct status badges and action buttons.
- [x] Maintain an "Open Playbook Studio" shortcut button in `SettingsModal.tsx` for easy discovery.
- [x] Unit and component navigation tests pass in `PlaybookManager.test.tsx` and `Header.test.tsx` (or `App.test.tsx`).
