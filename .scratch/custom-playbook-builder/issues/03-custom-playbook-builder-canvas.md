# 03: Custom Playbook Builder Canvas

**What to build:**
Replace the forced recipe archetype picker modal in `PlaybookManager.tsx` with a direct builder canvas. When clicking "New Playbook", open the builder immediately with a blank canvas or template cloning option. In the Sequencer (left pane), expose transparent step primitives allowing custom prompt directives, tool policies (`none` vs `search`), input bindings, and max search queries. In the builder header, expose "Set as Platform Default" toggle, Card Types multi-select, and JSON Export / Import actions.

**Blocked by:**
01-card-taxonomy-settings.md, 02-soft-validation-and-fallback-report-synthesizer.md

**Status:** ready-for-agent

- [ ] Remove forced archetype modal: clicking "New Playbook" opens the direct builder canvas immediately.
- [ ] Implement reorderable Sequencer step cards exposing transparent step primitives (prompt directives, tools, input bindings).
- [ ] Implement header controls: Name, Description, Card Types multi-select populated from active taxonomy, and "Set as Platform Default" toggle.
- [ ] Implement JSON Export and Import buttons for full playbook portability.
- [ ] Update `PlaybookManager.test.tsx` to verify direct canvas opening, step editing, and JSON import/export.
