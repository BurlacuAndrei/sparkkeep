import React from 'react';
import { Card } from '../types';
import { Inbox, Search, Eye, Layers, ArrowRight, X } from 'lucide-react';
import { CardItem } from './CardItem';

interface TriageViewProps {
  cards: Card[];
  onUpdateCard: (id: number, patch: Partial<Card>) => void;
  onResearch: (id: number, playbookId?: number) => void;
  onRetry: (id: number) => void;
  onOpenCardDetail: (card: Card) => void;
  onRefresh?: () => void;
  isPro?: boolean;
  onOpenLicenseModal?: () => void;
  showToast?: (msg: string, onUndo?: () => Promise<void> | void) => void;
  onExitFocus?: () => void;
}

export const TriageView: React.FC<TriageViewProps> = ({
  cards,
  onUpdateCard,
  onResearch,
  onRetry,
  onOpenCardDetail,
  showToast,
}) => {
  const isResearchRunning = (c: Card) =>
    c.status === 'researching' ||
    ((c.status === 'inbox' || !c.status) && (c.research_state === 'queued' || c.research_state === 'running'));

  const researchingCards = cards.filter(isResearchRunning);
  const inboxCards = cards.filter((c) => (c.status === 'inbox' || !c.status) && !isResearchRunning(c));
  const reviewCards = cards.filter((c) => c.status === 'review');

  const triageTotal = inboxCards.length + researchingCards.length + reviewCards.length;

  // Calculate siblings by capture_id across all cards
  const captureCounts = cards.reduce<Record<number, number>>((acc, c) => {
    if (c.capture_id) {
      acc[c.capture_id] = (acc[c.capture_id] || 0) + 1;
    }
    return acc;
  }, {});

  // Group Inbox cards into Multi-Card Stacks vs Single Cards
  const stackMap = new Map<number, Card[]>();
  const standaloneInboxCards: Card[] = [];

  inboxCards.forEach((c) => {
    if (c.capture_id) {
      const arr = stackMap.get(c.capture_id) || [];
      arr.push(c);
      stackMap.set(c.capture_id, arr);
    } else {
      standaloneInboxCards.push(c);
    }
  });

  const multiStacks: { captureId: number; cards: Card[] }[] = [];
  stackMap.forEach((stackCards, captureId) => {
    if (stackCards.length > 1) {
      multiStacks.push({ captureId, cards: stackCards });
    } else {
      standaloneInboxCards.push(stackCards[0]);
    }
  });

  const handleStatusChange = (id: number, status: string) => {
    onUpdateCard(id, { status: status as any });
  };

  const renderSingleCard = (card: Card) => {
    const sibCount = card.capture_id ? captureCounts[card.capture_id] : undefined;
    return (
      <CardItem
        key={card.id}
        card={card}
        siblingCount={sibCount}
        onSelect={onOpenCardDetail}
        onStatusChange={handleStatusChange}
        onResearch={onResearch}
        onRetry={onRetry}
      />
    );
  };

  const handleCommitAllInStack = (stackCards: Card[]) => {
    stackCards.forEach((c) => {
      onUpdateCard(c.id, { status: 'to-do' as any, horizon: (c.suggested_horizon || c.horizon || 'short-term') as any });
    });
    showToast?.(`Committed ${stackCards.length} cards from stack to To Do`, async () => {
      stackCards.forEach((c) => {
        onUpdateCard(c.id, { status: 'inbox' as any });
      });
      showToast?.(`Reverted ${stackCards.length} cards back to Inbox`);
    });
  };

  const handleDismissAllInStack = (stackCards: Card[]) => {
    stackCards.forEach((c) => {
      onUpdateCard(c.id, { status: 'dismissed' as any });
    });
    showToast?.(`Dismissed ${stackCards.length} cards from stack`, async () => {
      stackCards.forEach((c) => {
        onUpdateCard(c.id, { status: 'inbox' as any });
      });
      showToast?.(`Reverted ${stackCards.length} cards back to Inbox`);
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 id="main-heading" style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Idea Funnel</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>({triageTotal} cards triage)</span>
        </h2>
      </div>

      <div className="kanban-board" data-view="triage">
        {/* Inbox Column */}
        <div className="kanban-column">
          <div className="column-header">
            <div className="column-title">
              <Inbox size={15} strokeWidth={1.5} color="#38bdf8" />
              <span>Inbox</span>
            </div>
            <span className="column-count">{inboxCards.length}</span>
          </div>
          <div className="cards-container">
            {inboxCards.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                Inbox zero! Great job.
              </div>
            ) : (
              <>
                {/* 1. Multi-Card Capture Stacks */}
                {multiStacks.map((stack) => (
                  <div key={stack.captureId} className="triage-stack-card">
                    <div className="triage-stack-header">
                      <div className="triage-stack-meta">
                        <Layers size={13} color="#818cf8" />
                        <span>{stack.cards.length} ideas from Capture #{stack.captureId}</span>
                      </div>
                      <div className="triage-stack-actions">
                        <button
                          type="button"
                          className="card-primary-action-btn commit"
                          onClick={() => handleCommitAllInStack(stack.cards)}
                          title="Commit all cards from this capture stack"
                        >
                          <ArrowRight size={11} />
                          <span>Commit All</span>
                        </button>
                        <button
                          type="button"
                          className="card-primary-action-btn skip"
                          onClick={() => handleDismissAllInStack(stack.cards)}
                          title="Dismiss rest from this capture stack"
                        >
                          <X size={11} />
                          <span>Dismiss Rest</span>
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {stack.cards.map((c, i) => (
                        <CardItem
                          key={c.id}
                          card={c}
                          siblingCount={stack.cards.length}
                          siblingIndex={i + 1}
                          onSelect={onOpenCardDetail}
                          onStatusChange={handleStatusChange}
                          onResearch={onResearch}
                          onRetry={onRetry}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                {/* 2. Standalone Cards */}
                {standaloneInboxCards.map(renderSingleCard)}
              </>
            )}
          </div>
        </div>

        {/* Researching Column */}
        <div className="kanban-column">
          <div className="column-header">
            <div className="column-title">
              <Search size={15} strokeWidth={1.5} color="#c084fc" />
              <span>Researching</span>
            </div>
            <span className="column-count">{researchingCards.length}</span>
          </div>
          <div className="cards-container">
            {researchingCards.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                No active research in progress.
              </div>
            ) : (
              researchingCards.map(renderSingleCard)
            )}
          </div>
        </div>

        {/* Review Column */}
        <div className="kanban-column">
          <div className="column-header">
            <div className="column-title">
              <Eye size={15} strokeWidth={1.5} color="#f472b6" />
              <span>Review</span>
            </div>
            <span className="column-count">{reviewCards.length}</span>
          </div>
          <div className="cards-container">
            {reviewCards.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                No reports to review.
              </div>
            ) : (
              reviewCards.map(renderSingleCard)
            )}
          </div>
        </div>
      </div>
    </div>
  );
};