import React, { useState } from 'react';
import {
  AlertCircle,
  Layers,
  Plus,
  ArrowUp,
  ArrowDown,
  ChevronUp,
  ChevronDown,
  Trash2,
  Eye,
  ShieldCheck,
} from 'lucide-react';
import { Card, Playbook, PlaybookStep, CustomStepConfig, StepLibraryTemplate } from '../../types';
import { CORE_STEP_DESCRIPTIONS, STEP_STAGE_LABELS, UserSavedStepTemplate } from './constants';
import { StepEditorModal } from './StepEditorModal';
import { PlaybookHealthInspector } from './PlaybookHealthInspector';
import { QuickAddPalette } from './QuickAddPalette';
import { DryRunInspector } from './DryRunInspector';

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
  libraryTemplates?: StepLibraryTemplate[];
  userStepTemplates?: UserSavedStepTemplate[];
  cards?: Card[];
  inspectorTab?: 'health' | 'dryrun';
  onInspectorTabChange?: (tab: 'health' | 'dryrun') => void;
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
  libraryTemplates = [],
  userStepTemplates = [],
  cards = [],
  inspectorTab,
  onInspectorTabChange,
}) => {
  const [internalTab, setInternalTab] = useState<'health' | 'dryrun'>('health');
  const activeTab = inspectorTab !== undefined ? inspectorTab : internalTab;
  const setTab = onInspectorTabChange || setInternalTab;
  const [activeInsertIndex, setActiveInsertIndex] = useState<number | null>(null);

  const insertStepAtIndex = (insertIdx: number, newStep: PlaybookStep) => {
    if (playbook.steps.length >= 12) {
      showToast('Maximum 12 steps allowed per playbook');
      return;
    }
    const steps = [...playbook.steps];
    steps.splice(insertIdx, 0, newStep);
    steps.forEach((s, i) => (s.position = i + 1));
    onChangePlaybook({ ...playbook, steps });
    setActiveInsertIndex(null);
    onToggleExpandStep(insertIdx);
    showToast(`Inserted step "${newStep.name}" at position ${insertIdx + 1}`);
  };

  const handleAddBlankAt = (insertIdx: number, customName?: string) => {
    const stepName = customName || 'Custom Analysis';
    insertStepAtIndex(insertIdx, {
      position: insertIdx + 1,
      kind: 'custom',
      name: stepName,
      enabled: true,
      config: {
        output_heading: stepName,
        instruction: 'Analyze the card context and extracted sources.',
        tool_policy: 'none',
        role: 'research_synthesis',
        inputs: ['capture', 'sources', 'previous_steps'],
        max_queries: 2,
      },
    });
  };

  const handleAddTemplateAt = (
    insertIdx: number,
    tpl: StepLibraryTemplate | UserSavedStepTemplate
  ) => {
    insertStepAtIndex(insertIdx, {
      position: insertIdx + 1,
      kind: 'custom',
      name: tpl.name,
      enabled: true,
      config: {
        output_heading: tpl.heading,
        instruction: tpl.instruction,
        tool_policy: tpl.tool_policy,
        role: tpl.role,
        inputs:
          'inputs' in tpl && tpl.inputs ? tpl.inputs : ['capture', 'sources', 'previous_steps'],
        max_queries: tpl.max_queries || 2,
      },
    });
  };
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

          <div className="pb-steps-list pb-timeline-list" data-testid="pipeline-timeline">
            {/* Top In-Line Inserter (Position 0 / Step 1) */}
            <div className="pb-inline-inserter-row">
              <div className="pb-inline-inserter-line" aria-hidden="true" />
              <button
                type="button"
                className="pb-inline-inserter-btn"
                data-testid="inline-step-inserter-0"
                onClick={() => setActiveInsertIndex(activeInsertIndex === 0 ? null : 0)}
                title="Insert step at position 1"
                aria-label="Insert step at position 1"
              >
                <Plus size={11} />
                <span>Insert Step</span>
              </button>
              {activeInsertIndex === 0 && (
                <QuickAddPalette
                  insertIndex={0}
                  totalSteps={playbook.steps.length}
                  onClose={() => setActiveInsertIndex(null)}
                  onAddBlank={(name) => handleAddBlankAt(0, name)}
                  onAddTemplate={(tpl) => handleAddTemplateAt(0, tpl)}
                  libraryTemplates={libraryTemplates}
                  userStepTemplates={userStepTemplates}
                />
              )}
            </div>

            {playbook.steps.map((step, idx) => {
              const isExpanded = !!expandedSteps[idx];
              const stageLabel = STEP_STAGE_LABELS[step.kind] || 'Synthesis';
              const effectiveToolPolicy =
                step.config?.tool_policy || (step.kind === 'search' ? 'search' : 'none');
              const maxQueries = step.config?.max_queries ?? 2;

              return (
                <React.Fragment key={idx}>
                  <div className="pb-timeline-item">
                    {/* Left Timeline Node & Connector Rail */}
                    <div className="pb-timeline-track">
                      <div
                        className={`pb-timeline-node ${!step.enabled ? 'disabled' : ''} ${
                          isExpanded ? 'active' : ''
                        }`}
                      >
                        <span className="pb-step-pos">{idx + 1}</span>
                      </div>
                      {idx < playbook.steps.length - 1 && (
                        <div className="pb-timeline-rail" aria-hidden="true" />
                      )}
                    </div>

                    {/* Right Timeline Step Card */}
                    <div
                      className={`pb-step-row pb-timeline-card ${!step.enabled ? 'disabled' : ''} ${
                        isExpanded ? 'expanded' : ''
                      }`}
                    >
                      <div
                        className="pb-step-main"
                        onClick={() => onToggleExpandStep(idx)}
                        style={{ cursor: 'pointer' }}
                      >
                        {/* Reorder Controls */}
                        <div
                          className="pb-step-reorder"
                          onClick={(e) => e.stopPropagation()}
                        >
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
                        <label
                          className="pb-toggle"
                          title="Toggle step enabled"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={step.enabled}
                            onChange={() => toggleStepEnabled(idx)}
                          />
                          <span className="pb-slider" />
                        </label>

                        {/* Step Title, Stage Badge & Tool Policy Chip */}
                        <div className="pb-step-info">
                          <div className="pb-step-line">
                            <strong className="pb-step-name">{step.name}</strong>
                            <span
                              className={`pb-stage-badge stage-${stageLabel.toLowerCase()}`}
                              data-testid={`step-stage-badge-${idx}`}
                            >
                              {stageLabel}
                            </span>
                            <span className={`pb-kind-badge ${step.kind}`}>{step.kind}</span>
                            {effectiveToolPolicy === 'search' ? (
                              <span
                                className="pb-tool-badge pb-tool-chip search"
                                data-testid={`step-tool-chip-${idx}`}
                                title="Web search enabled"
                              >
                                🔍 Web Search ({maxQueries}{' '}
                                {maxQueries === 1 ? 'query' : 'queries'})
                              </span>
                            ) : (
                              <span
                                className="pb-tool-badge pb-tool-chip reasoning"
                                data-testid={`step-tool-chip-${idx}`}
                                title="Source reasoning over existing context"
                              >
                                🧠 Source Reasoning
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
                        <div
                          className="pb-step-actions"
                          onClick={(e) => e.stopPropagation()}
                        >
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

                      {/* In-Place Focused Step Configuration Editor */}
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
                  </div>

                  {/* Subsequent In-Line Inserter (after step idx) */}
                  <div className="pb-inline-inserter-row">
                    <div className="pb-inline-inserter-line" aria-hidden="true" />
                    <button
                      type="button"
                      className="pb-inline-inserter-btn"
                      data-testid={`inline-step-inserter-${idx + 1}`}
                      onClick={() =>
                        setActiveInsertIndex(
                          activeInsertIndex === idx + 1 ? null : idx + 1
                        )
                      }
                      title={`Insert step at position ${idx + 2}`}
                      aria-label={`Insert step at position ${idx + 2}`}
                    >
                      <Plus size={11} />
                      <span>Insert Step</span>
                    </button>
                    {activeInsertIndex === idx + 1 && (
                      <QuickAddPalette
                        insertIndex={idx + 1}
                        totalSteps={playbook.steps.length}
                        onClose={() => setActiveInsertIndex(null)}
                        onAddBlank={(name) => handleAddBlankAt(idx + 1, name)}
                        onAddTemplate={(tpl) => handleAddTemplateAt(idx + 1, tpl)}
                        libraryTemplates={libraryTemplates}
                        userStepTemplates={userStepTemplates}
                      />
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* RIGHT PANE: Dual Inspector Dock (Health Inspector & Dry-Run Inspector) */}
        <div className="pb-inspector-dock" data-testid="pb-inspector-dock">
          <div className="pb-inspector-tabs-header" role="tablist" aria-label="Inspector Tabs">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'health'}
              className={`pb-inspector-tab-btn ${activeTab === 'health' ? 'active' : ''}`}
              onClick={() => setTab('health')}
            >
              <ShieldCheck size={14} />
              <span>Health Inspector</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'dryrun'}
              className={`pb-inspector-tab-btn ${activeTab === 'dryrun' ? 'active' : ''}`}
              onClick={() => setTab('dryrun')}
              aria-label="Dry-Run Inspector"
            >
              <Eye size={14} />
              <span>Dry-Run Inspector</span>
            </button>
          </div>

          {activeTab === 'health' ? (
            <PlaybookHealthInspector
              steps={playbook.steps}
              onUpdateSteps={(nextSteps) =>
                onChangePlaybook({ ...playbook, steps: nextSteps })
              }
              showToast={showToast}
            />
          ) : (
            <DryRunInspector steps={playbook.steps} cards={cards} />
          )}
        </div>
      </div>
    </div>
  );
};
