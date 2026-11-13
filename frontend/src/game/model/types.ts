// フロント/バック間のデータ契約 (docs/api-contract.md) に対応する型定義。
export type { GameMapDefinition } from './mapDefinition';
// 契約を変更したら、まず api-contract.md を更新してからここを同期させること。

// ===== 確定: GET /api/network が実際に返す形 (backend/main.py: get_network_map) =====

export type NetworkLayer = 'External' | 'DMZ' | 'Internal' | 'Core';
export type NodeStatus = 'unscanned' | 'scanned' | 'hacked';

export interface ApiNetworkNode {
  id: string;
  position: { x: number; y: number };
  data: {
    label: string;
    layer: NetworkLayer;
    info: string | null;
    vulnerability?: string | null;
    status: NodeStatus;
  };
}

export interface ApiNetworkEdge {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
}

export interface NetworkMapResponse {
  nodes: ApiNetworkNode[];
  edges: ApiNetworkEdge[];
}

// アプリ内部(状態管理・ゲームロジック)で扱うためのフラットな形。
// React Flow に渡す直前に toApiNode() で元の形へ戻す。
export interface NetworkNode {
  id: string;
  layer: NetworkLayer;
  name: string;
  position: { x: number; y: number };
  status: NodeStatus;
  info: string | null;
  vulnerability: string | null;
}

export function fromApiNode(node: ApiNetworkNode): NetworkNode {
  return {
    id: node.id,
    layer: node.data.layer,
    name: node.data.label,
    position: node.position,
    status: node.data.status,
    info: node.data.info,
    vulnerability: node.data.vulnerability ?? null,
  };
}

export function toApiNode(node: NetworkNode): ApiNetworkNode {
  return {
    id: node.id,
    position: node.position,
    data: {
      label: node.name,
      layer: node.layer,
      info: node.info,
      vulnerability: node.vulnerability,
      status: node.status,
    },
  };
}

// ===== 確定: POST /api/scan が実際に受け取る/返す形 (backend/main.py: scan_node) =====

export interface ScanApiRequest {
  node_id: string;
}

export type ScanApiResponse =
  | { message: string; status: NodeStatus; remaining_resource: number }
  | { error: string };

// ===== プレイヤー状態・操作コマンド・リアルタイム更新 =====

export type GameStatus = 'playing' | 'paused' | 'won' | 'lost';
export type LogSeverity = 'info' | 'success' | 'warning' | 'danger';

export interface LogEntry {
  id: string;
  timestamp: number;
  message: string;
  severity: LogSeverity;
}

export interface KeyFragments {
  a: string | null;
  b: string | null;
  unlocked?: boolean;
}

export interface GameState {
  securityEvents?: Record<string, ('INFO_CONFIRMED' | 'ANALYSIS_COMPLETED')[]>;
  gameId: string;
  stageId?: number;
  evaluation?: MissionEvaluation | null;
  keyFragments?: KeyFragments;
  status: GameStatus;
  elapsedSeconds: number;    // backend DBでは player_status.game_time
  alertLevel: number;        // backend DBでは player_status.alert_level
  analysisResource: number;  // backend DBでは player_status.analysis_resource
  privilege: string;         // backend DBでは player_status.current_privilege (GUEST / USER / ADMIN / ROOT)
  nodes: NetworkNode[];
  edges: ApiNetworkEdge[];
  log: LogEntry[];
}

export interface MissionEvaluation {
  rank: 'S' | 'A' | 'B' | 'C' | 'D';
  score: number;
  title: string;
}

 

export type ActionType =
  | 'confirmInfo'
  | 'completeAnalysis'
  | 'scan'
  | 'remoteScan'
  | 'breach'
  | 'dataExtract'
  | 'recover'
  | 'pause'
  | 'resume';



export interface ActionRequest {
  type: ActionType;
  nodeId?: string;
  passcode?: string;
  exploitMismatch?: boolean;
}

export type ActionRejectReason =
  | 'security_requirements_unmet'
  | 'insufficient_resource'
  | 'insufficient_privilege'
  | 'node_not_scanned'
  | 'node_unreachable'
  | 'node_locked'
  | 'invalid_passcode'
  | 'invalid_state';

export interface ActionResult {
  accepted: boolean;
  reason?: ActionRejectReason;
}

export type ServerEvent =
  | { type: 'state_snapshot'; state: GameState }
  | { type: 'tick'; elapsedSeconds: number; alertLevel: number }
  | { type: 'node_update'; node: NetworkNode }
  | { type: 'log'; entry: LogEntry }
  | { type: 'game_over'; result: 'won' | 'lost' };

export interface ActionCost {
  time: number;
  resource: number;
  alertDelta: number;
}


export interface BalanceConfig {
  scan: ActionCost;
  remoteScan: ActionCost;
  breach: ActionCost;
  dataExtract: ActionCost;
  alertDecayPerSecond: number;
}


export interface GameClient {
  connect(onEvent: (event: ServerEvent) => void): Promise<GameState>;
  sendAction(action: ActionRequest): Promise<ActionResult>;
  reset(): Promise<void>;
  disconnect(): void;
}
