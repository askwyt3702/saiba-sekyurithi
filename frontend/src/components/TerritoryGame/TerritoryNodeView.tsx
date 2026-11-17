import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { NodeHologramSymbol } from '../MapView/NodeHologramSymbol';
import type { EnemyIntent, TerritoryNode } from '../../game/territory/territoryTypes';

/** ARGUS のターンの演出で、このノードに起きていること */
export interface TerritoryNodeFx {
  kind: 'attacker' | 'hit' | 'captured' | 'fortify' | 'alert' | 'fizzle';
  /** ノードの上に浮かぶ文字(例: -6、奪還!) */
  text?: string;
  /** 同じノードに続けて起きても、演出を最初から再生し直すためのキー */
  key: string;
}

export interface TerritoryFlowNodeData {
  node: TerritoryNode;
  targetable: boolean;
  isWeakness: boolean;
  intent?: EnemyIntent;
  fx?: TerritoryNodeFx;
  [key: string]: unknown;
}

export type TerritoryFlowNode = Node<TerritoryFlowNodeData, 'territoryNode'>;

const OWNER_LABELS = { player: '自陣', argus: 'ARGUS', neutral: '中立' } as const;

export function TerritoryNodeView({ data }: NodeProps<TerritoryFlowNode>) {
  const { node, targetable, isWeakness, intent, fx } = data;

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

      {/* key を変えると中身を作り直すので、揺れなどの演出が毎回最初から再生される */}
      <div key={fx?.key ?? 'idle'} className={`tw-node__body ${fx ? `tw-node__body--${fx.kind}` : ''}`}>
        {intent && !fx && (
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
            <span className="tw-node__owner">{OWNER_LABELS[node.owner]}</span>
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

        {fx && (
          <span className={`tw-fx tw-fx--${fx.kind}`} aria-hidden="true">
            {fx.text && <span className="tw-fx__float">{fx.text}</span>}
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="tw-node__handle" />
    </div>
  );
}
