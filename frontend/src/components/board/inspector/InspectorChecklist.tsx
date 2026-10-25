import React, { useState } from 'react';
import { Card } from '../../../types';
import { useLocale } from '../../../i18n';
import { CheckCircle2, Trash2, Plus } from 'lucide-react';

export interface InspectorChecklistProps {
  card: Card;
  onToggleStep: (stepText: string) => void;
  onAddStep: (stepText: string) => void;
  onRemoveStep: (index: number) => void;
}

export const InspectorChecklist: React.FC<InspectorChecklistProps> = ({
  card,
  onToggleStep,
  onAddStep,
  onRemoveStep,
}) => {
  const { t } = useLocale();
  const [newActionText, setNewActionText] = useState('');

  const proposedActions = card.proposed_actions || [];
  const completedActions = card.completed_actions || [];
  const completedSet = new Set(completedActions);
  const totalActions = proposedActions.length;
  const completedCount = proposedActions.filter((s) => completedSet.has(s)).length;
  const progressPercent = totalActions > 0 ? Math.round((completedCount / totalActions) * 100) : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = newActionText.trim();
    if (!text) return;
    onAddStep(text);
    setNewActionText('');
  };

  return (
    <div className="board-inspector-section inspector-checklist-section">
      <div className="inspector-section-header">
        <div className="inspector-section-title">
          <CheckCircle2 size={14} className="text-emerald" />
          <span>{t('cards.checklist.title')}</span>
        </div>
        <span className="inspector-checklist-count">
          {totalActions > 0
            ? t('cards.checklist.progress', {
                completed: completedCount,
                total: totalActions,
                percent: progressPercent,
              })
            : t('cards.checklist.noSteps')}
        </span>
      </div>

      {totalActions > 0 && (
        <div className="card-progress-bar-track inspector-progress-track">
          <div
            className="card-progress-bar-fill"
            style={{ width: `${Math.max(5, progressPercent)}%` }}
          />
        </div>
      )}

      {/* Checklist item rows */}
      <div className="inspector-checklist-list">
        {proposedActions.map((step, idx) => {
          const isChecked = completedSet.has(step);
          return (
            <div key={idx} className={`inspector-checklist-item ${isChecked ? 'completed' : ''}`}>
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => onToggleStep(step)}
                className="inspector-checklist-checkbox"
                id={`inspector-step-${card.id}-${idx}`}
              />
              <label
                htmlFor={`inspector-step-${card.id}-${idx}`}
                className="inspector-checklist-label"
              >
                {step}
              </label>
              <button
                type="button"
                className="inspector-step-remove-btn"
                onClick={() => onRemoveStep(idx)}
                title={t('cards.checklist.remove')}
                aria-label={t('cards.checklist.remove')}
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add Step input */}
      <form onSubmit={handleSubmit} className="inspector-checklist-add-form">
        <input
          type="text"
          className="form-input inspector-step-input"
          value={newActionText}
          onChange={(e) => setNewActionText(e.target.value)}
          placeholder={t('cards.checklist.placeholder')}
        />
        <button
          type="submit"
          className="btn-secondary inspector-step-add-btn"
          disabled={!newActionText.trim()}
        >
          <Plus size={14} />
          <span>{t('cards.checklist.add')}</span>
        </button>
      </form>
    </div>
  );
};
