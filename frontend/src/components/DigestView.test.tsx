import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DigestView } from './DigestView';
import { ThemeProvider } from '../context/ThemeContext';
import { CardActionsProvider } from '../context/CardActionsContext';
import { Card, DigestData } from '../types';

describe('DigestView', () => {
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
    const mockDigest: DigestData = {
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

    render(
      <ThemeProvider defaultTheme="light">
        <CardActionsProvider value={dummyCardActions}>
          <DigestView digest={mockDigest} {...dummyProps} />
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
});
