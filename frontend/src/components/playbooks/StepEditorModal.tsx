import React from 'react';
import { Sparkles, Plus, Trash2, X, Copy, AlertCircle } from 'lucide-react';
import { Playbook, PlaybookStep, CustomStepConfig, StepLibraryTemplate } from '../../types';
import {
  INPUT_BINDING_OPTIONS,
  getDefaultInputsForStep,
  STEP_PROMPT_STARTERS,
  DEFAULT_PROMPT_STARTERS,
  PLAYBOOK_RECIPES,
  PlaybookRecipe,
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
  return (
    <div className="pb-custom-config-drawer">
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
            className={`pb-char-counter ${
              (step.config?.instruction || '').length > 8000 ? 'overflow' : ''
            }`}
          >
            {(step.config?.instruction || '').length} / 8,000
          </span>
        </div>

        {/* Quick Prompt Starters */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            margin: '6px 0',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
            Prompt Starters:
          </span>
          {(STEP_PROMPT_STARTERS[step.kind] || DEFAULT_PROMPT_STARTERS).map((snip) => (
            <button
              key={snip.label}
              type="button"
              className="btn-secondary"
              style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 12 }}
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
          <label>Tool Policy</label>
          <select
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
            <label>Max Search Queries (1–5)</label>
            <input
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
          <label>LLM Role</label>
          <select
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

      {/* Input Bindings Checkboxes */}
      <div className="pb-form-field" style={{ marginTop: 10 }}>
        <label>Input Bindings</label>
        <div className="pb-input-bindings">
          {INPUT_BINDING_OPTIONS.map(({ key, label }) => {
            const activeInputs = getDefaultInputsForStep(step);
            const checked = activeInputs.includes(key);
            return (
              <label key={key} className="pb-binding-checkbox">
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

export interface RecipePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  builtinPlaybooks: Playbook[];
  onSelectRecipe: (recipe: PlaybookRecipe) => void;
  onCloneBuiltin: (pb: Playbook) => void;
}

export const RecipePickerModal: React.FC<RecipePickerModalProps> = ({
  isOpen,
  onClose,
  builtinPlaybooks,
  onSelectRecipe,
  onCloneBuiltin,
}) => {
  if (!isOpen) return null;

  return (
    <div className="pb-modal-backdrop" onClick={onClose}>
      <div
        className="pb-modal-content"
        style={{ maxWidth: 740 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pb-modal-header">
          <div>
            <h4 className="pb-modal-title">Load Starter Template or Recipe</h4>
            <p className="pb-modal-subtitle">
              Select a workflow recipe tailored to your domain or clone a built-in playbook into
              your builder canvas.
            </p>
          </div>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            aria-label="Close template picker"
          >
            <X size={16} />
          </button>
        </div>

        <div className="pb-modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
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
            Curated Recipe Archetypes
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 12,
              marginBottom: 20,
            }}
          >
            {PLAYBOOK_RECIPES.map((recipe) => (
              <div
                key={recipe.id}
                className="pb-lib-item"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: 14,
                }}
              >
                <div>
                  <div className="pb-lib-top">
                    <span className="pb-lib-icon">{recipe.icon}</span>
                    <div className="pb-lib-title-box">
                      <h5 className="pb-lib-name">{recipe.name}</h5>
                      <span className="pb-lib-policy">{recipe.steps.length} Steps</span>
                    </div>
                  </div>
                  <p className="pb-lib-desc" style={{ marginTop: 8 }}>
                    {recipe.description}
                  </p>
                  <div className="pb-lib-preview" style={{ marginTop: 8, fontSize: 11.5 }}>
                    <strong>Pipeline:</strong> {recipe.steps.map((s) => s.name).join(' → ')}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-primary btn-sm pb-lib-btn"
                  style={{ marginTop: 12 }}
                  onClick={() => onSelectRecipe(recipe)}
                >
                  <Plus size={12} />
                  <span>Use this Recipe</span>
                </button>
              </div>
            ))}
          </div>

          {builtinPlaybooks.length > 0 && (
            <>
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
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                  gap: 12,
                }}
              >
                {builtinPlaybooks.map((pb) => (
                  <div
                    key={pb.id}
                    className="pb-lib-item"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      padding: 14,
                    }}
                  >
                    <div>
                      <div className="pb-lib-top">
                        <span className="pb-lib-icon">🏛️</span>
                        <div className="pb-lib-title-box">
                          <h5 className="pb-lib-name">{pb.name}</h5>
                          <span className="pb-lib-policy">{pb.steps?.length || 0} Steps</span>
                        </div>
                      </div>
                      <p className="pb-lib-desc" style={{ marginTop: 8 }}>
                        {pb.description || 'System built-in research pipeline.'}
                      </p>
                      <div className="pb-lib-preview" style={{ marginTop: 8, fontSize: 11.5 }}>
                        <strong>Pipeline:</strong>{' '}
                        {pb.steps?.map((s) => s.name).join(' → ') || 'No steps'}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
};

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
