// このファイルは scripts/gen_stage_data.py で game_data.py・balance_config.py・map_generation_config.py から生成している。
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

// Python生成器の正本から同期。独立したTS側の既定値を持たない。
export const MAP_GENERATOR_VERSION = 'stage1-sha256-v1';
export const MAP_VALIDATOR_VERSION = 'stage1-witness-v1';
export const DYNAMIC_NODE_INFO: Record<string,string> = {"D01": "公開Webサービス。接続先は現在のマップを確認してください。", "D03": "VPNの接続点。接続先は現在のマップを確認してください。", "D07": "管理情報を確認できるサーバー。接続先は現在のマップを確認してください。", "I04": "初回侵入で警戒度-20%。接続先は現在のマップを確認してください。効果は一度だけ。"};
export const DYNAMIC_TEXT_REPLACEMENTS: Record<string,string> = {"DMZ層の Web(D01)・Mail(D02) の内部通信経路を特定しました。": "接続先は現在のマップで確認してください。"};
export const MAP_GENERATION_CONFIG = {"max_attempts": 16, "min_edges": 34, "max_edges": 40, "min_degree": 2, "max_degree": 5, "max_paths": 1024, "max_search_states": 10000, "max_route_nodes": 10, "fast_min_seconds": 225, "fast_max_seconds": 255, "fast_min_alert": 40.0, "fast_max_alert": 65.0, "fast_max_resource": 6, "detour_min_seconds": 30, "detour_max_seconds": 90, "stealth_alert_advantage": 15.0, "resource_advantage": 5};
export const STAGE1_INTERNAL_KEYS = ["id", "name", "difficulty", "nodes", "edges", "entry_layers", "entry_node_ids", "target_node_ids", "key_fragment_node_ids", "node_effects", "security_rules", "seed", "generator_version", "rules_version", "important_node_ids", "conditional_breach_alert", "breach_requirements", "initial_state", "action_costs", "alert_decay_per_second", "max_analysis_resource", "resource_recovery_amount", "alert_game_over_threshold", "privilege_ladder", "layer_order", "evaluation_config", "resource_rewards"];
export const STAGE1_EFFECT_KEYS = {"E03": ["resource_bonus", "alert_delta", "log"], "D06": ["resource_bonus", "alert_delta", "log"], "I03": ["resource_bonus", "alert_delta", "log"], "I04": ["resource_bonus", "alert_delta", "log"], "I05": ["resource_bonus", "alert_delta", "log"], "I06": ["resource_bonus", "alert_delta", "log"], "I07": ["resource_bonus", "alert_delta", "log"], "I09": ["resource_bonus", "alert_delta", "log"], "C04": ["resource_bonus", "alert_delta", "log"]};

export const INITIAL_ANALYSIS_RESOURCE = 25;
export const INITIAL_PRIVILEGE = 'GUEST';
export const PRIVILEGE_LADDER = ["GUEST", "USER", "ADMIN", "ROOT"];
export const LAYER_ORDER = ["External", "DMZ", "Internal", "Core"];
export const ALERT_GAME_OVER_THRESHOLD = 100;
export const SECURITY_RULES = {"E01": {"correct_exploits": ["ssh_bf", "ssh_cfg_b", "ssh_def_c"], "allowed_scan_types": ["scan"], "vulnerability": "弱いSSHパスワード", "risk_level": "MEDIUM", "required_scan": true, "required_info": true, "required_analysis": true, "failure_mode": "consume", "failure_alert": 5, "success_resource": 3, "required_privilege": "GUEST", "info_hint": "E01: 公開SSHゲートウェイの構成を確認。Port 22にてパスワード認証（PasswordAuthentication yes）が許可されており、ログイン試行制限（Fail2ban等）が未導入です。辞書攻撃（hydra）による突破が有効です。", "question_answers": {"E01:ssh-q1": ["ssh_bf"], "E01:ssh-q2": ["ssh_cfg_b"], "E01:ssh-q3": ["ssh_def_c"]}, "required_question": true}, "E02": {"correct_exploits": ["dns_axfr", "dns_cfg_ok", "dns_def_c"], "vulnerability": "DNS設定情報の漏洩", "risk_level": "MEDIUM", "required_scan": true, "required_info": true, "failure_mode": "consume", "failure_alert": 5, "success_resource": 3, "required_privilege": "GUEST", "allowed_scan_types": ["scan", "remoteScan"], "info_hint": "E02: DNSサーバーのゾーン転送設定（AXFR）の不備を確認。内部ドメイン「corp.local」のレコード一覧を取得可能。DMZ層の Web(D01)・Mail(D02) の内部通信経路を特定しました。", "question_answers": {"E02:dns-q2": ["dns_cfg_ok"], "E02:dns-q1": ["dns_axfr"], "E02:dns-q3": ["dns_def_c"]}, "required_question": true}, "E03": {"correct_exploits": ["acl_smb", "acl_cfg_ok", "acl_def_c"], "vulnerability": "古い公開ファイルのアクセス制御不備", "risk_level": "LOW", "required_scan": true, "required_info": true, "failure_mode": "reject", "failure_alert": 3, "success_resource": 0, "required_privilege": "GUEST", "allowed_scan_types": ["scan", "remoteScan"], "info_hint": "E03: アーカイブサーバーの公開ディレクトリを確認。旧システム移行用バックアップファイルがアクセス制限なしで露出。内部ツールの解析資源（RESOURCE +5）を回収可能です。", "question_answers": {"E03:acl-q1": ["acl_smb"], "E03:acl-q2": ["acl_cfg_ok"], "E03:acl-q3": ["acl_def_c"]}, "required_question": true}, "D01": {"vulnerability": "古いWebサーバーの設定不備", "risk_level": "MEDIUM", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["web_bypass", "web_def_ok", "web_cfg_b"], "failure_alert": 5.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "USER", "info_hint": "D01: Webサーバーの公開設定を確認。古いApacheのパストラバーサル脆弱性が残存しており、非公開の管理APIへの不正リクエストが可能です。", "question_answers": {"D01:web-q2": ["web_def_ok"], "D01:web-q1": ["web_bypass"], "D01:web-q3": ["web_cfg_b"]}, "failure_mode": "reject", "exploit_failure_alert": 5.0, "required_question": true}, "D02": {"vulnerability": "メール認証設定の不備", "risk_level": "MEDIUM", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["mail_spoof", "mail_spf_ok", "mail_def_c"], "failure_alert": 5.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "USER", "info_hint": "D02: メールサーバーのDNSレコードを確認。SPF/DMARCが未設定（p=none）のため、送信元ドメインの偽装が可能です。", "question_answers": {"D02:mail-q1": ["mail_spf_ok"], "D02:mail-q2": ["mail_spoof"], "D02:mail-q3": ["mail_def_c"]}, "failure_mode": "reject", "exploit_failure_alert": 5.0, "required_question": true}, "D03": {"vulnerability": "古いVPN認証方式", "risk_level": "HIGH", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["vpn_downgrade", "vpn_cfg_ok", "vpn_def_c"], "failure_alert": 6.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "USER", "info_hint": "D03: VPNエンドポイントの暗号スイートを確認。古い暗号化プロトコル（IKEv1/DES）が有効化されており、ダウングレード攻撃が可能です。", "question_answers": {"D03:vpn-q2": ["vpn_cfg_ok"], "D03:vpn-q1": ["vpn_downgrade"], "D03:vpn-q3": ["vpn_def_c"]}, "failure_mode": "reject", "exploit_failure_alert": 6.0, "required_question": true}, "D04": {"vulnerability": "管理画面のアクセス制御不備", "risk_level": "MEDIUM", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["web_bypass", "web_def_ok", "web_cfg_b"], "failure_alert": 5.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "USER", "info_hint": "D04: Web管理コンソールのアクセス制御を確認。IP制限が不十分で、X-Forwarded-Forヘッダ偽装による管理権限バイパスが可能です。", "question_answers": {"D04:web-q1": ["web_bypass"], "D04:web-q2": ["web_def_ok"], "D04:web-q3": ["web_cfg_b"]}, "failure_mode": "reject", "exploit_failure_alert": 5.0, "required_question": true}, "D05": {"vulnerability": "認証情報の不適切な保存", "risk_level": "MEDIUM", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["cred_dump", "cred_code_b", "cred_def_c"], "failure_alert": 5.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "USER", "info_hint": "D05: メモリキャッシュサーバーの設定を確認。セッショントークンおよびVPN認証情報が平文でキャッシュに残存しています。", "question_answers": {"D05:cred-q2": ["cred_code_b"], "D05:cred-q1": ["cred_dump"], "D05:cred-q3": ["cred_def_c"]}, "failure_mode": "reject", "exploit_failure_alert": 5.0, "required_question": true}, "D06": {"vulnerability": "プロキシ設定の不備", "risk_level": "LOW", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["log_tamper", "log_def_ok", "log_cfg_b"], "failure_alert": 4.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "USER", "info_hint": "D06: 社内プロキシサーバーの転送設定を確認。アクセス制御リスト（ACL）の誤設定により、通信経路を偽装して警戒度を削減可能です。", "question_answers": {"D06:log-q1": ["log_tamper"], "D06:log-q2": ["log_def_ok"], "D06:log-q3": ["log_cfg_b"]}, "failure_mode": "reject", "exploit_failure_alert": 4.0, "required_question": true}, "D07": {"vulnerability": "監視システムの設定不備", "risk_level": "HIGH", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["log_tamper", "log_def_ok", "log_cfg_b"], "failure_alert": 6.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "USER", "info_hint": "D07: DMZ境界の監視装置を確認。SNMPコミュニティ名がデフォルト（public）のままであり、監視センサーのシグネチャ設定を読み取れます。", "question_answers": {"D07:log-q2": ["log_def_ok"], "D07:log-q1": ["log_tamper"], "D07:log-q3": ["log_cfg_b"]}, "failure_mode": "reject", "exploit_failure_alert": 6.0, "required_question": true}, "I01": {"vulnerability": "認証権限の設定ミス", "risk_level": "HIGH", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["priv_esc", "priv_sudo_b", "priv_def_c"], "failure_alert": 6.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ADMIN", "info_hint": "I01: 社内Active Directory/認証基盤の設定を確認。サービスアカウントに過剰な権限（DCSync/特権ロール）が付与されており、特権トークンの奪取が可能です。", "question_answers": {"I01:priv-q1": ["priv_esc"], "I01:priv-q2": ["priv_sudo_b"], "I01:priv-q3": ["priv_def_c"]}, "failure_mode": "reject", "exploit_failure_alert": 6.0, "required_question": true}, "I02": {"vulnerability": "開発用サービスの保護不足", "risk_level": "MEDIUM", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["priv_esc", "priv_sudo_b", "priv_def_c"], "failure_alert": 5.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ADMIN", "info_hint": "I02: 開発環境のデバッグ設定を確認。sudo設定でパスワードなし実行（NOPASSWD）が許可された開発ツールがあり、ADMIN権限への昇格が可能です。", "question_answers": {"I02:priv-q2": ["priv_sudo_b"], "I02:priv-q1": ["priv_esc"], "I02:priv-q3": ["priv_def_c"]}, "failure_mode": "reject", "exploit_failure_alert": 5.0, "required_question": true}, "I03": {"vulnerability": "ログ管理権限の不備", "risk_level": "MEDIUM", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["log_tamper", "log_def_ok", "log_cfg_b"], "failure_alert": 5.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ADMIN", "info_hint": "I03: 監査ログサーバーの書き換え権限を確認。ローカルログストレージへの書き込み権限が開放されており、侵入証跡の消去により警戒度を-15%削減可能です。", "question_answers": {"I03:log-q1": ["log_tamper"], "I03:log-q2": ["log_def_ok"], "I03:log-q3": ["log_cfg_b"]}, "failure_mode": "reject", "exploit_failure_alert": 5.0, "required_question": true}, "I04": {"vulnerability": "監視制御APIの認証不備", "risk_level": "HIGH", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["log_tamper", "log_def_ok", "log_cfg_b"], "failure_alert": 7.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ADMIN", "info_hint": "I04: ARGUS監視AIの制御APIを確認。管理APIエンドポイントが無認証で露出しており、ポリシー書き換えにより警戒度を-20%引き下げ可能です。", "question_answers": {"I04:log-q2": ["log_def_ok"], "I04:log-q1": ["log_tamper"], "I04:log-q3": ["log_cfg_b"]}, "failure_mode": "reject", "exploit_failure_alert": 7.0, "required_question": true}, "I05": {"vulnerability": "バックアップ領域の権限不備", "risk_level": "LOW", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["acl_smb", "acl_cfg_ok", "acl_def_c"], "failure_alert": 4.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ADMIN", "info_hint": "I05: バックアップストレージの共有設定を確認。ゲスト接続可能な共有ディレクトリから計算リソースアーカイブを回収し、解析資源を最大+10補給可能です。", "question_answers": {"I05:acl-q1": ["acl_smb"], "I05:acl-q2": ["acl_cfg_ok"], "I05:acl-q3": ["acl_def_c"]}, "failure_mode": "reject", "exploit_failure_alert": 4.0, "required_question": true}, "I06": {"vulnerability": "共有フォルダの権限不備", "risk_level": "MEDIUM", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["acl_smb", "acl_cfg_ok", "acl_def_c"], "failure_alert": 5.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ADMIN", "info_hint": "I06: 社内ファイル共有サーバーを確認。パーミッション設定不備により、Core層への隠密侵入に不可欠な「暗号鍵の断片A」を回収可能です。", "question_answers": {"I06:acl-q2": ["acl_cfg_ok"], "I06:acl-q1": ["acl_smb"], "I06:acl-q3": ["acl_def_c"]}, "failure_mode": "reject", "exploit_failure_alert": 5.0, "required_question": true}, "I07": {"vulnerability": "管理用資格情報の保存不備", "risk_level": "MEDIUM", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["cred_dump", "cred_code_b", "cred_def_c"], "failure_alert": 5.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ADMIN", "info_hint": "I07: システム管理者端末のレジストリと設定を確認。平文で保存された管理者資格情報から「暗号鍵の断片B」を抽出可能です。", "question_answers": {"I07:cred-q1": ["cred_dump"], "I07:cred-q2": ["cred_code_b"], "I07:cred-q3": ["cred_def_c"]}, "failure_mode": "reject", "exploit_failure_alert": 5.0, "required_question": true}, "I08": {"vulnerability": "ルーティング設定の不備", "risk_level": "HIGH", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["net_route", "net_fw_r1", "net_def_c"], "failure_alert": 6.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ADMIN", "info_hint": "I08: 内部ルーターのACLルーティング設定を確認。管理プレーンの保護が不十分で、Core層へのパケット転送ルールを書き換え可能です。", "question_answers": {"I08:net-q2": ["net_fw_r1"], "I08:net-q1": ["net_route"], "I08:net-q3": ["net_def_c"]}, "failure_mode": "reject", "exploit_failure_alert": 6.0, "required_question": true}, "I09": {"vulnerability": "防衛設定のアクセス制御不備", "risk_level": "HIGH", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["net_route", "net_fw_r1", "net_def_c"], "failure_alert": 6.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ADMIN", "info_hint": "I09: セキュリティ管理コンソールの設定を確認。Core層ファイアウォールのポリシーを弱体化させ、資源+3獲得と警戒度-10%を同時に実現可能です。", "question_answers": {"I09:net-q1": ["net_route"], "I09:net-q2": ["net_fw_r1"], "I09:net-q3": ["net_def_c"]}, "failure_mode": "reject", "exploit_failure_alert": 6.0, "required_question": true}, "I10": {"vulnerability": "研究用APIの認証不備", "risk_level": "MEDIUM", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["web_bypass", "web_def_ok", "web_cfg_b"], "failure_alert": 5.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ADMIN", "info_hint": "I10: 研究開発用REST APIの認証を確認。認証トークンの検証がバイパス可能で、最深部Coreノードへの最短侵入ルートが開かれます。", "question_answers": {"I10:web-q1": ["web_bypass"], "I10:web-q2": ["web_def_ok"], "I10:web-q3": ["web_cfg_b"]}, "failure_mode": "reject", "exploit_failure_alert": 5.0, "required_question": true}, "C01": {"vulnerability": "ファイアウォール管理設定の不備", "risk_level": "CRITICAL", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["net_route", "net_fw_r1", "net_def_c"], "failure_alert": 8.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ROOT", "info_hint": "C01: Coreファイアウォールの設定を確認。管理プレーンのACL設定が甘く、SNMP RW権限によるルール書き換えで最深部へのルーティングが許可されます。", "failure_mode": "reject", "exploit_failure_alert": 8.0, "question_answers": {"C01:net-q1": ["net_route"], "C01:net-q2": ["net_fw_r1"], "C01:net-q3": ["net_def_c"]}, "required_question": true}, "C02": {"vulnerability": "古い暗号認証設定", "risk_level": "HIGH", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["vpn_downgrade", "vpn_cfg_ok", "vpn_def_c"], "failure_alert": 7.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ROOT", "info_hint": "C02: 暗号認証サーバーの暗号化プロトコルを確認。古いSSL/TLS暗号スイート（RC4/3DES）が有効で、既知の鍵復元・暗号解読手法が通用します。", "failure_mode": "reject", "exploit_failure_alert": 7.0, "question_answers": {"C02:vpn-q2": ["vpn_cfg_ok"], "C02:vpn-q1": ["vpn_downgrade"], "C02:vpn-q3": ["vpn_def_c"]}, "required_question": true}, "C03": {"vulnerability": "データベース権限設定の不備", "risk_level": "CRITICAL", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["db_sqli_union", "db_code_a", "db_def_c"], "failure_alert": 10.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ROOT", "info_hint": "C03: 研究データベースの接続エンドポイントを確認。WebフォームやAPIのSQLクエリ組み立て不備（SQLインジェクション）により、極秘研究データの抽出が可能です！", "failure_mode": "reject", "exploit_failure_alert": 10.0, "question_answers": {"C03:db-q1": ["db_sqli_union"], "C03:db-q2": ["db_code_a"], "C03:db-q3": ["db_def_c"]}, "required_question": true}, "C04": {"vulnerability": "緊急制御機能の設定不備", "risk_level": "HIGH", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["log_tamper", "log_def_ok", "log_cfg_b"], "failure_alert": 8.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ROOT", "info_hint": "C04: ARGUS緊急防衛システムの制御端末を確認。緊急遮断APIの認証不備を突き、緊急防衛プロトコルを解除して警戒度を-15%大幅低下させます。", "failure_mode": "reject", "exploit_failure_alert": 8.0, "question_answers": {"C04:log-q2": ["log_def_ok"], "C04:log-q1": ["log_tamper"], "C04:log-q3": ["log_cfg_b"]}, "required_question": true}, "S2-E01": {"vulnerability": "調査用アカウントの弱い認証", "risk_level": "MEDIUM", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["ssh_bf", "ssh_cfg_b", "ssh_def_c"], "failure_alert": 5.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "GUEST", "info_hint": "S2-E01: 調査用アカウントのSSH認証を確認。平易な初期パスワードが残存しており、辞書攻撃による侵入が有効です。", "failure_mode": "reject", "exploit_failure_alert": 5.0, "question_answers": {"S2-E01:ssh-q1": ["ssh_bf"], "S2-E01:ssh-q2": ["ssh_cfg_b"], "S2-E01:ssh-q3": ["ssh_def_c"]}, "required_question": true}, "S2-D01": {"vulnerability": "中継サービスの設定不備", "risk_level": "MEDIUM", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["dns_axfr", "dns_cfg_ok", "dns_def_c"], "failure_alert": 5.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "USER", "info_hint": "S2-D01: 公開通信リレーのDNS設定を確認。ゾーン転送の露出により、高速側（S2-D03）への内部通信ルートが判明しました。", "failure_mode": "reject", "exploit_failure_alert": 5.0, "question_answers": {"S2-D01:dns-q2": ["dns_cfg_ok"], "S2-D01:dns-q1": ["dns_axfr"], "S2-D01:dns-q3": ["dns_def_c"]}, "required_question": true}, "S2-D02": {"vulnerability": "認証窓口のアクセス制御不備", "risk_level": "MEDIUM", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["web_bypass", "web_def_ok", "web_cfg_b"], "failure_alert": 5.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "USER", "info_hint": "S2-D02: 認証窓口Webサービスのアクセス制御を確認。ヘッダ検証の不備を突き、管理プロキシ（S2-D04）への経路バイパスが可能です。", "failure_mode": "reject", "exploit_failure_alert": 5.0, "question_answers": {"S2-D02:web-q1": ["web_bypass"], "S2-D02:web-q2": ["web_def_ok"], "S2-D02:web-q3": ["web_cfg_b"]}, "required_question": true}, "S2-D03": {"vulnerability": "集約サービスの権限設定不備", "risk_level": "HIGH", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["dns_axfr", "dns_cfg_ok", "dns_def_c"], "failure_alert": 6.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "USER", "info_hint": "S2-D03: トラフィック集約装置の構成を確認。S2-I01・S2-C01・S2-C03への通信は常時監視（警戒度+12%）されています。S2-I07攻略による監視解除を推奨します。", "failure_mode": "reject", "exploit_failure_alert": 6.0, "question_answers": {"S2-D03:dns-q2": ["dns_cfg_ok"], "S2-D03:dns-q1": ["dns_axfr"], "S2-D03:dns-q3": ["dns_def_c"]}, "required_question": true}, "S2-D04": {"vulnerability": "管理プロキシの認証不備", "risk_level": "MEDIUM", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["web_bypass", "web_def_ok", "web_cfg_b"], "failure_alert": 5.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "USER", "info_hint": "S2-D04: 社内管理プロキシの設定を確認。証明書管理サーバー（S2-I04）および監査ログ中継（S2-I05）への通信中継が許可されます。", "failure_mode": "reject", "exploit_failure_alert": 5.0, "question_answers": {"S2-D04:web-q1": ["web_bypass"], "S2-D04:web-q2": ["web_def_ok"], "S2-D04:web-q3": ["web_cfg_b"]}, "required_question": true}, "S2-I01": {"vulnerability": "交換ハブの管理権限不備", "risk_level": "HIGH", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["priv_esc", "priv_sudo_b", "priv_def_c"], "failure_alert": 6.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ADMIN", "info_hint": "S2-I01: 通信交換ハブの管理権限を確認。保守用アカウントの権限設定ミスからADMIN権限への昇格が可能です。※S2-I07未攻略時は追加警戒度+12%が発生します。", "failure_mode": "reject", "exploit_failure_alert": 6.0, "question_answers": {"S2-I01:priv-q1": ["priv_esc"], "S2-I01:priv-q2": ["priv_sudo_b"], "S2-I01:priv-q3": ["priv_def_c"]}, "required_question": true}, "S2-I02": {"vulnerability": "内部ルーティング設定の不備", "risk_level": "HIGH", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["net_route", "net_fw_r1", "net_def_c"], "failure_alert": 6.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ADMIN", "info_hint": "S2-I02: 内部ルーターのACLルーティング設定を確認。転送制御テーブルを書き換えることで、転送ゲート（S2-C01）および迂回ゲート（S2-C04）への経路が開かれます。", "failure_mode": "reject", "exploit_failure_alert": 6.0, "question_answers": {"S2-I02:net-q2": ["net_fw_r1"], "S2-I02:net-q1": ["net_route"], "S2-I02:net-q3": ["net_def_c"]}, "required_question": true}, "S2-I03": {"vulnerability": "解析基盤のアクセス制御不備", "risk_level": "MEDIUM", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["priv_esc", "priv_sudo_b", "priv_def_c"], "failure_alert": 5.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ADMIN", "info_hint": "S2-I03: 予備解析基盤のクラスタ設定を確認。残存する計算リソースアーカイブを回収し、解析資源を最大+7補給可能です。", "failure_mode": "reject", "exploit_failure_alert": 5.0, "question_answers": {"S2-I03:priv-q1": ["priv_esc"], "S2-I03:priv-q2": ["priv_sudo_b"], "S2-I03:priv-q3": ["priv_def_c"]}, "required_question": true}, "S2-I04": {"vulnerability": "証明書管理APIの保護不足", "risk_level": "HIGH", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["vpn_downgrade", "vpn_cfg_ok", "vpn_def_c"], "failure_alert": 7.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ADMIN", "info_hint": "S2-I04: 社内PKI証明書管理APIを確認。正規クライアント証明書をエクスポート可能です。これにより証明書認証ゲート（S2-C02）の前提ロックが解除されます！", "failure_mode": "reject", "exploit_failure_alert": 7.0, "question_answers": {"S2-I04:vpn-q2": ["vpn_cfg_ok"], "S2-I04:vpn-q1": ["vpn_downgrade"], "S2-I04:vpn-q3": ["vpn_def_c"]}, "required_question": true}, "S2-I05": {"vulnerability": "監査ログ管理の権限不備", "risk_level": "MEDIUM", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["log_tamper", "log_def_ok", "log_cfg_b"], "failure_alert": 5.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ADMIN", "info_hint": "S2-I05: 監査ログ中継サーバーの書き換え権限を確認。中継バッファの通信ログを消去することで、全体の警戒度を-8%削減可能です。", "failure_mode": "reject", "exploit_failure_alert": 5.0, "question_answers": {"S2-I05:log-q1": ["log_tamper"], "S2-I05:log-q2": ["log_def_ok"], "S2-I05:log-q3": ["log_cfg_b"]}, "required_question": true}, "S2-I06": {"vulnerability": "バックアップ領域の設定不備", "risk_level": "LOW", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["acl_smb", "acl_cfg_ok", "acl_def_c"], "failure_alert": 4.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ADMIN", "info_hint": "S2-I06: 証跡バックアップのパーミッション設定を確認。読み取り可能なスナップショットから、解析資源を最大+5回収可能です。", "failure_mode": "reject", "exploit_failure_alert": 4.0, "question_answers": {"S2-I06:acl-q2": ["acl_cfg_ok"], "S2-I06:acl-q1": ["acl_smb"], "S2-I06:acl-q3": ["acl_def_c"]}, "required_question": true}, "S2-I07": {"vulnerability": "制御端末の認証不備", "risk_level": "CRITICAL", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["log_tamper", "log_def_ok", "log_cfg_b"], "failure_alert": 7.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ADMIN", "info_hint": "S2-I07: 常時監視センサーの制御端末を確認。制御APIを停止することで、対象ノード（S2-I01/C01/C03）の追加警戒度+12%を無効化し、監視迂回ゲート（S2-C04）を解放します！", "failure_mode": "reject", "exploit_failure_alert": 7.0, "question_answers": {"S2-I07:log-q1": ["log_tamper"], "S2-I07:log-q2": ["log_def_ok"], "S2-I07:log-q3": ["log_cfg_b"]}, "required_question": true}, "S2-C01": {"vulnerability": "転送ゲートの権限設定不備", "risk_level": "HIGH", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["net_route", "net_fw_r1", "net_def_c"], "failure_alert": 8.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ROOT", "info_hint": "S2-C01: Core直接転送ゲートのACL設定を確認。前提ロックなしで原本DB（S2-C03）へ接続可能ですが、S2-I07未攻略時は追加警戒度+12%が発生します。", "failure_mode": "reject", "exploit_failure_alert": 8.0, "question_answers": {"S2-C01:net-q1": ["net_route"], "S2-C01:net-q2": ["net_fw_r1"], "S2-C01:net-q3": ["net_def_c"]}, "required_question": true}, "S2-C02": {"vulnerability": "認証ゲートの設定不備", "risk_level": "CRITICAL", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["vpn_downgrade", "vpn_cfg_ok", "vpn_def_c"], "failure_alert": 8.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ROOT", "info_hint": "S2-C02: 相互TLS証明書認証ゲートを確認。S2-I04から取得したクライアント証明書を提示することで、原本DB（S2-C03）への安全な侵入路が開かれます。", "failure_mode": "reject", "exploit_failure_alert": 8.0, "question_answers": {"S2-C02:vpn-q2": ["vpn_cfg_ok"], "S2-C02:vpn-q1": ["vpn_downgrade"], "S2-C02:vpn-q3": ["vpn_def_c"]}, "required_question": true}, "S2-C03": {"vulnerability": "証跡DBの権限設定不備", "risk_level": "CRITICAL", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["db_sqli_union", "db_code_a", "db_def_c"], "failure_alert": 10.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ROOT", "info_hint": "S2-C03: 原本通信証跡データベースを確認。SQLインジェクション脆弱性を突いて原本ログを抽出し、偽装された通信証跡の真実を回収します！", "failure_mode": "reject", "exploit_failure_alert": 10.0, "question_answers": {"S2-C03:db-q1": ["db_sqli_union"], "S2-C03:db-q2": ["db_code_a"], "S2-C03:db-q3": ["db_def_c"]}, "required_question": true}, "S2-C04": {"vulnerability": "迂回ゲートの管理設定不備", "risk_level": "HIGH", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["log_tamper", "log_def_ok", "log_cfg_b"], "failure_alert": 8.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ROOT", "info_hint": "S2-C04: 監視網の迂回ゲートを確認。S2-I07の停止により解放され、侵入時に監視ログを消去して警戒度を-10%削減できます。", "failure_mode": "reject", "exploit_failure_alert": 8.0, "question_answers": {"S2-C04:log-q2": ["log_def_ok"], "S2-C04:log-q1": ["log_tamper"], "S2-C04:log-q3": ["log_cfg_b"]}, "required_question": true}, "external-1": {"vulnerability": "弱いSSHパスワード", "risk_level": "MEDIUM", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["ssh_bf", "ssh_cfg_b", "ssh_def_c"], "failure_alert": 5.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "GUEST", "info_hint": "external-1: 公開SSHサーバーのポート22を確認。パスワード試行回数の制限がなく、辞書攻撃による侵入が可能です。", "failure_mode": "reject", "exploit_failure_alert": 5.0, "question_answers": {"external-1:ssh-q2": ["ssh_cfg_b"], "external-1:ssh-q1": ["ssh_bf"], "external-1:ssh-q3": ["ssh_def_c"]}, "required_question": true}, "dmz-1": {"vulnerability": "古いApacheの既知の脆弱性", "risk_level": "MEDIUM", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["web_bypass", "web_def_ok", "web_cfg_b"], "failure_alert": 5.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "USER", "info_hint": "dmz-1: 古いバージョンのApache Webサーバーを確認。既知のパストラバーサル脆弱性により、内部設定ファイルの閲覧が可能です。", "failure_mode": "reject", "exploit_failure_alert": 5.0, "question_answers": {"dmz-1:web-q2": ["web_def_ok"], "dmz-1:web-q1": ["web_bypass"], "dmz-1:web-q3": ["web_cfg_b"]}, "required_question": true}, "dmz-2": {"vulnerability": "漏洩した社員アドレスへのフィッシング", "risk_level": "MEDIUM", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["mail_spoof", "mail_spf_ok", "mail_def_c"], "failure_alert": 5.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "USER", "info_hint": "dmz-2: 社員向けメールサーバーを確認。送信元ドメイン検証（SPF/DMARC）が甘く、標的型メールの送信が可能です。", "failure_mode": "reject", "exploit_failure_alert": 5.0, "question_answers": {"dmz-2:mail-q1": ["mail_spf_ok"], "dmz-2:mail-q2": ["mail_spoof"], "dmz-2:mail-q3": ["mail_def_c"]}, "required_question": true}, "internal-1": {"vulnerability": "Active Directoryの権限設定ミス", "risk_level": "HIGH", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["priv_esc", "priv_sudo_b", "priv_def_c"], "failure_alert": 5.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ADMIN", "info_hint": "internal-1: Active Directoryのドメイン構成を確認。サービスアカウントの過剰権限を利用してADMIN権限への昇格が可能です。", "failure_mode": "reject", "exploit_failure_alert": 5.0, "question_answers": {"internal-1:priv-q2": ["priv_sudo_b"], "internal-1:priv-q1": ["priv_esc"], "internal-1:priv-q3": ["priv_def_c"]}, "required_question": true}, "core-1": {"vulnerability": "SQLインジェクション", "risk_level": "CRITICAL", "required_scan": true, "allowed_scan_types": ["scan", "remoteScan"], "required_info": true, "correct_exploits": ["db_sqli_union", "db_code_a", "db_def_c"], "failure_alert": 8.0, "failure_resource": 1, "success_resource": 0, "required_privilege": "ROOT", "info_hint": "core-1: 機密データベースのクエリ処理を確認。SQLインジェクション脆弱性により、機密データの抽出が可能です！", "failure_mode": "reject", "exploit_failure_alert": 8.0, "question_answers": {"core-1:db-q2": ["db_code_a"], "core-1:db-q1": ["db_sqli_union"], "core-1:db-q3": ["db_def_c"]}, "required_question": true}};
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
  'E03': { resourceBonus: 5, alertDelta: 0, log: '公開情報アーカイブから解析ツールを回収。解析資源が +5 補給されました。' },
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
    nodeEffects: {
      'dmz-2': { resourceBonus: 5, alertDelta: -10, log: '踏み台メールサーバーの通信ログを消去！警戒度が -10% 低下し、解析資源 +5 を回収しました。' },
    },
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
      'E03': { resourceBonus: 5, alertDelta: 0, log: '公開情報アーカイブから解析ツールを回収。解析資源が +5 補給されました。' },
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
