import React from 'react';
import { DigestData, Card } from '../types';
import { CardItem } from './CardItem';
import { Calendar } from 'lucide-react';

interface DigestViewProps {
  digest: DigestData | null;
  onSelectCard: (card: Card) => void;
  onStatusChange: (id: number, status: string) => void;
  onResearch: (id: number) => void;
  onRetry: (id: number) => void;
}

export const DigestView: React.FC<DigestViewProps> = ({
  digest,
  onSelectCard,
  onStatusChange,
  onResearch,
  onRetry,
}) => {
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
          {byStatus.doing !== undefined && (
            <div className="digest-stat-card">
              <span className="digest-stat-value" style={{ color: '#34d399' }}>{byStatus.doing}</span>
              <span className="digest-stat-label">Doing</span>
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
        </div>
      </div>

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