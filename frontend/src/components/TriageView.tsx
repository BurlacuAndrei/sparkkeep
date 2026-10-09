import React, { useState } from 'react';
import { Card } from '../types';
import { Inbox, Search, Eye, Sparkles, Archive, Layers } from 'lucide-react';
import { ResearchProgressStrip } from './ResearchProgressStrip';

interface TriageViewProps {
  cards: Card[];
  onUpdateCard: (id: number, patch: Partial<Card>) => void;
  onResearch: (id: number, playbookId?: number) => void;
  onRetry: (id: number) => void;
  onOpenCardDetail: (card: Card) => void;
  onRefresh?: () => void;
  isPro?: boolean;
  onOpenLicenseModal?: () => void;
  showToast?: (msg: string) => void;
  onExitFocus?: () => void;
}

const TriageCard: React.FC<{ card: Card; onCommit: (id: number, horizon: string) => void; onDiscard: (id: number) => void; onResearch: (id: number) => void; onClick: () => void }> = ({ card, onCommit, onDiscard, onResearch, onClick }) => {
  return (
    <article className="card action-card" onClick={onClick} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column' }}>
      <div className="card-top">
        {card.type && <span className="card-type-badge">{card.type}</span>}
        <span className="card-status status">{card.status}</span>
      </div>
      <h3 className="card-title">{card.title}</h3>
      <p className="card-summary">{card.tldr || card.summary}</p>
      
      <ResearchProgressStrip cardId={card.id} compact={true} />

      <div className="card-footer" style={{ marginTop: 'auto', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }} onClick={(e) => e.stopPropagation()}>
        {card.status === 'inbox' && (
          <button type="button" className="btn-secondary" onClick={() => onResearch(card.id)} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
            <Sparkles size={14} style={{ marginRight: 6 }} /> Deep Research
          </button>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn-primary" style={{ flex: 1, fontSize: 11, padding: '4px' }} onClick={() => onCommit(card.id, 'short-term')} title="Commit to Short Term">
             Short
          </button>
          <button className="btn-primary" style={{ flex: 1, fontSize: 11, padding: '4px' }} onClick={() => onCommit(card.id, 'medium-term')} title="Commit to Medium Term">
             Medium
          </button>
          <button className="btn-primary" style={{ flex: 1, fontSize: 11, padding: '4px' }} onClick={() => onCommit(card.id, 'long-term')} title="Commit to Long Term">
             Long
          </button>
          <button className="btn-secondary" style={{ padding: '4px 8px' }} onClick={() => onDiscard(card.id)} title="Discard">
            <Archive size={14} color="#f87171" />
          </button>
        </div>
      </div>
    </article>
  );
};

export const TriageView: React.FC<TriageViewProps> = ({
  cards,
  onUpdateCard,
  onResearch,
  onOpenCardDetail,
}) => {
  const inboxCards = cards.filter((c) => c.status === 'inbox');
  const researchingCards = cards.filter((c) => c.status === 'researching');
  const reviewCards = cards.filter((c) => c.status === 'review');

  const triageTotal = inboxCards.length + researchingCards.length + reviewCards.length;

  const handleCommit = (id: number, horizon: string) => {
    onUpdateCard(id, { status: 'to-do' as any, horizon: horizon as any });
  };

  const handleDiscard = (id: number) => {
    onUpdateCard(id, { status: 'dismissed' as any });
  };

  const renderCard = (card: Card) => (
    <TriageCard
      key={card.id}
      card={card}
      onCommit={handleCommit}
      onDiscard={handleDiscard}
      onResearch={onResearch}
      onClick={() => onOpenCardDetail(card)}
    />
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 id="main-heading" style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Idea Funnel</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>({triageTotal} cards triage)</span>
        </h2>
      </div>

      <div className="kanban-board" data-view="triage">
        {/* Inbox Column */}
        <div className="kanban-column">
          <div className="column-header">
            <div className="column-title">
              <Inbox size={15} strokeWidth={1.5} color="#38bdf8" />
              <span>Inbox</span>
            </div>
            <span className="column-count">{inboxCards.length}</span>
          </div>
          <div className="cards-container">
            {inboxCards.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                Inbox zero! Great job.
              </div>
            ) : (
              inboxCards.map(renderCard)
            )}
          </div>
        </div>

        {/* Researching Column */}
        <div className="kanban-column">
          <div className="column-header">
            <div className="column-title">
              <Search size={15} strokeWidth={1.5} color="#c084fc" />
              <span>Researching</span>
            </div>
            <span className="column-count">{researchingCards.length}</span>
          </div>
          <div className="cards-container">
            {researchingCards.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                No active research in progress.
              </div>
            ) : (
              researchingCards.map(renderCard)
            )}
          </div>
        </div>

        {/* Review Column */}
        <div className="kanban-column">
          <div className="column-header">
            <div className="column-title">
              <Eye size={15} strokeWidth={1.5} color="#f472b6" />
              <span>Review</span>
            </div>
            <span className="column-count">{reviewCards.length}</span>
          </div>
          <div className="cards-container">
            {reviewCards.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                No reports to review.
              </div>
            ) : (
              reviewCards.map(renderCard)
            )}
          </div>
        </div>
      </div>
    </div>
  );
};