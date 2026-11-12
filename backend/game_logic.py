
"""ゲームのルール（権威ロジック）。
API層(main.py)からは「状態の取得」と「アクションの適用」だけを呼び出す。
バランス数値は balance_config.py、ステージ構造は game_data.py に分離してある。
"""
from datetime import datetime, timedelta
from math import floor
from typing import Optional

from sqlalchemy import bindparam, func, inspect, text
from sqlalchemy.orm import Session

import models

from balance_config import (
    ACTION_COSTS,
    EVALUATION_CONFIG,
    ALERT_DECAY_PER_SECOND,
    ALERT_GAME_OVER_THRESHOLD,
    INITIAL_ANALYSIS_RESOURCE,
    INITIAL_PRIVILEGE,
    LAYER_ORDER,
    PRIVILEGE_LADDER,
    MAX_ANALYSIS_RESOURCE,
    RESOURCE_RECOVERY_AMOUNT,
    STALE_GAME_DAYS,
)
from game_data import (
    RESOURCE_REWARDS,
    ALL_STAGE_NODES,
    DEFAULT_STAGE_ID,
    STAGES,
    get_stage,
)






TIMED_ACTIONS = ("scan", "remoteScan", "breach", "dataExtract", "recover")



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


def _start_message(stage: dict) -> str:
    if stage["id"] == 1:
        return "侵入作戦を開始しました。唯一の初期侵入口E01をスキャンして侵入してください。ターン制のため操作時だけ時間が進みます。"
    return "基礎侵入訓練を開始しました。公開サーバーが入口です。本編の初期侵入口はE01のみです。"


def _neighbors(node_id: str, edges: list[dict]) -> set[str]:
    result = set()
    for e in edges:
        if e["source"] == node_id:
            result.add(e["target"])
        elif e["target"] == node_id:
            result.add(e["source"])
    return result


def _node_statuses(db: Session, player: models.PlayerStatus) -> dict[str, str]:
    rows = db.query(models.NodeState).filter(
        models.NodeState.player_id == player.id
    ).all()
    return {row.node_id: row.status for row in rows}


def _set_node_status(
    db: Session,
    player: models.PlayerStatus,
    node_id: str,
    status: str,
) -> None:
    row = db.query(models.NodeState).filter(
        models.NodeState.player_id == player.id,
        models.NodeState.node_id == node_id,
    ).first()

    if row is None:
        db.add(
            models.NodeState(
                player_id=player.id,
                node_id=node_id,
                status=status,
            )
        )
    else:
        row.status = status
    db.flush()


def add_log(
    db: Session,
    player: models.PlayerStatus,
    severity: str,
    message: str,
) -> None:
    db.add(
        models.GameLog(
            player_id=player.id,
            timestamp=player.game_time,
            message=message,
            severity=severity,
        )
    )


def evaluate_mission_result(player: models.PlayerStatus) -> dict:
    """表示と同じ警戒度・共有係数でS〜D評価を計算する。"""
    config = EVALUATION_CONFIG
    score = max(0, floor(
        config["baseScore"]
        - max(0, player.game_time - config["timeGraceSeconds"]) * config["timePenaltyPerSecond"]
        - round(player.alert_level, 2) * config["alertPenaltyPerPoint"]
        + min(config["resourceBonusCap"], max(0, player.analysis_resource)) * config["resourceBonusPerPoint"]
        + 0.5
    ))
    threshold = next(t for t in config["thresholds"] if score >= t["minimum"])
    return {"rank": threshold["rank"], "score": score, "title": threshold["title"]}


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
    db.flush()

    add_log(
        db,
        player,
        "info",
        _start_message(stage),
    )

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

    add_log(
        db,
        player,
        "info",
        _start_message(_player_stage(player)),
    )

    db.commit()
    db.refresh(player)
    return player


def get_game(
    db: Session,
    game_id: int,
) -> Optional[models.PlayerStatus]:
    return db.query(models.PlayerStatus).filter(
        models.PlayerStatus.id == game_id
    ).first()


def touch_game(db: Session, player: models.PlayerStatus) -> None:
    """「このゲームは今使われている」と記録する（古いゲームの掃除の判断材料）。"""
    player.last_accessed_at = models.utcnow()
    db.commit()


def _delete_legacy_pending_actions(db: Session, column: str, ids: list) -> None:
    """過去の pending_action テーブルが残っていれば関連行を掃除する。"""
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
    """一定期間使われていないゲームを削除する（旧APIの最初のゲームは除外）。"""
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
            "position": {
                "x": node.pos_x,
                "y": node.pos_y,
            },
            "data": {
                "label": node.name,
                "layer": node.layer,
                "info": (
                    node.info
                    if revealed
                    else "不明（スキャンが必要です）"
                ),
                "vulnerability": (
                    node.vulnerability
                    if revealed
                    else None
                ),
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
            {
                "id": str(l.id),
                "timestamp": l.timestamp,
                "message": l.message,
                "severity": l.severity,
            }
            for l in logs
        ],
    }


# ---------- アクション ----------

def _validate_timed_action(
    db: Session,
    player: models.PlayerStatus,
    action_type: str,
    node: Optional[models.NodeMaster],
) -> None:
    if player.game_status != "playing":
        raise ActionRejected("invalid_state")

    
    if action_type == "recover":
        statuses = _node_statuses(db, player)

        # 侵入済みノードが必要
        if not any(status == "hacked" for status in statuses.values()):
            raise ActionRejected("node_unreachable")

        # RESOURCEが上限なら回復できない
        if player.analysis_resource >= MAX_ANALYSIS_RESOURCE:
            raise ActionRejected("invalid_state")

        return

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
    entry_ids = stage["entry_node_ids"]
    has_foothold = any(statuses.get(nid) == "hacked" for nid in stage_node_ids)
    # リモートスキャンも最初の侵入を迂回しない。拠点確保後は遠隔調査できる。
    if action_type in ("scan", "remoteScan", "breach") and not has_foothold and node.id not in entry_ids:
        raise ActionRejected("node_unreachable")

    
    if action_type in ("scan", "remoteScan"):
        if status != "unscanned":
            raise ActionRejected("invalid_state")

        if action_type == "scan":
            # 通常スキャンは侵入済みノードの隣接先だけ
            # ステージごとに指定した入口ノードだけは初期探索を許可
            has_hacked_neighbor = any(
                statuses.get(neighbor_id) == "hacked"
                for neighbor_id in _neighbors(node.id, stage["edges"])
            )

            if node.id not in entry_ids and not has_hacked_neighbor:
                raise ActionRejected("node_unreachable")


    elif action_type == "breach":
        if status == "hacked":
            raise ActionRejected("invalid_state")

        # 入口以外は、侵入済みの隣接ノードが必要
        if node.id not in entry_ids:
            if not any(
                statuses.get(neighbor_id) == "hacked"
                for neighbor_id in _neighbors(node.id, stage["edges"])
            ):
                raise ActionRejected("node_unreachable")

        # 到達可能なノードは、先にスキャンが必要
        if status != "scanned":
            raise ActionRejected("node_not_scanned")

        # 必要な権限を確認
        if (
            _privilege_index(player.current_privilege)
            < _layer_index(node.layer)
        ):
            raise ActionRejected("insufficient_privilege")


    elif action_type == "dataExtract":
        if node.layer != "Core" or status != "hacked":
            raise ActionRejected("invalid_state")
        target_ids = stage["target_node_ids"]
        if target_ids and node.id not in target_ids:
            raise ActionRejected("invalid_state")


def _advance_time(
    player: models.PlayerStatus,
    seconds: int,
    alert_delta: float,
) -> None:
    """アクションにかかった時間を経過させ、警戒度を更新する。"""

    player.game_time += seconds

    player.alert_level = _clamp_alert(
        player.alert_level
        - ALERT_DECAY_PER_SECOND * seconds
        + alert_delta
    )


def _has_any_affordable_action(db: Session, player: models.PlayerStatus) -> bool:
    """Use action validation to detect dead ends, including recovery."""
    try:
        _validate_timed_action(db, player, "recover", None)
        return True
    except ActionRejected:
        pass
    stage = _player_stage(player)
    for data in stage["nodes"]:
        node = db.get(models.NodeMaster, data["id"])
        for action in ("scan", "remoteScan", "breach", "dataExtract"):
            try:
                _validate_timed_action(db, player, action, node)
                return True
            except ActionRejected:
                pass
    return False


def _check_game_over(db: Session, player: models.PlayerStatus) -> None:
    if player.game_status != "playing":
        return
    if player.alert_level >= ALERT_GAME_OVER_THRESHOLD:
        player.game_status = "lost"
        add_log(db, player, "danger", "警戒度が限界に達しました。侵入が検知され、作戦は失敗です。")
    elif not _has_any_affordable_action(db, player):
        player.game_status = "lost"
        add_log(db, player, "danger", "解析資源が枯渇しました。これ以上の作戦継続は不可能です。")


def _apply_node_effect(db: Session, player: models.PlayerStatus, node: models.NodeMaster) -> None:
    """侵入成功時の資源補給・警戒度変化・鍵断片取得を適用する。"""
    stage = _player_stage(player)
    key_ids = stage["key_fragment_node_ids"]
    effect = stage["node_effects"].get(node.id)
    if effect:
        # 同一ノードの補給は RESOURCE_REWARDS と二重加算しない。
        # NODE_EFFECTS 側に設定があればそちらの値を優先する。
        res_bonus = effect.get("resource_bonus", 0)
        alert_delta = effect.get("alert_delta", 0.0)
        if res_bonus:
            before = player.analysis_resource
            player.analysis_resource = min(MAX_ANALYSIS_RESOURCE, max(0, before + res_bonus))
            actual_bonus = player.analysis_resource - before
            add_log(db, player, "success", f"{node.name}: RESOURCE +{actual_bonus} ({player.analysis_resource}/{MAX_ANALYSIS_RESOURCE})")
        if alert_delta:
            player.alert_level = _clamp_alert(player.alert_level + alert_delta)
        msg = effect.get("log")
        if msg:
            add_log(db, player, "info", msg)
    else:
        reward = RESOURCE_REWARDS.get(node.id, 0) if stage["id"] == DEFAULT_STAGE_ID else 0
        if reward:
            before = player.analysis_resource
            player.analysis_resource = min(MAX_ANALYSIS_RESOURCE, before + reward)
            add_log(db, player, "success", f"{node.name}: RESOURCE +{player.analysis_resource - before} ({player.analysis_resource}/{MAX_ANALYSIS_RESOURCE})")

    if key_ids and node.id in key_ids:
        statuses = _node_statuses(db, player)
        statuses[node.id] = "hacked"
        if all(statuses.get(kid) == "hacked" for kid in key_ids):
            add_log(db, player, "success", "すべての暗号鍵断片が揃いました！最終目標のデータ回収時に警戒度上昇を完全に抑えられます。")


def apply_action(db: Session, player: models.PlayerStatus, action_type: str, node_id: Optional[str]) -> None:
    """アクションを検証して適用する。却下時は ActionRejected を投げる。"""

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

    # RESOURCE回復はノード選択不要
    if action_type == "recover":
        _validate_timed_action(db, player, action_type, None)

        cost = ACTION_COSTS["recover"]

        player.analysis_resource = min(
            MAX_ANALYSIS_RESOURCE,
            player.analysis_resource + RESOURCE_RECOVERY_AMOUNT,
        )

        _advance_time(
            player,
            cost["time"],
            cost["alert_delta"],
        )

        add_log(
            db,
            player,
            "success",
            f"解析資源を回復しました。"
            f"現在のRESOURCE: {player.analysis_resource}",
        )

        _check_game_over(db, player)
        db.commit()
        return

    node = None

    if node_id is not None:
        node = db.query(models.NodeMaster).filter(
            models.NodeMaster.id == node_id
        ).first()

    _validate_timed_action(
        db,
        player,
        action_type,
        node,
    )

    stage = _player_stage(player)
    key_ids = stage["key_fragment_node_ids"]
    cost = ACTION_COSTS[action_type]
    # 鍵が揃っていればデータ回収の警戒度増加を打ち消す。
    alert_delta = cost["alert_delta"]
    has_all_keys = False
    if action_type == "dataExtract" and key_ids:
        statuses = _node_statuses(db, player)
        has_all_keys = all(statuses.get(kid) == "hacked" for kid in key_ids)
        if has_all_keys:
            alert_delta = 0.0

    player.analysis_resource -= cost["resource"]

    _advance_time(
        player,
        cost["time"],
        alert_delta,
    )

    # 検知はノード効果・鍵以外の事後軽減・勝利より優先する。
    # 鍵による回収の軽減は上のalert_delta計算で既に適用済み。
    if player.alert_level >= ALERT_GAME_OVER_THRESHOLD:
        _check_game_over(db, player)
        db.commit()
        return

    if action_type in ("scan", "remoteScan"):
        _set_node_status(db, player, node.id, "scanned")

        scan_label = (
            "リモートスキャン"
            if action_type == "remoteScan"
            else "通常スキャン"
        )

        add_log(
            db,
            player,
            "success",
            f"{node.name} の{scan_label}が完了しました。"
            f"脆弱性: {node.vulnerability or '不明'}"
        )


    elif action_type == "breach":
        _set_node_status(db, player, node.id, "hacked")



        # 侵入したレイヤーに応じて権限を昇格
        granted = min(
            _layer_index(node.layer) + 1,
            len(PRIVILEGE_LADDER) - 1,
        )

        if granted > _privilege_index(player.current_privilege):
            player.current_privilege = PRIVILEGE_LADDER[granted]

            add_log(
                db,
                player,
                "success",
                f"{node.name} への侵入に成功。権限が {player.current_privilege} に昇格しました。",
            )
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
        add_log(
            db,
            player,
            "warning",
            f"警戒度が {player.alert_level:.0f}% に上昇しています。",
        )

    _check_game_over(db, player)
    db.commit()
