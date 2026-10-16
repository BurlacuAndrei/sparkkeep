import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from './App';
import * as api from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    getSetupStatus: vi.fn().mockResolvedValue({
      ok: true,
      is_configured: true,
      has_auth: false,
      has_llm_key: true,
    }),
    fetchCards: vi.fn().mockResolvedValue([]),
    fetchTags: vi.fn().mockResolvedValue([
      { name: 'ai', count: 2 },
    ]),
    fetchDigest: vi.fn().mockResolvedValue({
      ok: true,
      week_total: 0,
      by_status: {},
      days: [],
    }),
    fetchPlaybooks: vi.fn().mockResolvedValue([
      {
        id: 1,
        name: 'Default Research Pipeline',
        description: 'Standard 8-step pipeline',
        is_builtin: true,
        card_types: [],
        version: 1,
        steps: [
          { position: 1, kind: 'ground', name: 'Grounding', enabled: true, config: {} },
          { position: 2, kind: 'report', name: 'Report Generation', enabled: true, config: {} },
        ],
      },
      {
        id: 2,
        name: 'Custom Market Teardown',
        description: 'Custom workflow for market research',
        is_builtin: false,
        card_types: ['company'],
        version: 1,
        steps: [
          { position: 1, kind: 'ground', name: 'Grounding', enabled: true, config: {} },
          { position: 2, kind: 'custom', name: 'Market Sizing', enabled: true, config: {} },
          { position: 3, kind: 'report', name: 'Report Generation', enabled: true, config: {} },
        ],
      },
    ]),
    fetchStepLibrary: vi.fn().mockResolvedValue([]),
    getSettings: vi.fn().mockResolvedValue({
      settings: {
        has_auth_token: false,
        has_llm_key: true,
        default_playbook_id: 1,
        card_types: ['tool', 'product', 'company', 'article', 'idea', 'repo', 'paper'],
      },
    }),
    patchSettings: vi.fn().mockResolvedValue({ ok: true }),
  };
});

describe('App Playbook Studio Top-Level Navigation & Full-Width Workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('switches to full-width Playbook Studio workspace without sidebar when clicking Playbooks in header', async () => {
    const { container } = render(<App />);

    // Wait for initial mount effects to settle
    await waitFor(() => {
      expect(api.fetchCards).toHaveBeenCalled();
      expect(api.fetchTags).toHaveBeenCalled();
      expect(api.getSetupStatus).toHaveBeenCalled();
    });

    // Initially in boards mode (sidebar container should be present)
    expect(container.querySelector('.sidebar-collapse-container')).not.toBeNull();
    expect(container.querySelector('.main-layout.no-sidebar')).toBeNull();

    // Click Playbooks in top-level header navigation
    const playbooksNavBtn = screen.getByRole('button', { name: /Playbooks/i });
    fireEvent.click(playbooksNavBtn);

    // Layout should now be full-width (no-sidebar) and Sidebar should not be rendered
    expect(container.querySelector('.main-layout.no-sidebar')).not.toBeNull();
    expect(container.querySelector('.sidebar-collapse-container')).toBeNull();

    // Catalog of built-in and custom playbooks should render with badges and step counts
    await waitFor(() => {
      expect(screen.getByText('Default Research Pipeline')).toBeDefined();
      expect(screen.getByText('Custom Market Teardown')).toBeDefined();
    });

    expect(screen.getByText('2 steps')).toBeDefined();
    expect(screen.getByText('3 steps')).toBeDefined();
    expect(localStorage.getItem('sparkkeep_active_view')).toBe('playbooks');
  });

  it('navigates to Playbook Studio when clicking Open Playbook Studio shortcut in SettingsModal', async () => {
    const { container } = render(<App />);

    // Wait for initial mount effects to settle
    await waitFor(() => {
      expect(api.fetchCards).toHaveBeenCalled();
      expect(api.fetchTags).toHaveBeenCalled();
      expect(api.getSetupStatus).toHaveBeenCalled();
    });

    // Open Settings Modal
    const settingsBtn = screen.getByLabelText('Settings');
    fireEvent.click(settingsBtn);

    // Wait for Settings Modal to load
    await waitFor(() => {
      expect(screen.getByText('Platform Preferences')).toBeDefined();
    });

    // Switch to Research Playbooks tab in Settings
    const playbooksTab = screen.getByRole('tab', { name: /Research Playbooks/i });
    fireEvent.click(playbooksTab);

    // Click Open Playbook Studio shortcut button
    const openStudioBtn = await screen.findByRole('button', { name: /Open Playbook Studio/i });
    fireEvent.click(openStudioBtn);

    // Settings modal should close and main workspace should be in playbooks mode (no-sidebar)
    await waitFor(() => {
      expect(screen.queryByText('Platform Preferences')).toBeNull();
      expect(container.querySelector('.main-layout.no-sidebar')).not.toBeNull();
      expect(screen.getByText('Default Research Pipeline')).toBeDefined();
    });
  });
});
