# バランス数値（暫定値）
# 変えたらリポジトリのルートで `python scripts/gen_stage_data.py` を実行し、
# 生成された frontend/src/game/data/stageData.ts も同じコミットに含めること。

ACTION_COSTS = {
    # 通常スキャン
    "scan": {
        "time": 10,
        "resource": 1,
        "alert_delta": 2,
    },

    # リモートスキャン
    "remoteScan": {
        "time": 25,
        "resource": 4,
        "alert_delta": 8,
    },

    # 侵入
    "breach": {
        "time": 20,
        "resource": 2,
        "alert_delta": 5,
    },

    # データ回収
    "dataExtract": {
        "time": 15,
        "resource": 3,
        "alert_delta": 10,
    },

    # RESOURCE回復
    "recover": {
        "time": 30,
        "resource": 0,
        "alert_delta": 12,
    },
}

# 警戒度の自然減衰
ALERT_DECAY_PER_SECOND = 0.05

# ゲーム開始時の値
INITIAL_ANALYSIS_RESOURCE = 25
INITIAL_PRIVILEGE = "GUEST"

# 警戒度100%でゲームオーバー
ALERT_GAME_OVER_THRESHOLD = 100.0

# 権限の序列
PRIVILEGE_LADDER = ["GUEST", "USER", "ADMIN", "ROOT"]
LAYER_ORDER = ["External", "DMZ", "Internal", "Core"]

# RESOURCE回復システム
RESOURCE_RECOVERY_AMOUNT = 5
MAX_ANALYSIS_RESOURCE = 30

# 一定期間操作されていないゲームを自動削除する日数
# 旧APIが使用する最初のゲームは削除対象外
STALE_GAME_DAYS = 7

# ノードごとのセキュリティルール
SECURITY_RULES = {
    "E01": {
        "vulnerability": "弱いSSHパスワード",
        "risk_level": "MEDIUM",
        "required_scan": True,
        "allowed_scan_types": ["scan"],
        "correct_exploits": ["ssh_bf", "ssh_cfg_b"],
        "failure_alert": 5.0,
        "failure_resource": 1,
        "success_resource": 0,
        "required_privilege": "GUEST",
        "info_hint": "E01: 公開SSHゲートウェイの構成を確認。Port 22にてパスワード認証（PasswordAuthentication yes）が許可されており、ログイン試行制限（Fail2ban等）が未導入です。辞書攻撃（hydra）による突破が有効です。",
    },
    "E02": {
        "vulnerability": "DNS設定情報の漏洩",
        "risk_level": "MEDIUM",
        "required_scan": True,
        "allowed_scan_types": ["scan", "remoteScan"],
        "required_info": True,
        "correct_exploits": ["dns_axfr", "dns_cfg_ok"],
        "failure_alert": 5.0,
        "failure_resource": 1,
        "success_resource": 0,
        "required_privilege": "GUEST",
        "info_hint": "E02: DNSサーバーのゾーン転送設定（AXFR）の不備を確認。内部ドメイン「corp.local」のレコード一覧を取得可能。DMZ層の Web(D01)・Mail(D02) の内部通信経路を特定しました。",
    },
    "E03": {
        "vulnerability": "古い公開ファイルのアクセス制御不備",
        "risk_level": "LOW",
        "required_scan": True,
        "allowed_scan_types": ["scan", "remoteScan"],
        "required_info": True,
        "correct_exploits": ["acl_smb", "acl_cfg_ok"],
        "failure_alert": 3.0,
        "failure_resource": 1,
        "success_resource": 0,
        "required_privilege": "GUEST",
        "info_hint": "E03: アーカイブサーバーの公開ディレクトリを確認。旧システム移行用バックアップファイルがアクセス制限なしで露出。内部ツールの解析資源（RESOURCE +5）を回収可能です。",
    },
    # ---------- DMZ層 (D01 - D07) ----------
    "D01": {
        "vulnerability": "古いWebサーバーの設定不備",
        "risk_level": "MEDIUM",
        "required_scan": True,
        "allowed_scan_types": ["scan", "remoteScan"],
        "required_info": True,
        "correct_exploits": ["web_bypass", "web_def_ok"],
        "failure_alert": 5.0,
        "failure_resource": 1,
        "success_resource": 0,
        "required_privilege": "USER",
        "info_hint": "D01: Webサーバーの公開設定を確認。古いApacheのパストラバーサル脆弱性が残存しており、非公開の管理APIへの不正リクエストが可能です。",
    },
    "D02": {
        "vulnerability": "メール認証設定の不備",
        "risk_level": "MEDIUM",
        "required_scan": True,
        "allowed_scan_types": ["scan", "remoteScan"],
        "required_info": True,
        "correct_exploits": ["mail_spoof", "mail_spf_ok"],
        "failure_alert": 5.0,
        "failure_resource": 1,
        "success_resource": 0,
        "required_privilege": "USER",
        "info_hint": "D02: メールサーバーのDNSレコードを確認。SPF/DMARCが未設定（p=none）のため、送信元ドメインの偽装が可能です。",
    },
    "D03": {
        "vulnerability": "古いVPN認証方式",
        "risk_level": "HIGH",
        "required_scan": True,
        "allowed_scan_types": ["scan", "remoteScan"],
        "required_info": True,
        "correct_exploits": ["vpn_downgrade", "vpn_cfg_ok"],
        "failure_alert": 6.0,
        "failure_resource": 1,
        "success_resource": 0,
        "required_privilege": "USER",
        "info_hint": "D03: VPNエンドポイントの暗号スイートを確認。古い暗号化プロトコル（IKEv1/DES）が有効化されており、ダウングレード攻撃が可能です。",
    },
    "D04": {
        "vulnerability": "管理画面のアクセス制御不備",
        "risk_level": "MEDIUM",
        "required_scan": True,
        "allowed_scan_types": ["scan", "remoteScan"],
        "required_info": True,
        "correct_exploits": ["web_bypass", "web_def_ok"],
        "failure_alert": 5.0,
        "failure_resource": 1,
        "success_resource": 0,
        "required_privilege": "USER",
        "info_hint": "D04: Web管理コンソールのアクセス制御を確認。IP制限が不十分で、X-Forwarded-Forヘッダ偽装による管理権限バイパスが可能です。",
    },
    "D05": {
        "vulnerability": "認証情報の不適切な保存",
        "risk_level": "MEDIUM",
        "required_scan": True,
        "allowed_scan_types": ["scan", "remoteScan"],
        "required_info": True,
        "correct_exploits": ["cred_dump", "cred_code_b"],
        "failure_alert": 5.0,
        "failure_resource": 1,
        "success_resource": 0,
        "required_privilege": "USER",
        "info_hint": "D05: メモリキャッシュサーバーの設定を確認。セッショントークンおよびVPN認証情報が平文でキャッシュに残存しています。",
    },
    "D06": {
        "vulnerability": "プロキシ設定の不備",
        "risk_level": "LOW",
        "required_scan": True,
        "allowed_scan_types": ["scan", "remoteScan"],
        "required_info": True,
        "correct_exploits": ["log_tamper", "log_def_ok"],
        "failure_alert": 4.0,
        "failure_resource": 1,
        "success_resource": 0,
        "required_privilege": "USER",
        "info_hint": "D06: 社内プロキシサーバーの転送設定を確認。アクセス制御リスト（ACL）の誤設定により、通信経路を偽装して警戒度を削減可能です。",
    },
    "D07": {
        "vulnerability": "監視システムの設定不備",
        "risk_level": "HIGH",
        "required_scan": True,
        "allowed_scan_types": ["scan", "remoteScan"],
        "required_info": True,
        "correct_exploits": ["log_tamper", "log_def_ok"],
        "failure_alert": 6.0,
        "failure_resource": 1,
        "success_resource": 0,
        "required_privilege": "USER",
        "info_hint": "D07: DMZ境界の監視装置を確認。SNMPコミュニティ名がデフォルト（public）のままであり、監視センサーのシグネチャ設定を読み取れます。",
    },
}

# API・ログ・Mock・リザルトで共有（gen_stage_data.pyでフロントへ生成）。
# 回復は最大+50点に対して警戒度コスト52.5点以上で、得点稼ぎにならない。
EVALUATION_CONFIG = {
    "baseScore": 1000,
    "timeGraceSeconds": 240,
    "timePenaltyPerSecond": 0.5,
    "alertPenaltyPerPoint": 5,
    "resourceBonusPerPoint": 10,
    "resourceBonusCap": 10,
    "thresholds": [
        {"rank": "S", "minimum": 900, "title": "完璧な隠密作戦 (GHOST OPERATIVE)"},
        {"rank": "A", "minimum": 750, "title": "優秀な侵入工作 (SHADOW AGENT)"},
        {"rank": "B", "minimum": 550, "title": "作戦目標達成 (FIELD OPERATIVE)"},
        {"rank": "C", "minimum": 350, "title": "強行突破による生還 (LOUD BREACHER)"},
        {"rank": "D", "minimum": 0, "title": "作戦完遂・改善の余地あり (SURVIVOR)"},
    ],
}
