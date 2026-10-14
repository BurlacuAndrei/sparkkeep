import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KanbanBoard } from './KanbanBoard';
import { CardActionsProvider, CardActions } from '../context/CardActionsContext';
import { Card } from '../types';

describe('KanbanBoard Density & Usability', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const mockCards: Card[] = [
    {
      id: 1,
      title: 'Strategic Horizon Planning',
      summary: 'Evaluate quarterly market expansion models and risk bounds.',
      horizon: 'short-term',
      status: 'to-do',
      source_url: 'https://example.com/strategy',
      source_note: 'Quarterly memo',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      tags: ['strategy'],
    },
  ];

  const mockActions: CardActions = {
    onSelectCard: vi.fn(),
    onStatusChange: vi.fn(),
    onResearch: vi.fn(),
    onRetry: vi.fn(),
    showToast: vi.fn(),
  };

  const renderWithProvider = (ui: React.ReactElement) => {
    return render(
      <CardActionsProvider value={mockActions}>
        {ui}
      </CardActionsProvider>
    );
  };

  it('renders comfortable density by default and toggles to compact', () => {
    renderWithProvider(
      <KanbanBoard
        cards={mockCards}
        horizon="all"
        onHorizonChange={vi.fn()}
        onSelectCard={vi.fn()}
        onUpdateCard={vi.fn()}
        onResearch={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    const densityBtn = screen.getByRole('button', { name: /switch card density/i });
    expect(densityBtn.textContent).toContain('Comfortable');

    // Toggle to compact
    fireEvent.click(densityBtn);
    expect(densityBtn.textContent).toContain('Compact');
    expect(localStorage.getItem('sparkkeep_card_density')).toBe('compact');

    // The card article should receive the .is-compact class
    const cardEl = screen.getByRole('article');
    expect(cardEl.className).toContain('is-compact');

    // Toggle back to comfortable
    fireEvent.click(densityBtn);
    expect(densityBtn.textContent).toContain('Comfortable');
    expect(localStorage.getItem('sparkkeep_card_density')).toBe('comfortable');
    expect(cardEl.className).not.toContain('is-compact');
  });

  it('initializes from localStorage card density preference', () => {
    localStorage.setItem('sparkkeep_card_density', 'compact');

    renderWithProvider(
      <KanbanBoard
        cards={mockCards}
        horizon="all"
        onHorizonChange={vi.fn()}
        onSelectCard={vi.fn()}
        onUpdateCard={vi.fn()}
        onResearch={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    const densityBtn = screen.getByRole('button', { name: /switch card density/i });
    expect(densityBtn.textContent).toContain('Compact');

    const cardEl = screen.getByRole('article');
    expect(cardEl.className).toContain('is-compact');
  });
});
