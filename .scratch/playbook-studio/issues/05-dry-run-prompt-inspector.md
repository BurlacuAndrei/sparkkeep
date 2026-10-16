# 05: Client-Side Dry-Run Inspector & Real-Time Prompt Preview

**What to build:**
An interactive "Preview & Dry-Run" panel inside Playbook Studio. Allows users to select any card (or realistic sample card) and preview compiled prompt instructions, variable substitutions (`{card_title}`, `{source_urls}`), and search query plans client-side with zero token cost and zero latency before saving.

**Blocked by:** 02: Visual Pipeline Timeline Canvas & In-Place Focused Step Editor

**Status:** ready-for-agent

- [ ] Add a toggleable "Dry-Run / Prompt Inspector" panel in the Playbook Studio builder.
- [ ] Allow selecting an existing card or fallback realistic test card.
- [ ] Compile variable bindings (`{card_title}`, `{card_url}`, `{card_content}`, `{sources}`, `{previous_steps}`) purely client-side without LLM calls.
- [ ] Display step-by-step compiled prompts and planned tool queries.
- [ ] Tests verify prompt preview generation and card selection.
