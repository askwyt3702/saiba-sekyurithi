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

export interface BreachStatus {
  // バッジに出す短い文言。ノード名を押しつぶさないよう短く保つ
  label: string;
  tone: 'done' | 'ready' | 'blocked';
  // バッジにマウスを乗せたときに出す補足(任意)
  detail?: string;
}

// スキャン済みノードに今すぐ侵入できるか。できない場合はその理由を返す。
export function breachStatus(
  node: NetworkNode,
  nodes: NetworkNode[],
  edges: ApiNetworkEdge[],
  privilege: string,
  stage: StageDefinition,
  securityEvents: Record<string, readonly string[]> = {},
): BreachStatus {
  if (node.status === 'hacked') return { label: '侵入済み', tone: 'done' };
  const missing = missingGateRequirements(node.id, nodes, stage);
  if (missing.length > 0) return { label: `ロック(要 ${missing.join('・')})`, tone: 'blocked' };
  if (!canReachNode(node.id, nodes, edges, stage)) return { label: '未到達(隣接ノードが未侵入)', tone: 'blocked' };
  if (PRIVILEGES.indexOf(privilege) < LAYERS.indexOf(node.layer)) {
    return { label: `権限不足(要 ${requiredPrivilege(node.layer)})`, tone: 'blocked' };
  }
  const rule = (SECURITY_RULES as Record<string, SecurityRule>)[node.id];
  if (!securityRequirementsMet(rule, securityEvents[node.id])) {
    return {
      label: '要 情報確認',
      tone: 'blocked',
      detail: rule?.failure_mode === 'consume'
        ? '確認前に侵入すると失敗し、資源と時間を消費します'
        : '確認前の侵入は消費なしで拒否されます',
    };
  }
  return { label: '侵入可能', tone: 'ready' };
}
