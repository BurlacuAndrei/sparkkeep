import React, { useState, useRef, useEffect } from 'react';
import { Card } from '../types';
import { useCardActions } from '../context/CardActionsContext';
import {
  ArrowRight,
  Check,
  RotateCcw,
  Sparkles,
  RefreshCw,
  X,
  CheckCircle2,
  MoreHorizontal,
  AlertTriangle,
  Archive,
  Trash2,
  Clock,
  Layers,
  Loader2,
} from 'lucide-react';
import { ResearchProgressStrip } from './ResearchProgressStrip';
import { getPlatformInfo, formatRelativeAge } from '../utils/cardUtils';
import { enumLabel, statusLabel, cardTypeLabel } from '../utils/cardEnumLabels';
import { useLocale } from '../i18n';

export interface CardItemProps {
  card: Card;
  siblingCount?: number;
  siblingIndex?: number;
  density?: 'comfortable' | 'compact';
  onSelect?: (card: Card) => void;
  onDoubleClick?: (card: Card) => void;
  isKeyboardFocused?: boolean;
  onStatusChange?: (id: number, status: string) => void;
  onResearch?: (id: number) => void;
  onRetry?: (id: number) => void;
  onUpdateCard?: (id: number, patch: Partial<Card>) => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: number) => void;
}

export const CardItem: React.FC<CardItemProps> = ({
  card,
  siblingCount,
  siblingIndex,
  density = 'comfortable',
  onSelect: propOnSelect,
  onDoubleClick,
  isKeyboardFocused = false,
  onStatusChange: propOnStatusChange,
  onResearch: propOnResearch,
  onRetry: propOnRetry,
  onUpdateCard: propOnUpdateCard,
  selectable = false,
  selected = false,
  onToggleSelect,
}) => {
  const actions = useCardActions();
  const { t, tp } = useLocale();
  const onSelect = propOnSelect || actions.onSelectCard;
  const onStatusChange = propOnStatusChange || actions.onStatusChange;
  const onResearch = propOnResearch || actions.onResearch;
  const onRetry = propOnRetry || actions.onRetry;
  const onUpdateCard = propOnUpdateCard || actions.onUpdateCard;
  const showToast = actions.showToast;

  const [menuOpen, setMenuOpen] = useState(false);
  const [openDownwards, setOpenDownwards] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const celebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const handleMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!menuOpen && menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      setOpenDownwards(rect.top < 280);
    }
    setMenuOpen(!menuOpen);
  };

  const handleDragStart = (e: React.DragEvent<HTMLElement>) => {
    if (menuOpen) {
      e.preventDefault();
      return;
    }
    setIsDragging(true);
    e.dataTransfer.setData('text/plain', String(card.id));
    e.dataTransfer.setData('application/json', JSON.stringify({ id: card.id, status: card.status }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const isFailed = Boolean(card.analysis_failed || card.title === 'Analysis failed');
  const platform = getPlatformInfo(card.source_url);
  const relativeAge = formatRelativeAge(card.created_at, t, tp);

  const completedCount = card.completed_actions?.length || 0;
  const totalActions = card.proposed_actions?.length || 0;
  const progressPercent = totalActions > 0 ? Math.round((completedCount / totalActions) * 100) : 0;

  const proposedActions = card.proposed_actions || [];
  const completedActions = card.completed_actions || [];
  const completedSet = new Set(completedActions);
  const uncheckedActions = proposedActions.filter((s) => !completedSet.has(s));
  const nextUncheckedStep = uncheckedActions[0];

  const visibleSteps = isExpanded
    ? proposedActions
    : uncheckedActions.slice(0, 2);

  const remainingCount = proposedActions.length - Math.min(2, uncheckedActions.length);

  const handleNextStepCheck = (step: string) => {
    const prevStatus = card.status;
    const prevCompleted = card.completed_actions || [];
    const nextCompleted = [...prevCompleted, step];

    onUpdateCard?.(card.id, {
      status: 'in-progress',
      completed_actions: nextCompleted,
    });

    showToast?.(t('cards.item.startedInProgress', { id: card.id }), async () => {
      await onUpdateCard?.(card.id, {
        status: prevStatus,
        completed_actions: prevCompleted,
      });
    });
  };

  const handleToggleStep = (step: string) => {
    const isChecked = completedSet.has(step);
    const prevStatus = card.status;
    const prevCompleted = card.completed_actions || [];
    const nextCompleted = isChecked
      ? prevCompleted.filter((s) => s !== step)
      : [...prevCompleted, step];

    const nextCompletedSet = new Set(nextCompleted);
    const willAllBeCompleted =
      !isChecked &&
      proposedActions.length > 0 &&
      proposedActions.every((s) => nextCompletedSet.has(s));

    if (willAllBeCompleted) {
      setIsCompleting(true);
      if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
      celebrationTimerRef.current = setTimeout(() => setIsCompleting(false), 1200);

      onUpdateCard?.(card.id, {
        status: 'done',
        completed_actions: nextCompleted,
      });

      showToast?.(t('cards.item.autoMovedDone', { id: card.id }), async () => {
        await onUpdateCard?.(card.id, {
          status: prevStatus,
          completed_actions: prevCompleted,
        });
      });
    } else {
      onUpdateCard?.(card.id, {
        completed_actions: nextCompleted,
      });

      showToast?.(t('shell.toasts.saved', { id: card.id }), async () => {
        await onUpdateCard?.(card.id, {
          completed_actions: prevCompleted,
        });
      });
    }
  };

  const verdict = (card.research_verdict || '').toLowerCase();
  const confidence = card.research_confidence || '';

  const suggestedHorizon = card.suggested_horizon || card.horizon || 'short-term';
  const horizonLabel =
    suggestedHorizon === 'short-term'
      ? t('cards.horizonShort')
      : suggestedHorizon === 'medium-term'
      ? t('cards.horizonMedium')
      : t('cards.horizonLong');

  const handleClick = (e: React.MouseEvent) => {
    if (selectable && onToggleSelect) {
      e.stopPropagation();
      onToggleSelect(card.id);
      return;
    }
    onSelect(card);
  };

  const handleDoubleClick = () => {
    if (selectable) return;
    onDoubleClick?.(card);
  };

  const handlePrimaryAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFailed) {
      onRetry(card.id);
      return;
    }
    if (card.status === 'inbox') {
      if (actions.onUpdateCard) {
        actions.onUpdateCard(card.id, { status: 'to-do', horizon: suggestedHorizon as any });
      } else {
        onStatusChange(card.id, 'to-do');
      }
      return;
    }
    if (card.status === 'review') {
      if (verdict === 'watch') {
        onStatusChange(card.id, 'shelved');
      } else if (verdict === 'skip') {
        onStatusChange(card.id, 'dismissed');
      } else {
        onStatusChange(card.id, 'to-do');
      }
      return;
    }
    if (card.status === 'to-do') {
      onStatusChange(card.id, 'in-progress');
      return;
    }
    if (card.status === 'in-progress') {
      onStatusChange(card.id, 'done');
      return;
    }
    if (card.status === 'shelved' || card.status === 'dismissed') {
      onStatusChange(card.id, 'inbox');
      return;
    }
    if (card.status === 'done') {
      onStatusChange(card.id, 'to-do');
    }
  };

  const visibleTags = (card.tags || []).slice(0, 2);
  const hiddenTagsCount = Math.max(0, (card.tags || []).length - 2);

  const summaryText =
    density === 'comfortable' && (card.status === 'to-do' || card.status === 'in-progress') && card.why_care
      ? card.why_care
      : card.tldr || card.summary;

  return (
    <article
      className={`card action-card ${density === 'compact' ? 'is-compact' : ''} ${selected ? 'is-selected' : ''} ${menuOpen ? 'menu-active' : ''} ${isDragging ? 'is-dragging' : ''} ${isCompleting ? 'is-completing-celebration' : ''} ${isKeyboardFocused ? 'is-keyboard-focused' : ''}`}
      data-id={card.id}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      draggable={!menuOpen}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      style={{
        border: selected ? '1px solid var(--accent-indigo)' : undefined,
        background: selected ? 'rgba(99, 102, 241, 0.08)' : undefined,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
    >
      {/* ① Meta Row */}
      <div className="card-top" style={{ gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          {selectable && (
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSelect?.(card.id);
              }}
              style={{
                width: 14,
                height: 14,
                accentColor: 'var(--accent-indigo)',
                cursor: 'pointer',
                marginRight: 2,
              }}
            />
          )}

          {/* Platform glyph */}
          <span
            className="card-platform-glyph"
            title={t('cards.item.sourceTitle', { name: platform.name })}
            style={{ color: platform.color, display: 'inline-flex', alignItems: 'center', gap: 3 }}
          >
            {platform.icon}
            <span style={{ fontSize: 10, fontWeight: 500 }}>{platform.name}</span>
          </span>

          {/* Type Badge */}
          {card.type && (
            <span className="card-type-badge">
              {cardTypeLabel(t, card.type)}
            </span>
          )}

          {/* Sibling count */}
          {siblingCount && siblingCount > 1 && (
            <span
              className="card-sibling-badge"
              title={t('cards.item.siblingTitle', {
                index: siblingIndex || 1,
                total: siblingCount,
              })}
            >
              <Layers size={9.5} style={{ marginRight: 2 }} />
              {siblingIndex
                ? `${siblingIndex}/${siblingCount}`
                : tp('cards.item.siblingIdeas', siblingCount)}
            </span>
          )}

          {/* Signal warnings */}
          {card.signals?.extraction && card.signals.extraction !== 'full' && (
            <span
              className="card-signal-badge warning"
              title={t('cards.item.extractionTitle', { signal: card.signals.extraction })}
            >
              <AlertTriangle size={10} strokeWidth={2} />
              <span>{enumLabel(t, 'extraction', card.signals.extraction)}</span>
            </span>
          )}
          {card.signals?.promo && (
            <span className="card-signal-badge promo" title={t('cards.item.promoTitle')}>
              {t('cards.item.promo')}
            </span>
          )}
          {card.research_state === 'failed' && (
            <span
              className="card-signal-badge warning"
              style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}
              title={t('cards.item.researchFailedTitle')}
            >
              <AlertTriangle size={10} strokeWidth={2} />
              <span>{t('cards.item.researchFailed')}</span>
            </span>
          )}
          {card.research_state === 'running' && card.status !== 'inbox' && (
            <span
              className="card-signal-badge"
              style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}
              title={t('cards.item.researchRunningTitle')}
            >
              <Loader2 size={10} className="spin" />
              <span>{t('cards.item.researching')}</span>
            </span>
          )}
        </div>

        {/* Relative Age */}
        {relativeAge && (
          <span className="card-relative-age" title={card.created_at ? new Date(card.created_at).toLocaleString() : ''}>
            {relativeAge}
          </span>
        )}
      </div>

      {/* ② Title (clamped to 2 lines) */}
      <h3 className="card-title line-clamp-2">{card.title}</h3>

      {/* ③ TL;DR (clamped to 2 lines) */}
      <p className="card-summary line-clamp-2">{summaryText}</p>

      {/* ④ Stage Slot */}
      <div className="card-stage-slot">
        {isFailed ? (
          <div className="card-stage-failed">
            <AlertTriangle size={12} color="#fb7185" />
            <span>{t('cards.item.failedRead')}</span>
          </div>
        ) : card.status === 'researching' || card.research_state === 'queued' || card.research_state === 'running' ? (
          <div style={{ width: '100%' }}>
            <ResearchProgressStrip cardId={card.id} compact={true} />
          </div>
        ) : card.status === 'inbox' ? (
          <div className="card-stage-inbox">
            {card.worthiness?.level && (
              <span
                className={`card-worthiness-chip ${card.worthiness.level.toLowerCase()}`}
                title={
                  card.worthiness.reason ||
                  t('cards.item.worthinessTitle', {
                    level: enumLabel(t, 'worthiness', card.worthiness.level),
                  })
                }
              >
                {enumLabel(t, 'worthiness', card.worthiness.level).toUpperCase()}
              </span>
            )}
            <span className="card-horizon-hint" title={t('cards.item.suggestedTitle')}>
              {t('cards.item.suggest')} <strong style={{ textTransform: 'capitalize' }}>{horizonLabel}</strong>
            </span>
          </div>
        ) : card.status === 'review' ? (
          <div className="card-stage-review">
            {verdict ? (
              <span className={`card-verdict-pill ${verdict}`}>
                <span className="verdict-dot" />
                <strong>{enumLabel(t, 'verdict', verdict).toUpperCase()}</strong>
                {confidence && (
                  <span style={{ opacity: 0.8, fontSize: 9.5 }}>
                    · {enumLabel(t, 'confidence', confidence)}
                  </span>
                )}
              </span>
            ) : (
              <span className="card-verdict-pill awaiting">
                {t('cards.item.reviewReady')}
              </span>
            )}
          </div>
        ) : card.status === 'to-do' ? (
          <div className="card-stage-todo">
            <div className="card-todo-meta">
              <span className={`horizon-pill ${card.horizon || 'short-term'}`}>
                {card.horizon === 'medium-term'
                  ? t('cards.horizonMedium')
                  : card.horizon === 'long-term'
                  ? t('cards.horizonLong')
                  : t('cards.horizonShort')}
              </span>
              <span className="card-todo-actions-count">
                <CheckCircle2 size={11.5} color={completedCount > 0 ? '#34d399' : '#94a3b8'} />
                <span>
                  {totalActions > 0
                    ? t('cards.item.actionsCount', { completed: completedCount, total: totalActions })
                    : t('cards.item.readyToPlan')}
                </span>
              </span>
              {verdict && (
                <span className={`card-verdict-pill ${verdict}`} style={{ fontSize: 9.5, padding: '1px 6px' }}>
                  <span className="verdict-dot" />
                  <strong>{enumLabel(t, 'verdict', verdict).toUpperCase()}</strong>
                </span>
              )}
              {card.research_state === 'done' && (
                <span className="card-research-ready-badge" title={t('cards.item.researchReadyTitle')}>
                  <Sparkles size={10} color="#c084fc" />
                  <span>{t('cards.item.researchReady')}</span>
                </span>
              )}
            </div>
            {density === 'comfortable' && nextUncheckedStep && (
              <div className="card-next-step" onClick={(e) => e.stopPropagation()}>
                <label className="card-step-item">
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleNextStepCheck(nextUncheckedStep);
                    }}
                  />
                  <span className="card-step-text">
                    {t('cards.item.nextStep', { step: nextUncheckedStep })}
                  </span>
                </label>
              </div>
            )}
          </div>
        ) : card.status === 'in-progress' ? (
          <div className="card-stage-inprogress">
            <div className="card-progress-meta">
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={11} color="#34d399" />
                <span>{t('cards.status.inProgress')}</span>
              </span>
              <span>
                {totalActions > 0
                  ? t('cards.item.doneCount', { completed: completedCount, total: totalActions })
                  : ''}
              </span>
              {card.research_state === 'done' && (
                <span className="card-research-ready-badge" title={t('cards.item.researchReadyTitle')}>
                  <Sparkles size={10} color="#c084fc" />
                  <span>{t('cards.item.researchReady')}</span>
                </span>
              )}
            </div>
            {totalActions > 0 && (
              <div className="card-progress-bar-track">
                <div
                  className="card-progress-bar-fill"
                  style={{ width: `${Math.max(5, progressPercent)}%` }}
                />
              </div>
            )}
            {density === 'comfortable' && totalActions > 0 && (
              <div className="card-inline-checklist" onClick={(e) => e.stopPropagation()}>
                {visibleSteps.map((step, idx) => {
                  const isChecked = completedSet.has(step);
                  return (
                    <label
                      key={`${step}-${idx}`}
                      className={`card-step-item ${isChecked ? 'is-completed' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleToggleStep(step);
                        }}
                      />
                      <span className="card-step-text">{step}</span>
                    </label>
                  );
                })}
                {isExpanded ? (
                  <button
                    type="button"
                    className="card-step-expand-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsExpanded(false);
                    }}
                  >
                    {t('cards.item.showLessSteps')}
                  </button>
                ) : remainingCount > 0 ? (
                  <button
                    type="button"
                    className="card-step-expand-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsExpanded(true);
                    }}
                  >
                    {tp('cards.item.moreSteps', remainingCount)}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        ) : card.status === 'done' ? (
          <div className="card-stage-done">
            <CheckCircle2 size={12} color="#34d399" />
            <span>{t('cards.item.completed')}</span>
            {totalActions > 0 && (
              <span className="card-done-actions-count">
                {completedCount}/{totalActions}
              </span>
            )}
          </div>
        ) : (
          <div className="card-stage-archived">
            <Archive size={11.5} color="#94a3b8" />
            <span style={{ textTransform: 'capitalize' }}>{statusLabel(t, card.status)}</span>
          </div>
        )}
      </div>

      {/* ⑤ Footer & Actions */}
      <div className="card-footer" onClick={(e) => e.stopPropagation()}>
        {/* Tags */}
        <div className="card-tags card-tag-list">
          {visibleTags.map((t) => (
            <span key={t} className="tag card-tag-pill">
              #{t}
            </span>
          ))}
          {hiddenTagsCount > 0 && (
            <span className="tag card-tag-pill more-tags" title={`${(card.tags || []).slice(2).join(', ')}`}>
              +{hiddenTagsCount}
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="card-actions-group" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Primary Action Button */}
          {isFailed ? (
            <button
              type="button"
              className="card-primary-action-btn retry"
              onClick={handlePrimaryAction}
              title={t('cards.header.retryExtraction')}
            >
              <RefreshCw size={11.5} />
              <span>{t('cards.item.retry')}</span>
            </button>
          ) : card.status === 'inbox' ? (
            <button
              type="button"
              className="card-primary-action-btn commit"
              onClick={handlePrimaryAction}
              title={t('cards.item.commitTitle', { horizon: horizonLabel })}
            >
              <ArrowRight size={11.5} />
              <span>{t('cards.item.commit')}</span>
            </button>
          ) : card.status === 'review' ? (
            verdict === 'watch' ? (
              <button
                type="button"
                className="card-primary-action-btn watch"
                onClick={handlePrimaryAction}
                title={t('cards.item.watchTitle')}
              >
                <Clock size={11.5} />
                <span>{t('cards.item.watch')}</span>
              </button>
            ) : verdict === 'skip' ? (
              <button
                type="button"
                className="card-primary-action-btn skip"
                onClick={handlePrimaryAction}
                title={t('cards.item.skipTitle')}
              >
                <X size={11.5} />
                <span>{t('cards.item.skip')}</span>
              </button>
            ) : (
              <button
                type="button"
                className="card-primary-action-btn accept"
                onClick={handlePrimaryAction}
                title={t('cards.item.acceptTitle')}
              >
                <Check size={11.5} />
                <span>{t('cards.item.accept')}</span>
              </button>
            )
          ) : card.status === 'to-do' ? (
            <button
              type="button"
              className="card-primary-action-btn start"
              onClick={handlePrimaryAction}
              title={t('cards.item.startTitle')}
            >
              <ArrowRight size={11.5} />
              <span>{t('cards.item.start')}</span>
            </button>
          ) : card.status === 'in-progress' ? (
            <button
              type="button"
              className="card-primary-action-btn done"
              onClick={handlePrimaryAction}
              title={t('cards.item.doneTitle')}
            >
              <Check size={11.5} />
              <span>{t('cards.item.done')}</span>
            </button>
          ) : card.status === 'shelved' || card.status === 'dismissed' ? (
            <button
              type="button"
              className="card-primary-action-btn restore"
              onClick={handlePrimaryAction}
              title={t('cards.item.restoreTitle')}
            >
              <RotateCcw size={11.5} />
              <span>{t('cards.item.restore')}</span>
            </button>
          ) : card.status === 'done' ? (
            <button
              type="button"
              className="card-primary-action-btn reopen"
              onClick={handlePrimaryAction}
              title={t('cards.item.reopenTitle')}
            >
              <RotateCcw size={11.5} />
              <span>{t('cards.item.reopen')}</span>
            </button>
          ) : null}

          {/* Secondary Overflow ⋯ Menu */}
          <div style={{ position: 'relative' }} ref={menuRef}>
            <button
              type="button"
              className={`icon-btn card-more-btn ${menuOpen ? 'active' : ''}`}
              title={t('cards.item.moreActions')}
              onClick={handleMenuToggle}
            >
              <MoreHorizontal size={13} strokeWidth={2} />
            </button>

            {menuOpen && (
              <div
                className={`card-context-menu ${openDownwards ? 'drop-down' : ''}`}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Autonomous Research */}
                <button
                  type="button"
                  className="card-context-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onResearch(card.id);
                  }}
                >
                  <Sparkles size={13} color="#c084fc" />
                  <span>{t('cards.item.deepResearch')}</span>
                </button>

                {card.research_state === 'failed' && (
                  <button
                    type="button"
                    className="card-context-item"
                    onClick={() => {
                      setMenuOpen(false);
                      onResearch(card.id);
                    }}
                  >
                    <RotateCcw size={13} color="#f87171" />
                    <span style={{ color: '#f87171' }}>{t('cards.item.retryResearch')}</span>
                  </button>
                )}

                {/* Status Transitions */}
                {card.status !== 'to-do' && (
                  <button
                    type="button"
                    className="card-context-item"
                    onClick={() => {
                      setMenuOpen(false);
                      onStatusChange(card.id, 'to-do');
                    }}
                  >
                    <ArrowRight size={13} color="#cbd5e1" />
                    <span>{t('cards.item.moveToTodo')}</span>
                  </button>
                )}

                {card.status !== 'in-progress' && card.status !== 'done' && (
                  <button
                    type="button"
                    className="card-context-item"
                    onClick={() => {
                      setMenuOpen(false);
                      onStatusChange(card.id, 'in-progress');
                    }}
                  >
                    <ArrowRight size={13} color="#34d399" />
                    <span>{t('cards.item.moveToInProgress')}</span>
                  </button>
                )}

                {card.status !== 'done' && (
                  <button
                    type="button"
                    className="card-context-item"
                    onClick={() => {
                      setMenuOpen(false);
                      onStatusChange(card.id, 'done');
                    }}
                  >
                    <Check size={13} color="#a5b4fc" />
                    <span>{t('cards.item.markDone')}</span>
                  </button>
                )}

                {/* Horizon Switcher */}
                <div className="card-context-divider" />
                <div className="card-context-submenu-label">{t('cards.item.setHorizon')}</div>
                <div style={{ display: 'flex', gap: 4, padding: '2px 8px 6px' }}>
                  {(['short-term', 'medium-term', 'long-term'] as const).map((h) => (
                    <button
                      key={h}
                      type="button"
                      className={`card-context-horizon-btn ${card.horizon === h ? 'selected' : ''}`}
                      onClick={() => {
                        setMenuOpen(false);
                        actions.onUpdateCard?.(card.id, { horizon: h });
                      }}
                    >
                      {h === 'short-term'
                        ? t('cards.horizonShort')
                        : h === 'medium-term'
                        ? t('cards.horizonMed')
                        : t('cards.horizonLong')}
                    </button>
                  ))}
                </div>

                <div className="card-context-divider" />

                {/* Shelve & Dismiss */}
                {card.status !== 'shelved' && (
                  <button
                    type="button"
                    className="card-context-item"
                    onClick={() => {
                      setMenuOpen(false);
                      onStatusChange(card.id, 'shelved');
                    }}
                  >
                    <Clock size={13} color="#fbbf24" />
                    <span>{t('cards.item.shelve')}</span>
                  </button>
                )}

                {card.status !== 'dismissed' && (
                  <button
                    type="button"
                    className="card-context-item danger"
                    onClick={() => {
                      setMenuOpen(false);
                      onStatusChange(card.id, 'dismissed');
                    }}
                  >
                    <X size={13} color="#fb7185" />
                    <span>{t('cards.item.dismiss')}</span>
                  </button>
                )}

                {actions.onDeleteCard && (card.status === 'shelved' || card.status === 'dismissed') && (
                  <button
                    type="button"
                    className="card-context-item danger"
                    onClick={() => {
                      setMenuOpen(false);
                      actions.onDeleteCard?.(card.id);
                    }}
                  >
                    <Trash2 size={13} color="#fb7185" />
                    <span>{t('cards.item.deletePermanently')}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};