// フロント/バック間のデータ契約 (docs/api-contract.md) に対応する型定義。
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
  vulnerability: string | null; // 現状の /api/network にはまだ含まれていない
}

export function fromApiNode(node: ApiNetworkNode): NetworkNode {
  return {
    id: node.id,
    layer: node.data.layer,
    name: node.data.label,
    position: node.position,
    status: node.data.status,
    info: node.data.info,
    vulnerability: null,
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
      status: node.status,
    },
  };
}

// ===== 確定: POST /api/scan が実際に受け取る/返す形 (backend/main.py: scan_node) =====
// 現状は資源10固定・即時実行で、下の ActionRequest/ActionResult (未実装の提案) とは
// コスト・レスポンス形式が食い違っている。docs/api-contract.md 7節を参照。

export interface ScanApiRequest {
  node_id: string;
}

export type ScanApiResponse =
  | { message: string; status: NodeStatus; remaining_resource: number }
  | { error: string };

// ===== 未確定・提案中: プレイヤー状態・操作コマンド・リアルタイム更新 =====
// backendにまだ対応エンドポイントが無い部分。実装され次第この節を実態に合わせて更新すること。

export type GameStatus = 'playing' | 'paused' | 'won' | 'lost';
export type LogSeverity = 'info' | 'success' | 'warning' | 'danger';

export interface LogEntry {
  id: string;
  timestamp: number;
  message: string;
  severity: LogSeverity;
}

export interface GameState {
  gameId: string;
  status: GameStatus;
  elapsedSeconds: number;    // backend DBでは player_status.game_time
  alertLevel: number;        // backend DBでは player_status.alert_level
  analysisResource: number;  // backend DBでは player_status.analysis_resource
  privilege: string;         // backend DBでは player_status.current_privilege (値の一覧は未定義、現状確認できる値は "GUEST" のみ)
  nodes: NetworkNode[];
  edges: ApiNetworkEdge[];
  log: LogEntry[];
}

export type ActionType = 'scan' | 'breach' | 'dataExtract' | 'pause' | 'resume';

export interface ActionRequest {
  type: ActionType;
  nodeId?: string;
}

export type ActionRejectReason =
  | 'insufficient_resource'
  | 'insufficient_privilege'
  | 'node_not_scanned'
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
  breach: ActionCost;
  dataExtract: ActionCost;
  alertDecayPerSecond: number;
}

export interface GameClient {
  connect(onEvent: (event: ServerEvent) => void): Promise<GameState>;
  sendAction(action: ActionRequest): Promise<ActionResult>;
  disconnect(): void;
}
