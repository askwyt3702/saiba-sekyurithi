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
  description: string;
}

export interface CardInstance {
  uid: string;
  defId: string;
}

export interface EnemyIntent {
  sourceNodeId: string;
  action: 'attack' | 'fortify' | 'alert';
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
  selectedCardUid: string | null;
  logs: TerritoryLog[];
  nextUid: number;
}
