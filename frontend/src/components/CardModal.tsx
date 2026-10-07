import React, { useEffect, useState } from 'react';
import { Card, ResearchItem, Reference, ReferenceKind } from '../types';
import { fetchCardResearch, getErrorMessage } from '../api';
import { X, Sparkles, ExternalLink, RefreshCw, Save, FileText, Lightbulb, CheckCircle2, ClipboardCopy, CheckSquare, Trash2, Plus, FileSearch, ListPlus, Link2, HelpCircle } from 'lucide-react';
import { CustomSelect } from './CustomSelect';
import { CARD_HORIZON_OPTIONS, CARD_STATUS_OPTIONS } from './selectOptions';
import { ResearchReportView } from './ResearchReportView';

interface CardModalProps {
  card: Card | null;
  onClose: () => void;
  onUpdate: (id: number, patch: Partial<Card>) => void;
  onResearch: (id: number) => void;
  onRetry: (id: number) => void;
  showToast?: (msg: string) => void;
}

// extractFindingsActions turns the bullet lines of a findings report into
// candidate checklist items. ponytail: bullet/numbered lines only — no
// markdown parser; anything fancier belongs in the research prompt.
const MAX_EXTRACTED_ACTIONS = 10;

function extractFindingsActions(findings: string): string[] {
  const out: string[] = [];
  for (const raw of findings.split('\n')) {
    const m = raw.trim().match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (!m) continue;
    const text = m[1].replace(/[*_`]/g, '').trim();
    if (text.length > 2 && !out.includes(text)) out.push(text);
    if (out.length >= MAX_EXTRACTED_ACTIONS) break;
  }
  return out;
}

export const CardModal: React.FC<CardModalProps> = ({
  card,
  onClose,
  onUpdate,
  onResearch,
  onRetry,
  showToast,
}) => {
  const [title, setTitle] = useState(card?.title || '');
  const [_summary, _setSummary] = useState(card?.summary || '');
  const [tldr, setTldr] = useState(card?.tldr || card?.executive_summary || '');
  const [whyCare, setWhyCare] = useState(card?.why_care || card?.value_proposition || '');
  const [claims, setClaims] = useState<string[]>(card?.claims || []);
  const [newClaim, setNewClaim] = useState('');
  const [openQuestions, setOpenQuestions] = useState<string[]>(card?.open_questions || []);
  const [newQuestion, setNewQuestion] = useState('');
  const [executiveSummary, setExecutiveSummary] = useState(card?.executive_summary || '');
  const [valueProposition, setValueProposition] = useState(card?.value_proposition || '');
  const [horizon, setHorizon] = useState(card?.horizon || 'short-term');
  const [status, setStatus] = useState(card?.status || 'inbox');
  const [note, setNote] = useState(card?.source_note || '');
  const [tagsInput, setTagsInput] = useState((card?.tags || []).join(', '));
  const [references, setReferences] = useState<Reference[]>(card?.references || []);
  const [newRefKind, setNewRefKind] = useState<ReferenceKind>('url');
  const [newRefLabel, setNewRefLabel] = useState('');
  const [newRefUrl, setNewRefUrl] = useState('');
  const [actions, setActions] = useState<string[]>(card?.proposed_actions || []);
  const [completedActions, setCompletedActions] = useState<Record<number, boolean>>({});
  const [newAction, setNewAction] = useState('');
  const [research, setResearch] = useState<ResearchItem | null>(null);

  const cardId = card?.id;
  useEffect(() => {
    if (!cardId) return;
    let alive = true;
    fetchCardResearch(cardId)
      .then((r) => {
        if (alive) setResearch(r);
      })
      .catch((err: Error) => showToast?.(err.message));
    return () => {
      alive = false;
    };
  }, [cardId, showToast]);

  if (!card) return null;

  const toggleAction = (index: number) => {
    setCompletedActions((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const editAction = (index: number, text: string) => {
    setActions((prev) => prev.map((a, i) => (i === index ? text : a)));
  };

  // removeAction also reindexes the completion flags so the remaining
  // checkboxes keep their state.
  const removeAction = (index: number) => {
    setActions((prev) => prev.filter((_, i) => i !== index));
    setCompletedActions((prev) => {
      const next: Record<number, boolean> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const i = Number(k);
        if (i < index) next[i] = v;
        else if (i > index) next[i - 1] = v;
      });
      return next;
    });
  };

  const addAction = () => {
    const text = newAction.trim();
    if (!text) return;
    setActions((prev) => [...prev, text]);
    setNewAction('');
  };

  const addClaim = () => {
    const text = newClaim.trim();
    if (!text) return;
    setClaims((prev) => [...prev, text]);
    setNewClaim('');
  };

  const editClaim = (index: number, text: string) => {
    setClaims((prev) => prev.map((c, i) => (i === index ? text : c)));
  };

  const removeClaim = (index: number) => {
    setClaims((prev) => prev.filter((_, i) => i !== index));
  };

  const addQuestion = () => {
    const text = newQuestion.trim();
    if (!text) return;
    setOpenQuestions((prev) => [...prev, text]);
    setNewQuestion('');
  };

  const editQuestion = (index: number, text: string) => {
    setOpenQuestions((prev) => prev.map((q, i) => (i === index ? text : q)));
  };

  const removeQuestion = (index: number) => {
    setOpenQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const removeReference = (index: number) => {
    setReferences((prev) => prev.filter((_, i) => i !== index));
  };

  const addReference = () => {
    const lbl = newRefLabel.trim();
    const u = newRefUrl.trim();
    if (!lbl && !u) return;
    const item: Reference = {
      kind: newRefKind,
      label: lbl || u,
      ...(u ? { url: u } : {}),
    };
    setReferences((prev) => [...prev, item]);
    setNewRefLabel('');
    setNewRefUrl('');
    setNewRefKind('url');
  };

  const appendFindingsAsActions = () => {
    if (!research) return;
    const seen = new Set(actions.map((a) => a.trim().toLowerCase()));
    const structuredActions = research.result?.verdict?.next_actions || [];
    const candidates = structuredActions.length > 0 ? structuredActions : extractFindingsActions(research.findings);
    const fresh = candidates.filter((a) => !seen.has(a.trim().toLowerCase()));
    if (!fresh.length) {
      showToast?.('No new actions in these findings');
      return;
    }
    setActions((prev) => [...prev, ...fresh]);
    showToast?.(`Added ${fresh.length} actions — save to persist`);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate(card.id, {
      title,
      summary: _summary,
      tldr,
      why_care: whyCare,
      claims,
      open_questions: openQuestions,
      executive_summary: executiveSummary || tldr,
      value_proposition: valueProposition || whyCare,
      horizon: horizon as 'short-term' | 'medium-term' | 'long-term' | 'lifetime',
      status: status as any,
      source_note: note,
      tags: tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
      references,
      proposed_actions: actions,
    });
    onClose();
  };

  const isFailed = card.title === 'Analysis failed';

  const fetchMarkdown = async () => {
    const res = await fetch(`/api/v1/cards/${card.id}/export.md`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  };

  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(await fetchMarkdown());
      showToast?.('Markdown copied to clipboard');
    } catch (err: unknown) {
      showToast?.(getErrorMessage(err));
    }
  };

  const handleAddToTodoist = async () => {
    try {
      const md = await fetchMarkdown();
      const q = new URLSearchParams({ text: card.title, description: md });
      window.open(`https://todoist.com/showTask?${q.toString()}`, '_blank', 'noopener');
      showToast?.('Opening Todoist with this spark...');
    } catch (err: unknown) {
      showToast?.(getErrorMessage(err));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={`horizon-pill ${card.horizon}`}>{card.horizon}</span>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>Card #{card.id}</span>
          </div>
          <button type="button" className="close-btn" onClick={onClose}>
            <X size={17} strokeWidth={1.5} />
          </button>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="form-group">
            <label>Headline</label>
            <input
              type="text"
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          {/* Structured Triage Briefing Box */}
          <div className="briefing-box">
            <div className="briefing-section">
              <div className="briefing-heading heading-summary">
                <FileText size={13} strokeWidth={1.5} />
                <span>TL;DR</span>
              </div>
              <textarea
                className="form-textarea"
                rows={2}
                value={tldr}
                onChange={(e) => setTldr(e.target.value)}
                placeholder="Core TL;DR takeaway..."
              />
            </div>

            <div className="briefing-section">
              <div className="briefing-heading heading-value">
                <Lightbulb size={13} strokeWidth={1.5} />
                <span>Why You Might Care</span>
              </div>
              <textarea
                className="form-textarea"
                rows={2}
                value={whyCare}
                onChange={(e) => setWhyCare(e.target.value)}
                placeholder="Why is this valuable or useful..."
              />
            </div>

            {/* Claims Editor */}
            <div className="briefing-section">
              <div className="briefing-heading heading-claims">
                <CheckCircle2 size={13} strokeWidth={1.5} />
                <span>Key Claims</span>
              </div>
              <div className="actions-list">
                {claims.map((claim, idx) => (
                  <div key={idx} className="action-item" style={{ alignItems: 'center' }}>
                    <span style={{ color: 'var(--accent-emerald)', fontWeight: 700 }}>•</span>
                    <input
                      type="text"
                      className="form-input"
                      value={claim}
                      onChange={(e) => editClaim(idx, e.target.value)}
                      aria-label={`Claim ${idx + 1}`}
                      style={{
                        flex: 1,
                        padding: '4px 8px',
                        fontSize: 13.5,
                        background: 'transparent',
                        border: '1px solid transparent',
                      }}
                    />
                    <button
                      type="button"
                      className="close-btn"
                      onClick={() => removeClaim(idx)}
                      title="Remove claim"
                      aria-label="Remove claim"
                    >
                      <Trash2 size={13} strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  className="form-input"
                  value={newClaim}
                  placeholder="Add a claim..."
                  onChange={(e) => setNewClaim(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addClaim();
                    }
                  }}
                />
                <button type="button" className="btn-secondary" onClick={addClaim}>
                  <Plus size={13} strokeWidth={1.5} color="#34d399" />
                  <span>Add Claim</span>
                </button>
              </div>
            </div>

            {/* Open Questions Editor */}
            <div className="briefing-section">
              <div className="briefing-heading heading-questions">
                <HelpCircle size={13} strokeWidth={1.5} />
                <span>Open Questions</span>
              </div>
              <div className="actions-list">
                {openQuestions.map((q, idx) => (
                  <div key={idx} className="action-item" style={{ alignItems: 'center' }}>
                    <span style={{ color: 'var(--accent-amber)', fontWeight: 700 }}>?</span>
                    <input
                      type="text"
                      className="form-input"
                      value={q}
                      onChange={(e) => editQuestion(idx, e.target.value)}
                      aria-label={`Question ${idx + 1}`}
                      style={{
                        flex: 1,
                        padding: '4px 8px',
                        fontSize: 13.5,
                        background: 'transparent',
                        border: '1px solid transparent',
                      }}
                    />
                    <button
                      type="button"
                      className="close-btn"
                      onClick={() => removeQuestion(idx)}
                      title="Remove question"
                      aria-label="Remove question"
                    >
                      <Trash2 size={13} strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  className="form-input"
                  value={newQuestion}
                  placeholder="Add an open question..."
                  onChange={(e) => setNewQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addQuestion();
                    }
                  }}
                />
                <button type="button" className="btn-secondary" onClick={addQuestion}>
                  <Plus size={13} strokeWidth={1.5} color="#fbbf24" />
                  <span>Add Question</span>
                </button>
              </div>
            </div>

            {/* Proposed Actions Checklist (only visible when non-empty, populated by research) */}
            {actions.length > 0 && (
              <div className="briefing-section">
                <div className="briefing-heading heading-actions">
                  <CheckCircle2 size={13} strokeWidth={1.5} />
                  <span>Proposed Actions Checklist</span>
                </div>
                <div className="actions-list">
                  {actions.map((act, idx) => (
                    <div
                      key={idx}
                      className="action-item"
                      style={{ alignItems: 'center', opacity: completedActions[idx] ? 0.6 : 1 }}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(completedActions[idx])}
                        onChange={() => toggleAction(idx)}
                        style={{ cursor: 'pointer' }}
                        aria-label={`Action ${idx + 1} done`}
                      />
                      <input
                        type="text"
                        className="form-input"
                        value={act}
                        onChange={(e) => editAction(idx, e.target.value)}
                        aria-label={`Action ${idx + 1}`}
                        style={{
                          flex: 1,
                          padding: '4px 8px',
                          fontSize: 13.5,
                          background: 'transparent',
                          border: '1px solid transparent',
                          textDecoration: completedActions[idx] ? 'line-through' : 'none',
                        }}
                      />
                      <button
                        type="button"
                        className="close-btn"
                        onClick={() => removeAction(idx)}
                        title="Remove action"
                        aria-label="Remove action"
                      >
                        <Trash2 size={13} strokeWidth={1.5} />
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    className="form-input"
                    value={newAction}
                    placeholder="Add a step..."
                    onChange={(e) => setNewAction(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addAction();
                      }
                    }}
                  />
                  <button type="button" className="btn-secondary" onClick={addAction}>
                    <Plus size={13} strokeWidth={1.5} color="#34d399" />
                    <span>Add Step</span>
                  </button>
                </div>
              </div>
            )}

            {card && (
              <div className="briefing-section">
                <div className="briefing-heading" style={{ marginBottom: 12 }}>
                  <FileSearch size={14} strokeWidth={1.5} color="#38bdf8" />
                  <span>Deep Research Report</span>
                </div>
                <ResearchReportView
                  card={card}
                  initialResearch={research}
                  onUpdateCard={async (id, updates) => {
                    onUpdate(id, updates);
                    if (updates.horizon) setHorizon(updates.horizon as any);
                    if (updates.tags) setTagsInput(updates.tags.join(', '));
                  }}
                  onAddActions={(newActions) => {
                    const seen = new Set(actions.map((a) => a.trim().toLowerCase()));
                    const fresh = newActions.filter((a) => !seen.has(a.trim().toLowerCase()));
                    if (fresh.length > 0) {
                      setActions((prev) => [...prev, ...fresh]);
                    }
                  }}
                  showToast={showToast}
                />
              </div>
            )}
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="card-status">Status</label>
              <CustomSelect
                id="card-status"
                value={status}
                onChange={(val) => setStatus(val as any)}
                options={CARD_STATUS_OPTIONS}
                ariaLabel="Card status"
              />
            </div>

            <div className="form-group">
              <label htmlFor="card-horizon">Horizon</label>
              <CustomSelect
                id="card-horizon"
                value={horizon}
                onChange={(val) => setHorizon(val as any)}
                options={CARD_HORIZON_OPTIONS}
                ariaLabel="Card horizon"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Tags (comma separated)</label>
            <input
              type="text"
              className="form-input"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
            />
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Link2 size={13} strokeWidth={1.5} color="#38bdf8" />
                <span>References</span>
              </label>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                {references.length} {references.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            {references.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                {references.map((ref, idx) => (
                  <div
                    key={idx}
                    className="reference-item"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '5px 8px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1, overflow: 'hidden' }}>
                      <span className={`ref-kind-chip ref-kind-${ref.kind}`}>
                        {ref.kind}
                      </span>
                      <span
                        style={{
                          fontSize: 13,
                          color: '#e2e8f0',
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={ref.label}
                      >
                        {ref.label || ref.url}
                      </span>
                      {ref.url && (
                        <a
                          href={ref.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            color: '#38bdf8',
                            fontSize: 12,
                            textDecoration: 'none',
                            marginLeft: 'auto',
                            paddingRight: 4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: 220,
                          }}
                          title={ref.url}
                        >
                          <ExternalLink size={11} strokeWidth={1.5} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{ref.url}</span>
                        </a>
                      )}
                    </div>
                    <button
                      type="button"
                      className="close-btn"
                      onClick={() => removeReference(idx)}
                      title="Remove reference"
                      aria-label={`Remove reference ${ref.label || ref.url}`}
                    >
                      <Trash2 size={13} strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                className="form-input"
                value={newRefKind}
                onChange={(e) => setNewRefKind(e.target.value as ReferenceKind)}
                style={{ width: 95, padding: '4px 6px', fontSize: 12 }}
                aria-label="Reference kind"
              >
                <option value="url">url</option>
                <option value="repo">repo</option>
                <option value="tool">tool</option>
                <option value="product">product</option>
                <option value="person">person</option>
                <option value="org">org</option>
                <option value="paper">paper</option>
                <option value="other">other</option>
              </select>
              <input
                type="text"
                className="form-input"
                placeholder="Label or entity name..."
                value={newRefLabel}
                onChange={(e) => setNewRefLabel(e.target.value)}
                style={{ flex: '1 1 140px', minWidth: 120, padding: '4px 8px', fontSize: 12.5 }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addReference();
                  }
                }}
              />
              <input
                type="text"
                className="form-input"
                placeholder="URL (optional)..."
                value={newRefUrl}
                onChange={(e) => setNewRefUrl(e.target.value)}
                style={{ flex: '1 1 160px', minWidth: 140, padding: '4px 8px', fontSize: 12.5 }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addReference();
                  }
                }}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={addReference}
                style={{ padding: '4px 10px', fontSize: 12 }}
              >
                <Plus size={12} strokeWidth={1.5} color="#34d399" />
                <span>Add Ref</span>
              </button>
            </div>
          </div>

          {card.source_url && (
            <div className="form-group">
              <label>Source Link</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  className="form-input"
                  readOnly
                  value={card.source_url}
                  style={{ opacity: 0.8 }}
                />
                <a
                  href={card.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                  style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <ExternalLink size={13} strokeWidth={1.5} />
                  <span>Visit</span>
                </a>
              </div>
            </div>
          )}

          <div className="form-group">
            <label>Source Note / Caption</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Captured context or raw note..."
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onResearch(card.id)}
              >
                <Sparkles size={13} strokeWidth={1.5} color="#c084fc" />
                <span>Deep Research</span>
              </button>

              {isFailed && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => onRetry(card.id)}
                >
                  <RefreshCw size={13} strokeWidth={1.5} color="#fbbf24" />
                  <span>Retry Extraction</span>
                </button>
              )}

              <button type="button" className="btn-secondary" onClick={handleCopyMarkdown}>
                <ClipboardCopy size={13} strokeWidth={1.5} color="#34d399" />
                <span>Copy Markdown</span>
              </button>

              <button type="button" className="btn-secondary" onClick={handleAddToTodoist}>
                <CheckSquare size={13} strokeWidth={1.5} color="#e879f9" />
                <span>Add to Todoist</span>
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                <Save size={13} strokeWidth={1.5} />
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};