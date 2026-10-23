import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Save,
  AlertCircle,
  Palette,
  Cpu,
  Shield,
  Sliders,
  User,
  Clock,
  Plug,
  MessageSquare,
  Coffee,
  Heart,
} from 'lucide-react';
import * as api from '../api';
import { LLMProfile, Playbook } from '../types';
import { ThemeSelector } from './ThemeSelector';
import { ResearchScheduler } from './ResearchScheduler';
import {
  AIProfileTab,
  UserProfileTab,
  ChannelsTab,
  SecurityTab,
  IntegrationsTab,
  LanguageSelector,
  DEFAULT_TOKEN_CAPS,
} from './settings';

export interface SettingsModalProps {
  onClose: () => void;
  showToast: (msg: string) => void;
  initialTab?: SettingsTab | null;
}

export type SettingsTab =
  | 'appearance'
  | 'profile'
  | 'integrations'
  | 'ai'
  | 'schedule'
  | 'channels'
  | 'security';

const DEFAULT_CARD_TYPES = ['article', 'video', 'book', 'guide', 'product', 'place', 'idea', 'quote'];

interface SettingsBaseline {
  cardDensity: 'comfortable' | 'compact';
  reduceMotion: 'default' | 'reduced';
  cardTypes: string[];
  profileGoals: string;
  profileSkills: string;
  profileStack: string;
  profileInterests: string;
  profileConstraints: string;
  profileLanguage: string;
  discordChannelId: string;
}

export function SettingsModal({ onClose, showToast, initialTab }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab || 'appearance');
  const bodyRef = React.useRef<HTMLDivElement>(null);

  // Card Taxonomy state
  const [cardTypes, setCardTypes] = useState<string[]>(DEFAULT_CARD_TYPES);
  const [newCardTypeInput, setNewCardTypeInput] = useState('');
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [pendingDeleteCardType, setPendingDeleteCardType] = useState<{
    type: string;
    affectedPlaybooks: Playbook[];
  } | null>(null);

  // AI & Profiles state
  const [profiles, setProfiles] = useState<LLMProfile[]>([]);
  const [llmRoles, setLlmRoles] = useState<Record<string, string>>({});
  const [tokenCaps, setTokenCaps] = useState<Record<string, number>>(DEFAULT_TOKEN_CAPS);

  // Security state
  const [authToken, setAuthToken] = useState('');
  const [confirmAuthToken, setConfirmAuthToken] = useState('');
  const [hasAuthToken, setHasAuthToken] = useState(false);

  // Channels state
  const [tgToken, setTgToken] = useState('');
  const [hasTgToken, setHasTgToken] = useState(false);
  const [tgChatId, setTgChatId] = useState('');

  const [discordToken, setDiscordToken] = useState('');
  const [hasDiscordToken, setHasDiscordToken] = useState(false);
  const [discordChannelId, setDiscordChannelId] = useState('');

  const [slackWebhookUrl, setSlackWebhookUrl] = useState('');
  const [hasSlackWebhook, setHasSlackWebhook] = useState(false);
  const [obsidianVaultPath, setObsidianVaultPath] = useState('');

  // Appearance preferences state

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

  // User profile state
  const [profileGoals, setProfileGoals] = useState('');
  const [profileSkills, setProfileSkills] = useState('');
  const [profileStack, setProfileStack] = useState('');
  const [profileInterests, setProfileInterests] = useState('');
  const [profileConstraints, setProfileConstraints] = useState('');
  const [profileLanguage, setProfileLanguage] = useState('Same as source / English');

  // Baseline snapshot for dirty tracking
  const [baseline, setBaseline] = useState<SettingsBaseline | null>(null);

  // Common modal state
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  // Automatically scroll content body to top when switching menu tabs
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Load existing settings and playbooks
  useEffect(() => {
    Promise.all([
      api.getSettings(),
      api.fetchPlaybooks().catch(() => [] as Playbook[]),
    ])
      .then(([res, loadedPlaybooks]) => {
        setPlaybooks(loadedPlaybooks || []);
        setHasAuthToken(Boolean(res.settings.has_auth_token));
        setObsidianVaultPath(res.settings.obsidian_vault_path || '');
        const profs = res.settings.llm_profiles || [];
        if (profs.length > 0) {
          setProfiles(profs);
        } else if (res.settings.llm_model) {
          setProfiles([
            {
              id: 'default',
              name: 'Default',
              base_url: res.settings.llm_base || '',
              model: res.settings.llm_model || '',
              has_key: Boolean(res.settings.has_llm_key),
              is_default: true,
            },
          ]);
        }
        if (res.settings.llm_roles) {
          setLlmRoles(res.settings.llm_roles);
        }
        if (res.settings.llm_token_caps) {
          setTokenCaps(res.settings.llm_token_caps);
        }

        let loadedGoals = '';
        let loadedSkills = '';
        let loadedStack = '';
        let loadedInterests = '';
        let loadedConstraints = '';
        let loadedLang = 'Same as source / English';

        if (res.settings.user_profile) {
          const up = res.settings.user_profile;
          if (up.goals) loadedGoals = up.goals;
          if (up.skills) loadedSkills = up.skills.join(', ');
          if (up.stack) loadedStack = up.stack.join(', ');
          if (up.interests) loadedInterests = up.interests.join(', ');
          if (up.constraints) loadedConstraints = up.constraints;
          if (up.language) loadedLang = up.language;
        }

        setProfileGoals(loadedGoals);
        setProfileSkills(loadedSkills);
        setProfileStack(loadedStack);
        setProfileInterests(loadedInterests);
        setProfileConstraints(loadedConstraints);
        setProfileLanguage(loadedLang);

        setHasTgToken(Boolean(res.settings.has_tg_token));
        if (res.settings.tg_chat_id) setTgChatId(res.settings.tg_chat_id);

        setHasDiscordToken(Boolean(res.settings.has_discord_token));
        const loadedDiscordChannelId = res.settings.discord_channel_id || '';
        setDiscordChannelId(loadedDiscordChannelId);

        setHasSlackWebhook(Boolean(res.settings.has_slack_webhook));

        const loadedCardTypes = res.settings.card_types && res.settings.card_types.length > 0
          ? res.settings.card_types
          : DEFAULT_CARD_TYPES;
        setCardTypes(loadedCardTypes);

        // Establish clean baseline for dirty tracking
        const savedDensity =
          typeof window !== 'undefined'
            ? ((localStorage.getItem('sparkkeep_card_density') as 'comfortable' | 'compact') || 'comfortable')
            : 'comfortable';
        const savedMotion =
          typeof window !== 'undefined'
            ? ((localStorage.getItem('sparkkeep_reduce_motion') as 'default' | 'reduced') || 'default')
            : 'default';

        setBaseline({
          cardDensity: savedDensity,
          reduceMotion: savedMotion,
          cardTypes: loadedCardTypes,
          profileGoals: loadedGoals,
          profileSkills: loadedSkills,
          profileStack: loadedStack,
          profileInterests: loadedInterests,
          profileConstraints: loadedConstraints,
          profileLanguage: loadedLang,
          discordChannelId: loadedDiscordChannelId,
        });

        setLoading(false);
      })
      .catch((err) => {
        setError(api.getErrorMessage(err));
        setLoading(false);
      });
  }, []);

  // Dirty tracking computation
  const isDirty = useMemo(() => {
    if (!baseline) return false;
    if (authToken.trim().length > 0 || confirmAuthToken.trim().length > 0) return true;
    if (tgToken.trim().length > 0) return true;
    if (discordToken.trim().length > 0) return true;
    if (slackWebhookUrl.trim().length > 0) return true;
    if (cardDensity !== baseline.cardDensity) return true;
    if (reduceMotion !== baseline.reduceMotion) return true;
    if (JSON.stringify(cardTypes) !== JSON.stringify(baseline.cardTypes)) return true;
    if (profileGoals !== baseline.profileGoals) return true;
    if (profileSkills !== baseline.profileSkills) return true;
    if (profileStack !== baseline.profileStack) return true;
    if (profileInterests !== baseline.profileInterests) return true;
    if (profileConstraints !== baseline.profileConstraints) return true;
    if (profileLanguage !== baseline.profileLanguage) return true;
    if (discordChannelId !== baseline.discordChannelId) return true;
    return false;
  }, [
    baseline,
    authToken,
    confirmAuthToken,
    tgToken,
    discordToken,
    slackWebhookUrl,
    cardDensity,
    reduceMotion,
    cardTypes,
    profileGoals,
    profileSkills,
    profileStack,
    profileInterests,
    profileConstraints,
    profileLanguage,
    discordChannelId,
  ]);

  const parseTags = (str: string) =>
    str
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const profileCharCount =
    profileGoals.length +
    profileConstraints.length +
    (profileLanguage && profileLanguage !== 'Same as source / English' ? profileLanguage.length : 0) +
    parseTags(profileSkills).join('').length +
    parseTags(profileStack).join('').length +
    parseTags(profileInterests).join('').length;

  const handleSave = async () => {
    setError(null);

    // Validation for user profile length
    if (profileCharCount > 1500) {
      setError('User profile exceeds 1,500 characters limit. Please shorten some fields.');
      setActiveTab('profile');
      return;
    }

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
        localStorage.setItem('sparkkeep_card_density', cardDensity);
        localStorage.setItem('sparkkeep_reduce_motion', reduceMotion);
        if (reduceMotion === 'reduced') {
          document.documentElement.setAttribute('data-reduce-motion', 'reduced');
        } else {
          document.documentElement.removeAttribute('data-reduce-motion');
        }
      }

      // Save card taxonomy and user profile
      const lang = profileLanguage.trim();
      const finalLang = lang === 'Same as source / English' || lang === 'Custom' ? '' : lang;
      await api.patchSettings({
        card_types: cardTypes,
        user_profile: {
          goals: profileGoals.trim(),
          skills: parseTags(profileSkills),
          stack: parseTags(profileStack),
          interests: parseTags(profileInterests),
          constraints: profileConstraints.trim(),
          language: finalLang,
        },
      });

      // Patch backend platform security if changed
      if (authToken.trim()) {
        await api.patchSettings({ auth_token: authToken.trim() });
      }

      // Patch channels
      await api.patchSettings({
        ...(tgToken.trim() ? { tg_token: tgToken.trim() } : {}),
        ...(discordToken.trim() ? { discord_token: discordToken.trim() } : {}),
        discord_channel_id: discordChannelId.trim(),
        ...(slackWebhookUrl.trim() ? { slack_webhook_url: slackWebhookUrl.trim() } : {}),
      });

      // Reset dirty tracking baseline to current values
      setBaseline({
        cardDensity,
        reduceMotion,
        cardTypes,
        profileGoals,
        profileSkills,
        profileStack,
        profileInterests,
        profileConstraints,
        profileLanguage,
        discordChannelId,
      });

      showToast('Platform preferences saved successfully.');
      onClose();
    } catch (err: unknown) {
      setError(api.getErrorMessage(err));
      setSubmitting(false);
    }
  };

  const handleAddCardType = () => {
    const trimmed = newCardTypeInput.trim().toLowerCase();
    if (!trimmed) return;
    if (trimmed === 'other') {
      setError('"other" is already an immutable fallback card type.');
      return;
    }
    if (cardTypes.includes(trimmed)) {
      setError(`Card type "${trimmed}" already exists.`);
      return;
    }
    if (cardTypes.length >= 20) {
      setError('Maximum of 20 active card types reached.');
      return;
    }
    setError(null);
    setCardTypes([...cardTypes, trimmed]);
    setNewCardTypeInput('');
  };

  const handleRemoveCardType = (type: string) => {
    setError(null);
    const affectedPlaybooks = playbooks.filter(
      (pb) => Array.isArray(pb.card_types) && pb.card_types.includes(type)
    );
    if (affectedPlaybooks.length > 0) {
      setPendingDeleteCardType({ type, affectedPlaybooks });
      return;
    }
    setCardTypes(cardTypes.filter((t) => t !== type));
  };

  const handleConfirmDetachCardType = async () => {
    if (!pendingDeleteCardType) return;
    const { type, affectedPlaybooks } = pendingDeleteCardType;
    const nextCardTypes = cardTypes.filter((t) => t !== type);
    setError(null);
    try {
      await Promise.all(
        affectedPlaybooks.map((pb) =>
          api.updatePlaybook(pb.id, {
            ...pb,
            card_types: (pb.card_types || []).filter((t) => t !== type),
          })
        )
      );
      await api.patchSettings({ card_types: nextCardTypes });
      setCardTypes(nextCardTypes);
      setPlaybooks((prev) =>
        prev.map((pb) =>
          Array.isArray(pb.card_types) && pb.card_types.includes(type)
            ? { ...pb, card_types: pb.card_types.filter((t) => t !== type) }
            : pb
        )
      );
      setPendingDeleteCardType(null);
    } catch (err) {
      setError(api.getErrorMessage(err));
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 id="settings-modal-title" className="settings-title">
                  Platform Preferences
                </h2>
                {isDirty && (
                  <span
                    className="settings-dirty-badge"
                    title="You have unsaved platform preferences"
                  >
                    <span className="settings-dirty-dot" />
                    Unsaved
                  </span>
                )}
              </div>
              <span className="settings-subtitle">
                Customize workspace appearance, AI models, channels, and access security
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

        {/* Modal Layout Wrapper */}
        <div className="settings-modal-layout">
          {/* Sidebar Navigation Rail */}
          <div className="settings-sidebar" role="tablist" aria-label="Settings categories">
            <button
              id="settings-tab-appearance"
              type="button"
              role="tab"
              aria-selected={activeTab === 'appearance'}
              aria-controls="settings-panel-appearance"
              className={`settings-tab-btn ${activeTab === 'appearance' ? 'active' : ''}`}
              onClick={() => setActiveTab('appearance')}
            >
              <Palette size={15} />
              <span>Appearance & Preferences</span>
            </button>
            <button
              id="settings-tab-profile"
              type="button"
              role="tab"
              aria-selected={activeTab === 'profile'}
              aria-controls="settings-panel-profile"
              className={`settings-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              <User size={15} />
              <span>About me</span>
            </button>
            <button
              id="settings-tab-integrations"
              type="button"
              role="tab"
              aria-selected={activeTab === 'integrations'}
              aria-controls="settings-panel-integrations"
              className={`settings-tab-btn ${activeTab === 'integrations' ? 'active' : ''}`}
              onClick={() => setActiveTab('integrations')}
            >
              <Plug size={15} />
              <span>Integrations</span>
            </button>
            <button
              id="settings-tab-ai"
              type="button"
              role="tab"
              aria-selected={activeTab === 'ai'}
              aria-controls="settings-panel-ai"
              className={`settings-tab-btn ${activeTab === 'ai' ? 'active' : ''}`}
              onClick={() => setActiveTab('ai')}
            >
              <Cpu size={15} />
              <span>AI Engine</span>
            </button>
            <button
              id="settings-tab-schedule"
              type="button"
              role="tab"
              aria-selected={activeTab === 'schedule'}
              aria-controls="settings-panel-schedule"
              className={`settings-tab-btn ${activeTab === 'schedule' ? 'active' : ''}`}
              onClick={() => setActiveTab('schedule')}
            >
              <Clock size={15} />
              <span>Scheduled Research</span>
            </button>
            <button
              id="settings-tab-channels"
              type="button"
              role="tab"
              aria-selected={activeTab === 'channels'}
              aria-controls="settings-panel-channels"
              className={`settings-tab-btn ${activeTab === 'channels' ? 'active' : ''}`}
              onClick={() => setActiveTab('channels')}
            >
              <MessageSquare size={15} />
              <span>Channels & Alerts</span>
            </button>
            <button
              id="settings-tab-security"
              type="button"
              role="tab"
              aria-selected={activeTab === 'security'}
              aria-controls="settings-panel-security"
              className={`settings-tab-btn ${activeTab === 'security' ? 'active' : ''}`}
              onClick={() => setActiveTab('security')}
            >
              <Shield size={15} />
              <span>Security & Access</span>
            </button>

            {/* Support Sparkkeep */}
            <div className="settings-sidebar-footer">
              <span className="settings-sidebar-footer-title">Support Project</span>
              <div className="settings-sidebar-support-links">
                <a
                  href="https://ko-fi.com/andreiburlacu"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="settings-support-link"
                  title="Buy me a coffee on Ko-fi"
                >
                  <Coffee size={13} color="#ff5e5b" />
                  <span>Buy me a coffee</span>
                </a>
                <a
                  href="https://github.com/sponsors/BurlacuAndrei"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="settings-support-link"
                  title="Sponsor on GitHub"
                >
                  <Heart size={13} color="#ea4aaa" />
                  <span>GitHub Sponsor</span>
                </a>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="settings-main-content">
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
              <div className="settings-modal-body" ref={bodyRef}>
                {/* TAB 1: Appearance & Preferences */}
                {activeTab === 'appearance' && (
                  <div
                    id="settings-panel-appearance"
                    className="settings-panel"
                    role="tabpanel"
                    aria-labelledby="settings-tab-appearance"
                  >
                    <div className="settings-section">
                      <div className="settings-section-header">
                        <span className="settings-section-title">Color Palette & Contrast</span>
                        <span className="settings-section-desc">
                          Select an accent palette and dark/light mode for your workspace
                        </span>
                      </div>
                      <ThemeSelector />
                    </div>

                    <div className="settings-section">
                      <div className="settings-section-header">
                        <span className="settings-section-title">Layout & Usability</span>
                        <span className="settings-section-desc">
                          Configure workspace spacing and interface motion
                        </span>
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

                    <div className="settings-section">
                      <LanguageSelector />
                    </div>

                    <div className="settings-section">
                      <div className="settings-section-header">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '8px' }}>
                          <div>
                            <span className="settings-section-title">Card Taxonomy</span>
                            <span className="settings-section-desc">
                              Configure up to 20 macro Card Types for triage ingestion and category routing. "other" is an immutable fallback.
                            </span>
                          </div>
                          <span
                            className="settings-counter-badge"
                            style={{
                              fontSize: '12px',
                              fontWeight: 600,
                              color: cardTypes.length >= 20 ? 'var(--accent-amber, #eab308)' : 'var(--text-muted)',
                              background: 'var(--bg-surface)',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            {cardTypes.length} / 20 active types
                          </span>
                        </div>
                      </div>

                      {/* Active Card Type Chips */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
                        {cardTypes.map((type) => (
                          <div
                            key={type}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: '6px',
                              padding: '4px 10px',
                              fontSize: '12px',
                              fontWeight: 600,
                              color: 'var(--text-main)',
                            }}
                          >
                            <span>{type}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveCardType(type)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--text-muted)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '2px',
                                borderRadius: '4px',
                                marginLeft: '2px',
                              }}
                              aria-label={`Remove ${type}`}
                              title={`Remove ${type}`}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ))}
                        {/* Immutable Fallback Chip */}
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px dashed var(--border-subtle)',
                            borderRadius: '6px',
                            padding: '4px 10px',
                            fontSize: '12px',
                            color: 'var(--text-dim)',
                          }}
                          title="Immutable fallback"
                        >
                          <span>other</span>
                          <span style={{ fontSize: '10px', opacity: 0.6 }}>(fallback)</span>
                        </div>
                      </div>

                      {/* Add Card Type Input Form */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="text"
                          className="setup-input"
                          style={{ maxWidth: '260px' }}
                          placeholder="Add card type..."
                          value={newCardTypeInput}
                          onChange={(e) => setNewCardTypeInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCardType();
                            }
                          }}
                          disabled={cardTypes.length >= 20}
                          aria-label="New card type"
                        />
                        <button
                          type="button"
                          className="setup-btn-secondary"
                          style={{ padding: '8px 14px' }}
                          onClick={handleAddCardType}
                          disabled={
                            cardTypes.length >= 20 ||
                            !newCardTypeInput.trim() ||
                            cardTypes.includes(newCardTypeInput.trim().toLowerCase()) ||
                            newCardTypeInput.trim().toLowerCase() === 'other'
                          }
                        >
                          Add Type
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: User Profile (About Me) */}
                {activeTab === 'profile' && (
                  <div
                    id="settings-panel-profile"
                    role="tabpanel"
                    aria-labelledby="settings-tab-profile"
                    style={{ minHeight: 0 }}
                  >
                    <UserProfileTab
                      goals={profileGoals}
                      setGoals={setProfileGoals}
                      skills={profileSkills}
                      setSkills={setProfileSkills}
                      stack={profileStack}
                      setStack={setProfileStack}
                      interests={profileInterests}
                      setInterests={setProfileInterests}
                      constraints={profileConstraints}
                      setConstraints={setProfileConstraints}
                      language={profileLanguage}
                      setLanguage={setProfileLanguage}
                      showToast={showToast}
                      onError={setError}
                    />
                  </div>
                )}

                {/* TAB 3: AI Engine */}
                {activeTab === 'ai' && (
                  <div
                    id="settings-panel-ai"
                    role="tabpanel"
                    aria-labelledby="settings-tab-ai"
                    style={{ minHeight: 0 }}
                  >
                    <AIProfileTab
                      profiles={profiles}
                      setProfiles={setProfiles}
                      llmRoles={llmRoles}
                      setLlmRoles={setLlmRoles}
                      tokenCaps={tokenCaps}
                      setTokenCaps={setTokenCaps}
                      showToast={showToast}
                      onError={setError}
                    />
                  </div>
                )}

                {/* TAB 4: Scheduled Research */}
                {activeTab === 'schedule' && (
                  <div
                    id="settings-panel-schedule"
                    role="tabpanel"
                    aria-labelledby="settings-tab-schedule"
                    style={{ minHeight: 0 }}
                  >
                    <ResearchScheduler showToast={showToast} />
                  </div>
                )}

                {/* TAB 6: Channels */}
                {activeTab === 'channels' && (
                  <div
                    id="settings-panel-channels"
                    role="tabpanel"
                    aria-labelledby="settings-tab-channels"
                    style={{ minHeight: 0 }}
                  >
                    <ChannelsTab
                      tgToken={tgToken}
                      setTgToken={setTgToken}
                      hasTgToken={hasTgToken}
                      tgChatId={tgChatId}
                      discordToken={discordToken}
                      setDiscordToken={setDiscordToken}
                      hasDiscordToken={hasDiscordToken}
                      discordChannelId={discordChannelId}
                      setDiscordChannelId={setDiscordChannelId}
                      slackWebhookUrl={slackWebhookUrl}
                      setSlackWebhookUrl={setSlackWebhookUrl}
                      hasSlackWebhook={hasSlackWebhook}
                      showToast={showToast}
                    />
                  </div>
                )}

                {/* TAB 3: Integrations */}
                {activeTab === 'integrations' && (
                  <div
                    id="settings-panel-integrations"
                    role="tabpanel"
                    aria-labelledby="settings-tab-integrations"
                    style={{ minHeight: 0 }}
                  >
                    <IntegrationsTab
                      showToast={showToast}
                      authToken={authToken}
                      initialVaultPath={obsidianVaultPath}
                      onVaultPathChange={setObsidianVaultPath}
                    />
                  </div>
                )}

                {/* TAB 8: Security & Access */}
                {activeTab === 'security' && (
                  <div
                    id="settings-panel-security"
                    role="tabpanel"
                    aria-labelledby="settings-tab-security"
                    style={{ minHeight: 0 }}
                  >
                    <SecurityTab
                      authToken={authToken}
                      setAuthToken={setAuthToken}
                      confirmAuthToken={confirmAuthToken}
                      setConfirmAuthToken={setConfirmAuthToken}
                      hasAuthToken={hasAuthToken}
                      showToast={showToast}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Modal Footer Actions (Save Changes / Cancel) with Dirty Tracking */}
            {activeTab !== 'schedule' && (
              <div className="settings-modal-footer">
                {isDirty && (
                  <span
                    style={{
                      fontSize: '12px',
                      color: 'var(--accent-amber, #eab308)',
                      marginRight: 'auto',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--accent-amber, #eab308)',
                        display: 'inline-block',
                      }}
                    />
                    Unsaved changes
                  </span>
                )}
                <button type="button" className="setup-btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="setup-btn-primary"
                  onClick={handleSave}
                  disabled={submitting || loading || !isDirty}
                  title={!isDirty ? 'No changes to save' : 'Save platform preferences'}
                >
                  <Save size={16} />
                  <span>{submitting ? 'Saving Changes...' : 'Save Changes'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {pendingDeleteCardType && (
        <div
          className="modal-backdrop"
          style={{ zIndex: 1100 }}
          onClick={(e) => {
            e.stopPropagation();
            setPendingDeleteCardType(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="taxonomy-impact-modal-title"
          data-testid="taxonomy-impact-modal"
        >
          <div
            className="settings-modal-card"
            style={{
              maxWidth: '480px',
              width: '100%',
              height: 'auto',
              maxHeight: '80vh',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertCircle size={20} color="var(--accent-amber, #eab308)" />
              <h3
                id="taxonomy-impact-modal-title"
                style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-main)' }}
              >
                Detach "{pendingDeleteCardType.type}" from Playbooks?
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              The card type <strong>{pendingDeleteCardType.type}</strong> is currently referenced by{' '}
              {pendingDeleteCardType.affectedPlaybooks.length}{' '}
              {pendingDeleteCardType.affectedPlaybooks.length === 1 ? 'playbook' : 'playbooks'}.
              Detaching will safely remove this card type tag while keeping your playbooks intact.
            </p>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: '200px',
                overflowY: 'auto',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '10px 12px',
              }}
            >
              {pendingDeleteCardType.affectedPlaybooks.map((pb) => (
                <div
                  key={pb.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    padding: '4px 0',
                  }}
                >
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                    {pb.name}
                  </span>
                  {pb.description && (
                    <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                      {pb.description}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
              <button
                type="button"
                className="setup-btn-secondary"
                onClick={() => setPendingDeleteCardType(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="setup-btn-primary"
                onClick={handleConfirmDetachCardType}
              >
                Detach from Playbooks (Default)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
