import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { KanbanBoard } from './KanbanBoard';
import { CardActionsProvider, CardActions } from '../context/CardActionsContext';
import { Card } from '../types';
import { LocaleProvider } from '../i18n';
import * as api from '../api';

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

  describe('Execution Pulse & Facet Filtering', () => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const pulseCards: Card[] = [
      {
        id: 101,
        title: 'Tool Spark Alpha',
        summary: 'Developer productivity tool with high worthiness',
        horizon: 'short-term',
        status: 'to-do',
        type: 'tool',
        source_url: 'https://example.com/tool',
        source_note: '',
        tags: ['tools'],
        proposed_actions: ['Install CLI', 'Verify configuration'],
        completed_actions: ['Install CLI'],
        research_state: 'done',
        worthiness: { level: 'high' },
        created_at: new Date(now - 3 * dayMs).toISOString(),
        updated_at: new Date(now - 1 * dayMs).toISOString(),
      },
      {
        id: 102,
        title: 'Repo Spark Beta',
        summary: 'Open source library awaiting review',
        horizon: 'short-term',
        status: 'in-progress',
        type: 'repo',
        source_url: 'https://example.com/repo',
        source_note: '',
        tags: ['open-source'],
        proposed_actions: ['Clone repository', 'Run test suite'],
        completed_actions: ['Clone repository', 'Run test suite'],
        research_verdict: 'pursue',
        worthiness: { level: 'medium' },
        created_at: new Date(now - 20 * dayMs).toISOString(),
        updated_at: new Date(now - 16 * dayMs).toISOString(), // >14 days idle
      },
      {
        id: 103,
        title: 'Article Spark Gamma',
        summary: 'Deep-dive technical article completed this week',
        horizon: 'short-term',
        status: 'done',
        type: 'article',
        source_url: 'https://example.com/article',
        source_note: '',
        tags: ['articles'],
        proposed_actions: [],
        completed_actions: [],
        worthiness: { level: 'low' },
        created_at: new Date(now - 4 * dayMs).toISOString(),
        updated_at: new Date(now - 2 * dayMs).toISOString(), // shipped < 7 days
      },
    ];

    it('renders live Execution Pulse telemetry calculations', () => {
      renderWithProvider(
        <KanbanBoard
          cards={pulseCards}
          horizon="all"
          onHorizonChange={vi.fn()}
          onSelectCard={vi.fn()}
          onUpdateCard={vi.fn()}
          onResearch={vi.fn()}
          onRetry={vi.fn()}
        />
      );

      // Action Progress: 3 of 4 actions completed = 75%
      expect(screen.getByText('3/4 actions (75%)')).toBeDefined();

      // Research Ready count: Card 101 (research_state: 'done') & Card 102 (research_verdict: 'pursue')
      expect(screen.getByText('2 Research Ready')).toBeDefined();

      // Shipped velocity: Card 103 completed 2 days ago (< 7 days)
      expect(screen.getByText('1 shipped this week')).toBeDefined();

      // Idle count: Card 102 untouched for 16 days (> 14 days)
      expect(screen.getByRole('button', { name: /1 idle \(14d\+\)/i })).toBeDefined();
    });

    it('toggles filtering cards when clicking Research Ready pill', () => {
      renderWithProvider(
        <KanbanBoard
          cards={pulseCards}
          horizon="all"
          onHorizonChange={vi.fn()}
          onSelectCard={vi.fn()}
          onUpdateCard={vi.fn()}
          onResearch={vi.fn()}
          onRetry={vi.fn()}
        />
      );

      // Initially all cards are shown
      expect(screen.getByText('Tool Spark Alpha')).toBeDefined();
      expect(screen.getByText('Repo Spark Beta')).toBeDefined();
      expect(screen.getByText('Article Spark Gamma')).toBeDefined();

      // Click the Research Ready pill
      const researchReadyBtn = screen.getByRole('button', { name: /2 research ready/i });
      fireEvent.click(researchReadyBtn);

      // Card 101 and 102 match; Card 103 (article without research) is filtered out
      expect(screen.getByText('Tool Spark Alpha')).toBeDefined();
      expect(screen.getByText('Repo Spark Beta')).toBeDefined();
      expect(screen.queryByText('Article Spark Gamma')).toBeNull();

      // Click again to toggle filter off
      fireEvent.click(researchReadyBtn);
      expect(screen.getByText('Article Spark Gamma')).toBeDefined();
    });

    it('filters to idle cards on clicking idle pill and invokes batchShelveStale on button click', async () => {
      const showToast = vi.fn();
      const onRefresh = vi.fn();
      const shelveSpy = vi.spyOn(api, 'batchShelveStale').mockResolvedValue({
        ok: true,
        shelved_count: 1,
      });

      render(
        <LocaleProvider locale="en">
          <CardActionsProvider value={mockActions}>
            <KanbanBoard
              cards={pulseCards}
              horizon="all"
              onHorizonChange={vi.fn()}
              onSelectCard={vi.fn()}
              onUpdateCard={vi.fn()}
              onResearch={vi.fn()}
              onRetry={vi.fn()}
              showToast={showToast}
              onRefresh={onRefresh}
            />
          </CardActionsProvider>
        </LocaleProvider>
      );

      // Click Idle 14d+ pill
      const idlePill = screen.getByRole('button', { name: /1 idle \(14d\+\)/i });
      fireEvent.click(idlePill);

      // Only Card 102 (idle) is rendered
      expect(screen.getByText('Repo Spark Beta')).toBeDefined();
      expect(screen.queryByText('Tool Spark Alpha')).toBeNull();
      expect(screen.queryByText('Article Spark Gamma')).toBeNull();

      // Click 1-click batch shelve idle button
      const shelveBtn = screen.getByRole('button', { name: /shelve idle/i });
      fireEvent.click(shelveBtn);

      await waitFor(() => {
        expect(shelveSpy).toHaveBeenCalledWith(14);
        expect(showToast).toHaveBeenCalledWith(
          expect.stringContaining('Shelved 1 idle cards')
        );
        expect(onRefresh).toHaveBeenCalled();
      });

      shelveSpy.mockRestore();
    });

    it('filters cards by Card Type facet dropdown and local sorting', () => {
      renderWithProvider(
        <KanbanBoard
          cards={pulseCards}
          horizon="all"
          onHorizonChange={vi.fn()}
          onSelectCard={vi.fn()}
          onUpdateCard={vi.fn()}
          onResearch={vi.fn()}
          onRetry={vi.fn()}
        />
      );

      // Card Type filter: select 'tool'
      const typeSelect = screen.getByRole('combobox', { name: /all types/i });
      fireEvent.change(typeSelect, { target: { value: 'tool' } });

      // Only Card 101 (tool) is rendered
      expect(screen.getByText('Tool Spark Alpha')).toBeDefined();
      expect(screen.queryByText('Repo Spark Beta')).toBeNull();
      expect(screen.queryByText('Article Spark Gamma')).toBeNull();

      // Reset Card Type filter to 'all'
      fireEvent.change(typeSelect, { target: { value: 'all' } });
      expect(screen.getByText('Repo Spark Beta')).toBeDefined();

      // Sort Order: change to 'worthiness'
      const sortSelect = screen.getByRole('combobox', { name: /sort:/i });
      fireEvent.change(sortSelect, { target: { value: 'worthiness' } });

      // All cards remain visible
      expect(screen.getByText('Tool Spark Alpha')).toBeDefined();
      expect(screen.getByText('Repo Spark Beta')).toBeDefined();
    });

    it('interacts with inline action checklist directly on board cards', () => {
      const onUpdateCard = vi.fn();
      const showToast = vi.fn();
      const boardCardsWithActions: Card[] = [
        {
          id: 501,
          title: 'To Do Card With Steps',
          summary: 'Testing next step on board',
          status: 'to-do',
          horizon: 'short-term',
          type: 'idea',
          proposed_actions: ['Step Alpha', 'Step Beta'],
          completed_actions: [],
          source_url: '',
          source_note: '',
          tags: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 502,
          title: 'In Progress Card With Final Step',
          summary: 'Testing final step completion on board',
          status: 'in-progress',
          horizon: 'short-term',
          type: 'idea',
          proposed_actions: ['Step One', 'Step Two'],
          completed_actions: ['Step One'],
          source_url: '',
          source_note: '',
          tags: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      render(
        <LocaleProvider locale="en">
          <CardActionsProvider value={{ ...mockActions, onUpdateCard, showToast }}>
            <KanbanBoard
              cards={boardCardsWithActions}
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

      // Check Next Step on 501
      const nextStepCheckbox = screen.getByRole('checkbox', { name: /next: step alpha/i });
      fireEvent.click(nextStepCheckbox);

      expect(onUpdateCard).toHaveBeenCalledWith(501, {
        status: 'in-progress',
        completed_actions: ['Step Alpha'],
      });
      expect(showToast).toHaveBeenCalledWith(
        'Started #501 → In Progress',
        expect.any(Function)
      );

      // Check final step on 502
      const finalStepCheckbox = screen.getByLabelText('Step Two');
      fireEvent.click(finalStepCheckbox);

      expect(onUpdateCard).toHaveBeenCalledWith(502, {
        status: 'done',
        completed_actions: ['Step One', 'Step Two'],
      });
      expect(showToast).toHaveBeenCalledWith(
        'All steps completed! Moved #502 → Done',
        expect.any(Function)
      );
    });
  });
});
