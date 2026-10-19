import React, { useEffect, useState, useRef } from 'react';
import { Sparkles, Calendar, Layers, Zap, Settings, Coffee, BookOpen, Plug, RefreshCw, RotateCcw, Copy, Eye, EyeOff, Rss, Globe, Database, BookOpen as BookOpenIcon, HardDrive } from 'lucide-react';
import { Omnisearch } from './Omnisearch';
import { Card, Tag, ViewMode, Settings as SettingsType } from '../types';
import * as api from '../api';

interface HeaderProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onOpenNewCard: () => void;
  flashMessage: string;
  onOpenSettingsModal: () => void;
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
    setSyncResults(prev => ({ ...prev, [sink]: { success: false, message: 'Syncing...' } }));
    try {
      let res;
      if (sink === 'obsidian') {
        res = await api.syncObsidian(integrationsSettings?.obsidian_vault_path);
      } else if (sink === 'notion') {
        res = await api.syncNotion();
      } else {
        res = await api.syncJoplin();
      }
      const msg = `Synced ${res.written} notes`;
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
    if (settings.obsidian_vault_path) sinks.push({ id: 'obsidian', label: 'Obsidian Vault', icon: BookOpenIcon, color: '#483699', autoExport: settings.obsidian_auto_export });
    if (settings.notion_token && settings.notion_database_id) sinks.push({ id: 'notion', label: 'Notion Database', icon: Database, color: '#000000', autoExport: settings.notion_auto_export });
    if ((settings.joplin_token || settings.joplin_email) && settings.joplin_base_url) sinks.push({ id: 'joplin', label: 'Joplin', icon: HardDrive, color: '#2e7d32', autoExport: settings.joplin_auto_export });
    return sinks;
  };

  const formatLastSync = (sink: string) => {
    // For now, we don't persist last sync time; show from syncResults or "Never"
    const result = syncResults[sink];
    if (result) return result.message;
    return 'Never synced';
  };

  return (
    <header className="topbar">
      {/* Zone 1: Identity & Mode Navigation */}
      <div className="topbar-left">
        <div
          className="brand"
          onClick={() => onViewModeChange('boards')}
          title="Sparkkeep (Execution Boards)"
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

        <nav className="nav-tabs" aria-label="Main Navigation">
          <button
            type="button"
            className={`nav-tab ${viewMode === 'triage' ? 'active' : ''}`}
            onClick={() => onViewModeChange('triage')}
            title="Idea Funnel & Triage Deck"
          >
            <Zap size={13} strokeWidth={1.75} />
            <span>Triage</span>
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
            title="Execution Boards"
          >
            <Layers size={13} strokeWidth={1.75} />
            <span>Boards</span>
          </button>
          <button
            id="digest-btn"
            type="button"
            className={`nav-tab ${viewMode === 'digest' ? 'active on' : ''}`}
            onClick={() => onViewModeChange(viewMode === 'digest' ? 'boards' : 'digest')}
            title="Weekly Digest Timeline"
          >
            <Calendar size={13} strokeWidth={1.75} />
            <span>Digest</span>
          </button>
          <button
            id="playbooks-btn"
            type="button"
            className={`nav-tab ${viewMode === 'playbooks' ? 'active' : ''}`}
            onClick={() => onViewModeChange('playbooks')}
            title="Playbook Studio"
          >
            <BookOpen size={13} strokeWidth={1.75} />
            <span>Playbooks</span>
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
          title="Buy me a coffee on Ko-fi"
          aria-label="Buy me a coffee on Ko-fi"
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
            title="Integrations & Sync"
            aria-label="Integrations"
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
                maxHeight: '60vh',
                overflowY: 'auto',
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
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)' }}>Loading integrations…</div>
              ) : (
                <>
                  {(() => {
                    const sinks = getConfiguredSinks(integrationsSettings);
                    if (sinks.length === 0) {
                      return (
                        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-dim)' }}>
                          <Plug size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                          <div style={{ fontWeight: 500, marginBottom: '4px' }}>No Knowledge Sinks configured</div>
                          <div style={{ fontSize: '12px', marginBottom: '12px' }}>Configure Obsidian, Notion, or Joplin in Settings → Integrations</div>
                          <button
                            type="button"
                            className="setup-btn-primary"
                            onClick={() => { setIntegrationsOpen(false); onOpenSettingsModal(); }}
                            style={{ fontSize: '12px', padding: '6px 12px' }}
                          >
                            Open Settings
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
                              <span>Auto-export on promote/complete</span>
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
                                  Syncing…
                                </>
                              ) : (
                                <>
                                  <RefreshCw size={11} />
                                  Sync Now
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
                      <strong style={{ fontSize: '12px', color: 'var(--text-main)' }}>Outbox RSS Feed</strong>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '8px' }}>
                      Authenticated feed for readers & automation (FreshRSS, n8n, Readwise Reader)
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
                          {loadingOutboxToken ? 'Loading…' : 'Generate / Load Feed Token'}
                        </button>
                      )}
                      {outboxToken && (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: '120px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)', background: 'var(--bg-surface)', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                              {showOutboxToken ? outboxToken : '••••••••••••••••'}
                            </div>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => setShowOutboxToken(!showOutboxToken)}
                              style={{ fontSize: '11px', padding: '4px 8px', whiteSpace: 'nowrap' }}
                            >
                              {showOutboxToken ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => copyToClipboard(outboxToken)}
                              style={{ fontSize: '11px', padding: '4px 8px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              <Copy size={12} /> Copy Token
                            </button>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: '120px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-dim)', background: 'var(--bg-surface)', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                              {typeof window !== 'undefined' ? `${window.location.origin}/api/v1/feed.xml?token=${outboxToken}` : 'feed.xml?token=…'}
                            </div>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => copyToClipboard(typeof window !== 'undefined' ? `${window.location.origin}/api/v1/feed.xml?token=${outboxToken}` : '')}
                              style={{ fontSize: '11px', padding: '4px 8px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              <Globe size={12} /> Copy URL
                            </button>
                          </div>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={handleRegenerateOutboxToken}
                            disabled={regeneratingOutboxToken}
                            style={{ fontSize: '11px', padding: '5px 10px', width: '100%', justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}
                          >
                            {regeneratingOutboxToken ? (
                              <>
                                <RotateCcw size={11} style={{ animation: 'spin 1s linear infinite' }} />
                                Regenerating…
                              </>
                            ) : (
                              <>
                                <RotateCcw size={11} />
                                Regenerate Token
                              </>
                            )}
                          </button>
                        </>
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
          onClick={onOpenSettingsModal}
          title="Settings & Integrations"
          aria-label="Settings"
        >
          <Settings size={14} strokeWidth={1.75} />
        </button>

        <button
          id="new-card-btn"
          type="button"
          className="btn-primary new-card-cta"
          onClick={onOpenNewCard}
          title="Capture New Spark (C)"
        >
          <Sparkles size={14} strokeWidth={2} />
          <span>New Spark</span>
        </button>
      </div>

      <span id="flash" style={{ display: 'none' }}>{flashMessage}</span>
    </header>
  );
};