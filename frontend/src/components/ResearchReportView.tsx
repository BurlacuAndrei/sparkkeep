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
              background: 'rgba(51, 65, 85, 0.4)',
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
              background: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              color: '#38bdf8',
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
        <h4 key={idx} style={{ margin: '14px 0 6px', color: '#f8fafc', fontSize: 14 }}>
          {renderInline(trimmed.slice(4))}
        </h4>
      );
    } else if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={idx} style={{ margin: '16px 0 8px', color: '#f8fafc', fontSize: 16 }}>
          {renderInline(trimmed.slice(3))}
        </h3>
      );
    } else if (trimmed.startsWith('# ')) {
      elements.push(
        <h2 key={idx} style={{ margin: '18px 0 10px', color: '#f8fafc', fontSize: 18 }}>
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

  return <div style={{ fontSize: 13.5, color: '#cbd5e1' }}>{elements}</div>;
};

export const ResearchReportView: React.FC<ResearchReportViewProps> = ({
  card,
  initialResearch,
  onUpdateCard,
  onAddActions,
  showToast,
}) => {
  const [history, setHistory] = useState<ResearchItem[]>([]);
  const [selectedRun, setSelectedRun] = useState<ResearchItem | null>(initialResearch || null);
  const [loading, setLoading] = useState(false);
  const [selectedActions, setSelectedActions] = useState<Record<number, boolean>>({});
  const [appliedHorizon, setAppliedHorizon] = useState(false);
  const [appliedTags, setAppliedTags] = useState(false);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState<'thumbs_up' | 'thumbs_down' | null>(
    initialResearch?.feedback_rating || null
  );
  const [feedbackComment, setFeedbackComment] = useState<string>(
    initialResearch?.feedback_comment || ''
  );
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSaved, setFeedbackSaved] = useState(false);

  useEffect(() => {
    if (selectedRun) {
      setFeedbackRating(selectedRun.feedback_rating || null);
      setFeedbackComment(selectedRun.feedback_comment || '');
      setFeedbackSaved(Boolean(selectedRun.feedback_rating));
    }
  }, [selectedRun?.id]);

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
        if (!selectedRun && res.latest) {
          setSelectedRun(res.latest);
        } else if (res.latest && selectedRun) {
          // If latest run is updated (e.g., active -> done), refresh selectedRun
          const match = res.history.find((h) => h.id === selectedRun.id);
          if (match) setSelectedRun(match);
        }
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
      const pbName = res.playbook?.name ? ` with "${res.playbook.name}"` : '';
      showToast?.(`Research started${pbName}`);
      // Refresh after short delay
      setTimeout(() => {
        fetchCardResearchRuns(card.id).then((res) => {
          setHistory(res.history || []);
          if (res.latest) setSelectedRun(res.latest);
          setLoading(false);
        });
      }, 500);
    } catch (err: any) {
      showToast?.(err.message || 'Failed to trigger research');
      setLoading(false);
    }
  };

  const handleApplyHorizon = async (horizon: string) => {
    if (!onUpdateCard) return;
    try {
      await onUpdateCard(card.id, { horizon: horizon as any });
      setAppliedHorizon(true);
      showToast?.(`Applied horizon: ${horizon}`);
    } catch (err: any) {
      showToast?.(err.message || 'Failed to update horizon');
    }
  };

  const handleApplyTags = async (tags: string[]) => {
    if (!onUpdateCard) return;
    try {
      const existing = new Set(card.tags || []);
      tags.forEach((t) => existing.add(t));
      await onUpdateCard(card.id, { tags: Array.from(existing) });
      setAppliedTags(true);
      showToast?.(`Applied suggested tags`);
    } catch (err: any) {
      showToast?.(err.message || 'Failed to update tags');
    }
  };

  const handleAddSelectedActions = () => {
    const verdict = selectedRun?.result?.verdict;
    const actions = verdict?.next_actions || [];
    const toAdd = actions.filter((_, idx) => selectedActions[idx]);
    if (toAdd.length === 0) {
      showToast?.('Select at least one action to add');
      return;
    }
    onAddActions?.(toAdd);
    showToast?.(`Added ${toAdd.length} action(s) to card`);
  };

  const handleAddAllActions = () => {
    const verdict = selectedRun?.result?.verdict;
    const actions = verdict?.next_actions || [];
    if (actions.length === 0) return;
    onAddActions?.(actions);
    showToast?.(`Added ${actions.length} actions to card`);
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
      showToast?.(rating === 'thumbs_up' ? 'Feedback recorded: Helpful! 👍' : 'Feedback recorded: Needs improvement 👎');
    } catch (err: any) {
      showToast?.(err.message || 'Failed to submit feedback');
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

  const recommendation = verdict?.recommendation?.toLowerCase();
  let badgeClass = 'badge-watch';
  let badgeText = 'WATCH';
  if (recommendation === 'pursue') {
    badgeClass = 'badge-pursue';
    badgeText = 'PURSUE';
  } else if (recommendation === 'skip') {
    badgeClass = 'badge-skip';
    badgeText = 'SKIP';
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
          background: 'rgba(30, 41, 59, 0.4)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <History size={15} color="#94a3b8" />
          <span style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0' }}>Research Run:</span>
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
                  #{run.id} · {run.status.toUpperCase()} ({new Date(run.created_at).toLocaleDateString()})
                  {idx === 0 ? ' (Latest)' : ''}
                </option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize: 12, color: '#94a3b8' }}>None yet</span>
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
                color: '#94a3b8',
              }}
              title="Total tokens consumed in this run"
            >
              <Coins size={13} color="#fbbf24" />
              <span>{selectedRun.tokens.toLocaleString()} tokens</span>
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
              <span>{isActive ? 'Running...' : 'Re-run Research'}</span>
            </button>
            <button
              type="button"
              className="btn-secondary pb-split-caret"
              onClick={() => setIsPickerOpen((v) => !v)}
              disabled={loading || isActive}
              style={{ fontSize: 12, padding: '5px 8px' }}
              title="Pick playbook for re-run"
            >
              <ChevronDown size={13} />
            </button>

            {isPickerOpen && (
              <div className="pb-picker-dropdown">
                <div className="pb-picker-header">
                  <BookOpen size={13} />
                  <span>Choose Playbook</span>
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
                      <span className="pb-picker-desc">{pb.description || `${pb.steps?.length || 0} steps`}</span>
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
          {/* Header & Verdict */}
          {verdict ? (
            <div
              style={{
                background: 'rgba(30, 41, 59, 0.5)',
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
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>
                    Confidence:{' '}
                    <strong style={{ color: '#f8fafc', textTransform: 'capitalize' }}>
                      {verdict.confidence || 'Medium'}
                    </strong>
                  </span>
                </div>
                {verdict.for_whom && (
                  <div style={{ fontSize: 12.5, color: '#cbd5e1' }}>
                    <span style={{ color: '#94a3b8' }}>Target:</span> <em>{verdict.for_whom}</em>
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
                    background: 'rgba(15, 23, 42, 0.6)',
                    borderRadius: 6,
                    border: '1px solid rgba(56, 189, 248, 0.2)',
                  }}
                >
                  {verdict.suggested_horizon && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Compass size={13} color="#38bdf8" />
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>Suggested Horizon:</span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#38bdf8',
                          textTransform: 'capitalize',
                        }}
                      >
                        {verdict.suggested_horizon}
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
                            <Check size={11} color="#34d399" />
                            <span>Applied</span>
                          </>
                        ) : (
                          'Apply'
                        )}
                      </button>
                    </div>
                  )}

                  {verdict.suggested_tags && verdict.suggested_tags.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Tag size={13} color="#c084fc" />
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>Suggested Tags:</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {verdict.suggested_tags.map((t) => (
                          <span
                            key={t}
                            style={{
                              fontSize: 11,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: 'rgba(192, 132, 252, 0.15)',
                              color: '#c084fc',
                            }}
                          >
                            #{t}
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
                            <Check size={11} color="#34d399" />
                            <span>Applied</span>
                          </>
                        ) : (
                          'Apply'
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
              style={{
                background: 'rgba(30, 41, 59, 0.5)',
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
                  color: '#f8fafc',
                }}
              >
                <CheckCircle2 size={16} color="#34d399" />
                <span>Claim Verification</span>
              </h4>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 10px', color: '#94a3b8', width: '35%' }}>Claim</th>
                      <th style={{ padding: '8px 10px', color: '#94a3b8', width: '15%' }}>Status</th>
                      <th style={{ padding: '8px 10px', color: '#94a3b8', width: '35%' }}>Rationale</th>
                      <th style={{ padding: '8px 10px', color: '#94a3b8', width: '15%' }}>Sources</th>
                    </tr>
                  </thead>
                  <tbody>
                    {claims.map((cl, idx) => {
                      let statusIcon = <CheckCircle2 size={14} color="#34d399" />;
                      let statusColor = '#34d399';
                      let statusText = 'Supported';

                      if (cl.status === 'disputed') {
                        statusIcon = <AlertTriangle size={14} color="#f87171" />;
                        statusColor = '#f87171';
                        statusText = 'Disputed';
                      } else if (cl.status === 'unverified') {
                        statusIcon = <HelpCircle size={14} color="#fbbf24" />;
                        statusColor = '#fbbf24';
                        statusText = 'Unverified';
                      }

                      return (
                        <tr
                          key={idx}
                          style={{
                            borderBottom: '1px solid rgba(51, 65, 85, 0.4)',
                            verticalAlign: 'top',
                          }}
                        >
                          <td style={{ padding: '10px 10px', color: '#f8fafc', fontWeight: 500 }}>
                            {cl.claim}
                          </td>
                          <td style={{ padding: '10px 10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: statusColor }}>
                              {statusIcon}
                              <span style={{ fontWeight: 600, fontSize: 12 }}>{statusText}</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 10px', color: '#cbd5e1', lineHeight: 1.5 }}>
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
                                    background: 'rgba(56, 189, 248, 0.15)',
                                    border: '1px solid rgba(56, 189, 248, 0.3)',
                                    color: '#38bdf8',
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
              style={{
                background: 'rgba(30, 41, 59, 0.5)',
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
                  color: '#f8fafc',
                }}
              >
                <Compass size={16} color="#38bdf8" />
                <span>Competitive Landscape</span>
              </h4>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 10px', color: '#94a3b8', width: '25%' }}>Name</th>
                      <th style={{ padding: '8px 10px', color: '#94a3b8', width: '35%' }}>Summary</th>
                      <th style={{ padding: '8px 10px', color: '#94a3b8', width: '25%' }}>How It Differs</th>
                      <th style={{ padding: '8px 10px', color: '#94a3b8', width: '15%' }}>Sources</th>
                    </tr>
                  </thead>
                  <tbody>
                    {landscape.map((item, idx) => (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid rgba(51, 65, 85, 0.4)',
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
                                color: '#38bdf8',
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
                            <span style={{ color: '#f8fafc' }}>{item.name}</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 10px', color: '#cbd5e1', lineHeight: 1.5 }}>
                          {item.one_liner}
                        </td>
                        <td style={{ padding: '10px 10px', color: '#cbd5e1', lineHeight: 1.5 }}>
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
                                  background: 'rgba(56, 189, 248, 0.15)',
                                  border: '1px solid rgba(56, 189, 248, 0.3)',
                                  color: '#38bdf8',
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
            style={{
              display: 'grid',
              gridTemplateColumns: risks.length > 0 && nextActions.length > 0 ? '1fr 1fr' : '1fr',
              gap: 16,
            }}
          >
            {/* Risks */}
            {risks.length > 0 && (
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.5)',
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
                    color: '#f87171',
                  }}
                >
                  <ShieldAlert size={16} />
                  <span>Identified Risks</span>
                </h4>
                <ul style={{ margin: 0, paddingLeft: 18, color: '#cbd5e1', fontSize: 13, lineHeight: 1.6 }}>
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
                  background: 'rgba(30, 41, 59, 0.5)',
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
                      color: '#38bdf8',
                    }}
                  >
                    <ListTodo size={16} />
                    <span>Recommended Next Actions</span>
                  </h4>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleAddSelectedActions}
                      style={{ fontSize: 11, padding: '3px 8px' }}
                    >
                      <Plus size={11} color="#34d399" />
                      <span>Add Selected</span>
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleAddAllActions}
                      style={{ fontSize: 11, padding: '3px 8px' }}
                    >
                      <span>Add All</span>
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
                        color: '#cbd5e1',
                        cursor: 'pointer',
                        padding: '4px 6px',
                        borderRadius: 4,
                        background: selectedActions[idx] ? 'rgba(56, 189, 248, 0.08)' : 'transparent',
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
              style={{
                background: 'rgba(30, 41, 59, 0.5)',
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
                  color: '#f8fafc',
                }}
              >
                <FileText size={16} color="#94a3b8" />
                <span>Detailed Findings</span>
              </h4>
              <SafeMarkdown text={selectedRun.findings} />
            </div>
          )}

          {/* Sources List */}
          {sources.length > 0 && (
            <div
              style={{
                background: 'rgba(30, 41, 59, 0.5)',
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
                  color: '#f8fafc',
                }}
              >
                <Sparkles size={16} color="#fbbf24" />
                <span>Cited Sources ({sources.length})</span>
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {sources.map((s: ResearchSource) => (
                  <div
                    key={s.id}
                    id={`source-${s.id}`}
                    style={{
                      padding: '10px 12px',
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 6,
                      transition: 'all 0.3s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span
                        style={{
                          background: 'rgba(56, 189, 248, 0.2)',
                          color: '#38bdf8',
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
                            color: '#38bdf8',
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
                        <span style={{ color: '#f8fafc', fontSize: 13, fontWeight: 600 }}>
                          {s.title || 'Untitled'}
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: 11,
                          color: '#94a3b8',
                          background: 'rgba(51, 65, 85, 0.4)',
                          padding: '1px 6px',
                          borderRadius: 4,
                          textTransform: 'uppercase',
                        }}
                      >
                        {s.origin}
                      </span>
                    </div>

                    {s.url && (
                      <div style={{ fontSize: 11.5, color: '#64748b', wordBreak: 'break-all', marginBottom: 4 }}>
                        {s.url}
                      </div>
                    )}

                    {s.clipped_text && (
                      <p
                        style={{
                          margin: '4px 0 0',
                          fontSize: 12,
                          color: '#94a3b8',
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
                background: 'rgba(30, 41, 59, 0.4)',
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
                <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>
                  Was this research report useful?
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{
                      padding: '6px 12px',
                      fontSize: 12.5,
                      borderRadius: 6,
                      border: feedbackRating === 'thumbs_up' ? '1px solid #10b981' : '1px solid rgba(148, 163, 184, 0.2)',
                      background: feedbackRating === 'thumbs_up' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                      color: feedbackRating === 'thumbs_up' ? '#34d399' : '#cbd5e1',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: feedbackSubmitting ? 'not-allowed' : 'pointer',
                    }}
                    disabled={feedbackSubmitting}
                    onClick={() => handleFeedback('thumbs_up')}
                  >
                    <ThumbsUp size={14} />
                    <span>Helpful</span>
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{
                      padding: '6px 12px',
                      fontSize: 12.5,
                      borderRadius: 6,
                      border: feedbackRating === 'thumbs_down' ? '1px solid #ef4444' : '1px solid rgba(148, 163, 184, 0.2)',
                      background: feedbackRating === 'thumbs_down' ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                      color: feedbackRating === 'thumbs_down' ? '#f87171' : '#cbd5e1',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: feedbackSubmitting ? 'not-allowed' : 'pointer',
                    }}
                    disabled={feedbackSubmitting}
                    onClick={() => handleFeedback('thumbs_down')}
                  >
                    <ThumbsDown size={14} />
                    <span>Needs work</span>
                  </button>
                </div>
              </div>

              {feedbackRating && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                  <input
                    type="text"
                    placeholder="Optional comment on what worked or what was missing..."
                    value={feedbackComment}
                    onChange={(e) => setFeedbackComment(e.target.value)}
                    style={{
                      flex: 1,
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      borderRadius: 6,
                      padding: '6px 10px',
                      color: '#f8fafc',
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
                    {feedbackSaved ? 'Update' : 'Save'}
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
            background: 'rgba(30, 41, 59, 0.3)',
            borderRadius: 8,
            border: '1px dashed var(--border-subtle)',
          }}
        >
          <p style={{ color: '#94a3b8', margin: '0 0 12px', fontSize: 13 }}>
            No research report generated for this card yet.
          </p>
          <button type="button" className="btn-primary" onClick={() => handleReRun()} disabled={loading}>
            <RotateCw size={13} className={loading ? 'spin-slow' : ''} />
            <span>Start Deep Research</span>
          </button>
        </div>
      )}
    </div>
  );
};
