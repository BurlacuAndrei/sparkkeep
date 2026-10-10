import React from 'react';
import { Tag } from '../types';
import { Tag as TagIcon } from 'lucide-react';

interface SidebarProps {
  selectedTag: string;
  onTagSelect: (t: string) => void;
  tags: Tag[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  selectedTag,
  onTagSelect,
  tags,
}) => {
  return (
    <aside className="sidebar">

      <div className="filter-group">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="filter-title">
            <TagIcon size={13} strokeWidth={1.5} style={{ display: 'inline', marginRight: 5 }} />
            Tags
          </span>
          {selectedTag && (
            <button
              onClick={() => onTagSelect('')}
              style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 11, cursor: 'pointer' }}
            >
              Clear
            </button>
          )}
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
    </aside>
  );
};
