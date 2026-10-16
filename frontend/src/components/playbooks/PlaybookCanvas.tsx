import React from 'react';
import {
  AlertCircle,
  Layers,
  Plus,
  ArrowUp,
  ArrowDown,
  Globe,
  ChevronUp,
  ChevronDown,
  Trash2,
} from 'lucide-react';
import { Playbook, PlaybookStep, CustomStepConfig } from '../../types';
import { CORE_STEP_DESCRIPTIONS } from './constants';
import { StepEditorModal } from './StepEditorModal';
import { PlaybookHealthInspector } from './PlaybookHealthInspector';

export interface PlaybookCanvasProps {
  playbook: Playbook;
  onChangePlaybook: (updated: Playbook) => void;
  activeCardTypes: string[];
  isPlatformDefault: boolean;
  onPlatformDefaultChange: (checked: boolean) => void;
  validationErrors: string[];
  expandedSteps: Record<number, boolean>;
  onToggleExpandStep: (idx: number) => void;
  onSaveStepToLibrary: (step: PlaybookStep) => void;
  onOpenAddStepModal: () => void;
  showToast: (msg: string) => void;
}

export const PlaybookCanvas: React.FC<PlaybookCanvasProps> = ({
  playbook,
  onChangePlaybook,
  activeCardTypes,
  isPlatformDefault,
  onPlatformDefaultChange,
  validationErrors,
  expandedSteps,
  onToggleExpandStep,
  onSaveStepToLibrary,
  onOpenAddStepModal,
  showToast,
}) => {
  const moveStep = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= playbook.steps.length) return;
    const steps = [...playbook.steps];
    const [moved] = steps.splice(fromIdx, 1);
    steps.splice(toIdx, 0, moved);
    steps.forEach((s, i) => (s.position = i + 1));
    onChangePlaybook({ ...playbook, steps });
  };

  const toggleStepEnabled = (idx: number) => {
    const steps = [...playbook.steps];
    steps[idx] = { ...steps[idx], enabled: !steps[idx].enabled };
    onChangePlaybook({ ...playbook, steps });
  };

  const removeStep = (idx: number) => {
    const steps = playbook.steps.filter((_, i) => i !== idx);
    steps.forEach((s, i) => (s.position = i + 1));
    onChangePlaybook({ ...playbook, steps });
  };

  const updateStepConfig = (
    idx: number,
    patch: Partial<CustomStepConfig>,
    newName?: string
  ) => {
    const steps = [...playbook.steps];
    const step = { ...steps[idx] };
    if (newName !== undefined) step.name = newName;
    step.config = { ...(step.config || {}), ...patch };
    steps[idx] = step;
    onChangePlaybook({ ...playbook, steps });
  };

  return (
    <div className="pb-editor-container">
      {/* Top Form Fields */}
      <div className="pb-meta-grid">
        <div className="pb-form-field">
          <label htmlFor="pb-name-input">Playbook Name</label>
          <input
            id="pb-name-input"
            type="text"
            className="input-text"
            aria-label="Playbook Name"
            placeholder="e.g. Monetization & Feasibility Deep Dive"
            value={playbook.name}
            onChange={(e) => onChangePlaybook({ ...playbook, name: e.target.value })}
          />
        </div>
        <div className="pb-form-field">
          <label htmlFor="pb-desc-input">Description</label>
          <input
            id="pb-desc-input"
            type="text"
            className="input-text"
            aria-label="Description"
            placeholder="Brief summary of what this research pipeline focuses on"
            value={playbook.description}
            onChange={(e) => onChangePlaybook({ ...playbook, description: e.target.value })}
          />
        </div>
      </div>

      {/* Applicable Card Types */}
      <div className="pb-form-field" style={{ marginTop: 12 }}>
        <label>Applicable Card Types (Auto-select hints)</label>
        <div className="pb-card-types-chips">
          {activeCardTypes.map((type) => {
            const active = (playbook.card_types || []).includes(type);
            return (
              <button
                key={type}
                type="button"
                className={`pb-type-chip ${active ? 'active' : ''}`}
                aria-pressed={active}
                onClick={() => {
                  const cur = playbook.card_types || [];
                  const next = active ? cur.filter((t) => t !== type) : [...cur, type];
                  onChangePlaybook({ ...playbook, card_types: next });
                }}
              >
                <span>{type}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Platform Default Toggle & Badge */}
      <div className="pb-platform-default-row" style={{ marginTop: 12 }}>
        <label className="pb-platform-default-label">
          <input
            type="checkbox"
            aria-label="Set as Platform Default"
            checked={isPlatformDefault}
            onChange={(e) => onPlatformDefaultChange(e.target.checked)}
          />
          <span>Set as Platform Default</span>
        </label>
        {isPlatformDefault && (
          <span className="pb-platform-default-badge">★ Platform Default</span>
        )}
      </div>

      {/* DUAL-PANE BUILDER CANVAS */}
      <div className="pb-builder-dual-pane">
        {/* LEFT PANE: Pipeline Sequencer */}
        <div className="pb-sequencer-pane">
          {/* Validation Warnings */}
          {validationErrors.length > 0 && (
            <div className="pb-validation-box">
              <div className="pb-validation-title">
                <AlertCircle size={15} />
                <span>Validation Checklist ({validationErrors.length})</span>
              </div>
              <ul className="pb-validation-list">
                {validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Steps List Header */}
          <div className="pb-steps-header">
            <div className="pb-steps-title">
              <Layers size={16} />
              <span>Pipeline Steps ({playbook.steps.length} / 12)</span>
            </div>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={onOpenAddStepModal}
              disabled={playbook.steps.length >= 12}
            >
              <Plus size={13} />
              <span>Add Step</span>
            </button>
          </div>

          <div className="pb-steps-list">
            {playbook.steps.map((step, idx) => {
              const isCustom = step.kind === 'custom';
              const isExpanded = !!expandedSteps[idx];

              return (
                <div key={idx} className={`pb-step-row ${!step.enabled ? 'disabled' : ''}`}>
                  <div className="pb-step-main">
                    {/* Position & Reorder */}
                    <div className="pb-step-reorder">
                      <button
                        type="button"
                        className="btn-icon"
                        disabled={idx === 0}
                        onClick={() => moveStep(idx, idx - 1)}
                        title="Move Up"
                        aria-label={`Move ${step.name} up`}
                      >
                        <ArrowUp size={12} />
                      </button>
                      <span className="pb-step-pos">{idx + 1}</span>
                      <button
                        type="button"
                        className="btn-icon"
                        disabled={idx === playbook.steps.length - 1}
                        onClick={() => moveStep(idx, idx + 1)}
                        title="Move Down"
                        aria-label={`Move ${step.name} down`}
                      >
                        <ArrowDown size={12} />
                      </button>
                    </div>

                    {/* Enable toggle */}
                    <label className="pb-toggle" title="Toggle step enabled">
                      <input
                        type="checkbox"
                        checked={step.enabled}
                        onChange={() => toggleStepEnabled(idx)}
                      />
                      <span className="pb-slider" />
                    </label>

                    {/* Step Title & Kind */}
                    <div className="pb-step-info">
                      <div className="pb-step-line">
                        <strong className="pb-step-name">{step.name}</strong>
                        <span className={`pb-kind-badge ${step.kind}`}>{step.kind}</span>
                        {isCustom && step.config?.tool_policy === 'search' && (
                          <span className="pb-tool-badge" title="Web search enabled">
                            <Globe size={11} />
                            Search
                          </span>
                        )}
                      </div>
                      <p className="pb-step-desc">
                        {step.config?.instruction
                          ? step.config.instruction.slice(0, 90) +
                            (step.config.instruction.length > 90 ? '…' : '')
                          : CORE_STEP_DESCRIPTIONS[step.kind] || ''}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="pb-step-actions">
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={() => onToggleExpandStep(idx)}
                        title={isExpanded ? 'Collapse config' : 'Edit config'}
                        aria-label={
                          isExpanded
                            ? `Collapse ${step.name} config`
                            : `Edit ${step.name} config`
                        }
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      <button
                        type="button"
                        className="btn-icon btn-danger"
                        onClick={() => removeStep(idx)}
                        title="Delete step"
                        aria-label={`Delete ${step.name}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Step Configuration Drawer */}
                  {isExpanded && (
                    <StepEditorModal
                      step={step}
                      onUpdateConfig={(patch, newName) =>
                        updateStepConfig(idx, patch, newName)
                      }
                      onSaveToLibrary={onSaveStepToLibrary}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT PANE: Persistent Research Health Inspector Dock */}
        <PlaybookHealthInspector
          steps={playbook.steps}
          onUpdateSteps={(nextSteps) =>
            onChangePlaybook({ ...playbook, steps: nextSteps })
          }
          showToast={showToast}
        />
      </div>
    </div>
  );
};
