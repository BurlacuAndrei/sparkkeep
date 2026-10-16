# 02: Visual Pipeline Timeline Canvas & In-Place Focused Step Editor

**What to build:**
Re-architect the playbook builder into an interactive sequential Timeline with visual node connector rails, stage badges, and tool policy chips (`🔍 Web Search` vs `🧠 Source Reasoning`). Clicking a step expands an in-place focused editor card with prompt starter pills, live character counter, tool toggles, and input binding pills.

**Blocked by:** 01: Top-Level Playbook Studio Workspace Navigation & Full-Width Canvas

**Status:** ready-for-agent

- [ ] Render the pipeline steps as connected visual node cards along a sequential timeline with position numbers and stage badges.
- [ ] Display tool policy chips on step cards (`🔍 Web Search` with query count vs `🧠 Source Reasoning`).
- [ ] Provide in-place focused card expansion when clicking a step, preserving pipeline context.
- [ ] Include quick-insert prompt starter pills, live character counter (up to 8,000 chars), tool policy selector, and input binding chips.
- [ ] Tests verify timeline rendering, step expansion, and config updates.
