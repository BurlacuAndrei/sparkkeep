import React, { useEffect, useState } from 'react';
import { Card, ResearchItem } from '../types';
import { fetchCardResearch } from '../api';
import { X, Sparkles, ExternalLink, RefreshCw, Save, FileText, Lightbulb, CheckCircle2, ClipboardCopy, CheckSquare, Trash2, Plus, FileSearch, ListPlus } from 'lucide-react';

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
  const [executiveSummary, setExecutiveSummary] = useState(card?.executive_summary || '');
  const [valueProposition, setValueProposition] = useState(card?.value_proposition || '');
  const [horizon, setHorizon] = useState(card?.horizon || 'short-term');
  const [status, setStatus] = useState(card?.status || 'inbox');
  const [note, setNote] = useState(card?.source_note || '');
  const [tagsInput, setTagsInput] = useState((card?.tags || []).join(', '));
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

  const appendFindingsAsActions = () => {
    if (!research) return;
    const seen = new Set(actions.map((a) => a.trim().toLowerCase()));
    const fresh = extractFindingsActions(research.findings).filter((a) => !seen.has(a.toLowerCase()));
    if (!fresh.length) {
      showToast?.('No new bullet points in these findings');
      return;
    }
    setActions((prev) => [...prev, ...fresh]);
    showToast?.(`Added ${fresh.length} finding bullets — save to persist`);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate(card.id, {
      title,
      summary: _summary,
      executive_summary: executiveSummary,
      value_proposition: valueProposition,
      horizon: horizon as 'short-term' | 'lifetime',
      status: status as any,
      source_note: note,
      tags: tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
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
    } catch (err: any) {
      showToast?.(err.message);
    }
  };

  const handleAddToTodoist = async () => {
    try {
      const md = await fetchMarkdown();
      const q = new URLSearchParams({ text: card.title, description: md });
      window.open(`https://todoist.com/showTask?${q.toString()}`, '_blank', 'noopener');
      showToast?.('Opening Todoist with this spark...');
    } catch (err: any) {
      showToast?.(err.message);
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
            <X size={18} />
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

          {/* Action Engine Briefing Box */}
          <div className="briefing-box">
            <div className="briefing-section">
              <div className="briefing-heading heading-summary">
                <FileText size={13} />
                <span>Executive Summary ("What is this?")</span>
              </div>
              <textarea
                className="form-textarea"
                rows={2}
                value={executiveSummary}
                onChange={(e) => setExecutiveSummary(e.target.value)}
                placeholder="Core takeaway and summary..."
              />
            </div>

            <div className="briefing-section">
              <div className="briefing-heading heading-value">
                <Lightbulb size={13} />
                <span>Value Proposition ("Why does it matter?")</span>
              </div>
              <textarea
                className="form-textarea"
                rows={2}
                value={valueProposition}
                onChange={(e) => setValueProposition(e.target.value)}
                placeholder="Why is this valuable or useful..."
              />
            </div>

            <div className="briefing-section">
              <div className="briefing-heading heading-actions">
                <CheckCircle2 size={13} />
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
                      <Trash2 size={14} />
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
                  <Plus size={14} color="#34d399" />
                  <span>Add Step</span>
                </button>
              </div>
            </div>

            {research && (
              <details className="briefing-section">
                <summary className="briefing-heading heading-summary" style={{ cursor: 'pointer' }}>
                  <FileSearch size={13} />
                  <span>Research Findings</span>
                  <span style={{ textTransform: 'none', letterSpacing: 0, color: '#94a3b8' }}>
                    {research.status}
                    {research.query ? ` · ${research.query}` : ''}
                  </span>
                </summary>
                {research.error ? (
                  <p style={{ color: '#ff8a8a', fontSize: 13 }}>{research.error}</p>
                ) : (
                  <pre
                    style={{
                      margin: 0,
                      maxHeight: 220,
                      overflow: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontFamily: 'inherit',
                      fontSize: 12.5,
                      lineHeight: 1.5,
                      color: '#cbd5e1',
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      padding: 10,
                    }}
                  >
                    {research.findings}
                  </pre>
                )}
                <div>
                  <button type="button" className="btn-secondary" onClick={appendFindingsAsActions}>
                    <ListPlus size={14} color="#c084fc" />
                    <span>Append Findings as Actions</span>
                  </button>
                </div>
              </details>
            )}
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Status</label>
              <select
                className="form-select"
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
              >
                <option value="inbox">Inbox</option>
                <option value="doing">Doing</option>
                <option value="done">Done</option>
                <option value="shelved">Shelved</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </div>

            <div className="form-group">
              <label>Horizon</label>
              <select
                className="form-select"
                value={horizon}
                onChange={(e) => setHorizon(e.target.value as any)}
              >
                <option value="short-term">Short-term (Immediate action)</option>
                <option value="lifetime">Lifetime (Bucket list / vision)</option>
              </select>
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
                  <ExternalLink size={14} />
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
                <Sparkles size={14} color="#c084fc" />
                <span>Deep Research</span>
              </button>

              {isFailed && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => onRetry(card.id)}
                >
                  <RefreshCw size={14} color="#fbbf24" />
                  <span>Retry Extraction</span>
                </button>
              )}

              <button type="button" className="btn-secondary" onClick={handleCopyMarkdown}>
                <ClipboardCopy size={14} color="#34d399" />
                <span>Copy Markdown</span>
              </button>

              <button type="button" className="btn-secondary" onClick={handleAddToTodoist}>
                <CheckSquare size={14} color="#e879f9" />
                <span>Add to Todoist</span>
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                <Save size={14} />
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};