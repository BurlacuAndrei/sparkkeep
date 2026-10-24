# 06: Localized Knowledge Sink Headings, Channel Notifications, and Digests

**What to build:** Localize backend-rendered human surfaces using a six-locale backend catalog driven by the persisted workspace `Interface Locale` (`en`, `ro`, `es`, `pt-BR`, `fr`, `de`): localize Markdown section headings in `Knowledge Sink` and `Client Intent` exports (Obsidian, Joplin, Notion body blocks) while keeping YAML frontmatter keys/enums and database schema keys in canonical English; and localize outbound notifications, interactive triage buttons, and scheduled Morning/Weekly Digests across Telegram, Discord, Slack, and OpenClaw while keeping bot slash commands and callback data canonical.

**Blocked by:** 01 (#50)

**Status:** ready-for-agent

- [ ] Knowledge Sink and Client Intent Markdown exports (Obsidian, Joplin, Notion body blocks) keep YAML frontmatter keys (`id`, `title`, `horizon`, `status`, `source_url`, `tags`, `created_at`, `updated_at`, `researched`), frontmatter enum values, Notion database property keys, and Outbox Feed schema fields in canonical English, while localizing human-readable Markdown section headings (`Executive Summary`, `Summary`, `Value Proposition`, `Proposed Actions`, `Source Notes`, `References`, `Research Dossier`, `Playbook`, `Completed`) in the workspace `Interface Locale`.
- [ ] Outbound notifications across Telegram, Discord, Slack, and OpenClaw render message chrome, interactive action button labels (`Research`, `Do`, `Keep`, `Shelve`, `Dismiss`, `Playbook`), and status feedback in the persisted workspace `Interface Locale`.
- [ ] Scheduled and on-demand Morning Research Digests and Weekly Digests render headers, counts, and summary labels in the persisted workspace `Interface Locale`.
- [ ] Inbound bot slash commands (`/start`, `/help`, `/digest`, `/morning`, `/inbox`) and button callback action prefixes (`do:`, `research:`, `keep:`, `shelve:`, `dismiss:`, `pb:`) remain canonical across all locales.
- [ ] Automated tests verify canonical frontmatter + localized Markdown headings across Knowledge Sinks and localized outbound messages/buttons/digests across channel adapters.
