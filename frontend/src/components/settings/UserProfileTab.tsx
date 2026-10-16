import React, { useState } from 'react';
import { Shield, Sparkles, Save, User, Globe } from 'lucide-react';
import * as api from '../../api';
import { LANGUAGE_OPTIONS, PROFILE_ARCHETYPES, ProfileArchetype } from './constants';
import { CustomSelect } from '../CustomSelect';

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
    setGoals(archetype.goals);
    setSkills(archetype.skills);
    setStack(archetype.stack);
    setInterests(archetype.interests);
    setConstraints(archetype.constraints);
    onDirtyChange?.();
    showToast(`Loaded ${archetype.label} starter profile.`);
  };

  const handleSaveProfile = async () => {
    if (profileCharCount > 1500) {
      if (onError) {
        onError('User profile exceeds 1,500 characters limit. Please shorten some fields.');
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
      showToast('About me profile saved successfully.');
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
            <span className="settings-section-title">Personal Fit & About Me</span>
          </div>
          <span className="settings-section-desc">
            Tailor Triage's value proposition and Research's personal-fit verdict specifically to your domain, professional background, tools, and objectives.
          </span>
        </div>

        {/* Privacy Note */}
        <div className="setup-info-box" style={{ marginBottom: '16px' }}>
          <Shield size={16} />
          <span>
            <strong>Privacy note:</strong> Your profile is stored locally in your database and sent only to your configured LLM providers during triage and research.
          </span>
        </div>

        {/* Archetype Quick Selectors */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Starter Archetypes / Domain Presets
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Click to prefill and tailor to your domain
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {PROFILE_ARCHETYPES.map((arch) => (
              <button
                key={arch.id}
                type="button"
                className="archetype-preset-chip"
                onClick={() => handleApplyArchetype(arch)}
                title={arch.description}
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
                <span>{arch.badge}</span>
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
            <span style={{ color: 'var(--text-secondary, #94a3b8)' }}>Profile Character Budget</span>
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
            {profileCharCount} / 1,500 chars {profileCharCount > 1500 ? '(Exceeds 1,500 max limit)' : ''}
          </span>
        </div>

        {/* Goals */}
        <div className="setup-form-group">
          <label htmlFor="profile-goals">Tell me about yourself / Primary Goals</label>
          <textarea
            id="profile-goals"
            className="setup-textarea"
            rows={5}
            value={goals}
            onChange={(e) => {
              setGoals(e.target.value);
              onDirtyChange?.();
            }}
            placeholder="e.g. Founder scaling a B2B business, investor analyzing macro trends, agronomist researching sustainable farming, or engineer building AI systems..."
          />
          <span className="setup-hint">
            Free text: Give the AI context on who you are, what your core objectives are, and what makes an insight or project relevant to you.
          </span>
        </div>

        {/* Skills */}
        <div className="setup-form-group">
          <label htmlFor="profile-skills">Core Skills & Proficiencies</label>
          <input
            id="profile-skills"
            type="text"
            className="setup-input"
            value={skills}
            onChange={(e) => {
              setSkills(e.target.value);
              onDirtyChange?.();
            }}
            placeholder="e.g. B2B Sales, Financial Modeling, Agronomy, Systems Engineering, Data Analysis, GTM Strategy"
          />
          <span className="setup-hint">
            Comma-separated competencies you already possess or are actively developing.
          </span>
        </div>

        {/* Stack & Tools */}
        <div className="setup-form-group">
          <label htmlFor="profile-stack">Tools, Platforms & Systems</label>
          <input
            id="profile-stack"
            type="text"
            className="setup-input"
            value={stack}
            onChange={(e) => {
              setStack(e.target.value);
              onDirtyChange?.();
            }}
            placeholder="e.g. Notion, Bloomberg Terminal, FarmOS, Docker, Linear, QuickBooks, PostgreSQL, GIS"
          />
          <span className="setup-hint">
            Comma-separated software, equipment, or daily operational platforms you utilize.
          </span>
        </div>

        {/* Interests */}
        <div className="setup-form-group">
          <label htmlFor="profile-interests">Domains & Focus Interests</label>
          <input
            id="profile-interests"
            type="text"
            className="setup-input"
            value={interests}
            onChange={(e) => {
              setInterests(e.target.value);
              onDirtyChange?.();
            }}
            placeholder="e.g. Regenerative agriculture, local LLMs, seed fundraising, commodity markets, robotics, macro liquidity"
          />
          <span className="setup-hint">
            Comma-separated subjects and trends that should receive priority attention during triage and briefings.
          </span>
        </div>

        {/* Constraints */}
        <div className="setup-form-group">
          <label htmlFor="profile-constraints">Constraints & Operating Guidelines</label>
          <textarea
            id="profile-constraints"
            className="setup-textarea"
            rows={3}
            value={constraints}
            onChange={(e) => {
              setConstraints(e.target.value);
              onDirtyChange?.();
            }}
            placeholder="e.g. Self-hosted only; budget <$500/mo; field-ready / offline capability; prioritize primary sources and audited metrics."
          />
          <span className="setup-hint">
            Hardware limits, budget restrictions, or preferences that influence feasibility ratings.
          </span>
        </div>

        {/* Output Language */}
        <div className="setup-form-group">
          <label htmlFor="profile-language-select">Output Language for Triage & Research</label>
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
                    label: lang,
                    icon: <Globe size={13} style={{ color: 'var(--accent-indigo)' }} />,
                  })),
                  {
                    value: 'Custom',
                    label: 'Custom Language...',
                    icon: <Globe size={13} style={{ color: 'var(--accent-purple)' }} />,
                  },
                ]}
                ariaLabel="Output Language for Triage & Research"
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
                placeholder="Enter language (e.g. Spanish, German, Japanese)..."
                style={{ flex: 1, minWidth: '180px' }}
              />
            )}
          </div>
          <span className="setup-hint">
            Default: "Same as source / English". When set, briefings and research reports will be instructed to write in this language.
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
            <span>{savingProfile ? 'Saving Profile...' : 'Save Profile'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
