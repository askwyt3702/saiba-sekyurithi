

# ステージ1：OPERATION SILENT TRACE
# ノード・エッジのマスターデータ
# 起動時に node_master テーブルへ同期される


NODES = [
    # ==========================
    # External：外部ネットワーク
    # ==========================
    {
        "id": "E01",
        "name": "公開ゲートウェイ",
        "layer": "External",
        "pos_x": 650,
        "pos_y": 60,
        "vulnerability": "弱いSSHパスワード",
        "info": "ステージ1の唯一の初期侵入口。E01をスキャンして侵入すると、他のノードを探索できる。",
    },
    {
        "id": "E02",
        "name": "DNS情報サーバー",
        "layer": "External",
        "pos_x": 350,
        "pos_y": 60,
        "vulnerability": "DNS設定情報の漏洩",
        "info": "内部の接続先に関する手がかりが残っている。",
    },
    {
        "id": "E03",
        "name": "公開情報アーカイブ",
        "layer": "External",
        "pos_x": 950,
        "pos_y": 60,
        "vulnerability": "古い公開ファイルのアクセス制御不備",
        "info": "過去の公開情報が保管されている。解析資源の補給候補。",
    },

    # ==========================
    # DMZ：公開サービス領域
    # ==========================
    {
        "id": "D01",
        "name": "Webサーバー",
        "layer": "DMZ",
        "pos_x": 150,
        "pos_y": 230,
        "vulnerability": "古いWebサーバーの設定不備",
        "info": "高速侵入ルートの入口。",
    },
    {
        "id": "D02",
        "name": "メールサーバー",
        "layer": "DMZ",
        "pos_x": 400,
        "pos_y": 230,
        "vulnerability": "メール認証設定の不備",
        "info": "認証情報を収集するための入口。",
    },
    {
        "id": "D03",
        "name": "VPNゲートウェイ",
        "layer": "DMZ",
        "pos_x": 650,
        "pos_y": 230,
        "vulnerability": "古いVPN認証方式",
        "info": "隠密ルートへの接続点。",
    },
    {
        "id": "D04",
        "name": "Web管理サーバー",
        "layer": "DMZ",
        "pos_x": 100,
        "pos_y": 390,
        "vulnerability": "管理画面のアクセス制御不備",
        "info": "開発環境への侵入に役立つ管理情報がある。",
    },
    {
        "id": "D05",
        "name": "認証キャッシュ",
        "layer": "DMZ",
        "pos_x": 350,
        "pos_y": 390,
        "vulnerability": "認証情報の不適切な保存",
        "info": "VPN認証情報が残されている。",
    },
    {
        "id": "D06",
        "name": "プロキシサーバー",
        "layer": "DMZ",
        "pos_x": 850,
        "pos_y": 390,
        "vulnerability": "プロキシ設定の不備",
        "info": "通信の追跡を妨害できる可能性がある。",
    },
    {
        "id": "D07",
        "name": "DMZ監視装置",
        "layer": "DMZ",
        "pos_x": 1100,
        "pos_y": 390,
        "vulnerability": "監視システムの設定不備",
        "info": "ログ管理サーバーI03への迂回接続。痕跡削減ルートに進める。",
    },

    # ==========================
    # Internal：内部ネットワーク
    # ==========================
    {
        "id": "I01",
        "name": "社内認証サーバー",
        "layer": "Internal",
        "pos_x": 150,
        "pos_y": 580,
        "vulnerability": "認証権限の設定ミス",
        "info": "管理者トークンの取得候補。",
    },
    {
        "id": "I02",
        "name": "開発環境サーバー",
        "layer": "Internal",
        "pos_x": 400,
        "pos_y": 580,
        "vulnerability": "開発用サービスの保護不足",
        "info": "内部ルーターへの侵入経路。",
    },
    {
        "id": "I03",
        "name": "ログ管理サーバー",
        "layer": "Internal",
        "pos_x": 650,
        "pos_y": 580,
        "vulnerability": "ログ管理権限の不備",
        "info": "侵入の痕跡を削減できる可能性がある。",
    },
    {
        "id": "I04",
        "name": "ARGUS監視制御",
        "layer": "Internal",
        "pos_x": 900,
        "pos_y": 580,
        "vulnerability": "監視制御APIの認証不備",
        "info": "初回侵入で警戒度-20%。I03から回り込む安全ルートの重要ノード。効果は一度だけ。",
    },
    {
        "id": "I05",
        "name": "バックアップサーバー",
        "layer": "Internal",
        "pos_x": 1150,
        "pos_y": 580,
        "vulnerability": "バックアップ領域の権限不備",
        "info": "資源回収ルートの補給拠点。初回侵入で解析資源+10（上限30）。時間を使って後半の探索余力を確保できる。",
    },
    {
        "id": "I06",
        "name": "社内ファイルサーバー",
        "layer": "Internal",
        "pos_x": 150,
        "pos_y": 780,
        "vulnerability": "共有フォルダの権限不備",
        "info": "暗号鍵の断片Aが保管されている。",
    },
    {
        "id": "I07",
        "name": "管理端末",
        "layer": "Internal",
        "pos_x": 400,
        "pos_y": 780,
        "vulnerability": "管理用資格情報の保存不備",
        "info": "暗号鍵の断片Bが保管されている。",
    },
    {
        "id": "I08",
        "name": "内部ルーター",
        "layer": "Internal",
        "pos_x": 650,
        "pos_y": 780,
        "vulnerability": "ルーティング設定の不備",
        "info": "Coreネットワークへの主要接続点。",
    },
    {
        "id": "I09",
        "name": "セキュリティ管理サーバー",
        "layer": "Internal",
        "pos_x": 900,
        "pos_y": 780,
        "vulnerability": "防衛設定のアクセス制御不備",
        "info": "Coreファイアウォールの防御を弱められる。",
    },
    {
        "id": "I10",
        "name": "研究部門サーバー",
        "layer": "Internal",
        "pos_x": 1150,
        "pos_y": 780,
        "vulnerability": "研究用APIの認証不備",
        "info": "研究データへの最短接続点。補給はないため、残資源を確認してCoreへ進むこと。",
    },

    # ==========================
    # Core：機密領域
    # ==========================
    {
        "id": "C01",
        "name": "Coreファイアウォール",
        "layer": "Core",
        "pos_x": 300,
        "pos_y": 1020,
        "vulnerability": "ファイアウォール管理設定の不備",
        "info": "機密領域を守る主要防衛装置。",
    },
    {
        "id": "C02",
        "name": "暗号認証サーバー",
        "layer": "Core",
        "pos_x": 550,
        "pos_y": 1020,
        "vulnerability": "古い暗号認証設定",
        "info": "研究データの回収に必要な認証を管理する。",
    },
    {
        "id": "C03",
        "name": "研究データベース",
        "layer": "Core",
        "pos_x": 800,
        "pos_y": 1020,
        "vulnerability": "データベース権限設定の不備",
        "info": "ステージの最終目標。極秘研究データが存在する。",
    },
    {
        "id": "C04",
        "name": "緊急防衛システム",
        "layer": "Core",
        "pos_x": 1050,
        "pos_y": 1020,
        "vulnerability": "緊急制御機能の設定不備",
        "info": "高警戒時に起動するARGUSの防衛装置。",
    },
]

# 接続関係。現行ゲームロジックでは双方向に扱われる。
EDGE_PAIRS = [
    ("E01", "E02"),
    ("E01", "E03"),
    ("E01", "D01"),
    ("E01", "D02"),
    ("E02", "D03"),
    ("E03", "D06"),

    ("D01", "D04"),
    ("D01", "D07"),
    ("D02", "D05"),
    ("D02", "D07"),
    ("D03", "D06"),
    ("D03", "I03"),
    ("D04", "I02"),
    ("D05", "I01"),
    ("D05", "I06"),
    ("D06", "I03"),
    ("D06", "I05"),
    ("D07", "I03"),

    ("I01", "I07"),
    ("I01", "I08"),
    ("I02", "I08"),
    ("I02", "I10"),
    ("I03", "I04"),
    ("I03", "I05"),
    ("I04", "I09"),
    ("I05", "I06"),
    ("I06", "I07"),
    ("I06", "I10"),
    ("I07", "I09"),
    ("I08", "I09"),
    ("I08", "C01"),
    ("I09", "C01"),
    ("I09", "C04"),
    ("I10", "C02"),

    ("C01", "C02"),
    ("C01", "C04"),
    ("C02", "C03"),
    ("C04", "C03"),
]

EDGES = [
    {
        "id": f"e{i}",
        "source": source,
        "target": target,
        "animated": True,
    }
    for i, (source, target) in enumerate(EDGE_PAIRS, start=1)
]

# 階層情報は互換用。初期アクセスの判定はENTRY_NODE_IDSを使う。
ENTRY_LAYERS = {"External"}
ENTRY_NODE_IDS = {"E01"}


# ==========================================
# ステージ1：縦スクロール用マップ配置
# ==========================================




MAP_POSITIONS = {
    # External：スタートと分岐
    "E01": (600, 100),
    "E02": (300, 330),
    "E03": (900, 330),

    # DMZ：左右に広がる分岐
    "D01": (150, 600),
    "D02": (500, 700),
    "D03": (850, 600),

    "D04": (100, 1000),
    "D05": (450, 1100),
    "D06": (900, 1000),
    "D07": (1200, 1150),

    # Internal：ルートごとの攻略
    "I01": (150, 1450),
    "I02": (500, 1350),
    "I03": (850, 1450),
    "I04": (1200, 1400),

    "I06": (150, 1800),
    "I07": (450, 1900),
    "I08": (750, 1800),
    "I05": (1100, 1850),

    "I09": (850, 2200),
    "I10": (1200, 2150),

    # Core：最終目標
    "C01": (550, 2550),
    "C04": (1050, 2600),

    "C02": (700, 2900),
    "C03": (700, 3250),
}




# ==========================================
# ステージ1：補給ノードの報酬設定
# ==========================================

# ノードへの侵入成功時に獲得するRESOURCE
# 報酬は初回侵入時のみ獲得する
RESOURCE_REWARDS = {
    "E03": 5,   # 公開情報アーカイブ
    "I05": 10,  # バックアップサーバー（NODE_EFFECTSと二重加算しない）
}


# ==========================================
# マップ座標を各ノードへ反映
# ==========================================

for node in NODES:
    x, y = MAP_POSITIONS[node["id"]]
    node["pos_x"] = x
    node["pos_y"] = y


# ==========================================
# ステージ1：ギミック・目標ノード設定
# ==========================================

# 最終目標ノード
TARGET_NODE_IDS = {"C03"}

# 暗号鍵の断片があるノード
KEY_FRAGMENT_NODE_IDS = {"I06", "I07"}

# ノード侵入成功時の特殊効果
NODE_EFFECTS = {
    "E03": {
        "resource_bonus": 5,
        "alert_delta": 0.0,
        "log": "公開情報アーカイブから解析ツールを回収。解析資源が +5 補給されました。",
    },
    "D06": {
        "resource_bonus": 0,
        "alert_delta": -8.0,
        "log": "プロキシサーバーで通信経路を偽装。警戒度が低下しました。",
    },
    "I03": {
        "resource_bonus": 0,
        "alert_delta": -15.0,
        "log": "ログ管理サーバーの監査ログを改ざんし、侵入痕跡を削減しました（警戒度 -15%）。",
    },
    "I04": {
        "resource_bonus": 0,
        "alert_delta": -20.0,
        "log": "ARGUS監視制御を妨害！監視AIの警戒レベルを大幅に引き下げました（警戒度 -20%）。",
    },
    "I05": {
        "resource_bonus": 10,
        "alert_delta": 0.0,
        "log": "バックアップ領域から予備の計算リソースを確保。解析資源を最大10補給します（上限30）。",
    },
    "I06": {
        "resource_bonus": 0,
        "alert_delta": 0.0,
        "log": "【重要】社内ファイルサーバーから「暗号鍵の断片A」を入手しました。",
    },
    "I07": {
        "resource_bonus": 0,
        "alert_delta": 0.0,
        "log": "【重要】管理端末から「暗号鍵の断片B」を入手しました。",
    },
    "I09": {
        "resource_bonus": 3,
        "alert_delta": -10.0,
        "log": "セキュリティ管理サーバーを掌握。Core領域の防衛設定を弱体化させました（資源 +3 / 警戒度 -10%）。",
    },
    "C04": {
        "resource_bonus": 0,
        "alert_delta": -15.0,
        "log": "緊急防衛システムを無効化！ARGUSの緊急遮断プロトコルを停止しました（警戒度 -15%）。",
    },
}


# ==========================================
# 複数ステージ（ミッション）定義
# ==========================================
# シナリオ担当がミッション2・3を追加するときは STAGES に辞書を足すだけでよい。

TUTORIAL_NODES = [
    {"id": "external-1", "name": "External (公開サーバー)", "layer": "External", "pos_x": 600, "pos_y": 100,
     "vulnerability": "弱いSSHパスワード", "info": "最初の侵入口。SSHポート(22)が開いている。"},
    {"id": "dmz-1", "name": "DMZ (Webサーバー)", "layer": "DMZ", "pos_x": 380, "pos_y": 340,
     "vulnerability": "古いApacheの既知の脆弱性", "info": "古いバージョンのApacheが稼働中。"},
    {"id": "dmz-2", "name": "DMZ (メールサーバー)", "layer": "DMZ", "pos_x": 820, "pos_y": 340,
     "vulnerability": "漏洩した社員アドレスへのフィッシング", "info": "SMTPサーバー。社員のメールアドレスが漏洩している。"},
    {"id": "internal-1", "name": "Internal (社内網)", "layer": "Internal", "pos_x": 600, "pos_y": 580,
     "vulnerability": "Active Directoryの権限設定ミス", "info": "Active Directoryサーバー。アクセス権が厳重。"},
    {"id": "core-1", "name": "Core (機密DB)", "layer": "Core", "pos_x": 600, "pos_y": 820,
     "vulnerability": "SQLインジェクション", "info": "目標データが存在。SQLインジェクションの痕跡あり。"},
]

TUTORIAL_EDGES = [
    {"id": "e1", "source": "external-1", "target": "dmz-1", "animated": True},
    {"id": "e2", "source": "external-1", "target": "dmz-2", "animated": True},
    {"id": "e3", "source": "dmz-1", "target": "internal-1", "animated": True},
    {"id": "e4", "source": "dmz-2", "target": "internal-1", "animated": True},
    {"id": "e5", "source": "internal-1", "target": "core-1", "animated": True},
]

from stage2_data import STAGE2

DEFAULT_STAGE_ID = 1

STAGES = {
    0: {
        "id": 0,
        "name": "TRAINING: 基礎侵入訓練",
        "difficulty": "tutorial",
        "nodes": TUTORIAL_NODES,
        "edges": TUTORIAL_EDGES,
        "entry_layers": {"External"},
        "entry_node_ids": {"external-1"},
        "target_node_ids": {"core-1"},
        "key_fragment_node_ids": set(),
        "node_effects": {},
    },
    1: {
        "id": 1,
        "name": "OPERATION SILENT TRACE: 消えた機密データ",
        "difficulty": "beginner",
        "nodes": NODES,
        "edges": EDGES,
        "entry_layers": ENTRY_LAYERS,
        "entry_node_ids": ENTRY_NODE_IDS,
        "target_node_ids": TARGET_NODE_IDS,
        "key_fragment_node_ids": KEY_FRAGMENT_NODE_IDS,
        "node_effects": NODE_EFFECTS,
    },
    2: STAGE2,
}

# 全ステージの全ノード（DBの node_master 同期用）
ALL_STAGE_NODES = [node for stage in STAGES.values() for node in stage["nodes"]]


def get_stage(stage_id: int) -> dict:
    """指定された stage_id のステージ定義を返す（未定義なら既定ステージ 1 にフォールバック）。"""
    return STAGES.get(stage_id, STAGES[DEFAULT_STAGE_ID])
