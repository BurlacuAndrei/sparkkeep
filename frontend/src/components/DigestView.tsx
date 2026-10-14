import React, { useState, useEffect, useMemo } from 'react';
import { DigestData, Card, DigestSynthesisResult, DigestSynthesisTheme } from '../types';
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
  AlertTriangle,
  RotateCw,
  Compass,
} from 'lucide-react';
import * as api from '../api';
import '../styles/digest-brief.css';

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

function formatDateRange(daysCount: number): string {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - daysCount);

  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}, ${end.getFullYear()}`;
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
  const [windowDays, setWindowDays] = useState<number>(7);
  const [customDigest, setCustomDigest] = useState<DigestData | null>(null);
  const [synthesis, setSynthesis] = useState<DigestSynthesisResult | null>(null);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isSendingTelegram, setIsSendingTelegram] = useState(false);
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
        summary: `${ids.length} spark${ids.length > 1 ? 's' : ''} tagged with #${tag}`,
        card_ids: ids,
      });
      ids.forEach((id) => usedCardIds.add(id));
    }

    // Leftover cards theme if applicable
    const leftovers = allCards.filter((c) => !usedCardIds.has(c.id)).map((c) => c.id);
    if (leftovers.length > 0 && generated.length < 4) {
      generated.push({
        title: 'Exploration & Notes',
        summary: `${leftovers.length} general capture${leftovers.length > 1 ? 's' : ''} from this period`,
        card_ids: leftovers,
      });
    }

    return generated;
  }, [synthesis, allCards]);

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
        showToast?.('✨ Executive synthesis generated!');
      } else {
        showToast?.('Failed to synthesize with AI model');
      }
    } catch (err: unknown) {
      showToast?.(api.getErrorMessage(err));
    } finally {
      setIsSynthesizing(false);
    }
  };

  // Handle Telegram Push
  const handleSendTelegram = async () => {
    setIsSendingTelegram(true);
    try {
      const res = await api.pushDigestToTelegram(windowDays);
      if (res.ok) {
        showToast?.('✈️ Digest successfully sent to your Telegram!');
      } else {
        showToast?.(res.error || 'Failed to send to Telegram');
      }
    } catch (err: unknown) {
      showToast?.(api.getErrorMessage(err));
    } finally {
      setIsSendingTelegram(false);
    }
  };

  // Handle Markdown Export
  const handleExportMarkdown = () => {
    const mdLines: string[] = [];
    mdLines.push(`# 📊 Sparkkeep Intelligence Digest`);
    mdLines.push(`**Period:** ${formatDateRange(windowDays)}`);
    mdLines.push(`**Total Sparks:** ${totalSparks} | **Triage Clearance:** ${clearanceRate}% | **Completed Wins:** ${doneCount}`);
    mdLines.push('');

    // Executive briefing
    mdLines.push(`## ⚡ Executive Briefing`);
    if (synthesis?.briefing) {
      mdLines.push(synthesis.briefing);
    } else {
      mdLines.push(`- Captured ${totalSparks} sparks across ${themes.length} emergent themes.`);
      mdLines.push(`- Cleared ${decidedCount} items from inbox (${clearanceRate}% clearance).`);
      mdLines.push(`- ${doneCount} cards completed as weekly wins.`);
      if (researchHarvest.length > 0) {
        mdLines.push(`- ${researchHarvest.length} deep research investigations concluded.`);
      }
    }
    mdLines.push('');

    // Emergent themes
    if (themes.length > 0) {
      mdLines.push(`## 🧭 Emergent Themes`);
      for (const t of themes) {
        mdLines.push(`### ${t.title} (${t.card_ids?.length || 0} sparks)`);
        mdLines.push(`${t.summary}`);
        if (t.card_ids) {
          for (const id of t.card_ids) {
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
      mdLines.push(`## 🔬 Deep Research Harvest`);
      for (const c of researchHarvest) {
        mdLines.push(`- **${c.title}** — Verdict: **${(c.research_verdict || 'DONE').toUpperCase()}** (Confidence: ${c.research_confidence || 'medium'})`);
      }
      mdLines.push('');
    }

    const fullMd = mdLines.join('\n');
    navigator.clipboard
      .writeText(fullMd)
      .then(() => {
        showToast?.('📋 Markdown digest copied to clipboard!');
      })
      .catch(() => {
        showToast?.('Could not copy to clipboard');
      });
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
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-main)' }}>No captures in this window</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>
          Sparks captured during the selected {windowDays} days will be analyzed and organized here.
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
            <option value={7}>Past 7 Days</option>
            <option value={14}>Past 14 Days</option>
            <option value={30}>Past 30 Days</option>
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
          <h1 className="digest-title">Weekly Intelligence Digest</h1>
          <div className="digest-date-pill">
            <Calendar size={13} color="#818cf8" />
            <span>{formatDateRange(windowDays)}</span>
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
            <option value={7}>Past 7 Days</option>
            <option value={14}>Past 14 Days</option>
            <option value={30}>Past 30 Days</option>
          </select>

          <button
            type="button"
            className="digest-btn digest-btn-telegram"
            onClick={handleSendTelegram}
            disabled={isSendingTelegram}
            title="Push digest to Telegram bot chat"
          >
            <Send size={13} />
            <span>{isSendingTelegram ? 'Sending…' : 'Send to Telegram'}</span>
          </button>

          <button
            type="button"
            className="digest-btn digest-btn-export"
            onClick={handleExportMarkdown}
            title="Copy Markdown for Obsidian / Notion / Logseq"
          >
            <FileText size={13} />
            <span>Export Markdown</span>
          </button>
        </div>
      </div>

      {/* 2. Executive Briefing Hero Card */}
      <div className="digest-hero-brief">
        <div className="digest-hero-header">
          <div className="digest-hero-title">
            <Sparkles size={16} color="#818cf8" />
            <span>Executive Briefing</span>
          </div>

          <button
            type="button"
            className="digest-btn-synthesize"
            onClick={handleSynthesize}
            disabled={isSynthesizing}
          >
            {isSynthesizing ? <RotateCw size={12} className="spin" /> : <Sparkles size={12} />}
            <span>{isSynthesizing ? 'Synthesizing…' : '✨ Synthesize with AI'}</span>
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
                Ingested <strong style={{ color: 'var(--text-main)' }}>{totalSparks} sparks</strong> across{' '}
                <strong style={{ color: 'var(--accent-indigo)' }}>{themes.length} emergent themes</strong> this window.
              </span>
            </li>
            <li className="digest-hero-bullet-item">
              <span className="digest-hero-bullet-dot">•</span>
              <span>
                Triage funnel cleared <strong style={{ color: '#38bdf8' }}>{clearanceRate}%</strong> of captured items (
                {decidedCount} decided, {inboxCount} pending triage).
              </span>
            </li>
            <li className="digest-hero-bullet-item">
              <span className="digest-hero-bullet-dot">•</span>
              <span>
                Achieved <strong style={{ color: '#34d399' }}>{doneCount} completed wins</strong>.
                {researchHarvest.length > 0 && (
                  <span>
                    {' '}Concluded <strong style={{ color: '#c084fc' }}>{researchHarvest.length} deep research reports</strong>.
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
            <span>Total Sparks</span>
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
                {digest.wow_delta_percent >= 0 ? `+${digest.wow_delta_percent}%` : `${digest.wow_delta_percent}%`} WoW
              </span>
            )}
          </div>
          <span className="digest-kpi-sub">
            {digest.prev_total !== undefined ? `${digest.prev_total} sparks prior window` : 'ingested captures'}
          </span>
        </div>

        <div className="digest-kpi-card">
          <span className="digest-kpi-label">
            <span>Triage Clearance</span>
            <TrendingUp size={13} color="#38bdf8" />
          </span>
          <div className="digest-kpi-val-row">
            <span className="digest-kpi-val" style={{ color: '#38bdf8' }}>{clearanceRate}%</span>
            <span className="digest-kpi-badge digest-kpi-badge-cyan">
              {decidedCount} decided
            </span>
          </div>
          <span className="digest-kpi-sub">{inboxCount} awaiting triage</span>
        </div>

        <div className="digest-kpi-card">
          <span className="digest-kpi-label">
            <span>Weekly Wins</span>
            <CheckCircle2 size={13} color="#34d399" />
          </span>
          <div className="digest-kpi-val-row">
            <span className="digest-kpi-val" style={{ color: '#34d399' }}>{doneCount}</span>
            <span className="digest-kpi-badge digest-kpi-badge-green">
              Done
            </span>
          </div>
          <span className="digest-kpi-sub">closed action loops</span>
        </div>

        <div className="digest-kpi-card">
          <span className="digest-kpi-label">
            <span>Research Harvest</span>
            <Sparkles size={13} color="#c084fc" />
          </span>
          <div className="digest-kpi-val-row">
            <span className="digest-kpi-val" style={{ color: '#c084fc' }}>{researchHarvest.length}</span>
            <span className="digest-kpi-badge digest-kpi-badge-purple">
              Reports
            </span>
          </div>
          <span className="digest-kpi-sub">verdicts & synthesis</span>
        </div>
      </div>

      {/* 4. Main 2-Column Grid: Emergent Themes Radar & Intelligence Rail */}
      <div className="digest-main-grid">
        {/* Left Column: Emergent Themes Radar */}
        <div className="digest-themes-section">
          <div className="digest-section-title">
            <Compass size={16} color="#818cf8" />
            <span>Emergent Themes Radar</span>
          </div>

          <div className="digest-themes-list">
            {themes.map((theme, idx) => (
              <div key={`${theme.title}-${idx}`} className="digest-theme-box">
                <div className="digest-theme-header">
                  <span className="digest-theme-name">
                    {theme.title}
                  </span>
                  <span className="digest-theme-pill-count">
                    {theme.card_ids?.length || 0} sparks
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
                            {card.research_verdict}
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
              <span>Deep Research Harvest</span>
            </div>

            {researchHarvest.length === 0 ? (
              <div style={{ fontSize: 12, color: '#64748b', padding: '12px 0' }}>
                No deep research runs concluded in this window. Trigger research during Triage to surface verdicts here.
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
                      {c.research_verdict || 'DONE'}
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
              <span>Focus Horizon Balance</span>
            </div>

            <div className="digest-horizon-bar">
              <div
                className="digest-horizon-segment-now"
                style={{ width: `${nowPct}%` }}
                title={`Now: ${nowPct}%`}
              />
              <div
                className="digest-horizon-segment-next"
                style={{ width: `${nextPct}%` }}
                title={`Next: ${nextPct}%`}
              />
              <div
                className="digest-horizon-segment-later"
                style={{ width: `${laterPct}%` }}
                title={`Later: ${laterPct}%`}
              />
            </div>

            <div className="digest-horizon-legend">
              <span style={{ color: '#818cf8' }}>Now ({nowPct}%)</span>
              <span style={{ color: '#34d399' }}>Next ({nextPct}%)</span>
              <span style={{ color: '#38bdf8' }}>Later ({laterPct}%)</span>
            </div>

            {/* Stale Alert if short-term items haven't moved */}
            {(digest.stale_count || 0) > 0 && (
              <div className="digest-stale-alert">
                <AlertTriangle size={15} />
                <span>
                  <strong>{digest.stale_count} Stale Sparks</strong> in Now (&gt;5 days inactive).
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
          <span>Day-by-Day Activity Stream {query.trim() ? `(Filtering by "${query}")` : ''}</span>
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
            No sparks in this activity stream match &ldquo;{query}&rdquo;.
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
                      ({day.cards.length} card{day.cards.length > 1 ? 's' : ''})
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