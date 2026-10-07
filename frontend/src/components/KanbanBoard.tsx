import React, { useState } from 'react';
import { Card } from '../types';
import { CardItem } from './CardItem';
import { Inbox, Zap, Archive, CheckCircle2, Sparkles, CheckSquare } from 'lucide-react';
import * as api from '../api';

interface KanbanBoardProps {
  cards: Card[];
  onSelectCard: (card: Card) => void;
  onStatusChange: (id: number, status: string) => void;
  onResearch: (id: number) => void;
  onRetry: (id: number) => void;
  isPro?: boolean;
  onOpenLicenseModal?: () => void;
  showToast?: (msg: string) => void;
  onRefresh?: () => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  cards,
  onSelectCard,
  onStatusChange,
  onResearch,
  onRetry,
  isPro = false,
  onOpenLicenseModal,
  showToast,
  onRefresh,
}) => {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batching, setBatching] = useState(false);

  const inboxCards = cards.filter((c) => c.status === 'inbox');
  const doingCards = cards.filter((c) => c.status === 'doing');
  const shelvedCards = cards.filter((c) => c.status === 'shelved');
  const doneCards = cards.filter((c) => c.status === 'done');

  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBatchQueue = async () => {
    if (selectedIds.size === 0) return;
    if (!isPro) {
      onOpenLicenseModal?.();
      return;
    }
    setBatching(true);
    try {
      const res = await api.batchQueueResearch(Array.from(selectedIds));
      showToast?.(`Queued ${res.queued.length} card(s) for deep research`);
      setSelectedIds(new Set());
      setSelectMode(false);
      onRefresh?.();
    } catch (err: unknown) {
      showToast?.(api.getErrorMessage(err));
    } finally {
      setBatching(false);
    }
  };

  const renderCardItem = (card: Card) => (
    <CardItem
      key={card.id}
      card={card}
      onSelect={onSelectCard}
      onStatusChange={onStatusChange}
      onResearch={onResearch}
      onRetry={onRetry}
      selectable={selectMode}
      selected={selectedIds.has(card.id)}
      onToggleSelect={handleToggleSelect}
    />
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 id="main-heading" style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Action Engine Boards</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>({cards.length} cards total)</span>
        </h2>

        <button
          type="button"
          className="btn-secondary"
          style={{ fontSize: 12, padding: '5px 12px', height: 30 }}
          onClick={() => {
            if (selectMode) {
              setSelectedIds(new Set());
            }
            setSelectMode(!selectMode);
          }}
        >
          <CheckSquare size={14} style={{ marginRight: 6 }} />
          {selectMode ? 'Cancel Selection' : 'Multi-Select'}
        </button>
      </div>

      {/* Floating / Sticky Batch Action Bar */}
      {selectedIds.size > 0 && (
        <div
          style={{
            position: 'sticky',
            top: 60,
            zIndex: 30,
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--accent-indigo)',
            borderRadius: 8,
            padding: '8px 16px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
              {selectedIds.size} card{selectedIds.size > 1 ? 's' : ''} selected
            </span>
            <button
              type="button"
              style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => setSelectedIds(new Set(inboxCards.map((c) => c.id)))}
            >
              Select all Inbox ({inboxCards.length})
            </button>
            <button
              type="button"
              style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn-primary"
              style={{
                background: 'linear-gradient(135deg, #6366f1, #9333ea)',
                border: 'none',
                padding: '6px 14px',
                fontSize: 12.5,
                fontWeight: 600,
              }}
              disabled={batching}
              onClick={handleBatchQueue}
            >
              <Sparkles size={14} style={{ marginRight: 6 }} />
              {batching ? 'Queueing...' : `Queue Research (${selectedIds.size})`}
              {!isPro && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 10,
                    padding: '1px 5px',
                    borderRadius: 4,
                    background: 'rgba(255, 255, 255, 0.2)',
                  }}
                >
                  PRO
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Legacy/Main container id for compatibility */}
      <div id="main-grid" style={{ display: 'none' }}></div>

      <div className="kanban-board">
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
              inboxCards.map(renderCardItem)
            )}
          </div>
        </div>

        {/* Doing Column */}
        <div className="kanban-column">
          <div className="column-header">
            <div className="column-title">
              <Zap size={15} strokeWidth={1.5} color="#34d399" />
              <span>Doing</span>
            </div>
            <span className="column-count">{doingCards.length}</span>
          </div>
          <div id="action-board" className="cards-container">
            {doingCards.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                No active actions queued.
              </div>
            ) : (
              doingCards.map(renderCardItem)
            )}
          </div>
        </div>

        {/* Shelved Column */}
        <div className="kanban-column">
          <div className="column-header">
            <div className="column-title">
              <Archive size={15} strokeWidth={1.5} color="#94a3b8" />
              <span>Shelved</span>
            </div>
            <span className="column-count">{shelvedCards.length}</span>
          </div>
          <div className="cards-container">
            {shelvedCards.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                No shelved items.
              </div>
            ) : (
              shelvedCards.map(renderCardItem)
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
            <span className="column-count">{doneCards.length}</span>
          </div>
          <div className="cards-container">
            {doneCards.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                Nothing completed yet.
              </div>
            ) : (
              doneCards.map(renderCardItem)
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
