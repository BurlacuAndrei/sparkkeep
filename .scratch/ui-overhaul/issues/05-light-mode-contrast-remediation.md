# 05: Light Mode Visual Polish, Token Enforcement & Contrast Remediation

**What to build:** Comprehensive audit and replacement of hardcoded light-slate and near-white hex colors (`#cbd5e1`, `#f1f5f9`, `#818cf8`, `#34d399`, `#a5b4fc`, `#e0e7ff`) across stylesheets with semantic tokens. Provide explicit Light Mode overrides for briefing summaries, action bullets, triage cards, signal chips, code blocks, flow strips, and tags to guarantee WCAG AA 4.5:1+ contrast. Elevate Light Mode card surfaces with crisp `#e2e8f0` borders and soft layered shadows on the `#f8fafc` canvas.

**Blocked by:** 02: Platform Preferences Form & Dropdown Modernization, 03: Playbook Studio Rich Workflow Cards & Dropdown Overhaul, 04: Research Scheduler Filters Modernization

**Status:** ready-for-agent

- [ ] All briefing summaries and action items in cards are dark and legible in Light Mode (WCAG AA 4.5:1+ contrast).
- [ ] Status badges, worthiness badges, signal chips, and reference chips have high contrast text with tinted backgrounds.
- [ ] Prompt code blocks and simulator outputs have dark/light contrast rules.
- [ ] Cards in Light Mode have subtle elevation shadows and crisp `#e2e8f0` borders against `#f8fafc`.
- [ ] Full regression check across dark, light, and OLED themes.
