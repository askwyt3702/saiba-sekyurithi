import type { GameState } from './types';

// Presentation-only evaluation. The backend's existing S–C evaluation is unchanged.
export const RESULT_RANK_CONFIG = {
  baseScore: 1000,
  timeGraceSeconds: 200,
  timePenaltyPerSecond: 0.5,
  alertPenaltyPerPoint: 8,
  resourceBonusPerPoint: 15,
  thresholds: [
    { rank: 'S', minimum: 900 },
    { rank: 'A', minimum: 750 },
    { rank: 'B', minimum: 550 },
    { rank: 'C', minimum: 350 },
    { rank: 'D', minimum: 0 },
  ],
} as const;

export function calculateMissionResult(state: Pick<GameState,
  'elapsedSeconds' | 'alertLevel' | 'analysisResource' | 'nodes'>) {
  const config = RESULT_RANK_CONFIG;
  const score = Math.max(0, Math.round(
    config.baseScore
    - Math.max(0, state.elapsedSeconds - config.timeGraceSeconds) * config.timePenaltyPerSecond
    - state.alertLevel * config.alertPenaltyPerPoint
    + state.analysisResource * config.resourceBonusPerPoint,
  ));
  const rank = config.thresholds.find((threshold) => score >= threshold.minimum)!.rank;
  return { score, rank, hackedNodes: state.nodes.filter((node) => node.status === 'hacked').length };
}

export function formatMissionTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}分 ${String(total % 60).padStart(2, '0')}秒`;
}
