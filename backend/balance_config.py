
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
