// このファイルは scripts/gen_stage_data.py で backend/game_data.py・balance_config.py から生成している。
// 手で編集せず、バックエンド側を変えたらスクリプトを実行し直すこと。
import type { ApiNetworkEdge, NetworkNode } from '../model/types';

export const INITIAL_ANALYSIS_RESOURCE = 40;

export const STAGE_NODES: NetworkNode[] = [
  { id: 'E01', layer: 'External', name: '公開ゲートウェイ', position: { x: 550, y: 80 }, status: 'unscanned', info: 'ステージの初期侵入口。外部ネットワークへの接続点。', vulnerability: null },
  { id: 'E02', layer: 'External', name: 'DNS情報サーバー', position: { x: 300, y: 270 }, status: 'unscanned', info: '内部の接続先に関する手がかりが残っている。', vulnerability: null },
  { id: 'E03', layer: 'External', name: '公開情報アーカイブ', position: { x: 800, y: 270 }, status: 'unscanned', info: '過去の公開情報が保管されている。解析資源の補給候補。', vulnerability: null },
  { id: 'D01', layer: 'DMZ', name: 'Webサーバー', position: { x: 180, y: 550 }, status: 'unscanned', info: '高速侵入ルートの入口。', vulnerability: null },
  { id: 'D02', layer: 'DMZ', name: 'メールサーバー', position: { x: 450, y: 550 }, status: 'unscanned', info: '認証情報を収集するための入口。', vulnerability: null },
  { id: 'D03', layer: 'DMZ', name: 'VPNゲートウェイ', position: { x: 720, y: 550 }, status: 'unscanned', info: '隠密ルートへの接続点。', vulnerability: null },
  { id: 'D04', layer: 'DMZ', name: 'Web管理サーバー', position: { x: 180, y: 820 }, status: 'unscanned', info: '開発環境への侵入に役立つ管理情報がある。', vulnerability: null },
  { id: 'D05', layer: 'DMZ', name: '認証キャッシュ', position: { x: 450, y: 820 }, status: 'unscanned', info: 'VPN認証情報が残されている。', vulnerability: null },
  { id: 'D06', layer: 'DMZ', name: 'プロキシサーバー', position: { x: 720, y: 820 }, status: 'unscanned', info: '通信の追跡を妨害できる可能性がある。', vulnerability: null },
  { id: 'D07', layer: 'DMZ', name: 'DMZ監視装置', position: { x: 990, y: 820 }, status: 'unscanned', info: 'ARGUSの監視条件を調査できる。', vulnerability: null },
  { id: 'I01', layer: 'Internal', name: '社内認証サーバー', position: { x: 180, y: 1150 }, status: 'unscanned', info: '管理者トークンの取得候補。', vulnerability: null },
  { id: 'I02', layer: 'Internal', name: '開発環境サーバー', position: { x: 450, y: 1150 }, status: 'unscanned', info: '内部ルーターへの侵入経路。', vulnerability: null },
  { id: 'I03', layer: 'Internal', name: 'ログ管理サーバー', position: { x: 720, y: 1150 }, status: 'unscanned', info: '侵入の痕跡を削減できる可能性がある。', vulnerability: null },
  { id: 'I04', layer: 'Internal', name: 'ARGUS監視制御', position: { x: 990, y: 1150 }, status: 'unscanned', info: '監視AIの防衛機能を妨害するための重要ノード。', vulnerability: null },
  { id: 'I05', layer: 'Internal', name: 'バックアップサーバー', position: { x: 990, y: 1450 }, status: 'unscanned', info: '解析資源を補給できる候補。', vulnerability: null },
  { id: 'I06', layer: 'Internal', name: '社内ファイルサーバー', position: { x: 180, y: 1450 }, status: 'unscanned', info: '暗号鍵の断片Aが保管されている。', vulnerability: null },
  { id: 'I07', layer: 'Internal', name: '管理端末', position: { x: 450, y: 1450 }, status: 'unscanned', info: '暗号鍵の断片Bが保管されている。', vulnerability: null },
  { id: 'I08', layer: 'Internal', name: '内部ルーター', position: { x: 720, y: 1450 }, status: 'unscanned', info: 'Coreネットワークへの主要接続点。', vulnerability: null },
  { id: 'I09', layer: 'Internal', name: 'セキュリティ管理サーバー', position: { x: 720, y: 1750 }, status: 'unscanned', info: 'Coreファイアウォールの防御を弱められる。', vulnerability: null },
  { id: 'I10', layer: 'Internal', name: '研究部門サーバー', position: { x: 990, y: 1750 }, status: 'unscanned', info: '研究データの位置情報が残っている。', vulnerability: null },
  { id: 'C01', layer: 'Core', name: 'Coreファイアウォール', position: { x: 300, y: 2100 }, status: 'unscanned', info: '機密領域を守る主要防衛装置。', vulnerability: null },
  { id: 'C02', layer: 'Core', name: '暗号認証サーバー', position: { x: 550, y: 2350 }, status: 'unscanned', info: '研究データの回収に必要な認証を管理する。', vulnerability: null },
  { id: 'C03', layer: 'Core', name: '研究データベース', position: { x: 550, y: 2650 }, status: 'unscanned', info: 'ステージの最終目標。極秘研究データが存在する。', vulnerability: null },
  { id: 'C04', layer: 'Core', name: '緊急防衛システム', position: { x: 850, y: 2100 }, status: 'unscanned', info: '高警戒時に起動するARGUSの防衛装置。', vulnerability: null },
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
  { id: 'e14', source: 'D04', target: 'I04', animated: true },
  { id: 'e15', source: 'D05', target: 'I01', animated: true },
  { id: 'e16', source: 'D05', target: 'I06', animated: true },
  { id: 'e17', source: 'D06', target: 'I03', animated: true },
  { id: 'e18', source: 'D06', target: 'I05', animated: true },
  { id: 'e19', source: 'D07', target: 'I04', animated: true },
  { id: 'e20', source: 'I01', target: 'I07', animated: true },
  { id: 'e21', source: 'I01', target: 'I08', animated: true },
  { id: 'e22', source: 'I02', target: 'I08', animated: true },
  { id: 'e23', source: 'I02', target: 'I10', animated: true },
  { id: 'e24', source: 'I03', target: 'I04', animated: true },
  { id: 'e25', source: 'I03', target: 'I05', animated: true },
  { id: 'e26', source: 'I04', target: 'I09', animated: true },
  { id: 'e27', source: 'I05', target: 'I06', animated: true },
  { id: 'e28', source: 'I06', target: 'I07', animated: true },
  { id: 'e29', source: 'I06', target: 'I10', animated: true },
  { id: 'e30', source: 'I07', target: 'I09', animated: true },
  { id: 'e31', source: 'I08', target: 'I09', animated: true },
  { id: 'e32', source: 'I08', target: 'C01', animated: true },
  { id: 'e33', source: 'I09', target: 'C01', animated: true },
  { id: 'e34', source: 'I09', target: 'C04', animated: true },
  { id: 'e35', source: 'I10', target: 'C02', animated: true },
  { id: 'e36', source: 'C01', target: 'C02', animated: true },
  { id: 'e37', source: 'C01', target: 'C04', animated: true },
  { id: 'e38', source: 'C02', target: 'C03', animated: true },
  { id: 'e39', source: 'C04', target: 'C03', animated: true },
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

// すべて侵入済みにしてから最終目標でデータ回収すると、回収時の警戒度上昇が0になる。
export const KEY_FRAGMENT_NODE_IDS: string[] = ['I06', 'I07'];

export interface NodeEffect {
  resourceBonus: number;
  alertDelta: number;
  log: string;
}

// 侵入(breach)成功時に発動する特殊効果。
export const NODE_EFFECTS: Record<string, NodeEffect> = {
  'E03': { resourceBonus: 5, alertDelta: 0, log: '公開情報アーカイブから解析ツールを回収。解析資源が +5 補給されました。' },
  'D06': { resourceBonus: 0, alertDelta: -8, log: 'プロキシサーバーで通信経路を偽装。警戒度が低下しました。' },
  'I03': { resourceBonus: 0, alertDelta: -15, log: 'ログ管理サーバーの監査ログを改ざんし、侵入痕跡を削減しました（警戒度 -15%）。' },
  'I04': { resourceBonus: 0, alertDelta: -20, log: 'ARGUS監視制御を妨害！監視AIの警戒レベルを大幅に引き下げました（警戒度 -20%）。' },
  'I05': { resourceBonus: 6, alertDelta: 0, log: 'バックアップ領域から予備の計算リソースを確保。解析資源が +6 補給されました。' },
  'I06': { resourceBonus: 0, alertDelta: 0, log: '【重要】社内ファイルサーバーから「暗号鍵の断片A」を入手しました。' },
  'I07': { resourceBonus: 0, alertDelta: 0, log: '【重要】管理端末から「暗号鍵の断片B」を入手しました。' },
  'I09': { resourceBonus: 3, alertDelta: -10, log: 'セキュリティ管理サーバーを掌握。Core領域の防衛設定を弱体化させました（資源 +3 / 警戒度 -10%）。' },
  'C04': { resourceBonus: 0, alertDelta: -15, log: '緊急防衛システムを無効化！ARGUSの緊急遮断プロトコルを停止しました（警戒度 -15%）。' },
};

export function isExtractTarget(node: Pick<NetworkNode, 'id' | 'layer'>): boolean {
  return TARGET_NODE_IDS.length === 0 ? node.layer === 'Core' : TARGET_NODE_IDS.includes(node.id);
}
