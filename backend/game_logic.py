"""ゲームのルール（権威ロジック）。
API層(main.py)・リアルタイム層(realtime.py)からは
  - create_game / get_game / build_game_state（状態の生成・取得）
  - apply_action（プレイヤー操作の受付）
  - tick（ゲーム内時間を1秒進める）
だけを呼び出す。バランス数値は balance_config.py、ステージ構造は game_data.py に分離してある。

時間のかかる操作（scan / breach / dataExtract）は「開始」と「完了」に分かれる。
  開始：apply_action で検証し、資源を消費して pending_action に登録する
  完了：tick でゲーム内時間が complete_at に達したら効果を適用する
一時停止中はゲーム内時間が進まないため、実行中の操作も止まる。
"""
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy.orm import Session

import models
from balance_config import (
    ACTION_COSTS,
    ALERT_DECAY_PER_SECOND,
    ALERT_GAME_OVER_THRESHOLD,
    ALERT_WARNING_THRESHOLD,
    INITIAL_ANALYSIS_RESOURCE,
    INITIAL_PRIVILEGE,
    LAYER_ORDER,
    PRIVILEGE_LADDER,
)
from game_data import EDGES, ENTRY_LAYERS, NODES

TIMED_ACTIONS = ("scan", "breach", "dataExtract")
ACTION_LABELS = {"scan": "スキャン", "breach": "侵入", "dataExtract": "データ回収"}


class ActionRejected(Exception):
    """アクションを受理できなかったときに投げる。reason は api-contract.md の却下理由。"""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


@dataclass
class TickResult:
    """tick() で起きたことの要約。realtime.py がクライアントへ送るイベントを決めるのに使う。"""
    advanced: bool = False                                     # 時間が進んだか
    resolved_node_ids: list[str] = field(default_factory=list)  # 操作が完了したノード
    finished: Optional[str] = None                              # "won" / "lost"（この tick で決着した場合）


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


def _pending_actions(db: Session, player: models.PlayerStatus) -> list[models.PendingAction]:
    return db.query(models.PendingAction).filter(
        models.PendingAction.player_id == player.id
    ).order_by(models.PendingAction.complete_at, models.PendingAction.id).all()


def add_log(db: Session, player: models.PlayerStatus, severity: str, message: str) -> None:
    db.add(models.GameLog(
        player_id=player.id,
        timestamp=player.game_time,
        message=message,
        severity=severity,
    ))


def _change_alert(db: Session, player: models.PlayerStatus, delta: float) -> None:
    before = player.alert_level
    player.alert_level = _clamp_alert(before + delta)
    # しきい値を上向きにまたいだときだけ警告（毎回出すとログが埋まるため）
    if before < ALERT_WARNING_THRESHOLD <= player.alert_level < ALERT_GAME_OVER_THRESHOLD:
        add_log(db, player, "warning", f"警戒度が {player.alert_level:.0f}% に上昇。防御側が異常に気付き始めています。")


def _finish_game(db: Session, player: models.PlayerStatus, result: str) -> None:
    player.game_status = result
    # 決着したら実行中の操作はすべて破棄
    db.query(models.PendingAction).filter(models.PendingAction.player_id == player.id).delete()


def _check_game_over(db: Session, player: models.PlayerStatus) -> bool:
    if player.game_status == "playing" and player.alert_level >= ALERT_GAME_OVER_THRESHOLD:
        add_log(db, player, "danger", "警戒度が限界に達しました。侵入が検知され、作戦は失敗です。")
        _finish_game(db, player, "lost")
        return True
    return False


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


def get_game(db: Session, game_id: int) -> Optional[models.PlayerStatus]:
    return db.query(models.PlayerStatus).filter(models.PlayerStatus.id == game_id).first()


def build_node(node: models.NodeMaster, status: str) -> dict:
    """1ノード分を api-contract.md 2.1 の ApiNetworkNode の形にする。"""
    revealed = status != "unscanned"
    return {
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
    }


def build_node_by_id(db: Session, player: models.PlayerStatus, node_id: str) -> Optional[dict]:
    node = db.query(models.NodeMaster).filter(models.NodeMaster.id == node_id).first()
    if node is None:
        return None
    return build_node(node, _node_statuses(db, player).get(node_id, "unscanned"))


def build_log_entry(log: models.GameLog) -> dict:
    return {"id": str(log.id), "timestamp": log.timestamp, "message": log.message, "severity": log.severity}


def build_game_state(db: Session, player: models.PlayerStatus) -> dict:
    """api-contract.md 2.2 の GameState の形に組み立てる。"""
    statuses = _node_statuses(db, player)
    order = {n["id"]: i for i, n in enumerate(NODES)}
    db_nodes = sorted(db.query(models.NodeMaster).all(), key=lambda n: order.get(n.id, len(order)))

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
        "nodes": [build_node(n, statuses.get(n.id, "unscanned")) for n in db_nodes],
        "edges": EDGES,
        "pendingActions": [
            {"nodeId": p.node_id, "type": p.action_type, "startedAt": p.started_at, "completeAt": p.complete_at}
            for p in _pending_actions(db, player)
        ],
        "log": [build_log_entry(l) for l in logs],
    }


# ---------- アクション（開始） ----------

def _validate_timed_action(
    db: Session, player: models.PlayerStatus, action_type: str, node: Optional[models.NodeMaster]
) -> None:
    if player.game_status != "playing":
        raise ActionRejected("invalid_state")
    if node is None:
        raise ActionRejected("invalid_state")
    # 同じノードに対して実行中の操作がある間は受け付けない
    if any(p.node_id == node.id for p in _pending_actions(db, player)):
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


def apply_action(db: Session, player: models.PlayerStatus, action_type: str, node_id: Optional[str]) -> None:
    """アクションを検証して受け付ける。却下時は ActionRejected を投げる（DBは変更しない）。
    scan / breach / dataExtract はここでは「開始」だけ行い、結果は tick() で確定する。
    """

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

    cost = ACTION_COSTS[action_type]
    player.analysis_resource -= cost["resource"]
    db.add(models.PendingAction(
        player_id=player.id,
        node_id=node.id,
        action_type=action_type,
        started_at=player.game_time,
        complete_at=player.game_time + cost["time"],
    ))
    add_log(db, player, "info", f"{node.name} への{ACTION_LABELS[action_type]}を開始しました（約{cost['time']}秒）。")
    db.commit()


# ---------- アクション（完了） ----------

def _resolve_action(db: Session, player: models.PlayerStatus, action: models.PendingAction) -> None:
    node = db.query(models.NodeMaster).filter(models.NodeMaster.id == action.node_id).first()
    action_type = action.action_type
    db.delete(action)
    if node is None:
        return

    _change_alert(db, player, ACTION_COSTS[action_type]["alert_delta"])

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

    elif action_type == "dataExtract":
        add_log(db, player, "success", f"{node.name} から機密データを回収しました。目的達成！")
        _finish_game(db, player, "won")


# ---------- 時間経過 ----------

def tick(db: Session, player: models.PlayerStatus) -> TickResult:
    """ゲーム内時間を1秒進める。playing 以外では何もしない。"""
    result = TickResult()
    if player.game_status != "playing":
        return result

    result.advanced = True
    player.game_time += 1
    player.alert_level = _clamp_alert(player.alert_level - ALERT_DECAY_PER_SECOND)

    for action in _pending_actions(db, player):
        if action.complete_at > player.game_time:
            break
        node_id = action.node_id
        _resolve_action(db, player, action)
        result.resolved_node_ids.append(node_id)
        if _check_game_over(db, player) or player.game_status != "playing":
            break

    if player.game_status in ("won", "lost"):
        result.finished = player.game_status

    db.commit()
    return result
