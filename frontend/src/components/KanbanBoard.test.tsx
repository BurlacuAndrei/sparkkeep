import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
      expect(screen.getAllByText('Tool Spark Alpha').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Repo Spark Beta').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Article Spark Gamma')).toBeDefined();

      // Click the Research Ready pill
      const researchReadyBtn = screen.getByRole('button', { name: /2 research ready/i });
      fireEvent.click(researchReadyBtn);

      // Card 101 and 102 match; Card 103 (article without research) is filtered out
      expect(screen.getAllByText('Tool Spark Alpha').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Repo Spark Beta').length).toBeGreaterThanOrEqual(1);
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
      expect(screen.getAllByText('Repo Spark Beta').length).toBeGreaterThanOrEqual(1);
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
      expect(screen.getAllByText('Tool Spark Alpha').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('Repo Spark Beta')).toBeNull();
      expect(screen.queryByText('Article Spark Gamma')).toBeNull();

      // Reset Card Type filter to 'all'
      fireEvent.change(typeSelect, { target: { value: 'all' } });
      expect(screen.getAllByText('Repo Spark Beta').length).toBeGreaterThanOrEqual(1);

      // Sort Order: change to 'worthiness'
      const sortSelect = screen.getByRole('combobox', { name: /sort:/i });
      fireEvent.change(sortSelect, { target: { value: 'worthiness' } });

      // All cards remain visible
      expect(screen.getAllByText('Tool Spark Alpha').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Repo Spark Beta').length).toBeGreaterThanOrEqual(1);
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

  describe('Focus Spotlight Recommendation Banner', () => {
    const spotlightCards: Card[] = [
      {
        id: 201,
        title: 'To Do Card With Steps',
        summary: 'To Do Card Summary',
        status: 'to-do',
        horizon: 'short-term',
        type: 'idea',
        worthiness: { level: 'high' },
        research_verdict: 'pursue',
        proposed_actions: ['Setup repository', 'Write spec'],
        completed_actions: [],
        source_url: '',
        source_note: '',
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 202,
        title: 'In Progress Card Closest To Done',
        summary: 'In Progress Card Summary',
        status: 'in-progress',
        horizon: 'short-term',
        type: 'tool',
        worthiness: { level: 'medium' },
        proposed_actions: ['Step A', 'Step B', 'Step C'],
        completed_actions: ['Step A', 'Step B'], // 1 remaining!
        source_url: '',
        source_note: '',
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 203,
        title: 'In Progress Card Further From Done',
        summary: 'In Progress Further Summary',
        status: 'in-progress',
        horizon: 'short-term',
        type: 'repo',
        worthiness: { level: 'high' },
        proposed_actions: ['Action 1', 'Action 2'],
        completed_actions: [], // 2 remaining
        source_url: '',
        source_note: '',
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    it('renders candidate with fewest remaining steps (in-progress closest to done > to-do)', () => {
      const onSelectCard = vi.fn();

      render(
        <LocaleProvider locale="en">
          <CardActionsProvider value={mockActions}>
            <KanbanBoard
              cards={spotlightCards}
              horizon="all"
              onHorizonChange={vi.fn()}
              onSelectCard={onSelectCard}
              onUpdateCard={vi.fn()}
              onResearch={vi.fn()}
              onRetry={vi.fn()}
            />
          </CardActionsProvider>
        </LocaleProvider>
      );

      const spotlight = screen.getByRole('region', { name: /focus spotlight/i });
      expect(spotlight).toBeDefined();

      // Card 202 has 1 remaining step vs Card 203 (2 steps) and Card 201 (to-do)
      expect(spotlight.textContent).toContain('In Progress Card Closest To Done');
      expect(spotlight.textContent).toContain('Next Step: Step C');
      expect(spotlight.textContent).toContain('2/3 done');

      // Clicking card title calls onSelectCard
      const cardTitle = screen.getByTitle('In Progress Card Closest To Done');
      fireEvent.click(cardTitle);
      expect(onSelectCard).toHaveBeenCalledWith(spotlightCards[1]);
    });

    it('cycles suggestions on clicking Next Suggestion (↻)', () => {
      render(
        <LocaleProvider locale="en">
          <CardActionsProvider value={mockActions}>
            <KanbanBoard
              cards={spotlightCards}
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

      const spotlight = screen.getByRole('region', { name: /focus spotlight/i });
      expect(spotlight.textContent).toContain('In Progress Card Closest To Done');

      const cycleBtn = screen.getByRole('button', { name: /next suggestion/i });

      // 1st cycle: Card 203 (2 remaining steps)
      fireEvent.click(cycleBtn);
      expect(spotlight.textContent).toContain('In Progress Card Further From Done');
      expect(spotlight.textContent).toContain('Next Step: Action 1');

      // 2nd cycle: Card 201 (to-do)
      fireEvent.click(cycleBtn);
      expect(spotlight.textContent).toContain('To Do Card With Steps');
      expect(spotlight.textContent).toContain('Next Step: Setup repository');

      // 3rd cycle: loops back to Card 202
      fireEvent.click(cycleBtn);
      expect(spotlight.textContent).toContain('In Progress Card Closest To Done');
    });

    it('pins and unpins active cards with localStorage persistence', () => {
      render(
        <LocaleProvider locale="en">
          <CardActionsProvider value={mockActions}>
            <KanbanBoard
              cards={spotlightCards}
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

      const spotlight = screen.getByRole('region', { name: /focus spotlight/i });
      expect(spotlight.textContent).toContain('In Progress Card Closest To Done');

      // Pin Card 202
      const pinBtn = screen.getByRole('button', { name: /pin as focus/i });
      fireEvent.click(pinBtn);

      expect(localStorage.getItem('sparkkeep_board_focus_id')).toBe('202');
      expect(screen.getByRole('button', { name: /unpin focus/i })).toBeDefined();

      // Unpin Card 202
      const unpinBtn = screen.getByRole('button', { name: /unpin focus/i });
      fireEvent.click(unpinBtn);
      expect(localStorage.getItem('sparkkeep_board_focus_id')).toBeNull();
      expect(screen.getByRole('button', { name: /pin as focus/i })).toBeDefined();
    });

    it('honors pre-pinned focus card from localStorage', () => {
      localStorage.setItem('sparkkeep_board_focus_id', '201');

      render(
        <LocaleProvider locale="en">
          <CardActionsProvider value={mockActions}>
            <KanbanBoard
              cards={spotlightCards}
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

      const spotlight = screen.getByRole('region', { name: /focus spotlight/i });
      // Card 201 is pinned, so it overrides normal ranking
      expect(spotlight.textContent).toContain('To Do Card With Steps');
      expect(screen.getByRole('button', { name: /unpin focus/i })).toBeDefined();
    });

    it('completes step for to-do card and moves to in-progress with Undo', () => {
      const onUpdateCard = vi.fn();
      const showToast = vi.fn();
      localStorage.setItem('sparkkeep_board_focus_id', '201');

      render(
        <LocaleProvider locale="en">
          <CardActionsProvider value={{ ...mockActions, onUpdateCard, showToast }}>
            <KanbanBoard
              cards={spotlightCards}
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

      const completeBtn = screen.getByRole('button', { name: /complete step/i });
      fireEvent.click(completeBtn);

      expect(onUpdateCard).toHaveBeenCalledWith(201, {
        status: 'in-progress',
        completed_actions: ['Setup repository'],
      });
      expect(showToast).toHaveBeenCalledWith(
        'Moved card #201 → In Progress',
        expect.any(Function)
      );
    });

    it('completes final step for in-progress card, marks done, and shows autoMovedDone toast', () => {
      const onUpdateCard = vi.fn();
      const showToast = vi.fn();

      render(
        <LocaleProvider locale="en">
          <CardActionsProvider value={{ ...mockActions, onUpdateCard, showToast }}>
            <KanbanBoard
              cards={spotlightCards}
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

      const completeBtn = screen.getByRole('button', { name: /complete step/i });
      fireEvent.click(completeBtn);

      expect(onUpdateCard).toHaveBeenCalledWith(202, {
        status: 'done',
        completed_actions: ['Step A', 'Step B', 'Step C'],
      });
      expect(showToast).toHaveBeenCalledWith(
        'All steps completed! Moved #202 → Done',
        expect.any(Function)
      );
    });

    it('collapses and expands spotlight banner with localStorage persistence', () => {
      render(
        <LocaleProvider locale="en">
          <CardActionsProvider value={mockActions}>
            <KanbanBoard
              cards={spotlightCards}
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

      const collapseBtn = screen.getByRole('button', { name: /collapse spotlight/i });
      fireEvent.click(collapseBtn);

      expect(localStorage.getItem('sparkkeep_board_spotlight_collapsed')).toBe('true');
      const spotlight = screen.getByRole('region', { name: /focus spotlight/i });
      expect(spotlight.className).toContain('is-collapsed');

      // Expand it again
      const expandBtn = screen.getByRole('button', { name: /expand spotlight/i });
      fireEvent.click(expandBtn);
      expect(localStorage.getItem('sparkkeep_board_spotlight_collapsed')).toBe('false');
      expect(spotlight.className).not.toContain('is-collapsed');
    });
  });

  describe('Execution Swimlanes (2D Strategic Matrix)', () => {
    const swimlaneCards: Card[] = [
      {
        id: 301,
        title: 'Now Action Tool',
        summary: 'A short term tool card.',
        horizon: 'short-term',
        status: 'to-do',
        type: 'tool',
        source_url: 'https://example.com/tool',
        source_note: 'Tool memo',
        proposed_actions: ['Step 1', 'Step 2'],
        completed_actions: ['Step 1'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ['tool'],
      },
      {
        id: 302,
        title: 'Next Action Repo',
        summary: 'A medium term repo card.',
        horizon: 'medium-term',
        status: 'in-progress',
        type: 'repo',
        source_url: 'https://example.com/repo',
        source_note: 'Repo memo',
        proposed_actions: ['Setup CI', 'Write tests'],
        completed_actions: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ['code'],
      },
      {
        id: 303,
        title: 'Later Action Paper',
        summary: 'A long term paper card.',
        horizon: 'long-term',
        status: 'done',
        type: 'paper',
        source_url: 'https://example.com/paper',
        source_note: 'Paper memo',
        proposed_actions: ['Read section 1'],
        completed_actions: ['Read section 1'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ['ai'],
      },
    ];

    it('switches between Columns and Swimlanes layouts with localStorage persistence', () => {
      render(
        <LocaleProvider locale="en">
          <CardActionsProvider value={mockActions}>
            <KanbanBoard
              cards={swimlaneCards}
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

      // Default is columns
      expect(document.querySelector('.kanban-board[data-view="execution"]')).not.toBeNull();
      expect(document.querySelector('.swimlanes-container')).toBeNull();

      // Click Swimlanes button
      const swimlanesBtn = screen.getByRole('radio', { name: /swimlanes/i });
      fireEvent.click(swimlanesBtn);

      expect(localStorage.getItem('sparkkeep_board_layout')).toBe('swimlanes');
      expect(document.querySelector('.swimlanes-container')).not.toBeNull();
      expect(document.querySelector('.kanban-board[data-view="execution"]')).toBeNull();

      // Click Columns button
      const columnsBtn = screen.getByRole('radio', { name: /columns/i });
      fireEvent.click(columnsBtn);

      expect(localStorage.getItem('sparkkeep_board_layout')).toBe('columns');
      expect(document.querySelector('.kanban-board[data-view="execution"]')).not.toBeNull();
      expect(document.querySelector('.swimlanes-container')).toBeNull();
    });

    it('switches grouping between Horizon and Card Type with localStorage persistence', () => {
      render(
        <LocaleProvider locale="en">
          <CardActionsProvider value={mockActions}>
            <KanbanBoard
              cards={swimlaneCards}
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

      // Switch to swimlanes
      fireEvent.click(screen.getByRole('radio', { name: /swimlanes/i }));

      // By default in swimlanes, grouping is By Horizon
      expect(screen.getByRole('heading', { name: 'Short-term' })).toBeDefined();
      expect(screen.getByRole('heading', { name: 'Medium-term' })).toBeDefined();
      expect(screen.getByRole('heading', { name: 'Long-term' })).toBeDefined();

      // Grouping selector: Click "By Card Type"
      const byTypeBtn = screen.getByRole('radio', { name: /by card type/i });
      fireEvent.click(byTypeBtn);

      expect(localStorage.getItem('sparkkeep_board_swimlane_group')).toBe('type');
      expect(screen.getByRole('heading', { name: 'Tool' })).toBeDefined();
      expect(screen.getByRole('heading', { name: 'Repository' })).toBeDefined();
      expect(screen.getByRole('heading', { name: 'Paper' })).toBeDefined();

      // Switch back to "By Horizon"
      const byHorizonBtn = screen.getByRole('radio', { name: /by horizon/i });
      fireEvent.click(byHorizonBtn);

      expect(localStorage.getItem('sparkkeep_board_swimlane_group')).toBe('horizon');
      expect(screen.getByRole('heading', { name: 'Short-term' })).toBeDefined();
    });

    it('collapses and expands individual swimlane rows', () => {
      render(
        <LocaleProvider locale="en">
          <CardActionsProvider value={mockActions}>
            <KanbanBoard
              cards={swimlaneCards}
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

      fireEvent.click(screen.getByRole('radio', { name: /swimlanes/i }));

      const shortTermRow = document.querySelector('[data-swimlane-row="short-term"]')!;
      expect(shortTermRow).toBeDefined();
      expect(shortTermRow.querySelector('.swimlane-grid')).not.toBeNull();

      // Collapse Short-term row
      const collapseBtn = shortTermRow.querySelector('.swimlane-collapse-btn')!;
      fireEvent.click(collapseBtn);

      expect(shortTermRow.className).toContain('is-collapsed');
      expect(shortTermRow.querySelector('.swimlane-grid')).toBeNull();

      // Expand Short-term row
      const expandBtn = shortTermRow.querySelector('.swimlane-collapse-btn')!;
      fireEvent.click(expandBtn);

      expect(shortTermRow.className).not.toContain('is-collapsed');
      expect(shortTermRow.querySelector('.swimlane-grid')).not.toBeNull();
    });

    it('handles 2D drag-and-drop into Horizon swimlane cell updating status and horizon with Undo', () => {
      const onUpdateCard = vi.fn();
      const showToast = vi.fn();

      render(
        <LocaleProvider locale="en">
          <CardActionsProvider value={mockActions}>
            <KanbanBoard
              cards={swimlaneCards}
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

      fireEvent.click(screen.getByRole('radio', { name: /swimlanes/i }));

      // Target Medium-term Done cell
      const targetCell = screen.getByTestId('swimlane-cell-medium-term-done');
      expect(targetCell).toBeDefined();

      // Drop card 301 (which is currently short-term and to-do)
      fireEvent.drop(targetCell, {
        preventDefault: vi.fn(),
        dataTransfer: {
          getData: vi.fn().mockReturnValue('301'),
        },
      });

      expect(onUpdateCard).toHaveBeenCalledWith(301, {
        status: 'done',
        horizon: 'medium-term',
      });
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining('#301'),
        expect.any(Function)
      );

      // Invoke undo
      const undoCallback = showToast.mock.calls[0][1];
      expect(undoCallback).toBeDefined();
      undoCallback();
      expect(onUpdateCard).toHaveBeenCalledWith(301, {
        status: 'to-do',
        horizon: 'short-term',
      });
    });

    it('handles 2D drag-and-drop into Card Type swimlane cell updating status and type with Undo', () => {
      const onUpdateCard = vi.fn();
      const showToast = vi.fn();

      render(
        <LocaleProvider locale="en">
          <CardActionsProvider value={mockActions}>
            <KanbanBoard
              cards={swimlaneCards}
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

      fireEvent.click(screen.getByRole('radio', { name: /swimlanes/i }));
      fireEvent.click(screen.getByRole('radio', { name: /by card type/i }));

      // Target 'repo' row, 'done' cell
      const targetCell = screen.getByTestId('swimlane-cell-repo-done');
      expect(targetCell).toBeDefined();

      // Drop card 301 (which is currently type: 'tool', status: 'to-do')
      fireEvent.drop(targetCell, {
        preventDefault: vi.fn(),
        dataTransfer: {
          getData: vi.fn().mockReturnValue('301'),
        },
      });

      expect(onUpdateCard).toHaveBeenCalledWith(301, {
        status: 'done',
        type: 'repo',
      });
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining('#301'),
        expect.any(Function)
      );

      // Undo reverts status and type
      const undoCallback = showToast.mock.calls[0][1];
      expect(undoCallback).toBeDefined();
      undoCallback();
      expect(onUpdateCard).toHaveBeenCalledWith(301, {
        status: 'to-do',
        type: 'tool',
      });
    });
  });

  describe('Ticket 05: Docked Board Inspector & Keyboard Navigation', () => {
    const inspectorCards: Card[] = [
      {
        id: 501,
        title: 'Alpha Architecture Spark',
        summary: 'Evaluate architectural seams for modular execution',
        tldr: 'TLDR for Alpha Spark',
        why_care: 'High leverage architectural refactor',
        horizon: 'short-term',
        status: 'to-do',
        source_url: 'https://github.com/sparkkeep/core',
        source_note: 'Architecture memo',
        type: 'repo',
        proposed_actions: ['Design Seams', 'Draft RFC', 'Implement Adapter'],
        completed_actions: ['Design Seams'],
        claims: ['Zero CLS layout', '100% test coverage'],
        open_questions: ['What is the memory footprint?'],
        research_verdict: 'pursue',
        research_confidence: 'high',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ['architecture'],
      },
      {
        id: 502,
        title: 'Beta Telemetry Pipeline',
        summary: 'Collect workspace metrics in real time',
        tldr: 'TLDR for Beta Telemetry',
        why_care: 'Actionable real-time insights',
        horizon: 'medium-term',
        status: 'in-progress',
        source_url: 'https://example.com/telemetry',
        source_note: 'Telemetry docs',
        type: 'tool',
        proposed_actions: ['Install telemetry client', 'Verify payload'],
        completed_actions: ['Install telemetry client'],
        research_verdict: 'watch',
        research_confidence: 'medium',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ['telemetry'],
      },
      {
        id: 503,
        title: 'Gamma Obsidian Exporter',
        summary: 'Direct knowledge sync with markdown vaults',
        horizon: 'long-term',
        status: 'done',
        source_url: 'https://example.com/obsidian',
        source_note: 'Obsidian vault guide',
        type: 'article',
        proposed_actions: ['Format vault notes'],
        completed_actions: ['Format vault notes'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ['obsidian'],
      },
    ];

    it('single-clicking a card on widescreen (>= 1200px) opens docked Board Inspector', () => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1400 });
      const onSelectCard = vi.fn();

      render(
        <LocaleProvider locale="en">
          <CardActionsProvider value={mockActions}>
            <KanbanBoard
              cards={inspectorCards}
              horizon="all"
              onHorizonChange={vi.fn()}
              onSelectCard={onSelectCard}
              onUpdateCard={vi.fn()}
              onResearch={vi.fn()}
              onRetry={vi.fn()}
            />
          </CardActionsProvider>
        </LocaleProvider>
      );

      // Single-click card 501
      const cardTitle = screen.getByText('Alpha Architecture Spark');
      fireEvent.click(cardTitle);

      // Board Inspector should be open, onSelectCard should NOT have been called
      expect(onSelectCard).not.toHaveBeenCalled();
      const inspector = screen.getByTestId('board-inspector');
      expect(inspector).toBeDefined();
      expect(inspector.textContent).toContain('Alpha Architecture Spark');
      expect(inspector.textContent).toContain('TLDR for Alpha Spark');
      expect(inspector.textContent).toContain('High leverage architectural refactor');
      expect(inspector.textContent).toContain('Zero CLS layout');
      expect(inspector.textContent).toContain('What is the memory footprint?');
    });

    it('single-clicking a card on narrower viewport (< 1200px) directly invokes onSelectCard', () => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 900 });
      const onSelectCard = vi.fn();

      render(
        <LocaleProvider locale="en">
          <CardActionsProvider value={mockActions}>
            <KanbanBoard
              cards={inspectorCards}
              horizon="all"
              onHorizonChange={vi.fn()}
              onSelectCard={onSelectCard}
              onUpdateCard={vi.fn()}
              onResearch={vi.fn()}
              onRetry={vi.fn()}
            />
          </CardActionsProvider>
        </LocaleProvider>
      );

      const cardTitle = screen.getByText('Alpha Architecture Spark');
      fireEvent.click(cardTitle);

      expect(onSelectCard).toHaveBeenCalledWith(inspectorCards[0]);
      expect(screen.queryByTestId('board-inspector')).toBeNull();
    });

    it('double-clicking a card on widescreen invokes onSelectCard to open full modal', () => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1400 });
      const onSelectCard = vi.fn();

      render(
        <LocaleProvider locale="en">
          <CardActionsProvider value={mockActions}>
            <KanbanBoard
              cards={inspectorCards}
              horizon="all"
              onHorizonChange={vi.fn()}
              onSelectCard={onSelectCard}
              onUpdateCard={vi.fn()}
              onResearch={vi.fn()}
              onRetry={vi.fn()}
            />
          </CardActionsProvider>
        </LocaleProvider>
      );

      const cardTitle = screen.getByText('Alpha Architecture Spark');
      fireEvent.doubleClick(cardTitle);

      expect(onSelectCard).toHaveBeenCalledWith(inspectorCards[0]);
    });

    it('allows toggling checklist items, adding steps, and removing steps inside Board Inspector with Undo', () => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1400 });
      const onUpdateCard = vi.fn();
      const showToast = vi.fn();

      render(
        <LocaleProvider locale="en">
          <CardActionsProvider value={mockActions}>
            <KanbanBoard
              cards={inspectorCards}
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

      // Open inspector for card 501
      fireEvent.click(screen.getByText('Alpha Architecture Spark'));
      const inspector = screen.getByTestId('board-inspector');
      expect(inspector).toBeDefined();

      // Check 'Draft RFC'
      const draftRfcCheckbox = within(inspector).getByLabelText('Draft RFC');
      fireEvent.click(draftRfcCheckbox);

      expect(onUpdateCard).toHaveBeenCalledWith(501, {
        completed_actions: ['Design Seams', 'Draft RFC'],
      });
      expect(showToast).toHaveBeenCalled();

      // Undo step toggle
      const undoToggle = showToast.mock.calls[showToast.mock.calls.length - 1][1];
      undoToggle();
      expect(onUpdateCard).toHaveBeenCalledWith(501, {
        completed_actions: ['Design Seams'],
      });

      // Add a new step
      const addInput = within(inspector).getByPlaceholderText('Add an action...');
      fireEvent.change(addInput, { target: { value: 'Deploy Canary' } });
      fireEvent.click(within(inspector).getByRole('button', { name: /add/i }));

      expect(onUpdateCard).toHaveBeenCalledWith(501, {
        proposed_actions: ['Design Seams', 'Draft RFC', 'Implement Adapter', 'Deploy Canary'],
      });

      // Remove step 'Implement Adapter'
      const removeButtons = within(inspector).getAllByRole('button', { name: 'Remove action' });
      fireEvent.click(removeButtons[2]); // 3rd item: 'Implement Adapter'

      expect(onUpdateCard).toHaveBeenCalledWith(501, {
        proposed_actions: ['Design Seams', 'Draft RFC'],
        completed_actions: ['Design Seams'],
      });
    });

    it('checking final step on in-progress card auto-moves to done with Undo', () => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1400 });
      const onUpdateCard = vi.fn();
      const showToast = vi.fn();

      render(
        <LocaleProvider locale="en">
          <CardActionsProvider value={mockActions}>
            <KanbanBoard
              cards={inspectorCards}
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

      // Open inspector for card 502 (in-progress, 'Verify payload' unchecked)
      const card502 = document.querySelector('.card[data-id="502"]');
      expect(card502).toBeDefined();
      fireEvent.click(card502!);

      const inspector = screen.getByTestId('board-inspector');
      // Check 'Verify payload' inside inspector
      const verifyCheckbox = within(inspector).getByLabelText('Verify payload');
      fireEvent.click(verifyCheckbox);

      expect(onUpdateCard).toHaveBeenCalledWith(502, {
        status: 'done',
        completed_actions: ['Install telemetry client', 'Verify payload'],
      });
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining('#502'),
        expect.any(Function)
      );

      // Undo auto-move
      const undoAutoDone = showToast.mock.calls[showToast.mock.calls.length - 1][1];
      undoAutoDone();
      expect(onUpdateCard).toHaveBeenCalledWith(502, {
        status: 'in-progress',
        completed_actions: ['Install telemetry client'],
      });
    });

    it('updates status and horizon via inspector quick selectors with Undo', () => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1400 });
      const onUpdateCard = vi.fn();
      const showToast = vi.fn();

      render(
        <LocaleProvider locale="en">
          <CardActionsProvider value={mockActions}>
            <KanbanBoard
              cards={inspectorCards}
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

      fireEvent.click(screen.getByText('Alpha Architecture Spark'));

      // Change status to in-progress
      const inProgressBtn = screen.getByRole('radio', { name: /in progress/i });
      fireEvent.click(inProgressBtn);

      expect(onUpdateCard).toHaveBeenCalledWith(501, { status: 'in-progress' });
      expect(showToast).toHaveBeenCalled();

      // Undo status change
      const undoStatus = showToast.mock.calls[showToast.mock.calls.length - 1][1];
      undoStatus();
      expect(onUpdateCard).toHaveBeenCalledWith(501, { status: 'to-do' });

      // Change horizon to long-term
      const laterBtn = screen.getByRole('radio', { name: /long-term/i });
      fireEvent.click(laterBtn);

      expect(onUpdateCard).toHaveBeenCalledWith(501, { horizon: 'long-term' });
      expect(showToast).toHaveBeenCalled();

      // Undo horizon change
      const undoHorizon = showToast.mock.calls[showToast.mock.calls.length - 1][1];
      undoHorizon();
      expect(onUpdateCard).toHaveBeenCalledWith(501, { horizon: 'short-term' });
    });

    it('inspector expand button promotes to full modal and close button closes inspector', () => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1400 });
      const onSelectCard = vi.fn();

      render(
        <LocaleProvider locale="en">
          <CardActionsProvider value={mockActions}>
            <KanbanBoard
              cards={inspectorCards}
              horizon="all"
              onHorizonChange={vi.fn()}
              onSelectCard={onSelectCard}
              onUpdateCard={vi.fn()}
              onResearch={vi.fn()}
              onRetry={vi.fn()}
            />
          </CardActionsProvider>
        </LocaleProvider>
      );

      fireEvent.click(screen.getByText('Alpha Architecture Spark'));
      expect(screen.getByTestId('board-inspector')).toBeDefined();

      // Click Expand button
      const expandBtn = screen.getByRole('button', { name: 'Expand to Full Modal' });
      fireEvent.click(expandBtn);
      expect(onSelectCard).toHaveBeenCalledWith(inspectorCards[0]);

      // Click Close button
      const closeBtn = screen.getByRole('button', { name: 'Close Inspector' });
      fireEvent.click(closeBtn);
      expect(screen.queryByTestId('board-inspector')).toBeNull();
    });

    it('keyboard navigation: j/k moves focus ring, Space toggles inspector, o/Enter opens full modal', () => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1400 });
      const onSelectCard = vi.fn();

      render(
        <LocaleProvider locale="en">
          <CardActionsProvider value={mockActions}>
            <KanbanBoard
              cards={inspectorCards}
              horizon="all"
              onHorizonChange={vi.fn()}
              onSelectCard={onSelectCard}
              onUpdateCard={vi.fn()}
              onResearch={vi.fn()}
              onRetry={vi.fn()}
            />
          </CardActionsProvider>
        </LocaleProvider>
      );

      // Press 'j' -> moves focus to first card (501)
      fireEvent.keyDown(window, { key: 'j' });
      const card501 = document.querySelector('.card[data-id="501"]');
      expect(card501?.classList.contains('is-keyboard-focused')).toBe(true);

      // Press 'j' -> moves focus to second card (502)
      fireEvent.keyDown(window, { key: 'j' });
      const card502 = document.querySelector('.card[data-id="502"]');
      expect(card502?.classList.contains('is-keyboard-focused')).toBe(true);
      expect(card501?.classList.contains('is-keyboard-focused')).toBe(false);

      // Press 'k' -> moves focus back to first card (501)
      fireEvent.keyDown(window, { key: 'k' });
      expect(card501?.classList.contains('is-keyboard-focused')).toBe(true);

      // Press 'Space' -> opens inspector for card 501
      fireEvent.keyDown(window, { key: ' ' });
      const inspector = screen.getByTestId('board-inspector');
      expect(inspector.textContent).toContain('Alpha Architecture Spark');

      // Press 'j' while inspector is open -> inspector updates to card 502
      fireEvent.keyDown(window, { key: 'j' });
      expect(screen.getByTestId('board-inspector').textContent).toContain('Beta Telemetry Pipeline');

      // Press 'o' -> opens full modal for focused card 502
      fireEvent.keyDown(window, { key: 'o' });
      expect(onSelectCard).toHaveBeenCalledWith(inspectorCards[1]);
    });

    it('keyboard navigation: [/] changes status, 1/2/3 sets horizon, f toggles pin focus', () => {
      const onUpdateCard = vi.fn();
      const showToast = vi.fn();

      render(
        <LocaleProvider locale="en">
          <CardActionsProvider value={mockActions}>
            <KanbanBoard
              cards={inspectorCards}
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

      // Focus card 501
      fireEvent.keyDown(window, { key: 'j' });

      // Press ']' -> move status to-do -> in-progress
      fireEvent.keyDown(window, { key: ']' });
      expect(onUpdateCard).toHaveBeenCalledWith(501, { status: 'in-progress' });

      // Press '2' -> set horizon to medium-term
      fireEvent.keyDown(window, { key: '2' });
      expect(onUpdateCard).toHaveBeenCalledWith(501, { horizon: 'medium-term' });

      // Press '3' -> set horizon to long-term
      fireEvent.keyDown(window, { key: '3' });
      expect(onUpdateCard).toHaveBeenCalledWith(501, { horizon: 'long-term' });

      // Press 'f' -> pin card 501 to focus spotlight
      fireEvent.keyDown(window, { key: 'f' });
      expect(localStorage.getItem('sparkkeep_board_focus_id')).toBe('501');

      // Press 'f' again -> unpins card 501
      fireEvent.keyDown(window, { key: 'f' });
      expect(localStorage.getItem('sparkkeep_board_focus_id')).toBeNull();
    });

    it('keyboard navigation: ? opens Board Shortcuts modal and Escape closes it', () => {
      render(
        <LocaleProvider locale="en">
          <CardActionsProvider value={mockActions}>
            <KanbanBoard
              cards={inspectorCards}
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

      // Press '?'
      fireEvent.keyDown(window, { key: '?' });
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByText('Board Keyboard Shortcuts')).toBeDefined();
      expect(screen.getByText('Navigate cards')).toBeDefined();
      expect(screen.getByText('Toggle Inspector')).toBeDefined();
      expect(screen.getByText('Open Full Card Modal')).toBeDefined();

      // Press 'Escape'
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
