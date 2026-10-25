import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CardModal } from './CardModal';
import { Card } from '../types';
import { LocaleProvider } from '../i18n';
import * as api from '../api';

const renderCardModal = (ui: React.ReactElement) =>
  render(<LocaleProvider locale="en">{ui}</LocaleProvider>);

const mockCardsRegistry = new Map<number, Card>();

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchCard: vi.fn().mockImplementation((id: number) => {
      const found = mockCardsRegistry.get(id);
      if (found) return Promise.resolve(found);
      return Promise.resolve({
        id,
        title: 'Subject Card',
        summary: 'Subject summary note',
        status: 'inbox',
        horizon: 'short-term',
        tags: [],
        comments: [],
      });
    }),
    fetchCardResearch: vi.fn().mockResolvedValue(null),
    fetchCapture: vi.fn().mockResolvedValue(null),
    createCard: vi.fn().mockResolvedValue({ id: 99 }),
    reanalyzeCard: vi.fn(),
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

  it('debounces title autosave by 650ms and shows saved indicator', async () => {
    mockCardsRegistry.set(102, briefedCard);
    const onUpdate = vi.fn();

    renderCardModal(
      <CardModal
        card={briefedCard}
        onClose={vi.fn()}
        onUpdate={onUpdate}
        onResearch={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    const titleInput = await screen.findByDisplayValue('Briefed Card');
    fireEvent.change(titleInput, { target: { value: 'Updated Title After Edit' } });

    // Assert saving indicator appears immediately
    expect(screen.getByText('Saving...')).toBeDefined();
    expect(onUpdate).not.toHaveBeenCalled();

    // After debounce (650ms), onUpdate is called and Saved indicator is displayed
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(102, { title: 'Updated Title After Edit' });
      expect(screen.getByText('Saved')).toBeDefined();
    }, { timeout: 2000 });
  });

  it('splits idea by retaining selected claims in Card A and creating Card B', async () => {
    const multiClaimCard: Card = {
      id: 105,
      title: 'Original Multi-Claim Card',
      summary: 'Card with 4 distinct claims',
      claims: ['Claim Alpha', 'Claim Beta', 'Claim Gamma', 'Claim Delta'],
      horizon: 'short-term',
      status: 'inbox',
      capture_id: 88,
      source_url: 'https://example.com/multi',
      source_note: '',
      tags: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockCardsRegistry.set(105, multiClaimCard);

    const onUpdate = vi.fn();
    const showToast = vi.fn();

    renderCardModal(
      <CardModal
        card={multiClaimCard}
        onClose={vi.fn()}
        onUpdate={onUpdate}
        onResearch={vi.fn()}
        onRetry={vi.fn()}
        showToast={showToast}
      />
    );

    await screen.findByDisplayValue('Original Multi-Claim Card');
    expect(screen.getByDisplayValue('Claim Alpha')).toBeDefined();

    // Open split modal via header action button
    const splitBtn = screen.getByTitle('Split card into two');
    fireEvent.click(splitBtn);

    // Enter title for Card B
    const cardBTitleInput = screen.getByPlaceholderText('Title for the new split card...');
    fireEvent.change(cardBTitleInput, { target: { value: 'Decomposed Card B' } });

    // Select first 2 claims (Claim Alpha, Claim Beta) to move to Card B
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);

    // Click execute split
    const executeBtn = screen.getByRole('button', { name: /Execute Split/i });
    fireEvent.click(executeBtn);

    await waitFor(() => {
      // Card A should retain Claim Gamma and Claim Delta
      expect(onUpdate).toHaveBeenCalledWith(105, {
        claims: ['Claim Gamma', 'Claim Delta'],
      });

      // Card B should be created with Claim Alpha and Claim Beta
      expect(api.createCard).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Decomposed Card B',
          claims: ['Claim Alpha', 'Claim Beta'],
          capture_id: 88,
        })
      );

      expect(showToast).toHaveBeenCalledWith('Split completed: Card #105 and new card created!');
    });
  });

  it('calls api.reanalyzeCard, updates card state, and shows toast on clicking "Regenerate Brief"', async () => {
    const updatedCardFromAPI: Card = {
      ...briefedCard,
      id: 102,
      title: 'Regenerated Title',
      tldr: 'Freshly Regenerated TLDR',
      why_care: 'Freshly Regenerated WhyCare',
      claims: ['Regenerated Claim A', 'Regenerated Claim B'],
      open_questions: ['Regenerated Question A'],
      proposed_actions: ['Regenerated Action 1'],
    };
    vi.mocked(api.reanalyzeCard).mockResolvedValue({
      ok: true,
      card: updatedCardFromAPI,
    });

    const onUpdate = vi.fn();
    const showToast = vi.fn();

    renderCardModal(
      <CardModal
        card={briefedCard}
        onClose={vi.fn()}
        onUpdate={onUpdate}
        onResearch={vi.fn()}
        onRetry={vi.fn()}
        showToast={showToast}
      />
    );

    const regenBtn = screen.getByRole('button', { name: /regenerate brief/i });
    expect(regenBtn).toBeDefined();

    fireEvent.click(regenBtn);

    await waitFor(() => {
      expect(api.reanalyzeCard).toHaveBeenCalledWith(102);
      expect(onUpdate).toHaveBeenCalledWith(102, updatedCardFromAPI);
      expect(showToast).toHaveBeenCalledWith('Triage brief regenerated');
    });

    // Check that local inputs reflect updated brief
    expect(screen.getByDisplayValue('Regenerated Title')).toBeDefined();
    expect(screen.getByDisplayValue('Freshly Regenerated TLDR')).toBeDefined();
    expect(screen.getByDisplayValue('Freshly Regenerated WhyCare')).toBeDefined();
    expect(screen.getByDisplayValue('Regenerated Claim A')).toBeDefined();
  });
});
