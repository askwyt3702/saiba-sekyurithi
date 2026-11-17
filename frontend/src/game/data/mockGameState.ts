import type { GameState } from '../model/types';
import { DEFAULT_STAGE_ID, getStageData, INITIAL_ANALYSIS_RESOURCE } from './stageData';
import type { GameMapDefinition } from '../model/mapDefinition';

// ステージの中身は stageData.ts(backend/game_data.py から生成)を使う。
export function createMockGameState(gameId: string, stageId: number = DEFAULT_STAGE_ID, definition?: GameMapDefinition): GameState {
  const stage = definition ?? getStageData(stageId);
  const dynamicMap =
    definition && (definition.id === 4 || definition.enableArgusCounterattack)
      ? {
          seed: definition.seed,
          hardcore: Boolean(definition.hardcore),
          entryNodeIds: [...definition.entryNodeIds],
          targetNodeIds: [...definition.targetNodeIds],
          keyFragmentNodeIds: [...definition.keyFragmentNodeIds],
          nodeEffects: JSON.parse(JSON.stringify(definition.nodeEffects)),
          breachRequirements: JSON.parse(JSON.stringify(definition.breachRequirements)),
          conditionalBreachAlert: definition.conditionalBreachAlert
            ? JSON.parse(JSON.stringify(definition.conditionalBreachAlert))
            : null,
          flaggedTraps: [],
          triggeredTraps: [],
          argusReinforced: [],
          argusDisabled: false,
          enableArgusCounterattack: Boolean(definition.enableArgusCounterattack),
        }
      : undefined;
  return {
    gameId,
    stageId: stage.id,
    evaluation: null,
    securityEvents: {},
    ...(dynamicMap ? { dynamicMap } : {}),
    status: 'playing',
    elapsedSeconds: 0,
    alertLevel: 0,
    analysisResource: definition?.initialState.analysisResource ?? INITIAL_ANALYSIS_RESOURCE,
    privilege: 'GUEST',
    nodes: stage.nodes.map((node) => ({ ...node, position: { ...node.position } })),
    edges: stage.edges.map((edge) => ({ ...edge })),
    log: [
      {
        id: 'init-log',
        timestamp: 0,
        message: stage.startMessage || (stage.id === 1
          ? '唯一の初期侵入口E01をスキャンして侵入してください。操作時だけ時間が進みます。'
          : '訓練は公開サーバーから開始します。ステージ1の初期侵入口はE01のみです。'),
        severity: 'info',
      },
    ],
    ...(definition?.initialState ?? {}),
  };
}
