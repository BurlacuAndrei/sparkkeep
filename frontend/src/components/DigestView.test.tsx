import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DigestView } from './DigestView';
import { ThemeProvider } from '../context/ThemeContext';
import { CardActionsProvider } from '../context/CardActionsContext';
import { Card, DigestData } from '../types';
import * as api from '../api';

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
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
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
});

