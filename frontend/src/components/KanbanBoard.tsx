import React, { useState } from 'react';
import { Card } from '../types';
import { CardItem } from './CardItem';
import { Zap, CheckCircle2, ListTodo } from 'lucide-react';
import * as api from '../api';

interface KanbanBoardProps {
  cards: Card[];
  horizon: string;
  onHorizonChange: (h: string) => void;
  onSelectCard: (card: Card) => void;
  onUpdateCard: (id: number, patch: Partial<Card>) => void;
  onResearch: (id: number) => void;
  onRetry: (id: number) => void;
  isPro?: boolean;
  onOpenLicenseModal?: () => void;
  showToast?: (msg: string) => void;
  onRefresh?: () => void;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  cards,
  horizon,
  onHorizonChange,
  onSelectCard,
  onUpdateCard,
  onResearch,
  onRetry,
  showToast,
}) => {
  const [showArchivedDone, setShowArchivedDone] = useState(false);

  const boardCards = cards.filter((c) => c.status !== 'dismissed' && c.status !== 'shelved');

  const shortCount = boardCards.filter((c) => (c.horizon || 'short-term') === 'short-term').length;
  const mediumCount = boardCards.filter((c) => c.horizon === 'medium-term').length;
  const longCount = boardCards.filter((c) => c.horizon === 'long-term').length;
  const allCount = boardCards.length;

  const horizonTabs = [
    { id: 'short-term', label: 'Short-Term', count: shortCount, colorClass: 'short-term' },
    { id: 'medium-term', label: 'Medium-Term', count: mediumCount, colorClass: 'medium-term' },
    { id: 'long-term', label: 'Long-Term', count: longCount, colorClass: 'long-term' },
    { id: 'all', label: 'All Horizons', count: allCount, colorClass: 'all' },
  ];

  const activeHorizon = horizon || 'all';

  const displayedCards = activeHorizon !== 'all'
    ? boardCards.filter((c) => (c.horizon || 'short-term') === activeHorizon)
    : boardCards;

  const todoCards = displayedCards.filter((c) => c.status === 'to-do');
  const inProgressCards = displayedCards.filter((c) => c.status === 'in-progress');
  const doneCards = displayedCards.filter((c) => c.status === 'done');

  const isOlderThan7Days = (card: Card) => {
    const timeStr = card.updated_at || card.created_at;
    if (!timeStr) return false;
    const time = new Date(timeStr).getTime();
    if (isNaN(time)) return false;
    return Date.now() - time > SEVEN_DAYS_MS;
  };

  const activeDoneCards = doneCards.filter((c) => !isOlderThan7Days(c));
  const archivedDoneCards = doneCards.filter((c) => isOlderThan7Days(c));
  const displayedDoneCards = showArchivedDone ? doneCards : activeDoneCards;

  const handleStatusChange = (id: number, status: string) => {
    onUpdateCard(id, { status: status as any });
  };

  const renderCardItem = (card: Card) => (
    <CardItem
      key={card.id}
      card={card}
      onSelect={onSelectCard}
      onStatusChange={handleStatusChange}
      onResearch={onResearch}
      onRetry={onRetry}
    />
  );

  return (
    <div>
      <div className="board-header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 id="main-heading" style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Execution Boards</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>
              ({displayedCards.length}{activeHorizon !== 'all' ? ` of ${boardCards.length}` : ''} cards)
            </span>
          </h2>
        </div>

        <div className="horizon-segmented-control" role="tablist" aria-label="Filter execution board by horizon">
          {horizonTabs.map((tab) => {
            const isActive = activeHorizon === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`horizon-tab-${tab.id}`}
                aria-selected={isActive}
                className={`horizon-segment-btn ${tab.colorClass} ${isActive ? 'active' : ''}`}
                onClick={() => onHorizonChange(tab.id === 'all' ? '' : tab.id)}
              >
                <span className="horizon-segment-label">{tab.label}</span>
                <span className="horizon-segment-count">{tab.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="kanban-board" data-view="execution">
        {/* To Do Column */}
        <div className="kanban-column">
          <div className="column-header">
            <div className="column-title">
              <ListTodo size={15} strokeWidth={1.5} color="#cbd5e1" />
              <span>To Do</span>
            </div>
            <span className="column-count">{todoCards.length}</span>
          </div>
          <div className="cards-container">
            {todoCards.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                Ready for work.
              </div>
            ) : (
              todoCards.map(renderCardItem)
            )}
          </div>
        </div>

        {/* In Progress Column */}
        <div className="kanban-column">
          <div className="column-header">
            <div className="column-title">
              <Zap size={15} strokeWidth={1.5} color="#34d399" />
              <span>In Progress</span>
            </div>
            <span className="column-count">{inProgressCards.length}</span>
          </div>
          <div className="cards-container">
            {inProgressCards.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                No active actions.
              </div>
            ) : (
              inProgressCards.map(renderCardItem)
            )}
          </div>
        </div>

        {/* Done Column */}
        <div className="kanban-column">
          <div className="column-header">
            <div className="column-title">
              <CheckCircle2 size={15} strokeWidth={1.5} color="#a5b4fc" />
              <span>Completed</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: 10, padding: '2px 6px', height: 20 }}
                onClick={async () => {
                  try {
                    const res = await api.syncObsidian();
                    showToast?.(`Synced ${res.written} cards to Obsidian vault`);
                  } catch (err: unknown) {
                    showToast?.(api.getErrorMessage(err));
                  }
                }}
              >
                Sync Obsidian
              </button>
              <span className="column-count">{displayedDoneCards.length}</span>
            </div>
          </div>
          <div className="cards-container">
            {displayedDoneCards.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                Nothing completed yet.
              </div>
            ) : (
              displayedDoneCards.map(renderCardItem)
            )}

            <div style={{ marginTop: 12, paddingBottom: 6, textAlign: 'center' }}>
              <button
                id="link-view-archived"
                type="button"
                onClick={() => setShowArchivedDone(!showArchivedDone)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#818cf8',
                  fontSize: 12,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: '4px 8px',
                }}
              >
                {showArchivedDone
                  ? 'Hide archived'
                  : (archivedDoneCards.length > 0
                      ? `View archived (${archivedDoneCards.length})...`
                      : 'View archived...')}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
