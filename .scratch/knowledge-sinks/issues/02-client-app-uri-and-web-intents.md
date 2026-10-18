# 02: Client App URI & Web Intents in Card Modal

**What to build:**
Zero-configuration client application intents that allow users to dispatch cards directly from their browser or device into local desktop tools (Obsidian App, Logseq, Things 3) or task managers (Todoist, GitHub Issues) without requiring server-side API keys or host filesystem access. Users can toggle which client intent shortcuts appear in their card action menu from Settings.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Card modal overflow menu supports "Open in Obsidian App" using the `obsidian://new?name=...&content=...` URI scheme.
- [ ] Card modal overflow menu supports "Send to Logseq" using the `logseq://x-callback-url/quickCapture` URI scheme.
- [ ] Card modal overflow menu supports "Add to Things 3" using the `things:///add?title=...&notes=...` URI scheme.
- [ ] Card modal overflow menu supports "Create GitHub Issue" via pre-filled web intent URL.
- [ ] Card modal preserves existing "Add to Todoist" web intent.
- [ ] Settings tab (`IntegrationsTab`) includes a "Client App Shortcuts" section with toggle switches for each client intent, persisting preferences in `settings` (`client_intents_enabled`, default: `obsidian,todoist`).
- [ ] Card modal only displays enabled client intent shortcuts.
- [ ] Unit tests verify intent URI encoding and settings toggle persistence.
