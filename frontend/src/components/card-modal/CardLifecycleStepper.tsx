import React from 'react';

export interface LifecycleStep {
  id: string;
  label: string;
}

const LIFECYCLE_STEPS: LifecycleStep[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'review', label: 'Review' },
  { id: 'to-do', label: 'To Do' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
];

export interface CardLifecycleStepperProps {
  status: string;
  onStatusChange: (status: string) => void;
  steps?: LifecycleStep[];
}

export const CardLifecycleStepper: React.FC<CardLifecycleStepperProps> = ({
  status,
  onStatusChange,
  steps = LIFECYCLE_STEPS,
}) => {
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
              title={`Move card to ${step.label}`}
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
          {status}
        </span>
      )}
    </div>
  );
};
