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

export interface CardItemProps {
  card: Card;
  siblingCount?: number;
  siblingIndex?: number;
  density?: 'comfortable' | 'compact';
  onSelect?: (card: Card) => void;
  onStatusChange?: (id: number, status: string) => void;
  onResearch?: (id: number) => void;
  onRetry?: (id: number) => void;
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
  onStatusChange: propOnStatusChange,
  onResearch: propOnResearch,
  onRetry: propOnRetry,
  selectable = false,
  selected = false,
  onToggleSelect,
}) => {
  const actions = useCardActions();
  const onSelect = propOnSelect || actions.onSelectCard;
  const onStatusChange = propOnStatusChange || actions.onStatusChange;
  const onResearch = propOnResearch || actions.onResearch;
  const onRetry = propOnRetry || actions.onRetry;

  const [menuOpen, setMenuOpen] = useState(false);
  const [openDownwards, setOpenDownwards] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
  const relativeAge = formatRelativeAge(card.created_at);

  const completedCount = card.completed_actions?.length || 0;
  const totalActions = card.proposed_actions?.length || 0;
  const progressPercent = totalActions > 0 ? Math.round((completedCount / totalActions) * 100) : 0;

  const verdict = (card.research_verdict || '').toLowerCase();
  const confidence = card.research_confidence || '';

  const suggestedHorizon = card.suggested_horizon || card.horizon || 'short-term';
  const horizonLabel = suggestedHorizon === 'short-term' ? 'Short' : suggestedHorizon === 'medium-term' ? 'Medium' : 'Long';

  const handleClick = (e: React.MouseEvent) => {
    if (selectable && onToggleSelect) {
      e.stopPropagation();
      onToggleSelect(card.id);
      return;
    }
    onSelect(card);
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

  return (
    <article
      className={`card action-card ${density === 'compact' ? 'is-compact' : ''} ${selected ? 'is-selected' : ''} ${menuOpen ? 'menu-active' : ''} ${isDragging ? 'is-dragging' : ''}`}
      data-id={card.id}
      onClick={handleClick}
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
            title={`Source: ${platform.name}`}
            style={{ color: platform.color, display: 'inline-flex', alignItems: 'center', gap: 3 }}
          >
            {platform.icon}
            <span style={{ fontSize: 10, fontWeight: 500 }}>{platform.name}</span>
          </span>

          {/* Type Badge */}
          {card.type && (
            <span className="card-type-badge">
              {card.type}
            </span>
          )}

          {/* Sibling count */}
          {siblingCount && siblingCount > 1 && (
            <span className="card-sibling-badge" title={`Card ${siblingIndex || 1} of ${siblingCount} from this capture`}>
              <Layers size={9.5} style={{ marginRight: 2 }} />
              {siblingIndex ? `${siblingIndex}/${siblingCount}` : `${siblingCount} ideas`}
            </span>
          )}

          {/* Signal warnings */}
          {card.signals?.extraction && card.signals.extraction !== 'full' && (
            <span className="card-signal-badge warning" title={`Extraction signal: ${card.signals.extraction}`}>
              <AlertTriangle size={10} strokeWidth={2} />
              <span>{card.signals.extraction}</span>
            </span>
          )}
          {card.signals?.promo && (
            <span className="card-signal-badge promo" title="Promotional or sponsored content detected">
              promo
            </span>
          )}
          {card.research_state === 'failed' && (
            <span
              className="card-signal-badge warning"
              style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}
              title="Research failed — click Retry"
            >
              <AlertTriangle size={10} strokeWidth={2} />
              <span>research failed</span>
            </span>
          )}
          {card.research_state === 'running' && card.status !== 'inbox' && (
            <span
              className="card-signal-badge"
              style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}
              title="Research running in background"
            >
              <Loader2 size={10} className="spin" />
              <span>researching</span>
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
      <p className="card-summary line-clamp-2">{card.tldr || card.summary}</p>

      {/* ④ Stage Slot */}
      <div className="card-stage-slot">
        {isFailed ? (
          <div className="card-stage-failed">
            <AlertTriangle size={12} color="#fb7185" />
            <span>Couldn't read source</span>
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
                title={card.worthiness.reason || `Worthiness: ${card.worthiness.level}`}
              >
                {card.worthiness.level.toUpperCase()}
              </span>
            )}
            <span className="card-horizon-hint" title="AI suggested horizon">
              Suggest: <strong style={{ textTransform: 'capitalize' }}>{horizonLabel}</strong>
            </span>
          </div>
        ) : card.status === 'review' ? (
          <div className="card-stage-review">
            {verdict ? (
              <span className={`card-verdict-pill ${verdict}`}>
                <span className="verdict-dot" />
                <strong>{verdict.toUpperCase()}</strong>
                {confidence && <span style={{ opacity: 0.8, fontSize: 9.5 }}>· {confidence}</span>}
              </span>
            ) : (
              <span className="card-verdict-pill awaiting">
                Review Ready
              </span>
            )}
          </div>
        ) : card.status === 'to-do' ? (
          <div className="card-stage-todo">
            <span className={`horizon-pill ${card.horizon || 'short-term'}`}>
              {(card.horizon || 'short-term').replace('-term', '')}
            </span>
            <span className="card-todo-actions-count">
              <CheckCircle2 size={11.5} color={completedCount > 0 ? '#34d399' : '#94a3b8'} />
              <span>{totalActions > 0 ? `${completedCount}/${totalActions} actions` : 'Ready to plan'}</span>
            </span>
            {card.research_state === 'done' && (
              <span className="card-research-ready-badge" title="Deep Research complete — click card to view findings">
                <Sparkles size={10} color="#c084fc" />
                <span>Research Ready</span>
              </span>
            )}
          </div>
        ) : card.status === 'in-progress' ? (
          <div className="card-stage-inprogress">
            <div className="card-progress-meta">
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={11} color="#34d399" />
                <span>In Progress</span>
              </span>
              <span>{totalActions > 0 ? `${completedCount}/${totalActions} done` : ''}</span>
              {card.research_state === 'done' && (
                <span className="card-research-ready-badge" title="Deep Research complete — click card to view findings">
                  <Sparkles size={10} color="#c084fc" />
                  <span>Research Ready</span>
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
          </div>
        ) : card.status === 'done' ? (
          <div className="card-stage-done">
            <CheckCircle2 size={12} color="#34d399" />
            <span>Completed</span>
          </div>
        ) : (
          <div className="card-stage-archived">
            <Archive size={11.5} color="#94a3b8" />
            <span style={{ textTransform: 'capitalize' }}>{card.status}</span>
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
              title="Retry Extraction"
            >
              <RefreshCw size={11.5} />
              <span>Retry</span>
            </button>
          ) : card.status === 'inbox' ? (
            <button
              type="button"
              className="card-primary-action-btn commit"
              onClick={handlePrimaryAction}
              title={`Commit with ${horizonLabel} horizon`}
            >
              <ArrowRight size={11.5} />
              <span>Commit</span>
            </button>
          ) : card.status === 'review' ? (
            verdict === 'watch' ? (
              <button
                type="button"
                className="card-primary-action-btn watch"
                onClick={handlePrimaryAction}
                title="Shelve for later inspection"
              >
                <Clock size={11.5} />
                <span>Watch</span>
              </button>
            ) : verdict === 'skip' ? (
              <button
                type="button"
                className="card-primary-action-btn skip"
                onClick={handlePrimaryAction}
                title="Dismiss as not recommended"
              >
                <X size={11.5} />
                <span>Skip</span>
              </button>
            ) : (
              <button
                type="button"
                className="card-primary-action-btn accept"
                onClick={handlePrimaryAction}
                title="Accept verdict and move to To Do"
              >
                <Check size={11.5} />
                <span>Accept → To Do</span>
              </button>
            )
          ) : card.status === 'to-do' ? (
            <button
              type="button"
              className="card-primary-action-btn start"
              onClick={handlePrimaryAction}
              title="Start Working"
            >
              <ArrowRight size={11.5} />
              <span>Start</span>
            </button>
          ) : card.status === 'in-progress' ? (
            <button
              type="button"
              className="card-primary-action-btn done"
              onClick={handlePrimaryAction}
              title="Mark Completed"
            >
              <Check size={11.5} />
              <span>Done</span>
            </button>
          ) : card.status === 'shelved' || card.status === 'dismissed' ? (
            <button
              type="button"
              className="card-primary-action-btn restore"
              onClick={handlePrimaryAction}
              title="Restore to Inbox"
            >
              <RotateCcw size={11.5} />
              <span>Restore</span>
            </button>
          ) : card.status === 'done' ? (
            <button
              type="button"
              className="card-primary-action-btn reopen"
              onClick={handlePrimaryAction}
              title="Reopen to To Do"
            >
              <RotateCcw size={11.5} />
              <span>Reopen</span>
            </button>
          ) : null}

          {/* Secondary Overflow ⋯ Menu */}
          <div style={{ position: 'relative' }} ref={menuRef}>
            <button
              type="button"
              className={`icon-btn card-more-btn ${menuOpen ? 'active' : ''}`}
              title="More actions"
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
                  <span>Deep Research</span>
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
                    <span style={{ color: '#f87171' }}>Retry Research</span>
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
                    <span>Move to To Do</span>
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
                    <span>Move to In Progress</span>
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
                    <span>Mark as Done</span>
                  </button>
                )}

                {/* Horizon Switcher */}
                <div className="card-context-divider" />
                <div className="card-context-submenu-label">Set Horizon</div>
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
                      {h === 'short-term' ? 'Short' : h === 'medium-term' ? 'Med' : 'Long'}
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
                    <span>Shelve for Later</span>
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
                    <span>Dismiss (Not for me)</span>
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
                    <span>Delete Permanently</span>
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