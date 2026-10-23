import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DigestView } from './DigestView';
import { ThemeProvider } from '../context/ThemeContext';
import { CardActionsProvider } from '../context/CardActionsContext';
import { Card, DigestData } from '../types';
import * as api from '../api';

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

  it('renders empty state cleanly in Light mode', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <DigestView digest={null} {...dummyProps} />
      </ThemeProvider>
    );

    expect(screen.getByText('No captures in this window')).toBeDefined();
    expect(screen.getByText(/Sparks captured during the selected/i)).toBeDefined();
  });

  it('renders populated digest with title, KPI metrics, and themes in Light mode', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={mockPopulatedDigest} {...dummyProps} />
        </CardActionsProvider>
      </ThemeProvider>
    );

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

  it('renders "Send to Integrations" button instead of hardcoded Telegram button', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={mockPopulatedDigest} {...dummyProps} />
        </CardActionsProvider>
      </ThemeProvider>
    );

    expect(screen.getByRole('button', { name: /Send to Integrations/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Send to Telegram$/i })).toBeNull();
  });

  it('dispatches digest to all integrations when main button is clicked', async () => {
    const showToast = vi.fn();
    render(
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
    render(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={mockPopulatedDigest} {...dummyProps} />
        </CardActionsProvider>
      </ThemeProvider>
    );

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
    render(
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

  it('closes channel menu on Escape key', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={mockPopulatedDigest} {...dummyProps} />
        </CardActionsProvider>
      </ThemeProvider>
    );

    const chevronBtn = screen.getByRole('button', { name: /Select integration channel/i });
    fireEvent.click(chevronBtn);
    expect(screen.getByRole('menu')).toBeDefined();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('respects selected time window when pushing digest to channel', async () => {
    (api.fetchDigest as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockPopulatedDigest);

    render(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={mockPopulatedDigest} {...dummyProps} />
        </CardActionsProvider>
      </ThemeProvider>
    );

    const windowSelect = screen.getByRole('combobox');
    fireEvent.change(windowSelect, { target: { value: '14' } });

    const sendBtn = await waitFor(() => screen.getByRole('button', { name: /Send to Integrations/i }));
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(api.pushDigestToChannel).toHaveBeenCalledWith('all', 14);
    });
  });

  const renderDigestView = (showToast: (msg: string) => void = vi.fn()) =>
    render(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={mockPopulatedDigest} {...dummyProps} showToast={showToast} />
        </CardActionsProvider>
      </ThemeProvider>
    );

  const FILENAME_PATTERN = /^sparkkeep-digest-\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}\.md$/;

  it('copies the Markdown digest from the primary action when the clipboard is available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText, true);
    const showToast = vi.fn();

    renderDigestView(showToast);
    fireEvent.click(screen.getByRole('button', { name: /Export Markdown/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    expect(writeText.mock.calls[0][0]).toContain('# 📊 Sparkkeep Intelligence Digest');
    expect(showToast).toHaveBeenCalledWith('📋 Markdown digest copied to clipboard!');
    expect(downloads).toEqual([]);
  });

  it('downloads a .md file from the primary action when the clipboard is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText, false);
    const showToast = vi.fn();

    renderDigestView(showToast);
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

  it('labels the primary action "Download Markdown" when the clipboard is unavailable', () => {
    stubClipboard(vi.fn(), false);

    renderDigestView();

    expect(screen.getByRole('button', { name: 'Download Markdown' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Export Markdown' })).toBeNull();
  });

  it('shows a failure toast suggesting download when the clipboard write rejects', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')), true);
    const showToast = vi.fn();

    renderDigestView(showToast);
    fireEvent.click(screen.getByRole('button', { name: /Export Markdown/i }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Download .md file'));
    });
    expect(downloads).toEqual([]);
  });

  it('shows a failure toast when the clipboard write throws synchronously', () => {
    stubClipboard(
      vi.fn(() => {
        throw new Error('clipboard vanished');
      }),
      true
    );
    const showToast = vi.fn();

    renderDigestView(showToast);
    fireEvent.click(screen.getByRole('button', { name: /Export Markdown/i }));

    expect(showToast).toHaveBeenCalledWith(
      'Could not copy to clipboard. Use Download .md file instead.'
    );
  });

  it('lists copy and download actions in the export menu, disabling copy without a clipboard', () => {
    stubClipboard(vi.fn(), false);

    renderDigestView();
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

  it('skips the disabled copy item when roving focus in an insecure context', () => {
    stubClipboard(vi.fn(), false);

    renderDigestView();
    fireEvent.click(screen.getByRole('button', { name: /More export options/i }));

    const copyItem = screen.getByRole('menuitem', { name: /Copy to clipboard/i });
    const downloadItem = screen.getByRole('menuitem', { name: /Download \.md file/i });
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });

    expect(document.activeElement).toBe(downloadItem);
    expect(document.activeElement).not.toBe(copyItem);
  });

  it('closes the export menu on outside mousedown', () => {
    stubClipboard(vi.fn(), true);

    renderDigestView();
    fireEvent.click(screen.getByRole('button', { name: /More export options/i }));
    expect(screen.getByRole('menu')).toBeDefined();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('moves focus between menuitems with ArrowDown and wraps around', () => {
    stubClipboard(vi.fn(), true);

    renderDigestView();
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

    renderDigestView();
    fireEvent.click(screen.getByRole('button', { name: /More export options/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Download \.md file/i }));

    await waitFor(() => {
      expect(downloads).toHaveLength(1);
    });
    expect(downloads[0]).toMatch(FILENAME_PATTERN);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes the export menu on Escape key and returns focus to the menu arrow', () => {
    stubClipboard(vi.fn(), true);

    renderDigestView();
    const arrowBtn = screen.getByRole('button', { name: /More export options/i });
    fireEvent.click(arrowBtn);
    expect(screen.getByRole('menu')).toBeDefined();

    screen.getByRole('menuitem', { name: /Download \.md file/i }).focus();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(arrowBtn);
  });

  it('does not steal focus when the export menu closes on outside mousedown', () => {
    stubClipboard(vi.fn(), true);

    renderDigestView();
    const arrowBtn = screen.getByRole('button', { name: /More export options/i });
    fireEvent.click(arrowBtn);
    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).not.toBe(arrowBtn);
  });
});

