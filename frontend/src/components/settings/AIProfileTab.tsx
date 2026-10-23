import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  Lock,
  Network,
  Pencil,
  Plus,
  Server,
  Sparkles,
  Star,
  Trash2,
  X,
  Save,
  Sliders,
} from 'lucide-react';
import * as api from '../../api';
import { LLMProfile, LLMProfileInput } from '../../types';
import { useLocale } from '../../i18n';
import { CustomSelect } from '../CustomSelect';
import {
  ROLE_DEFINITIONS,
  DEFAULT_TOKEN_CAPS,
  PresetTemplate,
  PRESET_TEMPLATES,
} from './constants';

export interface AIProfileTabProps {
  profiles: LLMProfile[];
  setProfiles: React.Dispatch<React.SetStateAction<LLMProfile[]>>;
  llmRoles: Record<string, string>;
  setLlmRoles: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  tokenCaps?: Record<string, number>;
  setTokenCaps?: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  showToast: (msg: string) => void;
  onError?: (err: string | null) => void;
  onDirtyChange?: () => void;
}

export const AIProfileTab: React.FC<AIProfileTabProps> = ({
  profiles,
  setProfiles,
  llmRoles,
  setLlmRoles,
  tokenCaps = DEFAULT_TOKEN_CAPS,
  setTokenCaps,
  showToast,
  onError,
  onDirtyChange,
}) => {
  const { t, formatNumber } = useLocale();
  // Add/Edit Profile Form state
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
    if (onError) onError(null);
    setActionLoading(profile.id);
    try {
      await api.patchSettings({ default_profile_id: profile.id });
      setProfiles((prev) =>
        prev.map((p) => ({
          ...p,
          is_default: p.id === profile.id,
        }))
      );
      showToast(t('settings.ai.toast.switchedDefault', { name: profile.name || profile.model }));
      onDirtyChange?.();
    } catch (err: unknown) {
      if (onError) onError(api.getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteProfile = async (profile: LLMProfile) => {
    if (profile.is_default) {
      if (onError) onError(t('settings.validation.cannotDeleteDefault'));
      return;
    }
    if (onError) onError(null);
    setActionLoading(profile.id);
    try {
      const remaining = profiles.filter((p) => p.id !== profile.id);
      const newRoles = { ...llmRoles };
      let rolesCleaned = false;
      for (const [r, pid] of Object.entries(newRoles)) {
        if (pid === profile.id) {
          delete newRoles[r];
          rolesCleaned = true;
        }
      }
      if (rolesCleaned) {
        setLlmRoles(newRoles);
      }
      await api.patchSettings({
        llm_profiles: remaining.map((p) => ({
          id: p.id,
          name: p.name,
          base_url: p.base_url,
          model: p.model,
          is_default: p.is_default,
        })),
        llm_roles: newRoles,
      });
      setProfiles(remaining);
      showToast(t('settings.ai.toast.removed', { name: profile.name || profile.model }));
      onDirtyChange?.();
    } catch (err: unknown) {
      if (onError) onError(api.getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleRoleChange = async (roleKey: string, profileId: string) => {
    if (onError) onError(null);
    const newRoles = { ...llmRoles };
    if (!profileId) {
      delete newRoles[roleKey];
    } else {
      newRoles[roleKey] = profileId;
    }
    setLlmRoles(newRoles);
    try {
      await api.patchSettings({ llm_roles: newRoles });
      const roleDef = ROLE_DEFINITIONS.find((r) => r.key === roleKey);
      showToast(
        t('settings.ai.toast.assignedRole', {
          role: roleDef ? t(roleDef.labelKey) : roleKey,
        })
      );
      onDirtyChange?.();
    } catch (err: unknown) {
      if (onError) onError(api.getErrorMessage(err));
    }
  };

  const handleTokenCapChange = async (roleKey: string, capValue: number) => {
    if (onError) onError(null);
    const validCap = Math.max(256, Math.min(65536, capValue || DEFAULT_TOKEN_CAPS[roleKey] || 4096));
    const newCaps = { ...tokenCaps, [roleKey]: validCap };
    if (setTokenCaps) {
      setTokenCaps(newCaps);
    }
    try {
      await api.patchSettings({ llm_token_caps: newCaps });
      const roleDef = ROLE_DEFINITIONS.find((r) => r.key === roleKey);
      showToast(
        t('settings.ai.toast.tokenCapUpdated', {
          role: roleDef ? t(roleDef.labelKey) : roleKey,
          cap: validCap,
        })
      );
      onDirtyChange?.();
    } catch (err: unknown) {
      if (onError) onError(api.getErrorMessage(err));
    }
  };

  const handleSaveProfileForm = async () => {
    setFormError(null);
    const trimmedBase = formBase.trim();
    const trimmedModel = formModel.trim();
    const trimmedName = formName.trim() || trimmedModel || 'Custom Model';
    const trimmedKey = formKey.trim();

    if (!trimmedBase) {
      setFormError(t('settings.validation.baseUrlRequired'));
      return;
    }
    if (!trimmedModel) {
      setFormError(t('settings.validation.modelRequired'));
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
      showToast(
        editingProfileId
          ? t('settings.ai.toast.updated', { name: trimmedName })
          : t('settings.ai.toast.added', { name: trimmedName })
      );
      onDirtyChange?.();
    } catch (err: unknown) {
      setFormError(api.getErrorMessage(err));
    } finally {
      setSavingForm(false);
    }
  };

  return (
    <div className="settings-panel" role="tabpanel">
      <div className="llm-manager-section">
        {/* Active AI Status Banner */}
        <div className="settings-status-card">
          <div className="settings-status-info">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="settings-status-title">{t('settings.ai.status.title')}</span>
              {defaultProfile && (
                <span className="llm-badge-default">
                  <Sparkles size={11} /> {t('settings.ai.status.defaultBadge')}
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
                t('settings.ai.status.noDefault')
              )}
            </span>
          </div>
          <span className={`settings-badge ${defaultProfile?.has_key ? 'success' : 'neutral'}`}>
            {defaultProfile?.has_key ? (
              <>
                <CheckCircle2 size={12} /> {t('settings.ai.status.keyConfigured')}
              </>
            ) : (
              t('settings.ai.status.noKey')
            )}
          </span>
        </div>

        {/* Header Row with Add Model Button */}
        <div className="llm-header-row">
          <div className="llm-header-title">
            <Server size={16} />
            <span>{t('settings.ai.models.title')}</span>
            <span className="llm-count-badge">{profiles.length}</span>
          </div>
          {!isFormOpen && (
            <button
              type="button"
              className="btn-add-model"
              onClick={handleOpenAddForm}
            >
              <Plus size={14} />
              <span>{t('settings.ai.models.add')}</span>
            </button>
          )}
        </div>

        {/* Add / Edit Form Card */}
        {isFormOpen && (
          <div className="llm-form-card">
            <div className="llm-form-header">
              <span className="llm-form-title">
                {editingProfileId ? t('settings.ai.form.editTitle') : t('settings.ai.form.addTitle')}
              </span>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => {
                  setIsFormOpen(false);
                  setEditingProfileId(null);
                  setFormError(null);
                }}
                aria-label={t('common.cancel')}
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
            <div className="setup-form-group">
              <label htmlFor="ai-preset-select">{t('settings.ai.form.preset')}</label>
              <CustomSelect
                id="ai-preset-select"
                value={selectedPreset}
                onChange={(val) => {
                  const preset = PRESET_TEMPLATES.find((p) => p.label === val);
                  if (preset) handleSelectPreset(preset);
                }}
                options={PRESET_TEMPLATES.map((preset) => ({
                  value: preset.label,
                  label: preset.label,
                }))}
                ariaLabel={t('settings.ai.form.preset')}
              />
            </div>

            <div className="setup-form-group">
              <label htmlFor="llm-form-name">{t('settings.ai.form.name')}</label>
              <input
                id="llm-form-name"
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="setup-input"
                placeholder={t('settings.ai.form.namePlaceholder')}
              />
            </div>

            <div className="setup-form-group">
              <label htmlFor="llm-form-base">{t('settings.ai.form.base')}</label>
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
              <label htmlFor="llm-form-model">{t('settings.ai.form.model')}</label>
              <input
                id="llm-form-model"
                type="text"
                value={formModel}
                onChange={(e) => setFormModel(e.target.value)}
                className="setup-input"
                placeholder={t('settings.ai.form.modelPlaceholder')}
                required
              />
            </div>

            <div className="setup-form-group">
              <label htmlFor="llm-form-key">
                {t('settings.ai.form.apiKey')}{' '}
                {formHasKey ? t('settings.ai.form.keyRetain') : t('settings.ai.form.keyOptional')}
              </label>
              <div className="setup-input-wrapper">
                <input
                  id="llm-form-key"
                  type={formShowKey ? 'text' : 'password'}
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value)}
                  className="setup-input"
                  placeholder={formHasKey ? t('settings.ai.form.keyPlaceholderEncrypted') : 'sk-...'}
                />
                <button
                  type="button"
                  className="setup-eye-btn"
                  onClick={() => setFormShowKey(!formShowKey)}
                  aria-label={
                    formShowKey ? t('common.hideCredential') : t('common.showCredential')
                  }
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
              <span>{t('settings.ai.form.setDefault')}</span>
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
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="setup-btn-primary"
                onClick={handleSaveProfileForm}
                disabled={savingForm}
              >
                <Save size={14} />
                <span>
                  {savingForm
                    ? t('common.saving')
                    : editingProfileId
                    ? t('settings.ai.form.update')
                    : t('settings.ai.form.save')}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* List of Configured Profiles */}
        <div className="llm-profiles-list">
          {profiles.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-dim)', border: '1px dashed var(--border-subtle)', borderRadius: '10px' }}>
              {t('settings.ai.empty')}
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
                        <Sparkles size={11} /> {t('settings.ai.status.defaultBadge')}
                      </span>
                    )}
                    <span className={`llm-badge-key ${profile.has_key ? 'has-key' : ''}`}>
                      <Lock size={10} />{' '}
                      {profile.has_key ? t('settings.ai.status.keyConfigured') : t('settings.ai.status.noKey')}
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
                      title={t('settings.ai.actions.setDefaultTitle')}
                    >
                      <Star size={13} />
                      <span>{t('settings.ai.actions.setDefault')}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn-icon-action"
                    onClick={() => handleEditProfile(profile)}
                    title={t('settings.ai.actions.edit')}
                    disabled={actionLoading !== null}
                    aria-label={t('settings.ai.actions.editAria', { name: profile.name })}
                  >
                    <Pencil size={14} />
                  </button>

                  {!profile.is_default ? (
                    <button
                      type="button"
                      className="btn-icon-action delete"
                      onClick={() => handleDeleteProfile(profile)}
                      title={t('settings.ai.actions.delete')}
                      disabled={actionLoading !== null}
                      aria-label={t('settings.ai.actions.deleteAria', { name: profile.name })}
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-icon-action"
                      disabled
                      title={t('settings.ai.actions.cannotDelete')}
                      aria-label={t('settings.ai.actions.cannotDelete')}
                    >
                      <Trash2 size={14} style={{ opacity: 0.3 }} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Model Routing ("Use for") Section */}
        <div className="llm-roles-section" style={{ marginTop: '20px' }}>
          <div className="llm-header-row" style={{ marginBottom: '8px' }}>
            <div className="llm-header-title">
              <Network size={16} />
              <span>{t('settings.ai.roles.title')}</span>
            </div>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-dim)', margin: '0 0 12px 0', lineHeight: 1.5 }}>
            {t('settings.ai.roles.desc')}
          </p>

          <div className="llm-roles-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {ROLE_DEFINITIONS.map((role) => {
              const currentProfileId = llmRoles[role.key] || '';
              return (
                <div key={role.key} className="pref-item-card">
                  <div className="pref-item-text" style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span className="pref-item-title">{t(role.labelKey)}</span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '1px 6px',
                          borderRadius: '4px',
                          backgroundColor: role.isStrong
                            ? 'rgba(234, 179, 8, 0.15)'
                            : 'rgba(16, 185, 129, 0.15)',
                          color: role.isStrong
                            ? 'var(--accent-amber, #eab308)'
                            : 'var(--accent-emerald, #10b981)',
                          border: role.isStrong
                            ? '1px solid rgba(234, 179, 8, 0.3)'
                            : '1px solid rgba(16, 185, 129, 0.3)',
                        }}
                      >
                        {t(role.hintKey)}
                      </span>
                    </div>
                    <span className="pref-item-desc" style={{ marginTop: '3px' }}>
                      {t(role.descriptionKey)}
                    </span>
                  </div>

                  <div style={{ minWidth: '180px', maxWidth: '240px' }}>
                    <CustomSelect
                      value={currentProfileId}
                      onChange={(val) => handleRoleChange(role.key, val)}
                      options={[
                        {
                          value: '',
                          label: t('settings.ai.roles.defaultOption', {
                            name:
                              defaultProfile?.name ||
                              defaultProfile?.model ||
                              t('settings.ai.roles.defaultActive'),
                          }),
                        },
                        ...profiles.map((p) => ({
                          value: p.id,
                          label: `${p.name || p.model}${p.is_default ? ` ${t('settings.ai.roles.modelDefaultSuffix')}` : ''}`,
                        })),
                      ]}
                      disabled={actionLoading !== null}
                      ariaLabel={t('settings.ai.roles.selectAria', { role: t(role.labelKey) })}
                      size="sm"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Token Caps Section */}
        <div className="llm-roles-section" style={{ marginTop: '24px' }}>
          <div className="llm-header-row" style={{ marginBottom: '8px' }}>
            <div className="llm-header-title">
              <Sliders size={16} />
              <span>{t('settings.ai.tokenCaps.title')}</span>
            </div>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-dim)', margin: '0 0 12px 0', lineHeight: 1.5 }}>
            {t('settings.ai.tokenCaps.desc')}
          </p>

          <div className="llm-roles-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {ROLE_DEFINITIONS.map((role) => {
              const currentCap = tokenCaps[role.key] ?? DEFAULT_TOKEN_CAPS[role.key] ?? 4096;
              const defaultCap = DEFAULT_TOKEN_CAPS[role.key] ?? 4096;
              return (
                <div key={`cap-${role.key}`} className="pref-item-card">
                  <div className="pref-item-text" style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="pref-item-title">{t(role.labelKey)}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {t('settings.ai.tokenCaps.default', { count: formatNumber(defaultCap) })}
                      </span>
                    </div>
                    <span className="pref-item-desc" style={{ marginTop: '2px' }}>
                      {t('settings.ai.tokenCaps.perRole', { role: t(role.labelKey) })}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="number"
                      min={256}
                      max={32768}
                      step={256}
                      value={currentCap}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) {
                          handleTokenCapChange(role.key, val);
                        }
                      }}
                      className="setup-input"
                      style={{ width: '110px', textAlign: 'right', padding: '6px 10px', fontSize: '13px' }}
                      aria-label={t('settings.ai.tokenCaps.aria', { role: t(role.labelKey) })}
                    />
                    <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{t('settings.ai.tokenCaps.unit')}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="setup-info-box" style={{ marginTop: '20px' }}>
          <Cpu size={16} />
          <span>
            {t('settings.ai.info')}
          </span>
        </div>
      </div>
    </div>
  );
};
