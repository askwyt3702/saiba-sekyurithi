import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { NetworkNode } from '../../game/model/types';
import './NetworkNodeView.css';

export interface NetworkNodeData {
  node: NetworkNode;
  selected: boolean;
  [key: string]: unknown;
}

export type NetworkFlowNode = Node<NetworkNodeData, 'networkNode'>;

export function NetworkNodeView({ data }: NodeProps<NetworkFlowNode>) {
  const { node, selected } = data;
  const displayName = node.status === 'unscanned' ? '不明ノード' : node.name;

  return (
    <div
      className={[
        'network-node',
        `network-node--${node.status}`,
        `network-node--${node.layer.toLowerCase()}`,
        selected ? 'network-node--selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Handle type="target" position={Position.Top} />
      <div className="network-node__layer">{node.layer}</div>
      <div className="network-node__name">{displayName}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
