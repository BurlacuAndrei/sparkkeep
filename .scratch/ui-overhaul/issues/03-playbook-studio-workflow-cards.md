# 03: Playbook Studio Rich Workflow Cards & Dropdown Overhaul

**What to build:** Redesign Research Playbook cards in Playbook Studio to display rich workflow information: a visual mini-pipeline flow strip showing step badges connected by subtle arrows, target Card Type chips, an active "Default" badge when selected as the system default playbook, and distinct Built-in (lock icon) versus Custom (sparkles icon) visual identities. Upgrade the "Default Playbook for Untyped Cards" selector and Step Editor Modal dropdowns (Tool Policy, LLM Role) to `CustomSelect`.

**Blocked by:** 01: Universal Form Controls Foundation & CSS Modular Seam

**Status:** resolved

- [x] Playbook cards display a visual mini-pipeline flow strip showing step progression.
- [x] Playbook cards display target Card Type chips.
- [x] An active "Default" badge appears on the playbook configured as `default_playbook_id`.
- [x] Built-in and Custom playbooks have clear, elegant badge differentiation.
- [x] The "Default Playbook for Untyped Cards" selector uses `CustomSelect`.
- [x] Step Editor Modal dropdowns (Tool Policy, LLM Role) use `CustomSelect`.
- [x] Tests in `PlaybookManager.test.tsx` pass.
