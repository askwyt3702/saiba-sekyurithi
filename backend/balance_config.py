# バランス数値（暫定値）。ロジックに直接埋め込まず、ここだけ触れば調整できるようにする。
# frontend/src/game/data/balanceConfig.ts と同じ値にそろえてある（変更時は両方を更新すること）。

ACTION_COSTS = {
    # time: 消費するゲーム内秒数 / resource: 消費する解析資源 / alert_delta: 警戒度の増加量
    "scan":        {"time": 10, "resource": 1, "alert_delta": 2},
    "breach":      {"time": 20, "resource": 2, "alert_delta": 5},
    "dataExtract": {"time": 15, "resource": 3, "alert_delta": 10},
}

# 何も起きていない間の警戒度の自然減衰（1秒あたり）
ALERT_DECAY_PER_SECOND = 0.05

# 新規ゲーム開始時の値
INITIAL_ANALYSIS_RESOURCE = 25
INITIAL_PRIVILEGE = "GUEST"

# 警戒度がこの値に達したらゲームオーバー（api-contract.md 7節で未確定。暫定で即敗北）
ALERT_GAME_OVER_THRESHOLD = 100.0

# 権限の序列（暫定）。layer の並びと対応させ、侵入したノードの layer に応じて昇格する。
PRIVILEGE_LADDER = ["GUEST", "USER", "ADMIN", "ROOT"]
LAYER_ORDER = ["External", "DMZ", "Internal", "Core"]

# この日数だれもAPIを触らなかったゲームは自動で削除する（画面を開くたびに新規ゲームが作られて
# DBが膨らみ続けるのを防ぐ）。ただし /api/network 等の旧APIが使う「最初のゲーム」は消さない。
STALE_GAME_DAYS = 7

# ノードごとのセキュリティルール
SECURITY_RULES = {
    "E01": {
        "vulnerability": "弱いSSHパスワード",
        "risk_level": "MEDIUM",
        "required_scan": True,
        "failure_alert": 5,
        "success_resource": 3,
        "required_privilege": "GUEST",
    }
}