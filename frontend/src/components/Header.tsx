import React from 'react';
import { Sparkles, Search, Plus, Calendar, Layers, Zap } from 'lucide-react';

interface HeaderProps {
  query: string;
  onQueryChange: (q: string) => void;
  viewMode: 'kanban' | 'triage' | 'digest';
  onViewModeChange: (mode: 'kanban' | 'triage' | 'digest') => void;
  onOpenNewCard: () => void;
  onTriggerResearch: (cardId: number) => void;
  flashMessage: string;
}

export const Header: React.FC<HeaderProps> = ({
  query,
  onQueryChange,
  viewMode,
  onViewModeChange,
  onOpenNewCard,
  onTriggerResearch,
  flashMessage,
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
      <div className="brand" onClick={() => onViewModeChange('kanban')}>
        <div className="brand-icon">
          <Sparkles size={18} color="#fff" />
        </div>
        <span className="brand-title">sparkkeep</span>
        <span className="brand-badge">V2 Engine</span>
      </div>

      <div className="search-wrapper">
        <Search size={15} className="search-icon" />
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
            title="Focus Triage Mode (Action Engine)"
          >
            <Zap size={14} />
            <span>Triage</span>
          </button>
          <button
            type="button"
            className={`nav-tab ${viewMode === 'kanban' ? 'active' : ''}`}
            onClick={() => onViewModeChange('kanban')}
            title="Kanban Board View"
          >
            <Layers size={14} />
            <span>Boards</span>
          </button>
          <button
            id="digest-btn"
            type="button"
            className={`nav-tab ${viewMode === 'digest' ? 'active on' : ''}`}
            onClick={() => onViewModeChange(viewMode === 'digest' ? 'kanban' : 'digest')}
            title="Weekly Digest Timeline"
          >
            <Calendar size={14} />
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

        <button id="new-card-btn" type="button" className="btn-primary" onClick={onOpenNewCard}>
          <Plus size={15} />
          <span>New Card</span>
        </button>
      </div>

      <span id="flash" style={{ display: 'none' }}>{flashMessage}</span>
    </header>
  );
};