import { describe, it, expect } from 'vitest';
import {
  isResearchReady,
  isShippedWithin7Days,
  isIdleCard,
  computeActionProgress,
  computeResearchReadyCount,
  computeShippedVelocity7d,
  computeIdleCount14d,
  computeBoardPulseMetrics,
  filterBoardCards,
  sortBoardCards,
} from './boardUtils';
import { Card } from '../types';

describe('boardUtils', () => {
  const now = new Date('2026-10-25T12:00:00Z').getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  const baseCard: Card = {
    id: 1,
    title: 'Base Card',
    summary: 'Summary',
    horizon: 'short-term',
    status: 'to-do',
    source_url: 'https://example.com',
    source_note: '',
    tags: [],
    created_at: new Date(now - 2 * dayMs).toISOString(),
    updated_at: new Date(now - 2 * dayMs).toISOString(),
  };

  describe('isResearchReady', () => {
    it('detects research_state done or verdict presence', () => {
      expect(isResearchReady(baseCard)).toBe(false);
      expect(isResearchReady({ ...baseCard, research_state: 'done' })).toBe(true);
      expect(isResearchReady({ ...baseCard, research_verdict: 'pursue' })).toBe(true);
      expect(isResearchReady({ ...baseCard, research_verdict: 'watch' })).toBe(true);
    });
  });

  describe('isShippedWithin7Days', () => {
    it('only returns true for done cards within 7 days', () => {
      expect(isShippedWithin7Days(baseCard, now)).toBe(false); // status is to-do
      expect(isShippedWithin7Days({ ...baseCard, status: 'done' }, now)).toBe(true); // 2 days ago
      expect(
        isShippedWithin7Days(
          { ...baseCard, status: 'done', updated_at: new Date(now - 8 * dayMs).toISOString() },
          now
        )
      ).toBe(false); // 8 days ago
    });
  });

  describe('isIdleCard', () => {
    it('returns true for in-progress or short-term to-do untouched for >14 days', () => {
      const oldTime = new Date(now - 15 * dayMs).toISOString();
      const freshTime = new Date(now - 5 * dayMs).toISOString();

      // In-progress card older than 14d
      expect(isIdleCard({ ...baseCard, status: 'in-progress', updated_at: oldTime }, now)).toBe(true);
      // In-progress card fresh
      expect(isIdleCard({ ...baseCard, status: 'in-progress', updated_at: freshTime }, now)).toBe(false);

      // Short-term to-do older than 14d
      expect(isIdleCard({ ...baseCard, status: 'to-do', horizon: 'short-term', updated_at: oldTime }, now)).toBe(true);
      // Medium-term to-do older than 14d (not considered active short-term work)
      expect(isIdleCard({ ...baseCard, status: 'to-do', horizon: 'medium-term', updated_at: oldTime }, now)).toBe(false);
      // Done card older than 14d
      expect(isIdleCard({ ...baseCard, status: 'done', updated_at: oldTime }, now)).toBe(false);
    });
  });

  describe('count helper functions', () => {
    it('computes individual metric counts', () => {
      const oldTime = new Date(now - 15 * dayMs).toISOString();
      const freshTime = new Date(now - 2 * dayMs).toISOString();

      const sampleCards: Card[] = [
        { ...baseCard, id: 1, research_state: 'done' },
        { ...baseCard, id: 2, research_verdict: 'pursue' },
        { ...baseCard, id: 3, status: 'done', updated_at: freshTime },
        { ...baseCard, id: 4, status: 'in-progress', updated_at: oldTime },
      ];

      expect(computeResearchReadyCount(sampleCards)).toBe(2);
      expect(computeShippedVelocity7d(sampleCards, now)).toBe(1);
      expect(computeIdleCount14d(sampleCards, now)).toBe(1);
    });
  });

  describe('computeActionProgress', () => {
    it('accurately tallies actions and calculates progress percentage', () => {
      const cards: Card[] = [
        {
          ...baseCard,
          id: 1,
          proposed_actions: ['Step 1', 'Step 2'],
          completed_actions: ['Step 1'],
        },
        {
          ...baseCard,
          id: 2,
          proposed_actions: ['Step A', 'Step B', 'Step C'],
          completed_actions: ['Step A', 'Step B', 'Step C'],
        },
      ];

      const metrics = computeActionProgress(cards);
      expect(metrics.completedActionsCount).toBe(4);
      expect(metrics.totalActionsCount).toBe(5);
      expect(metrics.progressPercent).toBe(80);
    });

    it('handles empty actions gracefully', () => {
      const metrics = computeActionProgress([baseCard]);
      expect(metrics.completedActionsCount).toBe(0);
      expect(metrics.totalActionsCount).toBe(0);
      expect(metrics.progressPercent).toBe(0);
    });
  });

  describe('computeBoardPulseMetrics', () => {
    it('aggregates pulse telemetry across cards', () => {
      const cards: Card[] = [
        {
          ...baseCard,
          id: 1,
          status: 'to-do',
          horizon: 'short-term',
          proposed_actions: ['Step 1', 'Step 2'],
          completed_actions: ['Step 1'],
          research_state: 'done',
        },
        {
          ...baseCard,
          id: 2,
          status: 'in-progress',
          proposed_actions: ['Act 1'],
          completed_actions: ['Act 1'],
          updated_at: new Date(now - 16 * dayMs).toISOString(),
        },
        {
          ...baseCard,
          id: 3,
          status: 'done',
          updated_at: new Date(now - 3 * dayMs).toISOString(),
        },
        {
          ...baseCard,
          id: 4,
          status: 'done',
          updated_at: new Date(now - 20 * dayMs).toISOString(),
        },
      ];

      const metrics = computeBoardPulseMetrics(cards, now);
      expect(metrics.actionProgress.completedActionsCount).toBe(2);
      expect(metrics.actionProgress.totalActionsCount).toBe(3);
      expect(metrics.researchReadyCount).toBe(1);
      expect(metrics.shippedVelocity7d).toBe(1); // Card 3 only (Card 4 is 20d old)
      expect(metrics.idleCount14d).toBe(1); // Card 2 only (16d old in-progress)
    });
  });

  describe('filterBoardCards', () => {
    const cards: Card[] = [
      { ...baseCard, id: 1, type: 'tool', research_verdict: 'pursue' },
      { ...baseCard, id: 2, type: 'repo', research_state: 'done' },
      {
        ...baseCard,
        id: 3,
        type: 'article',
        status: 'in-progress',
        updated_at: new Date(now - 20 * dayMs).toISOString(),
      },
    ];

    it('filters by Card Type', () => {
      const filtered = filterBoardCards(cards, { cardType: 'tool' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(1);
    });

    it('filters by Signal: research_ready', () => {
      const filtered = filterBoardCards(cards, { signal: 'research_ready' });
      expect(filtered).toHaveLength(2); // id 1 (verdict) and id 2 (done)
    });

    it('filters by Signal: pursue', () => {
      const filtered = filterBoardCards(cards, { signal: 'pursue' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(1);
    });

    it('filters by Signal: idle', () => {
      const filtered = filterBoardCards(cards, { signal: 'idle', nowMs: now });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(3);
    });
  });

  describe('sortBoardCards', () => {
    it('sorts by worthiness, progress, updated, and newest', () => {
      const cards: Card[] = [
        {
          ...baseCard,
          id: 1,
          worthiness: { level: 'low' },
          proposed_actions: ['a', 'b'],
          completed_actions: ['a'], // 50%
          created_at: new Date(now - 10 * dayMs).toISOString(),
          updated_at: new Date(now - 1 * dayMs).toISOString(),
        },
        {
          ...baseCard,
          id: 2,
          worthiness: { level: 'high' },
          proposed_actions: ['a'],
          completed_actions: ['a'], // 100%
          created_at: new Date(now - 2 * dayMs).toISOString(),
          updated_at: new Date(now - 5 * dayMs).toISOString(),
        },
        {
          ...baseCard,
          id: 3,
          worthiness: { level: 'medium' },
          proposed_actions: ['a'],
          completed_actions: [], // 0%
          created_at: new Date(now - 1 * dayMs).toISOString(),
          updated_at: new Date(now - 2 * dayMs).toISOString(),
        },
      ];

      // Worthiness sort: high (2), medium (3), low (1)
      const byWorth = sortBoardCards(cards, 'worthiness');
      expect(byWorth.map((c) => c.id)).toEqual([2, 3, 1]);

      // Progress sort: 100% (2), 50% (1), 0% (3)
      const byProgress = sortBoardCards(cards, 'progress');
      expect(byProgress.map((c) => c.id)).toEqual([2, 1, 3]);

      // Updated sort: 1d ago (1), 2d ago (3), 5d ago (2)
      const byUpdated = sortBoardCards(cards, 'updated');
      expect(byUpdated.map((c) => c.id)).toEqual([1, 3, 2]);

      // Newest sort: 1d ago (3), 2d ago (2), 10d ago (1)
      const byNewest = sortBoardCards(cards, 'newest');
      expect(byNewest.map((c) => c.id)).toEqual([3, 2, 1]);
    });
  });
});
