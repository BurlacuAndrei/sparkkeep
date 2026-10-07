import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Playbook } from '../types';
import * as api from '../api';
import { ArrowRight, Check, Archive, Sparkles, X, FileText, Lightbulb, CheckCircle2, ExternalLink, RefreshCw, AlertTriangle, HelpCircle, Link2, ChevronDown, BookOpen } from 'lucide-react';
import { ResearchProgressStrip } from './ResearchProgressStrip';


// A card is stale once nothing has touched it for a month.
const STALE_DAYS = 30;

function idleDays(card: Card): number {
  const ts = Date.parse(card.updated_at || card.created_at || '');
  if (Number.isNaN(ts)) return 0;
  return Math.floor((Date.now() - ts) / 86_400_000);
}

// Swipe gestures mirror the arrow-key hotkeys exactly.
const SWIPE_ACT = 100;
const SWIPE_UP_ACT = 100;
const SWIPE_UP_MAX_DX = 80;

function swipeAction(dx: number, dy: number): string | null {
  if (dx > SWIPE_ACT) return 'doing';
  if (dx < -SWIPE_ACT) return 'shelved';
  if (dy < -SWIPE_UP_ACT && Math.abs(dx) < SWIPE_UP_MAX_DX) return 'done';
  return null;
}

function stampFor(dx: number, dy: number): 'doing' | 'shelve' | 'done' | null {
  if (dx > 40) return 'doing';
  if (dx < -40) return 'shelve';
  if (dy < -50 && Math.abs(dx) < 40) return 'done';
  return null;
}

const STAMP_LABEL = { doing: 'DOING', shelve: 'SHELVE', done: 'DONE' } as const;

interface TriageViewProps {
  cards: Card[];
  onStatusChange: (id: number, status: string) => void;
  onResearch: (id: number, playbookId?: number) => void;
  onRetry: (id: number) => void;
  onOpenCardDetail: (card: Card) => void;
  onRefresh?: () => void;
  isPro?: boolean;
  onOpenLicenseModal?: () => void;
  showToast?: (msg: string) => void;
}

export const TriageView: React.FC<TriageViewProps> = ({
  cards,
  onStatusChange,
  onResearch,
  onRetry,
  onOpenCardDetail,
  onRefresh,
  isPro = false,
  onOpenLicenseModal,
  showToast,
}) => {
  // Focus primarily on inbox cards first, or all cards
  const inboxCards = cards.filter((c) => c.status === 'inbox');
  const baseCards = inboxCards.length > 0 ? inboxCards : cards;
  const [staleOnly, setStaleOnly] = useState(false);
  const [shelveMsg, setShelveMsg] = useState('');
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [batching, setBatching] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  useEffect(() => {
    api.fetchPlaybooks().then(setPlaybooks).catch(() => {});
  }, []);
  const triageCards = staleOnly
    ? baseCards.filter((c) => idleDays(c) >= STALE_DAYS)
    : baseCards;
  const [currentIndex, setCurrentIndex] = useState(0);

  // Keep index clamped within bounds without cascading render effect
  const safeIndex = triageCards.length > 0 && currentIndex >= triageCards.length
    ? triageCards.length - 1
    : currentIndex;

  const currentCard = triageCards[safeIndex];
  const currentIdleDays = currentCard ? idleDays(currentCard) : 0;
  const isStale = currentIdleDays >= STALE_DAYS;

  const handleShelveStale = useCallback(async () => {
    if (!window.confirm(`Shelve every inbox/doing card untouched for more than ${STALE_DAYS} days?`)) return;
    try {
      const res = await api.batchShelveStale(STALE_DAYS);
      setShelveMsg(`Shelved ${res.shelved_count} stale card${res.shelved_count === 1 ? '' : 's'}.`);
      setCurrentIndex(0);
      onRefresh?.();
    } catch (err: unknown) {
      setShelveMsg(api.getErrorMessage(err));
    }
  }, [onRefresh]);

  const handleQueueAll = useCallback(async () => {
    if (triageCards.length === 0) return;
    if (!isPro) {
      onOpenLicenseModal?.();
      return;
    }
    setBatching(true);
    try {
      const res = await api.batchQueueResearch(triageCards.map((c) => c.id));
      showToast?.(`Queued ${res.queued.length} card(s) for deep research`);
      onRefresh?.();
    } catch (err) {
      showToast?.(api.getErrorMessage(err));
    } finally {
      setBatching(false);
    }
  }, [triageCards, isPro, onOpenLicenseModal, showToast, onRefresh]);

  const handleAction = useCallback((status: string) => {
    if (!currentCard) return;
    onStatusChange(currentCard.id, status);
  }, [currentCard, onStatusChange]);

  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const resetDrag = useCallback(() => {
    setTouchStart(null);
    setDragOffset({ x: 0, y: 0 });
    setIsDragging(false);
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (t) setTouchStart({ x: t.clientX, y: t.clientY });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t || !touchStart) return;
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) setIsDragging(true);
    setDragOffset({ x: dx, y: dy });
  };

  const handleTouchEnd = () => {
    const action = swipeAction(dragOffset.x, dragOffset.y);
    resetDrag();
    if (action) handleAction(action);
  };

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
        if (e.shiftKey) {
          setIsPickerOpen((v) => !v);
        } else {
          onResearch(currentCard.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentCard, handleAction, onResearch]);

  const autoPlaybook = useMemo(() => {
    if (!currentCard) return null;
    const cardType = (currentCard.type || '').trim().toLowerCase();
    if (cardType) {
      const userMatch = playbooks.find(
        (p) => !p.is_builtin && p.card_types?.some((ct) => ct.trim().toLowerCase() === cardType)
      );
      if (userMatch) return userMatch;
      const builtinMatch = playbooks.find(
        (p) => p.is_builtin && p.card_types?.some((ct) => ct.trim().toLowerCase() === cardType)
      );
      if (builtinMatch) return builtinMatch;
    }
    return playbooks.find((p) => p.is_builtin && p.id === 1) || playbooks[0] || null;
  }, [currentCard, playbooks]);

  const staleControls = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <button
        type="button"
        className="icon-btn"
        onClick={() => {
          setStaleOnly((v) => !v);
          setCurrentIndex(0);
        }}
        title={`Only show cards untouched for more than ${STALE_DAYS} days`}
        style={staleOnly ? { borderColor: '#fbbf24', color: '#fbbf24' } : undefined}
      >
        <AlertTriangle size={14} />
        <span>Review Stale (&gt;{STALE_DAYS}d)</span>
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={handleShelveStale}
        title={`Shelve every inbox/doing card untouched for more than ${STALE_DAYS} days`}
      >
        <Archive size={14} />
        <span>Shelve Stale Cards</span>
      </button>
      {shelveMsg && <span style={{ fontSize: 12, color: '#fbbf24' }}>{shelveMsg}</span>}
    </div>
  );

  if (!currentCard) {
    return (
      <div className="triage-container" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          {staleControls}
        </div>
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
  const stamp = isDragging ? stampFor(dragOffset.x, dragOffset.y) : null;

  return (
    <div className="triage-container">
      <div className="triage-progress">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, color: '#38bdf8' }}>Focus Triage</span>
          <span style={{ color: '#64748b' }}>·</span>
          <span>Card {safeIndex + 1} of {triageCards.length}</span>
          {staleControls}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ fontSize: 11.5, padding: '3px 8px', height: 26 }}
            disabled={batching || triageCards.length === 0}
            onClick={handleQueueAll}
            title="Queue all remaining cards for research"
          >
            <Sparkles size={12} style={{ marginRight: 4 }} />
            {batching ? 'Queueing...' : `Queue All (${triageCards.length})`}
            {!isPro && (
              <span
                style={{
                  marginLeft: 4,
                  fontSize: 9.5,
                  padding: '0 4px',
                  borderRadius: 3,
                  background: 'rgba(255, 255, 255, 0.15)',
                }}
              >
                PRO
              </span>
            )}
          </button>
          <button
            type="button"
            className="icon-btn"
            disabled={safeIndex === 0}
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            title="Previous card"
          >
            &larr;
          </button>
          <button
            type="button"
            className="icon-btn"
            disabled={safeIndex >= triageCards.length - 1}
            onClick={() => setCurrentIndex((prev) => Math.min(triageCards.length - 1, prev + 1))}
            title="Next card"
          >
            &rarr;
          </button>
        </div>
      </div>

      <div
        className="triage-card"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={resetDrag}
        style={{
          transform: isDragging
            ? `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0) rotate(${dragOffset.x * 0.05}deg)`
            : undefined,
          transition: isDragging ? 'none' : 'transform 0.25s ease-out',
        }}
      >
        {stamp && <span className={`swipe-stamp ${stamp}`}>{STAMP_LABEL[stamp]}</span>}
        <div className="triage-header">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {currentCard.type && (
                <span className="card-type-badge">{currentCard.type}</span>
              )}
              <span className={`horizon-pill ${currentCard.horizon}`}>
                {currentCard.horizon}
              </span>
              {currentCard.worthiness?.level && (
                <span
                  className={`worthiness-badge ${currentCard.worthiness.level.toLowerCase()}`}
                  title={currentCard.worthiness.reason ? `Worthiness: ${currentCard.worthiness.level} — ${currentCard.worthiness.reason}` : `Worthiness: ${currentCard.worthiness.level}`}
                  aria-label={`Worthiness: ${currentCard.worthiness.level}`}
                >
                  ★ {currentCard.worthiness.level.toUpperCase()}
                </span>
              )}
              {currentCard.signals?.extraction && currentCard.signals.extraction !== 'full' && (
                <span
                  className="signal-chip extraction-warning"
                  title={`Extraction completeness: ${currentCard.signals.extraction}`}
                >
                  ⚠️ {currentCard.signals.extraction}
                </span>
              )}
              {currentCard.signals?.promo && (
                <span
                  className="signal-chip promo-warning"
                  title="Flagged as promotional content"
                >
                  📣 Promo
                </span>
              )}
              {currentCard.signals?.source_quality && (
                <span
                  className="signal-chip source-quality"
                  title={`Source quality: ${currentCard.signals.source_quality}`}
                >
                  🎯 {currentCard.signals.source_quality}
                </span>
              )}
              <span style={{ fontSize: 12, color: '#64748b' }}>ID #{currentCard.id}</span>
              {isStale && (
                <span
                  className="horizon-pill"
                  style={{
                    background: 'rgba(245, 158, 11, 0.15)',
                    color: '#fbbf24',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                  }}
                  title={`No activity since ${currentCard.updated_at || currentCard.created_at}`}
                >
                  ⚠️ Stale ({currentIdleDays} days inactive)
                </span>
              )}
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

        {/* Structured Triage Briefing */}
        <div className="briefing-box">
          {/* TL;DR (prominent) */}
          <div className="briefing-section triage-tldr-box">
            <div className="briefing-heading heading-summary">
              <FileText size={13} />
              <span>TL;DR</span>
            </div>
            <p className="briefing-text triage-tldr-text">
              {currentCard.tldr || currentCard.executive_summary || currentCard.summary || 'No summary generated.'}
            </p>
          </div>

          {(currentCard.why_care || currentCard.value_proposition) && (
            <div className="briefing-section">
              <div className="briefing-heading heading-value">
                <Lightbulb size={13} />
                <span>Why You Might Care</span>
              </div>
              <p className="briefing-text">{currentCard.why_care || currentCard.value_proposition}</p>
            </div>
          )}

          {currentCard.claims && currentCard.claims.length > 0 && (
            <div className="briefing-section">
              <div className="briefing-heading heading-claims">
                <CheckCircle2 size={13} />
                <span>Claims</span>
              </div>
              <div className="actions-list">
                {currentCard.claims.slice(0, 3).map((claim, i) => (
                  <div key={i} className="action-item claim-item">
                    <span className="claim-bullet">•</span>
                    <span>{claim}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentCard.open_questions && currentCard.open_questions.length > 0 && (
            <div className="briefing-section">
              <div className="briefing-heading heading-questions">
                <HelpCircle size={13} />
                <span>Open questions research would answer</span>
              </div>
              <div className="actions-list">
                {currentCard.open_questions.slice(0, 3).map((q, i) => (
                  <div key={i} className="action-item question-item">
                    <span className="question-bullet">?</span>
                    <span>{q}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* References: compact chips, clickable */}
          {currentCard.references && currentCard.references.length > 0 && (
            <div className="briefing-section">
              <div className="briefing-heading heading-refs">
                <Link2 size={13} />
                <span>References</span>
              </div>
              <div className="references-chips">
                {currentCard.references.map((ref, i) =>
                  ref.url ? (
                    <a
                      key={i}
                      href={ref.url}
                      target="_blank"
                      rel="noreferrer"
                      className="ref-chip clickable"
                      title={`${ref.kind}: ${ref.label}\n${ref.url}`}
                    >
                      <span className="ref-chip-kind">{ref.kind}</span>
                      <span className="ref-chip-label">{ref.label}</span>
                      <ExternalLink size={10} />
                    </a>
                  ) : (
                    <span key={i} className="ref-chip" title={`${ref.kind}: ${ref.label}`}>
                      <span className="ref-chip-kind">{ref.kind}</span>
                      <span className="ref-chip-label">{ref.label}</span>
                    </span>
                  )
                )}
              </div>
            </div>
          )}

          {/* Researched chip if card was researched (placeholder until Prompt 10) */}
          {(currentCard.status === 'done' || (currentCard.proposed_actions && currentCard.proposed_actions.length > 0)) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <span className="researched-chip" title="Card has research findings">
                Researched ✓ — verdict
              </span>
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

        <ResearchProgressStrip cardId={currentCard.id} />

        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', gap: 12, marginTop: 4 }}>
          {(() => {
            const isHigh = currentCard.worthiness?.level?.toLowerCase() === 'high';
            const btnLabel = autoPlaybook ? `Research: ${autoPlaybook.name} (R)` : 'Autonomous Deep Research (R)';
            return (
              <div className="pb-split-btn-wrapper">
                <button
                  type="button"
                  className={isHigh ? 'triage-research-btn promoted pb-split-main' : 'btn-secondary pb-split-main'}
                  onClick={() => onResearch(currentCard.id)}
                  style={{ fontSize: 12, padding: isHigh ? '8px 14px' : '6px 12px' }}
                  title="Run auto-selected playbook (R)"
                >
                  <Sparkles size={14} color={isHigh ? '#fff' : '#c084fc'} />
                  <span>{btnLabel}</span>
                </button>
                <button
                  type="button"
                  className={isHigh ? 'triage-research-btn promoted pb-split-caret' : 'btn-secondary pb-split-caret'}
                  onClick={() => setIsPickerOpen((v) => !v)}
                  style={{ fontSize: 12, padding: isHigh ? '8px 10px' : '6px 8px' }}
                  title="Choose research playbook (Shift+R)"
                >
                  <ChevronDown size={14} />
                </button>

                {isPickerOpen && (
                  <div className="pb-picker-dropdown">
                    <div className="pb-picker-header">
                      <BookOpen size={13} />
                      <span>Select Research Playbook</span>
                    </div>
                    <div className="pb-picker-list">
                      {playbooks.map((pb) => {
                        const isAuto = autoPlaybook?.id === pb.id;
                        return (
                          <button
                            key={pb.id}
                            type="button"
                            className={`pb-picker-item ${isAuto ? 'auto-selected' : ''}`}
                            onClick={() => {
                              setIsPickerOpen(false);
                              onResearch(currentCard.id, pb.id);
                            }}
                          >
                            <div className="pb-picker-item-main">
                              <span className="pb-picker-name">{pb.name}</span>
                              {isAuto && <span className="pb-picker-badge">Auto</span>}
                            </div>
                            <span className="pb-picker-desc">{pb.description || `${pb.steps?.length || 0} steps`}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

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