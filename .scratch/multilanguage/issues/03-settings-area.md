# 03: Settings Area Translation

**What to build:**
Every user-facing string in the Settings modal and all seven settings tabs must be translated, including labels, titles, button text, placeholder text, toast messages, and error messages. The translation keys must be added to both the English and Romanian catalogs in the same ticket, so no half-translated keys remain. A component test must render at least one settings tab in Romanian and assert translated output appears in the DOM.

**Blocked by:** 02-romanian-locale-and-switcher

**Status:** ready-for-agent

- [ ] SettingsModal translated (tab labels, section titles, button text)
- [ ] Appearance tab translated (labels, descriptions, selector options)
- [ ] Profile tab translated (form labels, placeholders, validation messages)
- [ ] AI tab translated (section titles, form fields, helper text)
- [ ] Integrations tab translated (form labels, status badges, helper text)
- [ ] Channels tab translated (channel names, labels, status badges, action buttons)
- [ ] Schedule tab translated (time labels, descriptions)
- [ ] Security tab translated (form labels, confirmation prompts, error messages)
- [ ] Toast messages and error strings inside settings components translated
- [ ] All keys added to BOTH English and Romanian catalogs in this ticket
- [ ] Component test renders at least one settings tab in Romanian and asserts translated output
- [ ] `make check` passes with zero warnings
- [ ] Frontend build completes and `internal/web/dist` is committed
