import React from 'react';
import { useLocale } from '../../i18n';

export interface LifecycleStep {
  id: string;
  label: string;
}

export interface CardLifecycleStepperProps {
  status: string;
  onStatusChange: (status: string) => void;
  steps?: LifecycleStep[];
}

export const CardLifecycleStepper: React.FC<CardLifecycleStepperProps> = ({
  status,
  onStatusChange,
  steps: providedSteps,
}) => {
  const { t } = useLocale();
  const steps: LifecycleStep[] = providedSteps ?? [
    { id: 'inbox', label: t('cards.status.inbox') },
    { id: 'review', label: t('cards.status.review') },
    { id: 'to-do', label: t('cards.status.toDo') },
    { id: 'in-progress', label: t('cards.status.inProgress') },
    { id: 'done', label: t('cards.status.done') },
  ];
  return (
    <div className="drawer-stepper">
      {steps.map((step, idx) => {
        const isActive = status === step.id;
        return (
          <React.Fragment key={step.id}>
            <button
              type="button"
              className={`drawer-stepper-step ${isActive ? 'active' : ''}`}
              onClick={() => onStatusChange(step.id)}
              title={t('cards.lifecycle.moveTitle', { step: step.label })}
            >
              <span>{step.label}</span>
            </button>
            {idx < steps.length - 1 && (
              <span className="drawer-stepper-arrow">→</span>
            )}
          </React.Fragment>
        );
      })}

      {/* Side Status Indicator if Shelved or Dismissed */}
      {(status === 'shelved' || status === 'dismissed') && (
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            textTransform: 'uppercase',
            padding: '2px 7px',
            borderRadius: 4,
            background:
              status === 'shelved'
                ? 'var(--color-warning-bg)'
                : 'var(--color-error-bg)',
            border:
              status === 'shelved'
                ? '1px solid var(--color-warning-border)'
                : '1px solid var(--color-error-border)',
            color: status === 'shelved' ? 'var(--color-warning-text)' : 'var(--color-error-text)',
            marginLeft: 6,
          }}
        >
          {status === 'shelved' ? t('cards.status.shelved') : t('cards.status.dismissed')}
        </span>
      )}
    </div>
  );
};
