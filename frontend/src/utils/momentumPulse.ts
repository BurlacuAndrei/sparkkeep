export type MomentumPulseState =
  | 'execution_surge'
  | 'research_deep_dive'
  | 'balanced_flow'
  | 'discovery_capture'
  | 'quiet_horizon';

export interface MomentumPulseMetrics {
  totalSparks: number;
  clearanceRate: number;
  doneCount: number;
  completedActionsCount: number;
  researchHarvestCount: number;
}

export function computeMomentumPulse(metrics: MomentumPulseMetrics): MomentumPulseState {
  const { totalSparks, clearanceRate, doneCount, completedActionsCount, researchHarvestCount } = metrics;

  if (doneCount >= 3 || (doneCount + completedActionsCount >= 5 && clearanceRate >= 70)) {
    return 'execution_surge';
  }
  if (researchHarvestCount >= 2 && researchHarvestCount > doneCount) {
    return 'research_deep_dive';
  }
  if (clearanceRate >= 60 && (doneCount >= 1 || completedActionsCount >= 1)) {
    return 'balanced_flow';
  }
  if (totalSparks > 0 && clearanceRate < 60) {
    return 'discovery_capture';
  }
  if (totalSparks === 0 && doneCount === 0 && researchHarvestCount === 0) {
    return 'quiet_horizon';
  }
  return 'quiet_horizon';
}
