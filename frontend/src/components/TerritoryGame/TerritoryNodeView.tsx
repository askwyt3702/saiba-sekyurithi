import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { NodeHologramSymbol } from '../MapView/NodeHologramSymbol';
import type { EnemyIntent, TerritoryNode } from '../../game/territory/territoryTypes';

/** ARGUS のターンの演出で、このノードに起きていること */
export interface TerritoryNodeFx {
  kind: 'attacker' | 'hit' | 'captured' | 'fortify' | 'alert' | 'fizzle' | 'strike' | 'seized';
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
      {/* マップは左(入口)から右(敵の本陣)へ進むので、線は左右から出す */}
      <Handle type="target" position={Position.Left} className="tw-node__handle" />

      {intent && !fx && (
        <div className="tw-node__intent" title="次のARGUSターンに行う行動予告">
          {intent.label}
        </div>
      )}

      {/* key を変えると中身を作り直すので、揺れなどの演出が毎回最初から再生される */}
      <div key={fx?.key ?? 'idle'} className={`tw-node__body ${fx ? `tw-node__body--${fx.kind}` : ''}`}>
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
          {node.infection && (
            <span className="tw-node__status-badge tw-node__status-badge--infected" title={`マルウェア感染:あと${node.infection.turns}ターン、毎ターン${node.infection.damage}ダメージ`}>
              🦠{node.infection.turns}
            </span>
          )}
          {node.trapped && (
            <span className="tw-node__status-badge tw-node__status-badge--trap" title="罠:次に受ける攻撃を跳ね返す">🍯</span>
          )}
        </div>

        <div className="tw-node__plate">
          <div className="tw-node__head">
            <span>{node.id} · {node.layer}</span>
            <span className="tw-node__owner">{OWNER_LABELS[node.owner]}</span>
          </div>
          <div className="tw-node__name">{node.name}</div>
          <div className="tw-node__hp-row">
            <span className="tw-node__hp-text">
              <span className="tw-node__hp-label">HP</span>
              <strong>{node.hp}</strong>
              <span className="tw-node__hp-max">/{node.maxHp}</span>
            </span>
            {node.shield > 0 && <span className="tw-node__shield" title="シールド(先にこちらが削られる)">🛡{node.shield}</span>}
          </div>
          <div className="tw-node__hp-track">
            <div className="tw-node__hp-fill" style={{ width: `${hpPct}%` }} />
          </div>
        </div>

        {fx && (
          <span className={`tw-fx tw-fx--${fx.kind}`} aria-hidden="true">
            {fx.text && <span className="tw-fx__float">{fx.text}</span>}
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="tw-node__handle" />
    </div>
  );
}
