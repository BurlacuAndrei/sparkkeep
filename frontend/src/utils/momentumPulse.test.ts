import { describe, it, expect } from 'vitest';
import { computeMomentumPulse } from './momentumPulse';

describe('computeMomentumPulse edge cases', () => {
  it('returns quiet_horizon when 0 cards and 0 activity (empty period)', () => {
    expect(
      computeMomentumPulse({
        totalSparks: 0,
        clearanceRate: 100,
        doneCount: 0,
        completedActionsCount: 0,
        researchHarvestCount: 0,
      })
    ).toBe('quiet_horizon');
  });

  it('returns discovery_capture when 0 actions and clearance rate is low', () => {
    expect(
      computeMomentumPulse({
        totalSparks: 12,
        clearanceRate: 25,
        doneCount: 0,
        completedActionsCount: 0,
        researchHarvestCount: 0,
      })
    ).toBe('discovery_capture');
  });

  it('returns research_deep_dive when all cards are research (harvest >= 2 and harvest > doneCount)', () => {
    expect(
      computeMomentumPulse({
        totalSparks: 5,
        clearanceRate: 40,
        doneCount: 0,
        completedActionsCount: 0,
        researchHarvestCount: 5,
      })
    ).toBe('research_deep_dive');

    // Exactly 2 research cards with 1 done card
    expect(
      computeMomentumPulse({
        totalSparks: 3,
        clearanceRate: 50,
        doneCount: 1,
        completedActionsCount: 0,
        researchHarvestCount: 2,
      })
    ).toBe('research_deep_dive');
  });

  it('returns discovery_capture under high capture load (many cards incoming, low clearance)', () => {
    expect(
      computeMomentumPulse({
        totalSparks: 40,
        clearanceRate: 15,
        doneCount: 1,
        completedActionsCount: 0,
        researchHarvestCount: 0,
      })
    ).toBe('discovery_capture');
  });

  it('prioritizes execution_surge over research_deep_dive when doneCount >= 3', () => {
    expect(
      computeMomentumPulse({
        totalSparks: 10,
        clearanceRate: 80,
        doneCount: 3,
        completedActionsCount: 2,
        researchHarvestCount: 4,
      })
    ).toBe('execution_surge');
  });

  it('prioritizes execution_surge when combined closures reach 5 with high clearance', () => {
    expect(
      computeMomentumPulse({
        totalSparks: 6,
        clearanceRate: 70,
        doneCount: 2,
        completedActionsCount: 3,
        researchHarvestCount: 0,
      })
    ).toBe('execution_surge');
  });

  it('returns balanced_flow when clearance >= 60 and at least 1 action or done card', () => {
    expect(
      computeMomentumPulse({
        totalSparks: 4,
        clearanceRate: 75,
        doneCount: 1,
        completedActionsCount: 0,
        researchHarvestCount: 1,
      })
    ).toBe('balanced_flow');

    expect(
      computeMomentumPulse({
        totalSparks: 5,
        clearanceRate: 60,
        doneCount: 0,
        completedActionsCount: 1,
        researchHarvestCount: 0,
      })
    ).toBe('balanced_flow');
  });

  it('falls back to quiet_horizon when no criteria match', () => {
    expect(
      computeMomentumPulse({
        totalSparks: 0,
        clearanceRate: 50,
        doneCount: 0,
        completedActionsCount: 0,
        researchHarvestCount: 1,
      })
    ).toBe('quiet_horizon');
  });
});
