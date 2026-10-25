import React, { useState, useEffect } from 'react';
import { Card, ResearchItem } from '../../types';
import { useLocale } from '../../i18n';
import { getPlatformInfo, formatRelativeAge } from '../../utils/cardUtils';
import { cardTypeLabel, statusLabel, enumLabel } from '../../utils/cardEnumLabels';
import { fetchCardResearch } from '../../api';
import {
  Target,
  Maximize2,
  X,
  ExternalLink,
  CheckCircle2,
  Plus,
  Trash2,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  FileText,
  Lightbulb,
  Check,
  HelpCircle,
  Clock,
  Archive,
  Zap,
  ListTodo,
} from 'lucide-react';

export interface BoardInspectorProps {
  card: Card;
  onClose: () => void;
  onExpandModal: (card: Card) => void;
  onUpdateCard: (id: number, patch: Partial<Card>) => void;
  onResearch: (id: number) => void;
  onRetry: (id: number) => void;
  showToast?: (msg: string, onUndo?: () => Promise<void> | void) => void;
  isPinnedFocus?: boolean;
  onTogglePinFocus?: (cardId: number) => void;
}

export const BoardInspector: React.FC<BoardInspectorProps> = ({
  card,
  onClose,
  onExpandModal,
  onUpdateCard,
  onResearch,
  onRetry,
  showToast,
  isPinnedFocus = false,
  onTogglePinFocus,
}) => {
  const { t, tp } = useLocale();
  const [newActionText, setNewActionText] = useState('');
  const [research, setResearch] = useState<ResearchItem | null>(null);
  const [isFindingsExpanded, setIsFindingsExpanded] = useState(false);

  // Load research findings for preview
  useEffect(() => {
    let alive = true;
    if (card.id) {
      fetchCardResearch(card.id)
        .then((res) => {
          if (alive && res) {
            setResearch(res);
          }
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [card.id]);

  // Global keydown handler inside inspector: Escape to close, 'o' to expand
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        if (e.key === 'Escape') {
          target.blur();
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        onExpandModal(card);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [card, onClose, onExpandModal]);

  const platform = getPlatformInfo(card.source_url);
  const relativeAge = formatRelativeAge(card.created_at, t, tp);
  const verdict = (card.research_verdict || '').toLowerCase();
  const confidence = card.research_confidence || '';

  const proposedActions = card.proposed_actions || [];
  const completedActions = card.completed_actions || [];
  const completedSet = new Set(completedActions);
  const totalActions = proposedActions.length;
  const completedCount = proposedActions.filter((s) => completedSet.has(s)).length;
  const progressPercent = totalActions > 0 ? Math.round((completedCount / totalActions) * 100) : 0;

  // Status handler with Undo
  const handleStatusChange = (newStatus: string) => {
    if (card.status === newStatus) return;
    const prevStatus = card.status;
    onUpdateCard(card.id, { status: newStatus as any });
    const label = statusLabel(t, newStatus);
    showToast?.(t('cards.board.moved', { id: card.id, label }), async () => {
      await onUpdateCard(card.id, { status: prevStatus });
    });
  };

  // Horizon handler with Undo
  const handleHorizonChange = (newHorizon: string) => {
    if (card.horizon === newHorizon) return;
    const prevHorizon = card.horizon;
    onUpdateCard(card.id, { horizon: newHorizon as any });
    const horizonLabel =
      newHorizon === 'short-term'
        ? t('cards.horizon.short')
        : newHorizon === 'medium-term'
        ? t('cards.horizon.medium')
        : t('cards.horizon.long');
    showToast?.(t('cards.modal.horizonSet', { horizon: horizonLabel }), async () => {
      await onUpdateCard(card.id, { horizon: prevHorizon });
    });
  };

  // Checklist Step Toggle with Undo & auto-move to done
  const handleToggleStep = (stepText: string) => {
    const isChecked = completedSet.has(stepText);
    const prevCompleted = [...completedActions];
    const prevStatus = card.status;

    const nextCompleted = isChecked
      ? prevCompleted.filter((s) => s !== stepText)
      : [...prevCompleted, stepText];

    const nextCompletedSet = new Set(nextCompleted);
    const willAllBeCompleted =
      !isChecked &&
      proposedActions.length > 0 &&
      proposedActions.every((s) => nextCompletedSet.has(s));

    if (willAllBeCompleted && card.status === 'in-progress') {
      onUpdateCard(card.id, {
        status: 'done',
        completed_actions: nextCompleted,
      });

      showToast?.(t('cards.item.autoMovedDone', { id: card.id }), async () => {
        await onUpdateCard(card.id, {
          status: prevStatus,
          completed_actions: prevCompleted,
        });
      });
    } else {
      onUpdateCard(card.id, {
        completed_actions: nextCompleted,
      });

      showToast?.(t('shell.toasts.saved', { id: card.id }), async () => {
        await onUpdateCard(card.id, {
          completed_actions: prevCompleted,
        });
      });
    }
  };

  // Add Step
  const handleAddStep = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = newActionText.trim();
    if (!text) return;
    const prevProposed = [...proposedActions];
    const nextProposed = [...prevProposed, text];
    onUpdateCard(card.id, { proposed_actions: nextProposed });
    setNewActionText('');
    showToast?.(t('shell.toasts.saved', { id: card.id }), async () => {
      await onUpdateCard(card.id, { proposed_actions: prevProposed });
    });
  };

  // Remove Step
  const handleRemoveStep = (index: number) => {
    const prevProposed = [...proposedActions];
    const stepText = prevProposed[index];
    const nextProposed = prevProposed.filter((_, idx) => idx !== index);
    const prevCompleted = [...completedActions];
    const nextCompleted = prevCompleted.filter((s) => s !== stepText);

    onUpdateCard(card.id, {
      proposed_actions: nextProposed,
      completed_actions: nextCompleted,
    });

    showToast?.(t('shell.toasts.saved', { id: card.id }), async () => {
      await onUpdateCard(card.id, {
        proposed_actions: prevProposed,
        completed_actions: prevCompleted,
      });
    });
  };

  const findingsText = research?.findings || '';

  return (
    <div className="board-inspector-panel" data-testid="board-inspector">
      {/* 1. Header Toolbar */}
      <div className="board-inspector-header">
        <div className="board-inspector-meta">
          {/* Platform glyph */}
          <span
            className="inspector-platform-badge"
            title={t('cards.item.sourceTitle', { name: platform.name })}
            style={{ color: platform.color }}
          >
            {platform.icon}
            <span>{platform.name}</span>
          </span>

          {/* Type badge */}
          {card.type && (
            <span className="inspector-type-badge">
              {cardTypeLabel(t, card.type)}
            </span>
          )}

          {/* Relative age */}
          {relativeAge && (
            <span className="inspector-age-badge" title={card.created_at}>
              <Clock size={11} />
              <span>{relativeAge}</span>
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="board-inspector-actions">
          {/* Pin to Focus Spotlight */}
          <button
            type="button"
            className={`inspector-action-btn inspector-btn-pin ${isPinnedFocus ? 'active' : ''}`}
            onClick={() => onTogglePinFocus?.(card.id)}
            title={isPinnedFocus ? t('cards.board.spotlightUnpin') : t('cards.board.spotlightPin')}
            aria-label={isPinnedFocus ? t('cards.board.spotlightUnpin') : t('cards.board.spotlightPin')}
          >
            <Target size={15} />
          </button>

          {/* Expand to full modal */}
          <button
            type="button"
            className="inspector-action-btn inspector-btn-expand"
            onClick={() => onExpandModal(card)}
            title={`${t('cards.board.inspectorExpand')} (o)`}
            aria-label={t('cards.board.inspectorExpand')}
          >
            <Maximize2 size={15} />
          </button>

          {/* Close inspector */}
          <button
            type="button"
            className="inspector-action-btn inspector-btn-close"
            onClick={onClose}
            title={`${t('cards.board.inspectorClose')} (Esc)`}
            aria-label={t('cards.board.inspectorClose')}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* 2. Quick Selectors: Status & Horizon */}
      <div className="board-inspector-selectors">
        {/* Status Quick Selector */}
        <div className="inspector-selector-group">
          <label className="inspector-selector-label">{t('cards.metadata.status')}</label>
          <div className="inspector-pill-segmented" role="radiogroup" aria-label={t('cards.metadata.statusAria')}>
            {[
              { id: 'to-do', label: t('cards.status.toDo'), icon: <ListTodo size={12} /> },
              { id: 'in-progress', label: t('cards.status.inProgress'), icon: <Zap size={12} /> },
              { id: 'done', label: t('cards.status.done'), icon: <CheckCircle2 size={12} /> },
              { id: 'shelved', label: t('cards.status.shelved'), icon: <Archive size={12} /> },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                role="radio"
                aria-checked={card.status === st.id}
                className={`inspector-segmented-btn ${card.status === st.id ? 'active' : ''}`}
                onClick={() => handleStatusChange(st.id)}
              >
                {st.icon}
                <span>{st.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Horizon Quick Selector */}
        <div className="inspector-selector-group">
          <label className="inspector-selector-label">{t('cards.metadata.horizon')}</label>
          <div className="inspector-pill-segmented" role="radiogroup" aria-label={t('cards.metadata.horizonAria')}>
            {[
              { id: 'short-term', label: t('cards.horizon.short') },
              { id: 'medium-term', label: t('cards.horizon.medium') },
              { id: 'long-term', label: t('cards.horizon.long') },
            ].map((hz) => (
              <button
                key={hz.id}
                type="button"
                role="radio"
                aria-checked={card.horizon === hz.id}
                className={`inspector-segmented-btn ${card.horizon === hz.id ? 'active' : ''}`}
                onClick={() => handleHorizonChange(hz.id)}
              >
                <span>{hz.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Card Title & Source */}
      <div className="board-inspector-title-area">
        <h2 className="board-inspector-title">{card.title}</h2>
        {card.source_url && (
          <a
            href={card.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inspector-source-link"
            title={card.source_url}
          >
            <span>{card.source_url}</span>
            <ExternalLink size={12} />
          </a>
        )}
      </div>

      {/* 4. Action Checklist */}
      <div className="board-inspector-section inspector-checklist-section">
        <div className="inspector-section-header">
          <div className="inspector-section-title">
            <CheckCircle2 size={14} className="text-emerald" />
            <span>{t('cards.checklist.title')}</span>
          </div>
          <span className="inspector-checklist-count">
            {totalActions > 0
              ? t('cards.checklist.progress', {
                  completed: completedCount,
                  total: totalActions,
                  percent: progressPercent,
                })
              : t('cards.checklist.noSteps')}
          </span>
        </div>

        {totalActions > 0 && (
          <div className="card-progress-bar-track inspector-progress-track">
            <div
              className="card-progress-bar-fill"
              style={{ width: `${Math.max(5, progressPercent)}%` }}
            />
          </div>
        )}

        {/* Checklist item rows */}
        <div className="inspector-checklist-list">
          {proposedActions.map((step, idx) => {
            const isChecked = completedSet.has(step);
            return (
              <div key={idx} className={`inspector-checklist-item ${isChecked ? 'completed' : ''}`}>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => handleToggleStep(step)}
                  className="inspector-checklist-checkbox"
                  id={`inspector-step-${card.id}-${idx}`}
                />
                <label
                  htmlFor={`inspector-step-${card.id}-${idx}`}
                  className="inspector-checklist-label"
                >
                  {step}
                </label>
                <button
                  type="button"
                  className="inspector-step-remove-btn"
                  onClick={() => handleRemoveStep(idx)}
                  title={t('cards.checklist.remove')}
                  aria-label={t('cards.checklist.remove')}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Add Step input */}
        <form onSubmit={handleAddStep} className="inspector-checklist-add-form">
          <input
            type="text"
            className="form-input inspector-step-input"
            value={newActionText}
            onChange={(e) => setNewActionText(e.target.value)}
            placeholder={t('cards.checklist.placeholder')}
          />
          <button
            type="submit"
            className="btn-secondary inspector-step-add-btn"
            disabled={!newActionText.trim()}
          >
            <Plus size={14} />
            <span>{t('cards.checklist.add')}</span>
          </button>
        </form>
      </div>

      {/* 5. Executive Brief: TL;DR, Why Care, Claims, Open Questions */}
      <div className="board-inspector-section inspector-brief-section">
        {/* TL;DR / Summary */}
        {(card.tldr || card.summary || card.executive_summary) && (
          <div className="inspector-brief-block">
            <div className="inspector-block-heading">
              <FileText size={13} />
              <span>{t('cards.modal.tldrTitle')}</span>
            </div>
            <p className="inspector-block-text">
              {card.tldr || card.summary || card.executive_summary}
            </p>
          </div>
        )}

        {/* Why Care (Value Proposition) */}
        {(card.why_care || card.value_proposition) && (
          <div className="inspector-brief-block">
            <div className="inspector-block-heading text-amber">
              <Lightbulb size={13} />
              <span>{t('cards.modal.whyTitle')}</span>
            </div>
            <p className="inspector-block-text">
              {card.why_care || card.value_proposition}
            </p>
          </div>
        )}

        {/* Claims */}
        {card.claims && card.claims.length > 0 && (
          <div className="inspector-brief-block">
            <div className="inspector-block-heading text-indigo">
              <Check size={13} />
              <span>{t('cards.swipe.claims')}</span>
            </div>
            <ul className="inspector-claims-list">
              {card.claims.map((claim, idx) => (
                <li key={idx} className="inspector-claim-item">
                  {claim}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Open Questions */}
        {card.open_questions && card.open_questions.length > 0 && (
          <div className="inspector-brief-block">
            <div className="inspector-block-heading text-sky">
              <HelpCircle size={13} />
              <span>{t('cards.modal.openQuestions')}</span>
            </div>
            <ul className="inspector-questions-list">
              {card.open_questions.map((q, idx) => (
                <li key={idx} className="inspector-question-item">
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 6. Research Verdict & Dossier Preview */}
      <div className="board-inspector-section inspector-research-section">
        <div className="inspector-section-header">
          <div className="inspector-section-title">
            <Sparkles size={14} className="text-purple" />
            <span>{t('cards.modal.researchTitle')}</span>
          </div>

          {/* Verdict Pill */}
          {verdict && (
            <span className={`card-verdict-pill ${verdict}`}>
              <span className="verdict-dot" />
              <strong>{enumLabel(t, 'verdict', verdict).toUpperCase()}</strong>
              {confidence && (
                <span style={{ opacity: 0.85, fontSize: 10 }}>
                  · {enumLabel(t, 'confidence', confidence)}
                </span>
              )}
            </span>
          )}
        </div>

        {/* State-specific research content */}
        {card.research_state === 'running' || card.research_state === 'queued' ? (
          <div className="inspector-research-status running">
            <RefreshCw size={13} className="spin" />
            <span>{t('cards.item.researching')}</span>
          </div>
        ) : card.research_state === 'failed' ? (
          <div className="inspector-research-status failed">
            <AlertTriangle size={13} />
            <span>{t('cards.item.researchFailed')}</span>
            <button
              type="button"
              className="btn-secondary inspector-retry-btn"
              onClick={() => onRetry(card.id)}
            >
              <RefreshCw size={12} />
              <span>{t('cards.item.retry')}</span>
            </button>
          </div>
        ) : verdict || card.research_state === 'done' || findingsText ? (
          <div className="inspector-research-preview">
            {findingsText ? (
              <div>
                <p className={`inspector-findings-text ${isFindingsExpanded ? 'expanded' : 'clamped'}`}>
                  {findingsText}
                </p>
                {findingsText.length > 180 && (
                  <button
                    type="button"
                    className="inspector-findings-toggle-btn"
                    onClick={() => setIsFindingsExpanded(!isFindingsExpanded)}
                  >
                    {isFindingsExpanded ? t('cards.swipe.less') : t('cards.swipe.more')}
                  </button>
                )}
              </div>
            ) : (
              <p className="inspector-findings-empty">
                {t('cards.modal.findingsReady')}
              </p>
            )}
          </div>
        ) : (
          <div className="inspector-research-trigger">
            <button
              type="button"
              className="btn-primary inspector-deep-research-btn"
              onClick={() => onResearch(card.id)}
            >
              <Sparkles size={13} />
              <span>{t('cards.modal.runResearch')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
