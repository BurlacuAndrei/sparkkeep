import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  Lock,
  Copy,
  Pencil,
  Trash2,
  Plus,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Zap,
  Globe,
  Sliders,
  HelpCircle,
  X,
  Layers,
} from 'lucide-react';
import * as api from '../api';
import { Playbook, PlaybookStep, StepLibraryTemplate, CustomStepConfig } from '../types';

interface PlaybookManagerProps {
  showToast: (msg: string) => void;
}

const AVAILABLE_CARD_TYPES = [
  'idea',
  'tool',
  'reading',
  'architecture',
  'company',
  'article',
  'product',
  'research',
];

const CORE_STEP_DESCRIPTIONS: Record<string, string> = {
  ground: 'Anchor card context, source URL, note, and metadata into run memory',
  resolve_refs: 'Fetch linked internal and external references',
  plan: 'Decompose core questions and craft search queries',
  search: 'Execute queries across search providers and register URLs',
  read: 'Scrape and extract content in round-robin fashion',
  verify_claims: 'Cross-check core claims against extracted sources with citations',
  landscape: 'Analyze competitive landscape and alternatives',
  verdict: 'Synthesize decision recommendation, confidence, and action items',
  report: 'Compile finalized Markdown briefing with [S#] citations',
  custom: 'User-configured custom research analysis step',
};

export const PlaybookManager: React.FC<PlaybookManagerProps> = ({ showToast }) => {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [libraryTemplates, setLibraryTemplates] = useState<StepLibraryTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlaybook, setEditingPlaybook] = useState<Playbook | null>(null);
  const [expandedCustomSteps, setExpandedCustomSteps] = useState<Record<number, boolean>>({});
  const [isAddStepOpen, setIsAddStepOpen] = useState(false);
  const [addStepTab, setAddStepTab] = useState<'library' | 'blank'>('library');
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Load playbooks & library
  const loadData = async () => {
    setLoading(true);
    try {
      const [pbs, lib] = await Promise.all([
        api.fetchPlaybooks(),
        api.fetchStepLibrary(),
      ]);
      setPlaybooks(pbs);
      setLibraryTemplates(lib);
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Duplicate a playbook
  const handleDuplicate = async (id: number) => {
    try {
      const dup = await api.duplicatePlaybook(id);
      showToast(`Duplicated playbook: "${dup.name}"`);
      await loadData();
      setEditingPlaybook(dup);
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    }
  };

  // Delete a playbook
  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to delete playbook "${name}"?`)) {
      return;
    }
    try {
      await api.deletePlaybook(id);
      showToast(`Deleted playbook "${name}"`);
      await loadData();
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    }
  };

  // Start editing a playbook
  const startEdit = (pb: Playbook) => {
    setEditingPlaybook(JSON.parse(JSON.stringify(pb)));
    setServerError(null);
    setExpandedCustomSteps({});
  };

  // Start creating a new blank/custom playbook
  const startCreateNew = () => {
    const newPb: Playbook = {
      id: 0,
      name: 'New Custom Playbook',
      description: 'Custom research workflow',
      is_builtin: false,
      card_types: [],
      version: 1,
      steps: [
        { position: 1, kind: 'ground', name: 'Grounding', enabled: true, config: {} },
        { position: 2, kind: 'resolve_refs', name: 'Resolve References', enabled: true, config: {} },
        { position: 3, kind: 'plan', name: 'Question Planning', enabled: true, config: {} },
        { position: 4, kind: 'search', name: 'Multi-query Search', enabled: true, config: {} },
        { position: 5, kind: 'read', name: 'Round-robin Reading', enabled: true, config: {} },
        { position: 6, kind: 'verify_claims', name: 'Claim Verification', enabled: true, config: {} },
        { position: 7, kind: 'verdict', name: 'Synthesis & Verdict', enabled: true, config: {} },
        { position: 8, kind: 'report', name: 'Report Generation', enabled: true, config: {} },
      ],
    };
    setEditingPlaybook(newPb);
    setServerError(null);
    setExpandedCustomSteps({});
  };

  // Validation mirroring server rules
  const validationErrors = useMemo(() => {
    if (!editingPlaybook) return [];
    const errors: string[] = [];

    if (!editingPlaybook.name.trim()) {
      errors.push('Playbook name is required.');
    }
    if (editingPlaybook.steps.length === 0) {
      errors.push('Playbook must contain at least one step.');
    }
    if (editingPlaybook.steps.length > 12) {
      errors.push(`Maximum 12 steps allowed (currently ${editingPlaybook.steps.length}).`);
    }

    let hasSearchOrRefs = false;
    let verdictOrReportSeen = false;

    editingPlaybook.steps.forEach((step, idx) => {
      if (step.enabled) {
        if (verdictOrReportSeen && step.kind !== 'verdict' && step.kind !== 'report') {
          errors.push(`Step ${idx + 1} (${step.name}): Verdict and Report steps must be placed at the end.`);
        }
        if (step.kind === 'verdict' || step.kind === 'report') {
          verdictOrReportSeen = true;
        }
        if (step.kind === 'read' && !hasSearchOrRefs) {
          errors.push(`Step ${idx + 1} (${step.name}): "Read" requires "Search" or "Resolve References" before it.`);
        }
        if (step.kind === 'search' || step.kind === 'resolve_refs') {
          hasSearchOrRefs = true;
        }
      }

      if (step.kind === 'custom') {
        if (!step.config?.output_heading?.trim()) {
          errors.push(`Step ${idx + 1} (${step.name}): Output Heading is required.`);
        }
        if ((step.config?.instruction || '').length > 2000) {
          errors.push(`Step ${idx + 1} (${step.name}): Instruction exceeds 2,000 characters limit.`);
        }
      }
    });

    return errors;
  }, [editingPlaybook]);

  // Rough cost/time estimator
  const estimates = useMemo(() => {
    if (!editingPlaybook) return { llmCalls: 0, fetches: 0, estSeconds: '0s' };
    let llm = 0;
    let fetches = 0;

    editingPlaybook.steps.forEach((st) => {
      if (!st.enabled) return;
      switch (st.kind) {
        case 'resolve_refs':
          fetches += 2;
          break;
        case 'plan':
          llm += 1;
          break;
        case 'search':
          fetches += 6;
          break;
        case 'read':
          fetches += 5;
          break;
        case 'verify_claims':
          llm += 1;
          break;
        case 'landscape':
          llm += 1;
          break;
        case 'verdict':
          llm += 1;
          break;
        case 'custom':
          llm += 1;
          if (st.config?.tool_policy === 'search') {
            fetches += st.config?.max_queries || 2;
          }
          break;
      }
    });

    const minSec = Math.max(5, llm * 5 + Math.round(fetches * 1.5));
    const maxSec = Math.max(10, llm * 10 + Math.round(fetches * 3));
    return {
      llmCalls: llm,
      fetches,
      estSeconds: `~${minSec}–${maxSec}s`,
    };
  }, [editingPlaybook]);

  // Reorder step
  const moveStep = (fromIdx: number, toIdx: number) => {
    if (!editingPlaybook) return;
    if (toIdx < 0 || toIdx >= editingPlaybook.steps.length) return;
    const steps = [...editingPlaybook.steps];
    const [moved] = steps.splice(fromIdx, 1);
    steps.splice(toIdx, 0, moved);
    steps.forEach((s, i) => (s.position = i + 1));
    setEditingPlaybook({ ...editingPlaybook, steps });
  };

  // Toggle step enabled
  const toggleStep = (idx: number) => {
    if (!editingPlaybook) return;
    const steps = [...editingPlaybook.steps];
    steps[idx] = { ...steps[idx], enabled: !steps[idx].enabled };
    setEditingPlaybook({ ...editingPlaybook, steps });
  };

  // Remove step
  const removeStep = (idx: number) => {
    if (!editingPlaybook) return;
    const steps = editingPlaybook.steps.filter((_, i) => i !== idx);
    steps.forEach((s, i) => (s.position = i + 1));
    setEditingPlaybook({ ...editingPlaybook, steps });
  };

  // Update custom step config
  const updateCustomConfig = (idx: number, patch: Partial<CustomStepConfig>, newName?: string) => {
    if (!editingPlaybook) return;
    const steps = [...editingPlaybook.steps];
    const step = { ...steps[idx] };
    if (newName !== undefined) step.name = newName;
    step.config = { ...step.config, ...patch };
    steps[idx] = step;
    setEditingPlaybook({ ...editingPlaybook, steps });
  };

  // Add library template step
  const addLibraryStep = (tpl: StepLibraryTemplate) => {
    if (!editingPlaybook) return;
    const newStep: PlaybookStep = {
      position: editingPlaybook.steps.length + 1,
      kind: 'custom',
      name: tpl.name,
      enabled: true,
      config: {
        output_heading: tpl.heading,
        instruction: tpl.instruction,
        tool_policy: tpl.tool_policy,
        role: tpl.role,
        inputs: tpl.inputs || ['capture', 'sources', 'previous_steps'],
        max_queries: tpl.max_queries || 2,
      },
    };
    // Insert before verdict/report if present, else append
    const steps = [...editingPlaybook.steps];
    const insertIdx = steps.findIndex((s) => s.kind === 'verdict' || s.kind === 'report');
    if (insertIdx >= 0) {
      steps.splice(insertIdx, 0, newStep);
    } else {
      steps.push(newStep);
    }
    steps.forEach((s, i) => (s.position = i + 1));
    setEditingPlaybook({ ...editingPlaybook, steps });
    setIsAddStepOpen(false);
    showToast(`Added step "${tpl.name}" from library`);
  };

  // Add blank custom step
  const addBlankCustomStep = () => {
    if (!editingPlaybook) return;
    const newStep: PlaybookStep = {
      position: editingPlaybook.steps.length + 1,
      kind: 'custom',
      name: 'Custom Analysis',
      enabled: true,
      config: {
        output_heading: 'Custom Analysis',
        instruction: 'Analyze the card context and extracted sources.',
        tool_policy: 'none',
        role: 'research_synthesis',
        inputs: ['capture', 'sources', 'previous_steps'],
        max_queries: 2,
      },
    };
    const steps = [...editingPlaybook.steps];
    const insertIdx = steps.findIndex((s) => s.kind === 'verdict' || s.kind === 'report');
    if (insertIdx >= 0) {
      steps.splice(insertIdx, 0, newStep);
    } else {
      steps.push(newStep);
    }
    steps.forEach((s, i) => (s.position = i + 1));
    setEditingPlaybook({ ...editingPlaybook, steps });
    setIsAddStepOpen(false);
  };

  // Save playbook
  const handleSave = async () => {
    if (!editingPlaybook) return;
    if (validationErrors.length > 0) {
      setServerError(validationErrors[0]);
      return;
    }
    setSaving(true);
    setServerError(null);
    try {
      if (editingPlaybook.id > 0) {
        await api.updatePlaybook(editingPlaybook.id, editingPlaybook);
        showToast(`Saved playbook "${editingPlaybook.name}"`);
      } else {
        const created = await api.createPlaybook(editingPlaybook);
        showToast(`Created playbook "${created.name}"`);
      }
      setEditingPlaybook(null);
      await loadData();
    } catch (err: unknown) {
      setServerError(api.getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="playbook-manager">
      {/* HEADER / NAVIGATION */}
      {!editingPlaybook ? (
        <div className="pb-header-row">
          <div>
            <h3 className="pb-title">
              <BookOpen size={18} className="pb-title-icon" />
              Research Playbooks
            </h3>
            <p className="pb-subtitle">
              Customize step sequences, tune research angles, and plug in curated library analyses.
            </p>
          </div>
          <button type="button" className="btn-primary" onClick={startCreateNew}>
            <Plus size={14} />
            <span>New Playbook</span>
          </button>
        </div>
      ) : (
        <div className="pb-header-row">
          <div>
            <h3 className="pb-title">
              <Pencil size={18} className="pb-title-icon" />
              {editingPlaybook.id > 0 ? `Edit: ${editingPlaybook.name}` : 'New Playbook'}
            </h3>
            <p className="pb-subtitle">
              Configure metadata, reorder pipeline steps, or add custom prompt modules.
            </p>
          </div>
          <div className="pb-actions-group">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setEditingPlaybook(null);
                setServerError(null);
              }}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={saving || validationErrors.length > 0}
            >
              <CheckCircle2 size={14} />
              <span>{saving ? 'Saving…' : 'Save Playbook'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ERROR NOTICE */}
      {serverError && (
        <div className="pb-error-banner">
          <AlertCircle size={16} />
          <span>{serverError}</span>
        </div>
      )}

      {/* LIST VIEW */}
      {!editingPlaybook && (
        <div className="pb-list-container">
          {loading ? (
            <div className="pb-empty-state">Loading playbooks…</div>
          ) : playbooks.length === 0 ? (
            <div className="pb-empty-state">No playbooks found.</div>
          ) : (
            <>
              {/* Built-ins */}
              <div className="pb-section-header">Built-in Playbooks (Read-Only)</div>
              <div className="pb-cards-grid">
                {playbooks
                  .filter((p) => p.is_builtin)
                  .map((p) => (
                    <div key={p.id} className="pb-card builtin">
                      <div className="pb-card-top">
                        <div className="pb-card-badge">
                          <Lock size={12} />
                          <span>Built-in</span>
                        </div>
                        <span className="pb-card-steps">{p.steps?.length || 0} steps</span>
                      </div>
                      <h4 className="pb-card-name">{p.name}</h4>
                      <p className="pb-card-desc">{p.description || 'Standard deep research pipeline.'}</p>
                      <div className="pb-card-footer">
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => handleDuplicate(p.id)}
                          title="Duplicate to edit"
                        >
                          <Copy size={12} />
                          <span>Duplicate</span>
                        </button>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Custom / User Playbooks */}
              <div className="pb-section-header" style={{ marginTop: 24 }}>
                Custom Playbooks
              </div>
              <div className="pb-cards-grid">
                {playbooks.filter((p) => !p.is_builtin).length === 0 ? (
                  <div className="pb-empty-placeholder">
                    No custom playbooks yet. Duplicate a built-in or click "New Playbook" to start customizing!
                  </div>
                ) : (
                  playbooks
                    .filter((p) => !p.is_builtin)
                    .map((p) => (
                      <div key={p.id} className="pb-card custom">
                        <div className="pb-card-top">
                          <div className="pb-card-badge custom">
                            <Sparkles size={12} />
                            <span>Custom</span>
                          </div>
                          <span className="pb-card-steps">{p.steps?.length || 0} steps</span>
                        </div>
                        <h4 className="pb-card-name">{p.name}</h4>
                        <p className="pb-card-desc">{p.description || 'Custom research workflow'}</p>
                        <div className="pb-card-footer">
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => startEdit(p)}
                          >
                            <Pencil size={12} />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => handleDuplicate(p.id)}
                            title="Duplicate"
                          >
                            <Copy size={12} />
                          </button>
                          <button
                            type="button"
                            className="btn-secondary btn-sm btn-danger"
                            onClick={() => handleDelete(p.id, p.name)}
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* EDITOR VIEW */}
      {editingPlaybook && (
        <div className="pb-editor-container">
          {/* Top Form Fields */}
          <div className="pb-meta-grid">
            <div className="pb-form-field">
              <label>Playbook Name</label>
              <input
                type="text"
                className="input-text"
                placeholder="e.g. Monetization & Feasibility Deep Dive"
                value={editingPlaybook.name}
                onChange={(e) => setEditingPlaybook({ ...editingPlaybook, name: e.target.value })}
              />
            </div>
            <div className="pb-form-field">
              <label>Description</label>
              <input
                type="text"
                className="input-text"
                placeholder="Brief summary of what this research pipeline focuses on"
                value={editingPlaybook.description}
                onChange={(e) => setEditingPlaybook({ ...editingPlaybook, description: e.target.value })}
              />
            </div>
          </div>

          {/* Applicable Card Types */}
          <div className="pb-form-field" style={{ marginTop: 12 }}>
            <label>Applicable Card Types (Auto-select hints)</label>
            <div className="pb-card-types-chips">
              {AVAILABLE_CARD_TYPES.map((type) => {
                const active = (editingPlaybook.card_types || []).includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    className={`pb-type-chip ${active ? 'active' : ''}`}
                    onClick={() => {
                      const cur = editingPlaybook.card_types || [];
                      const next = active ? cur.filter((t) => t !== type) : [...cur, type];
                      setEditingPlaybook({ ...editingPlaybook, card_types: next });
                    }}
                  >
                    <span>{type}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Resource & Time Estimate Strip */}
          <div className="pb-estimate-strip">
            <div className="pb-estimate-item">
              <Clock size={15} className="pb-est-icon" />
              <span>
                Estimated Time: <strong>{estimates.estSeconds}</strong>
              </span>
            </div>
            <div className="pb-estimate-item">
              <Sparkles size={15} className="pb-est-icon" />
              <span>
                LLM Calls: <strong>≈ {estimates.llmCalls}</strong>
              </span>
            </div>
            <div className="pb-estimate-item">
              <Globe size={15} className="pb-est-icon" />
              <span>
                Web Fetches: <strong>≈ {estimates.fetches}</strong>
              </span>
            </div>
          </div>

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

          {/* Steps List */}
          <div className="pb-steps-header">
            <div className="pb-steps-title">
              <Layers size={16} />
              <span>Pipeline Steps ({editingPlaybook.steps.length} / 12)</span>
            </div>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setIsAddStepOpen(true)}
              disabled={editingPlaybook.steps.length >= 12}
            >
              <Plus size={13} />
              <span>Add Step</span>
            </button>
          </div>

          <div className="pb-steps-list">
            {editingPlaybook.steps.map((step, idx) => {
              const isCustom = step.kind === 'custom';
              const isExpanded = !!expandedCustomSteps[idx];

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
                      >
                        <ArrowUp size={12} />
                      </button>
                      <span className="pb-step-pos">{idx + 1}</span>
                      <button
                        type="button"
                        className="btn-icon"
                        disabled={idx === editingPlaybook.steps.length - 1}
                        onClick={() => moveStep(idx, idx + 1)}
                        title="Move Down"
                      >
                        <ArrowDown size={12} />
                      </button>
                    </div>

                    {/* Enable toggle */}
                    <label className="pb-toggle" title="Toggle step enabled">
                      <input
                        type="checkbox"
                        checked={step.enabled}
                        onChange={() => toggleStep(idx)}
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
                        {isCustom
                          ? (step.config?.instruction || '').slice(0, 90) + ((step.config?.instruction || '').length > 90 ? '…' : '')
                          : CORE_STEP_DESCRIPTIONS[step.kind] || ''}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="pb-step-actions">
                      {isCustom && (
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() =>
                            setExpandedCustomSteps({
                              ...expandedCustomSteps,
                              [idx]: !isExpanded,
                            })
                          }
                          title={isExpanded ? 'Collapse config' : 'Edit config'}
                        >
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-icon btn-danger"
                        onClick={() => removeStep(idx)}
                        title="Delete step"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Custom Step Configuration */}
                  {isCustom && isExpanded && (
                    <div className="pb-custom-config-drawer">
                      <div className="pb-cfg-row">
                        <div className="pb-form-field">
                          <label>Step Display Name</label>
                          <input
                            type="text"
                            className="input-text"
                            value={step.name}
                            onChange={(e) => updateCustomConfig(idx, {}, e.target.value)}
                          />
                        </div>
                        <div className="pb-form-field">
                          <label>Report Section Heading</label>
                          <input
                            type="text"
                            className="input-text"
                            placeholder="e.g. Monetization Angle"
                            value={step.config?.output_heading || ''}
                            onChange={(e) =>
                              updateCustomConfig(idx, { output_heading: e.target.value })
                            }
                          />
                        </div>
                      </div>

                      <div className="pb-form-field" style={{ marginTop: 10 }}>
                        <div className="pb-label-with-count">
                          <label>Instruction / Prompt</label>
                          <span
                            className={`pb-char-counter ${
                              (step.config?.instruction || '').length > 2000 ? 'overflow' : ''
                            }`}
                          >
                            {(step.config?.instruction || '').length} / 2,000
                          </span>
                        </div>
                        <textarea
                          className="input-textarea"
                          rows={3}
                          placeholder="Prompt instructions for this analysis step…"
                          value={step.config?.instruction || ''}
                          onChange={(e) =>
                            updateCustomConfig(idx, { instruction: e.target.value })
                          }
                        />
                      </div>

                      <div className="pb-cfg-row" style={{ marginTop: 10 }}>
                        <div className="pb-form-field">
                          <label>Tool Policy</label>
                          <select
                            className="input-select"
                            value={step.config?.tool_policy || 'none'}
                            onChange={(e) =>
                              updateCustomConfig(idx, {
                                tool_policy: e.target.value as 'none' | 'search',
                              })
                            }
                          >
                            <option value="none">None (Reason over existing sources only)</option>
                            <option value="search">Search (Execute live web queries)</option>
                          </select>
                        </div>

                        {step.config?.tool_policy === 'search' && (
                          <div className="pb-form-field">
                            <label>Max Search Queries (1–5)</label>
                            <input
                              type="number"
                              className="input-text"
                              min={1}
                              max={5}
                              value={step.config?.max_queries ?? 2}
                              onChange={(e) =>
                                updateCustomConfig(idx, {
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
                            value={step.config?.role || 'research_synthesis'}
                            onChange={(e) =>
                              updateCustomConfig(idx, {
                                role: e.target.value as 'research_plan' | 'research_synthesis',
                              })
                            }
                          >
                            <option value="research_synthesis">Synthesis & Reasoning (Strong model)</option>
                            <option value="research_plan">Planning & Fast (Cheaper model)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ADD STEP MODAL */}
      {isAddStepOpen && (
        <div className="pb-modal-backdrop" onClick={() => setIsAddStepOpen(false)}>
          <div className="pb-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="pb-modal-header">
              <div>
                <h4 className="pb-modal-title">Add Step to Playbook</h4>
                <p className="pb-modal-subtitle">
                  Pick a ready-made step from our tuned library or craft a custom blank step.
                </p>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setIsAddStepOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="pb-modal-tabs">
              <button
                type="button"
                className={`pb-modal-tab ${addStepTab === 'library' ? 'active' : ''}`}
                onClick={() => setAddStepTab('library')}
              >
                <Sparkles size={13} />
                <span>Step Library ({libraryTemplates.length})</span>
              </button>
              <button
                type="button"
                className={`pb-modal-tab ${addStepTab === 'blank' ? 'active' : ''}`}
                onClick={() => setAddStepTab('blank')}
              >
                <Plus size={13} />
                <span>Blank Custom Step</span>
              </button>
            </div>

            <div className="pb-modal-body">
              {addStepTab === 'library' ? (
                <div className="pb-library-grid">
                  {libraryTemplates.map((tpl) => (
                    <div key={tpl.id} className="pb-lib-item">
                      <div className="pb-lib-top">
                        <span className="pb-lib-icon">{tpl.icon}</span>
                        <div className="pb-lib-title-box">
                          <h5 className="pb-lib-name">{tpl.name}</h5>
                          <span className="pb-lib-policy">
                            {tpl.tool_policy === 'search' ? '🔍 Live Web Search' : '🧠 Source Reasoning'}
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
                        onClick={() => addLibraryStep(tpl)}
                      >
                        <Plus size={12} />
                        <span>Add to Playbook</span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="pb-blank-box">
                  <p>
                    Create a blank custom step that analyzes existing sources or searches the web
                    using a custom LLM prompt instruction.
                  </p>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ marginTop: 16 }}
                    onClick={addBlankCustomStep}
                  >
                    <Plus size={14} />
                    <span>Create Blank Custom Step</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
