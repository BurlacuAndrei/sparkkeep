import React, { useEffect, useLayoutEffect, useRef } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  Layers,
  RefreshCw,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { Card } from '../../types';
import { getPlatformInfo, formatRelativeAge } from '../../utils/cardUtils';
import { enumLabel } from '../../utils/cardEnumLabels';
import {
  Horizon,
  horizonLabel,
  isAnalysisFailed,
  isResearchFailed,
  isResearchReady,
  suggestedHorizonOf,
} from '../../utils/triage';
import { useLocale } from '../../i18n';

export type DeckIntent = 'dismiss' | 'keep' | 'research' | 'skip';

export interface DragSignal {
  /** Dominant drag direction, even before the commit threshold. */
  direction: DeckIntent | null;
  /** 0..1 progress towards the commit threshold. */
  strength: number;
  /** Horizon the card would land in if released now (keep only). */
  horizon: Horizon | null;
}

export interface DeckExit {
  intent: DeckIntent;
  horizon: Horizon | null;
}

interface SwipeCardProps {
  card: Card;
  siblingIndex?: number;
  siblingTotal?: number;
  remainingSiblings: number;
  expanded: boolean;
  exit: DeckExit | null;
  zoneRefs: React.MutableRefObject<Record<Horizon, HTMLDivElement | null>>;
  onToggleExpand: () => void;
  onOpenDetail: () => void;
  onRetryAnalysis: () => void;
  onRetryResearch: () => void;
  onDismissSiblings: () => void;
  onDragSignal: (s: DragSignal) => void;
  onCommit: (intent: DeckIntent, horizon: Horizon | null) => void;
}

const V_THRESHOLD = 110;
const EXIT_MS = 320;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const SwipeCard: React.FC<SwipeCardProps> = ({
  card,
  siblingIndex,
  siblingTotal,
  remainingSiblings,
  expanded,
  exit,
  zoneRefs,
  onToggleExpand,
  onOpenDetail,
  onRetryAnalysis,
  onRetryResearch,
  onDismissSiblings,
  onDragSignal,
  onCommit,
}) => {
  const ref = useRef<HTMLElement>(null);
  const { t, tp } = useLocale();
  const drag = useRef<{
    id: number;
    x0: number;
    y0: number;
    t0: number;
    dx: number;
    dy: number;
    moved: boolean;
  } | null>(null);
  const lastSignal = useRef<string>('');

  const suggested = suggestedHorizonOf(card);
  const ready = isResearchReady(card);
  const researchFailed = isResearchFailed(card);
  const analysisFailed = isAnalysisFailed(card);
  const verdict = (card.research_verdict || '').toLowerCase();
  const platform = getPlatformInfo(card.source_url);
  const age = formatRelativeAge(card.created_at, t, tp);
  const worthLevel = (card.worthiness?.level || '').toLowerCase();
  const researchActions =
    ready && card.actions_source === 'research' ? (card.proposed_actions || []).slice(0, 3) : [];

  const hThreshold = () => Math.min(150, (ref.current?.offsetWidth || 480) * 0.3);

  /** Which horizon zone is under the pointer? Falls back to the AI suggestion. */
  const horizonAt = (clientX: number, clientY: number): { horizon: Horizon; overZone: boolean } => {
    const zones = Object.entries(zoneRefs.current).filter(([, el]) => el) as [Horizon, HTMLDivElement][];
    if (zones.length === 0) return { horizon: suggested, overZone: false };
    const left = Math.min(...zones.map(([, el]) => el.getBoundingClientRect().left));
    if (clientX < left - 48) return { horizon: suggested, overZone: false };
    let best: Horizon = suggested;
    let bestDist = Infinity;
    zones.forEach(([h, el]) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(clientY - (r.top + r.height / 2));
      if (d < bestDist) {
        bestDist = d;
        best = h;
      }
    });
    return { horizon: best, overZone: true };
  };

  const resolve = (dx: number, dy: number, clientX: number, clientY: number) => {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const H = hThreshold();
    let direction: DeckIntent | null = null;
    let strength = 0;
    if (ax < 8 && ay < 8) return { direction, strength, committed: false, horizon: null as Horizon | null };
    if (ax >= ay) {
      direction = dx < 0 ? 'dismiss' : 'keep';
      strength = Math.min(1, ax / H);
    } else {
      direction = dy < 0 ? 'research' : 'skip';
      strength = Math.min(1, ay / V_THRESHOLD);
    }
    const horizon = direction === 'keep' ? horizonAt(clientX, clientY).horizon : null;
    return { direction, strength, committed: strength >= 1, horizon };
  };

  const emit = (s: DragSignal) => {
    const key = `${s.direction}|${s.strength.toFixed(1)}|${s.horizon}`;
    if (key === lastSignal.current) return;
    lastSignal.current = key;
    onDragSignal(s);
  };

  const setTransform = (dx: number, dy: number, animate: boolean) => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = animate ? 'transform 360ms cubic-bezier(.2,.9,.3,1.2)' : 'none';
    el.style.transform = dx || dy ? `translate(${dx}px, ${dy}px) rotate(${Math.max(-14, Math.min(14, dx * 0.05))}deg)` : '';
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (exit) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, a, input, textarea, [data-no-drag]')) return;
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, dx: 0, dy: 0, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    d.dx = e.clientX - d.x0;
    d.dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(d.dx, d.dy) > 6) {
      d.moved = true;
      ref.current?.classList.add('is-dragging');
    }
    if (!d.moved) return;
    setTransform(d.dx, d.dy, false);
    const r = resolve(d.dx, d.dy, e.clientX, e.clientY);
    emit({ direction: r.direction, strength: r.strength, horizon: r.horizon });
  };

  const endDrag = (e: React.PointerEvent, cancelled = false) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    ref.current?.classList.remove('is-dragging');
    if (!d.moved) {
      if (!cancelled) onToggleExpand();
      return;
    }
    const r = resolve(d.dx, d.dy, e.clientX, e.clientY);
    // A quick horizontal flick commits even below the distance threshold.
    const dt = Math.max(1, e.timeStamp - d.t0);
    const vx = d.dx / dt;
    const flick = Math.abs(vx) > 0.75 && Math.abs(d.dx) > 50 && Math.abs(d.dx) > Math.abs(d.dy);
    if (!cancelled && r.direction && (r.committed || (flick && (r.direction === 'keep' || r.direction === 'dismiss')))) {
      onCommit(r.direction, r.direction === 'keep' ? r.horizon ?? suggested : null);
      return;
    }
    setTransform(0, 0, true);
    emit({ direction: null, strength: 0, horizon: null });
  };

  // Fly-out animation, driven by the parent for drag, button and keyboard decisions alike.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!exit || !el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const current = el.style.transform || '';
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(current);
    const curX = m ? parseFloat(m[1]) : 0;
    const curY = m ? parseFloat(m[2]) : 0;

    let target = '';
    let opacity = '0';
    if (prefersReducedMotion()) {
      target = current;
    } else if (exit.intent === 'dismiss') {
      target = `translate(${-window.innerWidth}px, ${curY + 60}px) rotate(-24deg)`;
    } else if (exit.intent === 'keep') {
      const zone = exit.horizon ? zoneRefs.current[exit.horizon] : null;
      if (zone) {
        const z = zone.getBoundingClientRect();
        const tx = z.left + z.width / 2 - cx + curX;
        const ty = z.top + z.height / 2 - cy + curY;
        target = `translate(${tx}px, ${ty}px) rotate(12deg) scale(0.18)`;
      } else {
        target = `translate(${window.innerWidth}px, ${curY}px) rotate(24deg)`;
      }
    } else if (exit.intent === 'research') {
      const tray = document.getElementById('research-tray');
      if (tray) {
        const t = tray.getBoundingClientRect();
        const tx = t.left + t.width / 2 - cx + curX;
        const ty = t.top + 24 - cy + curY;
        target = `translate(${tx}px, ${ty}px) scale(0.12)`;
      } else {
        target = `translate(${curX}px, ${-window.innerHeight}px) scale(0.6)`;
      }
    } else {
      target = `translate(${curX}px, ${curY + 80}px) scale(0.86)`;
      opacity = '0';
    }
    el.style.transition = `transform ${EXIT_MS}ms cubic-bezier(.4,0,.2,1), opacity ${EXIT_MS}ms ease`;
    // Force the starting frame before transitioning.
    void el.offsetWidth;
    el.style.transform = target;
    el.style.opacity = opacity;
  }, [exit, zoneRefs]);

  useEffect(() => () => onDragSignal({ direction: null, strength: 0, horizon: null }), [onDragSignal]);

  return (
    <article
      ref={ref}
      className={`deck-card ${ready ? 'is-ready' : ''} ${researchFailed ? 'is-research-failed' : ''} ${expanded ? 'is-expanded' : ''}`}
      data-id={card.id}
      aria-label={t('cards.swipe.aria', { title: card.title })}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endDrag(e)}
      onPointerCancel={(e) => endDrag(e, true)}
    >
      {/* Status ribbon: research report ready / failed */}
      {ready && (
        <div className="deck-ribbon ready">
          <Sparkles size={13} />
          <span>{t('cards.swipe.ready')}</span>
          {verdict && (
            <span className={`deck-verdict ${verdict}`}>
              {enumLabel(t, 'verdict', verdict)}
              {card.research_confidence && (
                <em>
                  {' '}
                  · {t('cards.swipe.confidence', {
                    value: enumLabel(t, 'confidence', card.research_confidence),
                  })}
                </em>
              )}
            </span>
          )}
        </div>
      )}
      {researchFailed && (
        <div className="deck-ribbon failed">
          <AlertTriangle size={13} />
          <span>{t('cards.swipe.failed')}</span>
          <button type="button" className="deck-ribbon-btn" onClick={onRetryResearch}>
            <RefreshCw size={11} /> {t('cards.swipe.retry')}
          </button>
        </div>
      )}

      <div className="deck-card-meta">
        <span className="deck-chip" style={{ color: platform.color }}>
          {platform.icon}
          <span>{platform.name}</span>
        </span>
        {card.type && <span className="deck-chip type">{card.type}</span>}
        {card.signals?.extraction && card.signals.extraction !== 'full' && (
          <span className="deck-chip warn" title={t('cards.swipe.partialRead')}>
            <AlertTriangle size={10} /> {enumLabel(t, 'extraction', card.signals.extraction)}
          </span>
        )}
        {card.signals?.promo && <span className="deck-chip warn">{t('cards.item.promo')}</span>}
        <span className="deck-card-age">{age}</span>
      </div>

      {siblingTotal && siblingTotal > 1 ? (
        <div className="deck-sibling-row">
          <span className="deck-sibling-pill">
            <Layers size={11} />
            {t('cards.swipe.ideaOf', { index: siblingIndex ?? 1, total: siblingTotal })}
          </span>
          {remainingSiblings > 1 && (
            <button type="button" className="deck-link-btn" onClick={onDismissSiblings}>
              <X size={11} /> {tp('cards.swipe.dismissRemaining', remainingSiblings)}
            </button>
          )}
        </div>
      ) : null}

      <h3 className="deck-card-title">{card.title}</h3>

      {analysisFailed ? (
        <div className="deck-failed-box">
          <AlertTriangle size={14} />
          <span>{t('cards.swipe.failedRead')}</span>
          <button type="button" className="deck-ribbon-btn" onClick={onRetryAnalysis}>
            <RefreshCw size={11} /> {t('cards.swipe.retryExtraction')}
          </button>
        </div>
      ) : (
        <>
          <p className="deck-card-tldr">{card.tldr || card.summary}</p>
          {card.why_care && (
            <p className="deck-card-why">
              <strong>{t('cards.swipe.whyCare')}</strong>
              {card.why_care}
            </p>
          )}
        </>
      )}

      {ready && (card.executive_summary || researchActions.length > 0) && (
        <div className="deck-report">
          {card.executive_summary && <p className="deck-report-summary">{card.executive_summary}</p>}
          {researchActions.length > 0 && (
            <ul className="deck-report-actions">
              {researchActions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {expanded && (
        <div className="deck-card-details">
          {card.summary && card.tldr && card.summary !== card.tldr && <p className="deck-detail-summary">{card.summary}</p>}
          {card.claims && card.claims.length > 0 && (
            <div className="deck-detail-block">
              <h4>{t('cards.swipe.claims')}</h4>
              <ul>
                {card.claims.slice(0, 5).map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {card.open_questions && card.open_questions.length > 0 && (
            <div className="deck-detail-block">
              <h4>{t('cards.swipe.openQuestions')}</h4>
              <ul>
                {card.open_questions.slice(0, 4).map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}
          {card.worthiness?.reason && (
            <div className="deck-detail-block">
              <h4>{t('cards.swipe.whyWorthiness')}</h4>
              <p>{card.worthiness.reason}</p>
            </div>
          )}
          {card.source_url && (
            <a className="deck-source-link" href={card.source_url} target="_blank" rel="noreferrer">
              <ExternalLink size={12} /> {card.source_url}
            </a>
          )}
        </div>
      )}

      <div className="deck-card-footer">
        <div className="deck-ai-row">
          {worthLevel && (
            <span className={`deck-worth ${worthLevel}`} title={card.worthiness?.reason || ''}>
              <Target size={11} /> {t('cards.swipe.worthiness', {
                level: enumLabel(t, 'worthiness', worthLevel),
              })}
            </span>
          )}
          <span className="deck-suggest">
            <Sparkles size={11} /> {t('cards.swipe.suggested')}{' '}
            <strong>{horizonLabel(suggested, t)}</strong>
          </span>
        </div>
        <div className="deck-card-footer-actions">
          {(card.tags || []).slice(0, 3).map((t) => (
            <span key={t} className="deck-tag">#{t}</span>
          ))}
          <button type="button" className="deck-link-btn" onClick={onToggleExpand} aria-expanded={expanded}>
            <ChevronDown size={12} className={expanded ? 'flip' : ''} /> {expanded ? t('cards.swipe.less') : t('cards.swipe.more')}
          </button>
          <button type="button" className="deck-link-btn" onClick={onOpenDetail}>
            <ExternalLink size={12} /> {ready ? t('cards.swipe.fullReport') : t('cards.swipe.details')}
          </button>
        </div>
      </div>
    </article>
  );
};

export const DECK_EXIT_MS = EXIT_MS;
