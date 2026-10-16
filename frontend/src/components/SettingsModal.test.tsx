import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SettingsModal } from './SettingsModal';
import { ThemeProvider } from '../context/ThemeContext';

// Mock API endpoints used by SettingsModal
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    getSettings: vi.fn().mockResolvedValue({
      settings: {
        has_auth_token: false,
        llm_model: 'gpt-4o',
        llm_profiles: [
          {
            id: 'default',
            name: 'OpenAI GPT-4o',
            base_url: 'https://api.openai.com/v1',
            model: 'gpt-4o',
            has_key: true,
            is_default: true,
          },
        ],
        llm_roles: {},
        token_caps: {},
        user_profile: {
          goals: 'Build scalable software',
          skills: ['TypeScript', 'Go', 'React'],
          stack: ['Docker', 'Vite'],
          interests: ['AI', 'Distributed Systems'],
          constraints: 'Offline first',
          language: 'English',
        },
        openclaw_url: 'http://localhost:18789',
        openclaw_channel: 'whatsapp',
        openclaw_target: '',
        openclaw_enabled: false,
        discord_channel_id: '',
      },
    }),
    patchSettings: vi.fn().mockResolvedValue({ success: true }),
    fetchPlaybooks: vi.fn().mockResolvedValue([
      {
        id: 1,
        name: 'Default Research Pipeline',
        description: 'Standard 8-step pipeline',
        is_builtin: true,
        card_types: [],
        version: 1,
        steps: [],
      },
    ]),
    updatePlaybook: vi.fn().mockResolvedValue({}),
    deletePlaybook: vi.fn().mockResolvedValue(undefined),
    fetchStepLibrary: vi.fn().mockResolvedValue([]),
    fetchResearchRules: vi.fn().mockResolvedValue([]),
    fetchQuietWindow: vi.fn().mockResolvedValue({
      enabled: false,
      start_hour: 22,
      end_hour: 7,
      timezone: 'UTC',
    }),
    getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
  };
});

import * as api from '../api';

describe('SettingsModal Unified Layout & Navigation UX', () => {
  const mockOnClose = vi.fn();
  const mockShowToast = vi.fn();

  const renderWithTheme = (ui: React.ReactElement) => {
    return render(<ThemeProvider defaultTheme="dark">{ui}</ThemeProvider>);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the standardized Platform Preferences modal with unified container and sidebar', async () => {
    renderWithTheme(<SettingsModal onClose={mockOnClose} showToast={mockShowToast} />);

    await waitFor(() => {
      expect(screen.getByText('Color Palette & Contrast')).toBeDefined();
    });

    // Check title and subtitle
    expect(screen.getByText('Platform Preferences')).toBeDefined();
    expect(
      screen.getByText(/Customize workspace appearance, AI models, channels, and access security/i)
    ).toBeDefined();

    // Check modal card exists
    const card = document.querySelector('.settings-modal-card');
    expect(card).not.toBeNull();

    // Check all 8 sidebar navigation tabs are present
    const tabs = [
      'Appearance & Preferences',
      'About me',
      'AI Engine',
      'Research Playbooks',
      'Scheduled Research',
      'Channels & Alerts',
      'Integrations & API',
      'Security & Access',
    ];

    for (const tab of tabs) {
      expect(screen.getByRole('tab', { name: new RegExp(tab, 'i') })).toBeDefined();
    }
  });

  it('navigates seamlessly across tabs within the stable modal body', async () => {
    renderWithTheme(<SettingsModal onClose={mockOnClose} showToast={mockShowToast} />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Color Palette & Contrast')).toBeDefined();
    });

    // Initial tab is appearance
    const appearanceTab = screen.getByRole('tab', { name: /Appearance & Preferences/i });
    expect(appearanceTab.getAttribute('aria-selected')).toBe('true');

    // Switch to 'About me'
    const profileTab = screen.getByRole('tab', { name: /About me/i });
    fireEvent.click(profileTab);
    expect(profileTab.getAttribute('aria-selected')).toBe('true');
    expect(appearanceTab.getAttribute('aria-selected')).toBe('false');
    await waitFor(() => {
      expect(screen.getByText('Personal Fit & About Me')).toBeDefined();
    });

    // Switch to 'AI Engine'
    const aiTab = screen.getByRole('tab', { name: /AI Engine/i });
    fireEvent.click(aiTab);
    expect(aiTab.getAttribute('aria-selected')).toBe('true');
    await waitFor(() => {
      expect(screen.getByText('Active AI Provider')).toBeDefined();
    });

    // Switch to 'Research Playbooks'
    const playbooksTab = screen.getByRole('tab', { name: /Research Playbooks/i });
    fireEvent.click(playbooksTab);
    expect(playbooksTab.getAttribute('aria-selected')).toBe('true');
    await waitFor(() => {
      expect(screen.getByText('Default Playbook for Untyped Cards')).toBeDefined();
    });

    // Switch to 'Channels & Alerts'
    const channelsTab = screen.getByRole('tab', { name: /Channels & Alerts/i });
    fireEvent.click(channelsTab);
    expect(channelsTab.getAttribute('aria-selected')).toBe('true');
    await waitFor(() => {
      expect(screen.getByText('Omnichannel Messenger Hub')).toBeDefined();
    });

    // Switch to 'Security & Access'
    const securityTab = screen.getByRole('tab', { name: /Security & Access/i });
    fireEvent.click(securityTab);
    expect(securityTab.getAttribute('aria-selected')).toBe('true');
    await waitFor(() => {
      expect(screen.getByText('Master Access Security')).toBeDefined();
    });
  });

  it('maintains the scrollable container across all tab panels', async () => {
    renderWithTheme(<SettingsModal onClose={mockOnClose} showToast={mockShowToast} />);

    await waitFor(() => {
      const scrollBody = document.querySelector('.settings-modal-body');
      expect(scrollBody).not.toBeNull();
    });
  });

  it('triggers onClose when clicking close button or pressing Escape', async () => {
    renderWithTheme(<SettingsModal onClose={mockOnClose} showToast={mockShowToast} />);

    await waitFor(() => {
      expect(screen.getByText('Color Palette & Contrast')).toBeDefined();
    });

    const closeBtn = screen.getByLabelText('Close settings');
    fireEvent.click(closeBtn);
    expect(mockOnClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockOnClose).toHaveBeenCalledTimes(2);
  });

  it('triggers onOpenPlaybookStudio and onClose when clicking Open Playbook Studio shortcut in Research Playbooks tab', async () => {
    const mockOpenStudio = vi.fn();
    renderWithTheme(
      <SettingsModal
        onClose={mockOnClose}
        showToast={mockShowToast}
        onOpenPlaybookStudio={mockOpenStudio}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Color Palette & Contrast')).toBeDefined();
    });

    const playbooksTab = screen.getByRole('tab', { name: /Research Playbooks/i });
    fireEvent.click(playbooksTab);

    const openStudioBtn = await screen.findByRole('button', { name: /Open Playbook Studio/i });
    fireEvent.click(openStudioBtn);

    expect(mockOpenStudio).toHaveBeenCalledTimes(1);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});

describe('Card Taxonomy Management in Platform Preferences', () => {
  const mockOnClose = vi.fn();
  const mockShowToast = vi.fn();

  const renderWithTheme = (ui: React.ReactElement) => {
    return render(<ThemeProvider defaultTheme="dark">{ui}</ThemeProvider>);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the Card Taxonomy section with pre-seeded 7 default types and active count', async () => {
    renderWithTheme(<SettingsModal onClose={mockOnClose} showToast={mockShowToast} />);

    await waitFor(() => {
      expect(screen.getByText('Card Taxonomy')).toBeDefined();
      expect(screen.getByText('7 / 20 active types')).toBeDefined();
    });

    for (const t of ['tool', 'product', 'company', 'article', 'idea', 'repo', 'paper']) {
      expect(screen.getByText(t)).toBeDefined();
    }
    // Immutable fallback chip
    expect(screen.getByText('(fallback)')).toBeDefined();
  });

  it('allows adding a new card type and updates active count', async () => {
    renderWithTheme(<SettingsModal onClose={mockOnClose} showToast={mockShowToast} />);

    await waitFor(() => {
      expect(screen.getByText('7 / 20 active types')).toBeDefined();
    });

    const input = screen.getByLabelText('New card type');
    fireEvent.change(input, { target: { value: 'framework' } });

    const addBtn = screen.getByRole('button', { name: /Add Type/i });
    expect(addBtn.hasAttribute('disabled')).toBe(false);

    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByText('8 / 20 active types')).toBeDefined();
      expect(screen.getByText('framework')).toBeDefined();
    });
  });

  it('allows removing a card type and updates active count', async () => {
    renderWithTheme(<SettingsModal onClose={mockOnClose} showToast={mockShowToast} />);

    await waitFor(() => {
      expect(screen.getByText('7 / 20 active types')).toBeDefined();
    });

    const removePaperBtn = screen.getByLabelText('Remove paper');
    fireEvent.click(removePaperBtn);

    await waitFor(() => {
      expect(screen.getByText('6 / 20 active types')).toBeDefined();
      expect(screen.queryByText('paper')).toBeNull();
    });
  });

  it('prevents adding duplicate card types or "other"', async () => {
    renderWithTheme(<SettingsModal onClose={mockOnClose} showToast={mockShowToast} />);

    await waitFor(() => {
      expect(screen.getByText('7 / 20 active types')).toBeDefined();
    });

    const input = screen.getByLabelText('New card type');
    const addBtn = screen.getByRole('button', { name: /Add Type/i });

    // Try adding "tool" (already exists)
    fireEvent.change(input, { target: { value: 'tool' } });
    expect(addBtn.hasAttribute('disabled')).toBe(true);

    // Try adding "other"
    fireEvent.change(input, { target: { value: 'other' } });
    expect(addBtn.hasAttribute('disabled')).toBe(true);
  });

  it('displays an impact confirmation modal listing affected playbooks when deleting a referenced card type, and cancels cleanly', async () => {
    vi.mocked(api.fetchPlaybooks).mockResolvedValueOnce([
      {
        id: 10,
        name: 'Deep Repo Audit',
        description: 'Audits open source repositories',
        is_builtin: false,
        card_types: ['repo', 'tool'],
        version: 1,
        steps: [],
      },
      {
        id: 11,
        name: 'Academic Literature Review',
        description: 'Reviews papers',
        is_builtin: false,
        card_types: ['paper'],
        version: 1,
        steps: [],
      },
      {
        id: 12,
        name: 'DevTool Landscape',
        description: 'Compares developer tools and repos',
        is_builtin: false,
        card_types: ['repo'],
        version: 2,
        steps: [],
      },
    ]);

    renderWithTheme(<SettingsModal onClose={mockOnClose} showToast={mockShowToast} />);

    await waitFor(() => {
      expect(screen.getByText('7 / 20 active types')).toBeDefined();
    });

    // Click delete on 'repo', which is referenced by 2 playbooks
    const removeRepoBtn = screen.getByLabelText('Remove repo');
    fireEvent.click(removeRepoBtn);

    // Impact confirmation modal should appear and list only the 2 affected playbooks
    await waitFor(() => {
      expect(screen.getByText(/Deep Repo Audit/i)).toBeDefined();
      expect(screen.getByText(/DevTool Landscape/i)).toBeDefined();
    });
    expect(screen.queryByText(/Academic Literature Review/i)).toBeNull();

    // Modal offers 'Detach from Playbooks (Default)' and 'Cancel'
    const impactModal = screen.getByTestId('taxonomy-impact-modal');
    expect(within(impactModal).getByRole('button', { name: /Detach from Playbooks \(Default\)/i })).toBeDefined();
    const cancelBtn = within(impactModal).getByRole('button', { name: /^Cancel$/i });

    // Card type should still be present before confirmation
    expect(screen.getByText('7 / 20 active types')).toBeDefined();

    // Clicking Cancel closes the impact modal and leaves 'repo' intact
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('taxonomy-impact-modal')).toBeNull();
    });
    expect(screen.getByText('7 / 20 active types')).toBeDefined();
    expect(api.updatePlaybook).not.toHaveBeenCalled();
  });

  it('dispatches batch updatePlaybook calls and updates settings when confirming Detach from Playbooks (Default) without deleting playbooks', async () => {
    const repoPlaybook1 = {
      id: 10,
      name: 'Deep Repo Audit',
      description: 'Audits open source repositories',
      is_builtin: false,
      card_types: ['repo', 'tool'],
      version: 1,
      steps: [{ position: 1, kind: 'custom', name: 'Step 1', enabled: true, config: {} }],
    };
    const paperPlaybook = {
      id: 11,
      name: 'Academic Literature Review',
      description: 'Reviews papers',
      is_builtin: false,
      card_types: ['paper'],
      version: 1,
      steps: [],
    };
    const repoPlaybook2 = {
      id: 12,
      name: 'DevTool Landscape',
      description: 'Compares developer tools and repos',
      is_builtin: false,
      card_types: ['repo'],
      version: 2,
      steps: [],
    };

    vi.mocked(api.fetchPlaybooks).mockResolvedValueOnce([
      repoPlaybook1,
      paperPlaybook,
      repoPlaybook2,
    ]);

    renderWithTheme(<SettingsModal onClose={mockOnClose} showToast={mockShowToast} />);

    await waitFor(() => {
      expect(screen.getByText('7 / 20 active types')).toBeDefined();
    });

    // Click delete on 'repo'
    fireEvent.click(screen.getByLabelText('Remove repo'));

    const impactModal = await screen.findByTestId('taxonomy-impact-modal');
    const detachBtn = within(impactModal).getByRole('button', {
      name: /Detach from Playbooks \(Default\)/i,
    });

    fireEvent.click(detachBtn);

    await waitFor(() => {
      expect(api.updatePlaybook).toHaveBeenCalledTimes(2);
    });

    expect(api.updatePlaybook).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        id: 10,
        name: 'Deep Repo Audit',
        card_types: ['tool'],
      })
    );
    expect(api.updatePlaybook).toHaveBeenCalledWith(
      12,
      expect.objectContaining({
        id: 12,
        name: 'DevTool Landscape',
        card_types: [],
      })
    );
    expect(api.deletePlaybook).not.toHaveBeenCalled();

    // Settings updated with 'repo' removed
    expect(api.patchSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        card_types: ['tool', 'product', 'company', 'article', 'idea', 'paper'],
      })
    );

    // Impact modal closes and active card types count updates to 6 / 20
    await waitFor(() => {
      expect(screen.queryByTestId('taxonomy-impact-modal')).toBeNull();
      expect(screen.getByText('6 / 20 active types')).toBeDefined();
      expect(screen.queryByLabelText('Remove repo')).toBeNull();
    });
  });
});


