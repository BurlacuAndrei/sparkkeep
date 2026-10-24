# 05: Localized System Seeds, Built-in Playbook Cloning, and Starter Archetypes

**What to build:** Localize all system-seeded content across the six supported locales (`en`, `ro`, `es`, `pt-BR`, `fr`, `de`): seed the 6 Onboarding Demo Cards and sample Research Dossier in the workspace `Interface Locale` selected during the Setup Wizard; dynamically localize immutable `Built-in Playbooks` and their `Step Primitives` in the UI and materialize localized names, descriptions, and step titles when a user clones a built-in playbook into a `Custom Playbook`; and localize the four Starter Profile Archetype prefills (`Founder`, `Finance`, `AgTech`, `Systems`).

**Blocked by:** 01 (#50)

**Status:** ready-for-agent

- [ ] Onboarding Demo Data seeding creates the 6 showcase Cards and sample completed Research Dossier in the workspace `Interface Locale` (`en`, `ro`, `es`, `pt-BR`, `fr`, `de`), keeping `Canonical Card Type`, `Status`, `Horizon`, and verdict enum slugs canonical.
- [ ] Immutable `Built-in Playbooks` (`is_builtin: true`) and their steps display localized names and descriptions dynamically in the active `Interface Locale` across Playbook Studio, Card Modal, and playbook selectors.
- [ ] Cloning/duplicating a `Built-in Playbook` materializes the new editable `Custom Playbook`'s name, description, and step titles in the user's active `Interface Locale`.
- [ ] Selecting any of the four Starter Profile Archetypes (`Founder`, `Finance`, `AgTech`, `Systems`) in the `About me` profile tab prefills `Goals`, `Skills`, `Stack`, `Interests`, and `Constraints` in the active `Interface Locale`.
- [ ] Automated backend and frontend tests verify locale-aware demo seeding, built-in playbook localization and cloning, and localized archetype prefill across all six locales.
