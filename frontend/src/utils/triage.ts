import { Card } from '../types';

export type Horizon = 'short-term' | 'medium-term' | 'long-term';

export const HORIZONS: { id: Horizon; label: string; hint: string; key: string }[] = [
  { id: 'short-term', label: 'Short-term', hint: 'Act this week', key: '1' },
  { id: 'medium-term', label: 'Medium-term', hint: 'Next few weeks', key: '2' },
  { id: 'long-term', label: 'Long-term', hint: 'Someday / explore', key: '3' },
];

/** A card belongs to triage while no keep/dismiss decision has been made. */
export const isTriageCard = (c: Card): boolean =>
  !c.status || c.status === 'inbox' || c.status === 'review' || c.status === 'researching';

/** Research is a property of the card, not a place: queued/running cards sit in the tray. */
export const isResearchInFlight = (c: Card): boolean =>
  c.status === 'researching' || c.research_state === 'queued' || c.research_state === 'running';

/** A finished report is waiting on the user's decision. */
export const isResearchReady = (c: Card): boolean =>
  !isResearchInFlight(c) && (c.status === 'review' || c.research_state === 'done');

export const isResearchFailed = (c: Card): boolean =>
  !isResearchInFlight(c) && c.research_state === 'failed';

export const isAnalysisFailed = (c: Card): boolean =>
  Boolean(c.analysis_failed || c.title === 'Analysis failed');

export const suggestedHorizonOf = (c: Card): Horizon => {
  const h = c.suggested_horizon || c.horizon;
  return h === 'medium-term' || h === 'long-term' ? h : 'short-term';
};

export const horizonLabel = (h: string): string =>
  HORIZONS.find((x) => x.id === h)?.label ?? 'Short-term';

const WORTH_SCORE: Record<string, number> = { high: 3, medium: 2, low: 1 };
const worth = (c: Card) => WORTH_SCORE[(c.worthiness?.level || '').toLowerCase()] ?? 1.5;
const ts = (s?: string) => {
  const t = s ? new Date(s).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
};

/**
 * Deck ordering:
 *  1. Cards with a finished (or failed) report — the most decision-ready, oldest report first.
 *  2. Everything else, keeping capture siblings together, groups ranked by best worthiness
 *     and then recency (fresh captures are easiest to judge while context is warm).
 */
export function rankDeck(cards: Card[]): Card[] {
  const ready = cards
    .filter((c) => isResearchReady(c) || isResearchFailed(c))
    .sort((a, b) => ts(a.updated_at) - ts(b.updated_at));
  const readyIds = new Set(ready.map((c) => c.id));

  const groups = new Map<string, Card[]>();
  cards
    .filter((c) => !readyIds.has(c.id))
    .forEach((c) => {
      const key = c.capture_id ? `cap-${c.capture_id}` : `card-${c.id}`;
      const arr = groups.get(key) || [];
      arr.push(c);
      groups.set(key, arr);
    });

  const rest = [...groups.values()]
    .map((g) => ({
      cards: g.sort((a, b) => a.id - b.id),
      worth: Math.max(...g.map(worth)),
      newest: Math.max(...g.map((c) => ts(c.created_at))),
    }))
    .sort((a, b) => b.worth - a.worth || b.newest - a.newest)
    .flatMap((g) => g.cards);

  return [...ready, ...rest];
}
