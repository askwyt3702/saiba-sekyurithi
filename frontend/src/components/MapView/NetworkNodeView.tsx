import {
  Handle,
  Position,
  type Node,
  type NodeProps,
} from '@xyflow/react';

import type { NetworkNode } from '../../game/model/types';
import { NodeHologramSymbol } from './NodeHologramSymbol';
import { resolveNodeRole } from './nodeVisualRole';
import './NetworkNodeView.css';

export interface NetworkNodeData {
  node: NetworkNode;
  selected: boolean;
  isEntry?: boolean;
  reachable?: boolean;
  trapState?: 'flagged' | 'triggered';
  argusReinforced?: boolean;
  isMonitored?: boolean;
  monitoringExtra?: number;
  gateState?: 'locked' | 'unlocked' | 'hacked';
  effect?: { resourceBonus: number; alertDelta: number; log?: string };
  isKeyFragment?: boolean;
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
  const {
    node,
    selected,
    isEntry,
    reachable,
    trapState,
    argusReinforced,
    isMonitored,
    monitoringExtra = 0,
    gateState,
    effect,
    isKeyFragment,
  } = data;

  const role = resolveNodeRole(node);
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
        `network-node--role-${role}`,
        selected ? 'network-node--selected' : '',
        reachable && node.status !== 'hacked' ? 'network-node--reachable' : '',
        isMonitored && monitoringExtra > 0 ? 'network-node--monitored' : '',
        gateState === 'locked' ? 'network-node--locked' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Handle type="target" position={Position.Top} className="network-node__handle" />

      <div className="network-node__symbol-wrap">
        {selected && <span className="network-node__target-ring" aria-hidden="true" />}
        <NodeHologramSymbol
          role={role}
          status={node.status}
          gateState={gateState}
          reachable={Boolean(reachable || isEntry)}
        />
        {node.status === 'hacked' && (
          <span className="network-node__hacked-check" aria-hidden="true">✓</span>
        )}
      </div>

      <div className="network-node__capsule">
        <div className="network-node__layer">
          <span>{node.id} / {node.layer}</span>
          <span className="network-node__status">
            <span className="network-node__status-dot" />
            {statusLabel}
          </span>
        </div>

        <div className="network-node__name">
          {displayName}
        </div>
      </div>

      {/* 特殊作戦効果バッジ（スキャン済み以上で表示） */}
      {node.status !== 'unscanned' && (effect || isKeyFragment) && (
        <div className="network-node__effect">
          {effect && effect.alertDelta < 0 && (
            <span className="node-effect-tag node-effect-tag--stealth">
              痕跡消去 {effect.alertDelta}%
            </span>
          )}
          {effect && effect.resourceBonus > 0 && (
            <span className="node-effect-tag node-effect-tag--supply">
              資源 +{effect.resourceBonus}
            </span>
          )}
          {isKeyFragment && (
            <span className="node-effect-tag node-effect-tag--key">
              🔑 暗号鍵断片
            </span>
          )}
        </div>
      )}

      {(isMonitored || gateState || trapState || argusReinforced) && (
        <div className="network-node__mechanics">
          {trapState === 'flagged' && (
            <div className="network-node__mechanic network-node__mechanic--trap-ok">⚠ 罠隔離済み</div>
          )}
          {trapState === 'triggered' && (
            <div className="network-node__mechanic network-node__mechanic--trap-hit">💥 TRAP封鎖</div>
          )}
          {argusReinforced && (
            <div className="network-node__mechanic network-node__mechanic--argus">👁 ARGUS強化警戒</div>
          )}
          {isMonitored && (
            <div className="network-node__mechanic">
              {monitoringExtra > 0 ? `監視 +${monitoringExtra}%` : '監視解除済み'}
            </div>
          )}
          {gateState && (
            <div className="network-node__mechanic">
              ゲート：{gateState === 'locked' ? 'ロック中' : gateState === 'hacked' ? '攻略済み' : '解除済み'}
            </div>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="network-node__handle" />
    </div>
  );
}
