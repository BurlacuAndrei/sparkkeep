# 02: Canonical Card Types, Localized Taxonomy UI, and Alias Resolution

**What to build:** Support localized display labels across all six locales (`en`, `ro`, `es`, `pt-BR`, `fr`, `de`) for all 15 `Canonical Card Types` (`article`, `video`, `book`, `guide`, `product`, `place`, `idea`, `quote`, `tool`, `repo`, `paper`, `company`, `claim`, `tutorial`, `collection`, plus immutable `other`) while keeping canonical English slugs in storage and playbook routing, and rendering user-defined `Custom Card Types` verbatim. Resolve localized names of known built-in types back to their canonical slug when users add types in any supported language, and surface inactive `Canonical Card Types` as 1-click suggestion chips in Platform Preferences.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] All six locale catalogs define translated display labels for all 15 `Canonical Card Types` and the `other` fallback, passing catalog key parity, placeholder parity, and coverage tests.
- [ ] Every UI surface displaying a `Card Type` (Card badges, Card Modal type selector, Inbox/Board filters, Playbook Studio routing pills, and Platform Preferences Taxonomy chips) renders the localized label for `Canonical Card Types` and renders `Custom Card Types` verbatim.
- [ ] Switching `Interface Locale` dynamically updates all displayed `Canonical Card Type` labels without breaking existing Card filtering or `Research Playbook` routing.
- [ ] Adding a `Card Type` in Platform Preferences or via the settings API normalizes and matches input case- and accent-insensitively against canonical slugs and all supported locale labels for the 15 `Canonical Card Types`, resolving matches (such as `"Herramienta"` or `"Instrument"`) to the canonical slug (`"tool"`).
- [ ] Platform Preferences Card Taxonomy displays inactive `Canonical Card Types` as 1-click quick-add chips alongside the free-text input for `Custom Card Types`.
- [ ] Automated backend and frontend tests cover localized rendering across all 15 canonical types, alias resolution, quick-add suggestion chips, and verbatim custom types.
