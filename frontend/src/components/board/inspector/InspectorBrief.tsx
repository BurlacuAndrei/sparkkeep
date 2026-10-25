import React from 'react';
import { Card } from '../../../types';
import { useLocale } from '../../../i18n';
import { enumLabel } from '../../../utils/cardEnumLabels';
import {
  FileText,
  Lightbulb,
  Check,
  HelpCircle,
  Target,
} from 'lucide-react';

export interface InspectorBriefProps {
  card: Card;
}

export const InspectorBrief: React.FC<InspectorBriefProps> = ({ card }) => {
  const { t } = useLocale();

  return (
    <div className="board-inspector-section inspector-brief-section">
      {/* Worthiness Chip with Tooltip */}
      {card.worthiness?.level && (
        <div className="inspector-brief-block inspector-worthiness-block">
          <div className="inspector-block-heading" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Target size={13} color="#f59e0b" />
            <span>{t('cards.metadata.worthiness')}</span>
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
          </div>
          {card.worthiness.reason && (
            <p className="inspector-block-text" style={{ fontStyle: 'italic', marginTop: 4 }}>
              {card.worthiness.reason}
            </p>
          )}
        </div>
      )}

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
  );
};
