import React, { useState } from 'react';
import { Card } from '../../types';
import { useLocale } from '../../i18n';
import { cardTypeLabel } from '../../utils/cardEnumLabels';
import { horizonLabel } from '../../utils/triage';
import * as api from '../../api';
import {
  ChevronDown,
  ChevronRight,
  ListTodo,
  Zap,
  CheckCircle2,
} from 'lucide-react';

export interface ExecutionSwimlanesProps {
  cards: Card[];
  density: 'comfortable' | 'compact';
  groupBy: 'horizon' | 'type';
  onSelectCard: (c: Card) => void;
  onUpdateCard: (id: number, patch: Partial<Card>) => void;
  onResearch: (id: number) => void;
  onRetry: (id: number) => void;
  showToast?: (msg: string, onUndo?: () => Promise<void> | void) => void;
  renderCardItem: (card: Card) => React.ReactNode;
  configuredCardTypes?: string[];
}

const STATUS_COLUMNS = ['to-do', 'in-progress', 'done'] as const;

interface SwimlaneRowDef {
  id: string;
  title: string;
  cards: Card[];
}

export const ExecutionSwimlanes: React.FC<ExecutionSwimlanesProps> = ({
  cards,
  groupBy,
  onUpdateCard,
  showToast,
  renderCardItem,
  configuredCardTypes,
}) => {
  const { t, tp } = useLocale();
  const [collapsedRows, setCollapsedRows] = useState<Record<string, boolean>>({});
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);

  const toggleRow = (rowId: string) => {
    setCollapsedRows((prev) => ({
      ...prev,
      [rowId]: !prev[rowId],
    }));
  };

  // Build swimlane row definitions
  let rows: SwimlaneRowDef[] = [];

  if (groupBy === 'horizon') {
    const horizonConfigs = (['short-term', 'medium-term', 'long-term'] as const).map((id) => ({
      id,
      title: horizonLabel(id, t),
    }));

    rows = horizonConfigs.map((cfg) => ({
      id: cfg.id,
      title: cfg.title,
      cards: cards.filter((c) => (c.horizon || 'short-term') === cfg.id),
    }));
  } else {
    // groupBy === 'type'
    const baseTypes =
      configuredCardTypes && configuredCardTypes.length > 0
        ? configuredCardTypes
        : api.DefaultCardTypes;

    const cardTypesOnBoard = cards
      .map((c) => c.type?.trim().toLowerCase())
      .filter((typ): typ is string => Boolean(typ && typ !== 'other'));

    const activeTypes = Array.from(new Set([...baseTypes, ...cardTypesOnBoard])).sort();

    const hasOther = cards.some(
      (c) => !c.type || c.type.trim().toLowerCase() === 'other'
    );
    if (hasOther) {
      activeTypes.push('other');
    }

    rows = activeTypes.map((typ) => ({
      id: typ,
      title: cardTypeLabel(t, typ),
      cards: cards.filter((c) => {
        if (typ === 'other') {
          return !c.type || c.type.trim().toLowerCase() === 'other';
        }
        return c.type?.trim().toLowerCase() === typ;
      }),
    }));
  }

  const handleDragOver = (e: React.DragEvent, rowId: string, status: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const cellKey = `${rowId}:${status}`;
    if (dragOverCell !== cellKey) {
      setDragOverCell(cellKey);
    }
  };

  const handleDragLeave = (e: React.DragEvent, rowId: string, status: string) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    const cellKey = `${rowId}:${status}`;
    if (dragOverCell === cellKey) {
      setDragOverCell(null);
    }
  };

  const handleDrop = (e: React.DragEvent, rowId: string, targetStatus: string) => {
    e.preventDefault();
    setDragOverCell(null);

    const cardIdStr = e.dataTransfer.getData('text/plain');
    const cardId = parseInt(cardIdStr, 10);
    if (isNaN(cardId) || cardId <= 0) return;

    const targetCard = cards.find((c) => c.id === cardId);
    if (!targetCard) return;

    const statusLabel =
      targetStatus === 'to-do'
        ? t('cards.status.toDo')
        : targetStatus === 'in-progress'
        ? t('cards.status.inProgress')
        : t('cards.status.done');

    if (groupBy === 'horizon') {
      const targetHorizon = rowId;
      const currentHorizon = targetCard.horizon || 'short-term';

      if (targetCard.status !== targetStatus || currentHorizon !== targetHorizon) {
        const prevStatus = targetCard.status;
        const prevHorizon = targetCard.horizon;

        onUpdateCard(cardId, {
          status: targetStatus as any,
          horizon: targetHorizon as any,
        });

        const targetHorizonLabel = horizonLabel(targetHorizon, t);

        showToast?.(
          t('cards.board.swimlaneMoved', {
            id: cardId,
            horizon: targetHorizonLabel,
            status: statusLabel,
          }),
          () => {
            onUpdateCard(cardId, {
              status: prevStatus as any,
              horizon: prevHorizon as any,
            });
          }
        );
      }
    } else {
      // groupBy === 'type'
      const targetType = rowId;
      const currentType = targetCard.type?.trim().toLowerCase() || 'other';

      if (targetCard.status !== targetStatus || currentType !== targetType) {
        const prevStatus = targetCard.status;
        const prevType = targetCard.type;

        onUpdateCard(cardId, {
          status: targetStatus as any,
          type: targetType,
        });

        const typeLabel = cardTypeLabel(t, targetType);

        showToast?.(
          t('cards.board.swimlaneMoved', {
            id: cardId,
            horizon: typeLabel,
            status: statusLabel,
          }),
          () => {
            onUpdateCard(cardId, {
              status: prevStatus as any,
              type: prevType,
            });
          }
        );
      }
    }
  };

  return (
    <div className="swimlanes-container" data-group-by={groupBy}>
      {/* 3 Status Columns Header */}
      <div className="swimlane-columns-header">
        <div className="swimlane-col-header">
          <ListTodo size={14} strokeWidth={1.5} color="var(--accent-indigo)" />
          <span>{t('cards.status.toDo')}</span>
        </div>
        <div className="swimlane-col-header">
          <Zap size={14} strokeWidth={1.5} color="var(--accent-emerald)" />
          <span>{t('cards.status.inProgress')}</span>
        </div>
        <div className="swimlane-col-header">
          <CheckCircle2 size={14} strokeWidth={1.5} color="var(--accent-blue)" />
          <span>{t('cards.status.done')}</span>
        </div>
      </div>

      {/* Swimlane Rows */}
      {rows.map((row) => {
        const isCollapsed = Boolean(collapsedRows[row.id]);
        const totalActions = row.cards.reduce(
          (acc, c) => acc + (c.proposed_actions?.length || 0),
          0
        );
        const completedActions = row.cards.reduce(
          (acc, c) => acc + (c.completed_actions?.length || 0),
          0
        );

        return (
          <div
            key={row.id}
            className={`swimlane-row ${isCollapsed ? 'is-collapsed' : ''}`}
            data-swimlane-row={row.id}
          >
            {/* Collapsible Row Header */}
            <div
              className="swimlane-header"
              role="button"
              tabIndex={0}
              aria-expanded={!isCollapsed}
              onClick={() => toggleRow(row.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleRow(row.id);
                }
              }}
            >
              <div className="swimlane-header-left">
                <button
                  type="button"
                  className="swimlane-collapse-btn"
                  aria-label={
                    isCollapsed
                      ? t('cards.board.expandRow')
                      : t('cards.board.collapseRow')
                  }
                  title={
                    isCollapsed
                      ? t('cards.board.expandRow')
                      : t('cards.board.collapseRow')
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleRow(row.id);
                  }}
                >
                  {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                </button>
                <h3 className="swimlane-title">{row.title}</h3>
                <span className="swimlane-count-badge">
                  {tp('cards.count', row.cards.length)}
                </span>
              </div>

              <div className="swimlane-header-right">
                <span className="swimlane-progress-summary">
                  {t('cards.item.actionsCount', {
                    completed: completedActions,
                    total: totalActions,
                  })}
                </span>
              </div>
            </div>

            {/* Swimlane Cells Grid (3 Status Columns) */}
            {!isCollapsed && (
              <div className="swimlane-grid">
                {STATUS_COLUMNS.map((status) => {
                  const cellCards = row.cards.filter((c) => c.status === status);
                  const isOver = dragOverCell === `${row.id}:${status}`;

                  return (
                    <div
                      key={status}
                      className={`swimlane-cell ${isOver ? 'swimlane-drop-over' : ''}`}
                      data-status={status}
                      data-row-id={row.id}
                      data-testid={`swimlane-cell-${row.id}-${status}`}
                      onDragOver={(e) => handleDragOver(e, row.id, status)}
                      onDragLeave={(e) => handleDragLeave(e, row.id, status)}
                      onDrop={(e) => handleDrop(e, row.id, status)}
                    >
                      {cellCards.length === 0 ? (
                        <div className="swimlane-cell-empty">
                          {status === 'to-do'
                            ? t('cards.board.emptyTodo')
                            : status === 'in-progress'
                            ? t('cards.board.emptyInProgress')
                            : t('cards.board.emptyDone')}
                        </div>
                      ) : (
                        cellCards.map(renderCardItem)
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
