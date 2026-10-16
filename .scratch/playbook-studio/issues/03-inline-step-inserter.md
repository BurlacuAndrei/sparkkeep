# 03: Contextual In-Line Step Inserter & Instant Quick-Add Command Palette

**What to build:**
Hovering between any two steps in the timeline reveals a subtle `+` insertion line. Clicking it triggers an instant Quick-Add popover palette with typeahead filtering across Step Primitives and a 1-click "Blank Custom Step" action. Selection immediately inserts the step at that exact index, auto-expands it in edit mode, and focuses its primary title input for zero-friction authoring.

**Blocked by:** 02: Visual Pipeline Timeline Canvas & In-Place Focused Step Editor

**Status:** ready-for-agent

- [ ] Render interactive `+` insertion lines between adjacent timeline steps and at the end of the sequence on hover/focus.
- [ ] Display an instant Quick-Add Command Palette popover anchored to the insertion line with search filtering.
- [ ] List curated Step Primitive templates grouped by research pillar.
- [ ] Provide a 1-click "Blank Custom Step" action that inserts at the target position, auto-expands the card, and focuses the title field.
- [ ] Tests verify inserting steps at specific positions (e.g. between step 1 and 2) and auto-focusing the editor.
