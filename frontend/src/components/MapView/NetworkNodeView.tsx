
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
  isEntry?: boolean;
  isMonitored?: boolean;
  monitoringExtra?: number;
  gateState?: 'locked' | 'unlocked' | 'hacked';
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
  const { node, selected, isEntry, isMonitored, monitoringExtra = 0, gateState } = data;

  const displayName =
    node.status === 'unscanned'
      ? isEntry ? `${node.id} / 初期侵入口` : '不明ノード'
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
        isMonitored && monitoringExtra > 0 ? 'network-node--monitored' : '',
        gateState === 'locked' ? 'network-node--locked' : '',
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
      {isMonitored && <div className="network-node__mechanic">{monitoringExtra > 0 ? `監視 +${monitoringExtra}%` : '監視解除済み'}</div>}
      {gateState && <div className="network-node__mechanic">ゲート：{gateState === 'locked' ? 'ロック中' : gateState === 'hacked' ? '攻略済み' : '解除済み'}</div>}

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
