// このファイルは scripts/gen_stage_data.py で backend/game_data.py・balance_config.py から生成している。
// 手で編集せず、バックエンド側を変えたらスクリプトを実行し直すこと。
import type { ActionCost, ApiNetworkEdge, NetworkNode } from '../model/types';

// 各操作のコスト(time: 経過秒数, resource: 消費する解析資源, alertDelta: 警戒度の上昇)。
export const ACTION_COSTS = {
  scan: { time: 10, resource: 1, alertDelta: 2 },
  remoteScan: { time: 25, resource: 4, alertDelta: 8 },
  breach: { time: 20, resource: 2, alertDelta: 5 },
  dataExtract: { time: 15, resource: 3, alertDelta: 10 },
  recover: { time: 30, resource: 0, alertDelta: 12 },
} satisfies Record<string, ActionCost>;
export const ALERT_DECAY_PER_SECOND = 0.05;

export const EVALUATION_CONFIG = {
  "baseScore": 1000,
  "timeGraceSeconds": 240,
  "timePenaltyPerSecond": 0.5,
  "alertPenaltyPerPoint": 5,
  "resourceBonusPerPoint": 10,
  "resourceBonusCap": 10,
  "thresholds": [
    {
      "rank": "S",
      "minimum": 900,
      "title": "完璧な隠密作戦 (GHOST OPERATIVE)"
    },
    {
      "rank": "A",
      "minimum": 750,
      "title": "優秀な侵入工作 (SHADOW AGENT)"
    },
    {
      "rank": "B",
      "minimum": 550,
      "title": "作戦目標達成 (FIELD OPERATIVE)"
    },
    {
      "rank": "C",
      "minimum": 350,
      "title": "強行突破による生還 (LOUD BREACHER)"
    },
    {
      "rank": "D",
      "minimum": 0,
      "title": "作戦完遂・改善の余地あり (SURVIVOR)"
    }
  ]
} as const;

export const INITIAL_ANALYSIS_RESOURCE = 25;
export const MAX_ANALYSIS_RESOURCE = 30;
export const RESOURCE_RECOVERY_AMOUNT = 5;
export const RECOVERY_COST = { time: 30, alertDelta: 12 };
export const RESOURCE_REWARDS: Record<string, number> = {"E03": 5, "I05": 10};
export const ENTRY_LAYERS: string[] = ['External'];
export const DEFAULT_STAGE_ID = 1;

export const STAGE_NODES: NetworkNode[] = [
  { id: 'E01', layer: 'External', name: '公開ゲートウェイ', position: { x: 600, y: 100 }, status: 'unscanned', info: 'ステージ1の唯一の初期侵入口。E01をスキャンして侵入すると、他のノードを探索できる。', vulnerability: null },
  { id: 'E02', layer: 'External', name: 'DNS情報サーバー', position: { x: 300, y: 330 }, status: 'unscanned', info: '内部の接続先に関する手がかりが残っている。', vulnerability: null },
  { id: 'E03', layer: 'External', name: '公開情報アーカイブ', position: { x: 900, y: 330 }, status: 'unscanned', info: '過去の公開情報が保管されている。解析資源の補給候補。', vulnerability: null },
  { id: 'D01', layer: 'DMZ', name: 'Webサーバー', position: { x: 150, y: 600 }, status: 'unscanned', info: '高速侵入ルートの入口。', vulnerability: null },
  { id: 'D02', layer: 'DMZ', name: 'メールサーバー', position: { x: 500, y: 700 }, status: 'unscanned', info: '認証情報を収集するための入口。', vulnerability: null },
  { id: 'D03', layer: 'DMZ', name: 'VPNゲートウェイ', position: { x: 850, y: 600 }, status: 'unscanned', info: '隠密ルートへの接続点。', vulnerability: null },
  { id: 'D04', layer: 'DMZ', name: 'Web管理サーバー', position: { x: 100, y: 1000 }, status: 'unscanned', info: '開発環境への侵入に役立つ管理情報がある。', vulnerability: null },
  { id: 'D05', layer: 'DMZ', name: '認証キャッシュ', position: { x: 450, y: 1100 }, status: 'unscanned', info: 'VPN認証情報が残されている。', vulnerability: null },
  { id: 'D06', layer: 'DMZ', name: 'プロキシサーバー', position: { x: 900, y: 1000 }, status: 'unscanned', info: '通信の追跡を妨害できる可能性がある。', vulnerability: null },
  { id: 'D07', layer: 'DMZ', name: 'DMZ監視装置', position: { x: 1200, y: 1150 }, status: 'unscanned', info: 'ログ管理サーバーI03への迂回接続。痕跡削減ルートに進める。', vulnerability: null },
  { id: 'I01', layer: 'Internal', name: '社内認証サーバー', position: { x: 150, y: 1450 }, status: 'unscanned', info: '管理者トークンの取得候補。', vulnerability: null },
  { id: 'I02', layer: 'Internal', name: '開発環境サーバー', position: { x: 500, y: 1350 }, status: 'unscanned', info: '内部ルーターへの侵入経路。', vulnerability: null },
  { id: 'I03', layer: 'Internal', name: 'ログ管理サーバー', position: { x: 850, y: 1450 }, status: 'unscanned', info: '侵入の痕跡を削減できる可能性がある。', vulnerability: null },
  { id: 'I04', layer: 'Internal', name: 'ARGUS監視制御', position: { x: 1200, y: 1400 }, status: 'unscanned', info: '初回侵入で警戒度-20%。I03から回り込む安全ルートの重要ノード。効果は一度だけ。', vulnerability: null },
  { id: 'I05', layer: 'Internal', name: 'バックアップサーバー', position: { x: 1100, y: 1850 }, status: 'unscanned', info: '資源回収ルートの補給拠点。初回侵入で解析資源+10（上限30）。時間を使って後半の探索余力を確保できる。', vulnerability: null },
  { id: 'I06', layer: 'Internal', name: '社内ファイルサーバー', position: { x: 150, y: 1800 }, status: 'unscanned', info: '暗号鍵の断片Aが保管されている。', vulnerability: null },
  { id: 'I07', layer: 'Internal', name: '管理端末', position: { x: 450, y: 1900 }, status: 'unscanned', info: '暗号鍵の断片Bが保管されている。', vulnerability: null },
  { id: 'I08', layer: 'Internal', name: '内部ルーター', position: { x: 750, y: 1800 }, status: 'unscanned', info: 'Coreネットワークへの主要接続点。', vulnerability: null },
  { id: 'I09', layer: 'Internal', name: 'セキュリティ管理サーバー', position: { x: 850, y: 2200 }, status: 'unscanned', info: 'Coreファイアウォールの防御を弱められる。', vulnerability: null },
  { id: 'I10', layer: 'Internal', name: '研究部門サーバー', position: { x: 1200, y: 2150 }, status: 'unscanned', info: '研究データへの最短接続点。補給はないため、残資源を確認してCoreへ進むこと。', vulnerability: null },
  { id: 'C01', layer: 'Core', name: 'Coreファイアウォール', position: { x: 550, y: 2550 }, status: 'unscanned', info: '機密領域を守る主要防衛装置。', vulnerability: null },
  { id: 'C02', layer: 'Core', name: '暗号認証サーバー', position: { x: 700, y: 2900 }, status: 'unscanned', info: '研究データの回収に必要な認証を管理する。', vulnerability: null },
  { id: 'C03', layer: 'Core', name: '研究データベース', position: { x: 700, y: 3250 }, status: 'unscanned', info: 'ステージの最終目標。極秘研究データが存在する。', vulnerability: null },
  { id: 'C04', layer: 'Core', name: '緊急防衛システム', position: { x: 1050, y: 2600 }, status: 'unscanned', info: '高警戒時に起動するARGUSの防衛装置。', vulnerability: null },
];

export const STAGE_EDGES: ApiNetworkEdge[] = [
  { id: 'e1', source: 'E01', target: 'E02', animated: true },
  { id: 'e2', source: 'E01', target: 'E03', animated: true },
  { id: 'e3', source: 'E01', target: 'D01', animated: true },
  { id: 'e4', source: 'E01', target: 'D02', animated: true },
  { id: 'e5', source: 'E02', target: 'D03', animated: true },
  { id: 'e6', source: 'E03', target: 'D06', animated: true },
  { id: 'e7', source: 'D01', target: 'D04', animated: true },
  { id: 'e8', source: 'D01', target: 'D07', animated: true },
  { id: 'e9', source: 'D02', target: 'D05', animated: true },
  { id: 'e10', source: 'D02', target: 'D07', animated: true },
  { id: 'e11', source: 'D03', target: 'D06', animated: true },
  { id: 'e12', source: 'D03', target: 'I03', animated: true },
  { id: 'e13', source: 'D04', target: 'I02', animated: true },
  { id: 'e14', source: 'D05', target: 'I01', animated: true },
  { id: 'e15', source: 'D05', target: 'I06', animated: true },
  { id: 'e16', source: 'D06', target: 'I03', animated: true },
  { id: 'e17', source: 'D06', target: 'I05', animated: true },
  { id: 'e18', source: 'D07', target: 'I03', animated: true },
  { id: 'e19', source: 'I01', target: 'I07', animated: true },
  { id: 'e20', source: 'I01', target: 'I08', animated: true },
  { id: 'e21', source: 'I02', target: 'I08', animated: true },
  { id: 'e22', source: 'I02', target: 'I10', animated: true },
  { id: 'e23', source: 'I03', target: 'I04', animated: true },
  { id: 'e24', source: 'I03', target: 'I05', animated: true },
  { id: 'e25', source: 'I04', target: 'I09', animated: true },
  { id: 'e26', source: 'I05', target: 'I06', animated: true },
  { id: 'e27', source: 'I06', target: 'I07', animated: true },
  { id: 'e28', source: 'I06', target: 'I10', animated: true },
  { id: 'e29', source: 'I07', target: 'I09', animated: true },
  { id: 'e30', source: 'I08', target: 'I09', animated: true },
  { id: 'e31', source: 'I08', target: 'C01', animated: true },
  { id: 'e32', source: 'I09', target: 'C01', animated: true },
  { id: 'e33', source: 'I09', target: 'C04', animated: true },
  { id: 'e34', source: 'I10', target: 'C02', animated: true },
  { id: 'e35', source: 'C01', target: 'C02', animated: true },
  { id: 'e36', source: 'C01', target: 'C04', animated: true },
  { id: 'e37', source: 'C02', target: 'C03', animated: true },
  { id: 'e38', source: 'C04', target: 'C03', animated: true },
];

// 脆弱性はスキャンするまで伏せておき、スキャン完了時に開示する。
export const STAGE_VULNERABILITIES: Record<string, string> = {
  'E01': '弱いSSHパスワード',
  'E02': 'DNS設定情報の漏洩',
  'E03': '古い公開ファイルのアクセス制御不備',
  'D01': '古いWebサーバーの設定不備',
  'D02': 'メール認証設定の不備',
  'D03': '古いVPN認証方式',
  'D04': '管理画面のアクセス制御不備',
  'D05': '認証情報の不適切な保存',
  'D06': 'プロキシ設定の不備',
  'D07': '監視システムの設定不備',
  'I01': '認証権限の設定ミス',
  'I02': '開発用サービスの保護不足',
  'I03': 'ログ管理権限の不備',
  'I04': '監視制御APIの認証不備',
  'I05': 'バックアップ領域の権限不備',
  'I06': '共有フォルダの権限不備',
  'I07': '管理用資格情報の保存不備',
  'I08': 'ルーティング設定の不備',
  'I09': '防衛設定のアクセス制御不備',
  'I10': '研究用APIの認証不備',
  'C01': 'ファイアウォール管理設定の不備',
  'C02': '古い暗号認証設定',
  'C03': 'データベース権限設定の不備',
  'C04': '緊急制御機能の設定不備',
};

// データ回収でクリアになるノード。空のときはCore層のすべてのノードが対象。
export const TARGET_NODE_IDS: string[] = ['C03'];
export const ALL_TARGET_NODE_IDS: string[] = ['C03', 'S2-C03', 'core-1'];

// すべて侵入済みにしてから最終目標でデータ回収すると、回収時の警戒度上昇が0になる。
export const KEY_FRAGMENT_NODE_IDS: string[] = ['I06', 'I07'];

export interface NodeEffect {
  resourceBonus: number;
  alertDelta: number;
  log: string;
}

// 侵入(breach)成功時に発動する特殊効果。
export const NODE_EFFECTS: Record<string, NodeEffect> = {
  'E03': { resourceBonus: 0, alertDelta: 0, log: '公開情報アーカイブから解析ツールを回収。解析資源が +5 補給されました。' },
  'D06': { resourceBonus: 0, alertDelta: -8, log: 'プロキシサーバーで通信経路を偽装。警戒度が低下しました。' },
  'I03': { resourceBonus: 0, alertDelta: -15, log: 'ログ管理サーバーの監査ログを改ざんし、侵入痕跡を削減しました（警戒度 -15%）。' },
  'I04': { resourceBonus: 0, alertDelta: -20, log: 'ARGUS監視制御を妨害！監視AIの警戒レベルを大幅に引き下げました（警戒度 -20%）。' },
  'I05': { resourceBonus: 10, alertDelta: 0, log: 'バックアップ領域から予備の計算リソースを確保。解析資源を最大10補給します（上限30）。' },
  'I06': { resourceBonus: 0, alertDelta: 0, log: '【重要】社内ファイルサーバーから「暗号鍵の断片A」を入手しました。' },
  'I07': { resourceBonus: 0, alertDelta: 0, log: '【重要】管理端末から「暗号鍵の断片B」を入手しました。' },
  'I09': { resourceBonus: 3, alertDelta: -10, log: 'セキュリティ管理サーバーを掌握。Core領域の防衛設定を弱体化させました（資源 +3 / 警戒度 -10%）。' },
  'C04': { resourceBonus: 0, alertDelta: -15, log: '緊急防衛システムを無効化！ARGUSの緊急遮断プロトコルを停止しました（警戒度 -15%）。' },
};

export interface StageDefinition {
  id: number;
  name: string;
  difficulty: string;
  startMessage: string;
  prototypeNotice: string;
  conditionalBreachAlert: {
    disabledByNodeId: string; targetNodeIds: string[]; alertDelta: number;
  } | null;
  breachRequirements: Record<string, string[]>;
  nodes: NetworkNode[];
  edges: ApiNetworkEdge[];
  vulnerabilities: Record<string, string>;
  entryLayers: string[];
  entryNodeIds: string[];
  targetNodeIds: string[];
  keyFragmentNodeIds: string[];
  nodeEffects: Record<string, NodeEffect>;
}

export const STAGES: Record<number, StageDefinition> = {
  0: {
    id: 0,
    name: 'TRAINING: 基礎侵入訓練',
    difficulty: 'tutorial',
    startMessage: '',
    prototypeNotice: '',
    conditionalBreachAlert: null,
    breachRequirements: {},
    nodes: [
      { id: 'external-1', layer: 'External', name: 'External (公開サーバー)', position: { x: 600, y: 100 }, status: 'unscanned', info: '最初の侵入口。SSHポート(22)が開いている。', vulnerability: null },
      { id: 'dmz-1', layer: 'DMZ', name: 'DMZ (Webサーバー)', position: { x: 380, y: 340 }, status: 'unscanned', info: '古いバージョンのApacheが稼働中。', vulnerability: null },
      { id: 'dmz-2', layer: 'DMZ', name: 'DMZ (メールサーバー)', position: { x: 820, y: 340 }, status: 'unscanned', info: 'SMTPサーバー。社員のメールアドレスが漏洩している。', vulnerability: null },
      { id: 'internal-1', layer: 'Internal', name: 'Internal (社内網)', position: { x: 600, y: 580 }, status: 'unscanned', info: 'Active Directoryサーバー。アクセス権が厳重。', vulnerability: null },
      { id: 'core-1', layer: 'Core', name: 'Core (機密DB)', position: { x: 600, y: 820 }, status: 'unscanned', info: '目標データが存在。SQLインジェクションの痕跡あり。', vulnerability: null },
    ],
    edges: [
      { id: 'e1', source: 'external-1', target: 'dmz-1', animated: true },
      { id: 'e2', source: 'external-1', target: 'dmz-2', animated: true },
      { id: 'e3', source: 'dmz-1', target: 'internal-1', animated: true },
      { id: 'e4', source: 'dmz-2', target: 'internal-1', animated: true },
      { id: 'e5', source: 'internal-1', target: 'core-1', animated: true },
    ],
    vulnerabilities: {
      'external-1': '弱いSSHパスワード',
      'dmz-1': '古いApacheの既知の脆弱性',
      'dmz-2': '漏洩した社員アドレスへのフィッシング',
      'internal-1': 'Active Directoryの権限設定ミス',
      'core-1': 'SQLインジェクション',
    },
    entryLayers: ['External'],
    entryNodeIds: ['external-1'],
    targetNodeIds: ['core-1'],
    keyFragmentNodeIds: [],
    nodeEffects: {},
  },
  1: {
    id: 1,
    name: 'OPERATION SILENT TRACE: 消えた機密データ',
    difficulty: 'beginner',
    startMessage: '',
    prototypeNotice: '',
    conditionalBreachAlert: null,
    breachRequirements: {},
    nodes: [
      { id: 'E01', layer: 'External', name: '公開ゲートウェイ', position: { x: 600, y: 100 }, status: 'unscanned', info: 'ステージ1の唯一の初期侵入口。E01をスキャンして侵入すると、他のノードを探索できる。', vulnerability: null },
      { id: 'E02', layer: 'External', name: 'DNS情報サーバー', position: { x: 300, y: 330 }, status: 'unscanned', info: '内部の接続先に関する手がかりが残っている。', vulnerability: null },
      { id: 'E03', layer: 'External', name: '公開情報アーカイブ', position: { x: 900, y: 330 }, status: 'unscanned', info: '過去の公開情報が保管されている。解析資源の補給候補。', vulnerability: null },
      { id: 'D01', layer: 'DMZ', name: 'Webサーバー', position: { x: 150, y: 600 }, status: 'unscanned', info: '高速侵入ルートの入口。', vulnerability: null },
      { id: 'D02', layer: 'DMZ', name: 'メールサーバー', position: { x: 500, y: 700 }, status: 'unscanned', info: '認証情報を収集するための入口。', vulnerability: null },
      { id: 'D03', layer: 'DMZ', name: 'VPNゲートウェイ', position: { x: 850, y: 600 }, status: 'unscanned', info: '隠密ルートへの接続点。', vulnerability: null },
      { id: 'D04', layer: 'DMZ', name: 'Web管理サーバー', position: { x: 100, y: 1000 }, status: 'unscanned', info: '開発環境への侵入に役立つ管理情報がある。', vulnerability: null },
      { id: 'D05', layer: 'DMZ', name: '認証キャッシュ', position: { x: 450, y: 1100 }, status: 'unscanned', info: 'VPN認証情報が残されている。', vulnerability: null },
      { id: 'D06', layer: 'DMZ', name: 'プロキシサーバー', position: { x: 900, y: 1000 }, status: 'unscanned', info: '通信の追跡を妨害できる可能性がある。', vulnerability: null },
      { id: 'D07', layer: 'DMZ', name: 'DMZ監視装置', position: { x: 1200, y: 1150 }, status: 'unscanned', info: 'ログ管理サーバーI03への迂回接続。痕跡削減ルートに進める。', vulnerability: null },
      { id: 'I01', layer: 'Internal', name: '社内認証サーバー', position: { x: 150, y: 1450 }, status: 'unscanned', info: '管理者トークンの取得候補。', vulnerability: null },
      { id: 'I02', layer: 'Internal', name: '開発環境サーバー', position: { x: 500, y: 1350 }, status: 'unscanned', info: '内部ルーターへの侵入経路。', vulnerability: null },
      { id: 'I03', layer: 'Internal', name: 'ログ管理サーバー', position: { x: 850, y: 1450 }, status: 'unscanned', info: '侵入の痕跡を削減できる可能性がある。', vulnerability: null },
      { id: 'I04', layer: 'Internal', name: 'ARGUS監視制御', position: { x: 1200, y: 1400 }, status: 'unscanned', info: '初回侵入で警戒度-20%。I03から回り込む安全ルートの重要ノード。効果は一度だけ。', vulnerability: null },
      { id: 'I05', layer: 'Internal', name: 'バックアップサーバー', position: { x: 1100, y: 1850 }, status: 'unscanned', info: '資源回収ルートの補給拠点。初回侵入で解析資源+10（上限30）。時間を使って後半の探索余力を確保できる。', vulnerability: null },
      { id: 'I06', layer: 'Internal', name: '社内ファイルサーバー', position: { x: 150, y: 1800 }, status: 'unscanned', info: '暗号鍵の断片Aが保管されている。', vulnerability: null },
      { id: 'I07', layer: 'Internal', name: '管理端末', position: { x: 450, y: 1900 }, status: 'unscanned', info: '暗号鍵の断片Bが保管されている。', vulnerability: null },
      { id: 'I08', layer: 'Internal', name: '内部ルーター', position: { x: 750, y: 1800 }, status: 'unscanned', info: 'Coreネットワークへの主要接続点。', vulnerability: null },
      { id: 'I09', layer: 'Internal', name: 'セキュリティ管理サーバー', position: { x: 850, y: 2200 }, status: 'unscanned', info: 'Coreファイアウォールの防御を弱められる。', vulnerability: null },
      { id: 'I10', layer: 'Internal', name: '研究部門サーバー', position: { x: 1200, y: 2150 }, status: 'unscanned', info: '研究データへの最短接続点。補給はないため、残資源を確認してCoreへ進むこと。', vulnerability: null },
      { id: 'C01', layer: 'Core', name: 'Coreファイアウォール', position: { x: 550, y: 2550 }, status: 'unscanned', info: '機密領域を守る主要防衛装置。', vulnerability: null },
      { id: 'C02', layer: 'Core', name: '暗号認証サーバー', position: { x: 700, y: 2900 }, status: 'unscanned', info: '研究データの回収に必要な認証を管理する。', vulnerability: null },
      { id: 'C03', layer: 'Core', name: '研究データベース', position: { x: 700, y: 3250 }, status: 'unscanned', info: 'ステージの最終目標。極秘研究データが存在する。', vulnerability: null },
      { id: 'C04', layer: 'Core', name: '緊急防衛システム', position: { x: 1050, y: 2600 }, status: 'unscanned', info: '高警戒時に起動するARGUSの防衛装置。', vulnerability: null },
    ],
    edges: [
      { id: 'e1', source: 'E01', target: 'E02', animated: true },
      { id: 'e2', source: 'E01', target: 'E03', animated: true },
      { id: 'e3', source: 'E01', target: 'D01', animated: true },
      { id: 'e4', source: 'E01', target: 'D02', animated: true },
      { id: 'e5', source: 'E02', target: 'D03', animated: true },
      { id: 'e6', source: 'E03', target: 'D06', animated: true },
      { id: 'e7', source: 'D01', target: 'D04', animated: true },
      { id: 'e8', source: 'D01', target: 'D07', animated: true },
      { id: 'e9', source: 'D02', target: 'D05', animated: true },
      { id: 'e10', source: 'D02', target: 'D07', animated: true },
      { id: 'e11', source: 'D03', target: 'D06', animated: true },
      { id: 'e12', source: 'D03', target: 'I03', animated: true },
      { id: 'e13', source: 'D04', target: 'I02', animated: true },
      { id: 'e14', source: 'D05', target: 'I01', animated: true },
      { id: 'e15', source: 'D05', target: 'I06', animated: true },
      { id: 'e16', source: 'D06', target: 'I03', animated: true },
      { id: 'e17', source: 'D06', target: 'I05', animated: true },
      { id: 'e18', source: 'D07', target: 'I03', animated: true },
      { id: 'e19', source: 'I01', target: 'I07', animated: true },
      { id: 'e20', source: 'I01', target: 'I08', animated: true },
      { id: 'e21', source: 'I02', target: 'I08', animated: true },
      { id: 'e22', source: 'I02', target: 'I10', animated: true },
      { id: 'e23', source: 'I03', target: 'I04', animated: true },
      { id: 'e24', source: 'I03', target: 'I05', animated: true },
      { id: 'e25', source: 'I04', target: 'I09', animated: true },
      { id: 'e26', source: 'I05', target: 'I06', animated: true },
      { id: 'e27', source: 'I06', target: 'I07', animated: true },
      { id: 'e28', source: 'I06', target: 'I10', animated: true },
      { id: 'e29', source: 'I07', target: 'I09', animated: true },
      { id: 'e30', source: 'I08', target: 'I09', animated: true },
      { id: 'e31', source: 'I08', target: 'C01', animated: true },
      { id: 'e32', source: 'I09', target: 'C01', animated: true },
      { id: 'e33', source: 'I09', target: 'C04', animated: true },
      { id: 'e34', source: 'I10', target: 'C02', animated: true },
      { id: 'e35', source: 'C01', target: 'C02', animated: true },
      { id: 'e36', source: 'C01', target: 'C04', animated: true },
      { id: 'e37', source: 'C02', target: 'C03', animated: true },
      { id: 'e38', source: 'C04', target: 'C03', animated: true },
    ],
    vulnerabilities: {
      'E01': '弱いSSHパスワード',
      'E02': 'DNS設定情報の漏洩',
      'E03': '古い公開ファイルのアクセス制御不備',
      'D01': '古いWebサーバーの設定不備',
      'D02': 'メール認証設定の不備',
      'D03': '古いVPN認証方式',
      'D04': '管理画面のアクセス制御不備',
      'D05': '認証情報の不適切な保存',
      'D06': 'プロキシ設定の不備',
      'D07': '監視システムの設定不備',
      'I01': '認証権限の設定ミス',
      'I02': '開発用サービスの保護不足',
      'I03': 'ログ管理権限の不備',
      'I04': '監視制御APIの認証不備',
      'I05': 'バックアップ領域の権限不備',
      'I06': '共有フォルダの権限不備',
      'I07': '管理用資格情報の保存不備',
      'I08': 'ルーティング設定の不備',
      'I09': '防衛設定のアクセス制御不備',
      'I10': '研究用APIの認証不備',
      'C01': 'ファイアウォール管理設定の不備',
      'C02': '古い暗号認証設定',
      'C03': 'データベース権限設定の不備',
      'C04': '緊急制御機能の設定不備',
    },
    entryLayers: ['External'],
    entryNodeIds: ['E01'],
    targetNodeIds: ['C03'],
    keyFragmentNodeIds: ['I06', 'I07'],
    nodeEffects: {
      'E03': { resourceBonus: 0, alertDelta: 0, log: '公開情報アーカイブから解析ツールを回収。解析資源が +5 補給されました。' },
      'D06': { resourceBonus: 0, alertDelta: -8, log: 'プロキシサーバーで通信経路を偽装。警戒度が低下しました。' },
      'I03': { resourceBonus: 0, alertDelta: -15, log: 'ログ管理サーバーの監査ログを改ざんし、侵入痕跡を削減しました（警戒度 -15%）。' },
      'I04': { resourceBonus: 0, alertDelta: -20, log: 'ARGUS監視制御を妨害！監視AIの警戒レベルを大幅に引き下げました（警戒度 -20%）。' },
      'I05': { resourceBonus: 10, alertDelta: 0, log: 'バックアップ領域から予備の計算リソースを確保。解析資源を最大10補給します（上限30）。' },
      'I06': { resourceBonus: 0, alertDelta: 0, log: '【重要】社内ファイルサーバーから「暗号鍵の断片A」を入手しました。' },
      'I07': { resourceBonus: 0, alertDelta: 0, log: '【重要】管理端末から「暗号鍵の断片B」を入手しました。' },
      'I09': { resourceBonus: 3, alertDelta: -10, log: 'セキュリティ管理サーバーを掌握。Core領域の防衛設定を弱体化させました（資源 +3 / 警戒度 -10%）。' },
      'C04': { resourceBonus: 0, alertDelta: -15, log: '緊急防衛システムを無効化！ARGUSの緊急遮断プロトコルを停止しました（警戒度 -15%）。' },
    },
  },
  2: {
    id: 2,
    name: '偽装された通信記録',
    difficulty: 'intermediate-advanced',
    startMessage: 'S2-E01から侵入し、S2-C03で原本通信証跡を回収してください。S2-I07攻略までS2-I01・S2-C01・S2-C03の侵入警戒度は追加+12%。ゲートの前提条件も確認してください。',
    prototypeNotice: '',
    conditionalBreachAlert: {"disabledByNodeId": "S2-I07", "targetNodeIds": ["S2-I01", "S2-C01", "S2-C03"], "alertDelta": 12},
    breachRequirements: {"S2-C02": ["S2-I04"], "S2-C04": ["S2-I07"]},
    nodes: [
      { id: 'S2-E01', layer: 'External', name: '調査用中継点', position: { x: 600, y: 100 }, status: 'unscanned', info: '唯一の初期侵入口。スキャンして侵入後、接続先を調査する。目標はS2-C03。', vulnerability: null },
      { id: 'S2-D01', layer: 'DMZ', name: '公開通信リレー', position: { x: 250, y: 450 }, status: 'unscanned', info: '高速側への入口。監視対象への侵入はS2-I07攻略まで警戒度が追加で+12%。', vulnerability: null },
      { id: 'S2-D02', layer: 'DMZ', name: '認証窓口', position: { x: 1000, y: 450 }, status: 'unscanned', info: '管理プロキシ経由で補給・制御側へ進める。', vulnerability: null },
      { id: 'S2-D03', layer: 'DMZ', name: 'トラフィック集約装置', position: { x: 250, y: 800 }, status: 'unscanned', info: '監視対象はS2-I01・S2-C01・S2-C03。侵入時の警戒度+12%はS2-I07攻略で解除できる。', vulnerability: null },
      { id: 'S2-D04', layer: 'DMZ', name: '管理プロキシ', position: { x: 1000, y: 800 }, status: 'unscanned', info: '証明書管理サーバーと監査ログ中継への分岐。', vulnerability: null },
      { id: 'S2-I01', layer: 'Internal', name: '通信交換ハブ', position: { x: 350, y: 1200 }, status: 'unscanned', info: '途中で攻略方針を変更できる接続点。S2-I07未攻略なら侵入時に警戒度が追加で+12%。', vulnerability: null },
      { id: 'S2-I02', layer: 'Internal', name: '内部ルーター', position: { x: 350, y: 1900 }, status: 'unscanned', info: '直接転送・迂回ゲートと補給拠点へ接続する。', vulnerability: null },
      { id: 'S2-I03', layer: 'Internal', name: '予備解析基盤', position: { x: 1050, y: 2200 }, status: 'unscanned', info: '初回侵入で解析資源+7（上限30）。', vulnerability: null },
      { id: 'S2-I04', layer: 'Internal', name: '証明書管理サーバー', position: { x: 1100, y: 1200 }, status: 'unscanned', info: '攻略するとS2-C02の前提ロックが解除される。証明書は消費しない。証跡バックアップにも接続。', vulnerability: null },
      { id: 'S2-I05', layer: 'Internal', name: '監査ログ中継', position: { x: 700, y: 1400 }, status: 'unscanned', info: '初回侵入で警戒度-8%。', vulnerability: null },
      { id: 'S2-I06', layer: 'Internal', name: '証跡バックアップ', position: { x: 1250, y: 1750 }, status: 'unscanned', info: '初回侵入で解析資源+5（上限30）。', vulnerability: null },
      { id: 'S2-I07', layer: 'Internal', name: '監視制御端末', position: { x: 700, y: 1750 }, status: 'unscanned', info: '攻略で以後の監視追加+12%を解除し、S2-C04を解放。初回侵入で警戒度-15%、解析資源+5。', vulnerability: null },
      { id: 'S2-C01', layer: 'Core', name: '直接転送ゲート', position: { x: 150, y: 2600 }, status: 'unscanned', info: '原本通信証跡DBへの直接接続。前提ロックはないがS2-I07未攻略なら侵入の追加警戒度+12%。', vulnerability: null },
      { id: 'S2-C02', layer: 'Core', name: '証明書認証ゲート', position: { x: 1150, y: 2700 }, status: 'unscanned', info: '侵入にはS2-I04の攻略が必要。スキャンは通常の接続条件で可能。', vulnerability: null },
      { id: 'S2-C03', layer: 'Core', name: '原本通信証跡DB', position: { x: 650, y: 3200 }, status: 'unscanned', info: 'ステージ2の最終目標。侵入後のデータ回収で勝利。回収時も警戒度100%で敗北。', vulnerability: null },
      { id: 'S2-C04', layer: 'Core', name: '監視迂回ゲート', position: { x: 650, y: 2650 }, status: 'unscanned', info: '侵入にはS2-I07の攻略が必要。初回侵入で警戒度-10%。スキャンは通常の接続条件で可能。', vulnerability: null },
    ],
    edges: [
      { id: 'S2-e1', source: 'S2-E01', target: 'S2-D01' },
      { id: 'S2-e2', source: 'S2-E01', target: 'S2-D02' },
      { id: 'S2-e3', source: 'S2-D01', target: 'S2-D03' },
      { id: 'S2-e4', source: 'S2-D03', target: 'S2-I01' },
      { id: 'S2-e5', source: 'S2-I01', target: 'S2-I02' },
      { id: 'S2-e6', source: 'S2-I02', target: 'S2-C01' },
      { id: 'S2-e7', source: 'S2-C01', target: 'S2-C03' },
      { id: 'S2-e8', source: 'S2-D02', target: 'S2-D04' },
      { id: 'S2-e9', source: 'S2-D04', target: 'S2-I04' },
      { id: 'S2-e10', source: 'S2-D04', target: 'S2-I05' },
      { id: 'S2-e11', source: 'S2-I05', target: 'S2-I07' },
      { id: 'S2-e12', source: 'S2-I07', target: 'S2-I02' },
      { id: 'S2-e13', source: 'S2-I02', target: 'S2-C04' },
      { id: 'S2-e14', source: 'S2-C04', target: 'S2-C03' },
      { id: 'S2-e15', source: 'S2-I04', target: 'S2-I06' },
      { id: 'S2-e16', source: 'S2-I06', target: 'S2-I03' },
      { id: 'S2-e17', source: 'S2-I03', target: 'S2-C02' },
      { id: 'S2-e18', source: 'S2-C02', target: 'S2-C03' },
      { id: 'S2-e19', source: 'S2-I04', target: 'S2-I01' },
      { id: 'S2-e20', source: 'S2-I01', target: 'S2-I05' },
      { id: 'S2-e21', source: 'S2-I02', target: 'S2-I03' },
    ],
    vulnerabilities: {
      'S2-E01': '調査用アカウントの弱い認証',
      'S2-D01': '中継サービスの設定不備',
      'S2-D02': '認証窓口のアクセス制御不備',
      'S2-D03': '集約サービスの権限設定不備',
      'S2-D04': '管理プロキシの認証不備',
      'S2-I01': '交換ハブの管理権限不備',
      'S2-I02': '内部ルーティング設定の不備',
      'S2-I03': '解析基盤のアクセス制御不備',
      'S2-I04': '証明書管理APIの保護不足',
      'S2-I05': '監査ログ管理の権限不備',
      'S2-I06': 'バックアップ領域の設定不備',
      'S2-I07': '制御端末の認証不備',
      'S2-C01': '転送ゲートの権限設定不備',
      'S2-C02': '認証ゲートの設定不備',
      'S2-C03': '証跡DBの権限設定不備',
      'S2-C04': '迂回ゲートの管理設定不備',
    },
    entryLayers: ['External'],
    entryNodeIds: ['S2-E01'],
    targetNodeIds: ['S2-C03'],
    keyFragmentNodeIds: [],
    nodeEffects: {
      'S2-I03': { resourceBonus: 7, alertDelta: 0, log: '予備解析基盤から資源を最大7補給（上限30）。' },
      'S2-I06': { resourceBonus: 5, alertDelta: 0, log: '証跡バックアップから資源を最大5補給（上限30）。' },
      'S2-I05': { resourceBonus: 0, alertDelta: -8, log: '監査ログの痕跡を削減。警戒度-8%。' },
      'S2-I07': { resourceBonus: 5, alertDelta: -15, log: '解析ツールを最大5回収し、痕跡を削減（警戒度-15%）。' },
      'S2-C04': { resourceBonus: 0, alertDelta: -10, log: '迂回ゲートの痕跡を削減。警戒度-10%。' },
    },
  },
};

export function getStageData(stageId: number = DEFAULT_STAGE_ID): StageDefinition {
  return STAGES[stageId] ?? STAGES[DEFAULT_STAGE_ID];
}

export function isExtractTarget(node: Pick<NetworkNode, 'id' | 'layer'>, stageId?: number): boolean {
  if (stageId !== undefined) {
    const stageTargets = getStageData(stageId).targetNodeIds;
    return stageTargets.length === 0 ? node.layer === 'Core' : stageTargets.includes(node.id);
  }
  return ALL_TARGET_NODE_IDS.length === 0 ? node.layer === 'Core' : ALL_TARGET_NODE_IDS.includes(node.id);
}
