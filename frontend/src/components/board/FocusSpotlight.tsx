import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../../types';
import { useLocale } from '../../i18n';
import {
  findFocusCandidates,
  getFirstUncheckedStep,
} from '../../utils/boardUtils';
import {
  Sparkles,
  Target,
  RotateCw,
  ChevronUp,
  ChevronDown,
  Check,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';

export interface FocusSpotlightProps {
  cards: Card[];
  onSelectCard: (card: Card) => void;
  onUpdateCard: (id: number, patch: Partial<Card>) => void;
  showToast?: (msg: string, onUndo?: () => Promise<void> | void) => void;
}

export const FocusSpotlight: React.FC<FocusSpotlightProps> = ({
  cards,
  onSelectCard,
  onUpdateCard,
  showToast,
}) => {
  const { t } = useLocale();

  const [pinnedId, setPinnedId] = useState<number | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sparkkeep_board_focus_id');
      if (saved) {
        const parsed = parseInt(saved, 10);
        return isNaN(parsed) ? null : parsed;
      }
    }
    return null;
  });

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sparkkeep_board_spotlight_collapsed') === 'true';
    }
    return false;
  });

  const [cycleOffset, setCycleOffset] = useState<number>(0);
  const [isCompleting, setIsCompleting] = useState<boolean>(false);
  const celebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (celebrationTimerRef.current) {
        clearTimeout(celebrationTimerRef.current);
      }
    };
  }, []);

  const candidates = findFocusCandidates(cards, pinnedId);

  if (candidates.length === 0) {
    return null;
  }

  const safeIndex =
    ((cycleOffset % candidates.length) + candidates.length) % candidates.length;
  const currentCard = candidates[safeIndex];
  const isCurrentPinned = pinnedId === currentCard.id;

  const handleTogglePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCurrentPinned) {
      setPinnedId(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('sparkkeep_board_focus_id');
      }
    } else {
      setPinnedId(currentCard.id);
      setCycleOffset(0);
      if (typeof window !== 'undefined') {
        localStorage.setItem('sparkkeep_board_focus_id', String(currentCard.id));
      }
    }
  };

  const handleNextSuggestion = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCycleOffset((prev) => (prev + 1) % candidates.length);
  };

  const handleToggleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !isCollapsed;
    setIsCollapsed(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('sparkkeep_board_spotlight_collapsed', String(next));
    }
  };

  const proposedActions = currentCard.proposed_actions || [];
  const completedActions = currentCard.completed_actions || [];
  const nextStep = getFirstUncheckedStep(currentCard);
  const totalActions = proposedActions.length;
  const completedCount = completedActions.length;

  const handleCompleteStep = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!nextStep) return;

    const prevStatus = currentCard.status;
    const prevCompleted = [...completedActions];
    const nextCompleted = [...completedActions, nextStep];
    const nextCompletedSet = new Set(nextCompleted);

    if (currentCard.status === 'to-do') {
      onUpdateCard(currentCard.id, {
        status: 'in-progress',
        completed_actions: nextCompleted,
      });

      showToast?.(
        t('cards.board.moved', {
          id: currentCard.id,
          label: t('cards.status.inProgress'),
        }),
        async () => {
          await onUpdateCard(currentCard.id, {
            status: prevStatus,
            completed_actions: prevCompleted,
          });
        }
      );
      return;
    }

    // in-progress card
    const willAllBeCompleted =
      totalActions > 0 && proposedActions.every((s) => nextCompletedSet.has(s));

    if (willAllBeCompleted) {
      setIsCompleting(true);
      if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
      celebrationTimerRef.current = setTimeout(() => setIsCompleting(false), 1200);

      onUpdateCard(currentCard.id, {
        status: 'done',
        completed_actions: nextCompleted,
      });

      showToast?.(t('cards.item.autoMovedDone', { id: currentCard.id }), async () => {
        await onUpdateCard(currentCard.id, {
          status: prevStatus,
          completed_actions: prevCompleted,
        });
      });
    } else {
      onUpdateCard(currentCard.id, {
        completed_actions: nextCompleted,
      });

      showToast?.(t('shell.toasts.saved', { id: currentCard.id }), async () => {
        await onUpdateCard(currentCard.id, {
          completed_actions: prevCompleted,
        });
      });
    }
  };

  const statusLabel =
    currentCard.status === 'in-progress'
      ? t('cards.status.inProgress')
      : currentCard.status === 'to-do'
      ? t('cards.status.toDo')
      : t('cards.status.done');

  const horizonLabel =
    currentCard.horizon === 'medium-term'
      ? t('cards.horizon.medium')
      : currentCard.horizon === 'long-term'
      ? t('cards.horizon.long')
      : t('cards.horizon.short');

  // Collapsed sleek 1-line pill view
  if (isCollapsed) {
    return (
      <div
        className="focus-spotlight-container is-collapsed"
        role="region"
        aria-label={t('cards.board.spotlightTitle')}
      >
        <div className="focus-spotlight-compact">
          <div className="spotlight-compact-lead">
            <span
              className={`spotlight-badge-icon ${isCurrentPinned ? 'pinned' : ''}`}
              title={isCurrentPinned ? t('cards.board.spotlightUnpin') : t('cards.board.spotlightTitle')}
            >
              {isCurrentPinned ? <Target size={14} color="#f59e0b" /> : <Sparkles size={14} color="#818cf8" />}
            </span>
            <span className="spotlight-compact-kicker">
              {t('cards.board.spotlightTitle')}:
            </span>
            <button
              type="button"
              className="spotlight-compact-title-btn"
              onClick={() => onSelectCard(currentCard)}
              title={currentCard.title}
            >
              {currentCard.title}
            </button>
            <span className={`spotlight-stage-pill ${currentCard.status}`}>
              {statusLabel}
            </span>
          </div>

          <div className="spotlight-compact-tail">
            {nextStep && (
              <button
                type="button"
                className="spotlight-quick-complete-btn"
                onClick={handleCompleteStep}
                title={t('cards.board.spotlightNextStep', { step: nextStep })}
              >
                <Check size={12} />
                <span>{t('cards.board.spotlightCompleteStep')}</span>
              </button>
            )}

            <div className="focus-spotlight-controls">
              <button
                type="button"
                className={`spotlight-icon-btn ${isCurrentPinned ? 'is-pinned' : ''}`}
                onClick={handleTogglePin}
                title={isCurrentPinned ? t('cards.board.spotlightUnpin') : t('cards.board.spotlightPin')}
                aria-label={isCurrentPinned ? t('cards.board.spotlightUnpin') : t('cards.board.spotlightPin')}
              >
                <Target size={13} />
              </button>
              <button
                type="button"
                className="spotlight-icon-btn"
                onClick={handleNextSuggestion}
                title={t('cards.board.spotlightCycle')}
                aria-label={t('cards.board.spotlightCycle')}
              >
                <RotateCw size={13} />
              </button>
              <button
                type="button"
                className="spotlight-icon-btn"
                onClick={handleToggleCollapse}
                title={t('cards.board.spotlightExpand')}
                aria-label={t('cards.board.spotlightExpand')}
              >
                <ChevronDown size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Expanded spotlight view
  return (
    <div
      className="focus-spotlight-container"
      role="region"
      aria-label={t('cards.board.spotlightTitle')}
    >
      <div
        className={`focus-spotlight-card ${isCompleting ? 'is-completing-celebration' : ''}`}
      >
        {/* Header Strip: Title, Badges, Step Progress & Controls */}
        <div className="focus-spotlight-header">
          <div className="focus-spotlight-meta-left">
            <span className={`spotlight-badge-icon ${isCurrentPinned ? 'pinned' : ''}`}>
              {isCurrentPinned ? <Target size={15} color="#f59e0b" /> : <Sparkles size={15} color="#818cf8" />}
            </span>
            <span className="focus-spotlight-title">
              {t('cards.board.spotlightTitle')}
            </span>
            <span className={`spotlight-stage-pill ${currentCard.status}`}>
              {statusLabel}
            </span>
            <span className="spotlight-horizon-pill">
              {horizonLabel}
            </span>
            {totalActions > 0 && (
              <span className="spotlight-progress-pill">
                {t('cards.item.doneCount', {
                  completed: completedCount,
                  total: totalActions,
                })}
              </span>
            )}
          </div>

          <div className="focus-spotlight-controls">
            <button
              type="button"
              className={`spotlight-icon-btn ${isCurrentPinned ? 'is-pinned' : ''}`}
              onClick={handleTogglePin}
              title={isCurrentPinned ? t('cards.board.spotlightUnpin') : t('cards.board.spotlightPin')}
              aria-label={isCurrentPinned ? t('cards.board.spotlightUnpin') : t('cards.board.spotlightPin')}
            >
              <Target size={14} />
            </button>
            <button
              type="button"
              className="spotlight-icon-btn"
              onClick={handleNextSuggestion}
              title={t('cards.board.spotlightCycle')}
              aria-label={t('cards.board.spotlightCycle')}
            >
              <RotateCw size={14} />
            </button>
            <button
              type="button"
              className="spotlight-icon-btn"
              onClick={handleToggleCollapse}
              title={t('cards.board.spotlightCollapse')}
              aria-label={t('cards.board.spotlightCollapse')}
            >
              <ChevronUp size={14} />
            </button>
          </div>
        </div>

        {/* Card Body: Title & Next Step Box */}
        <div className="focus-spotlight-body">
          <div className="focus-spotlight-card-headline">
            <h3
              className="focus-spotlight-card-title"
              onClick={() => onSelectCard(currentCard)}
              title={currentCard.title}
            >
              {currentCard.title}
            </h3>
            <button
              type="button"
              className="spotlight-inspect-link"
              onClick={() => onSelectCard(currentCard)}
              title={t('cards.board.spotlightInspect')}
            >
              <span>{t('cards.board.spotlightInspect')}</span>
              <ExternalLink size={12} />
            </button>
          </div>

          {currentCard.why_care && (
            <p className="focus-spotlight-why-care">
              {currentCard.why_care}
            </p>
          )}

          {nextStep ? (
            <div className="focus-step-box">
              <div className="focus-step-content">
                <CheckCircle2 size={16} className="focus-step-icon" />
                <span className="focus-step-text">
                  {t('cards.board.spotlightNextStep', { step: nextStep })}
                </span>
              </div>
              <button
                type="button"
                className="btn-spotlight-complete"
                onClick={handleCompleteStep}
              >
                <Check size={14} />
                <span>{t('cards.board.spotlightCompleteStep')}</span>
              </button>
            </div>
          ) : (
            <div className="focus-step-box is-empty">
              <span className="focus-step-text-empty">
                {t('cards.item.readyToPlan')}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
