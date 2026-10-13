import React, { useState } from 'react';
import { ArrowRight, CheckSquare, Sparkles, X } from 'lucide-react';
import { Card } from '../../types';
import { CardItem } from '../CardItem';

interface TriageListProps {
  cards: Card[];
  captureCounts: Record<number, number>;
  onStatusChange: (id: number, status: string) => void;
  onResearch: (id: number) => void;
  onRetry: (id: number) => void;
  onOpen: (card: Card) => void;
  onBulkKeep: (ids: number[]) => void;
  onBulkDismiss: (ids: number[]) => void;
  onBulkResearch: (ids: number[]) => void;
}

/** Dense fallback for power users: one list (no stage columns) with bulk actions. */
export const TriageList: React.FC<TriageListProps> = ({
  cards,
  captureCounts,
  onStatusChange,
  onResearch,
  onRetry,
  onOpen,
  onBulkKeep,
  onBulkDismiss,
  onBulkResearch,
}) => {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = (fn: (ids: number[]) => void) => {
    fn([...selected]);
    setSelected(new Set());
    setSelecting(false);
  };

  return (
    <div className="triage-list">
      <div className="triage-list-toolbar">
        <button
          type="button"
          id="triage-list-select-toggle"
          className={`deck-pill-btn ${selecting ? 'active' : ''}`}
          onClick={() => {
            setSelecting((v) => !v);
            setSelected(new Set());
          }}
        >
          <CheckSquare size={13} /> {selecting ? 'Cancel selection' : 'Select'}
        </button>
        {selecting && (
          <>
            <button
              type="button"
              className="deck-pill-btn"
              onClick={() => setSelected(new Set(cards.map((c) => c.id)))}
            >
              Select all ({cards.length})
            </button>
            <span className="triage-list-sel">{selected.size} selected</span>
            <div className="triage-list-bulk">
              <button type="button" className="deck-pill-btn keep" disabled={!selected.size} onClick={() => run(onBulkKeep)}>
                <ArrowRight size={13} /> Keep (suggested horizon)
              </button>
              <button type="button" className="deck-pill-btn research" disabled={!selected.size} onClick={() => run(onBulkResearch)}>
                <Sparkles size={13} /> Research
              </button>
              <button type="button" className="deck-pill-btn dismiss" disabled={!selected.size} onClick={() => run(onBulkDismiss)}>
                <X size={13} /> Dismiss
              </button>
            </div>
          </>
        )}
      </div>
      {cards.length === 0 ? (
        <div className="triage-list-empty">Nothing left to triage.</div>
      ) : (
        <div className="triage-list-grid">
          {cards.map((c) => (
            <CardItem
              key={c.id}
              card={c}
              siblingCount={c.capture_id ? captureCounts[c.capture_id] : undefined}
              onSelect={onOpen}
              onStatusChange={onStatusChange}
              onResearch={onResearch}
              onRetry={onRetry}
              selectable={selecting}
              selected={selected.has(c.id)}
              onToggleSelect={toggle}
            />
          ))}
        </div>
      )}
    </div>
  );
};
