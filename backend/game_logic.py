"""ゲームのルール（権威ロジック）。
API層(main.py)からは「状態の取得」と「アクションの適用」だけを呼び出す。
バランス数値は balance_config.py、ステージ構造は game_data.py に分離してある。
"""
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import bindparam, func, inspect, text
from sqlalchemy.orm import Session

import models
from balance_config import (
    ACTION_COSTS,
    ALERT_DECAY_PER_SECOND,
    ALERT_GAME_OVER_THRESHOLD,
    INITIAL_ANALYSIS_RESOURCE,
    INITIAL_PRIVILEGE,
    LAYER_ORDER,
    PRIVILEGE_LADDER,
    STALE_GAME_DAYS,
)
from game_data import (
    ALL_STAGE_NODES,
    DEFAULT_STAGE_ID,
    STAGES,
    get_stage,
)

TIMED_ACTIONS = ("scan", "breach", "dataExtract")


class ActionRejected(Exception):
    """アクションを受理できなかったときに投げる。reason は api-contract.md の却下理由。"""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


# ---------- 小さなヘルパー ----------

def _clamp_alert(value: float) -> float:
    return max(0.0, min(100.0, value))


def _privilege_index(privilege: str) -> int:
    return PRIVILEGE_LADDER.index(privilege) if privilege in PRIVILEGE_LADDER else 0


def _layer_index(layer: str) -> int:
    return LAYER_ORDER.index(layer) if layer in LAYER_ORDER else len(LAYER_ORDER) - 1


def _player_stage(player: models.PlayerStatus) -> dict:
    stage_id = player.stage_id if player.stage_id is not None else DEFAULT_STAGE_ID
    return get_stage(stage_id)


def _neighbors(node_id: str, edges: list[dict]) -> set[str]:
    result = set()
    for e in edges:
        if e["source"] == node_id:
            result.add(e["target"])
        elif e["target"] == node_id:
            result.add(e["source"])
    return result


def _node_statuses(db: Session, player: models.PlayerStatus) -> dict[str, str]:
    rows = db.query(models.NodeState).filter(models.NodeState.player_id == player.id).all()
    return {row.node_id: row.status for row in rows}


def _set_node_status(db: Session, player: models.PlayerStatus, node_id: str, status: str) -> None:
    row = db.query(models.NodeState).filter(
        models.NodeState.player_id == player.id,
        models.NodeState.node_id == node_id,
    ).first()
    if row is None:
        db.add(models.NodeState(player_id=player.id, node_id=node_id, status=status))
    else:
        row.status = status


def add_log(db: Session, player: models.PlayerStatus, severity: str, message: str) -> None:
    db.add(models.GameLog(
        player_id=player.id,
        timestamp=player.game_time,
        message=message,
        severity=severity,
    ))


def evaluate_mission_result(player: models.PlayerStatus) -> dict:
    """作戦クリア時のスコアとランク(S/A/B/C)を算出する。"""
    alert_penalty = round(player.alert_level * 8)
    time_penalty = max(0, (player.game_time - 200) // 2)
    resource_bonus = player.analysis_resource * 15
    score = max(0, 1000 - alert_penalty - time_penalty + resource_bonus)

    if score >= 900 or (player.alert_level <= 25.0 and player.analysis_resource >= 5):
        rank, title = "S", "完璧な隠密作戦 (GHOST OPERATIVE)"
    elif score >= 750 or player.alert_level <= 50.0:
        rank, title = "A", "優秀な侵入工作 (SHADOW AGENT)"
    elif score >= 550 or player.alert_level <= 75.0:
        rank, title = "B", "作戦目標達成 (FIELD OPERATIVE)"
    else:
        rank, title = "C", "強行突破による生還 (LOUD BREACHER)"

    return {"rank": rank, "score": score, "title": title}


# ---------- ゲームの生成・取得 ----------

def list_stages() -> list[dict]:
    """選択可能なステージ一覧を返す。"""
    return [
        {
            "id": s["id"],
            "name": s["name"],
            "difficulty": s["difficulty"],
            "nodeCount": len(s["nodes"]),
        }
        for s in STAGES.values()
    ]


def create_game(db: Session, stage_id: int = DEFAULT_STAGE_ID) -> models.PlayerStatus:
    stage = get_stage(stage_id)
    player = models.PlayerStatus(
        game_time=0,
        alert_level=0.0,
        analysis_resource=INITIAL_ANALYSIS_RESOURCE,
        current_privilege=INITIAL_PRIVILEGE,
        game_status="playing",
        stage_id=stage["id"],
    )
    db.add(player)
    db.flush()  # id を確定させる
    add_log(db, player, "info", "侵入作戦を開始しました。まずは公開サーバーをスキャンしてください。")
    db.commit()
    db.refresh(player)
    return player


def reset_game(
    db: Session, player: models.PlayerStatus, stage_id: Optional[int] = None
) -> models.PlayerStatus:
    """指定されたゲームを初期状態にリセットする（stage_id を渡せば別ステージに切り替え可能）。"""
    db.query(models.NodeState).filter(models.NodeState.player_id == player.id).delete()
    db.query(models.GameLog).filter(models.GameLog.player_id == player.id).delete()

    if stage_id is not None:
        player.stage_id = get_stage(stage_id)["id"]
    elif player.stage_id is None:
        player.stage_id = DEFAULT_STAGE_ID

    player.game_time = 0
    player.alert_level = 0.0
    player.analysis_resource = INITIAL_ANALYSIS_RESOURCE
    player.current_privilege = INITIAL_PRIVILEGE
    player.game_status = "playing"

    add_log(db, player, "info", "侵入作戦を開始しました。まずは公開サーバーをスキャンしてください。")
    db.commit()
    db.refresh(player)
    return player


def get_game(db: Session, game_id: int) -> Optional[models.PlayerStatus]:
    return db.query(models.PlayerStatus).filter(models.PlayerStatus.id == game_id).first()


def touch_game(db: Session, player: models.PlayerStatus) -> None:
    """「このゲームは今使われている」と記録する（古いゲームの掃除の判断材料）。"""
    player.last_accessed_at = models.utcnow()
    db.commit()


def _delete_legacy_pending_actions(db: Session, column: str, ids: list) -> None:
    """過去にリアルタイム版で作られた pending_action テーブルが既存DBに残っていると、
    player_status / node_master への外部キーのせいで行の削除に失敗するため、あれば先に掃除する。
    （現行のコードでは使っていないテーブルなので、モデルには定義していない）
    """
    if ids and inspect(db.get_bind()).has_table("pending_action"):
        db.execute(
            text(f"DELETE FROM pending_action WHERE {column} IN :ids").bindparams(
                bindparam("ids", value=ids, expanding=True)
            )
        )


def remove_obsolete_nodes(db: Session) -> int:
    """game_data.py のどのステージにも存在しない古いノードを DB から削除し、削除した件数を返す。"""
    valid_ids = {n["id"] for n in ALL_STAGE_NODES}
    obsolete_ids = [
        row[0] for row in db.query(models.NodeMaster.id).filter(models.NodeMaster.id.notin_(valid_ids))
    ]
    if not obsolete_ids:
        return 0
    db.query(models.NodeState).filter(models.NodeState.node_id.in_(obsolete_ids)).delete(synchronize_session=False)
    _delete_legacy_pending_actions(db, "node_id", obsolete_ids)
    db.query(models.NodeMaster).filter(models.NodeMaster.id.in_(obsolete_ids)).delete(synchronize_session=False)
    db.commit()
    return len(obsolete_ids)


def cleanup_stale_games(
    db: Session, now: Optional[datetime] = None, max_age_days: int = STALE_GAME_DAYS
) -> int:
    """max_age_days 日以上だれも触っていないゲームを削除し、削除した件数を返す。
    旧API(/api/network, /api/scan)が使う「最初のゲーム」は、古くても消さない。
    """
    cutoff = (now or models.utcnow()) - timedelta(days=max_age_days)
    keep_id = db.query(func.min(models.PlayerStatus.id)).scalar()
    stale_ids = [
        row[0]
        for row in db.query(models.PlayerStatus.id).filter(
            models.PlayerStatus.last_accessed_at < cutoff,
            models.PlayerStatus.id != keep_id,
        )
    ]
    if not stale_ids:
        return 0

    db.query(models.NodeState).filter(models.NodeState.player_id.in_(stale_ids)).delete(synchronize_session=False)
    db.query(models.GameLog).filter(models.GameLog.player_id.in_(stale_ids)).delete(synchronize_session=False)
    _delete_legacy_pending_actions(db, "player_id", stale_ids)
    db.query(models.PlayerStatus).filter(models.PlayerStatus.id.in_(stale_ids)).delete(synchronize_session=False)
    db.commit()
    return len(stale_ids)


def build_game_state(db: Session, player: models.PlayerStatus) -> dict:
    """api-contract.md 2.2 の GameState の形に組み立てる。"""
    stage = _player_stage(player)
    stage_nodes = stage["nodes"]
    stage_node_ids = {n["id"] for n in stage_nodes}
    order = {n["id"]: i for i, n in enumerate(stage_nodes)}

    statuses = _node_statuses(db, player)
    db_nodes = sorted(
        db.query(models.NodeMaster).filter(models.NodeMaster.id.in_(stage_node_ids)).all(),
        key=lambda n: order.get(n.id, len(order)),
    )

    nodes = []
    for node in db_nodes:
        status = statuses.get(node.id, "unscanned")
        revealed = status != "unscanned"
        nodes.append({
            "id": node.id,
            "position": {"x": node.pos_x, "y": node.pos_y},
            "data": {
                "label": node.name,
                "layer": node.layer,
                # 未スキャンなら情報を隠し、スキャン済み・侵入済みなら開示する
                "info": node.info if revealed else "不明（スキャンが必要です）",
                "vulnerability": node.vulnerability if revealed else None,
                "status": status,
            },
        })

    logs = db.query(models.GameLog).filter(
        models.GameLog.player_id == player.id
    ).order_by(models.GameLog.id).all()

    return {
        "gameId": str(player.id),
        "stageId": stage["id"],
        "status": player.game_status,
        "elapsedSeconds": player.game_time,
        "alertLevel": round(player.alert_level, 2),
        "analysisResource": player.analysis_resource,
        "privilege": player.current_privilege,
        "evaluation": evaluate_mission_result(player) if player.game_status == "won" else None,
        "nodes": nodes,
        "edges": stage["edges"],
        "log": [
            {"id": str(l.id), "timestamp": l.timestamp, "message": l.message, "severity": l.severity}
            for l in logs
        ],
    }


# ---------- アクション ----------

def _validate_timed_action(
    db: Session, player: models.PlayerStatus, action_type: str, node: Optional[models.NodeMaster]
) -> None:
    if player.game_status != "playing":
        raise ActionRejected("invalid_state")
    if node is None:
        raise ActionRejected("invalid_state")

    stage = _player_stage(player)
    stage_node_ids = {n["id"] for n in stage["nodes"]}
    if node.id not in stage_node_ids:
        raise ActionRejected("invalid_state")

    cost = ACTION_COSTS[action_type]
    if player.analysis_resource < cost["resource"]:
        raise ActionRejected("insufficient_resource")

    statuses = _node_statuses(db, player)
    status = statuses.get(node.id, "unscanned")

    if action_type == "scan":
        if status != "unscanned":
            raise ActionRejected("invalid_state")

    elif action_type == "breach":
        if status == "hacked":
            raise ActionRejected("invalid_state")
        if status != "scanned":
            raise ActionRejected("node_not_scanned")
        # 入口 layer 以外は、隣接ノードのどれかを侵入済みにしていないと届かない
        if node.layer not in stage["entry_layers"]:
            if not any(statuses.get(n) == "hacked" for n in _neighbors(node.id, stage["edges"])):
                raise ActionRejected("node_unreachable")
        if _privilege_index(player.current_privilege) < _layer_index(node.layer):
            raise ActionRejected("insufficient_privilege")

    elif action_type == "dataExtract":
        if node.layer != "Core" or status != "hacked":
            raise ActionRejected("invalid_state")
        target_ids = stage["target_node_ids"]
        if target_ids and node.id not in target_ids:
            raise ActionRejected("invalid_state")


def _advance_time(player: models.PlayerStatus, seconds: int, alert_delta: float) -> None:
    """アクションにかかった時間を経過させ、警戒度を更新する（ターン制）。"""
    player.game_time += seconds
    player.alert_level = _clamp_alert(
        player.alert_level - ALERT_DECAY_PER_SECOND * seconds + alert_delta
    )


def _check_game_over(db: Session, player: models.PlayerStatus) -> None:
    if player.game_status != "playing":
        return
    if player.alert_level >= ALERT_GAME_OVER_THRESHOLD:
        player.game_status = "lost"
        add_log(db, player, "danger", "警戒度が限界に達しました。侵入が検知され、作戦は失敗です。")
    elif player.analysis_resource <= 0:
        player.game_status = "lost"
        add_log(db, player, "danger", "解析資源が枯渇しました。これ以上の作戦継続は不可能です。")


def _apply_node_effect(db: Session, player: models.PlayerStatus, node: models.NodeMaster) -> None:
    """ノード侵入(breach)成功時に、ステージ固有の特殊効果(資源補給・痕跡削減・鍵断片入手など)を適用する。"""
    stage = _player_stage(player)
    effect = stage["node_effects"].get(node.id)
    if not effect:
        return

    res_bonus = effect.get("resource_bonus", 0)
    alert_delta = effect.get("alert_delta", 0.0)
    if res_bonus:
        player.analysis_resource = max(0, player.analysis_resource + res_bonus)
    if alert_delta:
        player.alert_level = _clamp_alert(player.alert_level + alert_delta)

    msg = effect.get("log")
    if msg:
        add_log(db, player, "info", msg)

    # 暗号鍵の断片ノードがすべて揃った瞬間にお知らせログを出す
    key_ids = stage["key_fragment_node_ids"]
    if key_ids and node.id in key_ids:
        statuses = _node_statuses(db, player)
        statuses[node.id] = "hacked"
        if all(statuses.get(kid) == "hacked" for kid in key_ids):
            add_log(
                db,
                player,
                "success",
                "すべての暗号鍵断片が揃いました！最終目標のデータ回収時に警戒度上昇を完全に抑えられます。",
            )


def apply_action(db: Session, player: models.PlayerStatus, action_type: str, node_id: Optional[str]) -> None:
    """アクションを検証して適用する。却下時は ActionRejected を投げる（DBは変更しない）。"""

    if action_type == "pause":
        if player.game_status != "playing":
            raise ActionRejected("invalid_state")
        player.game_status = "paused"
        add_log(db, player, "info", "作戦を一時停止しました。")
        db.commit()
        return

    if action_type == "resume":
        if player.game_status != "paused":
            raise ActionRejected("invalid_state")
        player.game_status = "playing"
        add_log(db, player, "info", "作戦を再開しました。")
        db.commit()
        return

    if action_type not in TIMED_ACTIONS:
        raise ActionRejected("invalid_state")

    node = None
    if node_id is not None:
        node = db.query(models.NodeMaster).filter(models.NodeMaster.id == node_id).first()

    _validate_timed_action(db, player, action_type, node)

    stage = _player_stage(player)
    key_ids = stage["key_fragment_node_ids"]
    cost = ACTION_COSTS[action_type]
    player.analysis_resource -= cost["resource"]

    # 暗号鍵の断片がすべて揃っている場合、dataExtract 時の警戒度増加を 0 に抑える
    alert_delta = cost["alert_delta"]
    has_all_keys = False
    if action_type == "dataExtract" and key_ids:
        statuses = _node_statuses(db, player)
        if all(statuses.get(kid) == "hacked" for kid in key_ids):
            alert_delta = 0.0
            has_all_keys = True

    _advance_time(player, cost["time"], alert_delta)

    if action_type == "scan":
        _set_node_status(db, player, node.id, "scanned")
        add_log(db, player, "success", f"{node.name} のスキャンが完了しました。脆弱性: {node.vulnerability or '不明'}")

    elif action_type == "breach":
        _set_node_status(db, player, node.id, "hacked")
        # 侵入した layer に応じて権限を昇格（下がることはない）
        granted = min(_layer_index(node.layer) + 1, len(PRIVILEGE_LADDER) - 1)
        if granted > _privilege_index(player.current_privilege):
            player.current_privilege = PRIVILEGE_LADDER[granted]
            add_log(db, player, "success", f"{node.name} への侵入に成功。権限が {player.current_privilege} に昇格しました。")
        else:
            add_log(db, player, "success", f"{node.name} への侵入に成功しました。")
        _apply_node_effect(db, player, node)

    elif action_type == "dataExtract":
        if has_all_keys:
            add_log(db, player, "success", f"復元した暗号鍵を使用し、{node.name} から極秘研究データを隠密回収しました。目的達成！")
        else:
            add_log(db, player, "success", f"{node.name} から機密データを回収しました。目的達成！")
        player.game_status = "won"
        ev = evaluate_mission_result(player)
        add_log(
            db,
            player,
            "success",
            f"作戦評価: RANK {ev['rank']}（スコア: {ev['score']} / 経過: {player.game_time}秒 / 最終警戒度: {player.alert_level:.0f}% / 残資源: {player.analysis_resource}） - {ev['title']}",
        )

    if player.alert_level >= 70 and player.game_status == "playing":
        add_log(db, player, "warning", f"警戒度が {player.alert_level:.0f}% に上昇しています。")

    _check_game_over(db, player)
    db.commit()
