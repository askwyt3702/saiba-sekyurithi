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
    SECURITY_RULES,
)
from game_data import EDGES, ENTRY_LAYERS, NODES

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


def _neighbors(node_id: str) -> set[str]:
    result = set()
    for e in EDGES:
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

def _security_event_done(
    db: Session,
    player: models.PlayerStatus,
    node_id: str,
    event_key: str,
) -> bool:
    marker = f"[SECURITY:{node_id}:{event_key}]"

    return (
        db.query(models.GameLog)
        .filter(
            models.GameLog.player_id == player.id,
            models.GameLog.message == marker,
        )
        .first()
        is not None
    )


# ---------- ゲームの生成・取得 ----------

def create_game(db: Session) -> models.PlayerStatus:
    player = models.PlayerStatus(
        game_time=0,
        alert_level=0.0,
        analysis_resource=INITIAL_ANALYSIS_RESOURCE,
        current_privilege=INITIAL_PRIVILEGE,
        game_status="playing",
    )
    db.add(player)
    db.flush()  # id を確定させる
    add_log(db, player, "info", "侵入作戦を開始しました。まずは公開サーバーをスキャンしてください。")
    db.commit()
    db.refresh(player)
    return player


def reset_game(db: Session, player: models.PlayerStatus) -> models.PlayerStatus:
    """指定されたゲームを初期状態にリセットする。"""
    db.query(models.NodeState).filter(models.NodeState.player_id == player.id).delete()
    db.query(models.GameLog).filter(models.GameLog.player_id == player.id).delete()

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
    """game_data.py に無いノードを DB から削除し、削除した件数を返す。
    ステージのデータを差し替えたときに、古いノードがゲーム状態に混ざり続けないようにする。
    """
    valid_ids = {n["id"] for n in NODES}
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
    statuses = _node_statuses(db, player)
    nodes = []
    order = {n["id"]: i for i, n in enumerate(NODES)}
    db_nodes = sorted(db.query(models.NodeMaster).all(), key=lambda n: order.get(n.id, len(order)))
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
        "status": player.game_status,
        "elapsedSeconds": player.game_time,
        "alertLevel": round(player.alert_level, 2),
        "analysisResource": player.analysis_resource,
        "privilege": player.current_privilege,
        "nodes": nodes,
        "edges": EDGES,
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
        if node.layer not in ENTRY_LAYERS:
            if not any(statuses.get(n) == "hacked" for n in _neighbors(node.id)):
                raise ActionRejected("node_unreachable")
        if _privilege_index(player.current_privilege) < _layer_index(node.layer):
            raise ActionRejected("insufficient_privilege")

    elif action_type == "dataExtract":
        if node.layer != "Core" or status != "hacked":
            raise ActionRejected("invalid_state")


def _advance_time(player: models.PlayerStatus, seconds: int, alert_delta: float) -> None:
    """アクションにかかった時間を経過させ、警戒度を更新する（ターン制）。"""
    player.game_time += seconds
    player.alert_level = _clamp_alert(
        player.alert_level - ALERT_DECAY_PER_SECOND * seconds + alert_delta
    )


def _check_game_over(db: Session, player: models.PlayerStatus) -> None:
    if player.game_status == "playing" and player.alert_level >= ALERT_GAME_OVER_THRESHOLD:
        player.game_status = "lost"
        add_log(db, player, "danger", "警戒度が限界に達しました。侵入が検知され、作戦は失敗です。")


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

    # E01：情報確認
    if action_type == "confirmInfo":
        if player.game_status != "playing":
            raise ActionRejected("invalid_state")

        if node_id not in SECURITY_RULES:
            raise ActionRejected("invalid_state")

        statuses = _node_statuses(db, player)

        if statuses.get(node_id) != "scanned":
            raise ActionRejected("node_not_scanned")

        if _security_event_done(db, player, node_id, "INFO_CONFIRMED"):
            raise ActionRejected("invalid_state")

        add_log(
            db,
            player,
            "success",
            f"[SECURITY:{node_id}:INFO_CONFIRMED]"
        )
        db.commit()
        return

    # E01：解析イベント完了
    if action_type == "completeAnalysis":
        if player.game_status != "playing":
            raise ActionRejected("invalid_state")

        if node_id not in SECURITY_RULES:
            raise ActionRejected("invalid_state")

        if not _security_event_done(
            db, player, node_id, "INFO_CONFIRMED"
        ):
            raise ActionRejected("invalid_state")

        if _security_event_done(
            db, player, node_id, "ANALYSIS_COMPLETED"
        ):
            raise ActionRejected("invalid_state")

        add_log(
            db,
            player,
            "success",
            f"[SECURITY:{node_id}:ANALYSIS_COMPLETED]"
        )
        db.commit()
        return

    if action_type not in TIMED_ACTIONS:
        raise ActionRejected("invalid_state")

    node = None
    if node_id is not None:
        node = db.query(models.NodeMaster).filter(models.NodeMaster.id == node_id).first()

    _validate_timed_action(db, player, action_type, node)



        
    cost = ACTION_COSTS[action_type]
    player.analysis_resource -= cost["resource"]
    _advance_time(player, cost["time"], cost["alert_delta"])

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

        # ノードごとの成功報酬
        rule = SECURITY_RULES.get(node.id)

        if rule:
            reward = rule.get("success_resource", 0)
            player.analysis_resource += reward

            add_log(
                db,
                player,
                "success",
                f"{node.name} の攻略報酬として解析資源を{reward}獲得しました。"
            )

    elif action_type == "dataExtract":
        add_log(db, player, "success", f"{node.name} から機密データを回収しました。目的達成！")
        player.game_status = "won"

    if player.alert_level >= 70 and player.game_status == "playing":
        add_log(db, player, "warning", f"警戒度が {player.alert_level:.0f}% に上昇しています。")

    _check_game_over(db, player)
    db.commit()
