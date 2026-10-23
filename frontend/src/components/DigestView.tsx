import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DigestData, Card, DigestSynthesisResult, DigestSynthesisTheme, ChannelInfo } from '../types';
import { CardItem } from './CardItem';
import {
  Calendar,
  Sparkles,
  Send,
  FileText,
  CheckCircle2,
  TrendingUp,
  Layers,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  AlertTriangle,
  RotateCw,
  Compass,
  Globe,
  MessageSquare,
  Zap,
  Radio,
} from 'lucide-react';
import * as api from '../api';
import { useLocale } from '../i18n';
import type { Locale } from '../i18n';
import { enumLabel } from '../utils/cardEnumLabels';
import { isClipboardAvailable, downloadMarkdown } from '../utils/exportUtils';
import '../styles/digest-brief.css';

const COUNT_MARKER = '\u0000count\u0000';

interface DigestViewProps {
  digest: DigestData | null;
  query?: string;
  onSelectCard: (card: Card) => void;
  onStatusChange: (id: number, status: string) => void;
  onResearch: (id: number) => void;
  onRetry: (id: number) => void;
  showToast?: (msg: string) => void;
  onRefresh?: () => void;
}

function formatDateRange(daysCount: number, locale: Locale): string {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - daysCount);

  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString(locale, opts)} – ${end.toLocaleDateString(locale, opts)}, ${end.getFullYear()}`;
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function buildDigestFilename(daysCount: number): string {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - daysCount);
  return `sparkkeep-digest-${toIsoDate(start)}_to_${toIsoDate(end)}.md`;
}

export const DigestView: React.FC<DigestViewProps> = ({
  digest: initialDigest,
  query = '',
  onSelectCard,
  onStatusChange,
  onResearch,
  onRetry,
  showToast,
}) => {
  const { t, tp, locale } = useLocale();
  const [windowDays, setWindowDays] = useState<number>(7);
  const [customDigest, setCustomDigest] = useState<DigestData | null>(null);
  const [synthesis, setSynthesis] = useState<DigestSynthesisResult | null>(null);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isSendingDigest, setIsSendingDigest] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string>(() => {
    try {
      return localStorage.getItem('sparkkeep_digest_channel') || 'all';
    } catch {
      return 'all';
    }
  });
  const [availableChannels, setAvailableChannels] = useState<ChannelInfo[]>([]);
  const [isChannelMenuOpen, setIsChannelMenuOpen] = useState(false);
  const channelMenuRef = useRef<HTMLDivElement>(null);
  const [userToggledDays, setUserToggledDays] = useState<Record<string, boolean>>({});

  // Derive digest based on selected window
  const digest = windowDays === 7 ? (initialDigest ?? customDigest) : customDigest;

  // Load digest whenever windowDays changes (or if initialDigest is not yet available for 7-day window)
  useEffect(() => {
    if (windowDays === 7 && initialDigest) {
      return;
    }
    let alive = true;
    api.fetchDigest(windowDays)
      .then((data) => {
        if (!alive) return;
        setCustomDigest(data);
      })
      .catch((err: unknown) => {
        showToast?.(api.getErrorMessage(err));
      });
    return () => {
      alive = false;
    };
  }, [windowDays, initialDigest, showToast]);

  // Flatten all cards from current window
  const allCards = useMemo(() => {
    if (!digest?.days) return [];
    return digest.days.flatMap((d) => d.cards);
  }, [digest]);

  // Filter days by search query if present
  const filteredDays = useMemo(() => {
    if (!digest?.days) return [];
    const q = query.trim().toLowerCase();
    if (!q) return digest.days;
    return digest.days
      .map((day) => ({
        ...day,
        cards: day.cards.filter((c) =>
          (c.title && c.title.toLowerCase().includes(q)) ||
          (c.summary && c.summary.toLowerCase().includes(q)) ||
          (c.tags && c.tags.some((t) => t.toLowerCase().includes(q))) ||
          (c.tldr && c.tldr.toLowerCase().includes(q)) ||
          (c.why_care && c.why_care.toLowerCase().includes(q)) ||
          (c.proposed_actions && c.proposed_actions.some((a) => a.toLowerCase().includes(q)))
        ),
      }))
      .filter((day) => day.cards.length > 0);
  }, [digest, query]);

  // Card lookup map
  const cardById = useMemo(() => {
    const map = new Map<number, Card>();
    for (const c of allCards) {
      map.set(c.id, c);
    }
    return map;
  }, [allCards]);

  // Compute Emergent Themes (Hybrid approach)
  const themes = useMemo((): DigestSynthesisTheme[] => {
    // If LLM synthesis provided themes, use them
    if (synthesis?.themes && synthesis.themes.length > 0) {
      return synthesis.themes;
    }

    // Default fast local clustering by tags
    const tagToCards = new Map<string, number[]>();
    for (const c of allCards) {
      if (c.tags && c.tags.length > 0) {
        for (const t of c.tags) {
          const norm = t.toLowerCase().trim();
          if (!norm) continue;
          const list = tagToCards.get(norm) || [];
          list.push(c.id);
          tagToCards.set(norm, list);
        }
      }
    }

    const sortedTags = Array.from(tagToCards.entries()).sort(
      (a, b) => b[1].length - a[1].length
    );

    const generated: DigestSynthesisTheme[] = [];
    const usedCardIds = new Set<number>();

    for (const [tag, ids] of sortedTags.slice(0, 4)) {
      if (ids.length === 0) continue;
      const formattedTitle = tag.length > 2 ? tag.charAt(0).toUpperCase() + tag.slice(1) : tag.toUpperCase();
      generated.push({
        title: formattedTitle,
        summary: tp('research.digest.themeTagged', ids.length, { tag }),
        card_ids: ids,
      });
      ids.forEach((id) => usedCardIds.add(id));
    }

    // Leftover cards theme if applicable
    const leftovers = allCards.filter((c) => !usedCardIds.has(c.id)).map((c) => c.id);
    if (leftovers.length > 0 && generated.length < 4) {
      generated.push({
        title: t('research.digest.explorationNotes'),
        summary: tp('research.digest.leftoverSummary', leftovers.length),
        card_ids: leftovers,
      });
    }

    return generated;
  }, [synthesis, allCards, t, tp]);

  // Status counts (including to-do!)
  const byStatus = digest?.by_status || {};
  const inboxCount = byStatus.inbox || 0;
  const doneCount = byStatus.done || digest?.weekly_wins?.length || 0;
  const totalSparks = digest?.week_total || 0;
  const decidedCount = Math.max(0, totalSparks - inboxCount);
  const clearanceRate = totalSparks > 0 ? Math.round((decidedCount / totalSparks) * 100) : 100;

  // Horizon breakdown
  const byHorizon = digest?.by_horizon || {};
  const nowCount = byHorizon['short-term'] || 0;
  const nextCount = byHorizon['medium-term'] || 0;
  const laterCount = byHorizon['long-term'] || 0;
  const horizonTotal = nowCount + nextCount + laterCount || 1;
  const nowPct = Math.round((nowCount / horizonTotal) * 100);
  const nextPct = Math.round((nextCount / horizonTotal) * 100);
  const laterPct = Math.max(0, 100 - nowPct - nextPct);

  // Deep Research Harvest
  const researchHarvest = useMemo(() => {
    if (digest?.research_harvest && digest.research_harvest.length > 0) {
      return digest.research_harvest;
    }
    return allCards.filter((c) => Boolean(c.research_verdict) || c.research_state === 'done');
  }, [digest, allCards]);

  // Handle LLM Synthesis
  const handleSynthesize = async () => {
    setIsSynthesizing(true);
    try {
      const res = await api.synthesizeDigest(windowDays);
      if (res.ok) {
        setSynthesis(res);
        showToast?.(t('research.digest.toasts.synthGenerated'));
      } else {
        showToast?.(t('research.digest.toasts.synthFailed'));
      }
    } catch (err: unknown) {
      showToast?.(api.getErrorMessage(err));
    } finally {
      setIsSynthesizing(false);
    }
  };

  // Fetch configured channels to display status in the integration menu
  useEffect(() => {
    let alive = true;
    api.listChannels()
      .then((res) => {
        if (alive && res?.channels) {
          setAvailableChannels(res.channels);
        }
      })
      .catch(() => {
        // Fallback gracefully if channel inspection fails
      });
    return () => {
      alive = false;
    };
  }, []);

  // Close channel menu on outside click or Escape key
  useEffect(() => {
    if (!isChannelMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (channelMenuRef.current && !channelMenuRef.current.contains(e.target as Node)) {
        setIsChannelMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsChannelMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isChannelMenuOpen]);

  const getChannelDisplayName = (id: string): string => {
    switch (id) {
      case 'all':
        return t('research.digest.integrationsLabel');
      case 'telegram':
        return 'Telegram';
      case 'discord':
        return 'Discord';
      case 'slack':
        return 'Slack';
      case 'openclaw':
        return t('research.digest.channels.openclaw');
      default:
        return id.charAt(0).toUpperCase() + id.slice(1);
    }
  };

  const channelOptions = useMemo(() => {
    const defaultList = [
      {
        id: 'telegram',
        name: t('research.digest.channels.telegram'),
        desc: t('research.digest.channels.telegramDesc'),
        icon: <Send size={14} style={{ color: '#0ea5e9', flexShrink: 0 }} />,
      },
      {
        id: 'discord',
        name: t('research.digest.channels.discord'),
        desc: t('research.digest.channels.discordDesc'),
        icon: <MessageSquare size={14} style={{ color: '#5865F2', flexShrink: 0 }} />,
      },
      {
        id: 'slack',
        name: t('research.digest.channels.slack'),
        desc: t('research.digest.channels.slackDesc'),
        icon: <Zap size={14} style={{ color: '#eab308', flexShrink: 0 }} />,
      },
    ];

    const openclaw = availableChannels.find((c) => c.id === 'openclaw');
    if (openclaw && openclaw.enabled) {
      defaultList.push({
        id: 'openclaw',
        name: t('research.digest.channels.openclaw'),
        desc: t('research.digest.channels.openclawDesc'),
        icon: <Radio size={14} style={{ color: '#10b981', flexShrink: 0 }} />,
      });
    }

    return defaultList.map((ch) => {
      const match = availableChannels.find((c) => c.id === ch.id);
      return {
        ...ch,
        enabled: match ? match.enabled : undefined,
        hasStatus: availableChannels.length > 0 && match !== undefined,
      };
    });
  }, [availableChannels, t]);

  // Handle Omnichannel Digest Push
  const handleSendDigest = async (channelOverride?: string) => {
    const channelToUse = channelOverride || selectedChannel || 'all';
    setIsSendingDigest(true);
    try {
      const res = await api.pushDigestToChannel(channelToUse, windowDays);
      if (res.ok) {
        if (channelToUse === 'all') {
          showToast?.(res.message || t('research.digest.toasts.sendAll'));
        } else {
          const chanName = getChannelDisplayName(channelToUse);
          showToast?.(res.message || t('research.digest.toasts.sendChannel', { channel: chanName }));
        }
      } else {
        showToast?.(res.message || t('research.digest.toasts.sendFailed'));
      }
    } catch (err: unknown) {
      showToast?.(api.getErrorMessage(err));
    } finally {
      setIsSendingDigest(false);
    }
  };

  const handleSelectChannelAndSend = (channelId: string) => {
    setSelectedChannel(channelId);
    try {
      localStorage.setItem('sparkkeep_digest_channel', channelId);
    } catch {
      // ignore
    }
    setIsChannelMenuOpen(false);
    handleSendDigest(channelId);
  };

  const [exportCopied, setExportCopied] = useState(false);
  const [exportCopyFlash, setExportCopyFlash] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const exportArrowRef = useRef<HTMLButtonElement>(null);
  const exportMenuListRef = useRef<HTMLDivElement>(null);
  const clipboardAvailable = isClipboardAvailable();

  // Move focus between enabled menuitems, wrapping at both ends
  const focusExportMenuItem = (direction: 1 | -1) => {
    const container = exportMenuListRef.current;
    if (!container) return;
    const items = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
    );
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex =
      currentIndex === -1
        ? direction === 1
          ? 0
          : items.length - 1
        : (currentIndex + direction + items.length) % items.length;
    items[nextIndex].focus();
  };

  const handleExportMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    focusExportMenuItem(e.key === 'ArrowDown' ? 1 : -1);
  };

  // Close export menu on outside click or Escape key
  useEffect(() => {
    if (!isExportMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsExportMenuOpen(false);
        exportArrowRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExportMenuOpen]);

  // Build Markdown digest content.
  // shortcut: exported headings follow the UI locale; server push stays English until backend i18n lands.
  const buildDigestMarkdown = (): string => {
    const mdLines: string[] = [];
    mdLines.push(`# 📊 ${t('research.digest.md.title')}`);
    mdLines.push(t('research.digest.md.period', { range: formatDateRange(windowDays, locale) }));
    mdLines.push(
      t('research.digest.md.stats', {
        total: totalSparks,
        clearance: clearanceRate,
        done: doneCount,
      })
    );
    mdLines.push('');

    // Executive briefing
    mdLines.push(`## ⚡ ${t('research.digest.md.briefing')}`);
    if (synthesis?.briefing) {
      mdLines.push(synthesis.briefing);
    } else {
      mdLines.push(`${tp('research.digest.md.captured', totalSparks)} ${tp('research.digest.md.acrossThemes', themes.length)}`);
      mdLines.push(tp('research.digest.md.cleared', decidedCount, { percent: clearanceRate }));
      mdLines.push(tp('research.digest.md.completed', doneCount));
      if (researchHarvest.length > 0) {
        mdLines.push(tp('research.digest.md.research', researchHarvest.length));
      }
    }
    mdLines.push('');

    // Emergent themes
    if (themes.length > 0) {
      mdLines.push(`## 🧭 ${t('research.digest.md.themes')}`);
      for (const theme of themes) {
        mdLines.push(
          tp('research.digest.md.themeHeading', theme.card_ids?.length || 0, { title: theme.title })
        );
        mdLines.push(`${theme.summary}`);
        if (theme.card_ids) {
          for (const id of theme.card_ids) {
            const card = cardById.get(id);
            if (card) {
              mdLines.push(`- **${card.title}** [${card.horizon}] ${card.source_url ? `(${card.source_url})` : ''}`);
            }
          }
        }
        mdLines.push('');
      }
    }

    // Research Harvest
    if (researchHarvest.length > 0) {
      mdLines.push(`## 🔬 ${t('research.digest.md.harvest')}`);
      for (const c of researchHarvest) {
        mdLines.push(
          t('research.digest.md.harvestLine', {
            title: c.title,
            verdict: c.research_verdict
              ? enumLabel(t, 'verdict', c.research_verdict).toUpperCase()
              : enumLabel(t, 'researchStatus', 'done').toUpperCase(),
            confidence: enumLabel(t, 'confidence', c.research_confidence || 'medium'),
          })
        );
      }
      mdLines.push('');
    }

    return mdLines.join('\n');
  };

  const COPY_FAILED_TOAST = t('research.digest.toasts.copyFailed');

  const handleCopyMarkdown = () => {
    try {
      navigator.clipboard
        .writeText(buildDigestMarkdown())
        .then(() => {
          showToast?.(t('research.digest.toasts.copied'));
          setExportCopied(true);
          setExportCopyFlash(true);
          setTimeout(() => setExportCopyFlash(false), 600);
          setTimeout(() => setExportCopied(false), 2000);
        })
        .catch(() => {
          showToast?.(COPY_FAILED_TOAST);
        });
    } catch {
      // Clipboard API missing or gone: never fail silently
      showToast?.(COPY_FAILED_TOAST);
    }
  };

  const handleDownloadMarkdown = () => {
    const filename = buildDigestFilename(windowDays);
    downloadMarkdown(buildDigestMarkdown(), filename);
    showToast?.(t('research.digest.toasts.downloaded', { filename }));
  };

  // Primary action: copy when the clipboard is usable, otherwise download the file
  const handlePrimaryExport = () => {
    setIsExportMenuOpen(false);
    if (clipboardAvailable) {
      handleCopyMarkdown();
    } else {
      handleDownloadMarkdown();
    }
  };

  // Emphasize only the numeric count, leaving the surrounding words plain.
  const withStrongCount = (
    text: string,
    count: number,
    style?: React.CSSProperties
  ): React.ReactNode => {
    const [before, after = ''] = text.split(COUNT_MARKER);
    return (
      <>
        {before}
        <strong style={style}>{count}</strong>
        {after}
      </>
    );
  };

  const toggleDayExpanded = (date: string, defaultExpanded: boolean) => {
    setUserToggledDays((prev) => {
      const current = prev[date] !== undefined ? prev[date] : defaultExpanded;
      return { ...prev, [date]: !current };
    });
  };

  if (!digest || !digest.days || digest.days.length === 0) {
    return (
      <div className="digest-container" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Calendar size={48} color="var(--text-muted)" style={{ margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-main)' }}>
          {t('research.digest.emptyTitle')}
        </h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>
          {tp('research.digest.emptyBody', windowDays)}
        </p>
        <div style={{ marginTop: 20 }}>
          <select
            className="digest-window-select"
            value={windowDays}
            onChange={(e) => {
              setWindowDays(Number(e.target.value));
              setUserToggledDays({});
            }}
          >
            <option value={7}>{tp('research.digest.pastDays', 7)}</option>
            <option value={14}>{tp('research.digest.pastDays', 14)}</option>
            <option value={30}>{tp('research.digest.pastDays', 30)}</option>
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="digest-container">
      {/* 1. Header Bar with Window Controls & Review Ritual */}
      <div className="digest-header-bar">
        <div className="digest-header-title-group">
          <h1 className="digest-title">{t('research.digest.title')}</h1>
          <div className="digest-date-pill">
            <Calendar size={13} color="#818cf8" />
            <span>{formatDateRange(windowDays, locale)}</span>
          </div>
        </div>

        <div className="digest-actions-group">
          <select
            className="digest-window-select"
            value={windowDays}
            onChange={(e) => {
              setWindowDays(Number(e.target.value));
              setUserToggledDays({});
            }}
          >
            <option value={7}>{tp('research.digest.pastDays', 7)}</option>
            <option value={14}>{tp('research.digest.pastDays', 14)}</option>
            <option value={30}>{tp('research.digest.pastDays', 30)}</option>
          </select>

          <div className="digest-split-btn-group" ref={channelMenuRef}>
            <button
              type="button"
              className="digest-btn digest-btn-integrations"
              onClick={() => handleSendDigest()}
              disabled={isSendingDigest}
              title={t('research.digest.pushTitle', {
                days: windowDays,
                channel:
                  selectedChannel === 'all'
                    ? t('research.digest.allIntegrations')
                    : getChannelDisplayName(selectedChannel),
              })}
            >
              <Send size={13} />
              <span>
                {isSendingDigest
                  ? t('research.digest.sending')
                  : selectedChannel === 'all'
                  ? t('research.digest.send')
                  : t('research.digest.sendTo', { channel: getChannelDisplayName(selectedChannel) })}
              </span>
            </button>

            <button
              type="button"
              className={`digest-btn-integrations-arrow ${isChannelMenuOpen ? 'open' : ''}`}
              onClick={() => setIsChannelMenuOpen((prev) => !prev)}
              disabled={isSendingDigest}
              aria-label={t('research.digest.selectChannelAria')}
              aria-haspopup="menu"
              aria-expanded={isChannelMenuOpen}
              title={t('research.digest.chooseIntegration')}
            >
              <ChevronDown size={13} className={isChannelMenuOpen ? 'chevron-rotated' : ''} />
            </button>

            {isChannelMenuOpen && (
              <div className="digest-integrations-dropdown" role="menu">
                <div className="digest-dropdown-header">
                  <span>{tp('research.digest.windowHeader', windowDays)}</span>
                </div>

                <button
                  type="button"
                  role="menuitem"
                  className={`digest-dropdown-item ${selectedChannel === 'all' ? 'active' : ''}`}
                  onClick={() => handleSelectChannelAndSend('all')}
                >
                  <div className="digest-dropdown-item-main">
                    <Globe size={14} style={{ color: '#818cf8', flexShrink: 0 }} />
                    <div className="digest-dropdown-item-text">
                      <span className="channel-title">{t('research.digest.allIntegrations')}</span>
                      <span className="channel-desc">{t('research.digest.broadcastDesc')}</span>
                    </div>
                  </div>
                  <span className="channel-badge broadcast">{t('research.digest.broadcast')}</span>
                </button>

                <div className="digest-dropdown-divider" />

                {channelOptions.map((ch) => {
                  const isSelected = selectedChannel === ch.id;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      role="menuitem"
                      className={`digest-dropdown-item ${isSelected ? 'active' : ''}`}
                      onClick={() => handleSelectChannelAndSend(ch.id)}
                    >
                      <div className="digest-dropdown-item-main">
                        {ch.icon}
                        <div className="digest-dropdown-item-text">
                          <span className="channel-title">{ch.name}</span>
                          <span className="channel-desc">{ch.desc}</span>
                        </div>
                      </div>
                      {ch.hasStatus && (
                        <span className={`channel-status-pill ${ch.enabled ? 'configured' : 'inactive'}`}>
                          {ch.enabled ? t('common.active') : t('research.digest.notSetup')}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="digest-split-btn-group" ref={exportMenuRef}>
            <button
              type="button"
              className={`digest-btn digest-btn-export ${exportCopied ? 'copied' : ''} ${exportCopyFlash ? 'flash' : ''}`}
              onClick={handlePrimaryExport}
              title={
                clipboardAvailable
                  ? t('research.digest.copyTitle')
                  : t('research.digest.downloadTitle')
              }
              disabled={exportCopied}
              style={{ position: 'relative', overflow: 'visible' }}
            >
              <FileText size={13} />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                {exportCopied ? (
                  <>
                    <CheckCircle2 size={13} color="#34d399" style={{ animation: 'popIn 0.2s ease-out' }} />
                    <span>{t('research.digest.copied')}</span>
                  </>
                ) : clipboardAvailable ? (
                  t('research.digest.exportMarkdown')
                ) : (
                  t('research.digest.downloadMarkdown')
                )}
              </span>
              {exportCopyFlash && (
                <div style={{
                  position: 'absolute',
                  inset: '-2px',
                  borderRadius: 'inherit',
                  border: '2px solid #34d399',
                  animation: 'copyFlash 0.6s ease-out',
                  pointerEvents: 'none',
                }} />
              )}
            </button>

            <button
              type="button"
              ref={exportArrowRef}
              className={`digest-btn-export-arrow ${isExportMenuOpen ? 'open' : ''}`}
              onClick={() => setIsExportMenuOpen((prev) => !prev)}
              aria-label={t('research.digest.moreExport')}
              aria-haspopup="menu"
              aria-expanded={isExportMenuOpen}
              title={t('research.digest.moreExport')}
            >
              <ChevronDown size={13} className={isExportMenuOpen ? 'chevron-rotated' : ''} />
            </button>

            {isExportMenuOpen && (
              <div
                className="digest-export-dropdown"
                role="menu"
                ref={exportMenuListRef}
                onKeyDown={handleExportMenuKeyDown}
              >
                <div className="digest-dropdown-header" role="presentation">
                  <span>{t('research.digest.exportHeader')}</span>
                </div>

                <button
                  type="button"
                  role="menuitem"
                  className="digest-dropdown-item"
                  onClick={() => {
                    setIsExportMenuOpen(false);
                    handleCopyMarkdown();
                  }}
                  disabled={!clipboardAvailable}
                  title={
                    clipboardAvailable
                      ? t('research.digest.copyDigestTitle')
                      : t('research.digest.clipboardUnavailable')
                  }
                >
                  <div className="digest-dropdown-item-main">
                    <Copy size={14} style={{ color: '#818cf8', flexShrink: 0 }} />
                    <div className="digest-dropdown-item-text">
                      <span className="channel-title">{t('research.digest.copyToClipboard')}</span>
                      <span className="channel-desc">
                        {clipboardAvailable
                          ? t('research.digest.pasteInto')
                          : t('research.digest.requiresHttps')}
                      </span>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className="digest-dropdown-item"
                  onClick={() => {
                    setIsExportMenuOpen(false);
                    handleDownloadMarkdown();
                  }}
                  title={t('research.digest.downloadFileTitle')}
                >
                  <div className="digest-dropdown-item-main">
                    <Download size={14} style={{ color: '#38bdf8', flexShrink: 0 }} />
                    <div className="digest-dropdown-item-text">
                      <span className="channel-title">{t('research.digest.downloadFile')}</span>
                      <span className="channel-desc">{buildDigestFilename(windowDays)}</span>
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Executive Briefing Hero Card */}
      <div className="digest-hero-brief">
        <div className="digest-hero-header">
          <div className="digest-hero-title">
            <Sparkles size={16} color="#818cf8" />
            <span>{t('research.digest.executiveBriefing')}</span>
          </div>

          <button
            type="button"
            className="digest-btn-synthesize"
            onClick={handleSynthesize}
            disabled={isSynthesizing}
          >
            {isSynthesizing ? <RotateCw size={12} className="spin" /> : <Sparkles size={12} />}
            <span>
              {isSynthesizing
                ? t('research.digest.synthesizing')
                : t('research.digest.synthesize')}
            </span>
          </button>
        </div>

        {synthesis?.briefing ? (
          <div style={{ whiteSpace: 'pre-line', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-main)' }}>
            {synthesis.briefing}
          </div>
        ) : (
          <ul className="digest-hero-bullets">
            <li className="digest-hero-bullet-item">
              <span className="digest-hero-bullet-dot">•</span>
              <span>
                {withStrongCount(
                  tp('research.digest.heroIngested', totalSparks, { count: COUNT_MARKER }),
                  totalSparks,
                  { color: 'var(--text-main)' }
                )}{' '}
                {withStrongCount(
                  tp('research.digest.heroAcrossThemes', themes.length, { count: COUNT_MARKER }),
                  themes.length,
                  { color: 'var(--accent-indigo)' }
                )}{' '}
                {t('research.digest.heroThisWindow')}
              </span>
            </li>
            <li className="digest-hero-bullet-item">
              <span className="digest-hero-bullet-dot">•</span>
              <span>
                {t('research.digest.funnelCleared')}{' '}
                <strong style={{ color: '#38bdf8' }}>{clearanceRate}%</strong>{' '}
                {t('research.digest.funnelOfCaptured')} ({tp('research.digest.funnelDecided', decidedCount)},{' '}
                {tp('research.digest.funnelPending', inboxCount)}).
              </span>
            </li>
            <li className="digest-hero-bullet-item">
              <span className="digest-hero-bullet-dot">•</span>
              <span>
                <strong style={{ color: '#34d399' }}>
                  {tp('research.digest.heroAchieved', doneCount)}
                </strong>
                .{' '}
                {researchHarvest.length > 0 && (
                  <span>
                    {' '}
                    <strong style={{ color: '#c084fc' }}>
                      {tp('research.digest.heroConcluded', researchHarvest.length)}
                    </strong>
                    .
                  </span>
                )}
              </span>
            </li>
          </ul>
        )}
      </div>

      {/* 3. 4-Card Metric Strip */}
      <div className="digest-kpi-strip">
        <div className="digest-kpi-card">
          <span className="digest-kpi-label">
            <span>{t('research.digest.kpiTotal')}</span>
            <Layers size={13} color="#94a3b8" />
          </span>
          <div className="digest-kpi-val-row">
            <span className="digest-kpi-val">{totalSparks}</span>
            {digest.wow_delta_percent !== undefined && digest.prev_total !== undefined && (
              <span
                className={`digest-kpi-badge ${
                  digest.wow_delta_percent >= 0 ? 'digest-kpi-badge-green' : 'digest-kpi-badge-cyan'
                }`}
              >
                {digest.wow_delta_percent >= 0 ? `+${digest.wow_delta_percent}%` : `${digest.wow_delta_percent}%`}{' '}
                {t('research.digest.wow')}
              </span>
            )}
          </div>
          <span className="digest-kpi-sub">
            {digest.prev_total !== undefined
              ? tp('research.digest.priorWindow', digest.prev_total)
              : t('research.digest.ingestedCaptures')}
          </span>
        </div>

        <div className="digest-kpi-card">
          <span className="digest-kpi-label">
            <span>{t('research.digest.kpiClearance')}</span>
            <TrendingUp size={13} color="#38bdf8" />
          </span>
          <div className="digest-kpi-val-row">
            <span className="digest-kpi-val" style={{ color: '#38bdf8' }}>{clearanceRate}%</span>
            <span className="digest-kpi-badge digest-kpi-badge-cyan">
              {tp('research.digest.decided', decidedCount)}
            </span>
          </div>
          <span className="digest-kpi-sub">{tp('research.digest.awaitingTriage', inboxCount)}</span>
        </div>

        <div className="digest-kpi-card">
          <span className="digest-kpi-label">
            <span>{t('research.digest.kpiWins')}</span>
            <CheckCircle2 size={13} color="#34d399" />
          </span>
          <div className="digest-kpi-val-row">
            <span className="digest-kpi-val" style={{ color: '#34d399' }}>{doneCount}</span>
            <span className="digest-kpi-badge digest-kpi-badge-green">
              {t('research.digest.doneBadge')}
            </span>
          </div>
          <span className="digest-kpi-sub">{t('research.digest.closedLoops')}</span>
        </div>

        <div className="digest-kpi-card">
          <span className="digest-kpi-label">
            <span>{t('research.digest.kpiResearch')}</span>
            <Sparkles size={13} color="#c084fc" />
          </span>
          <div className="digest-kpi-val-row">
            <span className="digest-kpi-val" style={{ color: '#c084fc' }}>{researchHarvest.length}</span>
            <span className="digest-kpi-badge digest-kpi-badge-purple">
              {t('research.digest.reportsBadge')}
            </span>
          </div>
          <span className="digest-kpi-sub">{t('research.digest.verdictsSynthesis')}</span>
        </div>
      </div>

      {/* 4. Main 2-Column Grid: Emergent Themes Radar & Intelligence Rail */}
      <div className="digest-main-grid">
        {/* Left Column: Emergent Themes Radar */}
        <div className="digest-themes-section">
          <div className="digest-section-title">
            <Compass size={16} color="#818cf8" />
            <span>{t('research.digest.themesTitle')}</span>
          </div>

          <div className="digest-themes-list">
            {themes.map((theme, idx) => (
              <div key={`${theme.title}-${idx}`} className="digest-theme-box">
                <div className="digest-theme-header">
                  <span className="digest-theme-name">
                    {theme.title}
                  </span>
                  <span className="digest-theme-pill-count">
                    {tp('research.digest.themeSparks', theme.card_ids?.length || 0)}
                  </span>
                </div>
                <div className="digest-theme-desc">{theme.summary}</div>

                <div className="digest-theme-cards-wrap">
                  {(theme.card_ids || []).map((id) => {
                    const card = cardById.get(id);
                    if (!card) return null;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        className="digest-spark-chip"
                        onClick={() => onSelectCard(card)}
                        title={card.title}
                      >
                        <span className="digest-spark-chip-title">{card.title}</span>
                        {card.status === 'done' && (
                          <CheckCircle2 size={12} color="#34d399" />
                        )}
                        {card.research_verdict && (
                          <span
                            className={`digest-verdict-tag digest-verdict-${card.research_verdict}`}
                            style={{ fontSize: 9, padding: '1px 4px' }}
                          >
                            {enumLabel(t, 'verdict', card.research_verdict)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Rail: Research Harvest & Horizon Balance */}
        <div className="digest-right-rail">
          {/* Deep Research Harvest */}
          <div className="digest-side-card">
            <div className="digest-section-title" style={{ marginBottom: 8 }}>
              <Sparkles size={15} color="#c084fc" />
              <span>{t('research.digest.harvestTitle')}</span>
            </div>

            {researchHarvest.length === 0 ? (
              <div style={{ fontSize: 12, color: '#64748b', padding: '12px 0' }}>
                {t('research.digest.harvestEmpty')}
              </div>
            ) : (
              <div>
                {researchHarvest.slice(0, 5).map((c) => (
                  <div
                    key={c.id}
                    className="digest-harvest-item"
                    onClick={() => onSelectCard(c)}
                  >
                    <span className="digest-harvest-title">{c.title}</span>
                    <span
                      className={`digest-verdict-tag ${
                        c.research_verdict === 'pursue'
                          ? 'digest-verdict-pursue'
                          : c.research_verdict === 'skip'
                          ? 'digest-verdict-skip'
                          : 'digest-verdict-watch'
                      }`}
                    >
                      {c.research_verdict
                        ? enumLabel(t, 'verdict', c.research_verdict)
                        : enumLabel(t, 'researchStatus', 'done').toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Focus Horizon Balance */}
          <div className="digest-side-card">
            <div className="digest-section-title" style={{ marginBottom: 6 }}>
              <Layers size={15} color="#38bdf8" />
              <span>{t('research.digest.horizonTitle')}</span>
            </div>

            <div className="digest-horizon-bar">
              <div
                className="digest-horizon-segment-now"
                style={{ width: `${nowPct}%` }}
                title={t('research.digest.horizonNowTitle', { percent: nowPct })}
              />
              <div
                className="digest-horizon-segment-next"
                style={{ width: `${nextPct}%` }}
                title={t('research.digest.horizonNextTitle', { percent: nextPct })}
              />
              <div
                className="digest-horizon-segment-later"
                style={{ width: `${laterPct}%` }}
                title={t('research.digest.horizonLaterTitle', { percent: laterPct })}
              />
            </div>

            <div className="digest-horizon-legend">
              <span style={{ color: '#818cf8' }}>{t('research.digest.horizonNow', { percent: nowPct })}</span>
              <span style={{ color: '#34d399' }}>{t('research.digest.horizonNext', { percent: nextPct })}</span>
              <span style={{ color: '#38bdf8' }}>{t('research.digest.horizonLater', { percent: laterPct })}</span>
            </div>

            {/* Stale Alert if short-term items haven't moved */}
            {(digest.stale_count || 0) > 0 && (
              <div className="digest-stale-alert">
                <AlertTriangle size={15} />
                <span>
                  {withStrongCount(
                    tp('research.digest.stale', digest.stale_count || 0, { count: COUNT_MARKER }),
                    digest.stale_count || 0
                  )}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. Day-by-Day Activity Feed (Collapsible / Clean) */}
      <div style={{ marginTop: 12 }}>
        <div className="digest-section-title">
          <Calendar size={16} color="#06b6d4" />
          <span>
            {t('research.digest.activityTitle')}{' '}
            {query.trim() ? t('research.digest.filteringBy', { query }) : ''}
          </span>
        </div>

        {query.trim() && filteredDays.length === 0 ? (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              color: 'var(--text-dim)',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: 8,
              border: '1px dashed var(--border-subtle)',
              fontSize: 13,
              marginTop: 8,
            }}
          >
            {t('research.digest.noMatch', { query })}
          </div>
        ) : (
          <div className="digest-days-accordion">
            {filteredDays.map((day, index) => {
              const isDefaultExpanded = Boolean(query.trim()) || index < 2;
              const isExpanded = userToggledDays[day.date] !== undefined ? userToggledDays[day.date] : isDefaultExpanded;
              return (
                <div key={day.date} className="day-section">
                  <div
                    className="digest-accordion-header"
                    onClick={() => toggleDayExpanded(day.date, isDefaultExpanded)}
                  >
                  <div className="digest-accordion-title">
                    <Calendar size={14} color="var(--accent-cyan)" />
                    <span>{day.date}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>
                      ({tp('research.digest.cards', day.cards.length)})
                    </span>
                  </div>
                  {isExpanded ? <ChevronUp size={15} color="var(--text-muted)" /> : <ChevronDown size={15} color="var(--text-muted)" />}
                </div>

                {isExpanded && (
                  <div
                    className="kanban-board"
                    style={{
                      gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                      padding: '4px 0 12px',
                    }}
                  >
                    {day.cards.map((c) => (
                      <CardItem
                        key={c.id}
                        card={c}
                        onSelect={onSelectCard}
                        onStatusChange={onStatusChange}
                        onResearch={onResearch}
                        onRetry={onRetry}
                      />
                    ))}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};