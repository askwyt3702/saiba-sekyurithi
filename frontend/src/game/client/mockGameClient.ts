import type {
  ActionRejectReason,
  ActionRequest,
  ActionResult,
  GameClient,
  GameState,
  NetworkLayer,
  NetworkNode,
  ServerEvent,
} from '../model/types';
import { balanceConfig } from '../data/balanceConfig';
import { createMockGameState } from '../data/mockGameState';
import { canReachNode, canRemoteScanNode, mechanicsUnlockMessages, missingGateRequirements, monitoringExtra } from '../model/actionRules';
import { calculateMissionResult } from '../model/missionResult';
import {
  DEFAULT_STAGE_ID,
  getStageData,
  isExtractTarget,
  MAX_ANALYSIS_RESOURCE,
  RESOURCE_RECOVERY_AMOUNT,
  RECOVERY_COST,
  RESOURCE_REWARDS,
} from '../data/stageData';

function nextId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clampAlert(value: number): number {
  return Math.min(100, Math.max(0, value));
}

const KEY_FRAGMENT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const SECURITY_INFO_HINTS: Record<string, string> = {
  E01: 'E01: 公開SSHゲートウェイの構成を確認。Port 22にてパスワード認証（PasswordAuthentication yes）が許可されており、ログイン試行制限（Fail2ban等）が未導入です。辞書攻撃（hydra）による突破が有効です。',
  E02: 'E02: DNSサーバーのゾーン転送設定（AXFR）の不備を確認。内部ドメイン「corp.local」のレコード一覧を取得可能。DMZ層の Web(D01)・Mail(D02) の内部通信経路を特定しました。',
  E03: 'E03: アーカイブサーバーの公開ディレクトリを確認。旧システム移行用バックアップファイルがアクセス制限なしで露出。内部ツールの解析資源（RESOURCE +5）を回収可能です。',
  D01: 'D01: Webサーバーの公開設定を確認。古いApacheのパストラバーサル脆弱性が残存しており、非公開の管理APIへの不正リクエストが可能です。',
  D02: 'D02: メールサーバーのDNSレコードを確認。SPF/DMARCが未設定（p=none）のため、送信元ドメインの偽装が可能です。',
  D03: 'D03: VPNエンドポイントの暗号スイートを確認。古い暗号化プロトコル（IKEv1/DES）が有効化されており、ダウングレード攻撃が可能です。',
  D04: 'D04: Web管理コンソールのアクセス制御を確認。IP制限が不十分で、X-Forwarded-Forヘッダ偽装による管理権限バイパスが可能です。',
  D05: 'D05: メモリキャッシュサーバーの設定を確認。セッショントークンおよびVPN認証情報が平文でキャッシュに残存しています。',
  D06: 'D06: 社内プロキシサーバーの転送設定を確認。アクセス制御リスト（ACL）の誤設定により、通信経路を偽装して警戒度を削減可能です。',
  D07: 'D07: DMZ境界の監視装置を確認。SNMPコミュニティ名がデフォルト（public）のままであり、監視センサーのシグネチャ設定を読み取れます。',
  I01: 'I01: 社内Active Directory/認証基盤の設定を確認。サービスアカウントに過剰な権限（DCSync/特権ロール）が付与されており、特権トークンの奪取が可能です。',
  I02: 'I02: 開発環境のデバッグ設定を確認。sudo設定でパスワードなし実行（NOPASSWD）が許可された開発ツールがあり、ADMIN権限への昇格が可能です。',
  I03: 'I03: 監査ログサーバーの書き換え権限を確認。ローカルログストレージへの書き込み権限が開放されており、侵入証跡の消去により警戒度を-15%削減可能です。',
  I04: 'I04: ARGUS監視AIの制御APIを確認。管理APIエンドポイントが無認証で露出しており、ポリシー書き換えにより警戒度を-20%引き下げ可能です。',
  I05: 'I05: バックアップストレージの共有設定を確認。ゲスト接続可能な共有ディレクトリから計算リソースアーカイブを回収し、解析資源を最大+10補給可能です。',
  I06: 'I06: 社内ファイル共有サーバーを確認。パーミッション設定不備により、Core層への隠密侵入に不可欠な「暗号鍵の断片A」を回収可能です。',
  I07: 'I07: システム管理者端末のレジストリと設定を確認。平文で保存された管理者資格情報から「暗号鍵の断片B」を抽出可能です。',
  I08: 'I08: 内部ルーターのACLルーティング設定を確認。管理プレーンの保護が不十分で、Core層へのパケット転送ルールを書き換え可能です。',
  I09: 'I09: セキュリティ管理コンソールの設定を確認。Core層ファイアウォールのポリシーを弱体化させ、資源+3獲得と警戒度-10%を同時に実現可能です。',
  I10: 'I10: 研究開発用REST APIの認証を確認。認証トークンの検証がバイパス可能で、最深部Coreノードへの最短侵入ルートが開かれます。',
  C01: 'C01: Coreファイアウォールの設定を確認。管理プレーンのACL設定が甘く、SNMP RW権限によるルール書き換えで最深部へのルーティングが許可されます。',
  C02: 'C02: 暗号認証サーバーの暗号化プロトコルを確認。古いSSL/TLS暗号スイート（RC4/3DES）が有効で、既知の鍵復元・暗号解読手法が通用します。',
  C03: 'C03: 研究データベースの接続エンドポイントを確認。WebフォームやAPIのSQLクエリ組み立て不備（SQLインジェクション）により、極秘研究データの抽出が可能です！',
  C04: 'C04: ARGUS緊急防衛システムの制御端末を確認。緊急遮断APIの認証不備を突き、緊急防衛プロトコルを解除して警戒度を-15%大幅低下させます。',
  'S2-E01': 'S2-E01: 調査用アカウントのSSH認証を確認。平易な初期パスワードが残存しており、辞書攻撃による侵入が有効です。',
  'S2-D01': 'S2-D01: 公開通信リレーのDNS設定を確認。ゾーン転送の露出により、高速側（S2-D03）への内部通信ルートが判明しました。',
  'S2-D02': 'S2-D02: 認証窓口Webサービスのアクセス制御を確認。ヘッダ検証の不備を突き、管理プロキシ（S2-D04）への経路バイパスが可能です。',
  'S2-D03': 'S2-D03: トラフィック集約装置の構成を確認。S2-I01・S2-C01・S2-C03への通信は常時監視（警戒度+12%）されています。S2-I07攻略による監視解除を推奨します。',
  'S2-D04': 'S2-D04: 社内管理プロキシの設定を確認。証明書管理サーバー（S2-I04）および監査ログ中継（S2-I05）への通信中継が許可されます。',
  'S2-I01': 'S2-I01: 通信交換ハブの管理権限を確認。保守用アカウントの権限設定ミスからADMIN権限への昇格が可能です。※S2-I07未攻略時は追加警戒度+12%が発生します。',
  'S2-I02': 'S2-I02: 内部ルーターのACLルーティング設定を確認。転送制御テーブルを書き換えることで、転送ゲート（S2-C01）および迂回ゲート（S2-C04）への経路が開かれます。',
  'S2-I03': 'S2-I03: 予備解析基盤のクラスタ設定を確認。残存する計算リソースアーカイブを回収し、解析資源を最大+7補給可能です。',
  'S2-I04': 'S2-I04: 社内PKI証明書管理APIを確認。正規クライアント証明書をエクスポート可能です。これにより証明書認証ゲート（S2-C02）の前提ロックが解除されます！',
  'S2-I05': 'S2-I05: 監査ログ中継サーバーの書き換え権限を確認。中継バッファの通信ログを消去することで、全体の警戒度を-8%削減可能です。',
  'S2-I06': 'S2-I06: 証跡バックアップのパーミッション設定を確認。読み取り可能なスナップショットから、解析資源を最大+5回収可能です。',
  'S2-I07': 'S2-I07: 常時監視センサーの制御端末を確認。制御APIを停止することで、対象ノード（S2-I01/C01/C03）の追加警戒度+12%を無効化し、監視迂回ゲート（S2-C04）を解放します！',
  'S2-C01': 'S2-C01: Core直接転送ゲートのACL設定を確認。前提ロックなしで原本DB（S2-C03）へ接続可能ですが、S2-I07未攻略時は追加警戒度+12%が発生します。',
  'S2-C02': 'S2-C02: 相互TLS証明書認証ゲートを確認。S2-I04から取得したクライアント証明書を提示することで、原本DB（S2-C03）への安全な侵入路が開かれます。',
  'S2-C03': 'S2-C03: 原本通信証跡データベースを確認。SQLインジェクション脆弱性を突いて原本ログを抽出し、偽装された通信証跡の真実を回収します！',
  'S2-C04': 'S2-C04: 監視網の迂回ゲートを確認。S2-I07の停止により解放され、侵入時に監視ログを消去して警戒度を-10%削減できます。',
  'external-1': 'external-1: 公開SSHサーバーのポート22を確認。パスワード試行回数の制限がなく、辞書攻撃による侵入が可能です。',
  'dmz-1': 'dmz-1: 古いバージョンのApache Webサーバーを確認。既知のパストラバーサル脆弱性により、内部設定ファイルの閲覧が可能です。',
  'dmz-2': 'dmz-2: 社員向けメールサーバーを確認。送信元ドメイン検証（SPF/DMARC）が甘く、標的型メールの送信が可能です。',
  'internal-1': 'internal-1: Active Directoryのドメイン構成を確認。サービスアカウントの過剰権限を利用してADMIN権限への昇格が可能です。',
  'core-1': 'core-1: 機密データベースのクエリ処理を確認。SQLインジェクション脆弱性により、機密データの抽出が可能です！',
};

export const CORRECT_EXPLOITS: Record<string, string[]> = {
  E01: ['ssh_bf', 'ssh_cfg_b', 'ssh_def_c'],
  E02: ['dns_axfr', 'dns_cfg_ok', 'dns_def_c'],
  E03: ['acl_smb', 'acl_cfg_ok', 'acl_def_c'],
  D01: ['web_bypass', 'web_def_ok', 'web_cfg_b'],
  D02: ['mail_spoof', 'mail_spf_ok', 'mail_def_c'],
  D03: ['vpn_downgrade', 'vpn_cfg_ok', 'vpn_def_c'],
  D04: ['web_bypass', 'web_def_ok', 'web_cfg_b'],
  D05: ['cred_dump', 'cred_code_b', 'cred_def_c'],
  D06: ['log_tamper', 'log_def_ok', 'log_cfg_b'],
  D07: ['log_tamper', 'log_def_ok', 'log_cfg_b'],
  I01: ['priv_esc', 'priv_sudo_b', 'priv_def_c'],
  I02: ['priv_esc', 'priv_sudo_b', 'priv_def_c'],
  I03: ['log_tamper', 'log_def_ok', 'log_cfg_b'],
  I04: ['log_tamper', 'log_def_ok', 'log_cfg_b'],
  I05: ['acl_smb', 'acl_cfg_ok', 'acl_def_c'],
  I06: ['acl_smb', 'acl_cfg_ok', 'acl_def_c'],
  I07: ['cred_dump', 'cred_code_b', 'cred_def_c'],
  I08: ['net_route', 'net_fw_r1', 'net_def_c'],
  I09: ['net_route', 'net_fw_r1', 'net_def_c'],
  I10: ['web_bypass', 'web_def_ok', 'web_cfg_b'],
  C01: ['net_route', 'net_fw_r1', 'net_def_c'],
  C02: ['vpn_downgrade', 'vpn_cfg_ok', 'vpn_def_c'],
  C03: ['db_sqli_union', 'db_code_a', 'db_def_c'],
  C04: ['log_tamper', 'log_def_ok', 'log_cfg_b'],
  'S2-E01': ['ssh_bf', 'ssh_cfg_b', 'ssh_def_c'],
  'S2-D01': ['dns_axfr', 'dns_cfg_ok', 'dns_def_c'],
  'S2-D02': ['web_bypass', 'web_def_ok', 'web_cfg_b'],
  'S2-D03': ['dns_axfr', 'dns_cfg_ok', 'dns_def_c'],
  'S2-D04': ['web_bypass', 'web_def_ok', 'web_cfg_b'],
  'S2-I01': ['priv_esc', 'priv_sudo_b', 'priv_def_c'],
  'S2-I02': ['net_route', 'net_fw_r1', 'net_def_c'],
  'S2-I03': ['priv_esc', 'priv_sudo_b', 'priv_def_c'],
  'S2-I04': ['vpn_downgrade', 'vpn_cfg_ok', 'vpn_def_c'],
  'S2-I05': ['log_tamper', 'log_def_ok', 'log_cfg_b'],
  'S2-I06': ['acl_smb', 'acl_cfg_ok', 'acl_def_c'],
  'S2-I07': ['log_tamper', 'log_def_ok', 'log_cfg_b'],
  'S2-C01': ['net_route', 'net_fw_r1', 'net_def_c'],
  'S2-C02': ['vpn_downgrade', 'vpn_cfg_ok', 'vpn_def_c'],
  'S2-C03': ['db_sqli_union', 'db_code_a', 'db_def_c'],
  'S2-C04': ['log_tamper', 'log_def_ok', 'log_cfg_b'],
  'external-1': ['ssh_bf', 'ssh_cfg_b', 'ssh_def_c'],
  'dmz-1': ['web_bypass', 'web_def_ok', 'web_cfg_b'],
  'dmz-2': ['mail_spoof', 'mail_spf_ok', 'mail_def_c'],
  'internal-1': ['priv_esc', 'priv_sudo_b', 'priv_def_c'],
  'core-1': ['db_sqli_union', 'db_code_a', 'db_def_c'],
};

export const SECURITY_PENALTIES: Record<string, { alert: number; resource: number }> = {
  E01: { alert: 5, resource: 1 },
  E02: { alert: 5, resource: 1 },
  E03: { alert: 3, resource: 1 },
  D01: { alert: 5, resource: 1 },
  D02: { alert: 5, resource: 1 },
  D03: { alert: 6, resource: 1 },
  D04: { alert: 5, resource: 1 },
  D05: { alert: 5, resource: 1 },
  D06: { alert: 4, resource: 1 },
  D07: { alert: 6, resource: 1 },
  I01: { alert: 6, resource: 1 },
  I02: { alert: 5, resource: 1 },
  I03: { alert: 5, resource: 1 },
  I04: { alert: 7, resource: 1 },
  I05: { alert: 4, resource: 1 },
  I06: { alert: 5, resource: 1 },
  I07: { alert: 5, resource: 1 },
  I08: { alert: 6, resource: 1 },
  I09: { alert: 6, resource: 1 },
  I10: { alert: 5, resource: 1 },
  C01: { alert: 8, resource: 1 },
  C02: { alert: 7, resource: 1 },
  C03: { alert: 10, resource: 1 },
  C04: { alert: 8, resource: 1 },
  'S2-E01': { alert: 5, resource: 1 },
  'S2-D01': { alert: 5, resource: 1 },
  'S2-D02': { alert: 5, resource: 1 },
  'S2-D03': { alert: 6, resource: 1 },
  'S2-D04': { alert: 5, resource: 1 },
  'S2-I01': { alert: 6, resource: 1 },
  'S2-I02': { alert: 6, resource: 1 },
  'S2-I03': { alert: 5, resource: 1 },
  'S2-I04': { alert: 7, resource: 1 },
  'S2-I05': { alert: 5, resource: 1 },
  'S2-I06': { alert: 4, resource: 1 },
  'S2-I07': { alert: 7, resource: 1 },
  'S2-C01': { alert: 8, resource: 1 },
  'S2-C02': { alert: 8, resource: 1 },
  'S2-C03': { alert: 10, resource: 1 },
  'S2-C04': { alert: 8, resource: 1 },
  'external-1': { alert: 5, resource: 1 },
  'dmz-1': { alert: 5, resource: 1 },
  'dmz-2': { alert: 5, resource: 1 },
  'internal-1': { alert: 5, resource: 1 },
  'core-1': { alert: 8, resource: 1 },
};

function generateKeyFragment(): string {
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += KEY_FRAGMENT_ALPHABET[Math.floor(Math.random() * KEY_FRAGMENT_ALPHABET.length)];
  }
  return out;
}

function normalizePasscode(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

// 権限の値一覧は backend でまだ定義されていない(確認できているのは "GUEST" のみ)ため、
// プロトタイプとして layer の並びに対応させた仮の序列を置いている。backendが決まり次第差し替える。
const PRIVILEGE_LADDER = ['GUEST', 'USER', 'ADMIN', 'ROOT'] as const;
const LAYER_ORDER: NetworkLayer[] = ['External', 'DMZ', 'Internal', 'Core'];

function privilegeIndex(privilege: string): number {
  const index = PRIVILEGE_LADDER.indexOf(privilege as (typeof PRIVILEGE_LADDER)[number]);
  return index === -1 ? 0 : index;
}

function layerRequirement(layer: NetworkLayer): number {
  return LAYER_ORDER.indexOf(layer);
}

type TimedActionType = 'scan' | 'remoteScan' | 'breach' | 'dataExtract';

// ターン制なので各アクションはリアルタイムの遅延なしに即座に確定する。
// 「time」コストはゲーム内時間を進める量として扱うだけで、実際の待ち時間ではない。
// ルールは backend/game_logic.py の apply_action に合わせてある(変更時は両方を更新すること)。
// バックエンド未起動時でもUIを開発・動作確認できるようにするための
// GameClient のダミー実装。HttpGameClient と同じインターフェースを満たす。
export class MockGameClient implements GameClient {
  private state: GameState;
  private readonly stageId: number;
  private fragmentA: string;
  private fragmentB: string;
  private onEvent: ((event: ServerEvent) => void) | null = null;

  constructor(gameId: string, stageId: number = DEFAULT_STAGE_ID) {
    this.stageId = stageId;
    this.fragmentA = generateKeyFragment();
    this.fragmentB = generateKeyFragment();
    this.state = createMockGameState(gameId, stageId);
    this.state.keyFragments = { a: null, b: null };
  }

  connect(onEvent: (event: ServerEvent) => void): Promise<GameState> {
    this.onEvent = onEvent;
    this.emit({ type: 'state_snapshot', state: this.cloneState() });
    return Promise.resolve(this.cloneState());
  }

  reset(): Promise<void> {
    this.fragmentA = generateKeyFragment();
    this.fragmentB = generateKeyFragment();
    this.state = createMockGameState(this.state.gameId, this.stageId);
    this.state.keyFragments = { a: null, b: null };
    this.emit({ type: 'state_snapshot', state: this.cloneState() });
    return Promise.resolve();
  }

  disconnect(): void {
    this.onEvent = null;
  }

  sendAction(action: ActionRequest): Promise<ActionResult> {
    switch (action.type) {
      case 'pause':
        if (this.state.status !== 'playing') return Promise.resolve({ accepted: false, reason: 'invalid_state' });
        this.state.status = 'paused';
        this.log('info', '作戦を一時停止しました。');
        this.emit({ type: 'state_snapshot', state: this.cloneState() });
        return Promise.resolve({ accepted: true });
      case 'resume':
        if (this.state.status !== 'paused') return Promise.resolve({ accepted: false, reason: 'invalid_state' });
        this.state.status = 'playing';
        this.log('info', '作戦を再開しました。');
        this.emit({ type: 'state_snapshot', state: this.cloneState() });
        return Promise.resolve({ accepted: true });
      case 'recover':
        if (this.state.status !== 'playing' || this.state.analysisResource >= MAX_ANALYSIS_RESOURCE) {
          return Promise.resolve({ accepted: false, reason: 'invalid_state' });
        }
        if (!this.state.nodes.some((node) => node.status === 'hacked')) {
          return Promise.resolve({ accepted: false, reason: 'node_unreachable' });
        }
        this.state.analysisResource = Math.min(MAX_ANALYSIS_RESOURCE, this.state.analysisResource + RESOURCE_RECOVERY_AMOUNT);
        this.advanceTime(RECOVERY_COST.time, RECOVERY_COST.alertDelta);
        this.log('success', '\u89e3\u6790\u8cc7\u6e90\u3092\u56de\u5fa9\u3057\u307e\u3057\u305f\u3002RESOURCE: ' + this.state.analysisResource);
        this.checkGameOver();
        this.emit({ type: 'state_snapshot', state: this.cloneState() });
        return Promise.resolve({ accepted: true });
      case 'confirmInfo': {
        if (this.state.status !== 'playing' || !action.nodeId) {
          return Promise.resolve({ accepted: false, reason: 'invalid_state' });
        }
        const targetNode = this.state.nodes.find((n) => n.id === action.nodeId);
        if (!targetNode || targetNode.status !== 'scanned') {
          return Promise.resolve({ accepted: false, reason: 'node_not_scanned' });
        }
        const marker = `[SECURITY:${action.nodeId}:INFO_CONFIRMED]`;
        if (this.state.log.some((entry) => entry.message === marker)) {
          return Promise.resolve({ accepted: false, reason: 'invalid_state' });
        }
        this.log('success', marker);
        const hint = SECURITY_INFO_HINTS[action.nodeId];
        if (hint) {
          this.log('info', `【調査完了】${hint}`);
        }
        this.emit({ type: 'state_snapshot', state: this.cloneState() });
        return Promise.resolve({ accepted: true });
      }
      case 'remoteScan':
      case 'scan':
      case 'breach':
      case 'dataExtract':
        return Promise.resolve(this.applyTimedAction(action, action.type));
      default:
        return Promise.resolve({ accepted: false, reason: 'invalid_state' });
    }
  }

  private applyTimedAction(action: ActionRequest, type: TimedActionType): ActionResult {
    if (this.state.status !== 'playing') return { accepted: false, reason: 'invalid_state' };

    const node = this.state.nodes.find((n) => n.id === action.nodeId);
    if (!node) return { accepted: false, reason: 'invalid_state' };

    const rejection = this.validate(type, node);
    if (rejection) return { accepted: false, reason: rejection };

    if (type === 'breach') {
      const correctList = CORRECT_EXPLOITS[node.id];
      let isWrong = false;
      if (action.exploitId !== undefined) {
        if (correctList && !correctList.includes(action.exploitId)) {
          isWrong = true;
        }
      } else if (action.exploitMismatch) {
        isWrong = true;
      }

      if (isWrong) {
        const penalty = SECURITY_PENALTIES[node.id] ?? { alert: 8, resource: 1 };
        this.state.analysisResource = Math.max(0, this.state.analysisResource - penalty.resource);
        this.state.alertLevel = clampAlert(this.state.alertLevel + penalty.alert);
        this.log(
          'danger',
          `【IDS検知警告】${node.name}への不適切な攻撃手法が検知されました！解析資源 -${penalty.resource}、警戒度 +${Math.round(penalty.alert)}%（現在: ${Math.round(this.state.alertLevel)}%）。`,
        );
        this.checkGameOver();
        this.emit({ type: 'state_snapshot', state: this.cloneState() });
        return { accepted: true };
      }
    }

    const stage = getStageData(this.stageId);
    let silentBreach = false;
    if (type === 'breach' && action.passcode !== undefined && action.passcode.trim() !== '') {
      const expected = normalizePasscode(this.fragmentA + this.fragmentB);
      const submitted = normalizePasscode(action.passcode);
      if (
        !isExtractTarget(node, this.stageId) ||
        stage.keyFragmentNodeIds.length === 0 ||
        !this.hasAllKeyFragments() ||
        submitted !== expected
      ) {
        return { accepted: false, reason: 'invalid_passcode' };
      }
      silentBreach = true;
    }

    const cost = balanceConfig[type];
    const silentExtract = type === 'dataExtract' && this.hasAllKeyFragments();
    const freeExtract =
      silentExtract &&
      (Boolean(this.state.keyFragments?.unlocked) || this.state.analysisResource < cost.resource);
    this.state.analysisResource -= freeExtract ? 0 : cost.resource;
    // 暗号鍵の断片がすべて揃っていればデータ回収時、または正しい暗号を入力した侵入時の警戒度上昇を0に抑える
    const extra = type === 'breach' ? monitoringExtra(node.id, this.state.nodes, stage) : 0;
    this.advanceTime(cost.time, (silentExtract || silentBreach ? 0 : cost.alertDelta) + extra);
    if (extra) this.log('warning', `条件付き監視: ${node.id} 侵入の追加警戒度 +${extra}%。`);
    if (this.state.alertLevel < 100) {
      if (silentBreach && this.state.keyFragments) {
        this.state.keyFragments = { ...this.state.keyFragments, unlocked: true };
      }
      this.resolveAction(type, node, silentExtract, silentBreach);
    }
    this.checkGameOver();

    this.emit({ type: 'state_snapshot', state: this.cloneState() });
    return { accepted: true };
  }

  private validate(
    type: TimedActionType,
    node: NetworkNode,
  ): ActionRejectReason | undefined {
    const cost = balanceConfig[type];
    const requiredResource = type === 'dataExtract' && this.hasAllKeyFragments() ? 0 : cost.resource;
    if (this.state.analysisResource < requiredResource) return 'insufficient_resource';

    const stage = getStageData(this.stageId);
    if (type !== 'dataExtract' && !canRemoteScanNode(node.id, this.state.nodes, stage)) return 'node_unreachable';
    if (type === 'scan' || type === 'remoteScan') {
      if (node.status !== 'unscanned') return 'invalid_state';
      if (type === 'scan' && !canReachNode(node.id, this.state.nodes, this.state.edges, stage)) return 'node_unreachable';
    } else if (type === 'breach') {
      if (node.status === 'hacked') return 'invalid_state';

      // 入口(External)以外は、隣接ノードのどれかを侵入済みにしていないと届かない
      if (!canReachNode(node.id, this.state.nodes, this.state.edges, stage)) return 'node_unreachable';
      if (node.status !== 'scanned') return 'node_not_scanned';
      if (missingGateRequirements(node.id, this.state.nodes, stage).length > 0) return 'node_locked';
      if (privilegeIndex(this.state.privilege) < layerRequirement(node.layer)) {
        return 'insufficient_privilege';
      }
    } else {
      if (node.layer !== 'Core' || node.status !== 'hacked') return 'invalid_state';
      if (!isExtractTarget(node, this.stageId)) return 'invalid_state';
    }
    return undefined;
  }

  // backend/game_logic.py の _advance_time と同じ式: 消費した時間ぶんの自然減衰を
  // 差し引いてからアクション分のalertDeltaを足す。
  private advanceTime(seconds: number, alertDelta: number): void {
    this.state.elapsedSeconds += seconds;
    this.state.alertLevel = clampAlert(
      this.state.alertLevel - balanceConfig.alertDecayPerSecond * seconds + alertDelta,
    );
  }

  private resolveAction(type: TimedActionType, node: NetworkNode, silentExtract: boolean, silentBreach = false): void {
    const stage = getStageData(this.stageId);
    if (type === 'scan' || type === 'remoteScan') {
      node.status = 'scanned';
      node.vulnerability = stage.vulnerabilities[node.id] ?? null;
      this.log('success', `${node.name} のスキャンが完了しました。脆弱性: ${node.vulnerability ?? '不明'}`);
    } else if (type === 'breach') {
      node.status = 'hacked';
      // 侵入したlayerの1段上まで権限を昇格(下がることはない)
      const granted = Math.min(layerRequirement(node.layer) + 1, PRIVILEGE_LADDER.length - 1);
      if (granted > privilegeIndex(this.state.privilege)) {
        this.state.privilege = PRIVILEGE_LADDER[granted];
        this.log('success', `${node.name} への侵入に成功。権限が ${this.state.privilege} に昇格しました。`);
      } else if (silentBreach) {
        this.log('success', `暗号キー認証に成功！${node.name} へ隠密侵入しました（警戒度上昇なし）。`);
      } else {
        this.log('success', `${node.name} への侵入に成功しました。`);
      }
      this.applyNodeEffect(node);
      for (const message of mechanicsUnlockMessages(node.id, this.state.nodes, stage)) this.log('success', message);
    } else {
      this.state.status = 'won';
      const { rank, score, title } = calculateMissionResult(this.state);
      this.state.evaluation = { rank, score, title };
      if (silentExtract) {
        this.log('success', `復元した暗号鍵を使用し、${node.name} から極秘研究データを隠密回収しました。目的達成！`);
      } else {
        this.log('success', `${node.name} から機密データを回収しました。目的達成！`);
      }
      this.log('success', `作戦評価: RANK ${rank}（スコア: ${score}） - ${title}`);
      this.emit({ type: 'game_over', result: 'won' });
    }
  }

  // backend/game_logic.py の _apply_node_effect と同じ: 侵入成功時のステージ固有の効果
  private applyNodeEffect(node: NetworkNode): void {
    const stage = getStageData(this.stageId);
    const effect = stage.nodeEffects[node.id];
    if (!effect) {
      const reward = stage.id === DEFAULT_STAGE_ID ? RESOURCE_REWARDS[node.id] ?? 0 : 0;
      this.state.analysisResource = Math.min(MAX_ANALYSIS_RESOURCE, this.state.analysisResource + reward);
      return;
    }

    if (effect.resourceBonus) {
      this.state.analysisResource = Math.min(MAX_ANALYSIS_RESOURCE, Math.max(0, this.state.analysisResource + effect.resourceBonus));
    }
    if (effect.alertDelta) {
      this.state.alertLevel = clampAlert(this.state.alertLevel + effect.alertDelta);
    }
    const orderedKeyIds = [...stage.keyFragmentNodeIds].sort();
    let logMessage = effect.log;
    if (orderedKeyIds[0] === node.id) {
      this.state.keyFragments = { a: this.fragmentA, b: this.state.keyFragments?.b ?? null };
      node.info = `${node.info ?? ''} 【入手済み断片A: ${this.fragmentA}】`.trim();
      logMessage = `【重要】${node.name}から「暗号鍵の断片A: ${this.fragmentA}」を入手しました。`;
    } else if (orderedKeyIds[1] === node.id) {
      this.state.keyFragments = { a: this.state.keyFragments?.a ?? null, b: this.fragmentB };
      node.info = `${node.info ?? ''} 【入手済み断片B: ${this.fragmentB}】`.trim();
      logMessage = `【重要】${node.name}から「暗号鍵の断片B: ${this.fragmentB}」を入手しました。`;
    }
    if (logMessage) this.log('info', logMessage);

    if (stage.keyFragmentNodeIds.includes(node.id) && this.hasAllKeyFragments()) {
      this.log(
        'success',
        `すべての暗号鍵断片が揃いました！断片A「${this.fragmentA}」と断片B「${this.fragmentB}」を繋げた暗号を最終目標の侵入時に入力すると、警戒度上昇を0に抑えられます。`,
      );
    }
  }

  private hasAllKeyFragments(): boolean {
    const stage = getStageData(this.stageId);
    return (
      stage.keyFragmentNodeIds.length > 0 &&
      stage.keyFragmentNodeIds.every((id) => this.state.nodes.some((n) => n.id === id && n.status === 'hacked'))
    );
  }

  private hasAnyAffordableAction(): boolean {
    if (this.state.analysisResource < MAX_ANALYSIS_RESOURCE && this.state.nodes.some((node) => node.status === 'hacked')) return true;
    for (const node of this.state.nodes) {
      for (const type of ['scan', 'remoteScan', 'breach', 'dataExtract'] as const) {
        if (this.validate(type, node) === undefined) return true;
      }
    }
    return false;
  }

  private checkGameOver(): void {
    if (this.state.status !== 'playing') return;
    if (this.state.alertLevel >= 100) {
      this.state.status = 'lost';
      this.log('danger', '警戒度が限界に達しました。侵入が検知され、作戦は失敗です。');
      this.emit({ type: 'game_over', result: 'lost' });
    } else if (!this.hasAnyAffordableAction()) {
      this.state.status = 'lost';
      this.log('danger', '解析資源が枯渇しました。これ以上の作戦継続は不可能です。');
      this.emit({ type: 'game_over', result: 'lost' });
    }
  }

  private log(severity: 'info' | 'success' | 'warning' | 'danger', message: string): void {
    const entry = {
      id: nextId(),
      timestamp: this.state.elapsedSeconds,
      message,
      severity,
    };
    this.state.log.push(entry);
    this.emit({ type: 'log', entry });
  }

  private emit(event: ServerEvent): void {
    this.onEvent?.(event);
  }

  private cloneState(): GameState {
    return {
      ...this.state,
      nodes: this.state.nodes.map((n) => ({ ...n, position: { ...n.position } })),
      edges: this.state.edges.map((e) => ({ ...e })),
      log: [...this.state.log],
    };
  }
}
