import type { ApiNetworkEdge, NetworkLayer } from '../model/types';
import type { NodeVisualRole } from '../../components/MapView/nodeVisualRole';

export type TerritoryOwner = 'player' | 'neutral' | 'argus';

export type CardKind = 'attack' | 'utility' | 'defense';

export interface CardDef {
  id: string;
  name: string;
  cost: number;
  kind: CardKind;
  targetType: 'hostile' | 'player' | 'none';
  damage?: number;
  splashDamage?: number;
  shieldGain?: number;
  alertDelta?: number;
  bandwidthGain?: number;
  drawCount?: number;
  applyExpose?: boolean;
  pierceShield?: boolean;
  weakRoles?: NodeVisualRole[];
  rarity: 'starter' | 'common' | 'rare';
  /** カードの絵柄として大きく出す記号 */
  icon?: string;
  description: string;
}

export interface CardInstance {
  uid: string;
  defId: string;
}

export interface EnemyIntent {
  sourceNodeId: string;
  /** expand: 隣の中立ノードを侵食する(HP を 0 にすると ARGUS のものになる) */
  action: 'attack' | 'expand' | 'fortify' | 'alert';
  targetNodeId: string;
  value: number;
  label: string;
}

export interface TerritoryNode {
  id: string;
  name: string;
  layer: NetworkLayer;
  role: NodeVisualRole;
  position: { x: number; y: number };
  owner: TerritoryOwner;
  hp: number;
  maxHp: number;
  shield: number;
  exposed: boolean;
  isEntry?: boolean;
  isCoreTarget?: boolean;
}

export interface TerritoryLog {
  id: string;
  turn: number;
  severity: 'info' | 'success' | 'warning' | 'danger';
  message: string;
}

/**
 * ARGUS がターン終了時に実際に行ったこと。画面で1つずつ演出して見せるために記録する
 * (ログを読まなくても、何が起きたか分かるように)。
 */
export type EnemyActionEvent =
  | { kind: 'attack'; sourceNodeId: string; targetNodeId: string; damage: number; captured: boolean }
  | { kind: 'expand'; sourceNodeId: string; targetNodeId: string; damage: number; captured: boolean }
  | { kind: 'fortify'; nodeId: string; value: number }
  | { kind: 'alert'; nodeId: string; value: number }
  /** 予告していたノードを先に制圧されたため、行動できなかった */
  | { kind: 'fizzle'; sourceNodeId: string };

export interface TerritoryGameState {
  status: 'playing' | 'won' | 'lost';
  turn: number;
  bandwidth: number;
  maxBandwidth: number;
  alertLevel: number;
  nodes: TerritoryNode[];
  edges: ApiNetworkEdge[];
  deck: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  rewardChoices: CardDef[] | null;
  intents: EnemyIntent[];
  /** 直前の ARGUS ターンで実際に起きたこと(古い順) */
  lastEnemyActions: EnemyActionEvent[];
  selectedCardUid: string | null;
  logs: TerritoryLog[];
  nextUid: number;
}
