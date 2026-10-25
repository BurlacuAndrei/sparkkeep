import React, { useState } from 'react';
import { Shield, Sparkles, Save, User, Globe } from 'lucide-react';
import * as api from '../../api';
import { useLocale } from '../../i18n';
import type { TranslationKey } from '../../i18n';
import { LANGUAGE_OPTIONS, PROFILE_ARCHETYPES, ProfileArchetype } from './constants';
import { CustomSelect } from '../CustomSelect';

const LANGUAGE_LABEL_KEYS: Record<string, TranslationKey> = {
  'Same as source / English': 'settings.profile.languages.sameAsSource',
  English: 'settings.profile.languages.english',
  Spanish: 'settings.profile.languages.spanish',
  German: 'settings.profile.languages.german',
  French: 'settings.profile.languages.french',
  Italian: 'settings.profile.languages.italian',
  Portuguese: 'settings.profile.languages.portuguese',
  Japanese: 'settings.profile.languages.japanese',
  Chinese: 'settings.profile.languages.chinese',
  Romanian: 'settings.profile.languages.romanian',
};

export interface UserProfileTabProps {
  goals: string;
  setGoals: (val: string) => void;
  skills: string;
  setSkills: (val: string) => void;
  stack: string;
  setStack: (val: string) => void;
  interests: string;
  setInterests: (val: string) => void;
  constraints: string;
  setConstraints: (val: string) => void;
  language: string;
  setLanguage: (val: string) => void;
  showToast: (msg: string) => void;
  onError?: (err: string | null) => void;
  onDirtyChange?: () => void;
}

export const UserProfileTab: React.FC<UserProfileTabProps> = ({
  goals,
  setGoals,
  skills,
  setSkills,
  stack,
  setStack,
  interests,
  setInterests,
  constraints,
  setConstraints,
  language,
  setLanguage,
  showToast,
  onError,
  onDirtyChange,
}) => {
  const { t } = useLocale();
  const [savingProfile, setSavingProfile] = useState(false);

  const parseTags = (str: string) =>
    str
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const profileCharCount =
    goals.length +
    constraints.length +
    (language && language !== 'Same as source / English' ? language.length : 0) +
    parseTags(skills).join('').length +
    parseTags(stack).join('').length +
    parseTags(interests).join('').length;

  const handleApplyArchetype = (archetype: ProfileArchetype) => {
    setGoals(archetype.goalsKey ? t(archetype.goalsKey) : archetype.goals);
    setSkills(archetype.skillsKey ? t(archetype.skillsKey) : archetype.skills);
    setStack(archetype.stackKey ? t(archetype.stackKey) : archetype.stack);
    setInterests(archetype.interestsKey ? t(archetype.interestsKey) : archetype.interests);
    setConstraints(archetype.constraintsKey ? t(archetype.constraintsKey) : archetype.constraints);
    onDirtyChange?.();
    showToast(t('settings.profile.toast.archetypeLoaded', { name: t(archetype.labelKey) }));
  };

  const handleSaveProfile = async () => {
    if (profileCharCount > 1500) {
      if (onError) {
        onError(t('settings.validation.profileTooLong'));
      }
      return;
    }
    if (onError) onError(null);
    setSavingProfile(true);
    try {
      const trimmedLang = language.trim();
      const finalLang =
        trimmedLang === 'Same as source / English' || trimmedLang === 'Custom' ? '' : trimmedLang;

      await api.patchSettings({
        user_profile: {
          goals: goals.trim(),
          skills: parseTags(skills),
          stack: parseTags(stack),
          interests: parseTags(interests),
          constraints: constraints.trim(),
          language: finalLang,
        },
      });
      showToast(t('settings.profile.toast.saved'));
      onDirtyChange?.();
    } catch (err: unknown) {
      if (onError) onError(api.getErrorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="settings-panel" role="tabpanel">
      <div className="settings-section">
        <div className="settings-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User size={18} style={{ color: 'var(--accent)' }} />
            <span className="settings-section-title">{t('settings.profile.title')}</span>
          </div>
          <span className="settings-section-desc">
            {t('settings.profile.desc')}
          </span>
        </div>

        {/* Privacy Note */}
        <div className="setup-info-box" style={{ marginBottom: '16px' }}>
          <Shield size={16} />
          <span>
            <strong>{t('settings.profile.privacyTitle')}</strong> {t('settings.profile.privacyNote')}
          </span>
        </div>

        {/* Archetype Quick Selectors */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {t('settings.profile.archetypes.title')}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {t('settings.profile.archetypes.hint')}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {PROFILE_ARCHETYPES.map((arch) => (
              <button
                key={arch.id}
                data-testid={`archetype-${arch.id}`}
                type="button"
                className="archetype-preset-chip"
                onClick={() => handleApplyArchetype(arch)}
                title={t(arch.descriptionKey)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  borderRadius: '20px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-input, rgba(255,255,255,0.04))',
                  color: 'var(--text-main)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{t(arch.badgeKey)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Character Counter Meter */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 14px',
            background: 'var(--surface-sunken, #121217)',
            border: '1px solid var(--border-subtle, #272732)',
            borderRadius: 'var(--radius-md, 8px)',
            marginBottom: '16px',
            fontSize: '0.85rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={15} style={{ color: 'var(--accent, #6366f1)' }} />
            <span style={{ color: 'var(--text-secondary, #94a3b8)' }}>{t('settings.profile.budget.title')}</span>
          </div>
          <span
            style={{
              fontWeight: 600,
              color:
                profileCharCount > 1500
                  ? 'var(--color-error, #ef4444)'
                  : profileCharCount > 1200
                  ? 'var(--color-warning, #f59e0b)'
                  : 'var(--text-muted, #64748b)',
            }}
          >
            {t('settings.profile.budget.counter', { count: profileCharCount })}{' '}
            {profileCharCount > 1500 ? t('settings.profile.budget.exceeds') : ''}
          </span>
        </div>

        {/* Goals */}
        <div className="setup-form-group">
          <label htmlFor="profile-goals">{t('settings.profile.goals.label')}</label>
          <textarea
            id="profile-goals"
            className="setup-textarea"
            rows={5}
            value={goals}
            onChange={(e) => {
              setGoals(e.target.value);
              onDirtyChange?.();
            }}
            placeholder={t('settings.profile.goals.placeholder')}
          />
          <span className="setup-hint">
            {t('settings.profile.goals.hint')}
          </span>
        </div>

        {/* Skills */}
        <div className="setup-form-group">
          <label htmlFor="profile-skills">{t('settings.profile.skills.label')}</label>
          <input
            id="profile-skills"
            type="text"
            className="setup-input"
            value={skills}
            onChange={(e) => {
              setSkills(e.target.value);
              onDirtyChange?.();
            }}
            placeholder={t('settings.profile.skills.placeholder')}
          />
          <span className="setup-hint">
            {t('settings.profile.skills.hint')}
          </span>
        </div>

        {/* Stack & Tools */}
        <div className="setup-form-group">
          <label htmlFor="profile-stack">{t('settings.profile.stack.label')}</label>
          <input
            id="profile-stack"
            type="text"
            className="setup-input"
            value={stack}
            onChange={(e) => {
              setStack(e.target.value);
              onDirtyChange?.();
            }}
            placeholder={t('settings.profile.stack.placeholder')}
          />
          <span className="setup-hint">
            {t('settings.profile.stack.hint')}
          </span>
        </div>

        {/* Interests */}
        <div className="setup-form-group">
          <label htmlFor="profile-interests">{t('settings.profile.interests.label')}</label>
          <input
            id="profile-interests"
            type="text"
            className="setup-input"
            value={interests}
            onChange={(e) => {
              setInterests(e.target.value);
              onDirtyChange?.();
            }}
            placeholder={t('settings.profile.interests.placeholder')}
          />
          <span className="setup-hint">
            {t('settings.profile.interests.hint')}
          </span>
        </div>

        {/* Constraints */}
        <div className="setup-form-group">
          <label htmlFor="profile-constraints">{t('settings.profile.constraints.label')}</label>
          <textarea
            id="profile-constraints"
            className="setup-textarea"
            rows={3}
            value={constraints}
            onChange={(e) => {
              setConstraints(e.target.value);
              onDirtyChange?.();
            }}
            placeholder={t('settings.profile.constraints.placeholder')}
          />
          <span className="setup-hint">
            {t('settings.profile.constraints.hint')}
          </span>
        </div>

        {/* Output Language */}
        <div className="setup-form-group">
          <label htmlFor="profile-language-select">{t('settings.profile.language.label')}</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ minWidth: '240px', flex: '0 0 auto' }}>
              <CustomSelect
                id="profile-language-select"
                value={LANGUAGE_OPTIONS.includes(language) ? language : 'Custom'}
                onChange={(val) => {
                  if (val !== 'Custom') {
                    setLanguage(val);
                    onDirtyChange?.();
                  } else {
                    setLanguage('Custom');
                    onDirtyChange?.();
                  }
                }}
                options={[
                  ...LANGUAGE_OPTIONS.map((lang) => ({
                    value: lang,
                    label: LANGUAGE_LABEL_KEYS[lang] ? t(LANGUAGE_LABEL_KEYS[lang]) : lang,
                    icon: <Globe size={13} style={{ color: 'var(--accent-indigo)' }} />,
                  })),
                  {
                    value: 'Custom',
                    label: t('settings.profile.language.custom'),
                    icon: <Globe size={13} style={{ color: 'var(--accent-purple)' }} />,
                  },
                ]}
                ariaLabel={t('settings.profile.language.label')}
              />
            </div>
            {(!LANGUAGE_OPTIONS.includes(language) || language === 'Custom') && (
              <input
                id="profile-language"
                type="text"
                className="setup-input"
                value={language === 'Custom' ? '' : language}
                onChange={(e) => {
                  setLanguage(e.target.value);
                  onDirtyChange?.();
                }}
                placeholder={t('settings.profile.language.placeholder')}
                style={{ flex: 1, minWidth: '180px' }}
              />
            )}
          </div>
          <span className="setup-hint">
            {t('settings.profile.language.hint')}
          </span>
        </div>

        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="setup-btn-primary"
            onClick={handleSaveProfile}
            disabled={savingProfile || profileCharCount > 1500}
          >
            <Save size={15} />
            <span>{savingProfile ? t('settings.profile.saving') : t('settings.profile.save')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
