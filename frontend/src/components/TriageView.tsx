import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../types';
import { ArrowLeft, ArrowRight, Check, Archive, Sparkles, X, FileText, Lightbulb, CheckCircle2, ExternalLink, RefreshCw } from 'lucide-react';

interface TriageViewProps {
  cards: Card[];
  onStatusChange: (id: number, status: string) => void;
  onResearch: (id: number) => void;
  onRetry: (id: number) => void;
  onOpenCardDetail: (card: Card) => void;
}

export const TriageView: React.FC<TriageViewProps> = ({
  cards,
  onStatusChange,
  onResearch,
  onRetry,
  onOpenCardDetail,
}) => {
  // Focus primarily on inbox cards first, or all cards
  const inboxCards = cards.filter((c) => c.status === 'inbox');
  const triageCards = inboxCards.length > 0 ? inboxCards : cards;
  const [currentIndex, setCurrentIndex] = useState(0);

  // Keep index in range
  useEffect(() => {
    if (currentIndex >= triageCards.length && triageCards.length > 0) {
      setCurrentIndex(triageCards.length - 1);
    }
  }, [triageCards.length, currentIndex]);

  const currentCard = triageCards[currentIndex];

  const handleAction = useCallback((status: string) => {
    if (!currentCard) return;
    onStatusChange(currentCard.id, status);
  }, [currentCard, onStatusChange]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger hotkeys if user is in an input field
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return;
      }
      if (!currentCard) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleAction('shelved');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleAction('doing');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleAction('done');
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        handleAction('dismissed');
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        onResearch(currentCard.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentCard, handleAction, onResearch]);

  if (!currentCard) {
    return (
      <div className="triage-container" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <CheckCircle2 size={36} />
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>All Caught Up!</h2>
        <p style={{ color: '#94a3b8', fontSize: 14 }}>
          No cards left in your triage queue. Every spark has been converted into an action or archived.
        </p>
      </div>
    );
  }

  const isFailed = currentCard.title === 'Analysis failed';

  return (
    <div className="triage-container">
      <div className="triage-progress">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, color: '#38bdf8' }}>Focus Triage</span>
          <span style={{ color: '#64748b' }}>·</span>
          <span>Card {currentIndex + 1} of {triageCards.length}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className="icon-btn"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            title="Previous card"
          >
            &larr;
          </button>
          <button
            type="button"
            className="icon-btn"
            disabled={currentIndex >= triageCards.length - 1}
            onClick={() => setCurrentIndex((prev) => Math.min(triageCards.length - 1, prev + 1))}
            title="Next card"
          >
            &rarr;
          </button>
        </div>
      </div>

      <div className="triage-card">
        <div className="triage-header">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={`horizon-pill ${currentCard.horizon}`}>
                {currentCard.horizon}
              </span>
              <span style={{ fontSize: 12, color: '#64748b' }}>ID #{currentCard.id}</span>
            </div>
            <h2 className="triage-title">{currentCard.title}</h2>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {currentCard.source_url && (
              <a
                href={currentCard.source_url}
                target="_blank"
                rel="noreferrer"
                className="icon-btn"
                title="Open Source Link"
              >
                <ExternalLink size={15} />
              </a>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onOpenCardDetail(currentCard)}
              style={{ padding: '5px 10px', fontSize: 12 }}
            >
              Full Details
            </button>
          </div>
        </div>

        {/* Structured "So What?" Briefing */}
        <div className="briefing-box">
          <div className="briefing-section">
            <div className="briefing-heading heading-summary">
              <FileText size={13} />
              <span>Executive Summary</span>
            </div>
            <p className="briefing-text">
              {currentCard.executive_summary || currentCard.summary || 'No summary generated.'}
            </p>
          </div>

          {currentCard.value_proposition && (
            <div className="briefing-section">
              <div className="briefing-heading heading-value">
                <Lightbulb size={13} />
                <span>Value Proposition (Why Care?)</span>
              </div>
              <p className="briefing-text">{currentCard.value_proposition}</p>
            </div>
          )}

          {currentCard.proposed_actions && currentCard.proposed_actions.length > 0 && (
            <div className="briefing-section">
              <div className="briefing-heading heading-actions">
                <CheckCircle2 size={13} />
                <span>Proposed Actions</span>
              </div>
              <div className="actions-list">
                {currentCard.proposed_actions.map((act, i) => (
                  <div key={i} className="action-item">
                    <span className="action-bullet">{i + 1}.</span>
                    <span>{act}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tags */}
        {currentCard.tags && currentCard.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {currentCard.tags.map((t) => (
              <span key={t} className="card-tag-pill" style={{ fontSize: 11, padding: '3px 8px' }}>
                #{t}
              </span>
            ))}
          </div>
        )}

        {/* Action Controls */}
        <div className="triage-controls">
          <button
            type="button"
            className="triage-action-btn btn-shelve"
            onClick={() => handleAction('shelved')}
            title="Shelve for later review (Hotkey: Left Arrow)"
          >
            <Archive size={18} />
            <span>Shelve</span>
            <span className="hotkey-badge">&larr; Left</span>
          </button>

          <button
            type="button"
            className="triage-action-btn btn-doing"
            onClick={() => handleAction('doing')}
            title="Put in Doing queue (Hotkey: Right Arrow)"
          >
            <ArrowRight size={18} />
            <span>Do Now</span>
            <span className="hotkey-badge">&rarr; Right</span>
          </button>

          <button
            type="button"
            className="triage-action-btn btn-done"
            onClick={() => handleAction('done')}
            title="Mark Done (Hotkey: Up Arrow)"
          >
            <Check size={18} />
            <span>Completed</span>
            <span className="hotkey-badge">&uarr; Up</span>
          </button>

          <button
            type="button"
            className="triage-action-btn btn-dismiss"
            onClick={() => handleAction('dismissed')}
            title="Dismiss / Not Interested (Hotkey: D)"
          >
            <X size={18} />
            <span>Dismiss</span>
            <span className="hotkey-badge">D</span>
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 4 }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onResearch(currentCard.id)}
            style={{ fontSize: 12, padding: '6px 14px' }}
          >
            <Sparkles size={14} color="#c084fc" />
            <span>Autonomous Deep Research (R)</span>
          </button>

          {isFailed && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onRetry(currentCard.id)}
              style={{ fontSize: 12, padding: '6px 14px' }}
            >
              <RefreshCw size={14} color="#fbbf24" />
              <span>Retry Extraction</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
