import type { GameState } from './types';
import { EVALUATION_CONFIG } from '../data/stageData';

// backend/balance_config.pyから生成。API・ログ・Mock・表示で同じ式を使う。
export const RESULT_RANK_CONFIG = EVALUATION_CONFIG;

export function calculateMissionResult(state: Pick<GameState,
  'elapsedSeconds' | 'alertLevel' | 'analysisResource' | 'nodes'>) {
  const config = RESULT_RANK_CONFIG;
  const score = Math.max(0, Math.round(
    config.baseScore
    - Math.max(0, state.elapsedSeconds - config.timeGraceSeconds) * config.timePenaltyPerSecond
    - (Math.round(state.alertLevel * 100) / 100) * config.alertPenaltyPerPoint
    + Math.min(config.resourceBonusCap, Math.max(0, state.analysisResource)) * config.resourceBonusPerPoint,
  ));
  const threshold = config.thresholds.find((threshold) => score >= threshold.minimum)!;
  return { score, rank: threshold.rank, title: threshold.title,
    hackedNodes: state.nodes.filter((node) => node.status === 'hacked').length };
}

export function formatMissionTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}分 ${String(total % 60).padStart(2, '0')}秒`;
}
