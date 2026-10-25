import { Card } from '../types';

export interface ActionProgressMetrics {
  completedActionsCount: number;
  totalActionsCount: number;
  progressPercent: number;
}

export interface BoardPulseMetrics {
  actionProgress: ActionProgressMetrics;
  researchReadyCount: number;
  shippedVelocity7d: number;
  idleCount14d: number;
}

export type SignalFilter = 'all' | 'research_ready' | 'pursue' | 'idle';
export type BoardSortOrder = 'updated' | 'worthiness' | 'progress' | 'newest';

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Returns true if the card has completed autonomous research findings.
 */
export function isResearchReady(card: Card): boolean {
  return card.research_state === 'done' || Boolean(card.research_verdict);
}

/**
 * Returns true if a card marked 'done' was completed or updated within the last 7 days.
 */
export function isShippedWithin7Days(card: Card, nowMs: number = Date.now()): boolean {
  if (card.status !== 'done') return false;
  const timeStr = card.updated_at || card.created_at;
  if (!timeStr) return false;
  const time = new Date(timeStr).getTime();
  if (isNaN(time)) return false;
  return nowMs - time <= SEVEN_DAYS_MS;
}

/**
 * Returns true if an active card ('in-progress' or short-term 'to-do') has not been updated in 14+ days.
 */
export function isIdleCard(card: Card, nowMs: number = Date.now()): boolean {
  const isEligibleStatus =
    card.status === 'in-progress' ||
    (card.status === 'to-do' && (card.horizon || 'short-term') === 'short-term');
  if (!isEligibleStatus) return false;

  const timeStr = card.updated_at || card.created_at;
  if (!timeStr) return false;
  const time = new Date(timeStr).getTime();
  if (isNaN(time)) return false;
  return nowMs - time > FOURTEEN_DAYS_MS;
}

/**
 * Computes action step progress across the provided cards.
 */
export function computeActionProgress(cards: Card[]): ActionProgressMetrics {
  let completedActionsCount = 0;
  let totalActionsCount = 0;

  for (const c of cards) {
    const completed = c.completed_actions?.length || 0;
    const total = c.proposed_actions?.length || 0;
    completedActionsCount += completed;
    totalActionsCount += Math.max(total, completed);
  }

  const progressPercent =
    totalActionsCount > 0 ? Math.round((completedActionsCount / totalActionsCount) * 100) : 0;

  return {
    completedActionsCount,
    totalActionsCount,
    progressPercent,
  };
}

/**
 * Counts cards with completed research verdicts or done state.
 */
export function computeResearchReadyCount(cards: Card[]): number {
  return cards.filter(isResearchReady).length;
}

/**
 * Counts cards in 'done' status within the last 7 days.
 */
export function computeShippedVelocity7d(cards: Card[], nowMs: number = Date.now()): number {
  return cards.filter((c) => isShippedWithin7Days(c, nowMs)).length;
}

/**
 * Counts cards in 'in-progress' or short-term 'to-do' older than 14 days.
 */
export function computeIdleCount14d(cards: Card[], nowMs: number = Date.now()): number {
  return cards.filter((c) => isIdleCard(c, nowMs)).length;
}

/**
 * Computes live Execution Pulse metrics for the given cards in scope.
 */
export function computeBoardPulseMetrics(
  cards: Card[],
  nowMs: number = Date.now()
): BoardPulseMetrics {
  // Action progress spans active cards (to-do, in-progress) + recent done cards
  const progressEligibleCards = cards.filter(
    (c) =>
      c.status === 'to-do' ||
      c.status === 'in-progress' ||
      (c.status === 'done' && isShippedWithin7Days(c, nowMs))
  );

  const activeCards = cards.filter(
    (c) => c.status === 'to-do' || c.status === 'in-progress'
  );

  return {
    actionProgress: computeActionProgress(progressEligibleCards),
    researchReadyCount: computeResearchReadyCount(activeCards),
    shippedVelocity7d: computeShippedVelocity7d(cards, nowMs),
    idleCount14d: computeIdleCount14d(cards, nowMs),
  };
}

/**
 * Filter board cards by Card Type and Signal/Verdict.
 */
export function filterBoardCards(
  cards: Card[],
  filters: {
    cardType?: string;
    signal?: SignalFilter;
    nowMs?: number;
  }
): Card[] {
  return cards.filter((card) => {
    if (filters.cardType && filters.cardType !== 'all') {
      if (card.type !== filters.cardType) return false;
    }

    if (filters.signal && filters.signal !== 'all') {
      if (filters.signal === 'research_ready') {
        if (!isResearchReady(card)) return false;
      } else if (filters.signal === 'pursue') {
        if ((card.research_verdict || '').toLowerCase() !== 'pursue') return false;
      } else if (filters.signal === 'idle') {
        if (!isIdleCard(card, filters.nowMs)) return false;
      }
    }

    return true;
  });
}

/**
 * Sort board cards by Updated, Worthiness, Progress, or Newest.
 */
export function sortBoardCards(cards: Card[], sortOrder: BoardSortOrder): Card[] {
  const list = [...cards];

  const getTime = (c: Card) => {
    const d = c.updated_at || c.created_at;
    return d ? new Date(d).getTime() : 0;
  };

  const getCreatedTime = (c: Card) => {
    return c.created_at ? new Date(c.created_at).getTime() : 0;
  };

  const worthWeight = (c: Card) => {
    const lvl = c.worthiness?.level?.toLowerCase();
    if (lvl === 'high') return 3;
    if (lvl === 'medium') return 2;
    if (lvl === 'low') return 1;
    return 0;
  };

  const getProgress = (c: Card) => {
    const total = c.proposed_actions?.length || 0;
    const completed = c.completed_actions?.length || 0;
    if (total === 0) return 0;
    return (completed / total) * 100;
  };

  return list.sort((a, b) => {
    switch (sortOrder) {
      case 'updated':
        return getTime(b) - getTime(a);
      case 'newest':
        return getCreatedTime(b) - getCreatedTime(a);
      case 'worthiness': {
        const diff = worthWeight(b) - worthWeight(a);
        if (diff !== 0) return diff;
        return getTime(b) - getTime(a);
      }
      case 'progress': {
        const diff = getProgress(b) - getProgress(a);
        if (diff !== 0) return diff;
        return getTime(b) - getTime(a);
      }
      default:
        return 0;
    }
  });
}
