import React from 'react';
import { Card } from '../types';
import { CardItem } from './CardItem';
import { Inbox, Zap, Compass, Archive, CheckCircle2 } from 'lucide-react';

interface KanbanBoardProps {
  cards: Card[];
  onSelectCard: (card: Card) => void;
  onStatusChange: (id: number, status: string) => void;
  onResearch: (id: number) => void;
  onRetry: (id: number) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  cards,
  onSelectCard,
  onStatusChange,
  onResearch,
  onRetry,
}) => {
  const inboxCards = cards.filter((c) => c.status === 'inbox');
  const actionQueueCards = cards.filter((c) => c.status === 'doing' || (c.horizon === 'short-term' && c.status === 'inbox'));
  const bucketListCards = cards.filter((c) => c.horizon === 'lifetime' && c.status !== 'done' && c.status !== 'dismissed');
  const shelvedCards = cards.filter((c) => c.status === 'shelved');
  const doneCards = cards.filter((c) => c.status === 'done');

  return (
    <div>
      <h2 id="main-heading" style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Action Engine Boards</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>({cards.length} cards total)</span>
      </h2>

      {/* Legacy/Main container id for compatibility */}
      <div id="main-grid" style={{ display: 'none' }}></div>

      <div className="kanban-board">
        {/* Inbox Column */}
        <div className="kanban-column">
          <div className="column-header">
            <div className="column-title">
              <Inbox size={16} color="#38bdf8" />
              <span>Inbox (Unsorted)</span>
            </div>
            <span className="column-count">{inboxCards.length}</span>
          </div>
          <div className="cards-container">
            {inboxCards.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                Inbox zero! Great job.
              </div>
            ) : (
              inboxCards.map((c) => (
                <CardItem
                  key={c.id}
                  card={c}
                  onSelect={onSelectCard}
                  onStatusChange={onStatusChange}
                  onResearch={onResearch}
                  onRetry={onRetry}
                />
              ))
            )}
          </div>
        </div>

        {/* Action Queue Column */}
        <div className="kanban-column">
          <div className="column-header">
            <div className="column-title">
              <Zap size={16} color="#34d399" />
              <span>Action Queue (Doing)</span>
            </div>
            <span className="column-count">{actionQueueCards.length}</span>
          </div>
          <div id="action-board" className="cards-container">
            {actionQueueCards.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                No active actions queued.
              </div>
            ) : (
              actionQueueCards.map((c) => (
                <CardItem
                  key={c.id}
                  card={c}
                  onSelect={onSelectCard}
                  onStatusChange={onStatusChange}
                  onResearch={onResearch}
                  onRetry={onRetry}
                />
              ))
            )}
          </div>
        </div>

        {/* Bucket List Column */}
        <div className="kanban-column">
          <div className="column-header">
            <div className="column-title">
              <Compass size={16} color="#fbbf24" />
              <span>Bucket List (Lifetime)</span>
            </div>
            <span className="column-count">{bucketListCards.length}</span>
          </div>
          <div id="bucket-board" className="cards-container">
            {bucketListCards.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                No lifetime aspirations saved.
              </div>
            ) : (
              bucketListCards.map((c) => (
                <CardItem
                  key={c.id}
                  card={c}
                  onSelect={onSelectCard}
                  onStatusChange={onStatusChange}
                  onResearch={onResearch}
                  onRetry={onRetry}
                />
              ))
            )}
          </div>
        </div>

        {/* Shelved Column */}
        <div className="kanban-column">
          <div className="column-header">
            <div className="column-title">
              <Archive size={16} color="#94a3b8" />
              <span>Shelved</span>
            </div>
            <span className="column-count">{shelvedCards.length}</span>
          </div>
          <div className="cards-container">
            {shelvedCards.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                No shelved items.
              </div>
            ) : (
              shelvedCards.map((c) => (
                <CardItem
                  key={c.id}
                  card={c}
                  onSelect={onSelectCard}
                  onStatusChange={onStatusChange}
                  onResearch={onResearch}
                  onRetry={onRetry}
                />
              ))
            )}
          </div>
        </div>

        {/* Done Column */}
        <div className="kanban-column">
          <div className="column-header">
            <div className="column-title">
              <CheckCircle2 size={16} color="#a5b4fc" />
              <span>Completed</span>
            </div>
            <span className="column-count">{doneCards.length}</span>
          </div>
          <div className="cards-container">
            {doneCards.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                Nothing completed yet.
              </div>
            ) : (
              doneCards.map((c) => (
                <CardItem
                  key={c.id}
                  card={c}
                  onSelect={onSelectCard}
                  onStatusChange={onStatusChange}
                  onResearch={onResearch}
                  onRetry={onRetry}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
