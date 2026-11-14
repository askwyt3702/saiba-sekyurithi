import type { GameState } from '../model/types';
import { DEFAULT_STAGE_ID, getStageData, INITIAL_ANALYSIS_RESOURCE, MAP_GENERATOR_VERSION, DYNAMIC_NODE_INFO } from './stageData';
import type { GameMapDefinition } from '../model/mapDefinition';

// ステージの中身は stageData.ts(backend/game_data.py から生成)を使う。
export function createMockGameState(gameId: string, stageId: number = DEFAULT_STAGE_ID, definition?: GameMapDefinition): GameState {
  const stage = definition ?? getStageData(stageId);
  return {
    gameId,
    stageId: stage.id,
    evaluation: null,
    securityEvents: {},
    status: 'playing',
    elapsedSeconds: 0,
    alertLevel: 0,
    analysisResource: definition?.initialState.analysisResource ?? INITIAL_ANALYSIS_RESOURCE,
    privilege: 'GUEST',
    nodes: stage.nodes.map((node) => ({ ...node, position: { ...node.position },
      info:definition?.generatorVersion===MAP_GENERATOR_VERSION?(DYNAMIC_NODE_INFO[node.id]??node.info):node.info })),
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
