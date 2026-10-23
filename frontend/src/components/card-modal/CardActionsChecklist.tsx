import React, { useState } from 'react';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { useLocale } from '../../i18n';

export interface CardActionsChecklistProps {
  title?: string;
  actions: string[];
  completedActions: Record<number, boolean>;
  onToggleAction: (index: number) => void;
  onEditAction: (index: number, text: string) => void;
  onRemoveAction: (index: number) => void;
  onAddAction: (text: string) => void;
}

export const CardActionsChecklist: React.FC<CardActionsChecklistProps> = ({
  title,
  actions,
  completedActions,
  onToggleAction,
  onEditAction,
  onRemoveAction,
  onAddAction,
}) => {
  const [newAction, setNewAction] = useState('');
  const { t } = useLocale();

  const completedCount = actions.filter((_, idx) => completedActions[idx]).length;
  const totalActions = actions.length;
  const progressPercent = totalActions > 0 ? Math.round((completedCount / totalActions) * 100) : 0;

  const handleAdd = () => {
    const text = newAction.trim();
    if (!text) return;
    onAddAction(text);
    setNewAction('');
  };

  return (
    <div className="briefing-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div className="briefing-heading heading-actions" style={{ margin: 0 }}>
          <CheckCircle2 size={13} strokeWidth={1.5} />
          <span>{title ?? t('cards.checklist.title')}</span>
        </div>
        <span style={{ fontSize: 11.5, color: '#34d399', fontWeight: 600 }}>
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
        <div className="card-progress-bar-track" style={{ height: 6, marginBottom: 12 }}>
          <div className="card-progress-bar-fill" style={{ width: `${Math.max(5, progressPercent)}%` }} />
        </div>
      )}

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
              onChange={() => onToggleAction(idx)}
              style={{ cursor: 'pointer' }}
            />
            <input
              type="text"
              className="form-input"
              value={act}
              onChange={(e) => onEditAction(idx, e.target.value)}
              style={{
                flex: 1,
                padding: '3px 8px',
                background: 'transparent',
                border: '1px solid transparent',
                fontSize: 13,
                color: completedActions[idx] ? 'var(--text-muted)' : 'var(--text-main)',
                textDecoration: completedActions[idx] ? 'line-through' : 'none',
              }}
            />
            <button
              type="button"
              className="close-btn"
              onClick={() => onRemoveAction(idx)}
              title={t('cards.checklist.remove')}
            >
              <Trash2 size={12} strokeWidth={1.5} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <input
          type="text"
          className="form-input"
          value={newAction}
          placeholder={t('cards.checklist.placeholder')}
          onChange={(e) => setNewAction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <button type="button" className="btn-secondary" onClick={handleAdd}>
          <Plus size={13} color="#34d399" />
          <span>{t('cards.checklist.add')}</span>
        </button>
      </div>
    </div>
  );
};
