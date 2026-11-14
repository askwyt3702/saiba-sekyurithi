import type { StageDefinition } from '../data/stageData';
import type { ActionCost, GameStatus, NetworkLayer, GameState } from './types';
import {
  ACTION_COSTS, ALERT_DECAY_PER_SECOND, ALERT_GAME_OVER_THRESHOLD, EVALUATION_CONFIG,
  INITIAL_ANALYSIS_RESOURCE, INITIAL_PRIVILEGE, LAYER_ORDER, MAX_ANALYSIS_RESOURCE,
  PRIVILEGE_LADDER, RESOURCE_RECOVERY_AMOUNT, RESOURCE_REWARDS, DEFAULT_STAGE_ID,
  SECURITY_RULES,
  getStageData,
} from '../data/stageData';

export interface MapSnapshot {
  schemaVersion: 1;
  source: 'fixed' | 'legacy-fixed';
  /** Public view: geometry/rules are saved, hidden node details/answers are omitted. */
  definition: GameMapDefinition;
}

export function assertSavedMap(map: GameMapDefinition, requireSupportedVersion = true): void {
  if (!map || (requireSupportedVersion && (map.generatorVersion !== 'fixed-v1' || map.rulesVersion !== 'turn-v1')) ||
      !Array.isArray(map.nodes) || !Array.isArray(map.edges) || !map.rules?.costs || !map.initialState || !map.securityRules) {
    throw new Error('Invalid or unsupported saved map');
  }
  const ids = new Set(map.nodes.map(n => n.id));
  if (!ids.size || ids.size !== map.nodes.length || map.nodes.some(n =>
    !map.rules.layerOrder.includes(n.layer) || !Number.isFinite(n.position?.x) || !Number.isFinite(n.position?.y)) ||
    map.edges.some(e => !ids.has(e.source) || !ids.has(e.target)) ||
    [map.entryNodeIds, map.targetNodeIds, map.keyFragmentNodeIds].some(list => !Array.isArray(list) || list.some(id => !ids.has(id)))) {
    throw new Error('Invalid saved map graph');
  }
}

export function mapForState(state: GameState): GameMapDefinition {
  return state.mapSnapshot?.definition ?? mapFromStage(getStageData(state.stageId ?? DEFAULT_STAGE_ID));
}

export function publicSnapshot(map: GameMapDefinition, state: GameState): MapSnapshot {
  const definition: GameMapDefinition = JSON.parse(JSON.stringify(map));
  definition.nodes = state.nodes.map(n => ({ ...n, position: { ...n.position }, status: 'unscanned',
    info: n.status === 'unscanned' ? '不明（スキャンが必要です）' : n.info }));
  definition.vulnerabilities = Object.fromEntries(state.nodes.filter(n => n.vulnerability).map(n => [n.id, n.vulnerability!]));
  definition.securityRules = Object.fromEntries(Object.entries(map.securityRules).map(([id, rule]) =>
    [id, Object.fromEntries(Object.entries(rule).filter(([key]) => !['question_answers', 'vulnerability'].includes(key) &&
      (key !== 'info_hint' || state.nodes.some(n => n.id === id && n.status !== 'unscanned')))) as unknown as SecurityRule]));
  return { schemaVersion: 1, source: 'fixed', definition };
}

/** ゲーム単位の完全定義。APIには未公開情報を除いたMapSnapshotを返す。 */
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
  risk_level?: string;
  question_answers?: Record<string, string[]>;
  required_question?: boolean;
  exploit_failure_alert?: number;
  failure_resource?: number;
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
