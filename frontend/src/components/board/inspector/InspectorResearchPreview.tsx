import React, { useState } from 'react';
import { Card, ResearchItem } from '../../../types';
import { useLocale } from '../../../i18n';
import { enumLabel } from '../../../utils/cardEnumLabels';
import {
  Sparkles,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

export interface InspectorResearchPreviewProps {
  card: Card;
  research: ResearchItem | null;
  onResearch: (id: number) => void;
  onRetry: (id: number) => void;
}

export const InspectorResearchPreview: React.FC<InspectorResearchPreviewProps> = ({
  card,
  research,
  onResearch,
  onRetry,
}) => {
  const { t } = useLocale();
  const [isFindingsExpanded, setIsFindingsExpanded] = useState(false);

  const verdict = (card.research_verdict || '').toLowerCase();
  const confidence = card.research_confidence || '';
  const findingsText = research?.findings || '';

  return (
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
  );
};
