import type { ApiNetworkEdge, GameState, NetworkNode } from '../model/types';

// backend/main.py の init_db() が投入する初期データと同じ内容にしてある。
// 実バックエンドに繋ぎ替えてもノードID・配置が変わらないようにするため。
const nodes: NetworkNode[] = [
  { id: 'external-1', layer: 'External', name: 'External (公開サーバー)', position: { x: 250, y: 50 }, status: 'unscanned', info: '最初の侵入口。', vulnerability: null },
  { id: 'dmz-1', layer: 'DMZ', name: 'DMZ (Webサーバー)', position: { x: 150, y: 150 }, status: 'unscanned', info: '不明', vulnerability: null },
  { id: 'dmz-2', layer: 'DMZ', name: 'DMZ (メールサーバー)', position: { x: 350, y: 150 }, status: 'unscanned', info: '不明', vulnerability: null },
  { id: 'internal-1', layer: 'Internal', name: 'Internal (社内網)', position: { x: 250, y: 250 }, status: 'unscanned', info: '不明', vulnerability: null },
  { id: 'core-1', layer: 'Core', name: 'Core (機密DB)', position: { x: 250, y: 350 }, status: 'unscanned', info: '機密データが眠る最終目標。', vulnerability: null },
];

const edges: ApiNetworkEdge[] = [
  { id: 'e1', source: 'external-1', target: 'dmz-1', animated: true },
  { id: 'e2', source: 'external-1', target: 'dmz-2', animated: true },
  { id: 'e3', source: 'dmz-1', target: 'internal-1' },
  { id: 'e4', source: 'dmz-2', target: 'internal-1' },
  { id: 'e5', source: 'internal-1', target: 'core-1' },
];

export function createMockGameState(gameId: string): GameState {
  return {
    gameId,
    status: 'playing',
    elapsedSeconds: 0,
    alertLevel: 0,
    analysisResource: 10,
    privilege: 'GUEST',
    nodes: nodes.map((node) => ({ ...node, position: { ...node.position } })),
    edges: edges.map((edge) => ({ ...edge })),
    log: [],
  };
}
