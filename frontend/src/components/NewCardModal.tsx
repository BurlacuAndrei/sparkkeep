import React, { useState } from 'react';
import { Card } from '../types';
import { X, Plus, FileText, Lightbulb, CheckCircle2 } from 'lucide-react';
import { CustomSelect } from './CustomSelect';
import { CARD_HORIZON_OPTIONS, CARD_STATUS_OPTIONS } from './selectOptions';

interface NewCardModalProps {
  onClose: () => void;
  onCreate: (card: Partial<Card>) => void;
}

export const NewCardModal: React.FC<NewCardModalProps> = ({ onClose, onCreate }) => {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [executiveSummary, setExecutiveSummary] = useState('');
  const [valueProposition, setValueProposition] = useState('');
  const [proposedActionsText, setProposedActionsText] = useState('');
  const [horizon, setHorizon] = useState<'short-term' | 'medium-term' | 'long-term' | 'lifetime'>('short-term');
  const [status, setStatus] = useState('inbox');
  const [sourceURL, setSourceURL] = useState('');
  const [sourceNote, setSourceNote] = useState('');
  const [tags, setTags] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const actionList = proposedActionsText
      .split('\n')
      .map((a) => a.trim())
      .filter(Boolean);

    onCreate({
      title: title.trim(),
      summary: summary.trim(),
      executive_summary: executiveSummary.trim() || summary.trim(),
      value_proposition: valueProposition.trim(),
      proposed_actions: actionList,
      horizon,
      status: status as any,
      source_url: sourceURL.trim(),
      source_note: sourceNote.trim(),
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plus size={18} strokeWidth={1.5} color="#818cf8" />
            <span>Create New Spark / Card</span>
          </h2>
          <button type="button" className="close-btn" onClick={onClose} id="cancel-new">
            <X size={17} strokeWidth={1.5} />
          </button>
        </div>

        <form id="new-card-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label>Title *</label>
            <input
              name="title"
              className="form-input"
              placeholder="Headline or name of idea/tool"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Summary</label>
            <textarea
              name="summary"
              className="form-textarea"
              placeholder="Short takeaway..."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>

          <div className="briefing-box" style={{ padding: 14 }}>
            <div className="briefing-section">
              <div className="briefing-heading heading-summary">
                <FileText size={12} strokeWidth={1.5} />
                <span>Executive Summary</span>
              </div>
              <input
                className="form-input"
                placeholder="What is this? (optional, defaults to summary)"
                value={executiveSummary}
                onChange={(e) => setExecutiveSummary(e.target.value)}
              />
            </div>

            <div className="briefing-section">
              <div className="briefing-heading heading-value">
                <Lightbulb size={12} strokeWidth={1.5} />
                <span>Value Proposition</span>
              </div>
              <input
                className="form-input"
                placeholder="Why is it useful or important?"
                value={valueProposition}
                onChange={(e) => setValueProposition(e.target.value)}
              />
            </div>

            <div className="briefing-section">
              <div className="briefing-heading heading-actions">
                <CheckCircle2 size={12} strokeWidth={1.5} />
                <span>Proposed Actions (1 per line)</span>
              </div>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="Step 1&#10;Step 2"
                value={proposedActionsText}
                onChange={(e) => setProposedActionsText(e.target.value)}
              />
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="new-card-horizon">Horizon</label>
              <CustomSelect
                id="new-card-horizon"
                name="horizon"
                value={horizon}
                onChange={(val) => setHorizon(val)}
                options={CARD_HORIZON_OPTIONS}
                ariaLabel="Card horizon"
              />
            </div>

            <div className="form-group">
              <label htmlFor="new-card-status">Status</label>
              <CustomSelect
                id="new-card-status"
                name="status"
                value={status}
                onChange={(val) => setStatus(val)}
                options={CARD_STATUS_OPTIONS}
                ariaLabel="Card status"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Source URL</label>
            <input
              name="source_url"
              className="form-input"
              placeholder="https://..."
              value={sourceURL}
              onChange={(e) => setSourceURL(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Source Note</label>
            <input
              name="source_note"
              className="form-input"
              placeholder="Caption, notes or reference"
              value={sourceNote}
              onChange={(e) => setSourceNote(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Tags</label>
            <input
              name="tags"
              className="form-input"
              placeholder="comma, separated, tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              <Plus size={15} />
              <span>Save Card</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};