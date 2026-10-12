import React, { useState } from 'react';
import { Card } from '../types';
import { CardItem } from './CardItem';
import { Zap, CheckCircle2, ListTodo, Archive, XCircle, LayoutGrid } from 'lucide-react';
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
  showToast?: (msg: string, onUndo?: () => Promise<void> | void) => void;
  onRefresh?: () => void;
  onSwitchToTriage?: () => void;
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
  onSwitchToTriage,
}) => {
  const [boardMode, setBoardMode] = useState<'active' | 'shelved' | 'dismissed'>('active');
  const [showArchivedDone, setShowArchivedDone] = useState(false);

  const boardCards = cards.filter(
    (c) => c.status === 'to-do' || c.status === 'in-progress' || c.status === 'done'
  );

  const shelvedCards = cards.filter((c) => c.status === 'shelved');
  const dismissedCards = cards.filter((c) => c.status === 'dismissed');

  const triageMatchingCards = cards.filter(
    (c) => c.status === 'inbox' || c.status === 'researching' || c.status === 'review'
  );

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
      {/* Board Mode & Filters Bar */}
      <div className="board-header-bar" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 id="main-heading" style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{boardMode === 'active' ? 'Execution Boards' : boardMode === 'shelved' ? 'Shelf (Later)' : 'Dismissed Cards'}</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>
              ({boardMode === 'active'
                ? `${displayedCards.length}${activeHorizon !== 'all' && displayedCards.length !== boardCards.length ? ` of ${boardCards.length}` : ''} ${displayedCards.length === 1 ? 'card' : 'cards'}`
                : boardMode === 'shelved'
                ? `${shelvedCards.length} cards`
                : `${dismissedCards.length} cards`})
            </span>
          </h2>

          {/* Mode Switcher: Active Board vs Shelved vs Dismissed */}
          <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255, 255, 255, 0.04)', padding: 2, borderRadius: 6, border: '1px solid var(--border-subtle)' }}>
            <button
              type="button"
              className={`board-mode-btn ${boardMode === 'active' ? 'active' : ''}`}
              onClick={() => setBoardMode('active')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 9px',
                fontSize: 11.5,
                fontWeight: 600,
                borderRadius: 4,
                border: 'none',
                background: boardMode === 'active' ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
                color: boardMode === 'active' ? '#e0e7ff' : '#94a3b8',
                cursor: 'pointer',
              }}
            >
              <LayoutGrid size={13} />
              <span>Active</span>
            </button>
            <button
              type="button"
              className={`board-mode-btn ${boardMode === 'shelved' ? 'active' : ''}`}
              onClick={() => setBoardMode('shelved')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 9px',
                fontSize: 11.5,
                fontWeight: 600,
                borderRadius: 4,
                border: 'none',
                background: boardMode === 'shelved' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                color: boardMode === 'shelved' ? '#fde68a' : '#94a3b8',
                cursor: 'pointer',
              }}
            >
              <Archive size={13} />
              <span>Shelved ({shelvedCards.length})</span>
            </button>
            <button
              type="button"
              className={`board-mode-btn ${boardMode === 'dismissed' ? 'active' : ''}`}
              onClick={() => setBoardMode('dismissed')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 9px',
                fontSize: 11.5,
                fontWeight: 600,
                borderRadius: 4,
                border: 'none',
                background: boardMode === 'dismissed' ? 'rgba(244, 63, 94, 0.2)' : 'transparent',
                color: boardMode === 'dismissed' ? '#fecdd3' : '#94a3b8',
                cursor: 'pointer',
              }}
            >
              <XCircle size={13} />
              <span>Dismissed ({dismissedCards.length})</span>
            </button>
          </div>
        </div>

        {/* Horizon Tabs (Only in Active Mode) */}
        {boardMode === 'active' && (
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
        )}
      </div>

      {/* Info Notice when in Active Mode and Triage has matching items */}
      {boardMode === 'active' && boardCards.length === 0 && triageMatchingCards.length > 0 && (
        <div style={{
          margin: '0 0 16px 0',
          padding: '12px 16px',
          background: 'rgba(99, 102, 241, 0.08)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <span style={{ fontSize: 13, color: '#cbd5e1' }}>
            {triageMatchingCards.length} {triageMatchingCards.length === 1 ? 'card' : 'cards'} matching this view {triageMatchingCards.length === 1 ? 'is' : 'are'} currently in <strong>Triage</strong> (not yet committed to the Execution Board).
          </span>
          {onSwitchToTriage && (
            <button
              type="button"
              className="btn-primary"
              style={{ fontSize: 12, padding: '4px 12px', height: 'auto', whiteSpace: 'nowrap' }}
              onClick={onSwitchToTriage}
            >
              View in Triage
            </button>
          )}
        </div>
      )}

      {/* 1. ACTIVE EXECUTION KANBAN BOARD */}
      {boardMode === 'active' && (
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
      )}

      {/* 2. SHELVED ARCHIVE VIEW */}
      {boardMode === 'shelved' && (
        <div>
          <div style={{
            margin: '0 0 16px 0',
            padding: '12px 16px',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}>
            <span style={{ fontSize: 13, color: '#fde68a' }}>
              <strong>Shelved Cards:</strong> Ideas or projects set aside for future revisit. Click <strong>Restore</strong> on any card to move it back to your active Inbox.
            </span>
          </div>

          {shelvedCards.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
              No cards are currently shelved.
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 12,
            }}>
              {shelvedCards.map(renderCardItem)}
            </div>
          )}
        </div>
      )}

      {/* 3. DISMISSED ARCHIVE VIEW */}
      {boardMode === 'dismissed' && (
        <div>
          <div style={{
            margin: '0 0 16px 0',
            padding: '12px 16px',
            background: 'rgba(244, 63, 94, 0.08)',
            border: '1px solid rgba(244, 63, 94, 0.25)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}>
            <span style={{ fontSize: 13, color: '#fecdd3' }}>
              <strong>Dismissed Cards:</strong> Items decided as not relevant. You can review them anytime or click <strong>Restore</strong> to bring them back.
            </span>
          </div>

          {dismissedCards.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
              No dismissed cards.
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 12,
            }}>
              {dismissedCards.map(renderCardItem)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
