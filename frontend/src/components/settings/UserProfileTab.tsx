import React, { useState } from 'react';
import { Shield, Sparkles, Save, User } from 'lucide-react';
import * as api from '../../api';
import { LANGUAGE_OPTIONS } from './constants';

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
            Tailor Triage's value proposition and Research's personal-fit verdict specifically to your background, tech stack, and goals.
          </span>
        </div>

        {/* Privacy Note */}
        <div className="setup-info-box" style={{ marginBottom: '16px' }}>
          <Shield size={16} />
          <span>
            <strong>Privacy note:</strong> Your profile is stored locally in your database and sent only to your configured LLM providers during triage and research.
          </span>
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
            placeholder="e.g. I am a student trying to learn about software engineering, or I am a hobbyist building homelabs and AI agents..."
          />
          <span className="setup-hint">
            Free text: Give the AI context on who you are, what your core objectives are, and what makes a project relevant to you.
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
            placeholder="e.g. TypeScript, React, Python, Go, Docker, Systems Engineering"
          />
          <span className="setup-hint">
            Comma-separated skills you already possess or are actively developing.
          </span>
        </div>

        {/* Stack & Tools */}
        <div className="setup-form-group">
          <label htmlFor="profile-stack">Tech Stack & Tools</label>
          <input
            id="profile-stack"
            type="text"
            className="setup-input"
            value={stack}
            onChange={(e) => {
              setStack(e.target.value);
              onDirtyChange?.();
            }}
            placeholder="e.g. Next.js, PostgreSQL, Tailwind CSS, Kubernetes, Linux, Neovim"
          />
          <span className="setup-hint">
            Comma-separated frameworks, databases, and environments you use daily.
          </span>
        </div>

        {/* Interests */}
        <div className="setup-form-group">
          <label htmlFor="profile-interests">Domains & Research Interests</label>
          <input
            id="profile-interests"
            type="text"
            className="setup-input"
            value={interests}
            onChange={(e) => {
              setInterests(e.target.value);
              onDirtyChange?.();
            }}
            placeholder="e.g. AI Agents, Homelab, High Performance Computing, WebRTC, Obsidian PKM"
          />
          <span className="setup-hint">
            Comma-separated subjects and trends that should receive priority attention during triage.
          </span>
        </div>

        {/* Constraints */}
        <div className="setup-form-group">
          <label htmlFor="profile-constraints">Constraints & Preferences</label>
          <textarea
            id="profile-constraints"
            className="setup-textarea"
            rows={3}
            value={constraints}
            onChange={(e) => {
              setConstraints(e.target.value);
              onDirtyChange?.();
            }}
            placeholder="e.g. Prefer open-source self-hosted solutions; low RAM servers (4GB max); avoid heavy enterprise subscriptions."
          />
          <span className="setup-hint">
            Hardware limits, budget restrictions, or preferences that influence feasibility ratings.
          </span>
        </div>

        {/* Output Language */}
        <div className="setup-form-group">
          <label htmlFor="profile-language-select">Output Language for Triage & Research</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <select
              id="profile-language-select"
              className="setup-select"
              value={LANGUAGE_OPTIONS.includes(language) ? language : 'Custom'}
              onChange={(e) => {
                if (e.target.value !== 'Custom') {
                  setLanguage(e.target.value);
                  onDirtyChange?.();
                }
              }}
              style={{ minWidth: '220px' }}
            >
              {LANGUAGE_OPTIONS.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
              <option value="Custom">Custom Language...</option>
            </select>
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
