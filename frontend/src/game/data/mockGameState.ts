import type { GameState } from '../model/types';
import { INITIAL_ANALYSIS_RESOURCE, STAGE_EDGES, STAGE_NODES } from './stageData';

// ステージの中身は stageData.ts(backend/game_data.py から生成)を使う。
export function createMockGameState(gameId: string): GameState {
  return {
    gameId,
    status: 'playing',
    elapsedSeconds: 0,
    alertLevel: 0,
    analysisResource: INITIAL_ANALYSIS_RESOURCE,
    privilege: 'GUEST',
    nodes: STAGE_NODES.map((node) => ({ ...node, position: { ...node.position } })),
    edges: STAGE_EDGES.map((edge) => ({ ...edge })),
    log: [],
  };
}
