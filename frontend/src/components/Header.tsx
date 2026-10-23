import React, { useEffect, useState, useRef } from 'react';
import { Sparkles, Calendar, Layers, Zap, Settings, Coffee, BookOpen, Plug, RefreshCw, RotateCcw, Copy, Eye, EyeOff, Rss, Globe, Database, BookOpen as BookOpenIcon, HardDrive } from 'lucide-react';
import { Omnisearch } from './Omnisearch';
import { Card, Tag, ViewMode, Settings as SettingsType } from '../types';
import { SettingsTab } from './SettingsModal';
import * as api from '../api';
import { useLocale } from '../i18n';

interface HeaderProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onOpenNewCard: () => void;
  flashMessage: string;
  onOpenSettingsModal: (tab?: SettingsTab) => void;
  triageCount?: number;
  allCards: Card[];
  tags: Tag[];
  onSelectCard: (card: Card) => void;
  onSelectTag: (tag: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  viewMode,
  onViewModeChange,
  onOpenNewCard,
  flashMessage,
  onOpenSettingsModal,
  triageCount,
  allCards,
  tags,
  onSelectCard,
  onSelectTag,
}) => {
  const { t, tp } = useLocale();
  // Global keyboard shortcut to open new spark: 'c' or 'n'
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputActive =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        (activeEl instanceof HTMLElement && activeEl.isContentEditable);

      // 'c' or 'n' when not inside an input/textarea opens capture
      if ((e.key === 'c' || e.key === 'n') && !isInputActive && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onOpenNewCard();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenNewCard]);

  // Integrations Dropdown State
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const integrationsRef = useRef<HTMLDivElement>(null);
  const [integrationsSettings, setIntegrationsSettings] = useState<SettingsType | null>(null);
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [syncingSink, setSyncingSink] = useState<string | null>(null);
  const [togglingSink, setTogglingSink] = useState<string | null>(null);
  const [outboxToken, setOutboxToken] = useState<string>('');
  const [showOutboxToken, setShowOutboxToken] = useState(false);
  const [loadingOutboxToken, setLoadingOutboxToken] = useState(false);
  const [regeneratingOutboxToken, setRegeneratingOutboxToken] = useState(false);
  const [syncResults, setSyncResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const outboxFeedUrl = typeof window === 'undefined' || !outboxToken
    ? ''
    : `${window.location.origin}/api/v1/feed.xml?token=${outboxToken}`;

  // Close dropdown on outside click
  useEffect(() => {
    if (!integrationsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (integrationsRef.current && !integrationsRef.current.contains(e.target as Node)) {
        setIntegrationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [integrationsOpen]);

  // Load settings when dropdown opens
  const loadIntegrationsSettings = async () => {
    setLoadingIntegrations(true);
    try {
      const res = await api.getSettings();
      if (res.ok && res.settings) {
        setIntegrationsSettings(res.settings);
      }
    } catch (err) {
      console.error('Failed to load integrations settings:', err);
    } finally {
      setLoadingIntegrations(false);
    }
  };

  const handleToggleIntegrations = () => {
    const next = !integrationsOpen;
    setIntegrationsOpen(next);
    if (next) {
      loadIntegrationsSettings();
    }
  };

  const handleSyncSink = async (sink: 'obsidian' | 'notion' | 'joplin') => {
    setSyncingSink(sink);
    setSyncResults(prev => ({ ...prev, [sink]: { success: false, message: t('common.syncing') } }));
    try {
      let res;
      if (sink === 'obsidian') {
        res = await api.syncObsidian(integrationsSettings?.obsidian_vault_path);
      } else if (sink === 'notion') {
        res = await api.syncNotion();
      } else {
        res = await api.syncJoplin();
      }
      const msg = tp('shell.header.syncedNotes', res.written);
      setSyncResults(prev => ({ ...prev, [sink]: { success: true, message: `✅ ${msg}` } }));
    } catch (err: unknown) {
      const errMsg = api.getErrorMessage(err);
      setSyncResults(prev => ({ ...prev, [sink]: { success: false, message: `❌ ${errMsg}` } }));
    } finally {
      setSyncingSink(null);
    }
  };

  const handleToggleAutoExport = async (sink: 'obsidian' | 'notion' | 'joplin', currentValue: boolean) => {
    setTogglingSink(sink);
    try {
      await api.patchSettings({ [`${sink}_auto_export`]: !currentValue });
      setIntegrationsSettings(prev => prev ? { ...prev, [`${sink}_auto_export`]: !currentValue } : null);
    } catch (err: unknown) {
      console.error(`Failed to toggle ${sink} auto-export:`, err);
    } finally {
      setTogglingSink(null);
    }
  };

  const handleLoadOutboxToken = async () => {
    setLoadingOutboxToken(true);
    try {
      const res = await api.getOutboxFeedToken();
      if (res.ok && res.token) {
        setOutboxToken(res.token);
        setShowOutboxToken(true);
      }
    } catch (err) {
      console.error('Failed to load outbox token:', err);
    } finally {
      setLoadingOutboxToken(false);
    }
  };

  const handleRegenerateOutboxToken = async () => {
    setRegeneratingOutboxToken(true);
    try {
      const res = await api.regenerateOutboxFeedToken();
      if (res.ok && res.token) {
        setOutboxToken(res.token);
        setShowOutboxToken(true);
      }
    } catch (err) {
      console.error('Failed to regenerate outbox token:', err);
    } finally {
      setRegeneratingOutboxToken(false);
    }
  };

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      // Could add toast here but no showToast prop in Header
    }
  };

  const getConfiguredSinks = (settings: SettingsType | null) => {
    if (!settings) return [];
    const sinks = [];
    if (settings.obsidian_vault_path) sinks.push({ id: 'obsidian', label: t('shell.header.sinkObsidian'), icon: BookOpenIcon, color: '#483699', autoExport: settings.obsidian_auto_export });
    if (settings.notion_token && settings.notion_database_id) sinks.push({ id: 'notion', label: t('shell.header.sinkNotion'), icon: Database, color: '#000000', autoExport: settings.notion_auto_export });
    if ((settings.joplin_token || settings.joplin_email) && settings.joplin_base_url) sinks.push({ id: 'joplin', label: t('shell.header.sinkJoplin'), icon: HardDrive, color: '#2e7d32', autoExport: settings.joplin_auto_export });
    return sinks;
  };

  const formatLastSync = (sink: string) => {
    // For now, we don't persist last sync time; show from syncResults or "Never"
    const result = syncResults[sink];
    if (result) return result.message;
    return t('shell.header.neverSynced');
  };

  return (
    <header className="topbar">
      {/* Zone 1: Identity & Mode Navigation */}
      <div className="topbar-left">
        <div
          className="brand"
          onClick={() => onViewModeChange('boards')}
          title={t('shell.header.brandTitle')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              onViewModeChange('boards');
            }
          }}
        >
          <div className="brand-icon">
            <Sparkles size={16} strokeWidth={1.75} color="#fff" />
          </div>
          <span className="brand-title">sparkkeep</span>
        </div>

        <nav className="nav-tabs" aria-label={t('shell.header.navAria')}>
          <button
            type="button"
            className={`nav-tab ${viewMode === 'triage' ? 'active' : ''}`}
            onClick={() => onViewModeChange('triage')}
            title={t('shell.header.triageTitle')}
          >
            <Zap size={13} strokeWidth={1.75} />
            <span>{t('shell.header.triage')}</span>
            {typeof triageCount === 'number' && triageCount > 0 && (
              <span className="nav-tab-badge">
                {triageCount}
              </span>
            )}
          </button>
          <button
            type="button"
            className={`nav-tab ${viewMode === 'boards' ? 'active' : ''}`}
            onClick={() => onViewModeChange('boards')}
            title={t('shell.header.boardsTitle')}
          >
            <Layers size={13} strokeWidth={1.75} />
            <span>{t('shell.header.boards')}</span>
          </button>
          <button
            id="digest-btn"
            type="button"
            className={`nav-tab ${viewMode === 'digest' ? 'active on' : ''}`}
            onClick={() => onViewModeChange(viewMode === 'digest' ? 'boards' : 'digest')}
            title={t('shell.header.digestTitle')}
          >
            <Calendar size={13} strokeWidth={1.75} />
            <span>{t('shell.header.digest')}</span>
          </button>
          <button
            id="playbooks-btn"
            type="button"
            className={`nav-tab ${viewMode === 'playbooks' ? 'active' : ''}`}
            onClick={() => onViewModeChange('playbooks')}
            title={t('shell.header.playbooksTitle')}
          >
            <BookOpen size={13} strokeWidth={1.75} />
            <span>{t('shell.header.playbooks')}</span>
          </button>
        </nav>
      </div>

      {/* Zone 2: Global Omnisearch */}
      <div className="topbar-center">
        <Omnisearch
          allCards={allCards}
          tags={tags}
          triageCount={triageCount}
          onSelectCard={onSelectCard}
          onSelectTag={onSelectTag}
          onViewModeChange={onViewModeChange}
          onOpenNewCard={onOpenNewCard}
          onOpenSettingsModal={onOpenSettingsModal}
        />
      </div>

      {/* Zone 3: Actions & System */}
      <div className="topbar-right">
        <a
          href="https://ko-fi.com/andreiburlacu"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary icon-only-btn header-support-btn"
          title={t('shell.header.supportTitle')}
          aria-label={t('shell.header.supportTitle')}
          style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Coffee size={14} strokeWidth={1.75} />
        </a>

        {/* Integrations Dropdown */}
        <div style={{ position: 'relative' }} ref={integrationsRef}>
          <button
            type="button"
            className={`btn-secondary icon-only-btn ${integrationsOpen ? 'active' : ''}`}
            onClick={handleToggleIntegrations}
            title={t('shell.header.integrationsTitle')}
            aria-label={t('shell.header.integrations')}
            aria-expanded={integrationsOpen}
            aria-haspopup="true"
          >
            <Plug size={14} strokeWidth={1.75} />
          </button>

          {integrationsOpen && (
            <div
              className="integrations-dropdown"
              style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                marginTop: '8px',
                minWidth: '340px',
                width: '380px',
                maxWidth: 'calc(100vw - 24px)',
                maxHeight: '60vh',
                overflowY: 'auto',
                overflowX: 'hidden',
                background: 'var(--bg-surface-elevated, #161822)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg, 12px)',
                padding: '12px',
                boxShadow: 'var(--shadow-xl, 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1))',
                zIndex: 100,
              }}
              role="menu"
            >
              {loadingIntegrations ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)' }}>{t('shell.header.integrationsLoading')}</div>
              ) : (
                <>
                  {(() => {
                    const sinks = getConfiguredSinks(integrationsSettings);
                    if (sinks.length === 0) {
                      return (
                        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-dim)' }}>
                          <Plug size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                          <div style={{ fontWeight: 500, marginBottom: '4px' }}>{t('shell.header.noSinks')}</div>
                          <div style={{ fontSize: '12px', marginBottom: '12px' }}>{t('shell.header.noSinksHint')}</div>
                          <button
                            type="button"
                            className="setup-btn-primary"
                            onClick={() => { setIntegrationsOpen(false); onOpenSettingsModal('integrations'); }}
                            style={{ fontSize: '12px', padding: '6px 12px' }}
                          >
                            {t('shell.header.openIntegrations')}
                          </button>
                        </div>
                      );
                    }
                    return sinks.map((sink) => {
                      const Icon = sink.icon;
                      const result = syncResults[sink.id];
                      const isSyncing = syncingSink === sink.id;
                      const isToggling = togglingSink === sink.id;
                      const autoExport = sink.autoExport ?? false;
                      return (
                        <div key={sink.id} style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px', marginBottom: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                            <Icon size={18} style={{ color: sink.color }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-main)' }}>{sink.label}</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                                {formatLastSync(sink.id)}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-main)' }}>
                              <input
                                type="checkbox"
                                checked={autoExport}
                                onChange={() => handleToggleAutoExport(sink.id as 'obsidian' | 'notion' | 'joplin', autoExport)}
                                disabled={isToggling}
                                style={{ width: '14px', height: '14px', accentColor: 'var(--accent)' }}
                              />
                              <span>{t('shell.header.autoExport')}</span>
                            </label>
                            <button
                              type="button"
                              className="setup-btn-primary"
                              onClick={() => handleSyncSink(sink.id as 'obsidian' | 'notion' | 'joplin')}
                              disabled={isSyncing}
                              style={{ fontSize: '11px', padding: '5px 10px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              {isSyncing ? (
                                <>
                                  <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} />
                                  {t('common.syncing')}
                                </>
                              ) : (
                                <>
                                  <RefreshCw size={11} />
                                  {t('shell.header.syncNow')}
                                </>
                              )}
                            </button>
                          </div>
                          {result && (
                            <div
                              style={{
                                marginTop: '8px',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                background: result.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                border: `1px solid ${result.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                                color: result.success ? 'var(--accent-emerald, #10b981)' : 'var(--color-error, #ef4444)',
                              }}
                            >
                              {result.message}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}

                  {/* Outbox RSS Feed */}
                  <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px', marginTop: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <Rss size={16} style={{ color: 'var(--accent)' }} />
                      <strong style={{ fontSize: '12px', color: 'var(--text-main)' }}>{t('shell.header.outboxTitle')}</strong>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '8px' }}>
                      {t('shell.header.outboxDesc')}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {!outboxToken && !loadingOutboxToken && (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={handleLoadOutboxToken}
                          disabled={loadingOutboxToken}
                          style={{ fontSize: '12px', padding: '6px 10px', width: '100%', justifyContent: 'center' }}
                        >
                          {loadingOutboxToken ? t('common.loading') : t('shell.header.loadToken')}
                        </button>
                      )}
                      {outboxToken && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                            <span style={{ fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                              {t('shell.header.feedToken')}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                              <code
                                style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)', background: 'var(--bg-surface)', padding: '5px 8px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}
                              >
                                {showOutboxToken ? outboxToken : '••••••••••••••••'}
                              </code>
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setShowOutboxToken(!showOutboxToken)}
                                title={showOutboxToken ? t('shell.header.hideToken') : t('shell.header.showToken')}
                                aria-label={showOutboxToken ? t('shell.header.hideFeedToken') : t('shell.header.showFeedToken')}
                                style={{ padding: '4px 6px', flexShrink: 0 }}
                              >
                                {showOutboxToken ? <EyeOff size={12} /> : <Eye size={12} />}
                              </button>
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => copyToClipboard(outboxToken)}
                                title={t('shell.header.copyToken')}
                                aria-label={t('shell.header.copyFeedToken')}
                                style={{ padding: '4px 6px', flexShrink: 0 }}
                              >
                                <Copy size={12} />
                              </button>
                            </div>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                            <span style={{ fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                              {t('shell.header.feedUrl')}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                              <code
                                title={outboxFeedUrl}
                                style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)', background: 'var(--bg-surface)', padding: '5px 8px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}
                              >
                                {outboxFeedUrl}
                              </code>
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => copyToClipboard(outboxFeedUrl)}
                                title={t('shell.header.copyUrl')}
                                aria-label={t('shell.header.copyFeedUrl')}
                                style={{ padding: '4px 6px', flexShrink: 0 }}
                              >
                                <Globe size={12} />
                              </button>
                            </div>
                          </div>

                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={handleRegenerateOutboxToken}
                            disabled={regeneratingOutboxToken}
                            style={{ fontSize: '11px', padding: '5px 10px', width: '100%', justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            {regeneratingOutboxToken ? (
                              <>
                                <RotateCcw size={11} style={{ animation: 'spin 1s linear infinite' }} />
                                {t('shell.header.regenerating')}
                              </>
                            ) : (
                              <>
                                <RotateCcw size={11} />
                                {t('shell.header.regenerate')}
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          className="btn-secondary icon-only-btn"
          onClick={() => onOpenSettingsModal()}
          title={t('shell.header.settingsTitle')}
          aria-label={t('shell.header.settings')}
        >
          <Settings size={14} strokeWidth={1.75} />
        </button>

        <button
          id="new-card-btn"
          type="button"
          className="btn-primary new-card-cta"
          onClick={onOpenNewCard}
          title={t('shell.header.newSparkTitle')}
        >
          <Sparkles size={14} strokeWidth={2} />
          <span>{t('shell.header.newSpark')}</span>
        </button>
      </div>

      <span id="flash" style={{ display: 'none' }}>{flashMessage}</span>
    </header>
  );
};