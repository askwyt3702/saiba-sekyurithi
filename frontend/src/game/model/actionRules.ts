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
