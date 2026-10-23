import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KanbanBoard } from './KanbanBoard';
import { CardActionsProvider, CardActions } from '../context/CardActionsContext';
import { Card } from '../types';
import { LocaleProvider } from '../i18n';

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
      <LocaleProvider locale="en">
        <CardActionsProvider value={mockActions}>{ui}</CardActionsProvider>
      </LocaleProvider>
    );
  };

  it('renders Romanian plural counts under the ro locale', () => {
    const { unmount } = render(
      <LocaleProvider locale="ro">
        <CardActionsProvider value={mockActions}>
          <KanbanBoard
            cards={[mockCards[0]]}
            horizon="all"
            onHorizonChange={vi.fn()}
            onSelectCard={vi.fn()}
            onUpdateCard={vi.fn()}
            onResearch={vi.fn()}
            onRetry={vi.fn()}
          />
        </CardActionsProvider>
      </LocaleProvider>
    );
    expect(screen.getByText('(1 card)')).toBeDefined();
    unmount();

    render(
      <LocaleProvider locale="ro">
        <CardActionsProvider value={mockActions}>
          <KanbanBoard
            cards={[mockCards[0], { ...mockCards[0], id: 2, title: 'Second card' }]}
            horizon="all"
            onHorizonChange={vi.fn()}
            onSelectCard={vi.fn()}
            onUpdateCard={vi.fn()}
            onResearch={vi.fn()}
            onRetry={vi.fn()}
          />
        </CardActionsProvider>
      </LocaleProvider>
    );
    expect(screen.getByText('(2 carduri)')).toBeDefined();
  });

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

  it('stabilizes header toolbar and renders archive banners without layout collapse', () => {
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

    // Initial Active state: Horizon tablist is present
    expect(screen.getByRole('tablist', { name: /filter execution board by horizon/i })).toBeDefined();
    expect(screen.getByText('Execution Boards')).toBeDefined();

    // Density toggle is present
    const densityBtn = screen.getByRole('button', { name: /switch card density/i });
    expect(densityBtn).toBeDefined();

    // Switch to Shelved mode
    const shelvedBtn = screen.getByRole('button', { name: /shelved/i });
    fireEvent.click(shelvedBtn);

    expect(screen.getByText('Shelf (Later)')).toBeDefined();
    expect(screen.getByText(/Shelved Cards:/i)).toBeDefined();
    expect(densityBtn).toBeDefined();

    // Switch to Dismissed mode
    const dismissedBtn = screen.getByRole('button', { name: /dismissed/i });
    fireEvent.click(dismissedBtn);

    expect(screen.getByText('Dismissed Cards')).toBeDefined();
    expect(screen.getByText(/Dismissed Cards:/i)).toBeDefined();
    expect(densityBtn).toBeDefined();
  });
});
