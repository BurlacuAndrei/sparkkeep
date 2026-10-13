import React, { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, Clock, Sparkles, Undo2 } from 'lucide-react';
import { Card } from '../../types';
import { fetchCardResearchRuns } from '../../api';

const STEP_IDS = ['planning', 'search', 'reading', 'claims', 'landscape', 'synthesis'];

/** Polls the latest research run for a card and turns its steps into a 0..1 progress value. */
function useResearchProgress(cardId: number) {
  const [state, setState] = useState<{ pct: number; queued: boolean; position?: number }>({ pct: 0, queued: true });
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const runs = await fetchCardResearchRuns(cardId);
        if (!alive || !runs.latest) return;
        const steps = runs.latest.steps || [];
        const done = steps.filter((s) => STEP_IDS.includes(s.id) && (s.status === 'done' || s.status === 'skipped')).length;
        const running = steps.some((s) => s.status === 'running') ? 0.5 : 0;
        setState({
          pct: Math.min(0.97, (done + running) / STEP_IDS.length),
          queued: runs.latest.status === 'queued',
          position: runs.latest.queue_position,
        });
      } catch {
        // transient poll error — keep last state
      }
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [cardId]);
  return state;
}

const Ring: React.FC<{ pct: number; tone: 'violet' | 'green' | 'amber'; spin?: boolean }> = ({ pct, tone, spin }) => {
  const r = 13;
  const c = 2 * Math.PI * r;
  return (
    <svg className={`tray-ring ${tone} ${spin ? 'spin-slow' : ''}`} width="32" height="32" viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r={r} className="tray-ring-track" />
      <circle
        cx="16"
        cy="16"
        r={r}
        className="tray-ring-fill"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform="rotate(-90 16 16)"
      />
    </svg>
  );
};

const InFlightItem: React.FC<{ card: Card; onOpen: () => void }> = ({ card, onOpen }) => {
  const p = useResearchProgress(card.id);
  return (
    <button type="button" className="tray-item" onClick={onOpen} title="Open card">
      <Ring pct={p.queued ? 0.08 : Math.max(0.08, p.pct)} tone="violet" spin={p.queued} />
      <span className="tray-item-text">
        <span className="tray-item-title">{card.title}</span>
        <span className="tray-item-sub">
          {p.queued ? `Queued${p.position ? ` · #${p.position}` : ''}` : `Researching · ${Math.round(p.pct * 100)}%`}
        </span>
      </span>
    </button>
  );
};

interface ResearchTrayProps {
  inFlight: Card[];
  pending: Card[];
  returned: Card[];
  onOpen: (card: Card) => void;
  onCancelPending: (id: number) => void;
  onPullForward: (id: number) => void;
}

export const ResearchTray: React.FC<ResearchTrayProps> = ({
  inFlight,
  pending,
  returned,
  onOpen,
  onCancelPending,
  onPullForward,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const total = inFlight.length + pending.length + returned.length;
  if (total === 0) return null;

  return (
    <aside id="research-tray" className={`research-tray ${collapsed ? 'is-collapsed' : ''}`} aria-label="Research tray">
      <button type="button" className="tray-header" onClick={() => setCollapsed((v) => !v)} aria-expanded={!collapsed}>
        <Sparkles size={13} />
        <span>Research tray</span>
        <span className="tray-count">{total}</span>
        <ChevronDown size={14} className={`tray-chevron ${collapsed ? 'flip' : ''}`} />
      </button>
      {!collapsed && (
        <div className="tray-items">
          {returned.map((c) => (
            <button key={`r-${c.id}`} type="button" className="tray-item ready" onClick={() => onPullForward(c.id)} title="Bring to the front now">
              <CheckCircle2 size={20} className="tray-ready-icon" />
              <span className="tray-item-text">
                <span className="tray-item-title">{c.title}</span>
                <span className="tray-item-sub">
                  {c.research_state === 'failed' ? 'Research failed · up next' : 'Report ready · up next'}
                </span>
              </span>
            </button>
          ))}
          {pending.map((c) => (
            <div key={`p-${c.id}`} className="tray-item pending">
              <Clock size={18} className="tray-pending-icon" />
              <span className="tray-item-text">
                <span className="tray-item-title">{c.title}</span>
                <span className="tray-item-sub">Starting research…</span>
              </span>
              <button type="button" className="tray-undo" onClick={() => onCancelPending(c.id)}>
                <Undo2 size={12} /> Undo
              </button>
            </div>
          ))}
          {inFlight.map((c) => (
            <InFlightItem key={`f-${c.id}`} card={c} onOpen={() => onOpen(c)} />
          ))}
          <p className="tray-footnote">Reports return to the deck as your next card.</p>
        </div>
      )}
    </aside>
  );
};
