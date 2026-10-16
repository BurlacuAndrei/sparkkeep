import React, { useState, useMemo } from 'react';
import { Search, Plus, Sparkles, X, Globe, Brain } from 'lucide-react';
import { StepLibraryTemplate } from '../../types';
import { UserSavedStepTemplate } from './constants';

export interface QuickAddPaletteProps {
  insertIndex: number;
  totalSteps: number;
  onClose: () => void;
  onAddBlank: (name?: string) => void;
  onAddTemplate: (template: StepLibraryTemplate | UserSavedStepTemplate) => void;
  libraryTemplates?: StepLibraryTemplate[];
  userStepTemplates?: UserSavedStepTemplate[];
}

export const QuickAddPalette: React.FC<QuickAddPaletteProps> = ({
  insertIndex,
  totalSteps,
  onClose,
  onAddBlank,
  onAddTemplate,
  libraryTemplates = [],
  userStepTemplates = [],
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLibrary = useMemo(() => {
    if (!searchQuery.trim()) return libraryTemplates;
    const q = searchQuery.toLowerCase();
    return libraryTemplates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.heading.toLowerCase().includes(q)
    );
  }, [libraryTemplates, searchQuery]);

  const filteredUserTemplates = useMemo(() => {
    if (!searchQuery.trim()) return userStepTemplates;
    const q = searchQuery.toLowerCase();
    return userStepTemplates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.heading.toLowerCase().includes(q)
    );
  }, [userStepTemplates, searchQuery]);

  return (
    <div
      className="pb-quick-add-palette"
      data-testid="quick-add-palette"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pb-palette-header">
        <div className="pb-palette-title-box">
          <Sparkles size={14} className="pb-palette-icon" />
          <span className="pb-palette-title">
            Insert Step at Position {insertIndex + 1} of {totalSteps + 1}
          </span>
        </div>
        <button
          type="button"
          className="btn-icon"
          onClick={onClose}
          aria-label="Close step palette"
        >
          <X size={13} />
        </button>
      </div>

      <div className="pb-palette-search">
        <Search size={13} className="pb-palette-search-icon" />
        <input
          type="text"
          className="pb-palette-search-input"
          placeholder="Filter step primitives or type a custom name…"
          aria-label="Filter step primitives"
          autoFocus
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && searchQuery.trim()) {
              e.preventDefault();
              onAddBlank(searchQuery.trim());
            }
          }}
        />
      </div>

      <div className="pb-palette-actions">
        <button
          type="button"
          className="pb-palette-quick-action"
          data-testid="add-blank-step-btn"
          onClick={() => onAddBlank(searchQuery.trim() || undefined)}
        >
          <Plus size={13} />
          <span>
            {searchQuery.trim()
              ? `Create Blank Custom Step "${searchQuery.trim()}"`
              : 'Create Blank Custom Step'}
          </span>
        </button>
      </div>

      <div className="pb-palette-list" role="listbox">
        {filteredUserTemplates.length > 0 && (
          <div className="pb-palette-group">
            <span className="pb-palette-group-label">Saved Custom Steps</span>
            {filteredUserTemplates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                className="pb-palette-item"
                data-testid={`palette-template-${tpl.id}`}
                onClick={() => onAddTemplate(tpl)}
              >
                <div className="pb-palette-item-left">
                  <span className="pb-palette-item-icon">✨</span>
                  <div className="pb-palette-item-meta">
                    <span className="pb-palette-item-name">{tpl.name}</span>
                    <span className="pb-palette-item-desc">{tpl.description}</span>
                  </div>
                </div>
                <span className="pb-palette-policy-badge">
                  {tpl.tool_policy === 'search' ? (
                    <><Globe size={10} /> Search</>
                  ) : (
                    <><Brain size={10} /> Reasoning</>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}

        {filteredLibrary.length > 0 && (
          <div className="pb-palette-group">
            <span className="pb-palette-group-label">Standard Step Library</span>
            {filteredLibrary.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                className="pb-palette-item"
                data-testid={`palette-template-${tpl.id}`}
                onClick={() => onAddTemplate(tpl)}
              >
                <div className="pb-palette-item-left">
                  <span className="pb-palette-item-icon">{tpl.icon}</span>
                  <div className="pb-palette-item-meta">
                    <span className="pb-palette-item-name">{tpl.name}</span>
                    <span className="pb-palette-item-desc">{tpl.description}</span>
                  </div>
                </div>
                <span className="pb-palette-policy-badge">
                  {tpl.tool_policy === 'search' ? (
                    <><Globe size={10} /> Search</>
                  ) : (
                    <><Brain size={10} /> Reasoning</>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}

        {filteredLibrary.length === 0 && filteredUserTemplates.length === 0 && (
          <div className="pb-palette-empty">
            No matching step primitives. Press Enter to create a custom step.
          </div>
        )}
      </div>
    </div>
  );
};
