# NULL ROUTE フロント/バック データ契約 v0.2

フロントエンド担当・バックエンド担当・シナリオ/データ担当が、互いの実装を待たずに並行して作業できるようにするための取り決めです。
ここで決めた形を変える場合は、必ずこのファイルを更新してからチームに共有してください（型定義はこの契約から自動的に導かれるものではなく、`frontend/src/game/model/types.ts` に手で同期させています）。

> **v0.2での変更点**：v0.1はこのファイルが共有される前にバックエンド実装(`GET /api/network`)が先行して進んでいたため、ネットワーク構造(ノード・エッジ)の形を実装済みの内容に合わせて書き換えました。プレイヤー状態・操作コマンド・リアルタイム更新はまだ未実装のため、v0.1の提案をそのまま残しつつ「未確定」と明記しています。

## 1. 基本方針

- バックエンドは「権威サーバー」。ゲーム内時間・警戒度・各ノードの状態はすべてバックエンドが保持し、唯一の正とする。
- プレイヤーの操作（スキャン・侵入など）は **REST** でコマンドとして送る。即時に結果が確定するとは限らない（時間がかかる操作のため）。
- 時間経過・警戒度変化・ノード状態の更新など「サーバー側で勝手に進む/変化する」情報は **WebSocket** でクライアントにプッシュする。REST ポーリングだと常時変化するゲーム内時計と相性が悪いため。
- バランス数値（コスト・警戒度増減量など）はロジックコードに埋め込まず、`balanceConfig` のような設定データとして分離する（企画書の「拡張性」要件）。

## 2. データモデル

### 2.1 確定：ネットワーク構造（`GET /api/network` が実際に返す形）

`backend/main.py` の `get_network_map()` にすでに実装されている形。ノードはReact Flowがそのまま読み込める形で返り、接続関係はノードに持たせず別配列の `edges` で表す。

```ts
type NetworkLayer = 'External' | 'DMZ' | 'Internal' | 'Core';
type NodeStatus = 'unscanned' | 'scanned' | 'hacked';

interface ApiNetworkNode {
  id: string;
  position: { x: number; y: number };
  data: {
    label: string;
    layer: NetworkLayer;
    info: string | null;
    status: NodeStatus;       // 現状の実装では常に "unscanned" 固定（node_stateとまだ連携していない）
  };
}

interface ApiNetworkEdge {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
}

interface NetworkMapResponse {
  nodes: ApiNetworkNode[];
  edges: ApiNetworkEdge[];
}
```

`vulnerability`（`NodeMaster.vulnerability` カラムは既にDBにあるが、まだ `/api/network` のレスポンスには含まれていない）と、ノードごとの侵入必要権限は未実装（7節参照）。

### 2.2 未確定：プレイヤー状態・ログ（提案中、backendに対応エンドポイントなし）

```ts
type GameStatus = 'playing' | 'paused' | 'won' | 'lost';
type LogSeverity = 'info' | 'success' | 'warning' | 'danger';

interface LogEntry {
  id: string;
  timestamp: number;   // elapsedSeconds のスナップショット
  message: string;
  severity: LogSeverity;
}

interface GameState {
  gameId: string;
  status: GameStatus;
  elapsedSeconds: number;    // DBでは player_status.game_time
  alertLevel: number;        // DBでは player_status.alert_level (0-100)
  analysisResource: number;  // DBでは player_status.analysis_resource
  privilege: string;         // DBでは player_status.current_privilege。値の一覧は未定義（確認できるのは "GUEST" のみ）
  nodes: ApiNetworkNode[]    // 2.1 と同じ形
  edges: ApiNetworkEdge[];
  log: LogEntry[];
}
```

## 3. プレイヤー操作（REST）※未実装・提案中

```
POST /api/games/{gameId}/actions
```

リクエストボディ：

```ts
type ActionType = 'scan' | 'breach' | 'dataExtract' | 'pause' | 'resume';

interface ActionRequest {
  type: ActionType;
  nodeId?: string; // pause / resume では不要
}
```

レスポンス（操作の受理可否のみを即答し、実際の効果は WebSocket で後から届く）：

```ts
interface ActionResult {
  accepted: boolean;
  reason?: string; // 却下理由（資源不足・権限不足・対象ノード不正 等）
}
```

却下理由の例：`insufficient_resource` / `insufficient_privilege` / `node_not_scanned` / `invalid_state`

## 4. サーバー → クライアント push（WebSocket）※未実装・提案中

```
GET /ws/games/{gameId}
```

接続直後に state_snapshot を1回受け取り、以後は差分イベントを受け取る。

```ts
type ServerEvent =
  | { type: 'state_snapshot'; state: GameState }
  | { type: 'tick'; elapsedSeconds: number; alertLevel: number }
  | { type: 'node_update'; node: NetworkNode }
  | { type: 'log'; entry: LogEntry }
  | { type: 'game_over'; result: 'won' | 'lost' };
```

## 5. バランス設定（データ化）

```ts
interface ActionCost {
  time: number;        // 消費する秒数
  resource: number;    // 消費する解析資源
  alertDelta: number;  // 警戒度の変化量（成功時の基準値）
}

interface BalanceConfig {
  scan: ActionCost;
  breach: ActionCost;
  dataExtract: ActionCost;
  alertDecayPerSecond: number; // 何も起きていない間の自然減衰
}
```

プロトタイプの初期値は `frontend/src/game/data/balanceConfig.ts` を参照（暫定値、要調整）。

## 6. フロント側の抽象化（GameClient）

バックエンドの実装が未完成でも画面を作れるよう、フロントはバックエンドと直接通信せず `GameClient` インターフェース越しにやり取りする。

```ts
interface GameClient {
  connect(onEvent: (event: ServerEvent) => void): Promise<GameState>;
  sendAction(action: ActionRequest): Promise<ActionResult>;
  disconnect(): void;
}
```

- 開発初期：`MockGameClient`（ブラウザ内でタイマーと状態をシミュレートするダミー実装）を使う。
- バックエンド接続後：同じインターフェースを満たす `WebSocketGameClient` に差し替える（UIコンポーネント側のコードは変更不要）。

## 7. まだ決まっていないこと

以下は未確定（チームで決め次第 v0.3 として更新）。

- ノードごとの侵入必要権限の持たせ方：`NodeMaster` に専用カラムを足すか、`layer` から機械的に算出するかが未定（今のモック実装は暫定でlayer由来にしている）
- `current_privilege` の値の一覧（"GUEST"以外に何があるか、順序も含めて）
- `/api/network` に `vulnerability` を含めるか、別エンドポイントにするか
- `node_state`（攻略状況）と `/api/network` の連携方法（現状は `status` が常に "unscanned" 固定）
- プレイヤー状態取得・操作コマンド・リアルタイム更新のAPI自体（3〜4節はまだ提案段階で、backendには未実装）
- 警戒度が100に達した時の挙動（即ゲームオーバーか、ペナルティか）
- ステージ切り替え・難易度の持たせ方（`gameId` がステージも表すのか等）
- セーブ/ロードのAPI（ロード時に `elapsedSeconds` をどう扱うか）
- 認証（ユーザー識別が必要か、`gameId` だけで足りるか）
