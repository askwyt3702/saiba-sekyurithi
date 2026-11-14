import type { StageDefinition } from '../../game/data/stageData';
import { canReachNode, missingGateRequirements } from '../../game/model/actionRules';
import type { ApiNetworkEdge, NetworkLayer, NetworkNode } from '../../game/model/types';
import { SECURITY_RULES } from '../../game/data/stageData';
import type { SecurityRule } from '../../game/model/mapDefinition';
import { securityRequirementsMet } from '../../game/model/actionRules';

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
  securityEvents: Record<string, readonly string[]> = {},
): { label: string; tone: 'done' | 'ready' | 'blocked' } {
  if (node.status === 'hacked') return { label: '侵入済み', tone: 'done' };
  const missing = missingGateRequirements(node.id, nodes, stage);
  if (missing.length > 0) return { label: `ロック(要 ${missing.join('・')})`, tone: 'blocked' };
  if (!canReachNode(node.id, nodes, edges, stage)) return { label: '未到達(隣接ノードが未侵入)', tone: 'blocked' };
  if (PRIVILEGES.indexOf(privilege) < LAYERS.indexOf(node.layer)) {
    return { label: `権限不足(要 ${requiredPrivilege(node.layer)})`, tone: 'blocked' };
  }
  const rule = (SECURITY_RULES as Record<string, SecurityRule>)[node.id];
  if (!securityRequirementsMet(rule, securityEvents[node.id])) {
    return { label: rule?.failure_mode === 'consume' ? '確認条件未達（侵入未完了・資源と時間の消費あり）' : '情報確認が必要（未確認の侵入は無消費で拒否）', tone: 'blocked' };
  }
  return { label: '侵入可能', tone: 'ready' };
}
