import React from 'react';
import { BoardPulseMetrics, SignalFilter } from '../../utils/boardUtils';
import { useLocale } from '../../i18n';
import { Sparkles, CheckCircle2, Clock, Archive } from 'lucide-react';

export interface ExecutionPulseProps {
  metrics: BoardPulseMetrics;
  activeSignalFilter: SignalFilter;
  onToggleSignalFilter: (filter: SignalFilter) => void;
  onBatchShelveIdle?: () => void;
  isShelving?: boolean;
}

export const ExecutionPulse: React.FC<ExecutionPulseProps> = ({
  metrics,
  activeSignalFilter,
  onToggleSignalFilter,
  onBatchShelveIdle,
  isShelving = false,
}) => {
  const { t } = useLocale();
  const { actionProgress } = metrics;

  return (
    <div className="execution-pulse-strip" role="region" aria-label={t('cards.board.pulseTitle')}>
      {/* Live Action Progress Bar & Step Text */}
      <div className="pulse-progress-section">
        <div
          className="pulse-progress-track"
          role="progressbar"
          aria-valuenow={actionProgress.progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          title={t('cards.board.actionProgress', {
            completed: actionProgress.completedActionsCount,
            total: actionProgress.totalActionsCount,
            percent: actionProgress.progressPercent,
          })}
        >
          <div
            className="pulse-progress-fill"
            style={{ width: `${actionProgress.progressPercent}%` }}
          />
        </div>
        <span className="pulse-progress-text">
          {t('cards.board.actionProgress', {
            completed: actionProgress.completedActionsCount,
            total: actionProgress.totalActionsCount,
            percent: actionProgress.progressPercent,
          })}
        </span>
      </div>

      {/* Interactive Telemetry Pills */}
      <div className="pulse-telemetry-pills">
        {/* Research Ready Filter Pill */}
        <button
          type="button"
          className={`pulse-pill ${activeSignalFilter === 'research_ready' ? 'active' : ''}`}
          onClick={() =>
            onToggleSignalFilter(
              activeSignalFilter === 'research_ready' ? 'all' : 'research_ready'
            )
          }
          aria-pressed={activeSignalFilter === 'research_ready'}
        >
          <Sparkles size={12} color="#c084fc" />
          <span>{t('cards.board.researchReadyPill', { count: metrics.researchReadyCount })}</span>
        </button>

        {/* 7-Day Shipped Velocity Counter */}
        <span
          className="pulse-pill shipped"
          title={t('cards.board.shippedPill', { count: metrics.shippedVelocity7d })}
        >
          <CheckCircle2 size={12} color="#34d399" />
          <span>{t('cards.board.shippedPill', { count: metrics.shippedVelocity7d })}</span>
        </span>

        {/* Conditional Idle 14d+ Pill + 1-Click Batch Shelve Action */}
        {metrics.idleCount14d > 0 && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <button
              type="button"
              className={`pulse-pill idle ${activeSignalFilter === 'idle' ? 'active' : ''}`}
              onClick={() =>
                onToggleSignalFilter(activeSignalFilter === 'idle' ? 'all' : 'idle')
              }
              aria-pressed={activeSignalFilter === 'idle'}
            >
              <Clock size={12} color="#fbbf24" />
              <span>{t('cards.board.idlePill', { count: metrics.idleCount14d })}</span>
            </button>

            {onBatchShelveIdle && (
              <button
                type="button"
                className="pulse-shelve-btn"
                onClick={onBatchShelveIdle}
                disabled={isShelving}
                title={t('cards.board.batchShelveIdle')}
                aria-label={t('cards.board.batchShelveIdle')}
              >
                <Archive size={11} />
                <span>{t('cards.board.batchShelveIdle')}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
