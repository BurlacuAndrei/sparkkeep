import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  RotateCw,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  ShieldAlert,
  ListTodo,
  FileText,
  Tag,
  Compass,
  Coins,
  History,
  Check,
  Plus,
  ChevronDown,
  BookOpen,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import { Card, ResearchItem, ResearchSource, Playbook } from '../types';
import { fetchCardResearchRuns, triggerResearch, fetchPlaybooks, submitResearchFeedback } from '../api';
import { useLocale } from '../i18n';
import { enumLabel } from '../utils/cardEnumLabels';
import { ResearchProgressStrip } from './ResearchProgressStrip';

interface ResearchReportViewProps {
  card: Card;
  initialResearch?: ResearchItem | null;
  onUpdateCard?: (id: number, updates: Partial<Card>) => Promise<void> | void;
  onAddActions?: (actions: string[]) => void;
  showToast?: (msg: string) => void;
}

// Simple safe markdown renderer that escapes HTML and renders common markdown structures
const SafeMarkdown: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: string[] = [];

  const flushList = (key: number) => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`list-${key}`} style={{ paddingLeft: 20, margin: '8px 0' }}>
          {currentList.map((item, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  const renderInline = (str: string): React.ReactNode => {
    // Split by markdown bold **text** or inline code `code`
    const parts = str.split(/(\*\*[^*]+\*\*|`[^`]+`|\[S\d+\])/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={i}
            style={{
              background: 'var(--surface-sunken)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-main)',
              padding: '2px 5px',
              borderRadius: 4,
              fontSize: '0.9em',
            }}
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      if (/^\[S\d+\]$/.test(part)) {
        const sid = part.slice(1, -1);
        return (
          <a
            key={i}
            href={`#source-${sid}`}
            onClick={(e) => {
              e.preventDefault();
              const el = document.getElementById(`source-${sid}`);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('source-highlight');
                setTimeout(() => el.classList.remove('source-highlight'), 2000);
              }
            }}
            style={{
              display: 'inline-block',
              margin: '0 2px',
              padding: '1px 5px',
              borderRadius: 4,
              background: 'var(--color-info-bg, rgba(56, 189, 248, 0.15))',
              border: '1px solid var(--color-info-border, rgba(56, 189, 248, 0.3))',
              color: 'var(--accent-blue, #0284c7)',
              fontSize: '0.85em',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      currentList.push(trimmed.slice(2));
      return;
    }

    flushList(idx);

    if (!trimmed) {
      return;
    }

    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={idx} style={{ margin: '14px 0 6px', color: 'var(--text-main)', fontSize: 14 }}>
          {renderInline(trimmed.slice(4))}
        </h4>
      );
    } else if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={idx} style={{ margin: '16px 0 8px', color: 'var(--text-main)', fontSize: 16 }}>
          {renderInline(trimmed.slice(3))}
        </h3>
      );
    } else if (trimmed.startsWith('# ')) {
      elements.push(
        <h2 key={idx} style={{ margin: '18px 0 10px', color: 'var(--text-main)', fontSize: 18 }}>
          {renderInline(trimmed.slice(2))}
        </h2>
      );
    } else {
      elements.push(
        <p key={idx} style={{ margin: '6px 0', lineHeight: 1.6 }}>
          {renderInline(trimmed)}
        </p>
      );
    }
  });

  flushList(lines.length);

  return <div style={{ fontSize: 13.5, color: 'var(--text-main)' }}>{elements}</div>;
};

export const ResearchReportView: React.FC<ResearchReportViewProps> = ({
  card,
  initialResearch,
  onUpdateCard,
  onAddActions,
  showToast,
}) => {
  const { t, tp, formatDate, formatNumber } = useLocale();
  const [history, setHistory] = useState<ResearchItem[]>([]);
  const [selectedRun, setSelectedRun] = useState<ResearchItem | null>(initialResearch || null);
  const [loading, setLoading] = useState(false);
  const [selectedActions, setSelectedActions] = useState<Record<number, boolean>>({});
  const [appliedHorizon, setAppliedHorizon] = useState(false);
  const [appliedTags, setAppliedTags] = useState(false);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [prevRunId, setPrevRunId] = useState<number | null>(selectedRun?.id ?? null);
  const [feedbackRating, setFeedbackRating] = useState<'thumbs_up' | 'thumbs_down' | null>(
    selectedRun?.feedback_rating ?? initialResearch?.feedback_rating ?? null
  );
  const [feedbackComment, setFeedbackComment] = useState<string>(
    selectedRun?.feedback_comment ?? initialResearch?.feedback_comment ?? ''
  );
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSaved, setFeedbackSaved] = useState(
    Boolean(selectedRun?.feedback_rating ?? initialResearch?.feedback_rating)
  );

  if (selectedRun && selectedRun.id !== prevRunId) {
    setPrevRunId(selectedRun.id);
    setFeedbackRating(selectedRun.feedback_rating || null);
    setFeedbackComment(selectedRun.feedback_comment || '');
    setFeedbackSaved(Boolean(selectedRun.feedback_rating));
  }

  useEffect(() => {
    fetchPlaybooks().then(setPlaybooks).catch(() => {});
  }, []);

  // Fetch full research history for this card
  useEffect(() => {
    let alive = true;
    fetchCardResearchRuns(card.id)
      .then((res) => {
        if (!alive) return;
        setHistory(res.history || []);
        setSelectedRun((prev) => {
          if (!prev && res.latest) {
            return res.latest;
          }
          if (res.latest && prev) {
            // If latest run is updated (e.g., active -> done), refresh selectedRun
            const match = (res.history || []).find((h) => h.id === prev.id);
            return match || prev;
          }
          return prev;
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [card.id]);

  const handleReRun = async (playbookId?: number) => {
    setLoading(true);
    setIsPickerOpen(false);
    try {
      const res = await triggerResearch(card.id, playbookId);
      showToast?.(
        res.playbook?.name
          ? t('research.report.toasts.startedWith', { name: res.playbook.name })
          : t('research.report.toasts.started')
      );
      // Refresh after short delay
      setTimeout(() => {
        fetchCardResearchRuns(card.id).then((res) => {
          setHistory(res.history || []);
          if (res.latest) setSelectedRun(res.latest);
          setLoading(false);
        });
      }, 500);
    } catch (err: any) {
      showToast?.(err.message || t('research.report.errors.trigger'));
      setLoading(false);
    }
  };

  const handleApplyHorizon = async (horizon: string) => {
    if (!onUpdateCard) return;
    try {
      await onUpdateCard(card.id, { horizon: horizon as any });
      setAppliedHorizon(true);
      showToast?.(t('research.report.toasts.horizonApplied', { horizon: horizonLabel(horizon) }));
    } catch (err: any) {
      showToast?.(err.message || t('research.report.errors.horizon'));
    }
  };

  const handleApplyTags = async (tags: string[]) => {
    if (!onUpdateCard) return;
    try {
      const existing = new Set(card.tags || []);
      tags.forEach((t) => existing.add(t));
      await onUpdateCard(card.id, { tags: Array.from(existing) });
      setAppliedTags(true);
      showToast?.(t('research.report.toasts.tagsApplied'));
    } catch (err: any) {
      showToast?.(err.message || t('research.report.errors.tags'));
    }
  };

  const handleAddSelectedActions = () => {
    const verdict = selectedRun?.result?.verdict;
    const actions = verdict?.next_actions || [];
    const toAdd = actions.filter((_, idx) => selectedActions[idx]);
    if (toAdd.length === 0) {
      showToast?.(t('research.report.toasts.selectAction'));
      return;
    }
    onAddActions?.(toAdd);
    showToast?.(tp('research.report.toasts.addedActions', toAdd.length));
  };

  const handleAddAllActions = () => {
    const verdict = selectedRun?.result?.verdict;
    const actions = verdict?.next_actions || [];
    if (actions.length === 0) return;
    onAddActions?.(actions);
    showToast?.(tp('research.report.toasts.addedActions', actions.length));
  };

  const handleFeedback = async (rating: 'thumbs_up' | 'thumbs_down', commentText?: string) => {
    if (!selectedRun) return;
    setFeedbackSubmitting(true);
    try {
      const commentToSubmit = commentText !== undefined ? commentText : feedbackComment;
      const updated = await submitResearchFeedback(selectedRun.id, rating, commentToSubmit);
      setFeedbackRating(rating);
      setFeedbackSaved(true);
      setSelectedRun(updated);
      showToast?.(
        rating === 'thumbs_up'
          ? t('research.report.toasts.feedbackHelpful')
          : t('research.report.toasts.feedbackNeedsWork')
      );
    } catch (err: any) {
      showToast?.(err.message || t('research.report.errors.feedback'));
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const result = selectedRun?.result;
  const verdict = result?.verdict;
  const claims = result?.claims || [];
  const landscape = result?.landscape || [];
  const risks = verdict?.risks || [];
  const nextActions = verdict?.next_actions || [];
  const sources = selectedRun?.sources || [];
  const isActive = selectedRun?.status === 'queued' || selectedRun?.status === 'running';

  const horizonLabel = (horizon: string): string => {
    if (horizon === 'short-term') return t('cards.horizon.short');
    if (horizon === 'medium-term') return t('cards.horizon.medium');
    if (horizon === 'long-term') return t('cards.horizon.long');
    return horizon;
  };

  const recommendation = verdict?.recommendation?.toLowerCase();
  let badgeClass = 'badge-watch';
  const badgeText = enumLabel(t, 'verdict', recommendation || 'watch').toUpperCase();
  if (recommendation === 'pursue') {
    badgeClass = 'badge-pursue';
  } else if (recommendation === 'skip') {
    badgeClass = 'badge-skip';
  }

  const scrollToSource = (sourceId: string) => {
    const sid = sourceId.startsWith('S') ? sourceId : `S${sourceId}`;
    const el = document.getElementById(`source-${sid}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('source-highlight');
      setTimeout(() => el.classList.remove('source-highlight'), 2000);
    }
  };

  return (
    <div className="research-report-view" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top action bar: History switcher & Re-run */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          padding: '10px 14px',
          background: 'var(--surface-sunken)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <History size={15} color="var(--text-dim)" />
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-main)' }}>
            {t('research.report.researchRun')}
          </span>
          {history.length > 0 ? (
            <select
              className="form-input"
              style={{ padding: '4px 8px', fontSize: 12.5, width: 'auto' }}
              value={selectedRun?.id || ''}
              onChange={(e) => {
                const found = history.find((h) => h.id === Number(e.target.value));
                if (found) setSelectedRun(found);
              }}
            >
              {history.map((run, idx) => (
                <option key={run.id} value={run.id}>
                  {t('research.report.runOption', {
                    id: run.id,
                    status: enumLabel(t, 'researchStatus', run.status).toUpperCase(),
                    date: formatDate(run.created_at),
                    latest: idx === 0 ? ` ${t('research.report.latestSuffix')}` : '',
                  })}
                </option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              {t('research.report.noneYet')}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {selectedRun?.tokens && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12,
                color: 'var(--text-dim)',
              }}
              title={t('research.report.tokensTitle')}
            >
              <Coins size={13} color="var(--color-warning-text, #d97706)" />
              <span>
                {tp('research.report.tokens', selectedRun.tokens, {
                  tokens: formatNumber(selectedRun.tokens),
                })}
              </span>
            </div>
          )}

          <div className="pb-split-btn-wrapper">
            <button
              type="button"
              className="btn-secondary pb-split-main"
              onClick={() => handleReRun()}
              disabled={loading || isActive}
              style={{ fontSize: 12, padding: '5px 10px' }}
            >
              <RotateCw size={13} className={loading || isActive ? 'spin-slow' : ''} />
              <span>{isActive ? t('research.report.running') : t('research.report.rerun')}</span>
            </button>
            <button
              type="button"
              className="btn-secondary pb-split-caret"
              onClick={() => setIsPickerOpen((v) => !v)}
              disabled={loading || isActive}
              style={{ fontSize: 12, padding: '5px 8px' }}
              title={t('research.report.pickPlaybook')}
            >
              <ChevronDown size={13} />
            </button>

            {isPickerOpen && (
              <div className="pb-picker-dropdown">
                <div className="pb-picker-header">
                  <BookOpen size={13} />
                  <span>{t('research.report.choosePlaybook')}</span>
                </div>
                <div className="pb-picker-list">
                  {playbooks.map((pb) => (
                    <button
                      key={pb.id}
                      type="button"
                      className="pb-picker-item"
                      onClick={() => handleReRun(pb.id)}
                    >
                      <div className="pb-picker-item-main">
                        <span className="pb-picker-name">{pb.name}</span>
                      </div>
                      <span className="pb-picker-desc">
                        {pb.description || tp('research.report.steps', pb.steps?.length || 0)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live progress strip if active */}
      {selectedRun && (
        <ResearchProgressStrip
          cardId={card.id}
          initialResearch={selectedRun}
          onComplete={(latest) => {
            setSelectedRun(latest);
            fetchCardResearchRuns(card.id).then((res) => setHistory(res.history || []));
          }}
        />
      )}

      {/* Main Report Content */}
      {selectedRun && !isActive && (
        <>
          {/* Quick Section Anchor Pills */}
          <div className="research-anchor-pills">
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginRight: 4 }}>
              {t('research.report.jumpTo')}
            </span>
            {verdict && (
              <button
                type="button"
                className="research-anchor-pill-btn"
                onClick={() => {
                  const el = document.getElementById('report-section-verdict');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                {t('research.report.verdict')}
              </button>
            )}
            {claims.length > 0 && (
              <button
                type="button"
                className="research-anchor-pill-btn"
                onClick={() => {
                  const el = document.getElementById('report-section-claims');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                {tp('research.report.claims', claims.length)}
              </button>
            )}
            {landscape.length > 0 && (
              <button
                type="button"
                className="research-anchor-pill-btn"
                onClick={() => {
                  const el = document.getElementById('report-section-landscape');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                {tp('research.report.landscape', landscape.length)}
              </button>
            )}
            {(risks.length > 0 || nextActions.length > 0) && (
              <button
                type="button"
                className="research-anchor-pill-btn"
                onClick={() => {
                  const el = document.getElementById('report-section-risks-actions');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                {t('research.report.risksActions')}
              </button>
            )}
            {selectedRun.findings && (
              <button
                type="button"
                className="research-anchor-pill-btn"
                onClick={() => {
                  const el = document.getElementById('report-section-findings');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                {t('research.report.findings')}
              </button>
            )}
            {sources.length > 0 && (
              <button
                type="button"
                className="research-anchor-pill-btn"
                onClick={() => {
                  const el = document.getElementById('report-section-sources');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                {tp('research.report.sources', sources.length)}
              </button>
            )}
          </div>

          {/* Header & Verdict */}
          {verdict ? (
            <div
              id="report-section-verdict"
              style={{
                background: 'var(--surface-sunken)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: 16,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={`badge ${badgeClass}`} style={{ fontSize: 13, padding: '4px 12px' }}>
                    {badgeText}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                    {t('research.report.confidence')}{' '}
                    <strong style={{ color: 'var(--text-main)', textTransform: 'capitalize' }}>
                      {enumLabel(t, 'confidence', verdict.confidence || 'medium')}
                    </strong>
                  </span>
                </div>
                {verdict.for_whom && (
                  <div style={{ fontSize: 12.5, color: 'var(--text-main)' }}>
                    <span style={{ color: 'var(--text-dim)' }}>{t('research.report.target')}</span>{' '}
                    <em>{verdict.for_whom}</em>
                  </div>
                )}
              </div>

              {/* Suggestions bar */}
              {(verdict.suggested_horizon || (verdict.suggested_tags && verdict.suggested_tags.length > 0)) && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                    padding: '8px 12px',
                    margin: '10px 0',
                    background: 'var(--surface-sunken)',
                    borderRadius: 6,
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {verdict.suggested_horizon && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Compass size={13} color="var(--accent-blue)" />
                      <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 500 }}>
                        {t('research.report.suggestedHorizon')}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: 'var(--accent-blue, #0284c7)',
                          textTransform: 'capitalize',
                        }}
                      >
                        {horizonLabel(verdict.suggested_horizon)}
                      </span>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleApplyHorizon(verdict.suggested_horizon!)}
                        disabled={appliedHorizon || card.horizon === verdict.suggested_horizon}
                        style={{ fontSize: 11, padding: '2px 8px', marginLeft: 4 }}
                      >
                        {appliedHorizon || card.horizon === verdict.suggested_horizon ? (
                          <>
                            <Check size={11} color="var(--color-success-text, #10b981)" />
                            <span>{t('research.report.applied')}</span>
                          </>
                        ) : (
                          t('research.report.apply')
                        )}
                      </button>
                    </div>
                  )}

                  {verdict.suggested_tags && verdict.suggested_tags.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Tag size={13} color="var(--accent-purple)" />
                      <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 500 }}>
                        {t('research.report.suggestedTags')}
                      </span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {verdict.suggested_tags.map((tag) => (
                          <span
                            key={tag}
                            style={{
                              fontSize: 11,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: 'rgba(168, 85, 247, 0.12)',
                              color: 'var(--accent-purple, #7c3aed)',
                              border: '1px solid rgba(168, 85, 247, 0.25)',
                              fontWeight: 600,
                            }}
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleApplyTags(verdict.suggested_tags!)}
                        disabled={appliedTags}
                        style={{ fontSize: 11, padding: '2px 8px', marginLeft: 4 }}
                      >
                        {appliedTags ? (
                          <>
                            <Check size={11} color="var(--color-success-text, #10b981)" />
                            <span>{t('research.report.applied')}</span>
                          </>
                        ) : (
                          t('research.report.apply')
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}

          {/* Claim Verification Table */}
          {claims.length > 0 && (
            <div
              id="report-section-claims"
              style={{
                background: 'var(--surface-sunken)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: 16,
              }}
            >
              <h4
                style={{
                  margin: '0 0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 14,
                  color: 'var(--text-main)',
                }}
              >
                <CheckCircle2 size={16} color="var(--accent-emerald)" />
                <span>{t('research.report.claimVerification')}</span>
              </h4>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 10px', color: 'var(--text-dim)', width: '35%' }}>
                        {t('research.report.claim')}
                      </th>
                      <th style={{ padding: '8px 10px', color: 'var(--text-dim)', width: '15%' }}>
                        {t('research.report.status')}
                      </th>
                      <th style={{ padding: '8px 10px', color: 'var(--text-dim)', width: '35%' }}>
                        {t('research.report.rationale')}
                      </th>
                      <th style={{ padding: '8px 10px', color: 'var(--text-dim)', width: '15%' }}>
                        {t('research.report.sourcesHeader')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {claims.map((cl, idx) => {
                      let statusIcon = <CheckCircle2 size={14} color="var(--color-success-text, #16a34a)" />;
                      let statusColor = 'var(--color-success-text, #16a34a)';
                      if (cl.status === 'disputed') {
                        statusIcon = <AlertTriangle size={14} color="var(--color-error-text, #dc2626)" />;
                        statusColor = 'var(--color-error-text, #dc2626)';
                      } else if (cl.status === 'unverified') {
                        statusIcon = <HelpCircle size={14} color="var(--color-warning-text, #d97706)" />;
                        statusColor = 'var(--color-warning-text, #d97706)';
                      }
                      const statusText = enumLabel(t, 'claimStatus', cl.status || 'supported');

                      return (
                        <tr
                          key={idx}
                          style={{
                            borderBottom: '1px solid var(--border-subtle)',
                            verticalAlign: 'top',
                          }}
                        >
                          <td style={{ padding: '10px 10px', color: 'var(--text-main)', fontWeight: 500 }}>
                            {cl.claim}
                          </td>
                          <td style={{ padding: '10px 10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: statusColor }}>
                              {statusIcon}
                              <span style={{ fontWeight: 600, fontSize: 12, textTransform: 'capitalize' }}>
                                {statusText}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 10px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                            {cl.rationale}
                          </td>
                          <td style={{ padding: '10px 10px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {(cl.sources || []).map((src) => (
                                <button
                                  key={src}
                                  type="button"
                                  onClick={() => scrollToSource(src)}
                                  style={{
                                    background: 'var(--color-info-bg, rgba(56, 189, 248, 0.15))',
                                    border: '1px solid var(--color-info-border, rgba(56, 189, 248, 0.3))',
                                    color: 'var(--accent-blue, #0284c7)',
                                    borderRadius: 4,
                                    padding: '1px 6px',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                  }}
                                >
                                  [{src}]
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Competitive Landscape */}
          {landscape.length > 0 && (
            <div
              id="report-section-landscape"
              style={{
                background: 'var(--surface-sunken)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: 16,
              }}
            >
              <h4
                style={{
                  margin: '0 0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 14,
                  color: 'var(--text-main)',
                }}
              >
                <Compass size={16} color="var(--accent-blue)" />
                <span>{t('research.report.competitiveLandscape')}</span>
              </h4>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 10px', color: 'var(--text-dim)', width: '25%' }}>
                        {t('research.report.name')}
                      </th>
                      <th style={{ padding: '8px 10px', color: 'var(--text-dim)', width: '35%' }}>
                        {t('research.report.summary')}
                      </th>
                      <th style={{ padding: '8px 10px', color: 'var(--text-dim)', width: '25%' }}>
                        {t('research.report.howItDiffers')}
                      </th>
                      <th style={{ padding: '8px 10px', color: 'var(--text-dim)', width: '15%' }}>
                        {t('research.report.sourcesHeader')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {landscape.map((item, idx) => (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid var(--border-subtle)',
                          verticalAlign: 'top',
                        }}
                      >
                        <td style={{ padding: '10px 10px', fontWeight: 600 }}>
                          {item.url ? (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: 'var(--accent-blue)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                textDecoration: 'none',
                              }}
                            >
                              <span>{item.name}</span>
                              <ExternalLink size={12} />
                            </a>
                          ) : (
                            <span style={{ color: 'var(--text-main)' }}>{item.name}</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 10px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                          {item.one_liner}
                        </td>
                        <td style={{ padding: '10px 10px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                          {item.how_it_differs}
                        </td>
                        <td style={{ padding: '10px 10px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {(item.sources || []).map((src) => (
                              <button
                                key={src}
                                type="button"
                                onClick={() => scrollToSource(src)}
                                style={{
                                  background: 'var(--color-info-bg, rgba(56, 189, 248, 0.15))',
                                  border: '1px solid var(--color-info-border, rgba(56, 189, 248, 0.3))',
                                  color: 'var(--accent-blue, #0284c7)',
                                  borderRadius: 4,
                                  padding: '1px 6px',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                [{src}]
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Risks & Next Actions */}
          <div
            id="report-section-risks-actions"
            style={{
              display: 'grid',
              gridTemplateColumns: risks.length > 0 && nextActions.length > 0 ? 'repeat(auto-fit, minmax(280px, 1fr))' : '1fr',
              gap: 16,
            }}
          >
            {/* Risks */}
            {risks.length > 0 && (
              <div
                style={{
                  background: 'var(--surface-sunken)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8,
                  padding: 16,
                }}
              >
                <h4
                  style={{
                    margin: '0 0 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 14,
                    color: 'var(--color-error)',
                  }}
                >
                  <ShieldAlert size={16} />
                  <span>{t('research.report.identifiedRisks')}</span>
                </h4>
                <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-main)', fontSize: 13, lineHeight: 1.6 }}>
                  {risks.map((risk, i) => (
                    <li key={i} style={{ marginBottom: 6 }}>
                      {risk}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Next Actions */}
            {nextActions.length > 0 && (
              <div
                style={{
                  background: 'var(--surface-sunken)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8,
                  padding: 16,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 12,
                  }}
                >
                  <h4
                    style={{
                      margin: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 14,
                      color: 'var(--accent-blue)',
                    }}
                  >
                    <ListTodo size={16} />
                    <span>{t('research.report.recommendedActions')}</span>
                  </h4>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleAddSelectedActions}
                      style={{ fontSize: 11, padding: '3px 8px' }}
                    >
                      <Plus size={11} color="var(--color-success-text, #10b981)" />
                      <span>{t('research.report.addSelected')}</span>
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleAddAllActions}
                      style={{ fontSize: 11, padding: '3px 8px' }}
                    >
                      <span>{t('research.report.addAll')}</span>
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {nextActions.map((action, idx) => (
                    <label
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        fontSize: 13,
                        color: 'var(--text-main)',
                        cursor: 'pointer',
                        padding: '4px 6px',
                        borderRadius: 4,
                        background: selectedActions[idx] ? 'var(--color-info-bg)' : 'transparent',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!selectedActions[idx]}
                        onChange={(e) =>
                          setSelectedActions((prev) => ({ ...prev, [idx]: e.target.checked }))
                        }
                        style={{ marginTop: 3 }}
                      />
                      <span>{action}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Findings text (markdown report) */}
          {selectedRun.findings && (
            <div
              id="report-section-findings"
              style={{
                background: 'var(--surface-sunken)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: 16,
              }}
            >
              <h4
                style={{
                  margin: '0 0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 14,
                  color: 'var(--text-main)',
                }}
              >
                <FileText size={16} color="var(--text-dim)" />
                <span>{t('research.report.detailedFindings')}</span>
              </h4>
              <SafeMarkdown text={selectedRun.findings} />
            </div>
          )}

          {/* Sources List */}
          {sources.length > 0 && (
            <div
              id="report-section-sources"
              style={{
                background: 'var(--surface-sunken)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: 16,
              }}
            >
              <h4
                style={{
                  margin: '0 0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 14,
                  color: 'var(--text-main)',
                }}
              >
                <Sparkles size={16} color="var(--accent-amber)" />
                <span>{tp('research.report.citedSources', sources.length)}</span>
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {sources.map((s: ResearchSource) => (
                  <div
                    key={s.id}
                    id={`source-${s.id}`}
                    style={{
                      padding: '10px 12px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 6,
                      transition: 'all 0.3s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span
                        style={{
                          background: 'var(--color-info-bg)',
                          color: 'var(--accent-blue)',
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        [{s.id}]
                      </span>
                      {s.url ? (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: 'var(--accent-blue)',
                            fontSize: 13,
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            textDecoration: 'none',
                          }}
                        >
                          <span>{s.title || s.url}</span>
                          <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-main)', fontSize: 13, fontWeight: 600 }}>
                          {s.title || t('research.report.untitled')}
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: 11,
                          color: 'var(--text-dim)',
                          background: 'var(--border-subtle)',
                          padding: '1px 6px',
                          borderRadius: 4,
                          textTransform: 'uppercase',
                        }}
                      >
                        {enumLabel(t, 'origin', s.origin)}
                      </span>
                    </div>

                    {s.url && (
                      <div style={{ fontSize: 11.5, color: 'var(--text-dim)', wordBreak: 'break-all', marginBottom: 4 }}>
                        {s.url}
                      </div>
                    )}

                    {s.clipped_text && (
                      <p
                        style={{
                          margin: '4px 0 0',
                          fontSize: 12,
                          color: 'var(--text-dim)',
                          lineHeight: 1.5,
                          fontStyle: 'italic',
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        "{s.clipped_text}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Report Quality Feedback */}
          {selectedRun && selectedRun.status === 'done' && (
            <div
              style={{
                background: 'var(--surface-sunken)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: '14px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                marginTop: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>
                  {t('research.report.feedbackQuestion')}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{
                      padding: '6px 12px',
                      fontSize: 12.5,
                      borderRadius: 6,
                      border: feedbackRating === 'thumbs_up' ? '1px solid var(--color-success-border, #10b981)' : '1px solid var(--border-subtle)',
                      background: feedbackRating === 'thumbs_up' ? 'var(--color-success-bg)' : 'transparent',
                      color: feedbackRating === 'thumbs_up' ? 'var(--color-success-text)' : 'var(--text-dim)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: feedbackSubmitting ? 'not-allowed' : 'pointer',
                    }}
                    disabled={feedbackSubmitting}
                    onClick={() => handleFeedback('thumbs_up')}
                  >
                    <ThumbsUp size={14} />
                    <span>{t('research.report.helpful')}</span>
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{
                      padding: '6px 12px',
                      fontSize: 12.5,
                      borderRadius: 6,
                      border: feedbackRating === 'thumbs_down' ? '1px solid var(--color-error-border, #ef4444)' : '1px solid var(--border-subtle)',
                      background: feedbackRating === 'thumbs_down' ? 'var(--color-error-bg)' : 'transparent',
                      color: feedbackRating === 'thumbs_down' ? 'var(--color-error-text)' : 'var(--text-dim)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: feedbackSubmitting ? 'not-allowed' : 'pointer',
                    }}
                    disabled={feedbackSubmitting}
                    onClick={() => handleFeedback('thumbs_down')}
                  >
                    <ThumbsDown size={14} />
                    <span>{t('research.report.needsWork')}</span>
                  </button>
                </div>
              </div>

              {feedbackRating && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                  <input
                    type="text"
                    placeholder={t('research.report.feedbackPlaceholder')}
                    value={feedbackComment}
                    onChange={(e) => setFeedbackComment(e.target.value)}
                    style={{
                      flex: 1,
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-input)',
                      borderRadius: 6,
                      padding: '6px 10px',
                      color: 'var(--text-main)',
                      fontSize: 12,
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleFeedback(feedbackRating, feedbackComment);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: '5px 12px' }}
                    disabled={feedbackSubmitting}
                    onClick={() => handleFeedback(feedbackRating, feedbackComment)}
                  >
                    {feedbackSaved ? t('research.report.update') : t('common.save')}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Legacy or empty state fallback */}
      {!selectedRun && !isActive && (
        <div
          style={{
            padding: 32,
            textAlign: 'center',
            background: 'var(--surface-sunken)',
            borderRadius: 8,
            border: '1px dashed var(--border-subtle)',
          }}
        >
          <p style={{ color: 'var(--text-dim)', margin: '0 0 12px', fontSize: 13 }}>
            {t('research.report.empty')}
          </p>
          <button type="button" className="btn-primary" onClick={() => handleReRun()} disabled={loading}>
            <RotateCw size={13} className={loading ? 'spin-slow' : ''} />
            <span>{t('research.report.start')}</span>
          </button>
        </div>
      )}
    </div>
  );
};
