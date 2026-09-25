import React from 'react';
import { Tag } from '../types';
import { Compass, Filter, Tag as TagIcon } from 'lucide-react';

interface SidebarProps {
  horizon: string;
  onHorizonChange: (h: string) => void;
  status: string;
  onStatusChange: (s: string) => void;
  selectedTag: string;
  onTagSelect: (t: string) => void;
  tags: Tag[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  horizon,
  onHorizonChange,
  status,
  onStatusChange,
  selectedTag,
  onTagSelect,
  tags,
}) => {
  return (
    <aside className="sidebar">
      <div className="filter-group">
        <span className="filter-title">
          <Compass size={12} style={{ display: 'inline', marginRight: 4 }} />
          Horizon
        </span>
        <select
          id="horizon"
          className="filter-select"
          value={horizon || 'all'}
          onChange={(e) => onHorizonChange(e.target.value === 'all' ? '' : e.target.value)}
        >
          <option value="all">All Horizons</option>
          <option value="short-term">⚡ Short-term (Actionable)</option>
          <option value="lifetime">🌟 Lifetime (Bucket list)</option>
        </select>
      </div>

      <div className="filter-group">
        <span className="filter-title">
          <Filter size={12} style={{ display: 'inline', marginRight: 4 }} />
          Status
        </span>
        <select
          id="status"
          className="filter-select"
          value={status || 'all'}
          onChange={(e) => onStatusChange(e.target.value === 'all' ? '' : e.target.value)}
        >
          <option value="all">All Statuses</option>
          <option value="inbox">📥 Inbox</option>
          <option value="doing">⚡ Doing</option>
          <option value="done">✅ Done</option>
          <option value="shelved">📦 Shelved</option>
          <option value="dismissed">🚫 Dismissed</option>
        </select>
      </div>

      <div className="filter-group">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="filter-title">
            <TagIcon size={12} style={{ display: 'inline', marginRight: 4 }} />
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
