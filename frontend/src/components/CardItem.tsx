import React from 'react';
import { Card } from '../types';
import { useCardActions } from '../context/CardActionsContext';
import { ArrowRight, Check, Archive, Sparkles, RefreshCw, X, FileText, CheckCircle2 } from 'lucide-react';
import { ResearchProgressStrip } from './ResearchProgressStrip';


interface CardItemProps {
  card: Card;
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

  const isFailed = card.title === 'Analysis failed';
  const _hasBriefing = Boolean(card.executive_summary || (card.proposed_actions && card.proposed_actions.length > 0));

  const handleClick = (e: React.MouseEvent) => {
    if (selectable && onToggleSelect) {
      e.stopPropagation();
      onToggleSelect(card.id);
      return;
    }
    onSelect(card);
  };

  return (
    <article
      className={`card action-card ${selected ? 'is-selected' : ''}`}
      data-id={card.id}
      onClick={handleClick}
      style={{
        border: selected ? '1px solid var(--accent-indigo)' : undefined,
        background: selected ? 'rgba(99, 102, 241, 0.08)' : undefined,
      }}
    >
      <div className="card-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {selectable && (
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSelect?.(card.id);
              }}
              style={{
                width: 15,
                height: 15,
                accentColor: 'var(--accent-indigo)',
                cursor: 'pointer',
                marginRight: 2,
              }}
            />
          )}
          {card.type && (
            <span className="card-type-badge">{card.type}</span>
          )}
          <span className={`horizon ${card.horizon} horizon-pill ${card.horizon}`}>
            {card.horizon}
          </span>
          {card.worthiness?.level && (
            <span
              className={`worthiness-dot ${card.worthiness.level.toLowerCase()}`}
              title={card.worthiness.reason ? `Worthiness: ${card.worthiness.level} — ${card.worthiness.reason}` : `Worthiness: ${card.worthiness.level}`}
              aria-label={`Worthiness: ${card.worthiness.level}`}
            />
          )}
        </div>
        <span className="card-status status">
          {card.status}
        </span>
      </div>

      <h3 className="card-title">{card.title}</h3>
      
      <p className="card-summary">{card.tldr || card.summary}</p>

      {card.status !== 'inbox' && card.proposed_actions && card.proposed_actions.length > 0 && (
        <div className="card-actions-summary">
          <CheckCircle2 size={12} strokeWidth={1.5} />
          <span>{card.proposed_actions.length} action item{card.proposed_actions.length > 1 ? 's' : ''} planned</span>
        </div>
      )}

      <ResearchProgressStrip cardId={card.id} compact={true} />

      <div className="card-footer">
        <div className="card-tags card-tag-list">
          {(card.tags || []).map((t) => (
            <span key={t} className="tag card-tag-pill">
              #{t}
            </span>
          ))}
        </div>

        <div className="acts card-quick-actions" onClick={(e) => e.stopPropagation()}>
          {card.status !== 'doing' && (
            <button
              type="button"
              className="icon-btn"
              data-act="doing"
              title="Move to Doing"
              onClick={() => onStatusChange(card.id, 'doing')}
            >
              <ArrowRight size={13} strokeWidth={1.5} color="#34d399" />
            </button>
          )}

          {card.status !== 'done' && (
            <button
              type="button"
              className="icon-btn"
              data-act="done"
              title="Mark Done"
              onClick={() => onStatusChange(card.id, 'done')}
            >
              <Check size={13} strokeWidth={1.5} color="#a5b4fc" />
            </button>
          )}

          {card.status !== 'shelved' && (
            <button
              type="button"
              className="icon-btn"
              data-act="shelve"
              title="Shelve for later"
              onClick={() => onStatusChange(card.id, 'shelved')}
            >
              <Archive size={13} strokeWidth={1.5} color="#94a3b8" />
            </button>
          )}

          <button
            type="button"
            className="icon-btn"
            data-act="research"
            title="Run autonomous research"
            onClick={() => onResearch(card.id)}
          >
            <Sparkles size={13} strokeWidth={1.5} color="#c084fc" />
          </button>

          {isFailed && (
            <button
              type="button"
              className="icon-btn"
              data-act="retry"
              title="Retry analysis"
              onClick={() => onRetry(card.id)}
            >
              <RefreshCw size={13} strokeWidth={1.5} color="#fbbf24" />
            </button>
          )}

          {card.status !== 'dismissed' && (
            <button
              type="button"
              className="icon-btn"
              data-act="dismissed"
              title="Not interested"
              onClick={() => onStatusChange(card.id, 'dismissed')}
            >
              <X size={13} strokeWidth={1.5} color="#fb7185" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
};