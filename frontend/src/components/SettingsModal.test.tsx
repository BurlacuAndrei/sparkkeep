import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { SettingsModal } from './SettingsModal';
import { ThemeProvider } from '../context/ThemeContext';
import { LocaleProvider } from '../i18n';

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
        llm_token_caps: {},
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
    return render(
      <ThemeProvider defaultTheme="dark">
        <LocaleProvider locale="en">{ui}</LocaleProvider>
      </ThemeProvider>
    );
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

    // Check all 7 sidebar navigation tabs are present (new order: Integrations moved to 3rd)
    const tabs = [
      'Appearance & Preferences',
      'About me',
      'Integrations',
      'AI Engine',
      'Scheduled Research',
      'Channels & Alerts',
      'Security & Access',
    ];

    for (const tab of tabs) {
      expect(screen.getByRole('tab', { name: new RegExp(tab, 'i') })).toBeDefined();
    }

    // Verify Research Playbooks is not present in Settings sidebar tabs
    expect(screen.queryByRole('tab', { name: /Research Playbooks/i })).toBeNull();
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

  it('does not display Research Playbooks tab in SettingsModal sidebar', async () => {
    renderWithTheme(
      <SettingsModal
        onClose={mockOnClose}
        showToast={mockShowToast}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Color Palette & Contrast')).toBeDefined();
    });

    expect(screen.queryByRole('tab', { name: /Research Playbooks/i })).toBeNull();
  });
});

describe('SettingsModal Romanian locale', () => {
  const mockOnClose = vi.fn();
  const mockShowToast = vi.fn();

  const renderRo = () =>
    render(
      <ThemeProvider defaultTheme="dark">
        <LocaleProvider locale="ro">
          <SettingsModal onClose={mockOnClose} showToast={mockShowToast} />
        </LocaleProvider>
      </ThemeProvider>
    );

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders translated modal chrome and appearance tab in Romanian', async () => {
    renderRo();

    await waitFor(() => {
      expect(screen.getByText('Paletă de culori și contrast')).toBeDefined();
    });

    expect(screen.getByText('Preferințele platformei')).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Aspect și preferințe' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Despre mine' })).toBeDefined();
    expect(screen.getByLabelText('Limba interfeței')).toBeDefined();
    expect(screen.getByText('Susține proiectul')).toBeDefined();
  });

  it('renders translated profile tab labels in Romanian', async () => {
    renderRo();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Despre mine' })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Despre mine' }));

    await waitFor(() => {
      expect(screen.getByText('Potrivire personală și despre mine')).toBeDefined();
    });
    expect(screen.getByText('Bugetul de caractere al profilului')).toBeDefined();
    expect(screen.getByLabelText(/Instrumente, platforme și sisteme/i)).toBeDefined();
  });
});

describe('Card Taxonomy Management in Platform Preferences', () => {
  const mockOnClose = vi.fn();
  const mockShowToast = vi.fn();

  const renderWithTheme = (ui: React.ReactElement) => {
    return render(
      <ThemeProvider defaultTheme="dark">
        <LocaleProvider locale="en">{ui}</LocaleProvider>
      </ThemeProvider>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the Card Taxonomy section with pre-seeded 8 default types and active count', async () => {
    renderWithTheme(<SettingsModal onClose={mockOnClose} showToast={mockShowToast} />);

    await waitFor(() => {
      expect(screen.getByText('Card Taxonomy')).toBeDefined();
      expect(screen.getByText('8 / 20 active types')).toBeDefined();
    });

    for (const t of ['article', 'video', 'book', 'guide', 'product', 'place', 'idea', 'quote']) {
      expect(screen.getByText(t)).toBeDefined();
    }
    // Immutable fallback chip
    expect(screen.getByText('(fallback)')).toBeDefined();
  });

  it('allows adding a new card type and updates active count', async () => {
    renderWithTheme(<SettingsModal onClose={mockOnClose} showToast={mockShowToast} />);

    await waitFor(() => {
      expect(screen.getByText('8 / 20 active types')).toBeDefined();
    });

    const input = screen.getByLabelText('New card type');
    fireEvent.change(input, { target: { value: 'framework' } });

    const addBtn = screen.getByRole('button', { name: /Add Type/i });
    expect(addBtn.hasAttribute('disabled')).toBe(false);

    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByText('9 / 20 active types')).toBeDefined();
      expect(screen.getByText('framework')).toBeDefined();
    });
  });

  it('allows removing a card type and updates active count', async () => {
    renderWithTheme(<SettingsModal onClose={mockOnClose} showToast={mockShowToast} />);

    await waitFor(() => {
      expect(screen.getByText('8 / 20 active types')).toBeDefined();
    });

    const removeQuoteBtn = screen.getByLabelText('Remove quote');
    fireEvent.click(removeQuoteBtn);

    await waitFor(() => {
      expect(screen.getByText('7 / 20 active types')).toBeDefined();
      expect(screen.queryByText('quote')).toBeNull();
    });
  });

  it('prevents adding duplicate card types or "other"', async () => {
    renderWithTheme(<SettingsModal onClose={mockOnClose} showToast={mockShowToast} />);

    await waitFor(() => {
      expect(screen.getByText('8 / 20 active types')).toBeDefined();
    });

    const input = screen.getByLabelText('New card type');
    const addBtn = screen.getByRole('button', { name: /Add Type/i });

    // Try adding "article" (already exists)
    fireEvent.change(input, { target: { value: 'article' } });
    expect(addBtn.hasAttribute('disabled')).toBe(true);

    // Try adding "other"
    fireEvent.change(input, { target: { value: 'other' } });
    expect(addBtn.hasAttribute('disabled')).toBe(true);
  });

  it('displays an impact confirmation modal listing affected playbooks when deleting a referenced card type, and cancels cleanly', async () => {
    vi.mocked(api.fetchPlaybooks).mockResolvedValueOnce([
      {
        id: 10,
        name: 'Deep Research Guide',
        description: 'Audits guides and workflows',
        is_builtin: false,
        card_types: ['guide', 'product'],
        version: 1,
        steps: [],
      },
      {
        id: 11,
        name: 'Book Reading Pipeline',
        description: 'Reviews books',
        is_builtin: false,
        card_types: ['book'],
        version: 1,
        steps: [],
      },
      {
        id: 12,
        name: 'Cooking Guide',
        description: 'Processes kitchen guides and recipes',
        is_builtin: false,
        card_types: ['guide'],
        version: 2,
        steps: [],
      },
    ]);

    renderWithTheme(<SettingsModal onClose={mockOnClose} showToast={mockShowToast} />);

    await waitFor(() => {
      expect(screen.getByText('8 / 20 active types')).toBeDefined();
    });

    // Click delete on 'guide', which is referenced by 2 playbooks
    const removeGuideBtn = screen.getByLabelText('Remove guide');
    fireEvent.click(removeGuideBtn);

    // Impact confirmation modal should appear and list only the 2 affected playbooks
    await waitFor(() => {
      expect(screen.getByText(/Deep Research Guide/i)).toBeDefined();
      expect(screen.getByText(/Cooking Guide/i)).toBeDefined();
    });
    expect(screen.queryByText(/Book Reading Pipeline/i)).toBeNull();

    // Modal offers 'Detach from Playbooks (Default)' and 'Cancel'
    const impactModal = screen.getByTestId('taxonomy-impact-modal');
    expect(within(impactModal).getByRole('button', { name: /Detach from Playbooks \(Default\)/i })).toBeDefined();
    const cancelBtn = within(impactModal).getByRole('button', { name: /^Cancel$/i });

    // Card type should still be present before confirmation
    expect(screen.getByText('8 / 20 active types')).toBeDefined();

    // Clicking Cancel closes the impact modal and leaves 'guide' intact
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('taxonomy-impact-modal')).toBeNull();
    });
    expect(screen.getByText('8 / 20 active types')).toBeDefined();
    expect(api.updatePlaybook).not.toHaveBeenCalled();
  });

  it('dispatches batch updatePlaybook calls and updates settings when confirming Detach from Playbooks (Default) without deleting playbooks', async () => {
    const guidePlaybook1 = {
      id: 10,
      name: 'Deep Research Guide',
      description: 'Audits guides and workflows',
      is_builtin: false,
      card_types: ['guide', 'product'],
      version: 1,
      steps: [{ position: 1, kind: 'custom', name: 'Step 1', enabled: true, config: {} }],
    };
    const bookPlaybook = {
      id: 11,
      name: 'Book Reading Pipeline',
      description: 'Reviews books',
      is_builtin: false,
      card_types: ['book'],
      version: 1,
      steps: [],
    };
    const guidePlaybook2 = {
      id: 12,
      name: 'Cooking Guide',
      description: 'Processes kitchen guides and recipes',
      is_builtin: false,
      card_types: ['guide'],
      version: 2,
      steps: [],
    };

    vi.mocked(api.fetchPlaybooks).mockResolvedValueOnce([
      guidePlaybook1,
      bookPlaybook,
      guidePlaybook2,
    ]);

    renderWithTheme(<SettingsModal onClose={mockOnClose} showToast={mockShowToast} />);

    await waitFor(() => {
      expect(screen.getByText('8 / 20 active types')).toBeDefined();
    });

    // Click delete on 'guide'
    fireEvent.click(screen.getByLabelText('Remove guide'));

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
        name: 'Deep Research Guide',
        card_types: ['product'],
      })
    );
    expect(api.updatePlaybook).toHaveBeenCalledWith(
      12,
      expect.objectContaining({
        id: 12,
        name: 'Cooking Guide',
        card_types: [],
      })
    );
    expect(api.deletePlaybook).not.toHaveBeenCalled();

    // Settings updated with 'guide' removed
    expect(api.patchSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        card_types: ['article', 'video', 'book', 'product', 'place', 'idea', 'quote'],
      })
    );

    // Impact modal closes and active card types count updates to 7 / 20
    await waitFor(() => {
      expect(screen.queryByTestId('taxonomy-impact-modal')).toBeNull();
      expect(screen.getByText('7 / 20 active types')).toBeDefined();
      expect(screen.queryByLabelText('Remove guide')).toBeNull();
    });
  });

  it('updates data-reduce-motion and persists to localStorage on save', async () => {
    document.documentElement.removeAttribute('data-reduce-motion');
    localStorage.clear();

    render(
      <LocaleProvider locale="en">
        <ThemeProvider>
          <SettingsModal onClose={() => {}} showToast={() => {}} />
        </ThemeProvider>
      </LocaleProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Platform Preferences')).toBeDefined();
    });

    const motionSelect = screen.getByLabelText('Visual effects') as HTMLSelectElement;
    expect(motionSelect.value).toBe('default');

    fireEvent.change(motionSelect, { target: { value: 'reduced' } });
    expect(motionSelect.value).toBe('reduced');

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-reduce-motion')).toBe('reduced');
      expect(localStorage.getItem('sparkkeep_reduce_motion')).toBe('reduced');
    });
  });

  it('automatically updates aligned Output Language on interface locale change with 1-click undo', async () => {
    const showToast = vi.fn();
    render(
      <LocaleProvider locale="en">
        <ThemeProvider>
          <SettingsModal onClose={() => {}} showToast={showToast} />
        </ThemeProvider>
      </LocaleProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Platform Preferences')).toBeDefined();
    });

    const langSelect = screen.getByLabelText('Interface language') as HTMLSelectElement;
    expect(langSelect.value).toBe('en');

    await act(async () => {
      fireEvent.change(langSelect, { target: { value: 'de' } });
    });

    await waitFor(() => {
      expect(api.patchSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          interface_locale: 'de',
          user_profile: expect.objectContaining({
            language: 'German',
          }),
        })
      );
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining('German'),
        expect.any(Function)
      );
    });

    // Invoke undo
    const undoCallback = showToast.mock.calls[0][1];
    await act(async () => {
      await undoCallback();
    });

    await waitFor(() => {
      expect(api.patchSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          user_profile: expect.objectContaining({
            language: 'English',
          }),
        })
      );
    });
  });

  it('preserves decoupled Output Language on interface locale change and offers 1-click switch action', async () => {
    vi.mocked(api.getSettings).mockResolvedValueOnce({
      ok: true,
      settings: {
        has_auth_token: false,
        has_llm_key: false,
        llm_model: 'gpt-4o',
        llm_profiles: [],
        llm_roles: {},
        llm_token_caps: {},
        user_profile: {
          goals: 'Custom',
          skills: [],
          stack: [],
          interests: [],
          constraints: '',
          language: 'Spanish', // Decoupled: Spanish while interface is en
        },
      },
    });

    const showToast = vi.fn();
    render(
      <LocaleProvider locale="en">
        <ThemeProvider>
          <SettingsModal onClose={() => {}} showToast={showToast} />
        </ThemeProvider>
      </LocaleProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Platform Preferences')).toBeDefined();
    });

    const langSelect = screen.getByLabelText('Interface language') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(langSelect, { target: { value: 'de' } });
    });

    await waitFor(() => {
      // interface_locale is patched, but user_profile is NOT updated to German
      expect(api.patchSettings).toHaveBeenCalledWith({
        interface_locale: 'de',
      });
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining('German'),
        expect.objectContaining({
          actionLabel: expect.stringContaining('German'),
          onAction: expect.any(Function),
        })
      );
    });

    // Invoke 1-click switch action
    const toastOpts = showToast.mock.calls[0][1];
    await act(async () => {
      await toastOpts.onAction();
    });

    await waitFor(() => {
      expect(api.patchSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          user_profile: expect.objectContaining({
            language: 'German',
          }),
        })
      );
    });
  });
});



