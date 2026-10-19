# Spec: Integrations Visibility — Knowledge Sinks as a Flagship Feature

## Problem Statement

Sparkkeep's Knowledge Sinks (Obsidian Vault Export, Notion Database Sync, Joplin Server/Clipper) are powerful, zero-paywall integrations that differentiate the product. However, they are currently buried:
- Configuration lives in Settings → 7th of 8 tabs ("Integrations & API")
- Single-card export actions are hidden in the card modal's overflow menu (⋯)
- No at-a-glance visibility of which sinks are configured, their sync status, or quick-access to "Sync Library Now"

Users who would benefit most from these integrations never discover them, and power users lack a lightweight status dashboard.

## Solution

Elevate Knowledge Sinks to a first-class, discoverable surface without adding a new top-level view:

1. **Header Dropdown**: A single "Integrations" button in the topbar (next to Settings) opens a mini-panel.
2. **Mini-Panel**: Lists each configured Knowledge Sink (Obsidian, Notion, Joplin) with:
   - Connection status / last sync timestamp
   - Auto-export toggle
   - "Sync Now" button (triggers full library bulk sync)
   - Outbox RSS feed token and URL (for automation/readers)
3. **Card Modal Badge**: The overflow menu (⋯) shows a badge with the count of configured sinks; the menu items for "Send to Obsidian/Notion/Joplin" remain in the overflow but are visually promoted when sinks exist.
4. **Settings Tab Promotion**: Move "Integrations & API" from 7th to 3rd position (after Appearance & Profile), rename to "Integrations".

## User Stories

1. As a new user, I want to see that Sparkkeep integrates with Obsidian/Notion/Joplin immediately upon opening the app, so that I know my PKM workflow is supported.
2. As an Obsidian user, I want a single click in the header to trigger a full library sync to my vault, so that I don't have to open Settings and scroll.
3. As a Notion user, I want to see at a glance whether my Notion database is connected and when it last synced, so that I trust my notes are backed up.
4. As a Joplin user, I want to toggle auto-export on/off from the header panel without opening the full Settings modal.
5. As an automation enthusiast, I want quick access to my Outbox RSS feed token and URL from the header panel, so that I can plug it into FreshRSS/n8n/Readwise Reader.
6. As a power user viewing a card, I want to know how many sinks are configured (badge on the ⋯ menu) so I don't have to open the menu to discover export options.
7. As a user configuring integrations, I want the Integrations settings tab to be prominently placed (3rd tab), so that setup is frictionless.

## Implementation Decisions

1. **Header Integration Dropdown** (`frontend/src/components/Header.tsx`):
   - Add a new icon button in `topbar-right` (left of Settings) using a `Plug` or `Database` icon from lucide-react.
   - Click opens a popover/dropdown panel anchored to the button.
   - Panel fetches current settings via `api.getSettings()` to determine which sinks are configured.
   - For each configured sink, display:
     - Sink icon + label (Obsidian violet, Notion black, Joplin teal)
     - Last sync status (success/time or "Never synced")
     - Auto-export toggle (calls `api.patchSettings({ [sink]_auto_export: boolean })`)
     - "Sync Now" button (calls `api.syncObsidian()`, `api.syncNotion()`, `api.syncJoplin()`)
   - Outbox RSS section: show token (masked/reveal), feed URL, copy buttons, regenerate button (uses existing `api.getOutboxFeedToken()`, `api.regenerateOutboxFeedToken()`).
   - Panel closes on outside click or Escape.

2. **Card Modal Overflow Badge** (`frontend/src/components/card-modal/CardHeaderActions.tsx`):
   - Compute configured sink count from `settings` prop: check `obsidian_vault_path`, `notion_token` + `notion_database_id`, `joplin_token` (or `joplin_base_url` + credentials).
   - If count > 0, render a small badge on the `MoreHorizontal` button (e.g., "3" with sink icons tooltip).
   - Existing "Send to Obsidian/Notion/Joplin" menu items remain; they already conditionally render based on `settings`.

3. **Settings Tab Reorder & Rename** (`frontend/src/components/SettingsModal.tsx`):
   - Change `SettingsTab` type order: `'appearance' | 'profile' | 'integrations' | 'ai' | 'schedule' | 'channels' | 'security'`
   - Update sidebar navigation rail button order to match.
   - Change tab label from "Integrations & API" to "Integrations" (keep `Plug` icon).
   - `IntegrationsTab` component receives same props; no internal changes needed.

4. **Styling** (`frontend/src/styles/components.css` or new `integrations-dropdown.css`):
   - Dropdown panel: `position: absolute`, `right: 0`, `top: 100%`, `min-width: 320px`, `max-height: 60vh`, `overflow-y: auto`.
   - Sink row: flex layout with icon, label, status, toggle, sync button.
   - Loading/syncing states with spinners.
   - Consistent with existing `settings-panel` / `setup-info-box` visual language.

5. **API Usage** (no backend changes):
   - Reuse existing `api.getSettings()`, `api.patchSettings()`, `api.syncObsidian()`, `api.syncNotion()`, `api.syncJoplin()`, `api.getOutboxFeedToken()`, `api.regenerateOutboxFeedToken()`.
   - All sink status derived from settings fields + last sync result (ephemeral, shown in panel only).

## Testing Decisions

1. **Header Dropdown** (`Header.test.tsx`):
   - Renders Integrations button in topbar-right.
   - Click opens panel; panel shows configured sinks with correct icons/labels.
   - Auto-export toggle calls `patchSettings` with correct payload.
   - Sync Now button calls correct `sync*` API and shows loading state.
   - Outbox RSS section shows token, feed URL, copy/regenerate actions.
   - Outside click / Escape closes panel.

2. **Card Modal Badge** (`CardHeaderActions.test.tsx`):
   - Badge renders with correct count when sinks configured.
   - Badge hidden when no sinks configured.
   - Tooltip lists configured sink names.

3. **Settings Tab Order** (`SettingsModal.test.tsx`):
   - Tab order matches new sequence.
   - "Integrations" label renders (not "Integrations & API").
   - Clicking Integrations tab renders `IntegrationsTab` component.

4. **Integration** (manual/e2e):
   - Configure Obsidian vault path → header panel shows Obsidian row with "Never synced" → click Sync Now → shows success + timestamp.
   - Toggle auto-export off → Settings tab reflects change.
   - Outbox RSS token copy/regenerate works.

## Out of Scope

- Two-way sync or inbound polling from Obsidian/Notion/Joplin (per ADR 0005).
- Per-card custom property mapping for Notion (fixed canonical schema).
- New REST API endpoints — all data comes from existing `/api/v1/settings` and export endpoints.
- Persistent sync history / logs — only last sync timestamp shown in panel.
- Client Intents (Open in Obsidian/Logseq/Things/Todoist/GitHub) in header panel — only Knowledge Sinks + Outbox RSS.

## Further Notes

- Follows `CODING_STANDARDS.md`: zero paywalls, core orchestration in `internal/core/Service`, Vitest act cleanliness, `make check` passing.
- Architecture Decision Record at `docs/adr/0005-one-way-stateless-knowledge-sinks.md` remains unchanged.
- Ubiquitous language in `GLOSSARY.md`: "Knowledge Sink", "Outbox RSS", "Client Intent".
- Frontend build (`npm run build`) will sync `internal/web/dist`; commit both together.