import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CardModal } from './CardModal';
import { Card } from '../types';
import { LocaleProvider } from '../i18n';

const renderCardModal = (ui: React.ReactElement) =>
  render(<LocaleProvider locale="en">{ui}</LocaleProvider>);

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchCard: vi.fn().mockImplementation((id: number) =>
      Promise.resolve({
        id,
        title: 'Subject Card',
        summary: 'Subject summary note',
        status: 'inbox',
        horizon: 'short-term',
        tags: [],
        comments: [],
      })
    ),
    fetchCardResearch: vi.fn().mockResolvedValue(null),
    fetchCapture: vi.fn().mockResolvedValue(null),
    createCard: vi.fn().mockResolvedValue({ id: 99 }),
  };
});

describe('CardModal Subject Card & Synthesize Brief', () => {
  const subjectCard: Card = {
    id: 101,
    title: 'Distributed Consensus Mechanics',
    summary: 'Evaluating raft-based CRDTs in Go without external URL',
    horizon: 'short-term',
    status: 'inbox',
    source_url: '',
    source_note: 'Exploratory architecture research note',
    tags: ['dist-sys'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const briefedCard: Card = {
    id: 102,
    title: 'Briefed Card',
    summary: 'Already analyzed',
    tldr: 'Key takeaway from analysis',
    why_care: 'Why it matters',
    claims: ['Claim 1', 'Claim 2'],
    horizon: 'short-term',
    status: 'inbox',
    source_url: '',
    source_note: '',
    tags: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const failedCard: Card = {
    id: 103,
    title: 'Analysis failed',
    summary: 'Analysis failed, see source.',
    analysis_failed: true,
    horizon: 'short-term',
    status: 'inbox',
    source_url: 'https://example.com/fail',
    source_note: '',
    tags: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it('renders "Synthesize Brief" button for subject cards lacking briefing fields', async () => {
    const onRetry = vi.fn();
    renderCardModal(
      <CardModal
        card={subjectCard}
        onClose={vi.fn()}
        onUpdate={vi.fn()}
        onResearch={vi.fn()}
        onRetry={onRetry}
      />
    );

    await waitFor(() => {
      const synthesizeBtns = screen.getAllByRole('button', { name: /synthesize brief/i });
      expect(synthesizeBtns.length).toBeGreaterThan(0);
    });

    const synthesizeBtns = screen.getAllByRole('button', { name: /synthesize brief/i });
    fireEvent.click(synthesizeBtns[0]);
    expect(onRetry).toHaveBeenCalledWith(101);
  });

  it('does NOT render "Synthesize Brief" button when card already has briefing', async () => {
    const onRetry = vi.fn();
    renderCardModal(
      <CardModal
        card={briefedCard}
        onClose={vi.fn()}
        onUpdate={vi.fn()}
        onResearch={vi.fn()}
        onRetry={onRetry}
      />
    );

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /synthesize brief/i })).toBeNull();
    });
  });

  it('renders "Retry Extraction" instead of "Synthesize Brief" when card analysis failed', async () => {
    const onRetry = vi.fn();
    renderCardModal(
      <CardModal
        card={failedCard}
        onClose={vi.fn()}
        onUpdate={vi.fn()}
        onResearch={vi.fn()}
        onRetry={onRetry}
      />
    );

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /synthesize brief/i })).toBeNull();
      expect(screen.getByRole('button', { name: /retry extraction/i })).toBeDefined();
    });

    const retryBtn = screen.getByRole('button', { name: /retry extraction/i });
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledWith(103);
  });
});
