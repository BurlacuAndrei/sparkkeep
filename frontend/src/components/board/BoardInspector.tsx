import React, { useState, useEffect, useRef } from 'react';
import { Card, ResearchItem, Settings } from '../../types';
import { useLocale } from '../../i18n';
import { statusLabel } from '../../utils/cardEnumLabels';
import { horizonLabel } from '../../utils/triage';
import { applyStepToggleWithCompletion } from '../../utils/boardUtils';
import { fetchCardResearch } from '../../api';
import { ExternalLink } from 'lucide-react';
import { InspectorHeader } from './inspector/InspectorHeader';
import { InspectorChecklist } from './inspector/InspectorChecklist';
import { InspectorBrief } from './inspector/InspectorBrief';
import { InspectorResearchPreview } from './inspector/InspectorResearchPreview';

export interface BoardInspectorProps {
  card: Card;
  onClose: () => void;
  onExpandModal: (card: Card) => void;
  onUpdateCard: (id: number, patch: Partial<Card>) => void;
  onResearch: (id: number) => void;
  onRetry: (id: number) => void;
  showToast?: (msg: string, onUndo?: any) => void;
  isPinnedFocus?: boolean;
  onTogglePinFocus?: (cardId: number) => void;
  settings?: Settings | null;
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
  settings,
}) => {
  const { t, tp } = useLocale();
  const [research, setResearch] = useState<ResearchItem | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const celebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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
    const label = horizonLabel(newHorizon, t);
    showToast?.(t('cards.modal.horizonSet', { horizon: label }), async () => {
      await onUpdateCard(card.id, { horizon: prevHorizon });
    });
  };

  // Checklist Step Toggle using shared applyStepToggleWithCompletion
  const handleToggleStep = (stepText: string) => {
    applyStepToggleWithCompletion(card, stepText, {
      onUpdateCard,
      showToast,
      t,
      tp,
      settings,
      onCelebration: () => {
        setIsCompleting(true);
        if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
        celebrationTimerRef.current = setTimeout(() => setIsCompleting(false), 1200);
      },
      targetElement: panelRef.current,
    });
  };

  // Add Step
  const handleAddStep = (stepText: string) => {
    const prevProposed = [...(card.proposed_actions || [])];
    const nextProposed = [...prevProposed, stepText];
    onUpdateCard(card.id, { proposed_actions: nextProposed });
    showToast?.(t('shell.toasts.saved', { id: card.id }), async () => {
      await onUpdateCard(card.id, { proposed_actions: prevProposed });
    });
  };

  // Remove Step
  const handleRemoveStep = (index: number) => {
    const prevProposed = [...(card.proposed_actions || [])];
    const stepText = prevProposed[index];
    const nextProposed = prevProposed.filter((_, idx) => idx !== index);
    const prevCompleted = [...(card.completed_actions || [])];
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

  return (
    <div
      className={`board-inspector-panel ${isCompleting ? 'is-completing-celebration' : ''}`}
      data-testid="board-inspector"
      ref={panelRef}
    >
      {/* 1. Header Toolbar & Quick Selectors */}
      <InspectorHeader
        card={card}
        onClose={onClose}
        onExpandModal={onExpandModal}
        isPinnedFocus={isPinnedFocus}
        onTogglePinFocus={onTogglePinFocus}
        onStatusChange={handleStatusChange}
        onHorizonChange={handleHorizonChange}
      />

      {/* 2. Card Title & Source Link */}
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

      {/* 3. Action Checklist */}
      <InspectorChecklist
        card={card}
        onToggleStep={handleToggleStep}
        onAddStep={handleAddStep}
        onRemoveStep={handleRemoveStep}
      />

      {/* 4. Executive Brief & Worthiness */}
      <InspectorBrief card={card} />

      {/* 5. Research Verdict & Dossier Preview */}
      <InspectorResearchPreview
        card={card}
        research={research}
        onResearch={onResearch}
        onRetry={onRetry}
      />
    </div>
  );
};
