import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BookOpen, Lock, Copy, Pencil, Trash2, Plus, Download, Upload,
  CheckCircle2, AlertCircle, Sparkles, Layers, Eye,
} from 'lucide-react';
import * as api from '../api';
import { Card, Playbook, PlaybookStep, StepLibraryTemplate } from '../types';
import {
  DEFAULT_CARD_TYPES, DEFAULT_LEAN_STARTER_STEPS, PlaybookTemplate,
  UserSavedStepTemplate, validatePlaybook, exportPlaybookToFile,
  parseImportedPlaybook, buildUserStepTemplate, PlaybookCanvas,
  AddStepModal, PlaybookTemplateGalleryModal, ImportPlaybookModal,
} from './playbooks';

// oxlint-disable-next-line react/only-export-components
export {
  PLAYBOOK_TEMPLATES, PLAYBOOK_RECIPES, type PillarHealth, type SoftLinterAdvisory,
  type PlaybookTemplate, type PlaybookRecipe, type UserSavedStepTemplate,
} from './playbooks';

export interface PlaybookManagerProps {
  showToast: (msg: string) => void;
  cards?: Card[];
}

export const PlaybookManager: React.FC<PlaybookManagerProps> = ({ showToast, cards = [] }) => {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [libraryTemplates, setLibraryTemplates] = useState<StepLibraryTemplate[]>([]);
  const [userStepTemplates, setUserStepTemplates] = useState<UserSavedStepTemplate[]>(() => {
    try {
      const raw = localStorage.getItem('sparkkeep_user_step_library');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(true);
  const [editingPlaybook, setEditingPlaybook] = useState<Playbook | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});
  const [inspectorTab, setInspectorTab] = useState<'health' | 'dryrun'>('health');
  const [isTemplateGalleryOpen, setIsTemplateGalleryOpen] = useState(false);
  const [isAddStepOpen, setIsAddStepOpen] = useState(false);
  const [addStepTab, setAddStepTab] = useState<'library' | 'blank'>('library');
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [defaultPlaybookId, setDefaultPlaybookId] = useState<number | null>(null);
  const [activeCardTypes, setActiveCardTypes] = useState<string[]>(DEFAULT_CARD_TYPES);
  const [isPlatformDefault, setIsPlatformDefault] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [pbs, lib, st] = await Promise.all([api.fetchPlaybooks(), api.fetchStepLibrary(), api.getSettings()]);
      setPlaybooks(pbs);
      setLibraryTemplates(lib);
      const types = st?.settings?.card_types;
      setActiveCardTypes(Array.isArray(types) && types.length > 0 ? types : DEFAULT_CARD_TYPES);
      if (st?.settings?.default_playbook_id) setDefaultPlaybookId(st.settings.default_playbook_id);
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    let alive = true;
    Promise.all([api.fetchPlaybooks(), api.fetchStepLibrary(), api.getSettings()])
      .then(([pbs, lib, st]) => {
        if (!alive) return;
        setPlaybooks(pbs);
        setLibraryTemplates(lib);
        const types = st?.settings?.card_types;
        setActiveCardTypes(Array.isArray(types) && types.length > 0 ? types : DEFAULT_CARD_TYPES);
        if (st?.settings?.default_playbook_id) setDefaultPlaybookId(st.settings.default_playbook_id);
      })
      .catch((err: unknown) => { if (alive) showToast(api.getErrorMessage(err)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [showToast]);

  const handleDefaultPlaybookChange = async (newId: number) => {
    try {
      await api.patchSettings({ default_playbook_id: newId });
      setDefaultPlaybookId(newId);
      showToast('Default research playbook updated');
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    }
  };

  const handleDuplicate = async (id: number) => {
    try {
      const dup = await api.duplicatePlaybook(id);
      showToast(`Duplicated playbook: "${dup.name}"`);
      await loadData();
      setEditingPlaybook(dup);
      setIsPlatformDefault(false);
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to delete playbook "${name}"?`)) return;
    try {
      await api.deletePlaybook(id);
      showToast(`Deleted playbook "${name}"`);
      await loadData();
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    }
  };

  const startEdit = (pb: Playbook) => {
    setEditingPlaybook(JSON.parse(JSON.stringify(pb)));
    setIsPlatformDefault(pb.id > 0 && pb.id === defaultPlaybookId);
    setServerError(null);
    setExpandedSteps({});
  };

  const startCreateNew = () => {
    setEditingPlaybook({
      id: 0,
      name: 'New Custom Playbook',
      description: '',
      is_builtin: false,
      card_types: [],
      version: 1,
      steps: DEFAULT_LEAN_STARTER_STEPS.map((s, idx) => ({ ...s, position: idx + 1, config: { ...s.config } })),
    });
    setIsPlatformDefault(false);
    setServerError(null);
    setExpandedSteps({});
  };

  const handleSelectTemplate = (template: PlaybookTemplate) => {
    setEditingPlaybook((prev) => ({
      id: prev?.id || 0, name: template.name, description: template.description,
      is_builtin: false, card_types: [...template.card_types], version: prev?.version || 1,
      steps: JSON.parse(JSON.stringify(template.steps)),
    }));
    setIsTemplateGalleryOpen(false);
    setServerError(null);
    setExpandedSteps({});
    showToast(`Loaded "${template.name}" template`);
  };

  const handleCloneBuiltin = (pb: Playbook) => {
    setEditingPlaybook((prev) => ({
      id: prev?.id || 0, name: `${pb.name} (Clone)`, description: pb.description,
      is_builtin: false, card_types: [...(pb.card_types || [])], version: prev?.version || 1,
      steps: JSON.parse(JSON.stringify(pb.steps || [])),
    }));
    setIsTemplateGalleryOpen(false);
    setServerError(null);
    setExpandedSteps({});
    showToast(`Loaded "${pb.name}" built-in steps`);
  };

  const validationErrors = useMemo(() => validatePlaybook(editingPlaybook), [editingPlaybook]);

  const insertCustomStep = (newStep: PlaybookStep) => {
    if (!editingPlaybook) return;
    const steps = [...editingPlaybook.steps];
    const insertIdx = steps.findIndex((s) => s.kind === 'verdict' || s.kind === 'report');
    if (insertIdx >= 0) steps.splice(insertIdx, 0, newStep);
    else steps.push(newStep);
    steps.forEach((s, i) => (s.position = i + 1));
    setEditingPlaybook({ ...editingPlaybook, steps });
    setIsAddStepOpen(false);
  };

  const addLibraryStep = (tpl: StepLibraryTemplate | UserSavedStepTemplate) => {
    insertCustomStep({
      position: (editingPlaybook?.steps.length || 0) + 1, kind: 'custom', name: tpl.name, enabled: true,
      config: {
        output_heading: tpl.heading, instruction: tpl.instruction, tool_policy: tpl.tool_policy, role: tpl.role,
        inputs: 'inputs' in tpl && tpl.inputs ? tpl.inputs : ['capture', 'sources', 'previous_steps'],
        max_queries: tpl.max_queries || 2,
      },
    });
    showToast(`Added step "${tpl.name}" from library`);
  };

  const addBlankCustomStep = () => {
    insertCustomStep({
      position: (editingPlaybook?.steps.length || 0) + 1, kind: 'custom', name: 'Custom Analysis', enabled: true,
      config: {
        output_heading: 'Custom Analysis', instruction: 'Analyze the card context and extracted sources.',
        tool_policy: 'none', role: 'research_synthesis', inputs: ['capture', 'sources', 'previous_steps'], max_queries: 2,
      },
    });
  };

  const handleSaveStepToLibrary = (step: PlaybookStep) => {
    try {
      const raw = localStorage.getItem('sparkkeep_user_step_library');
      const currentList: UserSavedStepTemplate[] = raw ? JSON.parse(raw) : [];
      const newTemplate = buildUserStepTemplate(step);
      const updated = [...currentList, newTemplate];
      localStorage.setItem('sparkkeep_user_step_library', JSON.stringify(updated));
      setUserStepTemplates(updated);
      showToast(`Saved "${newTemplate.name}" to step library`);
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    }
  };

  const handleDeleteUserTemplate = (id: string, name: string) => {
    const updated = userStepTemplates.filter((t) => t.id !== id);
    localStorage.setItem('sparkkeep_user_step_library', JSON.stringify(updated));
    setUserStepTemplates(updated);
    showToast(`Removed "${name}" from library`);
  };

  const handleOpenAddStepModal = () => {
    try {
      const raw = localStorage.getItem('sparkkeep_user_step_library');
      const parsed = raw ? JSON.parse(raw) : [];
      setUserStepTemplates(Array.isArray(parsed) ? parsed : []);
    } catch {
      setUserStepTemplates([]);
    }
    setIsAddStepOpen(true);
  };

  const handleExportJSON = () => {
    if (!editingPlaybook) return;
    exportPlaybookToFile(editingPlaybook);
    showToast('Playbook JSON exported');
  };

  const handleApplyImport = () => {
    setImportError(null);
    const { playbook, error } = parseImportedPlaybook(importJsonText, editingPlaybook);
    if (error || !playbook) {
      setImportError(error || 'Invalid JSON.');
      return;
    }
    setEditingPlaybook(playbook);
    setIsImportModalOpen(false);
    setImportJsonText('');
    showToast(`Successfully imported "${playbook.name}"`);
  };

  const handleSave = async () => {
    if (!editingPlaybook) return;
    if (validationErrors.length > 0) {
      setServerError(validationErrors[0]);
      return;
    }
    setSaving(true);
    setServerError(null);
    try {
      const savedPlaybook =
        editingPlaybook.id > 0
          ? await api.updatePlaybook(editingPlaybook.id, editingPlaybook)
          : await api.createPlaybook(editingPlaybook);

      showToast(`${editingPlaybook.id > 0 ? 'Saved' : 'Created'} playbook "${savedPlaybook.name}"`);
      const targetId = editingPlaybook.id > 0 ? editingPlaybook.id : savedPlaybook.id;
      if (isPlatformDefault) {
        await api.patchSettings({ default_playbook_id: targetId });
        setDefaultPlaybookId(targetId);
      }
      setEditingPlaybook(null);
      await loadData();
    } catch (err: unknown) {
      setServerError(api.getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const builtinPlaybooks = useMemo(() => playbooks.filter((p) => p.is_builtin), [playbooks]);
  const customPlaybooks = useMemo(() => playbooks.filter((p) => !p.is_builtin), [playbooks]);

  return (
    <div className="playbook-manager">
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
              onClick={() => setIsTemplateGalleryOpen(true)}
              title="Browse curated starter templates or clone a built-in playbook"
              aria-label="Load Template"
            >
              <Layers size={14} />
              <span>Load Template</span>
            </button>
            <button
              type="button"
              className={`btn-secondary ${inspectorTab === 'dryrun' ? 'active' : ''}`}
              onClick={() => setInspectorTab((prev) => (prev === 'dryrun' ? 'health' : 'dryrun'))}
              title="Toggle Dry-Run Prompt Inspector"
              aria-label="Dry-Run Inspector"
            >
              <Eye size={14} />
              <span>{inspectorTab === 'dryrun' ? 'Close Preview' : 'Dry-Run Preview'}</span>
            </button>
            <button type="button" className="btn-secondary" onClick={handleExportJSON} title="Export playbook as JSON file or copy to clipboard">
              <Download size={14} />
              <span>Export JSON</span>
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => { setImportError(null); setImportJsonText(''); setIsImportModalOpen(true); }}
              title="Import playbook from JSON"
            >
              <Upload size={14} />
              <span>Import JSON</span>
            </button>
            <button type="button" className="btn-secondary" onClick={() => { setEditingPlaybook(null); setServerError(null); }} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={handleSave} disabled={saving || validationErrors.length > 0}>
              <CheckCircle2 size={14} />
              <span>{saving ? 'Saving…' : 'Save Playbook'}</span>
            </button>
          </div>
        </div>
      )}

      {serverError && (
        <div className="pb-error-banner">
          <AlertCircle size={16} />
          <span>{serverError}</span>
        </div>
      )}

      {!editingPlaybook && (
        <div className="pb-list-container">
          {loading ? (
            <div className="pb-empty-state">Loading playbooks…</div>
          ) : playbooks.length === 0 ? (
            <div className="pb-empty-state">No playbooks found.</div>
          ) : (
            <>
              <div className="pb-default-selector-card">
                <div className="pb-default-info">
                  <span className="pb-default-label">Default Playbook for Untyped Cards</span>
                  <span className="pb-default-sub">
                    Runs automatically when researching cards without a type-specific playbook.
                  </span>
                </div>
                <select
                  className="input-select pb-default-dropdown"
                  value={defaultPlaybookId || 1}
                  onChange={(e) => handleDefaultPlaybookChange(parseInt(e.target.value, 10))}
                >
                  {playbooks.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.is_builtin ? '(Built-in)' : '(Custom)'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pb-section-header">Built-in Playbooks (Read-Only)</div>
              <div className="pb-cards-grid">
                {builtinPlaybooks.map((p) => (
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
                      <button type="button" className="btn-secondary btn-sm" onClick={() => handleDuplicate(p.id)} title="Duplicate to edit">
                        <Copy size={12} />
                        <span>Duplicate</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pb-section-header" style={{ marginTop: 24 }}>Custom Playbooks</div>
              <div className="pb-cards-grid">
                {customPlaybooks.length === 0 ? (
                  <div className="pb-empty-placeholder">
                    No custom playbooks yet. Duplicate a built-in or click "New Playbook" to start customizing!
                  </div>
                ) : (
                  customPlaybooks.map((p) => (
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
                        <button type="button" className="btn-secondary btn-sm" onClick={() => startEdit(p)}>
                          <Pencil size={12} />
                          <span>Edit</span>
                        </button>
                        <button type="button" className="btn-secondary btn-sm" onClick={() => handleDuplicate(p.id)} title="Duplicate">
                          <Copy size={12} />
                        </button>
                        <button type="button" className="btn-secondary btn-sm btn-danger" onClick={() => handleDelete(p.id, p.name)} title="Delete">
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

      {editingPlaybook && (
        <PlaybookCanvas
          playbook={editingPlaybook}
          onChangePlaybook={setEditingPlaybook}
          activeCardTypes={activeCardTypes}
          isPlatformDefault={isPlatformDefault}
          onPlatformDefaultChange={setIsPlatformDefault}
          validationErrors={validationErrors}
          expandedSteps={expandedSteps}
          onToggleExpandStep={(idx) => setExpandedSteps((prev) => ({ ...prev, [idx]: !prev[idx] }))}
          onSaveStepToLibrary={handleSaveStepToLibrary}
          onOpenAddStepModal={handleOpenAddStepModal}
          showToast={showToast}
          libraryTemplates={libraryTemplates}
          userStepTemplates={userStepTemplates}
          cards={cards}
          inspectorTab={inspectorTab}
          onInspectorTabChange={setInspectorTab}
        />
      )}

      <PlaybookTemplateGalleryModal
        isOpen={isTemplateGalleryOpen}
        onClose={() => setIsTemplateGalleryOpen(false)}
        builtinPlaybooks={builtinPlaybooks}
        onSelectTemplate={handleSelectTemplate}
        onCloneBuiltin={handleCloneBuiltin}
      />
      <ImportPlaybookModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        importJsonText={importJsonText}
        onImportJsonChange={setImportJsonText}
        importError={importError}
        onApplyImport={handleApplyImport}
      />
      <AddStepModal
        isOpen={isAddStepOpen}
        onClose={() => setIsAddStepOpen(false)}
        activeTab={addStepTab}
        onTabChange={setAddStepTab}
        libraryTemplates={libraryTemplates}
        userStepTemplates={userStepTemplates}
        onDeleteUserTemplate={handleDeleteUserTemplate}
        onAddLibraryStep={addLibraryStep}
        onAddBlankStep={addBlankCustomStep}
      />
    </div>
  );
};

export const PlaybookStudio = PlaybookManager;

