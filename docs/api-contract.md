# NULL ROUTE フロント/バック データ契約 v0.5

## ゲーム別マップSnapshot（Stage1動的生成対応）

ゲーム作成・取得・行動・リセットのGameStateに`mapSnapshot`を追加する。
形式は`{ schemaVersion: 1, source: 'fixed' | 'legacy-fixed' | 'generated', definition: GameMapDefinition, generationInfo?: { mapHash, configHash, validatorVersion, acceptedAttempt } }`。
`definition`の型は`frontend/src/game/model/mapDefinition.ts`、変換の正本は
`backend/map_repository.py`。ステージID（`definition.id`）、seed（固定はnull、生成は32桁小文字16進）、
generatorVersion（fixed-v1 / stage1-sha256-v1）、rulesVersion（turn-v1）、ノード・座標・接続・
効果・入口・目標・監視・ゲート・重要目標・初期状態・コスト・評価設定を含む。

DBには回答設定を含む完全定義をゲーム作成と同じトランザクションで保存する。
APIには公開用の写しを返す。未スキャンの説明・脆弱性・ヒント、
securityRulesのquestion_answersとvulnerabilityを公開しない。
鍵文字は従来の取得済みノード情報からのみ公開する。
ルートのGameState.nodes/edgesが進行状態付きの表示データ、
mapSnapshot.definition.nodesは同じ位置・ノード集合を持つ定義用データ
（statusはunscanned）であり、進行状態の正本にはしない。
クライアントからSnapshotを受け付けるAPIは追加しない。

- `POST /api/games`：Stage1は生成・検証済みの24ノードの定義を新しいgameIdへ保存する。Stage0/2は固定定義を保存する。
  任意の`seed`はStage1のみ対応し、省略時はランダム発行する。同じseed・生成版・設定で同じ盤面になる。
  任意の`requestId`（英数字・`_`・`-`、8〜128文字）は重複作成を抑止する。
  同じIDとステージ・seedの再送は同じgameIdを返し、異なる指定は409 `creation_request_conflict`。
  未対応stageId、Stage0/2へのseed指定、不正seedは422。生成失敗は503 `map_generation_failed`。
  生成失敗ではゲームを保存せず、クライアントの以前の再開先も更新しない。これらのエラーでMockへ切り替えない。
- `GET /api/games/{gameId}`：保存済み定義と進行状態を返す。再読み込みで再生成しない。
- 行動判定・評価はそのゲームの保存定義を参照し、NodeMasterや最新設定へ戻さない。
- 同一ステージのreset/RETRYは保存定義を保持し、進行・ログ・鍵を初期化する。
  従来の別stageId指定resetは互換性のため維持し、新ステージの固定定義へ置換する。
- 未保存の旧ゲームは初回起動/アクセスでlegacy-fixedとして一度だけ補完する。
  元々保存されていない過去の接続・数値までは復元できないため、接続/ルールは移行時の固定定義、
  ノード情報は起動時同期前のNodeMasterを採用する。進行は初期化しない。
- 非対応版・破損定義はHTTP409 `{"detail":"map_snapshot_invalid"}`。この応答では自動的に
  Mockへ切り替えずエラー画面で停止する。行動/リセット中の同じ409も停止対象とする。
- 通信失敗時は、HTTPの保存済みgameIdがあっても従来どおりMockへ切り替える。
  HTTPのgameId・DB保存は削除せず、Mockは独立した保存を使用する。OFFLINE表示で区別する。
  その他の接続エラーも従来のフォールバックを維持し、不正Snapshotとの区別はstatusとdetailで行う。
  エラー画面からはリセットや保存削除をせず「ミッション選択へ戻る」で離脱できる。

MockはStage1ではTypeScript生成器をWeb Workerで実行し、Stage0/2では固定データから完全定義を作り、
`nullroute.mock.snapshot.v1.{stageId}.{gameId}`へ定義・進行・非公開鍵を保存する。
再開とRETRYは同じ定義を使用する。古い形式・非対応版・破損したMock保存は、
当該ゲームのキーだけを削除して新規開始する。Stage1の通常接続では動的生成し直す。
他ステージ・他gameIdの保存、HTTPのgameIdは削除しない。
保存領域へのアクセス/書込み/削除に失敗した場合はエラー画面にし、他の保存を消して解決しない。
HTTPとMockの保存は別系統であり相互変換しない。
古いAPI応答との型互換のためmapSnapshotはTypeScriptではoptionalだが、更新後Backendは常に返す。
ミッション選択の「再開 / 開始」は保存済みゲームを優先し、「新しいゲームを始める」は別gameIdで作成する。
新規作成・初期状態の保存に成功した後だけ再開先を更新する。Mockの再開先は`nullroute.mock.gameId.<stageId>`。
RETRYはseed・座標・接続を保持し、TITLEでは進行をリセットしない。Stage3は従来どおり未実装・選択不可。
seed入力UIは追加せず、APIと内部の開始指定で再現できる。

## 問題機能・誤答ペナルティ

全45ノード（Stage 0: 5、Stage 1: 24、Stage 2: 16）で`ActionRequest.questionId`と`exploitId`を使う。正本は`SECURITY_RULES.question_answers`（ノード固有の問題ID→正解ID一覧）。Backend/Mockは生成データとゲーム別マップから同じ定義を使い、`exploitMismatch`は互換フィールドとして受け付けるが判定には一切使用しない。通常の状態・到達・権限・資源・ゲート条件を先に検証する。

- E01〜E03の誤答は警戒度+8%で資源・時間は不変。追加DMZ/Internalはmainのノード別設定に従い資源-1・警戒度+4〜7%・時間不変。いずれも自然減衰・監視追加分・ノード効果・報酬・鍵認証は発生せず、ノードはscannedのまま。100%到達は敗北し、クリア評価は付かない。
- 有効な問題IDを伴うE01/E02の確認/解析不足は、従来の資源2・20秒・実増4%の失敗試行となり、誤答処理を重ねない。問題ID未指定・不正の場合は無消費拒否する。E03の情報未確認は無消費拒否。
- 確認条件達成後、ID未指定/null/空文字/空白のみは`exploit_required`で無消費拒否。省略による成功回避はできない。既存のIDなし成功API利用者と自動攻略は正解IDを送るよう移行が必要。
- 有効な問題IDで、その問題の正解一覧にない回答IDを送ると誤答。前後空白・大文字小文字も含め完全一致で判定する。正解ID＋`exploitMismatch: true`は正答、不正解ID＋falseは誤答。passcode指定時は従来の暗号鍵条件も検証する。breach以外は問題ID・回答IDを使用しない。
- 問題の正答を選ぶだけでは状態は変わらず、実行ボタンから通常侵入を送信する。情報確認・解析は別の明示操作であり、自動完了しない。
- UIは選んだIDを送信し、同じ誤答の連続送信を抑止する。受理されたときだけ誤答済みにし、拒否時は成功表示せず再試行可能とする。API自体は受理した試行ごとに設定値を適用する。確認不足のE01/E02では誤答選択だけで試行せず、確認操作を先に促す。
- Core・Stage2・チュートリアルも同じ問題別判定を使う。正解IDは公開の定数なので、この仕組みは判定の統一と状態条件の検証を目的とし、答えを秘匿する機構ではない。

### 問題単位の判定と追加ノード

`questionId?: string | null`は侵入（breach）時に全45ノードで必須。形式は`ノードID:問題テンプレートID`（例：`E01:ssh-q1`、`S2-E01:ssh-q1`）で、各ノード3問・全135問のIDを一意にする。未指定/null/空文字は`question_required`、未知・空白・他ノードの問題IDは`invalid_question`で無消費拒否。UIは常に現在の問題IDを送る。省略や旧形式`ssh-q1`の自動補完はしない。

旧API利用者は、最新の`getSecurityChallenge(nodeId, vulnerability).questions`から選択問題の`.id`と選択肢の`.id`を送る必要がある。既存セーブの移行は不要で、マップ・進行状態・確認履歴は保持する。自動攻略も正規の情報確認と問題/回答IDを明示するよう更新した。

I01/I02は承認済みの例外として各ノードの`priv-q1`→`priv_esc`、`priv-q2`→`priv_sudo_b`を許可。別問題の正解を送ると誤答になる。Stage2とチュートリアルでmainが明示的に許可した同種問題以外へ、この回答を拡張しない。問題文の`devuser ALL=(ALL) NOPASSWD: ALL`は開発用一般ユーザーに全コマンドのroot実行を許す設定として出題されている。

新規DMZ/Internalの情報未確認は`security_requirements_unmet`で無消費拒否。これらに追加の解析必須条件は定義されていないため追加しない。正答時の追加報酬は0で、既存のノード効果・鍵断片・権限昇格は通常侵入成功時に従来どおり適用する。

| 誤答時の警戒度 | 対象ノード（資源-1、時間0秒） |
|---|---|
| +4% | D06、I05 |
| +5% | D01、D02、D04、D05、I02、I03、I06、I07、I10 |
| +6% | D03、D07、I01、I08、I09 |
| +7% | I04 |

Core・Stage2・チュートリアルもmainの設定を維持し、追加報酬0・誤答資源-1・時間0秒とする。警戒度はC01/C04が+8%、C02が+7%、C03が+10%。Stage2は+4〜10%のノード別設定。チュートリアルは通常4ノードが+5%、core-1が+8%。情報未確認は無消費拒否し、通常侵入成功時の既存ノード効果・補給・鍵・監視解除・ゲート解除は維持する。誤答には監視の追加+12%を重ねない。

情報確認が次の合法な侵入へ繋がる場合は、スキャン直後の詰み判定で敗北にしない。確認後の侵入も既存の資源・権限・到達・ゲート条件を満たせない場合は、情報確認だけを理由に詰み判定を回避しない。

## セキュリティ操作の統合追記

`confirmInfo`成功時は確認マーカーに続き、対象の`SECURITY_RULES.info_hint`を使った`【調査完了】`ログを1件追加する。文面は生成データ経由でMockにも共有し、純粋ルールだけが出力する。重複確認・拒否時・`completeAnalysis`では調査ログを追加しない。既存のレスポンス型・コスト・報酬は変更しない。

`ActionRequest.type`に`confirmInfo`（情報確認）と`completeAnalysis`（解析完了）を追加。どちらも`nodeId`が必要で、資源・時間・警戒度は消費しない。`GameState.securityEvents`はノードID→`INFO_CONFIRMED`/`ANALYSIS_COMPLETED`配列のマップ。Backendは既存の`[SECURITY:ID:EVENT]`ログから復元し、再読込で保持、resetで消去する。

- 情報確認は対応ノードがスキャン済みで未確認の場合のみ可能。解析完了は情報確認後に一度だけ可能。停止/終了時、対象外ステージ/ノード、重複操作は拒否する。モーダルを開くだけでは確認済みにしない。
- E01の侵入には情報確認と解析完了、E02/E03には情報確認が必要。従来の隣接・スキャン・権限・資源条件も必要。
- E01のスキャン方式は通常スキャンのみ。リモートスキャンは`invalid_state`で無消費拒否する（追加リモート更新の仕様を維持）。
- E01/E02の条件未達試行は`accepted: true`で資源2・20秒・警戒度実増4%を消費するが、ノードはscannedのまま。100%到達は敗北。`accepted`は操作の受理を示し、侵入成功はノード状態で確認する。
- E03の条件未達は`accepted: false, reason: "security_requirements_unmet"`。進行・資源・時間・警戒度・ログを変更しない。UIは不足条件とE01/E02の試行リスクを事前表示する。
- 初回侵入成功時の追加報酬はE01/E02が各+3。E03は既存補給+5のみで、二重加算しない。資源上限30は維持。ステージ2の監視・ゲート数値は不変。

以上は統合作業中にユーザーが承認した仕様。動的生成はまだ開始していない。

動的生成の第1段階では内部のゲーム別マップ型と純粋な行動遷移を追加した。今回の統合ではStage1生成・seed指定・保存と再開を上記の通信契約へ接続した。内部型は[行動ルール基盤](action-rules-foundation.md)を参照。

フロントエンド担当・バックエンド担当・シナリオ/データ担当が、互いの実装を待たずに並行して作業できるようにするための取り決めです。
ここで決めた形を変える場合は、必ずこのファイルを更新してからチームに共有してください（型定義はこの契約から自動的に導かれるものではなく、`frontend/src/game/model/types.ts` に手で同期させています）。

> **v0.2での変更点**：v0.1はこのファイルが共有される前にバックエンド実装(`GET /api/network`)が先行して進んでいたため、ネットワーク構造(ノード・エッジ)の形を実装済みの内容に合わせて書き換えました。プレイヤー状態・操作コマンド・リアルタイム更新はまだ未実装のため、v0.1の提案をそのまま残しつつ「未確定」と明記しています。
>
> **v0.3での変更点**：`POST /api/scan` が実装され、`GET /api/network` も `node_state`/`player_status` と連携して実際の攻略状況を返すようになりました。3節を実装済みの形に合わせて書き換え、3節の提案(タイムラグのある操作・`ActionResult`形式)との食い違いを「7. まだ決まっていないこと」に明記しました。
>
> **v0.4での変更点・重要**：チームで認識合わせした結果、**「操作が時間をかけて進行するか、即時実行のままか」は『ターン制(=アクションは即座に確定し、実時間の待ち時間は発生しない)』に決定**しました。この決定の前に、WebSocket・ゲーム内時間のtickループ・操作の「開始→実時間経過後に完了」という実時間方式の実装(コミット`959cc42`)が一度mainに入りましたが、決定と矛盾するため`0517d45`で revert 済みです。バックエンドは`POST /api/scan`・`/api/games/{gameId}/actions`で即座に結果が確定する形(コミット`74986ad`時点の実装)に戻っています。4節(WebSocket)は当面使わない想定に変わりました。

## 1. 基本方針

- バックエンドは「権威サーバー」。ゲーム内時間・警戒度・各ノードの状態はすべてバックエンドが保持し、唯一の正とする。
- **ターン制**：プレイヤーの操作（スキャン・侵入など）は **REST** でコマンドとして送り、**即座に結果が確定する**。実時間の待ち時間は発生しない(v0.4で決定。4節のWebSocket案は当面使わない)。
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
    info: string | null;       // unscanned のときは "不明（スキャンが必要です）" のように伏せて返る
    status: NodeStatus;        // player_status/node_state と連携した実際の攻略状況
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
  stageId?: number;
  status: GameStatus;
  elapsedSeconds: number;    // DBでは player_status.game_time
  alertLevel: number;        // DBでは player_status.alert_level (0-100)
  analysisResource: number;  // DBでは player_status.analysis_resource
  privilege: string;         // DBでは player_status.current_privilege。値の一覧は未定義（確認できるのは "GUEST" のみ）
  keyFragments?: {           // 入手済みの暗号鍵の断片（未入手は null）
    a: string | null;
    b: string | null;
    unlocked?: boolean;     // 両断片取得済みで暗号認証成功、または回収資源不足による救済が有効
  };
  nodes: ApiNetworkNode[]    // 2.1 と同じ形
  edges: ApiNetworkEdge[];
  log: LogEntry[];
}
```

## 3. プレイヤー操作（REST）

### 3.1 確定：`POST /api/scan`（実装済み）

```ts
interface ScanApiRequest {
  node_id: string; // キャメルケースではなくスネークケース
}

type ScanApiResponse =
  | { message: string; status: NodeStatus; remaining_resource: number }
  | { error: string }; // 失敗時もHTTPステータスは200、ボディのerrorで判別する
```

- `gameId`の概念はなく、`player_status`テーブルの最初の1行をプレイヤーとして扱う（1デプロイ=1プレイヤー想定）
- コストは解析資源10固定で即時実行（時間経過なし）。1.の「時間がかかる操作」という想定とは異なる
- 成功・失敗とも検証はできているが、二重送信(同じノードへの連続スキャン)を防ぐ仕組みはサーバー側にまだない

### 3.2 未実装・提案中：侵入・データ回収・一時停止を含む汎用コマンド案

`/api/scan`より前にこのファイルで提案していた形。侵入・データ回収にも展開するなら、どちらかの形に統一する必要がある(7節参照)。

```
POST /api/games/{gameId}/actions
```

リクエストボディ：

```ts
type ActionType = 'scan' | 'breach' | 'dataExtract' | 'pause' | 'resume';

interface ActionRequest {
  type: ActionType;
  nodeId?: string;   // pause / resume / recover では不要
  passcode?: string; // 最終目標ノード侵入時の暗号キー入力（任意）
}
```

レスポンス（操作の受理可否のみを即答し、実際の効果は WebSocket で後から届く想定）：

```ts
interface ActionResult {
  accepted: boolean;
  reason?: string; // 却下理由（資源不足・権限不足・対象ノード不正 等）
}
```

却下理由の例：`insufficient_resource` / `insufficient_privilege` / `node_not_scanned` / `node_unreachable` / `invalid_passcode` / `invalid_state`

## 4. サーバー → クライアント push（WebSocket）※未実装・v0.4でターン制に決定したため当面使わない想定

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
  reset(): Promise<void>;
  disconnect(): void;
}
```

- `HttpGameClient`（`frontend/src/game/client/httpGameClient.ts`）：REST(8節のAPI)でバックエンドと通信する本番用の実装。作成したゲームの `gameId` を `localStorage` に保存し、リロード後も同じゲームを続ける（保存済みのゲームが404なら新規作成）。
- 保存キーは`nullroute.gameId.<stageId>`でステージ別。旧`nullroute.gameId`は実際のstageIdを確認して移行し、新しい保存先がある場合は上書きしない。ミッション選択で別ステージのゲームをリセットしない。選択したstageIdと異なる応答はロードしない。
- `MockGameClient`：バックエンドに接続できないときに `useGameClient` が自動で切り替えるブラウザ内のダミー実装。ルールは `backend/game_logic.py` に合わせてあるので、ルールを変えたら両方を更新すること。

## 7. まだ決まっていないこと

以下は未確定（チームで決め次第 v0.5 として更新）。

- ~~操作が時間をかけて進行するか、即時実行のままか~~ → **v0.4で「ターン制(即時確定)」に決定済み**
- **コスト数値**：`/api/scan`は資源10固定、フロントの`balanceConfig.scan.resource`は1。どちらかに揃える、またはバランス設定を共有の1箇所にまとめる
- **成功/失敗のレスポンス形式**：`/api/scan`は`{error: string}` + HTTP200、3.2節の提案は`{accepted: boolean, reason?: string}`。どちらかに統一する
- リクエストのプロパティ命名規則（`node_id`のスネークケース vs `nodeId`のキャメルケース）をどちらかに揃える
- ノードごとの侵入必要権限の持たせ方：`NodeMaster` に専用カラムを足すか、`layer` から機械的に算出するかが未定（今のモック実装は暫定でlayer由来にしている）
- `current_privilege` の値の一覧（"GUEST"以外に何があるか、順序も含めて）
- `/api/network` に `vulnerability` を含めるか、別エンドポイントにするか
- 同一ノードへの多重スキャン防止（フロントのモックにはあるが、`/api/scan`にはまだ無い）
- 侵入・データ回収に相当するエンドポイント、プレイヤー状態取得、リアルタイム更新のAPI（4節はまだ提案段階で、backendには未実装）
- 警戒度が100に達した時の挙動（即ゲームオーバーか、ペナルティか）
- ステージ切り替え・難易度の持たせ方（`gameId` がステージも表すのか等、現状は1デプロイ=1プレイヤー固定）
- セーブ/ロードのAPI（ロード時に `elapsedSeconds` をどう扱うか）
- 認証（ユーザー識別が必要か）


## 8. backend 実装済み API（REST版・リアルタイム化前）

3節の提案をもとに、まず REST だけでゲームが最後まで遊べる形で実装した（`backend/main.py` / `backend/game_logic.py`）。
WebSocket（4節）は未実装のため、現状は **アクションの結果が即時に確定** し、レスポンスに操作後の `GameState` がそのまま入る。

| メソッド | パス | 内容 |
|---|---|---|
| POST | `/api/games` | 新しいゲームを作成し、初期 `GameState` を返す |
| GET | `/api/games/{gameId}` | 現在の `GameState` を返す（存在しなければ 404） |
| POST | `/api/games/{gameId}/reset` | 指定ゲームを初期状態にリセットし、初期 `GameState` を返す |
| POST | `/api/games/{gameId}/actions` | `ActionRequest` を実行。`{ accepted, reason?, state: GameState }` を返す |
| GET | `/api/network` | 旧API（互換用）。既定ゲームのノード・エッジ |
| POST | `/api/scan` | 旧API（互換用）。既定ゲームでスキャン |

- `gameId` は `player_status.id`（文字列で返す）。
- `GameState.nodes` は 2.1 の `ApiNetworkNode` 形式。`data.vulnerability` を追加（未スキャン時は `null`）。
- 却下理由に **`node_unreachable`** を追加（隣接ノードを侵入済みにしていないのに breach しようとした）。フロントの `ActionRejectReason` にも追加が必要。

### ゲームルール（暫定・`balance_config.py` で調整）

- **初期入口**：ステージ1はE01のみ、訓練はexternal-1のみ（`entry_node_ids`）。最初の侵入前は入口以外へのscan/remoteScan/breachを`node_unreachable`で却下する。
- **scan**：`unscanned` かつ指定入口、または侵入済みノードの隣接先のみ。完了で `scanned`、`info` と `vulnerability` が開示される。**remoteScan** は入口の侵入後に限り、隣接条件なしで現在のステージの未スキャンノードを調べられる。
- **breach**：`scanned` であること／指定入口以外は隣接ノードのどれかが `hacked` であること／権限が layer の要求以上であること（External=GUEST, DMZ=USER, Internal=ADMIN, Core=ROOT）。成功で `hacked`、権限が「侵入した layer の1段上」まで昇格。E02/E03も入口の例外にはならない。
- **dataExtract**：`hacked` 状態の**最終目標ノード**のみ（`game_data.TARGET_NODE_IDS`。空ならCore層すべて）。それ以外のノードは `invalid_state`。成功で `status = 'won'`。
- **暗号鍵の断片**：`game_data.KEY_FRAGMENT_NODE_IDS` のノードをすべて `hacked` にしてから dataExtract すると、回収時の警戒度上昇が 0 になる。
- **ノードの特殊効果**：`game_data.NODE_EFFECTS` に登録されたノードは、breach 成功時に解析資源の増減・警戒度の増減・追加ログが発生する。
- **pause / resume**：`playing` ⇔ `paused`。`playing` 以外ではアクションは `invalid_state` で却下。
- 各アクションは `time` 秒ぶんゲーム内時間を進め、警戒度を `alertDelta - 減衰×time` だけ変化させる。ターン制で、待機では変化しない。
- **recover**：侵入済みノードがあり、資源が上限未満ならノード選択なしで回復できる。資源0でも実行可能。
- データ回収を含む全時間消費アクションで警戒度が100に達すると `status = 'lost'`。資源・時間は消費し、検知をノード攻略効果・勝利より優先する。却下ではなく`accepted: true`で敗北状態を返し、評価はnull、成功ログは出ない。鍵の回収軽減は警戒度加算前に適用する。検知されず、勝利もせず、回復を含む操作が残っていない場合も敗北する。
- ノード・エッジのマスターデータは `backend/game_data.py`。起動時に `node_master` テーブルへ同期される。
- フロントの Mock とデータ回収ボタンの判定は、`game_data.py`・`balance_config.py` から生成した `frontend/src/game/data/stageData.ts` を使う。**ステージ・ギミック・初期資源・操作コストを変えたら `python scripts/gen_stage_data.py` を実行して stageData.ts も更新すること**（目標ノードは `GameState` に含まれていないため、フロントはこのファイルで判定している）。フロントの `balanceConfig.ts` も生成値を読むだけ。生成し忘れはCIの `stage-data` ジョブで検出される。

### 古いゲームの自動削除（backend）

- `player_status.last_accessed_at` に最終アクセス時刻を記録する（`GET/POST /api/games/{gameId}...` を呼ぶたびに更新）。
- **7日間（`balance_config.STALE_GAME_DAYS`）だれも触らなかったゲームは削除**する。実行タイミングは、サーバー起動時と `POST /api/games` で新規作成するとき。
- 旧API（`/api/network`・`/api/scan`）が使う「最初のゲーム」（最小の `gameId`）は、古くても消さない。
- 削除されたゲームの `gameId` にアクセスすると 404 になる。フロントは 404 のとき新規作成に進む（`HttpGameClient` で実装済み）。
- 起動時に、`game_data.py` に存在しないノード（ステージ差し替え前の古いノード）も DB から削除する。

### バックエンドのテスト

```
cd backend
pip install -r requirements-dev.txt
pytest
```

- テストは使い捨てのSQLiteで動くため、PostgreSQL や `docker compose` は不要。
- ノードIDは直書きせず `game_data.py` から計算しているので、ステージのデータを差し替えてもテストは壊れない。
- 「初期の解析資源だけで最短経路をクリアできる」ことも検査している（バランス調整で資源やコストを変えて、クリア不能になるとここで失敗する）。
- GitHub Actions の `backend` ジョブでも `pytest` を実行する。


### クリア時の作戦評価と複数ステージ対応（backend）

- **ステージ一覧取得**: `GET /api/stages` → `{ stages: [{ id, name, difficulty, nodeCount }] }`
  - `stageId = 0`: `TRAINING: 基礎侵入訓練`（チュートリアル5ノード）
  - `stageId = 1`: `OPERATION SILENT TRACE: 消えた機密データ`（本編24ノード・既定）
    - `stageId = 2`: `偽装された通信記録`（16ノード・21接続、入口S2-E01、目標S2-C03）
    - 初期資源25・上限30・共通コスト。静的な補給・警戒度低減は有効。
    - S2-I07未攻略中、S2-I01・S2-C01・S2-C03の侵入に追加警戒度+12%。スキャン・回収には加算しない。追加分と自然減衰を含む判定で100%に到達すると、侵入完了・ノード効果より先に敗北する。
    - S2-C02の侵入にはS2-I04攻略、S2-C04にはS2-I07攻略が必要。未解除の侵入は`accepted: false, reason: "node_locked"`。資源・時間・警戒度・ログは変更しない。スキャンの既存条件は変更しない。
    - 監視解除・ゲート解除は既存`log`に記録する。監視・ゲートのための`GameState`追加項目やDB構造変更はない。UIはノード攻略状態から現在の監視・ロック状態を導出する。
    - 生成設定は`conditionalBreachAlert`（解除ノード・対象・追加値）と`breachRequirements`（ゲートごとの前提ノード一覧）。旧`plannedMechanics`は置換。ステージ0・1はそれぞれnullと空マップで無効。
- **ステージ指定作成 / 切り替え**:
  - `POST /api/games` に `{"stageId": 0}` などを渡すと指定ステージで作成（ボディ省略時は `stageId = 1`）。
  - `POST /api/games/{gameId}/reset` に `{"stageId": 0}` などを渡すと指定ステージに切り替えてリセット。
  - この明示的なreset APIは同じgameIdの内容を置き換える。通常のミッション選択ではこれを別ステージへ呼ばず、ステージごとに新規作成/再開し、他の進行を保持する。
  - `GameState` に `stageId: number` を追加。
- **クリア時の作戦評価（`GameState.evaluation`）**:
  - クリア（`status === "won"`）時、`evaluation: { rank: "S" | "A" | "B" | "C" | "D", score: number, title: string }` が返り、イベントログ・Mock・リザルトにも同じ評価を使う（未クリア時は `null`）。
  - 係数・閾値は`backend/balance_config.py`の`EVALUATION_CONFIG`で管理し、生成スクリプトでフロントに同期する。
  - 得点 = max(0, floor(1000 − max(0, 経過秒−240)×0.5 − 警戒度×5 ＋ min(10, 残資源)×10 ＋ 0.5))。警戒度はGameStateと同じ小数2桁を使用。900以上S、750以上A、550以上B、350以上C、それ未満D。警戒度だけによる別の昇格条件は廃止。

### Merge integration: scan and recovery rules

- Normal scan requires a designated entry node or a hacked neighbor. Before the first breach, remote scan is also restricted to the entry. After a foothold is established, remote scan can reveal any unscanned node in the current stage.
- recover needs no nodeId, requires a hacked node and resource below MAX_ANALYSIS_RESOURCE. It restores RESOURCE_RECOVERY_AMOUNT up to the cap, consumes 30 game seconds and adds 12 alert before natural decay.
- Resource exhaustion causes defeat only when no legal action remains, including recovery. A hacked node therefore allows recovery even at zero resource. Alert reaching 100 still causes defeat.
- NODE_EFFECTS takes precedence over RESOURCE_REWARDS for the same node; supply is not counted twice and is capped at MAX_ANALYSIS_RESOURCE.
