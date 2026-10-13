import React, { useRef, useEffect, useState } from 'react';
import { Sparkles, Search, Plus, Calendar, Layers, Zap, Settings, X } from 'lucide-react';

interface HeaderProps {
  query: string;
  onQueryChange: (q: string) => void;
  viewMode: 'triage' | 'boards' | 'digest';
  onViewModeChange: (mode: 'triage' | 'boards' | 'digest') => void;
  onOpenNewCard: () => void;
  flashMessage: string;
  isPro?: boolean;
  onOpenLicenseModal: () => void;
  onOpenSettingsModal: () => void;
  triageCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  query,
  onQueryChange,
  viewMode,
  onViewModeChange,
  onOpenNewCard,
  flashMessage,
  isPro,
  onOpenLicenseModal,
  onOpenSettingsModal,
  triageCount,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
  const shortcutLabel = isMac ? '⌘K' : 'Ctrl+K';

  // Global keyboard shortcut to focus search: '/' or 'Cmd+K' / 'Ctrl+K'
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputActive =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        (activeEl instanceof HTMLElement && activeEl.isContentEditable);

      // Cmd+K or Ctrl+K anywhere
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }

      // '/' when not inside an input/textarea
      if (e.key === '/' && !isInputActive) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
        </nav>
      </div>

      {/* Zone 2: Global Omnisearch */}
      <div className="topbar-center">
        <div className={`search-wrapper ${isFocused ? 'focused' : ''} ${query ? 'has-query' : ''}`}>
          <Search size={14} strokeWidth={1.75} className="search-icon" />
          <input
            ref={inputRef}
            id="q"
            type="search"
            className="search-input"
            placeholder="Search briefings, tags, sparks…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                if (query) {
                  onQueryChange('');
                } else {
                  inputRef.current?.blur();
                }
              }
            }}
          />
          {query ? (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => {
                onQueryChange('');
                inputRef.current?.focus();
              }}
              title="Clear search (Esc)"
              aria-label="Clear search"
            >
              <X size={13} strokeWidth={2} />
            </button>
          ) : (
            <div className="search-kbd-badge" title={`Press ${shortcutLabel} or / to search`}>
              <kbd>{shortcutLabel}</kbd>
            </div>
          )}
        </div>
      </div>

      {/* Zone 3: Actions & System */}
      <div className="topbar-right">
        <button
          type="button"
          className={`license-trigger-btn ${isPro ? 'pro' : 'community'}`}
          onClick={onOpenLicenseModal}
          title={isPro ? "Sparkkeep Pro Lifetime Active" : "Upgrade to Sparkkeep Pro"}
        >
          <Sparkles size={12} strokeWidth={2} />
          <span>{isPro ? "PRO" : "Upgrade"}</span>
        </button>

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
          title="Capture New Spark"
        >
          <Plus size={14} strokeWidth={2.25} />
          <span>New Spark</span>
        </button>
      </div>

      <span id="flash" style={{ display: 'none' }}>{flashMessage}</span>
    </header>
  );
};