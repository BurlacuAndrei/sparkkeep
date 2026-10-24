import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TriageView } from './TriageView';
import { CardActionsProvider, CardActions } from '../context/CardActionsContext';
import { Card } from '../types';
import * as api from '../api';
import { LocaleProvider } from '../i18n';

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    updateCard: vi.fn().mockResolvedValue({}),
    triggerResearch: vi.fn().mockResolvedValue({}),
  };
});

describe('TriageView', () => {
  const dummyCards: Card[] = [
    {
      id: 101,
      title: 'First Triage Card',
      summary: 'Explore autonomous coding loops',
      status: 'inbox',
      horizon: 'short-term',
      type: 'idea',
      tags: ['ai', 'agent'],
      source_url: 'https://example.com/agents',
      source_note: '',
      created_at: '2026-10-17T10:00:00Z',
      updated_at: '2026-10-17T10:00:00Z',
    },
    {
      id: 102,
      title: 'Second Triage Card',
      summary: 'SQLite WAL mode concurrency analysis',
      status: 'inbox',
      horizon: 'medium-term',
      type: 'tech',
      tags: ['database', 'sqlite'],
      source_url: 'https://example.com/sqlite',
      source_note: '',
      created_at: '2026-10-17T11:00:00Z',
      updated_at: '2026-10-17T11:00:00Z',
    },
  ];

  const mockActions: CardActions = {
    onSelectCard: vi.fn(),
    onStatusChange: vi.fn(),
    onResearch: vi.fn(),
    onRetry: vi.fn(),
    showToast: vi.fn(),
  };

  const renderTriage = (ui: React.ReactElement) => {
    return render(
      <LocaleProvider locale="en">
        <CardActionsProvider value={mockActions}>{ui}</CardActionsProvider>
      </LocaleProvider>
    );
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders Inbox Zero state when cards array is empty', () => {
    renderTriage(
      <TriageView
        cards={[]}
        onUpdateCard={vi.fn()}
        onResearch={vi.fn()}
        onRetry={vi.fn()}
        onOpenCardDetail={vi.fn()}
      />
    );

    expect(screen.getByText('Triage zero')).toBeDefined();
    expect(screen.getByText(/New captures from Telegram or the web will land here/i)).toBeDefined();
  });

  it('renders the top card in deck mode with its title and tags', () => {
    renderTriage(
      <TriageView
        cards={dummyCards}
        onUpdateCard={vi.fn()}
        onResearch={vi.fn()}
        onRetry={vi.fn()}
        onOpenCardDetail={vi.fn()}
      />
    );

    expect(screen.getByText('Second Triage Card')).toBeDefined();
    expect(screen.getByText('#database')).toBeDefined();
    expect(screen.getByText('#sqlite')).toBeDefined();
  });

  it('handles keyboard shortcut "1" to keep card as short-term', async () => {
    const showToast = vi.fn();

    renderTriage(
      <TriageView
        cards={[dummyCards[0]]}
        onUpdateCard={vi.fn()}
        onResearch={vi.fn()}
        onRetry={vi.fn()}
        onOpenCardDetail={vi.fn()}
        showToast={showToast}
      />
    );

    fireEvent.keyDown(window, { key: '1', code: 'Digit1' });

    await waitFor(() => {
      expect(api.updateCard).toHaveBeenCalledWith(101, {
        status: 'to-do',
        horizon: 'short-term',
      });
    });
  });

  it('handles keyboard shortcut "2" to keep card as medium-term', async () => {
    renderTriage(
      <TriageView
        cards={[dummyCards[0]]}
        onUpdateCard={vi.fn()}
        onResearch={vi.fn()}
        onRetry={vi.fn()}
        onOpenCardDetail={vi.fn()}
      />
    );

    fireEvent.keyDown(window, { key: '2', code: 'Digit2' });

    await waitFor(() => {
      expect(api.updateCard).toHaveBeenCalledWith(101, {
        status: 'to-do',
        horizon: 'medium-term',
      });
    });
  });

  it('handles Escape key to dismiss card', async () => {
    const showToast = vi.fn();

    renderTriage(
      <TriageView
        cards={[dummyCards[0]]}
        onUpdateCard={vi.fn()}
        onResearch={vi.fn()}
        onRetry={vi.fn()}
        onOpenCardDetail={vi.fn()}
        showToast={showToast}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(api.updateCard).toHaveBeenCalledWith(101, {
        status: 'dismissed',
      });
    });
  });

  it('switches between deck mode and list mode', () => {
    renderTriage(
      <TriageView
        cards={dummyCards}
        onUpdateCard={vi.fn()}
        onResearch={vi.fn()}
        onRetry={vi.fn()}
        onOpenCardDetail={vi.fn()}
      />
    );

    const listModeBtn = screen.getByRole('tab', { name: /List/i });
    expect(listModeBtn).toBeDefined();

    fireEvent.click(listModeBtn);

    expect(screen.getByText('SQLite WAL mode concurrency analysis')).toBeDefined();

    const deckModeBtn = screen.getByRole('tab', { name: /Deck/i });
    expect(deckModeBtn).toBeDefined();
    fireEvent.click(deckModeBtn);

    expect(screen.getByText('First Triage Card')).toBeDefined();
  });

  it('triggers 5s countdown on research and cancels api.triggerResearch if undone within 2s', async () => {
    vi.useFakeTimers();
    let undoCallback: (() => Promise<void> | void) | undefined;
    const showToast = vi.fn((_msg: string, onUndo?: () => Promise<void> | void) => {
      undoCallback = onUndo;
    });

    renderTriage(
      <TriageView
        cards={[dummyCards[0]]}
        onUpdateCard={vi.fn()}
        onResearch={vi.fn()}
        onRetry={vi.fn()}
        onOpenCardDetail={vi.fn()}
        showToast={showToast}
      />
    );

    // Press 'r' to trigger research
    fireEvent.keyDown(window, { key: 'r', code: 'KeyR' });

    // Wait for exit transition (DECK_EXIT_MS = 320ms)
    vi.advanceTimersByTime(350);

    expect(showToast).toHaveBeenCalled();
    expect(undoCallback).toBeDefined();

    // Advance 2 seconds
    vi.advanceTimersByTime(2000);
    expect(api.triggerResearch).not.toHaveBeenCalled();

    // Click Undo
    if (undoCallback) {
      undoCallback();
    }

    // Advance past remaining 5 seconds
    vi.advanceTimersByTime(5000);

    expect(api.triggerResearch).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('multi-idea cards sharing capture_id display sibling dismissal and discard all matching ideas', async () => {
    const siblingCards: Card[] = [
      {
        id: 201,
        title: 'Idea A from article',
        summary: 'First extracted concept',
        status: 'inbox',
        horizon: 'short-term',
        source_url: 'https://example.com/multi',
        source_note: '',
        tags: [],
        capture_id: 99,
        created_at: '2026-10-17T10:00:00Z',
        updated_at: '2026-10-17T10:00:00Z',
      },
      {
        id: 202,
        title: 'Idea B from article',
        summary: 'Second extracted concept',
        status: 'inbox',
        horizon: 'short-term',
        source_url: 'https://example.com/multi',
        source_note: '',
        tags: [],
        capture_id: 99,
        created_at: '2026-10-17T10:01:00Z',
        updated_at: '2026-10-17T10:01:00Z',
      },
    ];

    renderTriage(
      <TriageView
        cards={siblingCards}
        onUpdateCard={vi.fn()}
        onResearch={vi.fn()}
        onRetry={vi.fn()}
        onOpenCardDetail={vi.fn()}
        showToast={vi.fn()}
      />
    );

    const dismissBtn = screen.getByRole('button', { name: /Dismiss remaining 2/i });
    expect(dismissBtn).toBeDefined();

    fireEvent.click(dismissBtn);

    await waitFor(() => {
      expect(api.updateCard).toHaveBeenCalledWith(201, { status: 'dismissed' });
      expect(api.updateCard).toHaveBeenCalledWith(202, { status: 'dismissed' });
    });
  });
});
