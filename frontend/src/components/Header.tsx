import React, { useEffect } from 'react';
import { Sparkles, Calendar, Layers, Zap, Settings, Coffee, BookOpen } from 'lucide-react';
import { Omnisearch } from './Omnisearch';
import { Card, Tag, ViewMode } from '../types';

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