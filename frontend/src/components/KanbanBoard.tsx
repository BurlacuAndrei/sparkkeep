import React, { useState } from 'react';
import { Card } from '../types';
import { CardItem } from './CardItem';
import { Zap, CheckCircle2, ListTodo, Archive, XCircle, LayoutGrid, Rows3 } from 'lucide-react';
import * as api from '../api';

interface KanbanBoardProps {
  cards: Card[];
  horizon: string;
  onHorizonChange: (h: string) => void;
  onSelectCard: (card: Card) => void;
  onUpdateCard: (id: number, patch: Partial<Card>) => void;
  onResearch: (id: number) => void;
  onRetry: (id: number) => void;
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

  const [density, setDensity] = useState<'comfortable' | 'compact'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sparkkeep_card_density');
      if (saved === 'comfortable' || saved === 'compact') return saved;
    }
    return 'comfortable';
  });

  const toggleDensity = () => {
    const next = density === 'comfortable' ? 'compact' : 'comfortable';
    setDensity(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('sparkkeep_card_density', next);
    }
  };

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

  const [now] = useState(() => Date.now());

  const isOlderThan7Days = (card: Card) => {
    const timeStr = card.updated_at || card.created_at;
    if (!timeStr) return false;
    const time = new Date(timeStr).getTime();
    if (isNaN(time)) return false;
    return now - time > SEVEN_DAYS_MS;
  };

  const activeDoneCards = doneCards.filter((c) => !isOlderThan7Days(c));
  const archivedDoneCards = doneCards.filter((c) => isOlderThan7Days(c));
  const displayedDoneCards = showArchivedDone ? doneCards : activeDoneCards;

  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const handleStatusChange = (id: number, status: string) => {
    onUpdateCard(id, { status: status as any });
  };

  const handleDragOver = (e: React.DragEvent, colStatus: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCol !== colStatus) {
      setDragOverCol(colStatus);
    }
  };

  const handleDragLeave = (e: React.DragEvent, colStatus: string) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    if (dragOverCol === colStatus) {
      setDragOverCol(null);
    }
  };

  const handleDrop = (e: React.DragEvent, colStatus: string) => {
    e.preventDefault();
    setDragOverCol(null);
    const cardIdStr = e.dataTransfer.getData('text/plain');
    const cardId = parseInt(cardIdStr, 10);
    if (!isNaN(cardId) && cardId > 0) {
      const targetCard = cards.find((c) => c.id === cardId);
      if (targetCard && targetCard.status !== colStatus) {
        onUpdateCard(cardId, { status: colStatus as any });
        const label = colStatus === 'to-do' ? 'To Do' : colStatus === 'in-progress' ? 'In Progress' : 'Completed';
        showToast?.(`Moved card #${cardId} → ${label}`);
      }
    }
  };

  const renderCardItem = (card: Card) => (
    <CardItem
      key={card.id}
      card={card}
      density={density}
      onSelect={onSelectCard}
      onStatusChange={handleStatusChange}
      onResearch={onResearch}
      onRetry={onRetry}
    />
  );

  return (
    <div>
      {/* 2-Tier Stable Board Header (Eliminates CLS) */}
      <div className="board-header-container" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {/* Tier 1: Main Control Toolbar (fixed geometry across all modes) */}
        <div className="board-header-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 38 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h2 id="main-heading" style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{boardMode === 'active' ? 'Execution Boards' : boardMode === 'shelved' ? 'Shelf (Later)' : 'Dismissed Cards'}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' }}>
                ({boardMode === 'active'
                  ? `${displayedCards.length}${activeHorizon !== 'all' && displayedCards.length !== boardCards.length ? ` of ${boardCards.length}` : ''} ${displayedCards.length === 1 ? 'card' : 'cards'}`
                  : boardMode === 'shelved'
                  ? `${shelvedCards.length} cards`
                  : `${dismissedCards.length} cards`})
              </span>
            </h2>

            {/* Mode Switcher: Active Board vs Shelved vs Dismissed */}
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-input)', padding: 2, borderRadius: 6, border: '1px solid var(--border-subtle)' }}>
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
                  background: boardMode === 'active' ? 'var(--color-info-bg)' : 'transparent',
                  color: boardMode === 'active' ? 'var(--accent-indigo)' : 'var(--text-dim)',
                  cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
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
                  background: boardMode === 'shelved' ? 'var(--color-warning-bg)' : 'transparent',
                  color: boardMode === 'shelved' ? 'var(--color-warning-text)' : 'var(--text-dim)',
                  cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
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
                  background: boardMode === 'dismissed' ? 'var(--color-error-bg)' : 'transparent',
                  color: boardMode === 'dismissed' ? 'var(--color-error-text)' : 'var(--text-dim)',
                  cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                <XCircle size={13} />
                <span>Dismissed ({dismissedCards.length})</span>
              </button>
            </div>
          </div>

          {/* Card Density Live Toggle (Permanently anchored right) */}
          <button
            type="button"
            className="board-density-toggle-btn"
            onClick={toggleDensity}
            title={`Card Spacing: currently ${density}. Click to switch.`}
            aria-label={`Switch card density, currently ${density}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              fontSize: 11.5,
              fontWeight: 600,
              borderRadius: 6,
              border: '1px solid var(--border-subtle)',
              background: density === 'compact' ? 'var(--color-info-bg)' : 'var(--bg-input)',
              color: density === 'compact' ? 'var(--accent-indigo)' : 'var(--text-dim)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Rows3 size={13} />
            <span>{density === 'compact' ? 'Compact' : 'Comfortable'}</span>
          </button>
        </div>

        {/* Tier 2: Dedicated Contextual Sub-row */}
        <div className="board-header-context-row" style={{ minHeight: 36, display: 'flex', alignItems: 'center' }}>
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

          {boardMode === 'shelved' && (
            <div style={{
              width: '100%',
              padding: '8px 14px',
              background: 'var(--color-warning-bg)',
              border: '1px solid var(--color-warning-border)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}>
              <span style={{ fontSize: 13, color: 'var(--color-warning-text)' }}>
                <strong>Shelved Cards:</strong> Ideas or projects set aside for future revisit. Click <strong>Restore</strong> on any card to move it back to your active Inbox.
              </span>
            </div>
          )}

          {boardMode === 'dismissed' && (
            <div style={{
              width: '100%',
              padding: '8px 14px',
              background: 'var(--color-error-bg)',
              border: '1px solid var(--color-error-border)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}>
              <span style={{ fontSize: 13, color: 'var(--color-error-text)' }}>
                <strong>Dismissed Cards:</strong> Items decided as not relevant. You can review them anytime or click <strong>Restore</strong> to bring them back.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Info Notice when in Active Mode and Triage has matching items */}
      {boardMode === 'active' && boardCards.length === 0 && triageMatchingCards.length > 0 && (
        <div style={{
          margin: '0 0 16px 0',
          padding: '12px 16px',
          background: 'var(--color-info-bg)',
          border: '1px solid var(--border-highlight)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
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
          <div
            className={`kanban-column ${dragOverCol === 'to-do' ? 'drag-over' : ''}`}
            onDragOver={(e) => handleDragOver(e, 'to-do')}
            onDragLeave={(e) => handleDragLeave(e, 'to-do')}
            onDrop={(e) => handleDrop(e, 'to-do')}
          >
            <div className="column-header">
              <div className="column-title">
                <ListTodo size={15} strokeWidth={1.5} color="var(--accent-indigo)" />
                <span>To Do</span>
              </div>
              <span className="column-count">{todoCards.length}</span>
            </div>
            <div className="cards-container">
              {todoCards.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
                  Ready for work. (Drop cards here)
                </div>
              ) : (
                todoCards.map(renderCardItem)
              )}
            </div>
          </div>

          {/* In Progress Column */}
          <div
            className={`kanban-column ${dragOverCol === 'in-progress' ? 'drag-over' : ''}`}
            onDragOver={(e) => handleDragOver(e, 'in-progress')}
            onDragLeave={(e) => handleDragLeave(e, 'in-progress')}
            onDrop={(e) => handleDrop(e, 'in-progress')}
          >
            <div className="column-header">
              <div className="column-title">
                <Zap size={15} strokeWidth={1.5} color="var(--accent-emerald)" />
                <span>In Progress</span>
              </div>
              <span className="column-count">{inProgressCards.length}</span>
            </div>
            <div className="cards-container">
              {inProgressCards.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
                  No active actions. (Drop cards here)
                </div>
              ) : (
                inProgressCards.map(renderCardItem)
              )}
            </div>
          </div>

          {/* Done Column */}
          <div
            className={`kanban-column ${dragOverCol === 'done' ? 'drag-over' : ''}`}
            onDragOver={(e) => handleDragOver(e, 'done')}
            onDragLeave={(e) => handleDragLeave(e, 'done')}
            onDrop={(e) => handleDrop(e, 'done')}
          >
            <div className="column-header">
              <div className="column-title">
                <CheckCircle2 size={15} strokeWidth={1.5} color="var(--accent-blue)" />
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
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
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
                    color: 'var(--accent-indigo)',
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
          {shelvedCards.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>
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
          {dismissedCards.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>
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
