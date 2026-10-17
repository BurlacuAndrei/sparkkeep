import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Inbox, LayoutList, Layers3, PartyPopper, Sparkles, X } from 'lucide-react';
import { Card } from '../types';
import * as api from '../api';
import { SwipeCard, DeckExit, DeckIntent, DragSignal, DECK_EXIT_MS } from './triage/SwipeCard';
import { ResearchTray } from './triage/ResearchTray';
import { TriageList } from './triage/TriageList';
import {
  HORIZONS,
  Horizon,
  horizonLabel,
  isResearchFailed,
  isResearchInFlight,
  isResearchReady,
  isTriageCard,
  rankDeck,
  suggestedHorizonOf,
} from '../utils/triage';
import '../styles/triage-deck.css';

interface TriageViewProps {
  cards: Card[];
  onUpdateCard: (id: number, patch: Partial<Card>) => void;
  onResearch: (id: number, playbookId?: number) => void;
  onRetry: (id: number) => void;
  onOpenCardDetail: (card: Card) => void;
  onRefresh?: () => void;
  showToast?: (msg: string, onUndo?: () => Promise<void> | void) => void;
  onExitFocus?: () => void;
}

type UndoEntry =
  | { kind: 'decision'; prev: { id: number; status: Card['status']; horizon: Card['horizon'] }[]; done: Promise<unknown>; label: string; stat: 'kept' | 'dismissed' }
  | { kind: 'skip'; id: number }
  | { kind: 'research'; id: number };

const RESEARCH_UNDO_MS = 5000;
const RETURNED_PILL_MS = 9000;
const MODE_KEY = 'sparkkeep_triage_mode';

const sigOf = (c: Card) => `${c.research_state || 'none'}|${c.updated_at}`;
const shortTitle = (t: string) => (t.length > 48 ? `${t.slice(0, 46)}…` : t);

export const TriageView: React.FC<TriageViewProps> = ({
  cards,
  onUpdateCard,
  onResearch,
  onRetry,
  onOpenCardDetail,
  onRefresh,
  showToast,
}) => {
  const [mode, setMode] = useState<'deck' | 'list'>(() =>
    typeof window !== 'undefined' && localStorage.getItem(MODE_KEY) === 'list' ? 'list' : 'deck'
  );
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  const [pending, setPending] = useState<number[]>([]);
  const [launching, setLaunching] = useState<Map<number, string>>(() => new Map());
  const [order, setOrder] = useState<number[]>([]);
  const [returned, setReturned] = useState<number[]>([]);
  const [exit, setExit] = useState<DeckExit | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [signal, setSignal] = useState<DragSignal>({ direction: null, strength: 0, horizon: null });
  const [stats, setStats] = useState({ kept: 0, dismissed: 0, researched: 0 });

  const orderRef = useRef<number[]>([]);
  const cardsRef = useRef<Card[]>(cards);
  const undoStack = useRef<UndoEntry[]>([]);
  const pinned = useRef<number[]>([]);
  const returning = useRef<Set<number>>(new Set());
  const prevInFlight = useRef<Set<number>>(new Set());
  const pendingTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const zoneRefs = useRef<Record<Horizon, HTMLDivElement | null>>({
    'short-term': null,
    'medium-term': null,
    'long-term': null,
  });

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  const commitOrder = useCallback((next: number[]) => {
    orderRef.current = next;
    setOrder(next);
  }, []);

  // ---- Derived collections -------------------------------------------------
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const triageCards = useMemo(() => cards.filter(isTriageCard), [cards]);
  const inFlight = useMemo(
    () => triageCards.filter((c) => isResearchInFlight(c) && !pending.includes(c.id)),
    [triageCards, pending]
  );
  const pool = useMemo(() => {
    const excluded = new Set<number>([...hidden, ...pending, ...launching.keys()]);
    return triageCards.filter((c) => !isResearchInFlight(c) && !excluded.has(c.id));
  }, [triageCards, hidden, pending, launching]);
  const poolMap = useMemo(() => new Map(pool.map((c) => [c.id, c])), [pool]);
  const deck = useMemo(() => order.map((id) => poolMap.get(id)).filter(Boolean) as Card[], [order, poolMap]);
  const current = deck[0] || null;

  const captureCounts = useMemo(
    () =>
      cards.reduce<Record<number, number>>((acc, c) => {
        if (c.capture_id) acc[c.capture_id] = (acc[c.capture_id] || 0) + 1;
        return acc;
      }, {}),
    [cards]
  );

  // ---- Research lifecycle: in-flight → back into the deck as the next card ---
  useEffect(() => {
    const cardMap = new Map(cards.map((c) => [c.id, c]));
    const now = new Set(cards.filter((c) => isTriageCard(c) && isResearchInFlight(c)).map((c) => c.id));
    const finished = [...prevInFlight.current].filter((id) => {
      if (now.has(id)) return false;
      const c = cardMap.get(id);
      return Boolean(c && isTriageCard(c));
    });
    prevInFlight.current = now;

    // Launches resolve once the server reflects the new research state.
    const resolvedLaunches: number[] = [];
    launching.forEach((sig, id) => {
      const c = cardMap.get(id);
      if (!c || !isTriageCard(c) || isResearchInFlight(c) || sigOf(c) !== sig) {
        resolvedLaunches.push(id);
        if (c && isTriageCard(c) && !isResearchInFlight(c)) finished.push(id);
      }
    });

    if (finished.length) {
      finished.forEach((id) => returning.current.add(id));
      // oxlint-disable-next-line react/set-state-in-effect
      setReturned((r) => [...new Set([...r, ...finished])]);
      setTimeout(() => setReturned((r) => r.filter((id) => !finished.includes(id))), RETURNED_PILL_MS);
    }
    if (resolvedLaunches.length) {
      setLaunching((prev) => {
        const next = new Map(prev);
        resolvedLaunches.forEach((id) => next.delete(id));
        return next;
      });
    }

    // Forget optimistic hides once the server confirms the card left triage.
    setHidden((prev) => {
      let changed = false;
      const next = new Set(prev);
      prev.forEach((id) => {
        const c = cardMap.get(id);
        if (!c || !isTriageCard(c)) {
          next.delete(id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [cards, launching]);

  // ---- Reconcile deck order with the pool (stable across polls) -------------
  useEffect(() => {
    const ids = new Set(pool.map((c) => c.id));
    const kept = orderRef.current.filter((id) => ids.has(id));
    const known = new Set(kept);
    const newcomers = rankDeck(pool.filter((c) => !known.has(c.id)));
    if (newcomers.length === 0 && kept.length === orderRef.current.length) return;

    const front: number[] = [];
    const soon: number[] = [];
    const back: number[] = [];
    newcomers.forEach((c) => {
      if (pinned.current.includes(c.id)) front.push(c.id);
      else if (returning.current.has(c.id) || isResearchReady(c) || isResearchFailed(c)) soon.push(c.id);
      else back.push(c.id);
    });
    front.sort((a, b) => pinned.current.indexOf(a) - pinned.current.indexOf(b));
    pinned.current = pinned.current.filter((id) => !front.includes(id));
    soon.forEach((id) => returning.current.delete(id));

    // Never swap the card the user is looking at; returning reports slot in right after it.
    const head = front.length ? [] : kept.slice(0, 1);
    const tail = front.length ? kept : kept.slice(1);
    // oxlint-disable-next-line react/set-state-in-effect
    commitOrder([...front, ...head, ...soon, ...tail, ...back]);
  }, [pool, commitOrder]);

  // ---- Research launch (with an undo window, since research costs tokens) ---
  const launchResearch = useCallback(
    (id: number) => {
      pendingTimers.current.delete(id);
      const c = cardsRef.current.find((x) => x.id === id);
      setPending((p) => p.filter((x) => x !== id));
      setLaunching((prev) => new Map(prev).set(id, c ? sigOf(c) : ''));
      api
        .triggerResearch(id)
        .then(() => onRefresh?.())
        .catch((err: unknown) => {
          showToast?.(api.getErrorMessage(err));
          pinned.current.push(id);
          setLaunching((prev) => {
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
        });
    },
    [onRefresh, showToast]
  );

  const cancelPending = useCallback((id: number) => {
    const t = pendingTimers.current.get(id);
    if (!t) return false;
    clearTimeout(t);
    pendingTimers.current.delete(id);
    pinned.current.push(id);
    setPending((p) => p.filter((x) => x !== id));
    setStats((s) => ({ ...s, researched: Math.max(0, s.researched - 1) }));
    undoStack.current = undoStack.current.filter((e) => !(e.kind === 'research' && e.id === id));
    return true;
  }, []);

  // Leaving the view mid-window should not silently drop the user's intent.
  useEffect(() => {
    const timers = pendingTimers.current;
    return () => {
      timers.forEach((t, id) => {
        clearTimeout(t);
        api.triggerResearch(id).catch(() => {});
      });
      timers.clear();
    };
  }, []);

  // ---- Undo ----------------------------------------------------------------
  const undoEntry = useCallback(
    async (entry: UndoEntry) => {
      undoStack.current = undoStack.current.filter((e) => e !== entry);
      if (entry.kind === 'skip') {
        commitOrder([entry.id, ...orderRef.current.filter((x) => x !== entry.id)]);
        return;
      }
      if (entry.kind === 'research') {
        if (!cancelPending(entry.id)) showToast?.('Research already started — it will return here when ready');
        return;
      }
      const ids = entry.prev.map((p) => p.id);
      pinned.current.push(...ids);
      setHidden((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      setStats((s) => ({ ...s, [entry.stat]: Math.max(0, s[entry.stat] - ids.length) }));
      try {
        await entry.done.catch(() => {});
        await Promise.all(entry.prev.map((p) => api.updateCard(p.id, { status: p.status, horizon: p.horizon })));
        showToast?.(`Restored ${entry.label}`);
      } catch (err: unknown) {
        showToast?.(api.getErrorMessage(err));
      } finally {
        onRefresh?.();
      }
    },
    [cancelPending, commitOrder, onRefresh, showToast]
  );

  const undoLast = useCallback(() => {
    const entry = undoStack.current[undoStack.current.length - 1];
    if (entry) void undoEntry(entry);
  }, [undoEntry]);

  // ---- Decisions -----------------------------------------------------------
  const applyStatus = useCallback(
    (targets: Card[], patch: (c: Card) => Partial<Card>, stat: 'kept' | 'dismissed', label: string, message: string) => {
      const ids = targets.map((c) => c.id);
      setHidden((prev) => new Set([...prev, ...ids]));
      setStats((s) => ({ ...s, [stat]: s[stat] + ids.length }));
      const done = Promise.all(targets.map((c) => api.updateCard(c.id, patch(c))))
        .then(() => onRefresh?.())
        .catch((err: unknown) => {
          showToast?.(api.getErrorMessage(err));
          pinned.current.push(...ids);
          setHidden((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => next.delete(id));
            return next;
          });
          setStats((s) => ({ ...s, [stat]: Math.max(0, s[stat] - ids.length) }));
          throw err;
        });
      const entry: UndoEntry = {
        kind: 'decision',
        prev: targets.map((c) => ({ id: c.id, status: c.status, horizon: c.horizon })),
        done,
        label,
        stat,
      };
      undoStack.current.push(entry);
      showToast?.(message, () => undoEntry(entry));
    },
    [onRefresh, showToast, undoEntry]
  );

  const apply = useCallback(
    (intent: DeckIntent, card: Card, horizon: Horizon | null) => {
      const t = `“${shortTitle(card.title)}”`;
      if (intent === 'dismiss') {
        applyStatus([card], () => ({ status: 'dismissed' }), 'dismissed', t, `Dismissed ${t}`);
      } else if (intent === 'keep') {
        const h = horizon || suggestedHorizonOf(card);
        applyStatus([card], () => ({ status: 'to-do', horizon: h }), 'kept', t, `Kept ${t} → ${horizonLabel(h)}`);
      } else if (intent === 'research') {
        setPending((p) => [...p, card.id]);
        setStats((s) => ({ ...s, researched: s.researched + 1 }));
        pendingTimers.current.set(card.id, setTimeout(() => launchResearch(card.id), RESEARCH_UNDO_MS));
        const entry: UndoEntry = { kind: 'research', id: card.id };
        undoStack.current.push(entry);
        showToast?.(`Researching ${t} — it comes back as your next card when the report is ready`, () => undoEntry(entry));
      } else {
        commitOrder([...orderRef.current.filter((x) => x !== card.id), card.id]);
        undoStack.current.push({ kind: 'skip', id: card.id });
      }
    },
    [applyStatus, commitOrder, launchResearch, showToast, undoEntry]
  );

  const decide = useCallback(
    (intent: DeckIntent, horizon: Horizon | null = null) => {
      if (exit || !current) return;
      const card = current;
      setExit({ intent, horizon: intent === 'keep' ? horizon || suggestedHorizonOf(card) : null });
      setTimeout(() => {
        apply(intent, card, intent === 'keep' ? horizon || suggestedHorizonOf(card) : null);
        setExit(null);
        setExpanded(false);
        setSignal({ direction: null, strength: 0, horizon: null });
      }, DECK_EXIT_MS);
    },
    [apply, current, exit]
  );

  const dismissSiblings = useCallback(() => {
    if (!current?.capture_id || exit) return;
    const siblings = deck.filter((c) => c.capture_id === current.capture_id);
    setExit({ intent: 'dismiss', horizon: null });
    setTimeout(() => {
      applyStatus(
        siblings,
        () => ({ status: 'dismissed' }),
        'dismissed',
        `${siblings.length} ideas`,
        `Dismissed ${siblings.length} ideas from this capture`
      );
      setExit(null);
      setExpanded(false);
    }, DECK_EXIT_MS);
  }, [applyStatus, current, deck, exit]);

  const pullForward = useCallback(
    (id: number) => {
      if (!poolMap.has(id)) return;
      commitOrder([id, ...orderRef.current.filter((x) => x !== id)]);
      setReturned((r) => r.filter((x) => x !== id));
      setExpanded(false);
    },
    [commitOrder, poolMap]
  );

  // ---- Keyboard ------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode !== 'deck' || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && typeof target.closest === 'function') {
        if (target.closest('input, textarea, select, [contenteditable="true"]') || target.isContentEditable) return;
      }
      if (document.querySelector('.modal-overlay, .modal-content, .drawer-overlay')) return;
      const onControl = Boolean(target && typeof target.closest === 'function' && target.closest('button, a'));
      const k = e.key.toLowerCase();
      const code = e.code;

      if (k === 'z') {
        e.preventDefault();
        undoLast();
        return;
      }
      if (!current) return;

      const is1 = k === '1' || k === '!' || k === '&' || code === 'Digit1' || code === 'Numpad1';
      const is2 = k === '2' || k === '@' || k === 'é' || code === 'Digit2' || code === 'Numpad2';
      const is3 = k === '3' || k === '#' || k === '"' || code === 'Digit3' || code === 'Numpad3';
      const is0 = k === '0' || k === 'à' || code === 'Digit0' || code === 'Numpad0';
      const isO = k === 'o' || code === 'KeyO';

      if (k === 'arrowleft' || k === 'x' || k === 'escape') {
        e.preventDefault();
        decide('dismiss');
      } else if (k === 'arrowright' || (k === 'enter' && !onControl)) {
        e.preventDefault();
        decide('keep');
      } else if (is1) {
        e.preventDefault();
        decide('keep', 'short-term');
      } else if (is2) {
        e.preventDefault();
        decide('keep', 'medium-term');
      } else if (is3) {
        e.preventDefault();
        decide('keep', 'long-term');
      } else if (k === 'arrowup' || k === 'r') {
        e.preventDefault();
        decide('research');
      } else if (k === 'arrowdown' || k === 's') {
        e.preventDefault();
        decide('skip');
      } else if (k === ' ' && !onControl) {
        e.preventDefault();
        setExpanded((v) => !v);
      } else if (isO || is0) {
        e.preventDefault();
        onOpenCardDetail(current);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [current, decide, mode, onOpenCardDetail, undoLast]);

  const switchMode = (m: 'deck' | 'list') => {
    setMode(m);
    localStorage.setItem(MODE_KEY, m);
  };

  // ---- List-mode bulk actions ---------------------------------------------
  const bulkStatus = (ids: number[], status: 'to-do' | 'dismissed') => {
    const targets = ids.map((id) => byId.get(id)).filter(Boolean) as Card[];
    if (!targets.length) return;
    applyStatus(
      targets,
      (c) => (status === 'to-do' ? { status, horizon: suggestedHorizonOf(c) } : { status }),
      status === 'to-do' ? 'kept' : 'dismissed',
      `${targets.length} ideas`,
      status === 'to-do' ? `Kept ${targets.length} ideas at their suggested horizon` : `Dismissed ${targets.length} ideas`
    );
  };
  const bulkResearch = (ids: number[]) => {
    Promise.all(ids.map((id) => api.triggerResearch(id)))
      .then(() => {
        showToast?.(`Research queued for ${ids.length} ideas`);
        onRefresh?.();
      })
      .catch((err: unknown) => showToast?.(api.getErrorMessage(err)));
  };

  // ---- Render --------------------------------------------------------------
  const decided = stats.kept + stats.dismissed;
  const remaining = deck.length + inFlight.length + pending.length;
  const progress = decided + remaining > 0 ? decided / (decided + remaining) : 1;
  const pendingCards = pending.map((id) => byId.get(id)).filter(Boolean) as Card[];
  const returnedCards = returned
    .filter((id) => poolMap.has(id) && id !== current?.id)
    .map((id) => poolMap.get(id)) as Card[];

  const siblingInfo = (card: Card) => {
    if (!card.capture_id) return { index: undefined, total: undefined, remaining: 0 };
    const all = cards.filter((c) => c.capture_id === card.capture_id).sort((a, b) => a.id - b.id);
    return {
      index: all.findIndex((c) => c.id === card.id) + 1,
      total: all.length,
      remaining: deck.filter((c) => c.capture_id === card.capture_id).length,
    };
  };

  const verdict = (current?.research_verdict || '').toLowerCase();
  const recommend = current && isResearchReady(current) ? verdict : '';
  const suggested = current ? suggestedHorizonOf(current) : null;
  const activeDir = exit?.intent ?? signal.direction;
  const activeStrength = exit ? 1 : signal.strength;
  const activeHorizon = exit?.horizon ?? (signal.direction === 'keep' ? signal.horizon : null);
  const zoneStyle = (dir: DeckIntent) =>
    ({ '--zone-strength': activeDir === dir ? activeStrength : 0 }) as React.CSSProperties;

  const listCards = [...rankDeck(pool), ...inFlight];

  return (
    <div className="triage-view">
      <header className="deck-header">
        <div className="deck-header-title">
          <h2 id="main-heading">Triage</h2>
          <span className="deck-count">
            {deck.length} to decide
            {inFlight.length + pending.length > 0 && <> · {inFlight.length + pending.length} researching</>}
          </span>
        </div>
        <div className="deck-progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="deck-progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="deck-mode-toggle" role="tablist" aria-label="Triage layout">
          <button type="button" id="triage-mode-deck" role="tab" aria-selected={mode === 'deck'} className={mode === 'deck' ? 'active' : ''} onClick={() => switchMode('deck')}>
            <Layers3 size={13} /> Deck
          </button>
          <button type="button" id="triage-mode-list" role="tab" aria-selected={mode === 'list'} className={mode === 'list' ? 'active' : ''} onClick={() => switchMode('list')}>
            <LayoutList size={13} /> List
          </button>
        </div>
      </header>

      {mode === 'list' ? (
        <TriageList
          cards={listCards}
          captureCounts={captureCounts}
          onStatusChange={(id, status) => onUpdateCard(id, { status: status as Card['status'] })}
          onResearch={(id) => onResearch(id)}
          onRetry={onRetry}
          onOpen={onOpenCardDetail}
          onBulkKeep={(ids) => bulkStatus(ids, 'to-do')}
          onBulkDismiss={(ids) => bulkStatus(ids, 'dismissed')}
          onBulkResearch={bulkResearch}
        />
      ) : (
        <>
          <section className={`deck-stage ${activeDir ? `dir-${activeDir}` : ''}`} aria-label="Triage deck">
            <div className="deck-zone deck-zone-dismiss" style={zoneStyle('dismiss')} aria-hidden>
              <X size={22} />
              <span>Dismiss</span>
            </div>
            <div className="deck-zone deck-zone-research" style={zoneStyle('research')} aria-hidden>
              <Sparkles size={16} />
              <span>Deep research</span>
            </div>
            <div className="deck-zone deck-zone-skip" style={zoneStyle('skip')} aria-hidden>
              <ArrowDown size={14} />
              <span>Skip for now</span>
            </div>

            <div className="deck-center">
              {current ? (
                <div className="deck-pile">
                  {deck.slice(1, 3).map((c, i) => (
                    <div key={`ghost-${c.id}`} className={`deck-ghost ghost-${i + 1}`} aria-hidden>
                      <span className="deck-ghost-title">{c.title}</span>
                    </div>
                  ))}
                  {(() => {
                    const sib = siblingInfo(current);
                    return (
                      <SwipeCard
                        key={current.id}
                        card={current}
                        siblingIndex={sib.index}
                        siblingTotal={sib.total}
                        remainingSiblings={sib.remaining}
                        expanded={expanded}
                        exit={exit}
                        zoneRefs={zoneRefs}
                        onToggleExpand={() => setExpanded((v) => !v)}
                        onOpenDetail={() => onOpenCardDetail(current)}
                        onRetryAnalysis={() => onRetry(current.id)}
                        onRetryResearch={() => decide('research')}
                        onDismissSiblings={dismissSiblings}
                        onDragSignal={setSignal}
                        onCommit={(intent, h) => decide(intent, h)}
                      />
                    );
                  })()}
                </div>
              ) : (
                <div className="deck-empty">
                  {inFlight.length + pending.length > 0 ? (
                    <>
                      <div className="deck-empty-icon research">
                        <Sparkles size={26} />
                      </div>
                      <h3>You're clear for now</h3>
                      <p>
                        {inFlight.length + pending.length} {inFlight.length + pending.length === 1 ? 'idea is' : 'ideas are'} being
                        researched. Each one comes back here as your next card when its report is ready.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="deck-empty-icon">
                        {decided > 0 ? <PartyPopper size={26} /> : <Inbox size={26} />}
                      </div>
                      <h3>Triage zero</h3>
                      <p>
                        {decided > 0
                          ? `This session: ${stats.kept} kept · ${stats.dismissed} dismissed · ${stats.researched} researched.`
                          : 'New captures from Telegram or the web will land here.'}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className={`deck-horizons ${activeDir === 'keep' ? 'is-active' : ''}`}>
              {HORIZONS.map((h) => (
                <div
                  key={h.id}
                  ref={(el) => {
                    zoneRefs.current[h.id] = el;
                  }}
                  role="button"
                  tabIndex={0}
                  id={`triage-zone-${h.id}`}
                  className={`deck-horizon ${h.id} ${activeHorizon === h.id ? 'is-target' : ''} ${suggested === h.id ? 'is-suggested' : ''}`}
                  onClick={() => decide('keep', h.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      decide('keep', h.id);
                    }
                  }}
                  title={`Keep in ${h.label} (${h.key})`}
                >
                  <span className="deck-horizon-label">{h.label}</span>
                  <span className="deck-horizon-hint">{h.hint}</span>
                  {suggested === h.id && <span className="deck-horizon-ai">AI pick</span>}
                  <kbd>{h.key}</kbd>
                </div>
              ))}
            </div>
          </section>

          <div className="deck-controls" aria-label="Triage actions">
            <button type="button" id="triage-btn-dismiss" className={`deck-btn dismiss ${recommend === 'skip' ? 'is-recommended' : ''}`} disabled={!current} onClick={() => decide('dismiss')}>
              <ArrowLeft size={18} />
              <span>Dismiss</span>
              <kbd>←</kbd>
            </button>
            <button type="button" id="triage-btn-skip" className="deck-btn skip" disabled={!current || deck.length < 2} onClick={() => decide('skip')}>
              <ArrowDown size={18} />
              <span>Skip</span>
              <kbd>↓</kbd>
            </button>
            <button type="button" id="triage-btn-research" className="deck-btn research" disabled={!current} onClick={() => decide('research')}>
              <ArrowUp size={18} />
              <span>{current && isResearchReady(current) ? 'Re-research' : 'Research'}</span>
              <kbd>↑</kbd>
            </button>
            <button type="button" id="triage-btn-keep" className={`deck-btn keep ${recommend === 'pursue' || recommend === 'watch' ? 'is-recommended' : ''}`} disabled={!current} onClick={() => decide('keep')}>
              <ArrowRight size={18} />
              <span>Keep{suggested ? ` · ${horizonLabel(suggested)}` : ''}</span>
              <kbd>→</kbd>
            </button>
          </div>
          <p className="deck-hints">
            Drag the card · <kbd>1</kbd>
            <kbd>2</kbd>
            <kbd>3</kbd> keep into a horizon · <kbd>Space</kbd> more · <kbd>0</kbd> open details
          </p>
        </>
      )}

      <ResearchTray
        inFlight={inFlight}
        pending={pendingCards}
        returned={returnedCards}
        onOpen={onOpenCardDetail}
        onCancelPending={(id) => {
          if (cancelPending(id)) showToast?.('Research cancelled — card is back on top');
        }}
        onPullForward={pullForward}
      />
    </div>
  );
};