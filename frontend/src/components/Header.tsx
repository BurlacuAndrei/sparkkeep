import React from 'react';
import { Sparkles, Search, Plus, Calendar, Layers, Zap, Settings } from 'lucide-react';

interface HeaderProps {
  query: string;
  onQueryChange: (q: string) => void;
  viewMode: 'triage' | 'boards' | 'digest';
  onViewModeChange: (mode: 'triage' | 'boards' | 'digest') => void;
  onOpenNewCard: () => void;
  onTriggerResearch: (cardId: number) => void;
  flashMessage: string;
  isPro?: boolean;
  onOpenLicenseModal: () => void;
  onOpenSettingsModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  query,
  onQueryChange,
  viewMode,
  onViewModeChange,
  onOpenNewCard,
  onTriggerResearch,
  flashMessage,
  isPro,
  onOpenLicenseModal,
  onOpenSettingsModal,
}) => {
  const [researchId, setResearchId] = React.useState('');

  const handleResearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseInt(researchId.trim(), 10);
    if (!isNaN(id) && id > 0) {
      onTriggerResearch(id);
      setResearchId('');
    }
  };

  return (
    <header className="topbar">
      <div className="brand" onClick={() => onViewModeChange('boards')}>
        <div className="brand-icon">
          <Sparkles size={16} strokeWidth={1.75} color="#fff" />
        </div>
        <span className="brand-title">sparkkeep</span>
      </div>

      <div className="search-wrapper">
        <Search size={14} strokeWidth={1.5} className="search-icon" />
        <input
          id="q"
          type="search"
          className="search-input"
          placeholder="Search briefings, actions, tags, titles… (Ctrl+/)"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </div>

      <div className="topbar-actions">
        <div className="nav-tabs">
          <button
            type="button"
            className={`nav-tab ${viewMode === 'triage' ? 'active' : ''}`}
            onClick={() => onViewModeChange('triage')}
            title="Idea Funnel"
          >
            <Zap size={13} strokeWidth={1.5} />
            <span>Triage</span>
          </button>
          <button
            type="button"
            className={`nav-tab ${viewMode === 'boards' ? 'active' : ''}`}
            onClick={() => onViewModeChange('boards')}
            title="Execution Boards"
          >
            <Layers size={13} strokeWidth={1.5} />
            <span>Boards</span>
          </button>
          <button
            id="digest-btn"
            type="button"
            className={`nav-tab ${viewMode === 'digest' ? 'active on' : ''}`}
            onClick={() => onViewModeChange(viewMode === 'digest' ? 'boards' : 'digest')}
            title="Weekly Digest Timeline"
          >
            <Calendar size={13} strokeWidth={1.5} />
            <span>Digest</span>
          </button>
        </div>

        <form onSubmit={handleResearchSubmit} className="quick-research">
          <input
            id="research-id"
            type="number"
            min="1"
            placeholder="Card ID"
            value={researchId}
            onChange={(e) => setResearchId(e.target.value)}
          />
          <button id="research-btn" type="submit" className="btn-secondary">
            Research
          </button>
        </form>

        <button
          type="button"
          className={`license-trigger-btn ${isPro ? 'pro' : 'community'}`}
          onClick={onOpenLicenseModal}
          title={isPro ? "Sparkkeep Pro Lifetime Active" : "Upgrade to Sparkkeep Pro"}
        >
          <Sparkles size={13} strokeWidth={1.75} />
          <span>{isPro ? "PRO" : "Upgrade"}</span>
        </button>

        <button type="button" className="btn-secondary" onClick={onOpenSettingsModal} title="Settings" style={{ padding: '0 10px' }}>
          <Settings size={14} strokeWidth={1.75} />
        </button>

        <button id="new-card-btn" type="button" className="btn-primary" onClick={onOpenNewCard}>
          <Plus size={14} strokeWidth={1.75} />
          <span>New Card</span>
        </button>
      </div>

      <span id="flash" style={{ display: 'none' }}>{flashMessage}</span>
    </header>
  );
};