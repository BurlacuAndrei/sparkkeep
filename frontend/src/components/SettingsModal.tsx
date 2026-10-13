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
  BookOpen,
  User,
  Clock,
  Plug,
  MessageSquare,
} from 'lucide-react';
import * as api from '../api';
import { LLMProfile } from '../types';
import { ThemeSelector } from './ThemeSelector';
import { PlaybookManager } from './PlaybookManager';
import { ResearchScheduler } from './ResearchScheduler';
import {
  AIProfileTab,
  UserProfileTab,
  ChannelsTab,
  SecurityTab,
  IntegrationsTab,
  DEFAULT_TOKEN_CAPS,
} from './settings';

export interface SettingsModalProps {
  onClose: () => void;
  showToast: (msg: string) => void;
  onOpenLicenseModal?: () => void;
}

export type SettingsTab =
  | 'appearance'
  | 'profile'
  | 'ai'
  | 'playbooks'
  | 'schedule'
  | 'channels'
  | 'integrations'
  | 'security';

interface SettingsBaseline {
  defaultView: 'kanban' | 'digest';
  cardDensity: 'comfortable' | 'compact';
  reduceMotion: 'default' | 'reduced';
  profileGoals: string;
  profileSkills: string;
  profileStack: string;
  profileInterests: string;
  profileConstraints: string;
  profileLanguage: string;
  openclawUrl: string;
  openclawChannel: string;
  openclawTarget: string;
  openclawEnabled: boolean;
  discordChannelId: string;
}

export function SettingsModal({ onClose, showToast, onOpenLicenseModal }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');

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

  const [openclawUrl, setOpenclawUrl] = useState('http://localhost:18789');
  const [openclawToken, setOpenclawToken] = useState('');
  const [hasOpenclawToken, setHasOpenclawToken] = useState(false);
  const [openclawChannel, setOpenclawChannel] = useState('whatsapp');
  const [openclawTarget, setOpenclawTarget] = useState('');
  const [openclawEnabled, setOpenclawEnabled] = useState(false);

  const [discordToken, setDiscordToken] = useState('');
  const [hasDiscordToken, setHasDiscordToken] = useState(false);
  const [discordChannelId, setDiscordChannelId] = useState('');

  const [slackWebhookUrl, setSlackWebhookUrl] = useState('');
  const [hasSlackWebhook, setHasSlackWebhook] = useState(false);

  // Appearance preferences state
  const [defaultView, setDefaultView] = useState<'kanban' | 'digest'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sparkkeep_default_view');
      if (saved === 'kanban' || saved === 'digest') return saved;
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

        const loadedOpenclawUrl = res.settings.openclaw_url || 'http://localhost:18789';
        const loadedOpenclawChannel = res.settings.openclaw_channel || 'whatsapp';
        const loadedOpenclawTarget = res.settings.openclaw_target || '';
        const loadedOpenclawEnabled = Boolean(res.settings.openclaw_enabled);

        setOpenclawUrl(loadedOpenclawUrl);
        setOpenclawChannel(loadedOpenclawChannel);
        setOpenclawTarget(loadedOpenclawTarget);
        setHasOpenclawToken(Boolean(res.settings.has_openclaw_token));
        setOpenclawEnabled(loadedOpenclawEnabled);

        setHasDiscordToken(Boolean(res.settings.has_discord_token));
        const loadedDiscordChannelId = res.settings.discord_channel_id || '';
        setDiscordChannelId(loadedDiscordChannelId);

        setHasSlackWebhook(Boolean(res.settings.has_slack_webhook));

        // Establish clean baseline for dirty tracking
        const savedView =
          typeof window !== 'undefined'
            ? ((localStorage.getItem('sparkkeep_default_view') as 'kanban' | 'digest') || 'kanban')
            : 'kanban';
        const savedDensity =
          typeof window !== 'undefined'
            ? ((localStorage.getItem('sparkkeep_card_density') as 'comfortable' | 'compact') || 'comfortable')
            : 'comfortable';
        const savedMotion =
          typeof window !== 'undefined'
            ? ((localStorage.getItem('sparkkeep_reduce_motion') as 'default' | 'reduced') || 'default')
            : 'default';

        setBaseline({
          defaultView: savedView,
          cardDensity: savedDensity,
          reduceMotion: savedMotion,
          profileGoals: loadedGoals,
          profileSkills: loadedSkills,
          profileStack: loadedStack,
          profileInterests: loadedInterests,
          profileConstraints: loadedConstraints,
          profileLanguage: loadedLang,
          openclawUrl: loadedOpenclawUrl,
          openclawChannel: loadedOpenclawChannel,
          openclawTarget: loadedOpenclawTarget,
          openclawEnabled: loadedOpenclawEnabled,
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
    if (openclawToken.trim().length > 0) return true;
    if (discordToken.trim().length > 0) return true;
    if (slackWebhookUrl.trim().length > 0) return true;
    if (defaultView !== baseline.defaultView) return true;
    if (cardDensity !== baseline.cardDensity) return true;
    if (reduceMotion !== baseline.reduceMotion) return true;
    if (profileGoals !== baseline.profileGoals) return true;
    if (profileSkills !== baseline.profileSkills) return true;
    if (profileStack !== baseline.profileStack) return true;
    if (profileInterests !== baseline.profileInterests) return true;
    if (profileConstraints !== baseline.profileConstraints) return true;
    if (profileLanguage !== baseline.profileLanguage) return true;
    if (openclawUrl !== baseline.openclawUrl) return true;
    if (openclawChannel !== baseline.openclawChannel) return true;
    if (openclawTarget !== baseline.openclawTarget) return true;
    if (openclawEnabled !== baseline.openclawEnabled) return true;
    if (discordChannelId !== baseline.discordChannelId) return true;
    return false;
  }, [
    baseline,
    authToken,
    confirmAuthToken,
    tgToken,
    openclawToken,
    discordToken,
    slackWebhookUrl,
    defaultView,
    cardDensity,
    reduceMotion,
    profileGoals,
    profileSkills,
    profileStack,
    profileInterests,
    profileConstraints,
    profileLanguage,
    openclawUrl,
    openclawChannel,
    openclawTarget,
    openclawEnabled,
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
        localStorage.setItem('sparkkeep_default_view', defaultView);
        localStorage.setItem('sparkkeep_card_density', cardDensity);
        localStorage.setItem('sparkkeep_reduce_motion', reduceMotion);
      }

      // Save user profile
      const lang = profileLanguage.trim();
      const finalLang = lang === 'Same as source / English' || lang === 'Custom' ? '' : lang;
      await api.patchSettings({
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
        openclaw_url: openclawUrl.trim(),
        ...(openclawToken.trim() ? { openclaw_token: openclawToken.trim() } : {}),
        openclaw_channel: openclawChannel.trim(),
        openclaw_target: openclawTarget.trim(),
        openclaw_enabled: openclawEnabled,
        ...(discordToken.trim() ? { discord_token: discordToken.trim() } : {}),
        discord_channel_id: discordChannelId.trim(),
        ...(slackWebhookUrl.trim() ? { slack_webhook_url: slackWebhookUrl.trim() } : {}),
      });

      // Reset dirty tracking baseline to current values
      setBaseline({
        defaultView,
        cardDensity,
        reduceMotion,
        profileGoals,
        profileSkills,
        profileStack,
        profileInterests,
        profileConstraints,
        profileLanguage,
        openclawUrl,
        openclawChannel,
        openclawTarget,
        openclawEnabled,
        discordChannelId,
      });

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
              aria-selected={activeTab === 'profile'}
              className={`settings-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              <User size={15} />
              <span>About me</span>
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
              aria-selected={activeTab === 'playbooks'}
              className={`settings-tab-btn ${activeTab === 'playbooks' ? 'active' : ''}`}
              onClick={() => setActiveTab('playbooks')}
            >
              <BookOpen size={15} />
              <span>Research Playbooks</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'schedule'}
              className={`settings-tab-btn ${activeTab === 'schedule' ? 'active' : ''}`}
              onClick={() => setActiveTab('schedule')}
            >
              <Clock size={15} />
              <span>Scheduled Research</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'channels'}
              className={`settings-tab-btn ${activeTab === 'channels' ? 'active' : ''}`}
              onClick={() => setActiveTab('channels')}
            >
              <MessageSquare size={15} />
              <span>Channels & Alerts</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'integrations'}
              className={`settings-tab-btn ${activeTab === 'integrations' ? 'active' : ''}`}
              onClick={() => setActiveTab('integrations')}
            >
              <Plug size={15} />
              <span>Integrations & API</span>
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
              <div className="settings-modal-body">
                {/* TAB 1: Appearance & Preferences */}
                {activeTab === 'appearance' && (
                  <div className="settings-panel" role="tabpanel">
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
                          onChange={(e) => setDefaultView(e.target.value as 'kanban' | 'digest')}
                          className="pref-select"
                          aria-label="Default dashboard view"
                        >
                          <option value="kanban">Kanban Board &amp; Pipeline</option>
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

                {/* TAB 2: User Profile (About Me) */}
                {activeTab === 'profile' && (
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
                )}

                {/* TAB 3: AI Engine */}
                {activeTab === 'ai' && (
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
                )}

                {/* TAB 4: Research Playbooks */}
                {activeTab === 'playbooks' && (
                  <div className="settings-panel" role="tabpanel" style={{ padding: 0 }}>
                    <PlaybookManager showToast={showToast} onOpenLicenseModal={onOpenLicenseModal} />
                  </div>
                )}

                {/* TAB 5: Scheduled Research */}
                {activeTab === 'schedule' && (
                  <div className="settings-panel" role="tabpanel" style={{ padding: 0 }}>
                    <ResearchScheduler showToast={showToast} onOpenLicenseModal={onOpenLicenseModal} />
                  </div>
                )}

                {/* TAB 6: Channels */}
                {activeTab === 'channels' && (
                  <ChannelsTab
                    tgToken={tgToken}
                    setTgToken={setTgToken}
                    hasTgToken={hasTgToken}
                    tgChatId={tgChatId}
                    openclawUrl={openclawUrl}
                    setOpenclawUrl={setOpenclawUrl}
                    openclawToken={openclawToken}
                    setOpenclawToken={setOpenclawToken}
                    hasOpenclawToken={hasOpenclawToken}
                    openclawChannel={openclawChannel}
                    setOpenclawChannel={setOpenclawChannel}
                    openclawTarget={openclawTarget}
                    setOpenclawTarget={setOpenclawTarget}
                    openclawEnabled={openclawEnabled}
                    setOpenclawEnabled={setOpenclawEnabled}
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
                )}

                {/* TAB 7: Integrations & API */}
                {activeTab === 'integrations' && (
                  <IntegrationsTab showToast={showToast} />
                )}

                {/* TAB 8: Security & Access */}
                {activeTab === 'security' && (
                  <SecurityTab
                    authToken={authToken}
                    setAuthToken={setAuthToken}
                    confirmAuthToken={confirmAuthToken}
                    setConfirmAuthToken={setConfirmAuthToken}
                    hasAuthToken={hasAuthToken}
                    showToast={showToast}
                    onOpenLicenseModal={onOpenLicenseModal}
                  />
                )}
              </div>
            )}

            {/* Modal Footer Actions (Save Changes / Cancel) with Dirty Tracking */}
            {activeTab !== 'playbooks' && activeTab !== 'schedule' && (
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
    </div>,
    document.body
  );
}
