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

  it('collapses cards marked Done older than 7 days into View Archived and expands when clicked', () => {
    const now = Date.now();
    const freshDoneCards: Card[] = [1, 2, 3].map((id) => ({
      id,
      title: `Fresh Done Card ${id}`,
      summary: `Summary ${id}`,
      horizon: 'short-term',
      status: 'done',
      source_url: 'https://example.com',
      source_note: '',
      tags: [],
      created_at: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
    }));

    const oldDoneCards: Card[] = Array.from({ length: 10 }, (_, i) => ({
      id: 100 + i,
      title: `Old Done Card ${i + 1}`,
      summary: `Summary old ${i + 1}`,
      horizon: 'short-term',
      status: 'done',
      source_url: 'https://example.com',
      source_note: '',
      tags: [],
      created_at: new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString(),
    }));

    renderWithProvider(
      <KanbanBoard
        cards={[...freshDoneCards, ...oldDoneCards]}
        horizon="all"
        onHorizonChange={vi.fn()}
        onSelectCard={vi.fn()}
        onUpdateCard={vi.fn()}
        onResearch={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    // Initial state: Only 3 fresh done cards are visible in the Done column
    expect(screen.getByText('Fresh Done Card 1')).toBeDefined();
    expect(screen.getByText('Fresh Done Card 2')).toBeDefined();
    expect(screen.getByText('Fresh Done Card 3')).toBeDefined();
    expect(screen.queryByText('Old Done Card 1')).toBeNull();

    // The archive toggle button shows "View Archived (10)"
    const archiveBtn = screen.getByRole('button', { name: /view archived \(10\)/i });
    expect(archiveBtn).toBeDefined();

    // Click to expand archived cards
    fireEvent.click(archiveBtn);

    // All 13 cards should now be rendered
    expect(screen.getByText('Old Done Card 1')).toBeDefined();
    expect(screen.getByText('Old Done Card 10')).toBeDefined();
    expect(screen.getByRole('button', { name: /hide archived/i })).toBeDefined();

    // Click again to collapse
    fireEvent.click(screen.getByRole('button', { name: /hide archived/i }));
    expect(screen.queryByText('Old Done Card 1')).toBeNull();
  });

  it('updates card status via onUpdateCard on HTML5 drop into Done column', () => {
    const onUpdateCard = vi.fn();
    const showToast = vi.fn();

    render(
      <LocaleProvider locale="en">
        <CardActionsProvider value={mockActions}>
          <KanbanBoard
            cards={mockCards}
            horizon="all"
            onHorizonChange={vi.fn()}
            onSelectCard={vi.fn()}
            onUpdateCard={onUpdateCard}
            onResearch={vi.fn()}
            onRetry={vi.fn()}
            showToast={showToast}
          />
        </CardActionsProvider>
      </LocaleProvider>
    );

    // Target the Done column
    const doneCol = screen.getByText('Completed').closest('.kanban-column')!;
    expect(doneCol).toBeDefined();

    // Simulate drop with card id 1
    const dropEvent = {
      preventDefault: vi.fn(),
      dataTransfer: {
        getData: vi.fn().mockReturnValue('1'),
      },
    };

    fireEvent.drop(doneCol, dropEvent);

    expect(onUpdateCard).toHaveBeenCalledWith(1, { status: 'done' });
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('#1'),
      expect.any(Function)
    );

    // Verify undo callback reverts status back to previous status
    const undoCallback = showToast.mock.calls[0][1];
    expect(undoCallback).toBeDefined();
    undoCallback();
    expect(onUpdateCard).toHaveBeenCalledWith(1, { status: 'to-do' });
  });
});
