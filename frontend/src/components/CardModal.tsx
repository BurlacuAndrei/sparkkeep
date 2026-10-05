import React, { useState } from 'react';
import { Card } from '../types';
import { X, Sparkles, ExternalLink, RefreshCw, Save, FileText, Lightbulb, CheckCircle2 } from 'lucide-react';

interface CardModalProps {
  card: Card | null;
  onClose: () => void;
  onUpdate: (id: number, patch: Partial<Card>) => void;
  onResearch: (id: number) => void;
  onRetry: (id: number) => void;
}

export const CardModal: React.FC<CardModalProps> = ({
  card,
  onClose,
  onUpdate,
  onResearch,
  onRetry,
}) => {
  const [title, setTitle] = useState(card?.title || '');
  const [_summary, _setSummary] = useState(card?.summary || '');
  const [executiveSummary, setExecutiveSummary] = useState(card?.executive_summary || '');
  const [valueProposition, setValueProposition] = useState(card?.value_proposition || '');
  const [horizon, setHorizon] = useState(card?.horizon || 'short-term');
  const [status, setStatus] = useState(card?.status || 'inbox');
  const [note, setNote] = useState(card?.source_note || '');
  const [tagsInput, setTagsInput] = useState((card?.tags || []).join(', '));
  const [_actions, _setActions] = useState<string[]>(card?.proposed_actions || []);
  const [completedActions, setCompletedActions] = useState<Record<number, boolean>>({});

  if (!card) return null;

  const toggleAction = (index: number) => {
    setCompletedActions((prev) => ({ ...prev, [index]: !prev[index] }));
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
      proposed_actions: _actions,
    });
    onClose();
  };

  const isFailed = card.title === 'Analysis failed';

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

            {_actions.length > 0 && (
              <div className="briefing-section">
                <div className="briefing-heading heading-actions">
                  <CheckCircle2 size={13} />
                  <span>Proposed Actions Checklist</span>
                </div>
                <div className="actions-list">
                  {_actions.map((act, idx) => (
                    <div
                      key={idx}
                      className="action-item"
                      style={{ cursor: 'pointer', opacity: completedActions[idx] ? 0.6 : 1 }}
                      onClick={() => toggleAction(idx)}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(completedActions[idx])}
                        onChange={() => toggleAction(idx)}
                        style={{ cursor: 'pointer', marginTop: 3 }}
                      />
                      <span style={{ textDecoration: completedActions[idx] ? 'line-through' : 'none' }}>
                        {act}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
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