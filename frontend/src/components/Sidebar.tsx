import React from 'react';
import { Tag } from '../types';
import { Tag as TagIcon, Coffee, ChevronLeft } from 'lucide-react';
import { useLocale } from '../i18n';

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
  const { t } = useLocale();

  if (isCollapsed) {
    return (
      <div className="sidebar-collapse-container" style={{ width: 0 }}>
        <button
          type="button"
          className={`sidebar-vertical-tab ${selectedTag ? 'has-active-tag' : ''}`}
          onClick={onToggleCollapse}
          title={selectedTag ? t('shell.sidebar.filteredBy', { tag: selectedTag }) : t('shell.sidebar.expand')}
        >
          <span className="tag-glyph">#</span>
          <span className="tag-label">{t('shell.sidebar.tagsTab')}{selectedTag ? ` · ${selectedTag}` : ''}</span>
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
              {t('shell.sidebar.tags')}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {selectedTag && (
                <button
                  onClick={() => onTagSelect('')}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 11, cursor: 'pointer' }}
                >
                  {t('common.clear')}
                </button>
              )}
              <button
                type="button"
                className="sidebar-collapse-btn"
                onClick={onToggleCollapse}
                title={t('shell.sidebar.collapse')}
              >
                <ChevronLeft size={16} strokeWidth={2} />
              </button>
            </div>
          </div>
          <div className="tag-cloud chips" id="rail-tags">
            {tags.length === 0 ? (
              <span style={{ fontSize: 12, color: '#64748b' }}>{t('shell.sidebar.noTags')}</span>
            ) : (
              tags.map((tag) => (
                <button
                  key={tag.name}
                  type="button"
                  className={`tag-chip chip ${selectedTag === tag.name ? 'active' : ''}`}
                  data-tag={tag.name}
                  onClick={() => onTagSelect(selectedTag === tag.name ? '' : tag.name)}
                >
                  <span>#{tag.name}</span>
                  <span className="count">{tag.count}</span>
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
            title={t('shell.sidebar.supportTitle')}
          >
            <div className="sidebar-support-icon">
              <Coffee size={14} strokeWidth={2} />
            </div>
            <span className="sidebar-support-text">{t('shell.sidebar.support')}</span>
          </a>
        </div>
      </aside>
    </div>
  );
};
