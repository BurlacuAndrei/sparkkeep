import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Save,
  AlertCircle,
  EyeOff,
  Eye,
  Palette,
  Cpu,
  Shield,
  Sliders,
  CheckCircle2,
  Lock,
  Sparkles,
  Plus,
  Trash2,
  Pencil,
  Star,
  Server,
} from 'lucide-react';
import * as api from '../api';
import { LLMProfile, LLMProfileInput } from '../types';
import { ThemeSelector } from './ThemeSelector';

export interface SettingsModalProps {
  onClose: () => void;
  showToast: (msg: string) => void;
}

type SettingsTab = 'appearance' | 'ai' | 'security';

interface PresetTemplate {
  label: string;
  name: string;
  base: string;
  model: string;
  requiresKey: boolean;
  desc: string;
}

const PRESET_TEMPLATES: PresetTemplate[] = [
  {
    label: 'OpenAI',
    name: 'OpenAI GPT-4o',
    base: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    requiresKey: true,
    desc: 'Cloud OpenAI inference',
  },
  {
    label: 'Groq',
    name: 'Groq Llama 3.3',
    base: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    requiresKey: true,
    desc: 'Ultra-fast LPU inference',
  },
  {
    label: 'Ollama',
    name: 'Ollama Local',
    base: 'http://localhost:11434/v1',
    model: 'llama3.2',
    requiresKey: false,
    desc: 'Self-hosted local models',
  },
  {
    label: 'LM Studio',
    name: 'LM Studio',
    base: 'http://localhost:1234/v1',
    model: 'local-model',
    requiresKey: false,
    desc: 'Local developer inference server',
  },
  {
    label: 'Custom',
    name: 'Custom Provider',
    base: '',
    model: '',
    requiresKey: false,
    desc: 'Custom OpenAI-compatible endpoint',
  },
];

export function SettingsModal({ onClose, showToast }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');

  // Backend AI settings & multi-LLM profiles
  const [profiles, setProfiles] = useState<LLMProfile[]>([]);

  // Multi-LLM form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formBase, setFormBase] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formKey, setFormKey] = useState('');
  const [formHasKey, setFormHasKey] = useState(false);
  const [formIsDefault, setFormIsDefault] = useState(false);
  const [formShowKey, setFormShowKey] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>('OpenAI');
  const [formError, setFormError] = useState<string | null>(null);
  const [savingForm, setSavingForm] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Backend Security settings
  const [authToken, setAuthToken] = useState('');
  const [confirmAuthToken, setConfirmAuthToken] = useState('');
  const [hasAuthToken, setHasAuthToken] = useState(false);
  const [showAuthToken, setShowAuthToken] = useState(false);

  // Dashboard display preferences (persisted locally)
  const [defaultView, setDefaultView] = useState<'kanban' | 'triage' | 'digest'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sparkkeep_default_view');
      if (saved === 'kanban' || saved === 'triage' || saved === 'digest') return saved;
    }
    return 'kanban';
  });

  const [cardDensity, setCardDensity] = useState<'comfortable' | 'compact'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sparkkeep_card_density');
      if (saved === 'comfortable' || saved === 'compact') return saved;
    }
    return 'comfortable';
  });

  const [reduceMotion, setReduceMotion] = useState<'default' | 'reduced'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sparkkeep_reduce_motion');
      if (saved === 'reduced') return 'reduced';
    }
    return 'default';
  });

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Load existing settings
  useEffect(() => {
    api.getSettings()
      .then((res) => {
        setHasAuthToken(Boolean(res.settings.has_auth_token));
        const profs = res.settings.llm_profiles || [];
        if (profs.length > 0) {
          setProfiles(profs);
        } else if (res.settings.llm_model) {
          setProfiles([{
            id: 'default',
            name: 'Default',
            base_url: res.settings.llm_base || '',
            model: res.settings.llm_model || '',
            has_key: Boolean(res.settings.has_llm_key),
            is_default: true,
          }]);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(api.getErrorMessage(err));
        setLoading(false);
      });
  }, []);

  const defaultProfile = profiles.find((p) => p.is_default) || profiles[0];

  const handleOpenAddForm = () => {
    setIsFormOpen(true);
    setEditingProfileId(null);
    setFormName('OpenAI GPT-4o');
    setFormBase('https://api.openai.com/v1');
    setFormModel('gpt-4o');
    setFormKey('');
    setFormHasKey(false);
    setFormIsDefault(profiles.length === 0);
    setFormShowKey(false);
    setSelectedPreset('OpenAI');
    setFormError(null);
  };

  const handleEditProfile = (profile: LLMProfile) => {
    setIsFormOpen(true);
    setEditingProfileId(profile.id);
    setFormName(profile.name);
    setFormBase(profile.base_url);
    setFormModel(profile.model);
    setFormKey('');
    setFormHasKey(profile.has_key);
    setFormIsDefault(profile.is_default);
    setFormShowKey(false);
    setFormError(null);
    const matched = PRESET_TEMPLATES.find(
      (pr) => pr.base === profile.base_url && pr.model === profile.model
    );
    setSelectedPreset(matched ? matched.label : 'Custom');
  };

  const handleSelectPreset = (preset: PresetTemplate) => {
    setSelectedPreset(preset.label);
    if (preset.label !== 'Custom') {
      setFormName(preset.name);
      setFormBase(preset.base);
      setFormModel(preset.model);
    }
  };

  const handleSetDefault = async (profile: LLMProfile) => {
    if (profile.is_default) return;
    setError(null);
    setActionLoading(profile.id);
    try {
      await api.patchSettings({ default_profile_id: profile.id });
      setProfiles((prev) =>
        prev.map((p) => ({
          ...p,
          is_default: p.id === profile.id,
        }))
      );
      showToast(`Switched active default model to "${profile.name || profile.model}".`);
    } catch (err: unknown) {
      setError(api.getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteProfile = async (profile: LLMProfile) => {
    if (profile.is_default) {
      setError('Cannot delete the active default model. Set another model as default first.');
      return;
    }
    setError(null);
    setActionLoading(profile.id);
    try {
      const remaining = profiles.filter((p) => p.id !== profile.id);
      await api.patchSettings({
        llm_profiles: remaining.map((p) => ({
          id: p.id,
          name: p.name,
          base_url: p.base_url,
          model: p.model,
          is_default: p.is_default,
        })),
      });
      setProfiles(remaining);
      showToast(`Removed model "${profile.name || profile.model}".`);
    } catch (err: unknown) {
      setError(api.getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveProfileForm = async () => {
    setFormError(null);
    const trimmedBase = formBase.trim();
    const trimmedModel = formModel.trim();
    const trimmedName = formName.trim() || trimmedModel || 'Custom Model';
    const trimmedKey = formKey.trim();

    if (!trimmedBase) {
      setFormError('API Base URL is required.');
      return;
    }
    if (!trimmedModel) {
      setFormError('Model name is required.');
      return;
    }

    setSavingForm(true);
    try {
      let payloadProfiles: LLMProfileInput[] = [];

      if (editingProfileId) {
        payloadProfiles = profiles.map((p) => {
          if (p.id === editingProfileId) {
            const entry: LLMProfileInput = {
              id: p.id,
              name: trimmedName,
              base_url: trimmedBase,
              model: trimmedModel,
              is_default: formIsDefault,
            };
            if (trimmedKey) {
              entry.api_key = trimmedKey;
            }
            return entry;
          }
          return {
            id: p.id,
            name: p.name,
            base_url: p.base_url,
            model: p.model,
            is_default: formIsDefault ? false : p.is_default,
          };
        });
      } else {
        const newId = `prof-${Date.now()}`;
        const existingInputs: LLMProfileInput[] = profiles.map((p) => ({
          id: p.id,
          name: p.name,
          base_url: p.base_url,
          model: p.model,
          is_default: formIsDefault ? false : p.is_default,
        }));
        const newEntry: LLMProfileInput = {
          id: newId,
          name: trimmedName,
          base_url: trimmedBase,
          model: trimmedModel,
          is_default: formIsDefault || profiles.length === 0,
        };
        if (trimmedKey) {
          newEntry.api_key = trimmedKey;
        }
        payloadProfiles = [...existingInputs, newEntry];
      }

      await api.patchSettings({ llm_profiles: payloadProfiles });

      // Refresh to ensure full synchronization with server
      const fresh = await api.getSettings();
      if (fresh.settings.llm_profiles) {
        setProfiles(fresh.settings.llm_profiles);
      }

      setIsFormOpen(false);
      setEditingProfileId(null);
      showToast(editingProfileId ? `Updated model "${trimmedName}".` : `Added model "${trimmedName}".`);
    } catch (err: unknown) {
      setFormError(api.getErrorMessage(err));
    } finally {
      setSavingForm(false);
    }
  };

  const handleSave = async () => {
    setError(null);

    // Validation for auth token update
    if (authToken.trim()) {
      if (authToken.trim().length < 6) {
        setError('Master access token must be at least 6 characters long.');
        setActiveTab('security');
        return;
      }
      if (authToken !== confirmAuthToken) {
        setError('Master passphrases do not match.');
        setActiveTab('security');
        return;
      }
    }

    setSubmitting(true);
    try {
      // Save display preferences locally
      if (typeof window !== 'undefined') {
        localStorage.setItem('sparkkeep_default_view', defaultView);
        localStorage.setItem('sparkkeep_card_density', cardDensity);
        localStorage.setItem('sparkkeep_reduce_motion', reduceMotion);
      }

      // Patch backend platform security if changed
      if (authToken.trim()) {
        await api.patchSettings({ auth_token: authToken.trim() });
      }

      showToast('Platform preferences saved successfully.');
      onClose();
    } catch (err: unknown) {
      setError(api.getErrorMessage(err));
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div
        className="settings-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="settings-modal-header">
          <div className="settings-title-group">
            <div className="settings-icon-badge">
              <Sliders size={20} strokeWidth={2} />
            </div>
            <div>
              <h2 id="settings-modal-title" className="settings-title">
                Platform Preferences
              </h2>
              <span className="settings-subtitle">
                Customize workspace appearance, AI models, and access security
              </span>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close settings"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="settings-tabs-nav" role="tablist" aria-label="Settings categories">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'appearance'}
            className={`settings-tab-btn ${activeTab === 'appearance' ? 'active' : ''}`}
            onClick={() => setActiveTab('appearance')}
          >
            <Palette size={15} />
            <span>Appearance & Preferences</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ai'}
            className={`settings-tab-btn ${activeTab === 'ai' ? 'active' : ''}`}
            onClick={() => setActiveTab('ai')}
          >
            <Cpu size={15} />
            <span>AI Engine</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'security'}
            className={`settings-tab-btn ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => setActiveTab('security')}
          >
            <Shield size={15} />
            <span>Security & Access</span>
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="setup-error-box" style={{ margin: '16px 24px 0' }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Modal Body */}
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-dim)' }}>
            Loading platform configuration...
          </div>
        ) : (
          <div className="settings-modal-body">
            {/* TAB 1: Appearance & Preferences */}
            {activeTab === 'appearance' && (
              <div className="settings-panel" role="tabpanel">
                {/* Theme Selector Section */}
                <div className="settings-section">
                  <div className="settings-section-header">
                    <span className="settings-section-title">Color Palette & Contrast</span>
                    <span className="settings-section-desc">
                      Select an accent palette and dark/light mode for your workspace
                    </span>
                  </div>
                  <ThemeSelector />
                </div>

                {/* Layout & Density Preferences */}
                <div className="settings-section">
                  <div className="settings-section-header">
                    <span className="settings-section-title">Layout & Usability</span>
                    <span className="settings-section-desc">
                      Configure default workspace view and item spacing
                    </span>
                  </div>

                  <div className="pref-item-card" style={{ marginBottom: '10px' }}>
                    <div className="pref-item-text">
                      <span className="pref-item-title">Default Dashboard View</span>
                      <span className="pref-item-desc">
                        Initial view shown when opening the dashboard
                      </span>
                    </div>
                    <select
                      value={defaultView}
                      onChange={(e) => setDefaultView(e.target.value as 'kanban' | 'triage' | 'digest')}
                      className="pref-select"
                      aria-label="Default dashboard view"
                    >
                      <option value="kanban">Kanban Board</option>
                      <option value="triage">Triage Inbox</option>
                      <option value="digest">Weekly Digest</option>
                    </select>
                  </div>

                  <div className="pref-item-card" style={{ marginBottom: '10px' }}>
                    <div className="pref-item-text">
                      <span className="pref-item-title">Card Density</span>
                      <span className="pref-item-desc">
                        Comfortable spacing vs compact overview
                      </span>
                    </div>
                    <select
                      value={cardDensity}
                      onChange={(e) => setCardDensity(e.target.value as 'comfortable' | 'compact')}
                      className="pref-select"
                      aria-label="Card density"
                    >
                      <option value="comfortable">Comfortable</option>
                      <option value="compact">Compact</option>
                    </select>
                  </div>

                  <div className="pref-item-card">
                    <div className="pref-item-text">
                      <span className="pref-item-title">Visual Effects</span>
                      <span className="pref-item-desc">
                        Glassmorphism blurs and transitions
                      </span>
                    </div>
                    <select
                      value={reduceMotion}
                      onChange={(e) => setReduceMotion(e.target.value as 'default' | 'reduced')}
                      className="pref-select"
                      aria-label="Visual effects"
                    >
                      <option value="default">Full Glassmorphism</option>
                      <option value="reduced">Reduced Blur & Motion</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: AI Engine Multi-Model Manager */}
            {activeTab === 'ai' && (
              <div className="settings-panel" role="tabpanel">
                <div className="llm-manager-section">
                  {/* Active AI Status Banner */}
                  <div className="settings-status-card">
                    <div className="settings-status-info">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="settings-status-title">Active AI Provider</span>
                        {defaultProfile && (
                          <span className="llm-badge-default">
                            <Sparkles size={11} /> DEFAULT
                          </span>
                        )}
                      </div>
                      <span className="settings-status-sub">
                        {defaultProfile ? (
                          <>
                            <strong>{defaultProfile.name || defaultProfile.model}</strong> &bull;{' '}
                            <span style={{ fontFamily: 'var(--font-mono)' }}>{defaultProfile.model}</span>
                          </>
                        ) : (
                          'No default model configured'
                        )}
                      </span>
                    </div>
                    <span className={`settings-badge ${defaultProfile?.has_key ? 'success' : 'neutral'}`}>
                      {defaultProfile?.has_key ? (
                        <>
                          <CheckCircle2 size={12} /> Key Configured
                        </>
                      ) : (
                        'No Key / Local'
                      )}
                    </span>
                  </div>

                  {/* Header Row with Add Model Button */}
                  <div className="llm-header-row">
                    <div className="llm-header-title">
                      <Server size={16} />
                      <span>Configured Models</span>
                      <span className="llm-count-badge">{profiles.length}</span>
                    </div>
                    {!isFormOpen && (
                      <button
                        type="button"
                        className="btn-add-model"
                        onClick={handleOpenAddForm}
                      >
                        <Plus size={14} />
                        <span>Add Model</span>
                      </button>
                    )}
                  </div>

                  {/* Add / Edit Form Card */}
                  {isFormOpen && (
                    <div className="llm-form-card">
                      <div className="llm-form-header">
                        <span className="llm-form-title">
                          {editingProfileId ? 'Edit Model Profile' : 'Add Model Profile'}
                        </span>
                        <button
                          type="button"
                          className="modal-close-btn"
                          onClick={() => {
                            setIsFormOpen(false);
                            setEditingProfileId(null);
                            setFormError(null);
                          }}
                          aria-label="Cancel"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      {formError && (
                        <div className="setup-error-box" style={{ margin: 0 }}>
                          <AlertCircle size={16} />
                          <span>{formError}</span>
                        </div>
                      )}

                      {/* Preset Templates */}
                      <div className="ai-presets-box">
                        <span className="ai-presets-label">Preset Templates</span>
                        <div className="llm-presets-selector">
                          {PRESET_TEMPLATES.map((preset) => (
                            <button
                              key={preset.label}
                              type="button"
                              className={`llm-preset-chip ${selectedPreset === preset.label ? 'active' : ''}`}
                              onClick={() => handleSelectPreset(preset)}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="setup-form-group">
                        <label htmlFor="llm-form-name">Profile Display Name</label>
                        <input
                          id="llm-form-name"
                          type="text"
                          value={formName}
                          onChange={(e) => setFormName(e.target.value)}
                          className="setup-input"
                          placeholder="e.g. OpenAI GPT-4o, Ollama Local"
                        />
                      </div>

                      <div className="setup-form-group">
                        <label htmlFor="llm-form-base">API Base URL</label>
                        <input
                          id="llm-form-base"
                          type="text"
                          value={formBase}
                          onChange={(e) => setFormBase(e.target.value)}
                          className="setup-input"
                          placeholder="https://api.openai.com/v1"
                          required
                        />
                      </div>

                      <div className="setup-form-group">
                        <label htmlFor="llm-form-model">Model Name</label>
                        <input
                          id="llm-form-model"
                          type="text"
                          value={formModel}
                          onChange={(e) => setFormModel(e.target.value)}
                          className="setup-input"
                          placeholder="e.g. gpt-4o or llama-3.3-70b-versatile"
                          required
                        />
                      </div>

                      <div className="setup-form-group">
                        <label htmlFor="llm-form-key">
                          API Key {formHasKey ? '(Leave blank to retain active key)' : '(Optional for local endpoints)'}
                        </label>
                        <div className="setup-input-wrapper">
                          <input
                            id="llm-form-key"
                            type={formShowKey ? 'text' : 'password'}
                            value={formKey}
                            onChange={(e) => setFormKey(e.target.value)}
                            className="setup-input"
                            placeholder={formHasKey ? '•••••••••••••••• (Encrypted in SQLite)' : 'sk-...'}
                          />
                          <button
                            type="button"
                            className="setup-eye-btn"
                            onClick={() => setFormShowKey(!formShowKey)}
                            aria-label={formShowKey ? 'Hide API key' : 'Show API key'}
                            tabIndex={-1}
                          >
                            {formShowKey ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>

                      <label className="llm-checkbox-label">
                        <input
                          type="checkbox"
                          checked={formIsDefault}
                          onChange={(e) => setFormIsDefault(e.target.checked)}
                          disabled={editingProfileId ? profiles.find(p => p.id === editingProfileId)?.is_default : false}
                        />
                        <span>Make this the active default model</span>
                      </label>

                      <div className="llm-form-actions">
                        <button
                          type="button"
                          className="setup-btn-secondary"
                          onClick={() => {
                            setIsFormOpen(false);
                            setEditingProfileId(null);
                            setFormError(null);
                          }}
                          disabled={savingForm}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="setup-btn-primary"
                          onClick={handleSaveProfileForm}
                          disabled={savingForm}
                        >
                          <Save size={14} />
                          <span>{savingForm ? 'Saving...' : editingProfileId ? 'Update Model' : 'Save Model'}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* List of Configured Profiles */}
                  <div className="llm-profiles-list">
                    {profiles.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-dim)', border: '1px dashed var(--border-subtle)', borderRadius: '10px' }}>
                        No LLM profiles configured yet. Click "Add Model" above to get started.
                      </div>
                    ) : (
                      profiles.map((profile) => (
                        <div
                          key={profile.id}
                          className={`llm-profile-card ${profile.is_default ? 'is-default' : ''}`}
                        >
                          <div className="llm-profile-main">
                            <div className="llm-profile-top">
                              <span className="llm-profile-name">{profile.name || profile.model}</span>
                              {profile.is_default && (
                                <span className="llm-badge-default">
                                  <Sparkles size={11} /> DEFAULT
                                </span>
                              )}
                              <span className={`llm-badge-key ${profile.has_key ? 'has-key' : ''}`}>
                                <Lock size={10} /> {profile.has_key ? 'Key Configured' : 'No Key / Local'}
                              </span>
                            </div>
                            <div className="llm-profile-meta">
                              <span className="llm-model-pill">{profile.model}</span>
                              <span className="llm-profile-url" title={profile.base_url}>
                                {profile.base_url}
                              </span>
                            </div>
                          </div>

                          <div className="llm-profile-actions">
                            {!profile.is_default && (
                              <button
                                type="button"
                                className="btn-set-default"
                                onClick={() => handleSetDefault(profile)}
                                disabled={actionLoading !== null}
                                title="Set as active default model"
                              >
                                <Star size={13} />
                                <span>Set as Default</span>
                              </button>
                            )}

                            <button
                              type="button"
                              className="btn-icon-action"
                              onClick={() => handleEditProfile(profile)}
                              title="Edit profile"
                              disabled={actionLoading !== null}
                              aria-label={`Edit ${profile.name}`}
                            >
                              <Pencil size={14} />
                            </button>

                            {!profile.is_default ? (
                              <button
                                type="button"
                                className="btn-icon-action delete"
                                onClick={() => handleDeleteProfile(profile)}
                                title="Delete profile"
                                disabled={actionLoading !== null}
                                aria-label={`Delete ${profile.name}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn-icon-action"
                                disabled
                                title="Active default model cannot be deleted"
                                aria-label="Active default model cannot be deleted"
                              >
                                <Trash2 size={14} style={{ opacity: 0.3 }} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="setup-info-box">
                    <Lock size={16} />
                    <span>
                      Keys, endpoints, and models are securely stored in your local SQLite database. Default model switches apply immediately to background triage and research.
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: Security & Access */}
            {activeTab === 'security' && (
              <div className="settings-panel" role="tabpanel">
                {/* Security Status Card */}
                <div className="settings-status-card">
                  <div className="settings-status-info">
                    <span className="settings-status-title">Instance Protection</span>
                    <span className="settings-status-sub">
                      Master passphrase required to unlock the dashboard and query APIs
                    </span>
                  </div>
                  <span className={`settings-badge ${hasAuthToken ? 'success' : 'neutral'}`}>
                    <Shield size={12} />
                    {hasAuthToken ? 'Passphrase Protected' : 'Open Access'}
                  </span>
                </div>

                {/* New Master Token */}
                <div className="setup-form-group">
                  <label htmlFor="settings-auth-token">
                    New Master Passphrase {hasAuthToken ? '(Leave blank to retain current)' : ''}
                  </label>
                  <div className="setup-input-wrapper">
                    <input
                      id="settings-auth-token"
                      type={showAuthToken ? 'text' : 'password'}
                      value={authToken}
                      onChange={(e) => setAuthToken(e.target.value)}
                      className="setup-input"
                      placeholder={hasAuthToken ? 'Enter new passphrase to replace existing...' : 'Create master passphrase...'}
                    />
                    <button
                      type="button"
                      className="setup-eye-btn"
                      onClick={() => setShowAuthToken(!showAuthToken)}
                      aria-label={showAuthToken ? 'Hide passphrase' : 'Show passphrase'}
                      tabIndex={-1}
                    >
                      {showAuthToken ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Confirm Token */}
                {authToken.trim().length > 0 && (
                  <div className="setup-form-group">
                    <label htmlFor="settings-confirm-token">Confirm New Passphrase</label>
                    <input
                      id="settings-confirm-token"
                      type={showAuthToken ? 'text' : 'password'}
                      value={confirmAuthToken}
                      onChange={(e) => setConfirmAuthToken(e.target.value)}
                      className="setup-input"
                      placeholder="Re-type new passphrase to confirm..."
                    />
                  </div>
                )}

                <div className="setup-info-box">
                  <AlertCircle size={16} />
                  <span>
                    Updating your master passphrase will invalidate active tokens across other browser tabs and sessions.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="settings-modal-footer">
          <button type="button" className="setup-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="setup-btn-primary"
            onClick={handleSave}
            disabled={submitting || loading}
          >
            <Save size={16} />
            <span>{submitting ? 'Saving Preferences...' : 'Save Settings'}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
