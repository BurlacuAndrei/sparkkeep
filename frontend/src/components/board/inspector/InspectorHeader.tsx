import React from 'react';
import { Card } from '../../../types';
import { useLocale } from '../../../i18n';
import { getPlatformInfo, formatRelativeAge } from '../../../utils/cardUtils';
import { cardTypeLabel } from '../../../utils/cardEnumLabels';
import { horizonLabel } from '../../../utils/triage';
import {
  Target,
  Maximize2,
  X,
  Clock,
  ListTodo,
  Zap,
  CheckCircle2,
  Archive,
} from 'lucide-react';

export interface InspectorHeaderProps {
  card: Card;
  onClose: () => void;
  onExpandModal: (card: Card) => void;
  isPinnedFocus?: boolean;
  onTogglePinFocus?: (cardId: number) => void;
  onStatusChange: (newStatus: string) => void;
  onHorizonChange: (newHorizon: string) => void;
}

export const InspectorHeader: React.FC<InspectorHeaderProps> = ({
  card,
  onClose,
  onExpandModal,
  isPinnedFocus = false,
  onTogglePinFocus,
  onStatusChange,
  onHorizonChange,
}) => {
  const { t, tp } = useLocale();
  const platform = getPlatformInfo(card.source_url);
  const relativeAge = formatRelativeAge(card.created_at, t, tp);

  return (
    <>
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

      {/* Quick Selectors: Status & Horizon */}
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
                onClick={() => onStatusChange(st.id)}
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
            {(['short-term', 'medium-term', 'long-term'] as const).map((hz) => (
              <button
                key={hz}
                type="button"
                role="radio"
                aria-checked={card.horizon === hz}
                className={`inspector-segmented-btn ${card.horizon === hz ? 'active' : ''}`}
                onClick={() => onHorizonChange(hz)}
              >
                <span>{horizonLabel(hz, t)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};
