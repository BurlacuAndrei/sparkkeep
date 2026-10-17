import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  Zap,
  Layers,
  Calendar,
  BookOpen,
  Plus,
  Settings,
  Tag as TagIcon,
  X,
  Loader2,
  FileText,
  Sparkles,
} from 'lucide-react';
import { Card, Tag, ViewMode } from '../types';
import * as api from '../api';
import '../styles/omnisearch.css';

interface OmnisearchProps {
  allCards: Card[];
  tags: Tag[];
  triageCount?: number;
  onSelectCard: (card: Card) => void;
  onSelectTag: (tagName: string) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onOpenNewCard: () => void;
  onOpenSettingsModal: () => void;
}

export interface CommandItem {
  kind: 'command';
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  badge?: string | number;
  execute: () => void;
}

export interface CardNavItem {
  kind: 'card';
  id: string;
  card: Card;
  title: string;
  subtitle: string;
  horizon: string;
  status: string;
  researchState?: string;
  researchVerdict?: string;
  execute: () => void;
}

export interface TagNavItem {
  kind: 'tag';
  id: string;
  name: string;
  count?: number;
  execute: () => void;
}

export type NavItem = CommandItem | CardNavItem | TagNavItem;

export const Omnisearch: React.FC<OmnisearchProps> = ({
  allCards,
  tags,
  triageCount,
  onSelectCard,
  onSelectTag,
  onViewModeChange,
  onOpenNewCard,
  onOpenSettingsModal,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [backendResults, setBackendResults] = useState<Card[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
  const shortcutLabel = isMac ? '⌘K' : 'Ctrl+K';

  // Debounce user input for network search
  useEffect(() => {
    if (!query) return;
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 200);
    return () => clearTimeout(handler);
  }, [query]);

  // Fetch search matches across whole database when debounced query is present
  useEffect(() => {
    let isCancelled = false;
    const fetchSearch = async () => {
      if (!debouncedQuery.trim()) {
        setBackendResults([]);
        setIsLoading(false);
        return;
      }

      try {
        const results = await api.fetchCards({
          q: debouncedQuery.trim(),
          limit: 10,
        });
        if (!isCancelled) {
          setBackendResults(results);
          setIsLoading(false);
        }
      } catch {
        if (!isCancelled) {
          // Fallback to local filter if network query fails
          const q = debouncedQuery.toLowerCase();
          const fallback = allCards.filter(
            (c) =>
              c.title.toLowerCase().includes(q) ||
              (c.summary && c.summary.toLowerCase().includes(q)) ||
              (c.tldr && c.tldr.toLowerCase().includes(q))
          );
          setBackendResults(fallback.slice(0, 10));
          setIsLoading(false);
        }
      }
    };

    void fetchSearch();
    return () => {
      isCancelled = true;
    };
  }, [debouncedQuery, allCards]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setDebouncedQuery('');
    setBackendResults([]);
    setIsLoading(false);
    setSelectedIndex(0);
    inputRef.current?.blur();
  }, []);

  const executeItem = useCallback((item: NavItem) => {
    item.execute();
    handleClose();
  }, [handleClose]);

  // Global keyboard shortcuts (Cmd+K, Ctrl+K, '/')
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputActive =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        (activeEl instanceof HTMLElement && activeEl.isContentEditable);

      // Cmd+K or Ctrl+K anywhere opens Omnisearch
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 10);
        return;
      }

      // '/' when outside of inputs opens Omnisearch
      if (e.key === '/' && !isInputActive) {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => {
          inputRef.current?.focus();
        }, 10);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Click outside listener
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    if (isOpen) {
      window.addEventListener('mousedown', handlePointerDown);
    }
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen, handleClose]);

  // Build commands, matching cards, and matching tags
  const { commands, cardItems, tagItems, navItems } = useMemo(() => {
    const trimmed = query.trim().toLowerCase();

    // 1. Available Commands & Views
    const allCommands: CommandItem[] = [
      {
        kind: 'command',
        id: 'cmd-triage',
        title: 'Triage Deck',
        subtitle: 'Review incoming sparks & make keep/dismiss decisions',
        icon: <Zap size={14} strokeWidth={2} />,
        badge: triageCount && triageCount > 0 ? `${triageCount} unreviewed` : undefined,
        execute: () => onViewModeChange('triage'),
      },
      {
        kind: 'command',
        id: 'cmd-boards',
        title: 'Execution Boards',
        subtitle: 'Kanban view grouped by Horizon: Now, Next, Later',
        icon: <Layers size={14} strokeWidth={2} />,
        execute: () => onViewModeChange('boards'),
      },
      {
        kind: 'command',
        id: 'cmd-digest',
        title: 'Weekly Digest',
        subtitle: 'Synthesized timeline, themes & briefings',
        icon: <Calendar size={14} strokeWidth={2} />,
        execute: () => onViewModeChange('digest'),
      },
      {
        kind: 'command',
        id: 'cmd-playbooks',
        title: 'Playbook Studio',
        subtitle: 'Design and customize multi-step AI research playbooks',
        icon: <BookOpen size={14} strokeWidth={2} />,
        execute: () => onViewModeChange('playbooks'),
      },
      {
        kind: 'command',
        id: 'cmd-new',
        title: 'New Spark / Capture',
        subtitle: 'Capture a quick thought, note, or article link',
        icon: <Plus size={14} strokeWidth={2} />,
        execute: onOpenNewCard,
      },
      {
        kind: 'command',
        id: 'cmd-settings',
        title: 'Settings & Models',
        subtitle: 'Configure LLMs, channels & preferences',
        icon: <Settings size={14} strokeWidth={2} />,
        execute: onOpenSettingsModal,
      },
    ];

    let filteredCommands: CommandItem[] = [];
    if (!trimmed) {
      filteredCommands = allCommands.slice(0, 4);
    } else {
      filteredCommands = allCommands.filter(
        (cmd) =>
          cmd.title.toLowerCase().includes(trimmed) ||
          cmd.subtitle.toLowerCase().includes(trimmed)
      );
    }

    // 2. Matching Cards
    let rawCards: Card[] = [];
    if (trimmed) {
      rawCards = backendResults;
    } else {
      // Recent cards fallback when query is empty
      rawCards = allCards
        .slice()
        .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
        .slice(0, 5);
    }

    const cardsResult: CardNavItem[] = rawCards.map((c) => ({
      kind: 'card',
      id: `card-${c.id}`,
      card: c,
      title: c.title || 'Untitled Spark',
      subtitle: c.tldr || c.summary || c.executive_summary || c.why_care || 'No briefing details available',
      horizon: c.horizon || 'short-term',
      status: c.status || 'inbox',
      researchState: c.research_state,
      researchVerdict: c.research_verdict,
      execute: () => onSelectCard(c),
    }));

    // 3. Matching Tags
    let matchedTags: Tag[] = [];
    if (trimmed) {
      matchedTags = tags.filter((t) => t.name.toLowerCase().includes(trimmed)).slice(0, 5);
    } else {
      matchedTags = tags.slice(0, 4);
    }

    const tagsResult: TagNavItem[] = matchedTags.map((t) => ({
      kind: 'tag',
      id: `tag-${t.name}`,
      name: t.name,
      count: t.count,
      execute: () => onSelectTag(t.name),
    }));

    // Flatten all items for unified keyboard navigation
    const flat: NavItem[] = [...filteredCommands, ...cardsResult, ...tagsResult];

    return {
      commands: filteredCommands,
      cardItems: cardsResult,
      tagItems: tagsResult,
      navItems: flat,
    };
  }, [
    query,
    backendResults,
    allCards,
    tags,
    triageCount,
    onViewModeChange,
    onOpenNewCard,
    onOpenSettingsModal,
    onSelectCard,
    onSelectTag,
  ]);


  // Scroll active item into view
  useEffect(() => {
    if (!isOpen) return;
    const itemEl = document.getElementById(`omni-item-${selectedIndex}`);
    if (itemEl && typeof itemEl.scrollIntoView === 'function') {
      itemEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, isOpen]);

  // Keyboard navigation inside input
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (navItems.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % navItems.length);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (navItems.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + navItems.length) % navItems.length);
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (navItems.length > 0 && selectedIndex >= 0 && selectedIndex < navItems.length) {
        executeItem(navItems[selectedIndex]);
      } else if (query.trim()) {
        onOpenNewCard();
        handleClose();
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
    }
  };

  const getHorizonLabel = (h: string) => {
    if (h === 'short-term') return 'Now';
    if (h === 'medium-term') return 'Next';
    if (h === 'long-term') return 'Later';
    return h;
  };

  const getHorizonClass = (h: string) => {
    if (h === 'short-term') return 'now';
    if (h === 'medium-term') return 'next';
    if (h === 'long-term') return 'later';
    return 'inbox';
  };

  return (
    <div ref={containerRef} className="omnisearch-container">
      {/* Dimmed backdrop when Omnisearch dropdown is open */}
      {isOpen && <div className="omnisearch-backdrop" onClick={handleClose} />}

      {/* Omnisearch Input Field */}
      <div className={`search-wrapper ${isOpen ? 'focused is-omni-open' : ''} ${query ? 'has-query' : ''}`}>
        <Search size={14} strokeWidth={1.75} className="search-icon" />
        <input
          ref={inputRef}
          id="q"
          type="search"
          className="search-input"
          placeholder="Search briefings, tags, sparks, or commands…"
          value={query}
          onChange={(e) => {
            const val = e.target.value;
            setQuery(val);
            setSelectedIndex(0);
            if (!val) {
              setDebouncedQuery('');
              setBackendResults([]);
              setIsLoading(false);
            } else {
              setIsLoading(true);
            }
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleInputKeyDown}
          autoComplete="off"
          spellCheck={false}
        />

        {isLoading ? (
          <Loader2 size={13} className="omnisearch-spinner" />
        ) : query ? (
          <button
            type="button"
            className="search-clear-btn"
            onClick={() => {
              setQuery('');
              setDebouncedQuery('');
              setBackendResults([]);
              setIsLoading(false);
              setSelectedIndex(0);
              inputRef.current?.focus();
            }}
            title="Clear search"
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

      {/* Floating Omnisearch Results Popover */}
      {isOpen && (
        <div className="omnisearch-popover" role="dialog" aria-label="Omnisearch results">
          <div ref={resultsRef} className="omnisearch-results">
            {navItems.length === 0 ? (
              <div className="omnisearch-empty">
                <FileText size={28} strokeWidth={1.5} color="#6b7280" />
                <div className="omnisearch-empty-title">
                  No matches found for &ldquo;{query}&rdquo;
                </div>
                <div className="omnisearch-empty-desc">
                  Try another keyword, or create a new spark with this title.
                </div>
                <button
                  type="button"
                  className="omnisearch-empty-create-btn"
                  onClick={() => {
                    onOpenNewCard();
                    handleClose();
                  }}
                >
                  <Plus size={13} />
                  <span>Create spark &ldquo;{query}&rdquo;</span>
                </button>
              </div>
            ) : (
              <>
                {/* Section 1: Views & Commands */}
                {commands.length > 0 && (
                  <div className="omnisearch-section">
                    <div className="omnisearch-section-header">
                      <span>{query ? 'Commands & Navigation' : 'Quick Views & Actions'}</span>
                      <span className="omnisearch-section-count">{commands.length}</span>
                    </div>
                    {commands.map((cmd) => {
                      const idx = navItems.indexOf(cmd);
                      const isSelected = idx === selectedIndex;
                      return (
                        <div
                          key={cmd.id}
                          id={`omni-item-${idx}`}
                          className={`omnisearch-item ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => executeItem(cmd)}
                          onMouseEnter={() => setSelectedIndex(idx)}
                        >
                          <div className="omnisearch-item-left">
                            <div className="omnisearch-item-icon command">{cmd.icon}</div>
                            <div className="omnisearch-item-content">
                              <div className="omnisearch-item-main-row">
                                <span className="omnisearch-item-title">{cmd.title}</span>
                                {cmd.badge && (
                                  <span className="omnisearch-badge inbox">{cmd.badge}</span>
                                )}
                              </div>
                              <span className="omnisearch-item-subtitle">{cmd.subtitle}</span>
                            </div>
                          </div>
                          <div className="omnisearch-item-right">
                            <div className="omnisearch-key-hint">
                              <kbd>↵ Jump</kbd>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Section 2: Sparks & Briefings */}
                {cardItems.length > 0 && (
                  <div className="omnisearch-section">
                    <div className="omnisearch-section-header">
                      <span>{query ? 'Matching Sparks' : 'Recent Sparks'}</span>
                      <span className="omnisearch-section-count">{cardItems.length}</span>
                    </div>
                    {cardItems.map((c) => {
                      const idx = navItems.indexOf(c);
                      const isSelected = idx === selectedIndex;
                      const horizonCls = getHorizonClass(c.horizon);
                      return (
                        <div
                          key={c.id}
                          id={`omni-item-${idx}`}
                          className={`omnisearch-item ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => executeItem(c)}
                          onMouseEnter={() => setSelectedIndex(idx)}
                        >
                          <div className="omnisearch-item-left">
                            <div className={`omnisearch-item-icon ${horizonCls}`}>
                              <FileText size={14} strokeWidth={1.75} />
                            </div>
                            <div className="omnisearch-item-content">
                              <div className="omnisearch-item-main-row">
                                <span className="omnisearch-item-title">{c.title}</span>
                                <span className={`omnisearch-badge ${horizonCls}`}>
                                  {getHorizonLabel(c.horizon)}
                                </span>
                                {c.researchState === 'running' && (
                                  <span className="omnisearch-badge research">
                                    <Sparkles size={10} /> Researching
                                  </span>
                                )}
                                {c.researchVerdict && (
                                  <span className="omnisearch-badge done">
                                    {c.researchVerdict}
                                  </span>
                                )}
                              </div>
                              <div className="omnisearch-item-sub-row">
                                <span className="omnisearch-item-snippet">{c.subtitle}</span>
                              </div>
                            </div>
                          </div>
                          <div className="omnisearch-item-right">
                            <div className="omnisearch-key-hint">
                              <kbd>↵ Open</kbd>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Section 3: Tags */}
                {tagItems.length > 0 && (
                  <div className="omnisearch-section">
                    <div className="omnisearch-section-header">
                      <span>{query ? 'Matching Tags' : 'Browse by Tag'}</span>
                      <span className="omnisearch-section-count">{tagItems.length}</span>
                    </div>
                    {tagItems.map((tag) => {
                      const idx = navItems.indexOf(tag);
                      const isSelected = idx === selectedIndex;
                      return (
                        <div
                          key={tag.id}
                          id={`omni-item-${idx}`}
                          className={`omnisearch-item ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => executeItem(tag)}
                          onMouseEnter={() => setSelectedIndex(idx)}
                        >
                          <div className="omnisearch-item-left">
                            <div className="omnisearch-item-icon tag">
                              <TagIcon size={13} strokeWidth={2} />
                            </div>
                            <div className="omnisearch-item-content">
                              <div className="omnisearch-item-main-row">
                                <span className="omnisearch-item-title">#{tag.name}</span>
                                {tag.count !== undefined && (
                                  <span className="omnisearch-badge done">
                                    {tag.count} {tag.count === 1 ? 'spark' : 'sparks'}
                                  </span>
                                )}
                              </div>
                              <span className="omnisearch-item-subtitle">
                                Filter execution boards by #{tag.name}
                              </span>
                            </div>
                          </div>
                          <div className="omnisearch-item-right">
                            <div className="omnisearch-key-hint">
                              <kbd>↵ Filter</kbd>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Bottom Keyboard Shortcuts Strip */}
          <div className="omnisearch-footer">
            <div className="omnisearch-footer-hints">
              <span className="omnisearch-footer-hint">
                <kbd>↑</kbd> <kbd>↓</kbd> Navigate
              </span>
              <span className="omnisearch-footer-hint">
                <kbd>↵</kbd> Select / Open
              </span>
              <span className="omnisearch-footer-hint">
                <kbd>Esc</kbd> Close
              </span>
            </div>
            <span>Sparkkeep Omnisearch</span>
          </div>
        </div>
      )}
    </div>
  );
};
