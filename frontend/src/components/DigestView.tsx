import React, { useState, useEffect } from 'react';
import { DigestData, Card, PipelineMetrics } from '../types';
import { CardItem } from './CardItem';
import { Calendar, Activity, ThumbsUp, Zap, Clock, Compass } from 'lucide-react';
import { fetchPipelineMetrics } from '../api';

interface DigestViewProps {
  digest: DigestData | null;
  onSelectCard: (card: Card) => void;
  onStatusChange: (id: number, status: string) => void;
  onResearch: (id: number) => void;
  onRetry: (id: number) => void;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

export const DigestView: React.FC<DigestViewProps> = ({
  digest,
  onSelectCard,
  onStatusChange,
  onResearch,
  onRetry,
}) => {
  const [metrics, setMetrics] = useState<PipelineMetrics | null>(null);

  useEffect(() => {
    fetchPipelineMetrics().then(setMetrics).catch(() => {});
  }, []);

  if (!digest || !digest.days || digest.days.length === 0) {
    return (
      <div className="digest-container" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Calendar size={48} color="#64748b" style={{ margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>No captures this week</h2>
        <p style={{ color: '#94a3b8', fontSize: 14 }}>
          Cards captured in the last 7 calendar days will be automatically grouped here.
        </p>
      </div>
    );
  }

  const byStatus = digest.by_status || {};

  return (
    <div className="digest-container">
      <div className="digest-banner">
        <div>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#818cf8', letterSpacing: 0.5 }}>
            Past 7 Days
          </span>
          <div className="digest-stat-total">{digest.week_total}</div>
          <span style={{ fontSize: 13, color: '#94a3b8' }}>Total Sparks Captured</span>
        </div>

        <div className="digest-stats-grid">
          {byStatus.inbox !== undefined && (
            <div className="digest-stat-card">
              <span className="digest-stat-value">{byStatus.inbox}</span>
              <span className="digest-stat-label">Inbox</span>
            </div>
          )}
          {(byStatus['in-progress'] !== undefined || byStatus.doing !== undefined) && (
            <div className="digest-stat-card">
              <span className="digest-stat-value" style={{ color: '#34d399' }}>{byStatus['in-progress'] ?? byStatus.doing}</span>
              <span className="digest-stat-label">In Progress</span>
            </div>
          )}
          {byStatus.done !== undefined && (
            <div className="digest-stat-card">
              <span className="digest-stat-value" style={{ color: '#a5b4fc' }}>{byStatus.done}</span>
              <span className="digest-stat-label">Done</span>
            </div>
          )}
          {byStatus.shelved !== undefined && (
            <div className="digest-stat-card">
              <span className="digest-stat-value">{byStatus.shelved}</span>
              <span className="digest-stat-label">Shelved</span>
            </div>
          )}
          {byStatus.dismissed !== undefined && (
            <div className="digest-stat-card">
              <span className="digest-stat-value" style={{ color: '#f87171' }}>{byStatus.dismissed}</span>
              <span className="digest-stat-label">Dismissed</span>
            </div>
          )}
        </div>
      </div>

      {/* Pipeline Health & Metrics */}
      {metrics && (
        <div
          style={{
            background: 'rgba(30, 41, 59, 0.4)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 10,
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={16} color="#818cf8" />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc' }}>
                Pipeline Health & Metrics
              </span>
            </div>
            <span style={{ fontSize: 11, color: '#64748b' }}>
              Instance Local • No Telemetry
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 12,
            }}
          >
            <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(148, 163, 184, 0.1)' }}>
              <span style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Funnel Conversion</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#38bdf8' }}>
                {metrics.research_conversion_rate ? `${metrics.research_conversion_rate.toFixed(1)}%` : '0%'}
              </span>
              <span style={{ fontSize: 10.5, color: '#64748b', display: 'block' }}>cards researched</span>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(148, 163, 184, 0.1)' }}>
              <span style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Median in Inbox</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={15} />
                {formatDuration(metrics.median_inbox_time_seconds || 0)}
              </span>
              <span style={{ fontSize: 10.5, color: '#64748b', display: 'block' }}>before triage</span>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(148, 163, 184, 0.1)' }}>
              <span style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Report Feedback</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: 4 }}>
                <ThumbsUp size={15} />
                {metrics.feedback?.total > 0 ? `${metrics.feedback.thumbs_up_ratio.toFixed(0)}%` : '—'}
              </span>
              <span style={{ fontSize: 10.5, color: '#64748b', display: 'block' }}>
                {metrics.feedback?.total > 0 ? `${metrics.feedback.total} rating(s)` : 'no ratings yet'}
              </span>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(148, 163, 184, 0.1)' }}>
              <span style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Avg Research Tokens</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Zap size={15} />
                {metrics.avg_tokens ? metrics.avg_tokens.toLocaleString() : '0'}
              </span>
              <span style={{ fontSize: 10.5, color: '#64748b', display: 'block' }}>tokens / run</span>
            </div>
          </div>

          {/* Breakdown: Runs by Playbook & Step Performance */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 2, fontSize: 12 }}>
            {metrics.runs_by_playbook && Object.keys(metrics.runs_by_playbook).length > 0 && (
              <div style={{ flex: 1, minWidth: 200 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Runs by Playbook
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {Object.entries(metrics.runs_by_playbook).map(([name, count]) => (
                    <span
                      key={name}
                      style={{
                        background: 'rgba(51, 65, 85, 0.4)',
                        border: '1px solid rgba(148, 163, 184, 0.15)',
                        padding: '3px 8px',
                        borderRadius: 6,
                        color: '#cbd5e1',
                        fontSize: 11.5,
                      }}
                    >
                      {name}: <strong style={{ color: '#f8fafc' }}>{count}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {metrics.step_metrics && metrics.step_metrics.length > 0 && (
              <div style={{ flex: 1, minWidth: 220 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Step Success Rates
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {metrics.step_metrics.slice(0, 6).map((sm) => (
                    <span
                      key={sm.step}
                      style={{
                        background: 'rgba(51, 65, 85, 0.4)',
                        border: '1px solid rgba(148, 163, 184, 0.15)',
                        padding: '3px 8px',
                        borderRadius: 6,
                        color: '#cbd5e1',
                        fontSize: 11.5,
                      }}
                    >
                      {sm.step}: <strong style={{ color: sm.success_rate >= 90 ? '#34d399' : '#f59e0b' }}>{sm.success_rate.toFixed(0)}%</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        {digest.days.map((day) => (
          <div key={day.date} className="day-section">
            <div className="day-header">
              <Calendar size={16} />
              <span>{day.date}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#94a3b8' }}>
                ({day.cards.length} card{day.cards.length > 1 ? 's' : ''})
              </span>
            </div>

            <div className="kanban-board" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
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
          </div>
        ))}
      </div>
    </div>
  );
};