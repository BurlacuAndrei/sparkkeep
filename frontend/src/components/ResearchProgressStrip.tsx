import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, XCircle, Clock, MinusCircle, AlertCircle } from 'lucide-react';
import { ResearchItem, ResearchStep } from '../types';
import { fetchCardResearchRuns } from '../api';

interface ResearchProgressStripProps {
  cardId: number;
  initialResearch?: ResearchItem | null;
  compact?: boolean;
  onComplete?: (research: ResearchItem) => void;
  className?: string;
}

const DEFAULT_STEPS = [
  { id: 'planning', label: 'Planning' },
  { id: 'search', label: 'Search' },
  { id: 'reading', label: 'Reading' },
  { id: 'claims', label: 'Claims' },
  { id: 'landscape', label: 'Landscape' },
  { id: 'synthesis', label: 'Verdict' },
];

export const ResearchProgressStrip: React.FC<ResearchProgressStripProps> = ({
  cardId,
  initialResearch,
  compact = false,
  onComplete,
  className = '',
}) => {
  const [research, setResearch] = useState<ResearchItem | null>(initialResearch || null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Sync initialResearch if prop changes
  useEffect(() => {
    if (initialResearch) {
      setResearch(initialResearch);
    }
  }, [initialResearch]);

  // Elapsed time counter
  useEffect(() => {
    if (!research || (research.status !== 'running' && research.status !== 'queued')) {
      return;
    }

    const startTime = research.created_at ? new Date(research.created_at).getTime() : Date.now();
    const updateElapsed = () => {
      const now = Date.now();
      const sec = Math.max(0, Math.floor((now - startTime) / 1000));
      setElapsedSeconds(sec);
    };

    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [research?.status, research?.created_at]);

  // Poller: 2.5s poll while active, stops when terminal
  useEffect(() => {
    if (!cardId) return;
    if (research && research.status !== 'queued' && research.status !== 'running') {
      return; // Already terminal
    }

    let active = true;
    const poll = async () => {
      try {
        const runs = await fetchCardResearchRuns(cardId);
        if (!active) return;
        if (runs.latest) {
          setResearch(runs.latest);
          if (runs.latest.status === 'done' || runs.latest.status === 'failed') {
            onComplete?.(runs.latest);
          }
        }
      } catch {
        // Ignore network glitch during poll
      }
    };

    const interval = setInterval(() => {
      poll();
    }, 2500);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [cardId, research?.status, onComplete]);

  if (!research) return null;

  const isActive = research.status === 'queued' || research.status === 'running';
  if (!isActive && compact) {
    // In compact mode (e.g. Kanban card), hide strip once terminal or show small indicator if requested
    return null;
  }

  // Map known steps or fallback to DEFAULT_STEPS
  const stepsMap = new Map<string, ResearchStep>();
  (research.steps || []).forEach((s) => stepsMap.set(s.id, s));

  const renderedSteps = DEFAULT_STEPS.map((def) => {
    const existing = stepsMap.get(def.id);
    let status = existing ? existing.status : 'queued';
    if (!isActive && research.status === 'done' && !existing) {
      status = 'done';
    }
    return {
      id: def.id,
      label: def.label,
      status,
      note: existing?.note,
    };
  });

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  if (compact) {
    return (
      <div
        className={`research-progress-compact ${className}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          background: 'rgba(56, 189, 248, 0.08)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: 6,
          fontSize: 11,
          color: '#38bdf8',
          margin: '6px 0',
        }}
      >
        <Loader2 size={12} className="spin-slow" />
        <span style={{ fontWeight: 600 }}>Researching</span>
        <span style={{ color: '#94a3b8' }}>· {formatElapsed(elapsedSeconds)}</span>
        <div style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
          {renderedSteps.map((st) => {
            let dotColor = '#475569';
            if (st.status === 'done') dotColor = '#34d399';
            if (st.status === 'running') dotColor = '#38bdf8';
            if (st.status === 'failed') dotColor = '#f87171';
            return (
              <span
                key={st.id}
                title={`${st.label}: ${st.status}`}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  backgroundColor: dotColor,
                  display: 'inline-block',
                }}
              />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`research-progress-strip ${className}`}
      style={{
        background: 'rgba(15, 23, 42, 0.75)',
        border: '1px solid rgba(56, 189, 248, 0.2)',
        borderRadius: 8,
        padding: '12px 14px',
        margin: '12px 0',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isActive ? (
            <Loader2 size={15} className="spin-slow" color="#38bdf8" />
          ) : research.status === 'done' ? (
            <CheckCircle2 size={15} color="#34d399" />
          ) : (
            <AlertCircle size={15} color="#f87171" />
          )}
          <span style={{ fontWeight: 600, fontSize: 13, color: '#f8fafc' }}>
            {isActive
              ? research.status === 'queued'
                ? 'Research Queued'
                : 'Researching in Progress'
              : research.status === 'done'
              ? 'Research Completed'
              : 'Research Failed'}
          </span>
          {research.query && (
            <span style={{ fontSize: 12, color: '#94a3b8' }}>· {research.query}</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
          ⏱️ {formatElapsed(elapsedSeconds)}
        </div>
      </div>

      {research.error && (
        <div
          style={{
            padding: '6px 10px',
            marginBottom: 8,
            borderRadius: 4,
            background: 'rgba(248, 113, 113, 0.1)',
            border: '1px solid rgba(248, 113, 113, 0.3)',
            color: '#f87171',
            fontSize: 12,
          }}
        >
          {research.error}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))',
          gap: 6,
        }}
      >
        {renderedSteps.map((step) => {
          let icon = <Clock size={12} color="#64748b" />;
          let bg = 'rgba(30, 41, 59, 0.5)';
          let border = 'rgba(51, 65, 85, 0.5)';
          let textColor = '#64748b';

          if (step.status === 'running') {
            icon = <Loader2 size={12} className="spin-slow" color="#38bdf8" />;
            bg = 'rgba(56, 189, 248, 0.12)';
            border = 'rgba(56, 189, 248, 0.4)';
            textColor = '#38bdf8';
          } else if (step.status === 'done') {
            icon = <CheckCircle2 size={12} color="#34d399" />;
            bg = 'rgba(52, 211, 153, 0.08)';
            border = 'rgba(52, 211, 153, 0.3)';
            textColor = '#34d399';
          } else if (step.status === 'failed') {
            icon = <XCircle size={12} color="#f87171" />;
            bg = 'rgba(248, 113, 113, 0.12)';
            border = 'rgba(248, 113, 113, 0.4)';
            textColor = '#f87171';
          } else if (step.status === 'skipped') {
            icon = <MinusCircle size={12} color="#94a3b8" />;
            bg = 'rgba(30, 41, 59, 0.3)';
            textColor = '#64748b';
          }

          return (
            <div
              key={step.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px 4px',
                borderRadius: 6,
                background: bg,
                border: `1px solid ${border}`,
                textAlign: 'center',
                gap: 4,
              }}
              title={step.note ? `${step.label}: ${step.note}` : `${step.label} (${step.status})`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {icon}
                <span style={{ fontSize: 11, fontWeight: 500, color: textColor }}>
                  {step.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
