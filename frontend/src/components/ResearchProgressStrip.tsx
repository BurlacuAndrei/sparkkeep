import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, XCircle, Clock, MinusCircle, AlertCircle } from 'lucide-react';
import { ResearchItem, ResearchStep } from '../types';
import { fetchCardResearchRuns } from '../api';
import { useLocale } from '../i18n';
import { enumLabel } from '../utils/cardEnumLabels';

interface ResearchProgressStripProps {
  cardId: number;
  initialResearch?: ResearchItem | null;
  compact?: boolean;
  onComplete?: (research: ResearchItem) => void;
  className?: string;
}

const DEFAULT_STEPS = [
  { id: 'planning', labelKey: 'research.progress.steps.planning' },
  { id: 'search', labelKey: 'research.progress.steps.search' },
  { id: 'reading', labelKey: 'research.progress.steps.reading' },
  { id: 'claims', labelKey: 'research.progress.steps.claims' },
  { id: 'landscape', labelKey: 'research.progress.steps.landscape' },
  { id: 'synthesis', labelKey: 'research.progress.steps.verdict' },
] as const;

export const ResearchProgressStrip: React.FC<ResearchProgressStripProps> = ({
  cardId,
  initialResearch,
  compact = false,
  onComplete,
  className = '',
}) => {
  const { t } = useLocale();
  const [polledResearch, setPolledResearch] = useState<ResearchItem | null>(null);
  const [prevInitialResearch, setPrevInitialResearch] = useState(initialResearch);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  if (initialResearch !== prevInitialResearch) {
    setPrevInitialResearch(initialResearch);
    setPolledResearch(null);
  }

  const research = polledResearch ?? initialResearch ?? null;
  const researchStatus = research?.status;
  const researchCreatedAt = research?.created_at;

  // Elapsed time counter
  useEffect(() => {
    if (!researchStatus || (researchStatus !== 'running' && researchStatus !== 'queued')) {
      return;
    }

    const startTime = researchCreatedAt ? new Date(researchCreatedAt).getTime() : Date.now();
    const updateElapsed = () => {
      const now = Date.now();
      const sec = Math.max(0, Math.floor((now - startTime) / 1000));
      setElapsedSeconds(sec);
    };

    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [researchStatus, researchCreatedAt]);

  // Poller: 2.5s poll while active, stops when terminal
  useEffect(() => {
    if (!cardId) return;
    if (researchStatus && researchStatus !== 'queued' && researchStatus !== 'running') {
      return; // Already terminal
    }

    let active = true;
    const poll = async () => {
      try {
        const runs = await fetchCardResearchRuns(cardId);
        if (!active) return;
        if (runs.latest) {
          setPolledResearch(runs.latest);
          if (runs.latest.status === 'done' || runs.latest.status === 'failed') {
            onComplete?.(runs.latest);
          }
        }
      } catch {
        // Ignore network glitch during poll
      }
    };

    poll();
    const interval = setInterval(() => {
      poll();
    }, 2500);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [cardId, researchStatus, onComplete]);

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
      label: t(def.labelKey),
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
          color: 'var(--accent-blue)',
          margin: '6px 0',
        }}
      >
        {research.status === 'queued' ? (
          <>
            <Clock size={12} color="var(--accent-indigo)" />
            <span style={{ fontWeight: 600, color: 'var(--accent-indigo)' }}>
              {research.queue_position
                ? t('research.progress.queuedPosition', { position: research.queue_position })
                : t('research.progress.queued')}
            </span>
          </>
        ) : (
          <>
            <Loader2 size={12} className="spin-slow" />
            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
              {t('research.progress.researching')}
            </span>
            <span style={{ color: 'var(--text-dim)' }}>· {formatElapsed(elapsedSeconds)}</span>
          </>
        )}
        <div style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
          {renderedSteps.map((st) => {
            let dotColor = 'var(--border-subtle)';
            if (st.status === 'done') dotColor = 'var(--color-success-text, #10b981)';
            if (st.status === 'running') dotColor = 'var(--accent-blue, #0284c7)';
            if (st.status === 'failed') dotColor = 'var(--color-error-text, #ef4444)';
            return (
              <span
                key={st.id}
                title={t('research.progress.stepTitle', {
                  label: st.label,
                  status: enumLabel(t, 'stepStatus', st.status),
                })}
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
        background: 'var(--surface-sunken)',
        border: '1px solid var(--border-subtle)',
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
            <Loader2 size={15} className="spin-slow" color="var(--accent-blue)" />
          ) : research.status === 'done' ? (
            <CheckCircle2 size={15} color="var(--color-success-text, #10b981)" />
          ) : (
            <AlertCircle size={15} color="var(--color-error-text, #ef4444)" />
          )}
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-main)' }}>
            {isActive
              ? research.status === 'queued'
                ? t('research.progress.queuedLong', { position: research.queue_position || 1 })
                : t('research.progress.inProgress')
              : research.status === 'done'
              ? t('research.progress.completed')
              : t('research.progress.failed')}
          </span>
          {research.query && (
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>· {research.query}</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', fontVariantNumeric: 'tabular-nums' }}>
          ⏱️ {formatElapsed(elapsedSeconds)}
        </div>
      </div>

      {research.error && (
        <div
          style={{
            padding: '6px 10px',
            marginBottom: 8,
            borderRadius: 4,
            background: 'var(--color-error-bg)',
            border: '1px solid var(--color-error-border)',
            color: 'var(--color-error-text)',
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
          let icon = <Clock size={12} color="var(--text-dim)" />;
          let bg = 'var(--bg-input, var(--surface-sunken))';
          let border = 'var(--border-subtle)';
          let textColor = 'var(--text-dim)';

          if (step.status === 'running') {
            icon = <Loader2 size={12} className="spin-slow" color="var(--accent-blue)" />;
            bg = 'var(--color-info-bg, rgba(56, 189, 248, 0.12))';
            border = 'var(--color-info-border, rgba(56, 189, 248, 0.4))';
            textColor = 'var(--accent-blue, #0284c7)';
          } else if (step.status === 'done') {
            icon = <CheckCircle2 size={12} color="var(--color-success-text, #10b981)" />;
            bg = 'var(--color-success-bg, rgba(52, 211, 153, 0.08))';
            border = 'var(--color-success-border, rgba(52, 211, 153, 0.3))';
            textColor = 'var(--color-success-text, #15803d)';
          } else if (step.status === 'failed') {
            icon = <XCircle size={12} color="var(--color-error-text, #ef4444)" />;
            bg = 'var(--color-error-bg, rgba(248, 113, 113, 0.12))';
            border = 'var(--color-error-border, rgba(248, 113, 113, 0.4))';
            textColor = 'var(--color-error-text, #b91c1c)';
          } else if (step.status === 'skipped') {
            icon = <MinusCircle size={12} color="var(--text-faint)" />;
            bg = 'var(--surface-sunken)';
            textColor = 'var(--text-dim)';
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
              title={
                step.note
                  ? t('research.progress.stepNoteTitle', { label: step.label, note: step.note })
                  : t('research.progress.stepStatusTitle', {
                      label: step.label,
                      status: enumLabel(t, 'stepStatus', step.status),
                    })
              }
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {icon}
                <span style={{ fontSize: 11, fontWeight: 600, color: textColor }}>
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
