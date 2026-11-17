import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { NodeHologramSymbol } from '../MapView/NodeHologramSymbol';
import type { EnemyIntent, TerritoryNode } from '../../game/territory/territoryTypes';

export interface TerritoryFlowNodeData {
  node: TerritoryNode;
  targetable: boolean;
  isWeakness: boolean;
  intent?: EnemyIntent;
  [key: string]: unknown;
}

export type TerritoryFlowNode = Node<TerritoryFlowNodeData, 'territoryNode'>;

export function TerritoryNodeView({ data }: NodeProps<TerritoryFlowNode>) {
  const { node, targetable, isWeakness, intent } = data;

  const visualStatus =
    node.owner === 'player'
      ? 'hacked'
      : node.owner === 'argus'
        ? 'scanned'
        : 'unscanned';

  const gateState = node.owner === 'argus' ? 'locked' : undefined;
  const hpPct = Math.round((node.hp / node.maxHp) * 100);

  return (
    <div
      className={[
        'tw-node',
        `tw-node--${node.owner}`,
        targetable ? 'tw-node--targetable' : '',
        node.isCoreTarget ? 'tw-node--core' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Handle type="target" position={Position.Top} className="tw-node__handle" />

      {intent && (
        <div className="tw-node__intent" title="次のARGUSターンに行う行動予告">
          {intent.label}
        </div>
      )}

      <div className="tw-node__symbol">
        <NodeHologramSymbol
          role={node.role}
          status={visualStatus}
          gateState={gateState}
          reachable={targetable}
        />
        {targetable && isWeakness && (
          <span className="tw-node__weakness">WEAK ×1.5</span>
        )}
        {node.exposed && (
          <span className="tw-node__exposed">脆弱性露出</span>
        )}
      </div>

      <div className="tw-node__plate">
        <div className="tw-node__head">
          <span>{node.id} · {node.layer}</span>
          <span className="tw-node__owner">
            {node.owner === 'player' ? 'PLAYER' : node.owner === 'argus' ? 'ARGUS' : 'NEUTRAL'}
          </span>
        </div>
        <div className="tw-node__name">{node.name}</div>
        <div className="tw-node__hp-row">
          <div className="tw-node__hp-track">
            <div className="tw-node__hp-fill" style={{ width: `${hpPct}%` }} />
          </div>
          <span className="tw-node__hp-text">
            {node.hp}/{node.maxHp}
            {node.shield > 0 ? ` 🛡${node.shield}` : ''}
          </span>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="tw-node__handle" />
    </div>
  );
}
