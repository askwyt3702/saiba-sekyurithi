import type { StageDefinition } from '../../game/data/stageData';
import { canReachNode, missingGateRequirements } from '../../game/model/actionRules';
import type { ApiNetworkEdge, NetworkLayer, NetworkNode } from '../../game/model/types';

// 層ごとに必要な権限(backend/balance_config.py の PRIVILEGE_LADDER・LAYER_ORDER と同じ順)
export const LAYERS: NetworkLayer[] = ['External', 'DMZ', 'Internal', 'Core'];
export const PRIVILEGES = ['GUEST', 'USER', 'ADMIN', 'ROOT'];

export function requiredPrivilege(layer: NetworkLayer): string {
  return PRIVILEGES[LAYERS.indexOf(layer)] ?? 'ROOT';
}

// スキャン済みノードに今すぐ侵入できるか。できない場合はその理由を返す。
export function breachStatus(
  node: NetworkNode,
  nodes: NetworkNode[],
  edges: ApiNetworkEdge[],
  privilege: string,
  stage: StageDefinition,
): { label: string; tone: 'done' | 'ready' | 'blocked' } {
  if (node.status === 'hacked') return { label: '侵入済み', tone: 'done' };
  const missing = missingGateRequirements(node.id, nodes, stage);
  if (missing.length > 0) return { label: `ロック(要 ${missing.join('・')})`, tone: 'blocked' };
  if (!canReachNode(node.id, nodes, edges, stage)) return { label: '未到達(隣接ノードが未侵入)', tone: 'blocked' };
  if (PRIVILEGES.indexOf(privilege) < LAYERS.indexOf(node.layer)) {
    return { label: `権限不足(要 ${requiredPrivilege(node.layer)})`, tone: 'blocked' };
  }
  return { label: '侵入可能', tone: 'ready' };
}
