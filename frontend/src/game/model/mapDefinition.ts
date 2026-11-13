import type { StageDefinition } from '../data/stageData';
import type { ActionCost, GameStatus, NetworkLayer } from './types';
import {
  ACTION_COSTS, ALERT_DECAY_PER_SECOND, ALERT_GAME_OVER_THRESHOLD, EVALUATION_CONFIG,
  INITIAL_ANALYSIS_RESOURCE, INITIAL_PRIVILEGE, LAYER_ORDER, MAX_ANALYSIS_RESOURCE,
  PRIVILEGE_LADDER, RESOURCE_RECOVERY_AMOUNT, RESOURCE_REWARDS, DEFAULT_STAGE_ID,
  SECURITY_RULES,
} from '../data/stageData';

/** 内部の完全定義。未取得の鍵文字や進行状態とは分離し、APIにはまだ追加しない。 */
export interface GameMapDefinition extends StageDefinition {
  securityRules: Record<string, SecurityRule>;
  seed: string | null;
  generatorVersion: string;
  rulesVersion: string;
  importantNodeIds: string[];
  initialState: {
    elapsedSeconds: number; alertLevel: number; analysisResource: number;
    privilege: string; status: GameStatus;
  };
  rules: {
    costs: Record<'scan' | 'remoteScan' | 'breach' | 'dataExtract' | 'recover', ActionCost>;
    alertDecayPerSecond: number;
    alertGameOverThreshold: number;
    maxAnalysisResource: number;
    resourceRecoveryAmount: number;
    privilegeLadder: string[];
    layerOrder: NetworkLayer[];
    resourceRewards: Record<string, number>;
    evaluation: typeof EVALUATION_CONFIG;
  };
}

export interface SecurityRule {
  correct_exploits?: string[];
  info_hint?: string;
  allowed_scan_types?: string[];
  required_scan?: boolean;
  required_info?: boolean;
  required_analysis?: boolean;
  required_privilege?: string;
  failure_mode?: 'consume' | 'reject';
  failure_alert: number;
  success_resource: number;
}

/** 固定定義の互換アダプター。入力との可変オブジェクト共有を避ける。 */
export function mapFromStage(stage: StageDefinition): GameMapDefinition {
  return JSON.parse(JSON.stringify({
    ...stage,
    securityRules: Object.fromEntries(Object.entries(SECURITY_RULES).filter(([id]) => stage.nodes.some((node) => node.id === id))),
    seed: null, generatorVersion: 'fixed-v1', rulesVersion: 'turn-v1', importantNodeIds: [],
    initialState: {
      elapsedSeconds: 0, alertLevel: 0, analysisResource: INITIAL_ANALYSIS_RESOURCE,
      privilege: INITIAL_PRIVILEGE, status: 'playing',
    },
    rules: {
      costs: ACTION_COSTS, alertDecayPerSecond: ALERT_DECAY_PER_SECOND,
      alertGameOverThreshold: ALERT_GAME_OVER_THRESHOLD, maxAnalysisResource: MAX_ANALYSIS_RESOURCE,
      resourceRecoveryAmount: RESOURCE_RECOVERY_AMOUNT,
      privilegeLadder: PRIVILEGE_LADDER, layerOrder: LAYER_ORDER,
      resourceRewards: stage.id === DEFAULT_STAGE_ID ? RESOURCE_REWARDS : {},
      evaluation: EVALUATION_CONFIG,
    },
  })) as GameMapDefinition;
}
