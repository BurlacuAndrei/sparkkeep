import React, { useState, useEffect, useCallback } from 'react';
import { Card, Settings } from '../types';
import { CardItem } from './CardItem';
import { Zap, CheckCircle2, ListTodo, Archive, XCircle, LayoutGrid, Rows3, Layers } from 'lucide-react';
import * as api from '../api';
import { useLocale } from '../i18n';
import { ExecutionPulse } from './board/ExecutionPulse';
import { FocusSpotlight } from './board/FocusSpotlight';
import { ExecutionSwimlanes } from './board/ExecutionSwimlanes';
import { BoardInspector } from './board/BoardInspector';
import { BoardShortcutsModal } from './board/BoardShortcutsModal';
import {
  computeBoardPulseMetrics,
  filterBoardCards,
  sortBoardCards,
  SignalFilter,
  BoardSortOrder,
  SEVEN_DAYS_MS,
} from '../utils/boardUtils';
import { cardTypeLabel, statusLabel } from '../utils/cardEnumLabels';

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
  configuredCardTypes?: string[];
  settings?: Settings | null;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  cards,
  horizon,
  onHorizonChange,
  onSelectCard,
  onUpdateCard,
  onResearch,
  onRetry,
  showToast,
  onRefresh,
  onSwitchToTriage,
  configuredCardTypes,
  settings,
}) => {
  const [boardMode, setBoardMode] = useState<'active' | 'shelved' | 'dismissed'>('active');
  const [showArchivedDone, setShowArchivedDone] = useState(false);
  const { t, tp } = useLocale();

  const [signalFilter, setSignalFilter] = useState<SignalFilter>('all');
  const [cardTypeFilter, setCardTypeFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<BoardSortOrder>('updated');
  const [isShelving, setIsShelving] = useState(false);

  const [inspectedCard, setInspectedCard] = useState<Card | null>(null);
  const [focusedCardId, setFocusedCardId] = useState<number | null>(null);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  const [pinnedFocusId, setPinnedFocusId] = useState<number | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sparkkeep_board_focus_id');
      if (saved) {
        const parsed = parseInt(saved, 10);
        return isNaN(parsed) ? null : parsed;
      }
    }
    return null;
  });

  const handleTogglePinFocus = useCallback((cardId: number) => {
    if (pinnedFocusId === cardId) {
      setPinnedFocusId(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('sparkkeep_board_focus_id');
      }
    } else {
      setPinnedFocusId(cardId);
      if (typeof window !== 'undefined') {
        localStorage.setItem('sparkkeep_board_focus_id', String(cardId));
      }
    }
  }, [pinnedFocusId]);

  const [density, setDensity] = useState<'comfortable' | 'compact'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sparkkeep_card_density');
      if (saved === 'comfortable' || saved === 'compact') return saved;
    }
    return 'comfortable';
  });

  const [layout, setLayout] = useState<'columns' | 'swimlanes'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sparkkeep_board_layout');
      if (saved === 'columns' || saved === 'swimlanes') return saved;
    }
    return 'columns';
  });

  const [swimlaneGroup, setSwimlaneGroup] = useState<'horizon' | 'type'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sparkkeep_board_swimlane_group');
      if (saved === 'horizon' || saved === 'type') return saved;
    }
    return 'horizon';
  });

  const handleLayoutChange = (next: 'columns' | 'swimlanes') => {
    setLayout(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('sparkkeep_board_layout', next);
    }
  };

  const handleSwimlaneGroupChange = (next: 'horizon' | 'type') => {
    setSwimlaneGroup(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('sparkkeep_board_swimlane_group', next);
    }
  };

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
    { id: 'short-term', label: t('cards.horizon.short'), count: shortCount, colorClass: 'short-term' },
    { id: 'medium-term', label: t('cards.horizon.medium'), count: mediumCount, colorClass: 'medium-term' },
    { id: 'long-term', label: t('cards.horizon.long'), count: longCount, colorClass: 'long-term' },
    { id: 'all', label: t('cards.select.allHorizons'), count: allCount, colorClass: 'all' },
  ];

  const countLabel = (count: number) => tp('cards.count', count);

  const activeHorizon = horizon || 'all';

  const baseCards =
    layout === 'swimlanes' || activeHorizon === 'all'
      ? boardCards
      : boardCards.filter((c) => (c.horizon || 'short-term') === activeHorizon);

  const [now] = useState(() => Date.now());

  const pulseMetrics = computeBoardPulseMetrics(baseCards, now);

  const filteredCards = filterBoardCards(baseCards, {
    cardType: cardTypeFilter,
    signal: signalFilter,
    nowMs: now,
  });

  const sortedCards = sortBoardCards(filteredCards, sortOrder);

  const todoCards = sortedCards.filter((c) => c.status === 'to-do');
  const inProgressCards = sortedCards.filter((c) => c.status === 'in-progress');
  const doneCards = sortedCards.filter((c) => c.status === 'done');

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

  const defaultCardTypes =
    configuredCardTypes && configuredCardTypes.length > 0
      ? configuredCardTypes
      : api.DefaultCardTypes;

  const availableCardTypes = Array.from(
    new Set([
      ...defaultCardTypes,
      ...boardCards.map((c) => c.type).filter(Boolean),
    ])
  ) as string[];

  const currentSortLabel =
    sortOrder === 'updated'
      ? t('cards.board.sortUpdated')
      : sortOrder === 'worthiness'
      ? t('cards.board.sortWorthiness')
      : sortOrder === 'progress'
      ? t('cards.board.sortProgress')
      : t('cards.board.sortNewest');

  const handleBatchShelveIdle = async () => {
    try {
      setIsShelving(true);
      const res = await api.batchShelveStale(14);
      showToast?.(t('cards.board.shelvedIdleToast', { count: res.shelved_count }));
      onRefresh?.();
    } catch (err: unknown) {
      showToast?.(api.getErrorMessage(err));
    } finally {
      setIsShelving(false);
    }
  };

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
        const prevStatus = targetCard.status;
        onUpdateCard(cardId, { status: colStatus as any });
        const label =
          colStatus === 'to-do'
            ? t('cards.status.toDo')
            : colStatus === 'in-progress'
            ? t('cards.status.inProgress')
            : t('cards.status.done');
        showToast?.(t('cards.board.moved', { id: cardId, label }), () => {
          onUpdateCard(cardId, { status: prevStatus as any });
        });
      }
    }
  };

  const currentInspectedCard = inspectedCard
    ? cards.find((c) => c.id === inspectedCard.id) || inspectedCard
    : null;

  const isWideViewport = () => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1200;
  };

  const handleCardClick = (card: Card) => {
    if (isWideViewport()) {
      setInspectedCard(card);
      setFocusedCardId(card.id);
    } else {
      onSelectCard(card);
    }
  };

  const handleCardDoubleClick = (card: Card) => {
    onSelectCard(card);
  };

  const visibleCards =
    boardMode === 'shelved'
      ? shelvedCards
      : boardMode === 'dismissed'
      ? dismissedCards
      : layout === 'swimlanes'
      ? sortedCards
      : [...todoCards, ...inProgressCards, ...displayedDoneCards];

  /* oxlint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isShortcutsOpen) return;
      if (
        typeof document !== 'undefined' &&
        document.querySelector('.modal-overlay, .modal-content, .drawer-overlay') !== null
      ) {
        return;
      }

      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      const currentIdx =
        focusedCardId !== null
          ? visibleCards.findIndex((c) => c.id === focusedCardId)
          : -1;
      const focusedCard = currentIdx !== -1 ? visibleCards[currentIdx] : null;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        if (visibleCards.length === 0) return;
        e.preventDefault();
        const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % visibleCards.length;
        const nextCard = visibleCards[nextIdx];
        setFocusedCardId(nextCard.id);
        if (inspectedCard !== null) {
          setInspectedCard(nextCard);
        }
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        if (visibleCards.length === 0) return;
        e.preventDefault();
        const prevIdx =
          currentIdx === -1
            ? 0
            : (currentIdx - 1 + visibleCards.length) % visibleCards.length;
        const prevCard = visibleCards[prevIdx];
        setFocusedCardId(prevCard.id);
        if (inspectedCard !== null) {
          setInspectedCard(prevCard);
        }
      } else if (e.key === ' ') {
        if (visibleCards.length === 0) return;
        e.preventDefault();
        const targetCard = focusedCard || visibleCards[0];
        if (typeof window !== 'undefined' && window.innerWidth < 1200) {
          onSelectCard(targetCard);
          return;
        }
        if (inspectedCard && inspectedCard.id === targetCard.id) {
          setInspectedCard(null);
        } else {
          setInspectedCard(targetCard);
          setFocusedCardId(targetCard.id);
        }
      } else if (e.key === 'o' || e.key === 'O' || e.key === 'Enter') {
        const targetCard = focusedCard || inspectedCard;
        if (targetCard) {
          e.preventDefault();
          onSelectCard(targetCard);
        }
      } else if (e.key === '[') {
        if (!focusedCard) return;
        e.preventDefault();
        const statusOrder = ['to-do', 'in-progress', 'done'];
        const sIdx = statusOrder.indexOf(focusedCard.status);
        if (sIdx > 0) {
          const nextStatus = statusOrder[sIdx - 1];
          const prevStatus = focusedCard.status;
          onUpdateCard(focusedCard.id, { status: nextStatus as any });
          const label = statusLabel(t, nextStatus);
          showToast?.(t('cards.board.moved', { id: focusedCard.id, label }), async () => {
            await onUpdateCard(focusedCard.id, { status: prevStatus as any });
          });
        }
      } else if (e.key === ']') {
        if (!focusedCard) return;
        e.preventDefault();
        const statusOrder = ['to-do', 'in-progress', 'done'];
        const sIdx = statusOrder.indexOf(focusedCard.status);
        if (sIdx >= 0 && sIdx < statusOrder.length - 1) {
          const nextStatus = statusOrder[sIdx + 1];
          const prevStatus = focusedCard.status;
          onUpdateCard(focusedCard.id, { status: nextStatus as any });
          const label = statusLabel(t, nextStatus);
          showToast?.(t('cards.board.moved', { id: focusedCard.id, label }), async () => {
            await onUpdateCard(focusedCard.id, { status: prevStatus as any });
          });
        }
      } else if (e.key === '1') {
        if (!focusedCard || focusedCard.horizon === 'short-term') return;
        e.preventDefault();
        const prevHorizon = focusedCard.horizon;
        onUpdateCard(focusedCard.id, { horizon: 'short-term' });
        showToast?.(
          t('cards.modal.horizonSet', { horizon: t('cards.horizon.short') }),
          async () => {
            await onUpdateCard(focusedCard.id, { horizon: prevHorizon as any });
          }
        );
      } else if (e.key === '2') {
        if (!focusedCard || focusedCard.horizon === 'medium-term') return;
        e.preventDefault();
        const prevHorizon = focusedCard.horizon;
        onUpdateCard(focusedCard.id, { horizon: 'medium-term' });
        showToast?.(
          t('cards.modal.horizonSet', { horizon: t('cards.horizon.medium') }),
          async () => {
            await onUpdateCard(focusedCard.id, { horizon: prevHorizon as any });
          }
        );
      } else if (e.key === '3') {
        if (!focusedCard || focusedCard.horizon === 'long-term') return;
        e.preventDefault();
        const prevHorizon = focusedCard.horizon;
        onUpdateCard(focusedCard.id, { horizon: 'long-term' });
        showToast?.(
          t('cards.modal.horizonSet', { horizon: t('cards.horizon.long') }),
          async () => {
            await onUpdateCard(focusedCard.id, { horizon: prevHorizon as any });
          }
        );
      } else if (e.key === 'f' || e.key === 'F') {
        if (!focusedCard) return;
        e.preventDefault();
        handleTogglePinFocus(focusedCard.id);
      } else if (e.key === '?') {
        e.preventDefault();
        setIsShortcutsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    focusedCardId,
    handleTogglePinFocus,
    inspectedCard,
    isShortcutsOpen,
    onSelectCard,
    onUpdateCard,
    showToast,
    t,
    visibleCards,
  ]);

  const renderCardItem = (card: Card) => (
    <CardItem
      key={card.id}
      card={card}
      density={density}
      onSelect={handleCardClick}
      onDoubleClick={handleCardDoubleClick}
      isKeyboardFocused={focusedCardId === card.id}
      onStatusChange={handleStatusChange}
      onUpdateCard={onUpdateCard}
      onResearch={onResearch}
      onRetry={onRetry}
      settings={settings}
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
              <span>{boardMode === 'active' ? t('cards.board.titleActive') : boardMode === 'shelved' ? t('cards.board.titleShelved') : t('cards.board.titleDismissed')}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' }}>
                ({boardMode === 'active'
                  ? filteredCards.length !== boardCards.length
                    ? t('cards.board.countFiltered', {
                        shown: filteredCards.length,
                        total: boardCards.length,
                      })
                    : countLabel(filteredCards.length)
                  : boardMode === 'shelved'
                  ? countLabel(shelvedCards.length)
                  : countLabel(dismissedCards.length)})
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
                <span>{t('cards.board.modeActive')}</span>
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
                <span>{t('cards.board.modeShelved', { count: shelvedCards.length })}</span>
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
                <span>{t('cards.board.modeDismissed', { count: dismissedCards.length })}</span>
              </button>
            </div>
          </div>

          {/* View Controls: Layout Switcher & Density Live Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {boardMode === 'active' && (
              <div
                className="board-layout-switcher"
                role="radiogroup"
                aria-label="Board layout"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={layout === 'columns'}
                  className={`board-layout-btn ${layout === 'columns' ? 'active' : ''}`}
                  onClick={() => handleLayoutChange('columns')}
                >
                  <LayoutGrid size={13} />
                  <span>{t('cards.board.layoutColumns')}</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={layout === 'swimlanes'}
                  className={`board-layout-btn ${layout === 'swimlanes' ? 'active' : ''}`}
                  onClick={() => handleLayoutChange('swimlanes')}
                >
                  <Layers size={13} />
                  <span>{t('cards.board.layoutSwimlanes')}</span>
                </button>
              </div>
            )}

            {/* Card Density Live Toggle */}
            <button
              type="button"
              className="board-density-toggle-btn"
              onClick={toggleDensity}
              title={t('cards.board.densityTitle', {
                density: density === 'compact' ? t('cards.density.compact') : t('cards.density.comfortable'),
              })}
              aria-label={t('cards.board.densityAria', {
                density: density === 'compact' ? t('cards.density.compact') : t('cards.density.comfortable'),
              })}
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
              <span>{density === 'compact' ? t('cards.density.compact') : t('cards.density.comfortable')}</span>
            </button>
          </div>
        </div>

        {/* Tier 2: Dedicated Contextual Sub-row */}
        <div className="board-header-context-row" style={{ minHeight: 36, display: 'flex', alignItems: 'center' }}>
          {boardMode === 'active' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 12, flexWrap: 'wrap' }}>
              {layout === 'swimlanes' ? (
                <div
                  className="swimlane-group-selector"
                  role="radiogroup"
                  aria-label={t('cards.board.groupBy', {
                    group:
                      swimlaneGroup === 'horizon'
                        ? t('cards.board.groupByHorizon')
                        : t('cards.board.groupByType'),
                  })}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={swimlaneGroup === 'horizon'}
                    className={`swimlane-group-btn ${swimlaneGroup === 'horizon' ? 'active' : ''}`}
                    onClick={() => handleSwimlaneGroupChange('horizon')}
                  >
                    {t('cards.board.groupByHorizon')}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={swimlaneGroup === 'type'}
                    className={`swimlane-group-btn ${swimlaneGroup === 'type' ? 'active' : ''}`}
                    onClick={() => handleSwimlaneGroupChange('type')}
                  >
                    {t('cards.board.groupByType')}
                  </button>
                </div>
              ) : (
                <div className="horizon-segmented-control" role="tablist" aria-label={t('cards.board.filterAria')}>
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

              {/* Facet Filters & Sort Toolbar */}
              <div className="board-filters-toolbar">
                {/* Card Type Facet Filter */}
                <select
                  className="board-facet-select"
                  aria-label={t('cards.board.filterAllTypes')}
                  value={cardTypeFilter}
                  onChange={(e) => setCardTypeFilter(e.target.value)}
                >
                  <option value="all">{t('cards.board.filterAllTypes')}</option>
                  {availableCardTypes.map((type) => (
                    <option key={type} value={type}>
                      {cardTypeLabel(t, type)}
                    </option>
                  ))}
                </select>

                {/* Signal / Research Verdict Filter */}
                <select
                  className="board-facet-select"
                  aria-label={t('cards.board.filterAllSignals')}
                  value={signalFilter}
                  onChange={(e) => setSignalFilter(e.target.value as SignalFilter)}
                >
                  <option value="all">{t('cards.board.filterAllSignals')}</option>
                  <option value="research_ready">{t('cards.item.researchReady')}</option>
                  <option value="pursue">{t('cards.board.filterPursue')}</option>
                  <option value="idle">
                    {t('cards.board.idlePill', { count: pulseMetrics.idleCount14d })}
                  </option>
                </select>

                {/* Sort Order Selector */}
                <select
                  className="board-facet-select"
                  aria-label={t('cards.board.sortBy', { sort: currentSortLabel })}
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as BoardSortOrder)}
                >
                  <option value="updated">{t('cards.board.sortUpdated')}</option>
                  <option value="worthiness">{t('cards.board.sortWorthiness')}</option>
                  <option value="progress">{t('cards.board.sortProgress')}</option>
                  <option value="newest">{t('cards.board.sortNewest')}</option>
                </select>
              </div>
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
                <strong>{t('cards.board.shelvedTitle')}</strong> {t('cards.board.shelvedBefore')}{' '}
                <strong>{t('cards.item.restore')}</strong> {t('cards.board.shelvedAfter')}
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
                <strong>{t('cards.board.dismissedTitle')}</strong> {t('cards.board.dismissedBefore')}{' '}
                <strong>{t('cards.item.restore')}</strong> {t('cards.board.dismissedAfter')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Board Content (Active / Shelved / Dismissed) */}
      {(() => {
        const boardContent = (
          <>
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
                  {triageMatchingCards.length === 1
                    ? t('cards.board.triageSingular', { count: triageMatchingCards.length })
                    : t('cards.board.triagePlural', { count: triageMatchingCards.length })}{' '}
                  <strong>{t('triage.title')}</strong> {t('cards.board.triageAfter')}
                </span>
                {onSwitchToTriage && (
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ fontSize: 12, padding: '4px 12px', height: 'auto', whiteSpace: 'nowrap' }}
                    onClick={onSwitchToTriage}
                  >
                    {t('cards.board.viewInTriage')}
                  </button>
                )}
              </div>
            )}

            {/* 1. ACTIVE EXECUTION KANBAN BOARD */}
            {boardMode === 'active' && (
              <>
                <FocusSpotlight
                  cards={filteredCards}
                  onSelectCard={onSelectCard}
                  onUpdateCard={onUpdateCard}
                  showToast={showToast}
                  pinnedId={pinnedFocusId}
                  onTogglePin={handleTogglePinFocus}
                  onInspectCard={(card) => {
                    setInspectedCard(card);
                    setFocusedCardId(card.id);
                  }}
                  settings={settings}
                />
                <ExecutionPulse
                  metrics={pulseMetrics}
                  activeSignalFilter={signalFilter}
                  onToggleSignalFilter={(f) => setSignalFilter(f)}
                  onBatchShelveIdle={handleBatchShelveIdle}
                  isShelving={isShelving}
                />
                {layout === 'swimlanes' ? (
                  <ExecutionSwimlanes
                    cards={sortedCards}
                    density={density}
                    groupBy={swimlaneGroup}
                    onSelectCard={onSelectCard}
                    onUpdateCard={onUpdateCard}
                    onResearch={onResearch}
                    onRetry={onRetry}
                    showToast={showToast}
                    renderCardItem={renderCardItem}
                    configuredCardTypes={defaultCardTypes}
                  />
                ) : (
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
                          <span>{t('cards.status.toDo')}</span>
                        </div>
                        <span className="column-count">{todoCards.length}</span>
                      </div>
                      <div className="cards-container">
                        {todoCards.length === 0 ? (
                          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
                            {t('cards.board.emptyTodo')}
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
                          <span>{t('cards.status.inProgress')}</span>
                        </div>
                        <span className="column-count">{inProgressCards.length}</span>
                      </div>
                      <div className="cards-container">
                        {inProgressCards.length === 0 ? (
                          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
                            {t('cards.board.emptyInProgress')}
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
                          <span>{t('cards.item.completed')}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ fontSize: 10, padding: '2px 6px', height: 20 }}
                            onClick={async () => {
                              try {
                                const res = await api.syncObsidian();
                                showToast?.(tp('cards.board.syncedObsidian', res.written));
                              } catch (err: unknown) {
                                showToast?.(api.getErrorMessage(err));
                              }
                            }}
                          >
                            {t('cards.board.syncObsidian')}
                          </button>
                          <span className="column-count">{displayedDoneCards.length}</span>
                        </div>
                      </div>
                      <div className="cards-container">
                        {displayedDoneCards.length === 0 ? (
                          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
                            {t('cards.board.emptyDone')}
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
                              ? t('cards.board.hideArchived')
                              : archivedDoneCards.length > 0
                              ? t('cards.board.viewArchivedCount', { count: archivedDoneCards.length })
                              : t('cards.board.viewArchived')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* 2. SHELVED ARCHIVE VIEW */}
            {boardMode === 'shelved' && (
              <div>
                {shelvedCards.length === 0 ? (
                  <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>
                    {t('cards.board.noneShelved')}
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
                    {t('cards.board.noneDismissed')}
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
          </>
        );

        if (inspectedCard) {
          return (
            <div className="board-master-detail-layout">
              <div className="board-main-canvas">{boardContent}</div>
              <aside
                className="board-docked-inspector"
                aria-label={t('cards.board.inspectorTitle')}
              >
                <BoardInspector
                  card={currentInspectedCard || inspectedCard}
                  onClose={() => setInspectedCard(null)}
                  onExpandModal={(c) => {
                    onSelectCard(c);
                  }}
                  onUpdateCard={onUpdateCard}
                  onResearch={onResearch}
                  onRetry={onRetry}
                  showToast={showToast}
                  isPinnedFocus={pinnedFocusId === (currentInspectedCard || inspectedCard).id}
                  onTogglePinFocus={handleTogglePinFocus}
                  settings={settings}
                />
              </aside>
            </div>
          );
        }

        return boardContent;
      })()}

      {/* Board Keyboard Shortcuts Cheatsheet Modal */}
      <BoardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />
    </div>
  );
};
