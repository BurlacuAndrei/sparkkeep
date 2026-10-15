import React from 'react';
import { Tag } from '../types';
import { Tag as TagIcon, Coffee, ChevronLeft } from 'lucide-react';

interface SidebarProps {
  selectedTag: string;
  onTagSelect: (t: string) => void;
  tags: Tag[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  selectedTag,
  onTagSelect,
  tags,
  isCollapsed,
  onToggleCollapse,
}) => {
  if (isCollapsed) {
    return (
      <div className="sidebar-collapse-container" style={{ width: 0 }}>
        <button
          type="button"
          className={`sidebar-vertical-tab ${selectedTag ? 'has-active-tag' : ''}`}
          onClick={onToggleCollapse}
          title={selectedTag ? `Filtered by #${selectedTag}. Click to expand tags.` : 'Expand tags panel'}
        >
          <span className="tag-glyph">#</span>
          <span className="tag-label">TAGS{selectedTag ? ` · ${selectedTag}` : ''}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="sidebar-collapse-container" style={{ width: '240px' }}>
      <aside className="sidebar" style={{ width: '240px', boxSizing: 'border-box' }}>
        <div className="filter-group">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="filter-title">
              <TagIcon size={13} strokeWidth={1.5} style={{ display: 'inline', marginRight: 5 }} />
              Tags
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {selectedTag && (
                <button
                  onClick={() => onTagSelect('')}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 11, cursor: 'pointer' }}
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                className="sidebar-collapse-btn"
                onClick={onToggleCollapse}
                title="Collapse sidebar"
              >
                <ChevronLeft size={16} strokeWidth={2} />
              </button>
            </div>
          </div>
          <div className="tag-cloud chips" id="rail-tags">
            {tags.length === 0 ? (
              <span style={{ fontSize: 12, color: '#64748b' }}>No tags yet</span>
            ) : (
              tags.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  className={`tag-chip chip ${selectedTag === t.name ? 'active' : ''}`}
                  data-tag={t.name}
                  onClick={() => onTagSelect(selectedTag === t.name ? '' : t.name)}
                >
                  <span>#{t.name}</span>
                  <span className="count">{t.count}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="sidebar-footer">
          <a
            href="https://ko-fi.com/andreiburlacu"
            target="_blank"
            rel="noopener noreferrer"
            className="sidebar-support-link"
            title="Buy me a coffee on Ko-fi"
          >
            <div className="sidebar-support-icon">
              <Coffee size={14} strokeWidth={2} />
            </div>
            <span className="sidebar-support-text">Buy me a coffee</span>
          </a>
        </div>
      </aside>
    </div>
  );
};
