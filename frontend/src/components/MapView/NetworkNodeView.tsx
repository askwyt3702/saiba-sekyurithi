
import {
  Handle,
  Position,
  type Node,
  type NodeProps,
} from '@xyflow/react';

import type { NetworkNode } from '../../game/model/types';
import './NetworkNodeView.css';

export interface NetworkNodeData {
  node: NetworkNode;
  selected: boolean;
  [key: string]: unknown;
}

export type NetworkFlowNode = Node<NetworkNodeData, 'networkNode'>;

const STATUS_LABELS: Record<string, string> = {
  unscanned: 'UNKNOWN',
  scanned: 'SCANNED',
  hacked: 'HACKED',
};

export function NetworkNodeView({
  data,
}: NodeProps<NetworkFlowNode>) {
  const { node, selected } = data;

  const displayName =
    node.status === 'unscanned'
      ? node.id === 'E01' ? 'E01 / 初期侵入口' : node.id === 'external-1' ? '訓練の入口' : '不明ノード'
      : node.name;

  const statusLabel =
    STATUS_LABELS[node.status] ?? node.status;

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

      <div className="network-node__layer">
        {node.id} / {node.layer}
      </div>

      <div className="network-node__name">
        {displayName}
      </div>

      <div className="network-node__status">
        <span className="network-node__status-dot" />
        {statusLabel}
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
