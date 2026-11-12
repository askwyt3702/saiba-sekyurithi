import type { ApiNetworkEdge, NetworkNode } from './types';
import type { StageDefinition } from '../data/stageData';

export function hasFoothold(nodes: NetworkNode[]): boolean {
  return nodes.some((node) => node.status === 'hacked');
}

export function hasHackedNeighbor(nodeId: string, nodes: NetworkNode[], edges: ApiNetworkEdge[]): boolean {
  return edges.some((edge) => {
    const neighbor = edge.source === nodeId ? edge.target : edge.target === nodeId ? edge.source : null;
    return neighbor !== null && nodes.some((node) => node.id === neighbor && node.status === 'hacked');
  });
}

export function canReachNode(nodeId: string, nodes: NetworkNode[], edges: ApiNetworkEdge[], stage: StageDefinition): boolean {
  return stage.entryNodeIds.includes(nodeId) || hasHackedNeighbor(nodeId, nodes, edges);
}

export function canRemoteScanNode(nodeId: string, nodes: NetworkNode[], stage: StageDefinition): boolean {
  return stage.entryNodeIds.includes(nodeId) || hasFoothold(nodes);
}

export function isMonitoringActive(nodes: NetworkNode[], stage: StageDefinition): boolean {
  const monitor = stage.conditionalBreachAlert;
  return !!monitor && !nodes.some((node) => node.id === monitor.disabledByNodeId && node.status === 'hacked');
}

export function monitoringExtra(nodeId: string, nodes: NetworkNode[], stage: StageDefinition): number {
  const monitor = stage.conditionalBreachAlert;
  return monitor?.targetNodeIds.includes(nodeId) && isMonitoringActive(nodes, stage) ? monitor.alertDelta : 0;
}

export function missingGateRequirements(nodeId: string, nodes: NetworkNode[], stage: StageDefinition): string[] {
  return (stage.breachRequirements[nodeId] ?? []).filter((required) =>
    !nodes.some((node) => node.id === required && node.status === 'hacked'));
}

// 攻略済み状態へ更新した後で呼ぶ。再侵入は通常の検証で拒否される。
export function mechanicsUnlockMessages(nodeId: string, nodes: NetworkNode[], stage: StageDefinition): string[] {
  const messages: string[] = [];
  const monitor = stage.conditionalBreachAlert;
  if (monitor?.disabledByNodeId === nodeId) {
    messages.push(`監視解除: ${nodeId}攻略により対象ノードの追加警戒度+${monitor.alertDelta}%が無効になりました。`);
  }
  for (const [gate, required] of Object.entries(stage.breachRequirements)) {
    if (required.includes(nodeId) && !nodes.some((node) => node.id === gate && node.status === 'hacked') &&
        missingGateRequirements(gate, nodes, stage).length === 0) {
      messages.push(`ゲート解除: ${gate} の侵入条件を満たしました（前提: ${[...required].sort().join(', ')}）。`);
    }
  }
  return messages;
}
