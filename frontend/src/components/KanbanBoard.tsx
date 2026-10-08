import React, { useState } from 'react';
import { Card } from '../types';
import { CardItem } from './CardItem';
import { ResearchReportView } from './ResearchReportView';
import { TriageView } from './TriageView';
import {
  Inbox,
  Zap,
  Archive,
  CheckCircle2,
  Sparkles,
  CheckSquare,
  Search,
  Eye,
  Layers,
  Play,
  X,
  ExternalLink,
} from 'lucide-react';
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

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

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
  const [activeTab, setActiveTab] = useState<'triage' | 'execution'>('triage');
  const [focusMode, setFocusMode] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batching, setBatching] = useState(false);
  const [reviewDrawerCard, setReviewDrawerCard] = useState<Card | null>(null);
  const [showArchivedDone, setShowArchivedDone] = useState(false);

  const inboxCards = cards.filter((c) => c.status === 'inbox');
  const researchingCards = cards.filter((c) => c.status === 'researching');
  const reviewCards = cards.filter((c) => c.status === 'review');
  const doingCards = cards.filter((c) => c.status === 'doing');
  const shelvedCards = cards.filter((c) => c.status === 'shelved');
  const doneCards = cards.filter((c) => c.status === 'done');

  // Auto-archive logic for Done column: cards with updated_at / created_at older than 7 days
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

  const triageTotal = inboxCards.length + researchingCards.length + reviewCards.length;
  const executionTotal = doingCards.length + shelvedCards.length + activeDoneCards.length;

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

  const handleCardClick = (card: Card) => {
    if (card.status === 'review') {
      setReviewDrawerCard(card);
    } else {
      onSelectCard(card);
    }
  };

  const handleDrawerAction = (newStatus: string, label: string) => {
    if (!reviewDrawerCard) return;
    onStatusChange(reviewDrawerCard.id, newStatus);
    showToast?.(`Card moved to ${label}`);
    setReviewDrawerCard(null);
  };

  const renderCardItem = (card: Card) => (
    <CardItem
      key={card.id}
      card={card}
      onSelect={handleCardClick}
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
      {/* Top Header & Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 id="main-heading" style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Action Engine Boards</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>({cards.length} cards total)</span>
        </h2>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {activeTab === 'triage' && (
            <button
              type="button"
              className={`btn-secondary ${focusMode ? 'active' : ''}`}
              style={{
                fontSize: 12,
                padding: '5px 12px',
                height: 30,
                borderColor: focusMode ? 'var(--accent-indigo)' : undefined,
                color: focusMode ? '#818cf8' : undefined,
                background: focusMode ? 'rgba(99, 102, 241, 0.15)' : undefined,
              }}
              onClick={() => setFocusMode((v) => !v)}
              title={focusMode ? 'Switch back to 3-column Board view' : 'Start 1-by-1 Focus Run'}
            >
              <Zap size={14} color={focusMode ? '#818cf8' : '#38bdf8'} style={{ marginRight: 6 }} />
              {focusMode ? 'Board View' : `Focus Run (${inboxCards.length})`}
            </button>
          )}

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
      </div>

      {/* Primary Top-level Tab Navigation: Pipeline vs Execution */}
      <div className="kanban-tab-container" role="tablist">
        <button
          id="tab-triage"
          type="button"
          role="tab"
          aria-selected={activeTab === 'triage'}
          className={`kanban-tab-btn ${activeTab === 'triage' ? 'active' : ''}`}
          onClick={() => setActiveTab('triage')}
        >
          <Layers size={15} color={activeTab === 'triage' ? '#818cf8' : '#94a3b8'} />
          <span>Pipeline &amp; Review</span>
          <span className="kanban-tab-badge">{triageTotal}</span>
        </button>

        <button
          id="tab-execution"
          type="button"
          role="tab"
          aria-selected={activeTab === 'execution'}
          className={`kanban-tab-btn ${activeTab === 'execution' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('execution');
            setFocusMode(false);
          }}
        >
          <Play size={14} color={activeTab === 'execution' ? '#34d399' : '#94a3b8'} />
          <span>Project Execution</span>
          <span className="kanban-tab-badge">{executionTotal}</span>
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

      {/* Legacy/Main container id for test compatibility */}
      <div id="main-grid" style={{ display: 'none' }}></div>

      {/* TAB 1: PIPELINE & REVIEW */}
      {activeTab === 'triage' && (
        focusMode ? (
          <div className="focus-run-wrapper" style={{ padding: '4px 0 24px' }}>
            <TriageView
              cards={cards}
              onStatusChange={onStatusChange}
              onResearch={onResearch}
              onRetry={onRetry}
              onOpenCardDetail={onSelectCard}
              onRefresh={onRefresh}
              isPro={isPro}
              onOpenLicenseModal={onOpenLicenseModal}
              showToast={showToast}
              onExitFocus={() => setFocusMode(false)}
            />
          </div>
        ) : (
          <div className="kanban-board" data-view="triage">
            {/* Inbox Column */}
            <div className="kanban-column">
              <div className="column-header">
                <div className="column-title">
                  <Inbox size={15} strokeWidth={1.5} color="#38bdf8" />
                  <span>Inbox</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {inboxCards.length > 0 && (
                    <button
                      type="button"
                      className="inbox-focus-btn"
                      onClick={() => setFocusMode(true)}
                      title="Start 1-by-1 Focus Run for Inbox"
                    >
                      <Zap size={11} color="#38bdf8" />
                      <span>Focus Run</span>
                    </button>
                  )}
                  <span className="column-count">{inboxCards.length}</span>
                </div>
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
                researchingCards.map(renderCardItem)
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
                reviewCards.map(renderCardItem)
              )}
            </div>
          </div>
        </div>
      ))}

      {/* TAB 2: EXECUTION */}
      {activeTab === 'execution' && (
        <div className="kanban-board" data-view="execution">
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

          {/* Done Column with 7-Day Auto-Archiving */}
          <div className="kanban-column">
            <div className="column-header">
              <div className="column-title">
                <CheckCircle2 size={15} strokeWidth={1.5} color="#a5b4fc" />
                <span>Completed</span>
              </div>
              <span className="column-count">{displayedDoneCards.length}</span>
            </div>
            <div className="cards-container">
              {displayedDoneCards.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                  Nothing completed yet.
                </div>
              ) : (
                displayedDoneCards.map(renderCardItem)
              )}

              {/* Auto-Archived link at the bottom of the Done column */}
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

      {/* Slide-over Drawer for Analyze/Review */}
      {reviewDrawerCard && (
        <div
          id="review-slide-drawer"
          className="review-drawer-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setReviewDrawerCard(null);
          }}
        >
          <div className="review-drawer">
            {/* Drawer Header */}
            <div className="review-drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    padding: '3px 8px',
                    borderRadius: 6,
                    background: 'rgba(244, 114, 182, 0.15)',
                    color: '#f472b6',
                    border: '1px solid rgba(244, 114, 182, 0.3)',
                    flexShrink: 0,
                  }}
                >
                  Review Mode
                </span>
                <h3
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 700,
                    color: '#f8fafc',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {reviewDrawerCard.title}
                </h3>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {reviewDrawerCard.source_url && (
                  <a
                    href={reviewDrawerCard.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary"
                    style={{ fontSize: 11, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                    title="Open original source"
                  >
                    <ExternalLink size={12} />
                    <span>Source</span>
                  </a>
                )}
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '5px', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => setReviewDrawerCard(null)}
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Drawer Content: Full Markdown Report Side-by-Side with Action Buttons */}
            <div className="review-drawer-body">
              {/* Left / Main Report Section */}
              <div className="review-drawer-report">
                <ResearchReportView
                  card={reviewDrawerCard}
                  showToast={showToast}
                  onUpdateCard={async (id, updates) => {
                    if (reviewDrawerCard && reviewDrawerCard.id === id) {
                      setReviewDrawerCard({ ...reviewDrawerCard, ...updates });
                    }
                  }}
                />
              </div>

              {/* Right / Sidebar Action Panel */}
              <div className="review-drawer-sidebar">
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8' }}>
                  Review Actions
                </div>

                {/* Primary Action Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    id="btn-move-doing"
                    type="button"
                    className="btn-primary"
                    style={{
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      border: 'none',
                      padding: '10px 14px',
                      fontSize: 13,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
                    }}
                    onClick={() => handleDrawerAction('doing', 'Doing')}
                  >
                    <Zap size={16} />
                    <span>Move to Doing</span>
                  </button>

                  <button
                    id="btn-shelve"
                    type="button"
                    className="btn-secondary"
                    style={{
                      padding: '10px 14px',
                      fontSize: 13,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                    onClick={() => handleDrawerAction('shelved', 'Shelved')}
                  >
                    <Archive size={16} />
                    <span>Shelve</span>
                  </button>

                  <button
                    id="btn-mark-done"
                    type="button"
                    className="btn-secondary"
                    style={{
                      padding: '10px 14px',
                      fontSize: 13,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      color: '#a5b4fc',
                      borderColor: 'rgba(165, 180, 252, 0.3)',
                    }}
                    onClick={() => handleDrawerAction('done', 'Completed')}
                  >
                    <CheckCircle2 size={16} />
                    <span>Mark Done</span>
                  </button>
                </div>

                {/* Card Meta Summary */}
                <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Card Details</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#94a3b8' }}>Horizon:</span>
                    <span style={{ color: '#e2e8f0', textTransform: 'capitalize' }}>{reviewDrawerCard.horizon || 'None'}</span>
                  </div>
                  {reviewDrawerCard.type && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: '#94a3b8' }}>Type:</span>
                      <span style={{ color: '#e2e8f0', textTransform: 'uppercase' }}>{reviewDrawerCard.type}</span>
                    </div>
                  )}
                  {reviewDrawerCard.tags && reviewDrawerCard.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                      {reviewDrawerCard.tags.map((t) => (
                        <span key={t} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(255, 255, 255, 0.06)', color: '#94a3b8' }}>
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
