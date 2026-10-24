# 01: Workspace Interface Locale Persistence & Smart Output Language Sync

**What to build:** Persist the workspace `Interface Locale` (`en`, `ro`, `es`, `pt-BR`, `fr`, `de`) in backend platform settings and synchronize it with the frontend locale provider so the server and client share a single source of truth for workspace language. During Setup Wizard onboarding, selecting an `Interface Locale` automatically sets the AI `Output Language` to match. After onboarding, changing `Interface Locale` automatically updates `Output Language` when they were previously aligned (displaying a toast with a 1-click undo action to keep the prior AI language) and preserves custom `Output Language` overrides when decoupled (offering a 1-click toast action to align them).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Backend platform settings persist `interface_locale` (defaulting to `en` and validating against the six supported locales: `en`, `ro`, `es`, `pt-BR`, `fr`, `de`) and return it in the settings status payload.
- [ ] Frontend locale provider keeps browser local storage as the synchronous initial cache, hydrates from the backend workspace `Interface Locale` on load, and persists changes to both local storage and backend settings.
- [ ] Completing or changing language in the Setup Wizard persists the selected `Interface Locale` to the backend and aligns the initial AI `Output Language` (`UserProfile.Language`) to the matching language name (`English`, `Romanian`, `Spanish`, `Portuguese`, `French`, `German`).
- [ ] Switching `Interface Locale` post-onboarding automatically updates `Output Language` if `Output Language` was previously aligned with the old `Interface Locale` (or empty), showing a toast notification with a 1-click undo button that restores the previous `Output Language`.
- [ ] Switching `Interface Locale` post-onboarding when the user had explicitly customized `Output Language` to a decoupled value preserves the custom `Output Language` unchanged and shows a 1-click toast action to optionally switch `Output Language` to match the new `Interface Locale`.
- [ ] Automated backend and frontend integration tests verify persistence, Setup Wizard alignment, smart follow-with-undo, and custom override preservation with zero console warnings.
