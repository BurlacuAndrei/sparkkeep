import React from 'react';
import { Sparkles, Plus, Trash2, X, Copy, AlertCircle } from 'lucide-react';
import { Playbook, PlaybookStep, CustomStepConfig, StepLibraryTemplate } from '../../types';
import {
  INPUT_BINDING_OPTIONS,
  getDefaultInputsForStep,
  STEP_PROMPT_STARTERS,
  DEFAULT_PROMPT_STARTERS,
  PLAYBOOK_TEMPLATES,
  PlaybookTemplate,
  PlaybookRecipe,
  TemplateDomain,
  TEMPLATE_DOMAINS,
  UserSavedStepTemplate,
} from './constants';

export interface StepEditorModalProps {
  step: PlaybookStep;
  onUpdateConfig: (patch: Partial<CustomStepConfig>, newName?: string) => void;
  onSaveToLibrary: (step: PlaybookStep) => void;
}

export const StepEditorModal: React.FC<StepEditorModalProps> = ({
  step,
  onUpdateConfig,
  onSaveToLibrary,
}) => {
  const charCount = (step.config?.instruction || '').length;

  return (
    <div className="pb-custom-config-drawer pb-inplace-editor">
      <div className="pb-cfg-row">
        <div className="pb-form-field">
          <label>Step Display Name</label>
          <input
            type="text"
            className="input-text"
            aria-label="Step Display Name"
            value={step.name}
            onChange={(e) => onUpdateConfig({}, e.target.value)}
          />
        </div>
        <div className="pb-form-field">
          <label>Report Section Heading</label>
          <input
            type="text"
            className="input-text"
            aria-label="Report Section Heading"
            placeholder={
              step.kind === 'custom' ? 'e.g. Monetization Angle' : step.name || 'Section Heading'
            }
            value={step.config?.output_heading || ''}
            onChange={(e) => onUpdateConfig({ output_heading: e.target.value })}
          />
        </div>
      </div>

      <div className="pb-form-field" style={{ marginTop: 10 }}>
        <div className="pb-label-with-count">
          <label>Instruction / Prompt</label>
          <span
            className={`pb-char-counter ${charCount > 8000 ? 'overflow' : ''}`}
            data-testid="step-char-counter"
          >
            {charCount} / 8,000
          </span>
        </div>

        {/* Quick Prompt Starters */}
        <div className="pb-prompt-starters-row">
          <span className="pb-prompt-starters-label">Prompt Starters:</span>
          {(STEP_PROMPT_STARTERS[step.kind] || DEFAULT_PROMPT_STARTERS).map((snip) => (
            <button
              key={snip.label}
              type="button"
              className="btn-secondary pb-prompt-starter-pill"
              onClick={() => {
                const current = step.config?.instruction || '';
                const next = current ? `${current}\n\n${snip.text}` : snip.text;
                onUpdateConfig({ instruction: next.slice(0, 8000) });
              }}
            >
              + {snip.label}
            </button>
          ))}
        </div>

        <textarea
          className="input-textarea"
          rows={3}
          aria-label="Instruction / Prompt"
          placeholder="Prompt instructions for this step…"
          value={step.config?.instruction || ''}
          onChange={(e) => onUpdateConfig({ instruction: e.target.value })}
        />
      </div>

      {/* Tool Policy, Max Queries, LLM Role */}
      <div className="pb-cfg-row" style={{ marginTop: 10 }}>
        <div className="pb-form-field">
          <label htmlFor="step-tool-policy-select">Tool Policy</label>
          <select
            id="step-tool-policy-select"
            className="input-select"
            aria-label="Tool Policy"
            value={step.config?.tool_policy || (step.kind === 'search' ? 'search' : 'none')}
            onChange={(e) =>
              onUpdateConfig({
                tool_policy: e.target.value as 'none' | 'search',
              })
            }
          >
            <option value="none">None (Reason over existing sources only)</option>
            <option value="search">Search (Execute live web queries)</option>
          </select>
        </div>

        {(step.config?.tool_policy === 'search' ||
          (!step.config?.tool_policy && step.kind === 'search')) && (
          <div className="pb-form-field">
            <label htmlFor="step-max-queries-input">Max Search Queries (1–5)</label>
            <input
              id="step-max-queries-input"
              type="number"
              className="input-text"
              aria-label="Max Search Queries"
              min={1}
              max={5}
              value={step.config?.max_queries ?? 2}
              onChange={(e) =>
                onUpdateConfig({
                  max_queries: Math.min(5, Math.max(1, parseInt(e.target.value, 10) || 1)),
                })
              }
            />
          </div>
        )}

        <div className="pb-form-field">
          <label htmlFor="step-llm-role-select">LLM Role</label>
          <select
            id="step-llm-role-select"
            className="input-select"
            aria-label="LLM Role"
            value={
              step.config?.role ||
              (step.kind === 'plan' ? 'research_plan' : 'research_synthesis')
            }
            onChange={(e) =>
              onUpdateConfig({
                role: e.target.value as 'research_plan' | 'research_synthesis',
              })
            }
          >
            <option value="research_synthesis">Synthesis & Reasoning (Strong model)</option>
            <option value="research_plan">Planning & Fast (Cheaper model)</option>
          </select>
        </div>
      </div>

      {/* Input Bindings Chips */}
      <div className="pb-form-field" style={{ marginTop: 10 }}>
        <label>Input Bindings</label>
        <div className="pb-input-bindings">
          {INPUT_BINDING_OPTIONS.map(({ key, label }) => {
            const activeInputs = getDefaultInputsForStep(step);
            const checked = activeInputs.includes(key);
            return (
              <label
                key={key}
                className={`pb-binding-checkbox pb-binding-chip ${checked ? 'active' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  aria-label={`Input binding ${key}`}
                  onChange={() => {
                    const next = checked
                      ? activeInputs.filter((k) => k !== key)
                      : [...activeInputs, key];
                    onUpdateConfig({ inputs: next });
                  }}
                />
                <span>{label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Drawer Footer: Save Step to Library */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: 12,
          paddingTop: 10,
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => onSaveToLibrary(step)}
          title="Save this step configuration to your custom template library"
        >
          <Sparkles size={13} />
          <span>Save to Library</span>
        </button>
      </div>
    </div>
  );
};

export interface AddStepModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'library' | 'blank';
  onTabChange: (tab: 'library' | 'blank') => void;
  libraryTemplates: StepLibraryTemplate[];
  userStepTemplates: UserSavedStepTemplate[];
  onDeleteUserTemplate: (id: string, name: string) => void;
  onAddLibraryStep: (tpl: StepLibraryTemplate | UserSavedStepTemplate) => void;
  onAddBlankStep: () => void;
}

export const AddStepModal: React.FC<AddStepModalProps> = ({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  libraryTemplates,
  userStepTemplates,
  onDeleteUserTemplate,
  onAddLibraryStep,
  onAddBlankStep,
}) => {
  if (!isOpen) return null;

  return (
    <div className="pb-modal-backdrop" onClick={onClose}>
      <div className="pb-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="pb-modal-header">
          <div>
            <h4 className="pb-modal-title">Add Step to Playbook</h4>
            <p className="pb-modal-subtitle">
              Pick a ready-made step from our tuned library or craft a custom blank step.
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="pb-modal-tabs">
          <button
            type="button"
            className={`pb-modal-tab ${activeTab === 'library' ? 'active' : ''}`}
            onClick={() => onTabChange('library')}
          >
            <Sparkles size={13} />
            <span>Step Library ({libraryTemplates.length + userStepTemplates.length})</span>
          </button>
          <button
            type="button"
            className={`pb-modal-tab ${activeTab === 'blank' ? 'active' : ''}`}
            onClick={() => onTabChange('blank')}
          >
            <Plus size={13} />
            <span>Blank Custom Step</span>
          </button>
        </div>

        <div className="pb-modal-body">
          {activeTab === 'library' ? (
            <div>
              {userStepTemplates.length > 0 && (
                <div className="pb-user-templates-section" style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        className="pb-card-badge custom"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <Sparkles size={11} />
                        <span>Custom Templates</span>
                      </span>
                      <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                        ({userStepTemplates.length})
                      </span>
                    </div>
                  </div>

                  <div className="pb-library-grid">
                    {userStepTemplates.map((tpl) => (
                      <div key={tpl.id} className="pb-lib-item custom-template">
                        <div className="pb-lib-top">
                          <span className="pb-lib-icon">✨</span>
                          <div className="pb-lib-title-box">
                            <h5 className="pb-lib-name">{tpl.name}</h5>
                            <span className="pb-lib-policy">
                              {tpl.tool_policy === 'search'
                                ? '🔍 Live Web Search'
                                : '🧠 Source Reasoning'}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="btn-icon btn-danger"
                            style={{ marginLeft: 'auto', padding: 2 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteUserTemplate(tpl.id, tpl.name);
                            }}
                            title="Remove template"
                            aria-label={`Delete ${tpl.name} template`}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <p className="pb-lib-desc">{tpl.description}</p>
                        <div className="pb-lib-preview">
                          <strong>Heading:</strong> {tpl.heading}
                        </div>
                        <button
                          type="button"
                          className="btn-primary btn-sm pb-lib-btn"
                          onClick={() => onAddLibraryStep(tpl)}
                        >
                          <Plus size={12} />
                          <span>Add to Playbook</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {userStepTemplates.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Standard Step Library ({libraryTemplates.length})
                  </span>
                </div>
              )}
              <div className="pb-library-grid">
                {libraryTemplates.map((tpl) => (
                  <div key={tpl.id} className="pb-lib-item">
                    <div className="pb-lib-top">
                      <span className="pb-lib-icon">{tpl.icon}</span>
                      <div className="pb-lib-title-box">
                        <h5 className="pb-lib-name">{tpl.name}</h5>
                        <span className="pb-lib-policy">
                          {tpl.tool_policy === 'search'
                            ? '🔍 Live Web Search'
                            : '🧠 Source Reasoning'}
                        </span>
                      </div>
                    </div>
                    <p className="pb-lib-desc">{tpl.description}</p>
                    <div className="pb-lib-preview">
                      <strong>Heading:</strong> {tpl.heading}
                    </div>
                    <button
                      type="button"
                      className="btn-primary btn-sm pb-lib-btn"
                      onClick={() => onAddLibraryStep(tpl)}
                    >
                      <Plus size={12} />
                      <span>Add to Playbook</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="pb-blank-box">
              <p>
                Create a blank custom step that analyzes existing sources or searches the web using
                a custom LLM prompt instruction.
              </p>
              <button
                type="button"
                className="btn-primary"
                style={{ marginTop: 16 }}
                onClick={onAddBlankStep}
              >
                <Plus size={14} />
                <span>Create Blank Custom Step</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export interface PlaybookTemplateGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  builtinPlaybooks: Playbook[];
  onSelectTemplate?: (template: PlaybookTemplate) => void;
  onSelectRecipe?: (recipe: PlaybookRecipe) => void;
  onCloneBuiltin: (pb: Playbook) => void;
}

export type RecipePickerModalProps = PlaybookTemplateGalleryModalProps;

const ALL_PILLARS = [
  { id: 'grounding', abbr: 'G', label: 'Grounding' },
  { id: 'retrieval', abbr: 'R', label: 'Retrieval' },
  { id: 'extraction', abbr: 'E', label: 'Extraction' },
  { id: 'verification', abbr: 'V', label: 'Verification' },
  { id: 'delivery', abbr: 'D', label: 'Delivery' },
] as const;

export const PlaybookTemplateGalleryModal: React.FC<PlaybookTemplateGalleryModalProps> = ({
  isOpen,
  onClose,
  builtinPlaybooks,
  onSelectTemplate,
  onSelectRecipe,
  onCloneBuiltin,
}) => {
  const [selectedDomain, setSelectedDomain] = React.useState<TemplateDomain>('All');

  if (!isOpen) return null;

  const handleSelect = (template: PlaybookTemplate) => {
    if (onSelectTemplate) {
      onSelectTemplate(template);
    } else if (onSelectRecipe) {
      onSelectRecipe(template);
    }
  };

  const filteredTemplates = PLAYBOOK_TEMPLATES.filter((tpl) => {
    if (selectedDomain === 'All') return true;
    return tpl.domain === selectedDomain;
  });

  return (
    <div className="pb-modal-backdrop" onClick={onClose}>
      <div
        className="pb-modal-content pb-template-gallery-modal"
        style={{ maxWidth: 780 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pb-modal-header">
          <div>
            <h4 className="pb-modal-title">Playbook Template Gallery</h4>
            <p className="pb-modal-subtitle">
              Select a domain-tailored research pipeline archetype or clone a built-in playbook into
              your builder canvas.
            </p>
          </div>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            aria-label="Close template gallery"
          >
            <X size={16} />
          </button>
        </div>

        {/* Domain Filter Tabs */}
        <div className="pb-template-domain-nav" role="tablist" aria-label="Template Domains">
          {TEMPLATE_DOMAINS.map((domain) => {
            const count =
              domain === 'All'
                ? PLAYBOOK_TEMPLATES.length
                : PLAYBOOK_TEMPLATES.filter((t) => t.domain === domain).length;
            const isActive = selectedDomain === domain;
            return (
              <button
                key={domain}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`pb-domain-tab ${isActive ? 'active' : ''}`}
                onClick={() => setSelectedDomain(domain)}
              >
                <span>{domain}</span>
                <span className="pb-domain-count">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="pb-modal-body" style={{ maxHeight: '68vh', overflowY: 'auto' }}>
          <div className="pb-templates-grid">
            {filteredTemplates.map((template) => (
              <div
                key={template.id}
                className="pb-lib-item pb-template-card"
                data-testid={`template-card-${template.id}`}
              >
                <div className="pb-template-card-header">
                  <div className="pb-lib-top">
                    <span className="pb-lib-icon">{template.icon}</span>
                    <div className="pb-lib-title-box">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <h5 className="pb-lib-name">{template.name}</h5>
                        <span className="pb-template-domain-badge">{template.domain}</span>
                      </div>
                      <span className="pb-lib-policy">{template.steps.length} Steps</span>
                    </div>
                  </div>
                </div>

                <p className="pb-lib-desc">{template.description}</p>

                {/* Step Flow Badges */}
                <div className="pb-template-flow-strip">
                  <span className="pb-flow-label">Pipeline:</span>
                  <div className="pb-flow-badges">
                    {template.steps.map((s, idx) => (
                      <React.Fragment key={idx}>
                        <span className="pb-flow-step-badge">{s.name}</span>
                        {idx < template.steps.length - 1 && (
                          <span className="pb-flow-arrow">→</span>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* Meta Bar: 5-Pillar Readiness, Cost & Latency */}
                <div className="pb-template-meta-bar">
                  <div className="pb-template-pillars" title="5-Pillar Pipeline Readiness">
                    <span className="pb-meta-title">5-Pillars:</span>
                    {ALL_PILLARS.map((p) => {
                      const isReady = template.pillarsReady.includes(p.id);
                      return (
                        <span
                          key={p.id}
                          className={`pb-pillar-pill ${isReady ? 'ready' : 'missing'}`}
                          title={`${p.label}: ${isReady ? 'Satisfied' : 'Missing'}`}
                        >
                          {p.abbr}
                        </span>
                      );
                    })}
                  </div>

                  <div className="pb-template-metrics">
                    <span className="pb-template-metric" title="Estimated execution cost">
                      🪙 {template.estCost}
                    </span>
                    <span className="pb-template-metric" title="Estimated execution latency">
                      ⏱️ {template.estLatency}
                    </span>
                  </div>
                </div>

                {/* Suited Card Types */}
                {template.card_types.length > 0 && (
                  <div className="pb-template-ct-row">
                    <span className="pb-meta-title">Suited for:</span>
                    {template.card_types.map((ct) => (
                      <span key={ct} className="pb-template-ct-tag">
                        #{ct}
                      </span>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  className="btn-primary btn-sm pb-lib-btn pb-template-use-btn"
                  onClick={() => handleSelect(template)}
                  aria-label={`Use this Template: ${template.name}`}
                >
                  <Plus size={13} />
                  <span>Use this Template</span>
                </button>
              </div>
            ))}
          </div>

          {builtinPlaybooks.length > 0 && (
            <div className="pb-builtin-section" style={{ marginTop: 24 }}>
              <div
                style={{
                  marginBottom: 10,
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Built-in Playbooks
              </div>
              <div className="pb-templates-grid">
                {builtinPlaybooks.map((pb) => (
                  <div
                    key={pb.id}
                    className="pb-lib-item pb-template-card pb-builtin-card"
                  >
                    <div className="pb-template-card-header">
                      <div className="pb-lib-top">
                        <span className="pb-lib-icon">🏛️</span>
                        <div className="pb-lib-title-box">
                          <h5 className="pb-lib-name">{pb.name}</h5>
                          <span className="pb-lib-policy">{pb.steps?.length || 0} Steps</span>
                        </div>
                      </div>
                    </div>
                    <p className="pb-lib-desc">
                      {pb.description || 'System built-in research pipeline.'}
                    </p>
                    <div className="pb-template-flow-strip">
                      <span className="pb-flow-label">Pipeline:</span>
                      <div className="pb-flow-badges">
                        {pb.steps?.map((s, idx) => (
                          <React.Fragment key={idx}>
                            <span className="pb-flow-step-badge">{s.name}</span>
                            {idx < (pb.steps?.length || 0) - 1 && (
                              <span className="pb-flow-arrow">→</span>
                            )}
                          </React.Fragment>
                        )) || <span className="pb-flow-step-badge">No steps</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary btn-sm pb-lib-btn"
                      style={{ marginTop: 12 }}
                      onClick={() => onCloneBuiltin(pb)}
                    >
                      <Copy size={12} />
                      <span>Clone Built-in Steps</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const RecipePickerModal = PlaybookTemplateGalleryModal;

export interface ImportPlaybookModalProps {
  isOpen: boolean;
  onClose: () => void;
  importJsonText: string;
  onImportJsonChange: (text: string) => void;
  importError: string | null;
  onApplyImport: () => void;
}

export const ImportPlaybookModal: React.FC<ImportPlaybookModalProps> = ({
  isOpen,
  onClose,
  importJsonText,
  onImportJsonChange,
  importError,
  onApplyImport,
}) => {
  if (!isOpen) return null;

  return (
    <div className="pb-modal-backdrop" onClick={onClose}>
      <div
        className="pb-modal-content"
        style={{ maxWidth: 640 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pb-modal-header">
          <div>
            <h4 className="pb-modal-title">Import Playbook JSON</h4>
            <p className="pb-modal-subtitle">
              Paste a valid playbook JSON definition to load it into the builder.
            </p>
          </div>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            aria-label="Close import modal"
          >
            <X size={16} />
          </button>
        </div>

        <div className="pb-modal-body">
          {importError && (
            <div className="pb-error-banner" style={{ marginBottom: 12 }}>
              <AlertCircle size={16} />
              <span>{importError}</span>
            </div>
          )}
          <div className="pb-form-field">
            <label htmlFor="import-json-textarea">Playbook JSON</label>
            <textarea
              id="import-json-textarea"
              className="input-textarea"
              rows={10}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
              placeholder={`{\n  "name": "Exported Pipeline",\n  "description": "...",\n  "card_types": ["tool"],\n  "steps": [\n    {\n      "kind": "custom",\n      "name": "Analysis",\n      "config": { "output_heading": "Analysis" }\n    }\n  ]\n}`}
              value={importJsonText}
              onChange={(e) => onImportJsonChange(e.target.value)}
              aria-label="Playbook JSON input"
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={onApplyImport}>
              Import and Load
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
