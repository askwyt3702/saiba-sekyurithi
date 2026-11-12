import type { GameState } from '../model/types';
import { DEFAULT_STAGE_ID, getStageData, INITIAL_ANALYSIS_RESOURCE } from './stageData';

// ステージの中身は stageData.ts(backend/game_data.py から生成)を使う。
export function createMockGameState(gameId: string, stageId: number = DEFAULT_STAGE_ID): GameState {
  const stage = getStageData(stageId);
  return {
    gameId,
    stageId: stage.id,
    status: 'playing',
    elapsedSeconds: 0,
    alertLevel: 0,
    analysisResource: INITIAL_ANALYSIS_RESOURCE,
    privilege: 'GUEST',
    nodes: stage.nodes.map((node) => ({ ...node, position: { ...node.position } })),
    edges: stage.edges.map((edge) => ({ ...edge })),
    log: [
      {
        id: 'init-log',
        timestamp: 0,
        message: '侵入作戦を開始しました。まずは公開サーバーをスキャンしてください。',
        severity: 'info',
      },
    ],
  };
}
