import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DigestView } from './DigestView';
import { computeMomentumPulse } from '../utils/momentumPulse';
import { LocaleProvider } from '../i18n';
import { ThemeProvider } from '../context/ThemeContext';
import { CardActionsProvider } from '../context/CardActionsContext';
import { Card, DigestData } from '../types';
import * as api from '../api';

const renderLocalized = (ui: React.ReactElement) =>
  render(<LocaleProvider locale="en">{ui}</LocaleProvider>);

const originalIsSecureContext = window.isSecureContext;

function stubClipboard(writeText: ReturnType<typeof vi.fn>, secureContext: boolean) {
  Object.defineProperty(window, 'isSecureContext', {
    configurable: true,
    writable: true,
    value: secureContext,
  });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value: { writeText },
  });
}

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    pushDigestToChannel: vi.fn().mockResolvedValue({ ok: true, message: 'Digest successfully sent to configured channels!' }),
    fetchDigest: vi.fn().mockResolvedValue({ ok: true, week_total: 0, prev_total: 0, by_status: {}, by_horizon: {}, weekly_wins: [], research_harvest: [], days: [] }),
    synthesizeDigest: vi.fn().mockResolvedValue({
      ok: true,
      briefing: 'Generated AI Briefing',
      wins_narrative: 'Generated AI Wins Narrative',
      themes: [],
      next_focus: [
        { card_id: 101, title: 'AI Spark Focus', reason: 'Critical initiative', priority: 'high' },
      ],
      model: 'gpt-4o',
      generated_at: '2026-10-25T12:00:00Z',
    }),
    patchCard: vi.fn().mockResolvedValue({ ok: true }),
    updateCard: vi.fn().mockResolvedValue({ ok: true }),
    batchShelveStale: vi.fn().mockResolvedValue({ ok: true, shelved_count: 2 }),
    fetchCardResearch: vi.fn().mockResolvedValue(null),
    listChannels: vi.fn().mockResolvedValue({
      ok: true,
      channels: [
        { id: 'telegram', name: 'Telegram', enabled: true },
        { id: 'discord', name: 'Discord', enabled: true },
        { id: 'slack', name: 'Slack', enabled: false },
      ],
    }),
  };
});

describe('DigestView', () => {
  let downloads: string[] = [];
  let blobs: Blob[] = [];
  let originalCreateObjectURL: typeof URL.createObjectURL | undefined;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    downloads = [];
    blobs = [];
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: (obj: Blob) => {
        blobs.push(obj);
        return 'blob:mock-url';
      },
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: () => undefined,
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1400,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore the URL stubs so deferred revokes from downloadMarkdown hit the real implementation.
    if (originalCreateObjectURL) {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        writable: true,
        value: originalCreateObjectURL,
      });
    }
    if (originalRevokeObjectURL) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        writable: true,
        value: originalRevokeObjectURL,
      });
    }
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      writable: true,
      value: originalIsSecureContext,
    });
    delete (navigator as unknown as { clipboard?: Clipboard }).clipboard;
  });

  const dummyProps = {
    onSelectCard: vi.fn(),
    onStatusChange: vi.fn(),
    onResearch: vi.fn(),
    onRetry: vi.fn(),
    showToast: vi.fn(),
    onRefresh: vi.fn(),
  };

  const dummyCardActions = {
    onSelectCard: vi.fn(),
    onStatusChange: vi.fn(),
    onResearch: vi.fn(),
    onRetry: vi.fn(),
    showToast: vi.fn(),
  };

  const mockPopulatedDigest: DigestData = {
    ok: true,
    week_total: 1,
    prev_total: 8,
    wow_delta_percent: 50,
    by_status: { done: 1, inbox: 0 },
    by_horizon: { 'short-term': 1 },
    weekly_wins: [],
    research_harvest: [
      {
        id: 101,
        title: 'Quantum Computing Architecture',
        research_verdict: 'pursue',
      } as unknown as Card,
    ],
    days: [
      {
        date: '2026-10-14',
        cards: [
          {
            id: 101,
            title: 'Quantum Computing Architecture',
            summary: 'Summary of quantum advances',
            status: 'done',
            created_at: '2026-10-14T05:00:00Z',
            source_url: 'https://example.com/quantum',
          } as unknown as Card,
        ],
      },
    ],
  };

  it('renders empty state cleanly in Light mode', async () => {
    renderLocalized(
      <ThemeProvider defaultTheme="light">
        <DigestView digest={null} {...dummyProps} />
      </ThemeProvider>
    );

    expect(screen.getByText('No captures in this window')).toBeDefined();
    expect(screen.getByText(/Sparks captured during the selected/i)).toBeDefined();
    await waitFor(() => expect(api.fetchDigest).toHaveBeenCalled());
    await waitFor(() => expect(api.listChannels).toHaveBeenCalled());
  });

  it('renders populated digest with title, KPI metrics, and themes in Light mode', async () => {
    renderLocalized(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={mockPopulatedDigest} {...dummyProps} />
        </CardActionsProvider>
      </ThemeProvider>
    );
    await waitFor(() => expect(api.listChannels).toHaveBeenCalled());

    // Title should be present
    const heading = screen.getByRole('heading', { level: 1, name: /Weekly Intelligence Digest/i });
    expect(heading).toBeDefined();
    expect(heading.className).toContain('digest-title');

    // KPI values
    expect(screen.getByText('Total Sparks')).toBeDefined();
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
    expect(screen.getByText('Triage Clearance')).toBeDefined();
    expect(screen.getByText('Weekly Wins')).toBeDefined();
  });

  it('renders "Send to Integrations" button instead of hardcoded Telegram button', async () => {
    renderLocalized(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={mockPopulatedDigest} {...dummyProps} />
        </CardActionsProvider>
      </ThemeProvider>
    );
    await waitFor(() => expect(api.listChannels).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: /Send to Integrations/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Send to Telegram$/i })).toBeNull();
  });

  it('dispatches digest to all integrations when main button is clicked', async () => {
    const showToast = vi.fn();
    renderLocalized(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={mockPopulatedDigest} {...dummyProps} showToast={showToast} />
        </CardActionsProvider>
      </ThemeProvider>
    );

    const sendBtn = screen.getByRole('button', { name: /Send to Integrations/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(api.pushDigestToChannel).toHaveBeenCalledWith('all', 7);
      expect(showToast).toHaveBeenCalledWith('Digest successfully sent to configured channels!');
    });
  });

  it('opens integration selection dropdown when chevron is clicked, displaying channels', async () => {
    renderLocalized(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={mockPopulatedDigest} {...dummyProps} />
        </CardActionsProvider>
      </ThemeProvider>
    );
    await waitFor(() => expect(api.listChannels).toHaveBeenCalled());

    const chevronBtn = screen.getByRole('button', { name: /Select integration channel/i });
    fireEvent.click(chevronBtn);

    expect(screen.getByRole('menu')).toBeDefined();
    expect(screen.getByText(/All Integrations/i)).toBeDefined();
    expect(screen.getByText(/Telegram Bot/i)).toBeDefined();
    expect(screen.getByText(/Discord Bot/i)).toBeDefined();
    expect(screen.getByText(/Slack Webhook/i)).toBeDefined();
  });

  it('dispatches to specific channel (Discord) when chosen from menu and updates main button', async () => {
    (api.pushDigestToChannel as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      message: 'Digest successfully sent to discord!',
    });

    const showToast = vi.fn();
    renderLocalized(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={mockPopulatedDigest} {...dummyProps} showToast={showToast} />
        </CardActionsProvider>
      </ThemeProvider>
    );

    const chevronBtn = screen.getByRole('button', { name: /Select integration channel/i });
    fireEvent.click(chevronBtn);

    const discordItem = screen.getByText(/Discord Bot/i);
    fireEvent.click(discordItem);

    await waitFor(() => {
      expect(api.pushDigestToChannel).toHaveBeenCalledWith('discord', 7);
      expect(showToast).toHaveBeenCalledWith('Digest successfully sent to discord!');
    });

    // The button should now reflect the selected channel
    expect(screen.getByRole('button', { name: /Send to Discord/i })).toBeDefined();
    expect(localStorage.getItem('sparkkeep_digest_channel')).toBe('discord');
  });

  it('closes channel menu on Escape key', async () => {
    renderLocalized(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={mockPopulatedDigest} {...dummyProps} />
        </CardActionsProvider>
      </ThemeProvider>
    );
    await waitFor(() => expect(api.listChannels).toHaveBeenCalled());

    const chevronBtn = screen.getByRole('button', { name: /Select integration channel/i });
    fireEvent.click(chevronBtn);
    expect(screen.getByRole('menu')).toBeDefined();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('respects selected time window when pushing digest to channel', async () => {
    (api.fetchDigest as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockPopulatedDigest);

    renderLocalized(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={mockPopulatedDigest} {...dummyProps} />
        </CardActionsProvider>
      </ThemeProvider>
    );

    const pill14 = screen.getByRole('radio', { name: '14d' });
    fireEvent.click(pill14);

    const sendBtn = await waitFor(() => screen.getByRole('button', { name: /Send to Integrations/i }));
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(api.pushDigestToChannel).toHaveBeenCalledWith('all', 14);
    });
  });

  const renderDigestView = async (showToast: (msg: string) => void = vi.fn()) => {
    const utils = renderLocalized(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={mockPopulatedDigest} {...dummyProps} showToast={showToast} />
        </CardActionsProvider>
      </ThemeProvider>
    );
    await waitFor(() => expect(api.listChannels).toHaveBeenCalled());
    return utils;
  };

  const FILENAME_PATTERN = /^sparkkeep-digest-\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}\.md$/;

  it('copies the Markdown digest from the primary action when the clipboard is available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText, true);
    const showToast = vi.fn();

    await renderDigestView(showToast);
    fireEvent.click(screen.getByRole('button', { name: /Export Markdown/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    expect(writeText.mock.calls[0][0]).toContain('# 📊 Sparkkeep Intelligence Digest');
    expect(showToast).toHaveBeenCalledWith('📋 Markdown digest copied to clipboard!');
    expect(downloads).toEqual([]);
  });

  it('exports Romanian headings and body when the UI locale is Romanian', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText, true);

    render(
      <LocaleProvider locale="ro">
        <ThemeProvider defaultTheme="light">
          <CardActionsProvider value={dummyCardActions}>
            <DigestView digest={mockPopulatedDigest} {...dummyProps} showToast={vi.fn()} />
          </CardActionsProvider>
        </ThemeProvider>
      </LocaleProvider>
    );
    await waitFor(() => expect(api.listChannels).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Exportă Markdown/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const markdown = writeText.mock.calls[0][0] as string;
    expect(markdown).toContain('# 📊 Rezumat de inteligență Sparkkeep');
    expect(markdown).toContain('**Perioadă:**');
    expect(markdown).toContain('**Total scântei:**');
    expect(markdown).toContain('## ⚡ Briefing executiv');
  });

  it('exports DONE / FINALIZATĂ for harvest cards without a verdict', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText, true);
    const digestNoVerdict = {
      ...mockPopulatedDigest,
      research_harvest: [{ id: 202, title: 'Harvest Without Verdict' } as unknown as Card],
    };

    const english = render(
      <LocaleProvider locale="en">
        <ThemeProvider defaultTheme="light">
          <CardActionsProvider value={dummyCardActions}>
            <DigestView digest={digestNoVerdict} {...dummyProps} showToast={vi.fn()} />
          </CardActionsProvider>
        </ThemeProvider>
      </LocaleProvider>
    );
    await waitFor(() => expect(api.listChannels).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Export Markdown/i }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    expect(writeText.mock.calls[0][0]).toContain('**DONE**');
    english.unmount();

    writeText.mockClear();
    render(
      <LocaleProvider locale="ro">
        <ThemeProvider defaultTheme="light">
          <CardActionsProvider value={dummyCardActions}>
            <DigestView digest={digestNoVerdict} {...dummyProps} showToast={vi.fn()} />
          </CardActionsProvider>
        </ThemeProvider>
      </LocaleProvider>
    );
    await waitFor(() => expect(api.listChannels).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Exportă Markdown/i }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    expect(writeText.mock.calls[0][0]).toContain('**FINALIZATĂ**');
  });

  it('downloads a .md file from the primary action when the clipboard is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText, false);
    const showToast = vi.fn();

    await renderDigestView(showToast);
    fireEvent.click(screen.getByRole('button', { name: /Download Markdown/i }));

    await waitFor(() => {
      expect(downloads).toHaveLength(1);
    });
    expect(downloads[0]).toMatch(FILENAME_PATTERN);
    expect(blobs).toHaveLength(1);
    expect(await blobs[0].text()).toContain('# 📊 Sparkkeep Intelligence Digest');
    expect(writeText).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining(downloads[0]));
  });

  it('labels the primary action "Download Markdown" when the clipboard is unavailable', async () => {
    stubClipboard(vi.fn(), false);

    await renderDigestView();

    expect(screen.getByRole('button', { name: 'Download Markdown' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Export Markdown' })).toBeNull();
  });

  it('shows a failure toast suggesting download when the clipboard write rejects', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')), true);
    const showToast = vi.fn();

    await renderDigestView(showToast);
    fireEvent.click(screen.getByRole('button', { name: /Export Markdown/i }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Download .md file'));
    });
    expect(downloads).toEqual([]);
  });

  it('shows a failure toast when the clipboard write throws synchronously', async () => {
    stubClipboard(
      vi.fn(() => {
        throw new Error('clipboard vanished');
      }),
      true
    );
    const showToast = vi.fn();

    await renderDigestView(showToast);
    fireEvent.click(screen.getByRole('button', { name: /Export Markdown/i }));

    expect(showToast).toHaveBeenCalledWith(
      'Could not copy to clipboard. Use Download .md file instead.'
    );
  });

  it('falls back to hidden textarea copy when clipboard write fails but execCommand succeeds', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('clipboard rejected')), true);
    const execCommandMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      writable: true,
      value: execCommandMock,
    });
    const showToast = vi.fn();

    await renderDigestView(showToast);
    fireEvent.click(screen.getByRole('button', { name: /Export Markdown/i }));

    await waitFor(() => {
      expect(execCommandMock).toHaveBeenCalledWith('copy');
      expect(showToast).toHaveBeenCalledWith('📋 Markdown digest copied to clipboard!');
    });
    expect(downloads).toEqual([]);
    delete (document as unknown as { execCommand?: unknown }).execCommand;
  });

  it('falls back to downloading markdown file in non-secure context when execCommand is also unavailable', async () => {
    stubClipboard(vi.fn(), false);
    const execCommandMock = vi.fn().mockReturnValue(false);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      writable: true,
      value: execCommandMock,
    });
    const showToast = vi.fn();

    await renderDigestView(showToast);
    fireEvent.click(screen.getByRole('button', { name: /Download Markdown/i }));

    await waitFor(() => {
      expect(downloads).toHaveLength(1);
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining(downloads[0]));
    });
    delete (document as unknown as { execCommand?: unknown }).execCommand;
  });

  it('lists copy and download actions in the export menu, disabling copy without a clipboard', async () => {
    stubClipboard(vi.fn(), false);

    await renderDigestView();
    fireEvent.click(screen.getByRole('button', { name: /More export options/i }));

    expect(screen.getByRole('menu')).toBeDefined();
    const copyItem = screen.getByRole('menuitem', { name: /Copy to clipboard/i }) as HTMLButtonElement;
    const downloadItem = screen.getByRole('menuitem', { name: /Download \.md file/i }) as HTMLButtonElement;
    expect(copyItem.disabled).toBe(true);
    expect(copyItem.title).toContain('secure');
    // Reason must be visible text, not only the title attribute
    expect(screen.getByText(/Requires HTTPS connection/)).toBeDefined();
    expect(downloadItem.disabled).toBe(false);
  });

  it('renders dual-action split button with Copy to Clipboard and Download Markdown options in dropdown', async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined), true);

    await renderDigestView();
    const arrowBtn = screen.getByRole('button', { name: /More export options/i });
    fireEvent.click(arrowBtn);

    expect(screen.getByRole('menuitem', { name: /Copy to clipboard/i })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: /Download \.md file/i })).toBeDefined();
  });

  it('skips the disabled copy item when roving focus in an insecure context', async () => {
    stubClipboard(vi.fn(), false);

    await renderDigestView();
    fireEvent.click(screen.getByRole('button', { name: /More export options/i }));

    const copyItem = screen.getByRole('menuitem', { name: /Copy to clipboard/i });
    const downloadItem = screen.getByRole('menuitem', { name: /Download \.md file/i });
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });

    expect(document.activeElement).toBe(downloadItem);
    expect(document.activeElement).not.toBe(copyItem);
  });

  it('closes the export menu on outside mousedown', async () => {
    stubClipboard(vi.fn(), true);

    await renderDigestView();
    fireEvent.click(screen.getByRole('button', { name: /More export options/i }));
    expect(screen.getByRole('menu')).toBeDefined();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('moves focus between menuitems with ArrowDown and wraps around', async () => {
    stubClipboard(vi.fn(), true);

    await renderDigestView();
    fireEvent.click(screen.getByRole('button', { name: /More export options/i }));

    const copyItem = screen.getByRole('menuitem', { name: /Copy to clipboard/i });
    const downloadItem = screen.getByRole('menuitem', { name: /Download \.md file/i });

    copyItem.focus();
    fireEvent.keyDown(copyItem, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(downloadItem);

    fireEvent.keyDown(downloadItem, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(copyItem);

    fireEvent.keyDown(copyItem, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(downloadItem);
  });

  it('downloads from the menu action with a date-range filename', async () => {
    stubClipboard(vi.fn(), true);

    await renderDigestView();
    fireEvent.click(screen.getByRole('button', { name: /More export options/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Download \.md file/i }));

    await waitFor(() => {
      expect(downloads).toHaveLength(1);
    });
    expect(downloads[0]).toMatch(FILENAME_PATTERN);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes the export menu on Escape key and returns focus to the menu arrow', async () => {
    stubClipboard(vi.fn(), true);

    await renderDigestView();
    const arrowBtn = screen.getByRole('button', { name: /More export options/i });
    fireEvent.click(arrowBtn);
    expect(screen.getByRole('menu')).toBeDefined();

    screen.getByRole('menuitem', { name: /Download \.md file/i }).focus();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(arrowBtn);
  });

  it('does not steal focus when the export menu closes on outside mousedown', async () => {
    stubClipboard(vi.fn(), true);

    await renderDigestView();
    const arrowBtn = screen.getByRole('button', { name: /More export options/i });
    fireEvent.click(arrowBtn);
    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).not.toBe(arrowBtn);
  });

  it('dynamically adapts page title and delta badges via segmented pill switcher', async () => {
    (api.fetchDigest as ReturnType<typeof vi.fn>).mockImplementation((_days: number) => {
      return Promise.resolve({
        ...mockPopulatedDigest,
        week_total: 10,
        prev_total: 5,
        wow_delta_percent: 100,
        prev_wins: 2,
        completed_actions_count: 7,
        weekly_wins: [
          {
            id: 201,
            title: 'Widescreen Canvas Shipped',
            status: 'done',
            horizon: 'short-term',
          } as unknown as Card,
        ],
      });
    });

    renderLocalized(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={mockPopulatedDigest} {...dummyProps} />
        </CardActionsProvider>
      </ThemeProvider>
    );

    // Initial 7d title
    expect(screen.getByRole('heading', { level: 1, name: /Weekly Intelligence Digest/i })).toBeDefined();
    expect(screen.getByText(/\+50% vs prior 7d/i)).toBeDefined();

    // Switch to 14d via segmented pill
    const pill14 = screen.getByRole('radio', { name: '14d' });
    fireEvent.click(pill14);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /Biweekly Intelligence Digest/i })).toBeDefined();
      expect(screen.getByText(/\+100% vs prior 14d/i)).toBeDefined();
    });

    // Switch to 30d via segmented pill
    const pill30 = screen.getByRole('radio', { name: '30d' });
    fireEvent.click(pill30);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /Monthly Intelligence Digest/i })).toBeDefined();
      expect(screen.getByText(/\+100% vs prior 30d/i)).toBeDefined();
    });
  });

  it('switches time window with keyboard shortcuts 1, 2, and 3', async () => {
    (api.fetchDigest as ReturnType<typeof vi.fn>).mockResolvedValue(mockPopulatedDigest);

    renderLocalized(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={mockPopulatedDigest} {...dummyProps} />
        </CardActionsProvider>
      </ThemeProvider>
    );

    expect(screen.getByRole('heading', { level: 1, name: /Weekly Intelligence Digest/i })).toBeDefined();

    // Press '2'
    fireEvent.keyDown(window, { key: '2' });
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /Biweekly Intelligence Digest/i })).toBeDefined();
    });

    // Press '3'
    fireEvent.keyDown(window, { key: '3' });
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /Monthly Intelligence Digest/i })).toBeDefined();
    });

    // Press '1'
    fireEvent.keyDown(window, { key: '1' });
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /Weekly Intelligence Digest/i })).toBeDefined();
    });
  });

  it('renders Period Wins Showcase with won cards, rich badges, executed action steps, and win delta', async () => {
    const populatedWithWins: DigestData = {
      ...mockPopulatedDigest,
      weekly_wins: [
        {
          id: 301,
          title: 'Complete Feature Spec',
          status: 'done',
          horizon: 'short-term',
          type: 'architecture',
          research_verdict: 'pursue',
        } as unknown as Card,
      ],
      prev_wins: 0,
      completed_actions_count: 5,
    };

    renderLocalized(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={populatedWithWins} {...dummyProps} />
        </CardActionsProvider>
      </ThemeProvider>
    );

    expect(screen.getByText('Period Wins')).toBeDefined();
    expect(screen.getByText('Complete Feature Spec')).toBeDefined();
    expect(screen.getByText(/action steps executed/i)).toBeDefined();
    expect(screen.getByText(/\+1 vs prior 7d/i)).toBeDefined();
    expect(screen.getByText('Short-term')).toBeDefined();
    expect(screen.getAllByText(/Pursue/i).length).toBeGreaterThanOrEqual(1);
  });

  describe('computeMomentumPulse', () => {
    it('evaluates Execution Surge when doneCount >= 3 or clearance and actions are high', () => {
      expect(
        computeMomentumPulse({
          totalSparks: 5,
          clearanceRate: 80,
          doneCount: 3,
          completedActionsCount: 1,
          researchHarvestCount: 1,
        })
      ).toBe('execution_surge');

      expect(
        computeMomentumPulse({
          totalSparks: 5,
          clearanceRate: 75,
          doneCount: 2,
          completedActionsCount: 3,
          researchHarvestCount: 1,
        })
      ).toBe('execution_surge');
    });

    it('evaluates Research Deep-Dive when research harvest is high and exceeds done count', () => {
      expect(
        computeMomentumPulse({
          totalSparks: 5,
          clearanceRate: 50,
          doneCount: 1,
          completedActionsCount: 0,
          researchHarvestCount: 3,
        })
      ).toBe('research_deep_dive');
    });

    it('evaluates Balanced Flow when clearance >= 60 and progress is made', () => {
      expect(
        computeMomentumPulse({
          totalSparks: 5,
          clearanceRate: 65,
          doneCount: 1,
          completedActionsCount: 0,
          researchHarvestCount: 0,
        })
      ).toBe('balanced_flow');
    });

    it('evaluates Discovery & Capture when incoming sparks are high relative to clearance', () => {
      expect(
        computeMomentumPulse({
          totalSparks: 6,
          clearanceRate: 40,
          doneCount: 0,
          completedActionsCount: 0,
          researchHarvestCount: 0,
        })
      ).toBe('discovery_capture');
    });

    it('evaluates Quiet Horizon when no activity occurred', () => {
      expect(
        computeMomentumPulse({
          totalSparks: 0,
          clearanceRate: 100,
          doneCount: 0,
          completedActionsCount: 0,
          researchHarvestCount: 0,
        })
      ).toBe('quiet_horizon');
    });
  });

  it('renders Period Momentum Pulse banner with role status and localized text', async () => {
    const surgeDigest: DigestData = {
      ...mockPopulatedDigest,
      week_total: 5,
      by_status: { inbox: 1, done: 4 },
      weekly_wins: [
        { id: 1, title: 'Win 1', status: 'done', horizon: 'short-term' } as unknown as Card,
        { id: 2, title: 'Win 2', status: 'done', horizon: 'short-term' } as unknown as Card,
        { id: 3, title: 'Win 3', status: 'done', horizon: 'short-term' } as unknown as Card,
      ],
      completed_actions_count: 3,
    };

    renderLocalized(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={surgeDigest} {...dummyProps} />
        </CardActionsProvider>
      </ThemeProvider>
    );

    const banner = screen.getByRole('status', { name: /Execution Surge/i });
    expect(banner).toBeDefined();
    expect(banner.className).toContain('momentum-execution-surge');
    expect(screen.getByText(/High clearance velocity with strong closure/i)).toBeDefined();
  });

  it('copies Period Wins markdown summary to clipboard via 1-click Export Wins button', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText, true);
    const showToast = vi.fn();

    const populatedWithWins: DigestData = {
      ...mockPopulatedDigest,
      weekly_wins: [
        {
          id: 301,
          title: 'Complete Feature Spec',
          status: 'done',
          horizon: 'short-term',
          type: 'architecture',
          research_verdict: 'pursue',
          completed_actions: ['Write spec', 'Define API'],
        } as unknown as Card,
      ],
      completed_actions_count: 2,
    };

    renderLocalized(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={populatedWithWins} {...dummyProps} showToast={showToast} />
        </CardActionsProvider>
      </ThemeProvider>
    );

    const exportWinsBtn = screen.getByRole('button', { name: /Export Wins/i });
    expect(exportWinsBtn).toBeDefined();

    fireEvent.click(exportWinsBtn);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });

    const copiedMd = writeText.mock.calls[0][0] as string;
    expect(copiedMd).toContain('# 🏆 Period Wins');
    expect(copiedMd).toContain('Complete Feature Spec');
    expect(copiedMd).toContain('[x] Write spec');
    expect(copiedMd).toContain('[x] Define API');
    expect(copiedMd).toContain('Executed Action Steps');
    expect(showToast).toHaveBeenCalledWith('📋 Period wins copied to clipboard!');
  });

  it('falls back to downloading markdown when clipboard is unavailable for Export Wins', async () => {
    stubClipboard(vi.fn(), false);
    const showToast = vi.fn();

    const populatedWithWins: DigestData = {
      ...mockPopulatedDigest,
      weekly_wins: [
        {
          id: 301,
          title: 'Feature Shipped',
          status: 'done',
          horizon: 'short-term',
        } as unknown as Card,
      ],
      completed_actions_count: 1,
    };

    renderLocalized(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={populatedWithWins} {...dummyProps} showToast={showToast} />
        </CardActionsProvider>
      </ThemeProvider>
    );

    const exportWinsBtn = screen.getByRole('button', { name: /Export Wins/i });
    fireEvent.click(exportWinsBtn);

    await waitFor(() => {
      expect(downloads.length).toBe(1);
    });
    expect(downloads[0]).toMatch(/^sparkkeep-wins-.*\.md$/);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Downloaded sparkkeep-wins-'));
  });

  it('uses hidden textarea fallback when clipboard.writeText rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'));
    stubClipboard(writeText, true);
    const execCommand = vi.fn().mockReturnValue(true);
    (document as unknown as Record<string, unknown>).execCommand = execCommand;
    const showToast = vi.fn();

    const populatedWithWins: DigestData = {
      ...mockPopulatedDigest,
      weekly_wins: [
        { id: 301, title: 'Fallback Win', status: 'done', horizon: 'short-term' } as unknown as Card,
      ],
      completed_actions_count: 0,
    };

    renderLocalized(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={populatedWithWins} {...dummyProps} showToast={showToast} />
        </CardActionsProvider>
      </ThemeProvider>
    );

    const exportWinsBtn = screen.getByRole('button', { name: /Export Wins/i });
    fireEvent.click(exportWinsBtn);

    await waitFor(() => {
      expect(execCommand).toHaveBeenCalledWith('copy');
      expect(showToast).toHaveBeenCalledWith('📋 Period wins copied to clipboard!');
    });
    delete (document as unknown as Record<string, unknown>).execCommand;
  });

  it('downloads wins markdown when both clipboard.writeText and execCommand fail', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'));
    stubClipboard(writeText, true);
    const execCommand = vi.fn().mockReturnValue(false);
    (document as unknown as Record<string, unknown>).execCommand = execCommand;
    const showToast = vi.fn();

    const populatedWithWins: DigestData = {
      ...mockPopulatedDigest,
      weekly_wins: [
        { id: 301, title: 'Download Win', status: 'done', horizon: 'short-term' } as unknown as Card,
      ],
      completed_actions_count: 0,
    };

    renderLocalized(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={populatedWithWins} {...dummyProps} showToast={showToast} />
        </CardActionsProvider>
      </ThemeProvider>
    );

    const exportWinsBtn = screen.getByRole('button', { name: /Export Wins/i });
    fireEvent.click(exportWinsBtn);

    await waitFor(() => {
      expect(downloads.length).toBe(1);
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Downloaded sparkkeep-wins-'));
    });
    delete (document as unknown as Record<string, unknown>).execCommand;
  });

  it('exports empty wins section gracefully when 0 wins are present', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText, true);
    const showToast = vi.fn();

    const emptyWinsDigest: DigestData = {
      ...mockPopulatedDigest,
      weekly_wins: [],
      completed_actions_count: 0,
    };

    renderLocalized(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={emptyWinsDigest} {...dummyProps} showToast={showToast} />
        </CardActionsProvider>
      </ThemeProvider>
    );

    const exportWinsBtn = screen.getByRole('button', { name: /Export Wins/i });
    fireEvent.click(exportWinsBtn);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const copiedMd = writeText.mock.calls[0][0] as string;
    expect(copiedMd).toContain('# 🏆 Period Wins');
    expect(copiedMd).toContain('No cards completed in this period yet.');
    expect(showToast).toHaveBeenCalledWith('📋 Period wins copied to clipboard!');
  });

  it('includes Period Wins section in full digest markdown export', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText, true);

    const populatedWithWins: DigestData = {
      ...mockPopulatedDigest,
      weekly_wins: [
        {
          id: 301,
          title: 'Period Accomplishment Card',
          status: 'done',
          horizon: 'short-term',
          type: 'architecture',
          completed_actions: ['First step completed'],
        } as unknown as Card,
      ],
      completed_actions_count: 1,
    };

    renderLocalized(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={populatedWithWins} {...dummyProps} showToast={vi.fn()} />
        </CardActionsProvider>
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /Export Markdown/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const markdown = writeText.mock.calls[0][0] as string;
    expect(markdown).toContain('## 🏆 Period Wins');
    expect(markdown).toContain('Period Accomplishment Card');
    expect(markdown).toContain('[x] First step completed');
  });

  it('toggles Day-by-Day Activity Timeline inside collapsible lower deck', async () => {
    renderLocalized(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={mockPopulatedDigest} {...dummyProps} />
        </CardActionsProvider>
      </ThemeProvider>
    );

    const toggleBtn = screen.getByRole('button', { name: /Day-by-Day Activity Stream/i });
    expect(toggleBtn).toBeDefined();
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('2026-10-14')).toBeDefined();

    // Collapse deck
    fireEvent.click(toggleBtn);
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('2026-10-14')).toBeNull();

    // Re-expand deck
    fireEvent.click(toggleBtn);
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('2026-10-14')).toBeDefined();
  });

  it('renders Executive Retrospective with model badge, briefing, wins narrative, and next-focus recommendations', async () => {
    const retroDigest: DigestData = {
      ...mockPopulatedDigest,
      synthesis: {
        ok: true,
        briefing: 'Active executive retrospective summary bullets.',
        wins_narrative: 'Key breakthroughs across core infrastructure.',
        model: 'gpt-4o-byok',
        generated_at: '2026-10-25T14:30:00Z',
        next_focus: [
          {
            card_id: 101,
            title: 'Refactor Core Memory Pipeline',
            reason: 'High impact on system latency',
            priority: 'high',
          },
        ],
      },
      days: [
        {
          date: '2026-10-25',
          cards: [
            {
              id: 101,
              title: 'Refactor Core Memory Pipeline',
              status: 'inbox',
              horizon: 'short-term',
            } as Card,
          ],
        },
      ],
    };

    renderLocalized(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={retroDigest} {...dummyProps} />
        </CardActionsProvider>
      </ThemeProvider>
    );

    expect(screen.getByText('Active executive retrospective summary bullets.')).toBeDefined();
    expect(screen.getByText('Key breakthroughs across core infrastructure.')).toBeDefined();
    expect(screen.getByText('gpt-4o-byok')).toBeDefined();
    expect(screen.getAllByText('Refactor Core Memory Pipeline').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('High impact on system latency')).toBeDefined();
    expect(screen.getByText('high')).toBeDefined();
    expect(screen.getByRole('button', { name: /Start working on Refactor Core Memory Pipeline/i })).toBeDefined();
  });

  it('triggers patchCard to in-progress and shows undo toast when Start Now is clicked', async () => {
    const showToast = vi.fn();
    const onStatusChange = vi.fn();
    (api.patchCard as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 101, status: 'in-progress' });

    const retroDigest: DigestData = {
      ...mockPopulatedDigest,
      synthesis: {
        ok: true,
        briefing: 'Briefing text',
        next_focus: [
          {
            card_id: 101,
            title: 'Refactor Core Memory Pipeline',
            reason: 'High impact',
            priority: 'high',
          },
        ],
      },
      days: [
        {
          date: '2026-10-25',
          cards: [
            {
              id: 101,
              title: 'Refactor Core Memory Pipeline',
              status: 'to-do',
              horizon: 'short-term',
            } as Card,
          ],
        },
      ],
    };

    renderLocalized(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView
            digest={retroDigest}
            {...dummyProps}
            showToast={showToast}
            onStatusChange={onStatusChange}
          />
        </CardActionsProvider>
      </ThemeProvider>
    );

    const startBtn = screen.getByRole('button', { name: /Start working on Refactor Core Memory Pipeline/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(api.patchCard).toHaveBeenCalledWith(101, { status: 'in-progress' });
      expect(onStatusChange).toHaveBeenCalledWith(101, 'in-progress');
      expect(showToast).toHaveBeenCalled();
    });

    const undoCallback = showToast.mock.calls[0][1];
    expect(typeof undoCallback).toBe('function');
    await undoCallback();

    expect(api.patchCard).toHaveBeenCalledWith(101, { status: 'to-do' });
    expect(onStatusChange).toHaveBeenCalledWith(101, 'to-do');
  });

  it('triggers synthesis via button click and s keyboard shortcut', async () => {
    const showToast = vi.fn();
    (api.synthesizeDigest as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      briefing: 'Newly synthesized retrospective briefing',
      wins_narrative: 'Fresh wins report',
      model: 'claude-3-5-sonnet',
      generated_at: '2026-10-25T15:00:00Z',
    });

    renderLocalized(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={mockPopulatedDigest} {...dummyProps} showToast={showToast} />
        </CardActionsProvider>
      </ThemeProvider>
    );

    fireEvent.keyDown(document, { key: 's' });

    await waitFor(() => {
      expect(api.synthesizeDigest).toHaveBeenCalled();
      expect(screen.getByText('Newly synthesized retrospective briefing')).toBeDefined();
      expect(screen.getByText('Fresh wins report')).toBeDefined();
      expect(screen.getByText('claude-3-5-sonnet')).toBeDefined();
    });
  });

  it('does not trigger synthesis on "s" key when focus is inside an input or textarea', async () => {
    const showToast = vi.fn();
    (api.synthesizeDigest as ReturnType<typeof vi.fn>).mockClear();

    renderLocalized(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <div>
            <input data-testid="test-input" />
            <textarea data-testid="test-textarea" />
            <DigestView digest={mockPopulatedDigest} {...dummyProps} showToast={showToast} />
          </div>
        </CardActionsProvider>
      </ThemeProvider>
    );

    const input = screen.getByTestId('test-input');
    fireEvent.keyDown(input, { key: 's' });
    expect(api.synthesizeDigest).not.toHaveBeenCalled();

    const textarea = screen.getByTestId('test-textarea');
    fireEvent.keyDown(textarea, { key: 's' });
    expect(api.synthesizeDigest).not.toHaveBeenCalled();

    fireEvent.keyDown(document.body, { key: 's' });
    expect(api.synthesizeDigest).toHaveBeenCalledTimes(1);
  });

  it('synthesizes for active window days parameter (7, 14, 30)', async () => {
    (api.synthesizeDigest as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      briefing: 'Retrospective briefing',
    });
    (api.fetchDigest as ReturnType<typeof vi.fn>).mockResolvedValue(mockPopulatedDigest);

    renderLocalized(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={mockPopulatedDigest} {...dummyProps} />
        </CardActionsProvider>
      </ThemeProvider>
    );

    // Initial window is 7d
    fireEvent.click(screen.getByRole('button', { name: /Synthesize/i }));
    await waitFor(() => {
      expect(api.synthesizeDigest).toHaveBeenCalledWith(7);
    });

    // Switch to 14d
    const pill14 = screen.getByRole('radio', { name: '14d' });
    fireEvent.click(pill14);
    await waitFor(() => {
      expect(api.fetchDigest).toHaveBeenCalledWith(14);
    });

    fireEvent.click(screen.getByRole('button', { name: /Synthesize/i }));
    await waitFor(() => {
      expect(api.synthesizeDigest).toHaveBeenCalledWith(14);
    });

    // Switch to 30d
    const pill30 = screen.getByRole('radio', { name: '30d' });
    fireEvent.click(pill30);
    await waitFor(() => {
      expect(api.fetchDigest).toHaveBeenCalledWith(30);
    });

    fireEvent.click(screen.getByRole('button', { name: /Synthesize/i }));
    await waitFor(() => {
      expect(api.synthesizeDigest).toHaveBeenCalledWith(30);
    });
  });

  it('includes briefing, wins_narrative, and next_focus in Markdown export', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText, true);

    const retroDigest: DigestData = {
      ...mockPopulatedDigest,
      synthesis: {
        ok: true,
        briefing: 'Executive markdown briefing bullets.',
        wins_narrative: 'Executive wins markdown section.',
        next_focus: [
          {
            card_id: 101,
            title: 'Next Week Priority Card',
            reason: 'Finish critical spec',
            priority: 'high',
          },
        ],
      },
    };

    renderLocalized(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={retroDigest} {...dummyProps} />
        </CardActionsProvider>
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /Export Markdown/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });

    const markdown = writeText.mock.calls[0][0] as string;
    expect(markdown).toContain('Executive markdown briefing bullets.');
    expect(markdown).toContain('Executive wins markdown section.');
    expect(markdown).toContain('**Next Week Priority Card**: Finish critical spec');
  });

  describe('Ticket 04: Docked Board Inspector & Interactive Stale Bottleneck Cleanup', () => {
    const testInspectorDigest: DigestData = {
      ok: true,
      week_total: 2,
      prev_total: 1,
      by_status: { done: 1, inbox: 1 },
      by_horizon: { 'short-term': 2 },
      stale_count: 1,
      stale_cards: [
        {
          id: 201,
          title: 'Stale Bottleneck Card',
          summary: 'Card stuck in Now',
          status: 'inbox',
          horizon: 'short-term',
          tags: ['backend'],
          proposed_actions: ['Refactor auth service'],
          completed_actions: [],
          created_at: '2026-10-10T00:00:00Z',
          updated_at: '2026-10-10T00:00:00Z',
        } as unknown as Card,
      ],
      weekly_wins: [
        {
          id: 202,
          title: 'Period Win Card Alpha',
          status: 'done',
          horizon: 'short-term',
          tags: ['infra'],
          created_at: '2026-10-20T00:00:00Z',
          updated_at: '2026-10-24T00:00:00Z',
        } as unknown as Card,
      ],
      completed_actions_count: 2,
      research_harvest: [
        {
          id: 203,
          title: 'Research Harvest Beta',
          research_verdict: 'pursue',
          status: 'done',
          horizon: 'short-term',
          tags: ['ai'],
          created_at: '2026-10-21T00:00:00Z',
        } as unknown as Card,
      ],
      synthesis: {
        ok: true,
        briefing: 'Retro briefing',
        wins_narrative: 'Wins narrative',
        themes: [
          {
            title: 'Infrastructure',
            summary: 'Infra developments',
            card_ids: [202],
          },
        ],
        next_focus: [
          {
            card_id: 201,
            title: 'Stale Bottleneck Card',
            reason: 'Needs unblocking',
            priority: 'high',
          },
        ],
        model: 'claude-3-5-sonnet',
        generated_at: '2026-10-25T12:00:00Z',
      },
      days: [
        {
          date: '2026-10-24',
          cards: [
            {
              id: 201,
              title: 'Stale Bottleneck Card',
              status: 'inbox',
              horizon: 'short-term',
              tags: ['backend'],
              proposed_actions: ['Refactor auth service'],
              completed_actions: [],
              created_at: '2026-10-10T00:00:00Z',
            } as unknown as Card,
            {
              id: 202,
              title: 'Period Win Card Alpha',
              status: 'done',
              horizon: 'short-term',
              tags: ['infra'],
              created_at: '2026-10-20T00:00:00Z',
            } as unknown as Card,
          ],
        },
      ],
    };

    it('opens docked BoardInspector when clicking cards on widescreen (>= 1200px)', async () => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1400 });
      const onSelectCard = vi.fn();

      renderLocalized(
        <ThemeProvider defaultTheme="light">
          <CardActionsProvider value={dummyCardActions}>
            <DigestView digest={testInspectorDigest} {...dummyProps} onSelectCard={onSelectCard} />
          </CardActionsProvider>
        </ThemeProvider>
      );

      // Initially docked inspector is not mounted
      expect(screen.queryByTestId('digest-docked-inspector')).toBeNull();

      // 1. Click chip in Emergent Themes
      const themeChips = screen.getAllByRole('button', { name: /Period Win Card Alpha/i });
      fireEvent.click(themeChips[0]);
      expect(screen.getByTestId('digest-docked-inspector')).toBeDefined();

      // Close via Escape key
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByTestId('digest-docked-inspector')).toBeNull();

      // 2. Click win card in Period Wins Showcase
      const winCardBtns = screen.getAllByRole('button', { name: /Period Win Card Alpha/i });
      fireEvent.click(winCardBtns[1] || winCardBtns[0]);
      expect(screen.getByTestId('digest-docked-inspector')).toBeDefined();

      // Close via Escape key
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByTestId('digest-docked-inspector')).toBeNull();

      // 3. Click harvest item in Deep Research Harvest
      const harvestItem = screen.getByText('Research Harvest Beta');
      fireEvent.click(harvestItem);
      expect(screen.getByTestId('digest-docked-inspector')).toBeDefined();

      // Close via Escape key
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByTestId('digest-docked-inspector')).toBeNull();

      // 4. Click Next-Period Focus recommendation
      const focusCardTitle = screen.getAllByText('Stale Bottleneck Card')[0];
      fireEvent.click(focusCardTitle);
      expect(screen.getByTestId('digest-docked-inspector')).toBeDefined();

      // onSelectCard was not called directly because it opened docked inspector
      expect(onSelectCard).not.toHaveBeenCalled();
    });

    it('promotes inspected card to full CardModal on Enter, Space, or Expand button', async () => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1400 });
      const onSelectCard = vi.fn();

      renderLocalized(
        <ThemeProvider defaultTheme="light">
          <CardActionsProvider value={dummyCardActions}>
            <DigestView digest={testInspectorDigest} {...dummyProps} onSelectCard={onSelectCard} />
          </CardActionsProvider>
        </ThemeProvider>
      );

      // Inspect a card
      const harvestItem = screen.getByText('Research Harvest Beta');
      fireEvent.click(harvestItem);
      expect(screen.getByTestId('digest-docked-inspector')).toBeDefined();

      // Press Enter key to expand to full modal
      fireEvent.keyDown(window, { key: 'Enter' });
      expect(onSelectCard).toHaveBeenCalledWith(expect.objectContaining({ id: 203 }));
      onSelectCard.mockClear();

      // Press Space key to expand to full modal
      fireEvent.keyDown(window, { key: ' ' });
      expect(onSelectCard).toHaveBeenCalledWith(expect.objectContaining({ id: 203 }));
      onSelectCard.mockClear();

      // Click Expand button in inspector
      const expandBtn = screen.getByRole('button', { name: /Expand to Full Modal/i });
      fireEvent.click(expandBtn);
      expect(onSelectCard).toHaveBeenCalledWith(expect.objectContaining({ id: 203 }));
    });

    it('opens full CardModal directly without docked inspector on narrow viewports (< 1200px)', async () => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 900 });
      const onSelectCard = vi.fn();

      renderLocalized(
        <ThemeProvider defaultTheme="light">
          <CardActionsProvider value={dummyCardActions}>
            <DigestView digest={testInspectorDigest} {...dummyProps} onSelectCard={onSelectCard} />
          </CardActionsProvider>
        </ThemeProvider>
      );

      // Click card in Next-Period Focus
      const focusCardTitle = screen.getAllByText('Stale Bottleneck Card')[0];
      fireEvent.click(focusCardTitle);

      // Docked inspector should not be open
      expect(screen.queryByTestId('digest-docked-inspector')).toBeNull();
      // onSelectCard must be called directly
      expect(onSelectCard).toHaveBeenCalledWith(expect.objectContaining({ id: 201 }));
    });

    it('handles interactive Stale Bottleneck cleanup: inspects stale card and highlights stale items', async () => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1400 });
      const onSelectCard = vi.fn();

      renderLocalized(
        <ThemeProvider defaultTheme="light">
          <CardActionsProvider value={dummyCardActions}>
            <DigestView digest={testInspectorDigest} {...dummyProps} onSelectCard={onSelectCard} />
          </CardActionsProvider>
        </ThemeProvider>
      );

      // Strategic Health Stale Alert must be present
      expect(screen.getByTestId('digest-stale-alert')).toBeDefined();
      const inspectBtn = screen.getByRole('button', { name: /Inspect Stale/i });
      expect(inspectBtn).toBeDefined();

      // Click Inspect Stale
      fireEvent.click(inspectBtn);

      // Opens first stale card in docked inspector
      expect(screen.getByTestId('digest-docked-inspector')).toBeDefined();
      expect(screen.getAllByText('Stale Bottleneck Card').length).toBeGreaterThan(0);

      // Stale cards are highlighted
      const highlightedCards = document.querySelectorAll('.digest-card-stale-highlight');
      expect(highlightedCards.length).toBeGreaterThan(0);
    });

    it('calls batchShelveStale(5), shows toast, and refreshes digest when Batch-Shelve Stale is clicked', async () => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1400 });
      const showToast = vi.fn();
      const onRefresh = vi.fn();

      renderLocalized(
        <ThemeProvider defaultTheme="light">
          <CardActionsProvider value={dummyCardActions}>
            <DigestView
              digest={testInspectorDigest}
              {...dummyProps}
              showToast={showToast}
              onRefresh={onRefresh}
            />
          </CardActionsProvider>
        </ThemeProvider>
      );

      const shelveBtn = screen.getByRole('button', { name: /Batch-Shelve Stale/i });
      expect(shelveBtn).toBeDefined();

      fireEvent.click(shelveBtn);

      await waitFor(() => {
        expect(api.batchShelveStale).toHaveBeenCalledWith(5);
      });

      await waitFor(() => {
        expect(showToast).toHaveBeenCalledWith(expect.stringContaining('2'));
      });

      expect(onRefresh).toHaveBeenCalled();
    });

    it('hides Inspect Stale and Batch-Shelve buttons when stale_count is 0', async () => {
      const emptyStaleDigest: DigestData = {
        ...testInspectorDigest,
        stale_count: 0,
        stale_cards: [],
      };

      renderLocalized(
        <ThemeProvider defaultTheme="light">
          <CardActionsProvider value={dummyCardActions}>
            <DigestView digest={emptyStaleDigest} {...dummyProps} />
          </CardActionsProvider>
        </ThemeProvider>
      );

      expect(screen.queryByTestId('digest-stale-alert')).toBeNull();
      expect(screen.queryByRole('button', { name: /Inspect Stale/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /Batch-Shelve Stale/i })).toBeNull();
    });

    it('does not close docked inspector on Escape if a dialog or modal overlay is present in document', async () => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1400 });

      renderLocalized(
        <ThemeProvider defaultTheme="light">
          <CardActionsProvider value={dummyCardActions}>
            <DigestView digest={testInspectorDigest} {...dummyProps} />
          </CardActionsProvider>
        </ThemeProvider>
      );

      // Inspect a card to open docked inspector
      const harvestItem = screen.getByText('Research Harvest Beta');
      fireEvent.click(harvestItem);
      expect(screen.getByTestId('digest-docked-inspector')).toBeDefined();

      // Simulate a modal dialog open in document
      const dialogOverlay = document.createElement('div');
      dialogOverlay.className = 'modal-overlay';
      document.body.appendChild(dialogOverlay);

      // Press Escape - inspector should NOT close because dialog is active
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.getByTestId('digest-docked-inspector')).toBeDefined();

      // Remove modal overlay from document
      document.body.removeChild(dialogOverlay);

      // Press Escape again - now inspector closes cleanly
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByTestId('digest-docked-inspector')).toBeNull();
    });

    it('switches between docked inspector (>= 1200px) and modal fallback (< 1200px) on viewport change', async () => {
      const onSelectCard = vi.fn();
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1400 });

      const { rerender } = renderLocalized(
        <ThemeProvider defaultTheme="light">
          <CardActionsProvider value={dummyCardActions}>
            <DigestView digest={testInspectorDigest} {...dummyProps} onSelectCard={onSelectCard} />
          </CardActionsProvider>
        </ThemeProvider>
      );

      // 1. On >= 1200px, clicking opens docked inspector
      const harvestItem = screen.getByText('Research Harvest Beta');
      fireEvent.click(harvestItem);
      expect(screen.getByTestId('digest-docked-inspector')).toBeDefined();
      expect(onSelectCard).not.toHaveBeenCalled();

      // Close inspector
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByTestId('digest-docked-inspector')).toBeNull();

      // 2. Resize to < 1200px
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
      rerender(
        <LocaleProvider locale="en">
          <ThemeProvider defaultTheme="light">
            <CardActionsProvider value={dummyCardActions}>
              <DigestView digest={testInspectorDigest} {...dummyProps} onSelectCard={onSelectCard} />
            </CardActionsProvider>
          </ThemeProvider>
        </LocaleProvider>
      );

      // Clicking card now falls back directly to onSelectCard modal
      const harvestItemAgain = screen.getByText('Research Harvest Beta');
      fireEvent.click(harvestItemAgain);
      expect(screen.queryByTestId('digest-docked-inspector')).toBeNull();
      expect(onSelectCard).toHaveBeenCalledWith(expect.objectContaining({ id: 203 }));
    });

    it('shows loading state on Batch-Shelve button during request and displays error toast on failure', async () => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1400 });
      const showToast = vi.fn();
      let rejectShelve!: (err: unknown) => void;
      vi.mocked(api.batchShelveStale).mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectShelve = reject;
          })
      );

      renderLocalized(
        <ThemeProvider defaultTheme="light">
          <CardActionsProvider value={dummyCardActions}>
            <DigestView digest={testInspectorDigest} {...dummyProps} showToast={showToast} />
          </CardActionsProvider>
        </ThemeProvider>
      );

      const shelveBtn = screen.getByRole('button', { name: /Batch-Shelve Stale/i }) as HTMLButtonElement;
      expect(shelveBtn).toBeDefined();
      expect(shelveBtn.disabled).toBe(false);

      // Click to start shelving
      fireEvent.click(shelveBtn);

      // Should be disabled with loading state
      expect(shelveBtn.disabled).toBe(true);

      // Reject the API call
      rejectShelve(new Error('Network shelf failure'));

      // Error toast should display error message and button is re-enabled
      await waitFor(() => {
        expect(showToast).toHaveBeenCalledWith('Network shelf failure');
      });
      expect(shelveBtn.disabled).toBe(false);
    });

    it('toggles action checklist item inside docked inspector in DigestView and triggers card update', async () => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1400 });
      const onUpdateCard = vi.fn();

      renderLocalized(
        <ThemeProvider defaultTheme="light">
          <CardActionsProvider value={dummyCardActions}>
            <DigestView
              digest={testInspectorDigest}
              {...dummyProps}
              onUpdateCard={onUpdateCard}
            />
          </CardActionsProvider>
        </ThemeProvider>
      );

      // Open card 201 into docked inspector via Inspect Stale
      const inspectBtn = screen.getByRole('button', { name: /Inspect Stale/i });
      fireEvent.click(inspectBtn);
      expect(screen.getByTestId('digest-docked-inspector')).toBeDefined();

      // Checklist item should be visible
      const checkbox = screen.getByRole('checkbox', { name: /Refactor auth service/i }) as HTMLInputElement;
      expect(checkbox).toBeDefined();
      expect(checkbox.checked).toBe(false);

      // Toggle the step
      fireEvent.click(checkbox);

      await waitFor(() => {
        expect(onUpdateCard).toHaveBeenCalledWith(
          201,
          expect.objectContaining({
            completed_actions: ['Refactor auth service'],
          })
        );
      });
    });
  });
});

