
"""ゲームのルール（権威ロジック）。
API層(main.py)からは「状態の取得」と「アクションの適用」だけを呼び出す。
バランス数値は balance_config.py、ステージ構造は game_data.py に分離してある。
"""
from datetime import datetime, timedelta
import json
import secrets
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

KEY_FRAGMENT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
KEY_FRAGMENT_LENGTH = 4


def _generate_key_fragment() -> str:
    return "".join(secrets.choice(KEY_FRAGMENT_ALPHABET) for _ in range(KEY_FRAGMENT_LENGTH))


def _ensure_player_fragments(player: models.PlayerStatus) -> tuple[str, str]:
    if not player.key_fragment_a:
        player.key_fragment_a = _generate_key_fragment()
    if not player.key_fragment_b:
        player.key_fragment_b = _generate_key_fragment()
    return player.key_fragment_a, player.key_fragment_b


def ensure_key_fragments(db: Session) -> None:
    """既存の全プレイヤー行に暗号鍵断片が設定されていることを保証する。"""
    changed = False
    for player in db.query(models.PlayerStatus).all():
        if not player.key_fragment_a or not player.key_fragment_b:
            _ensure_player_fragments(player)
            changed = True
    if changed:
        db.commit()


_SET_FIELDS = (
    "entry_node_ids",
    "target_node_ids",
    "key_fragment_node_ids",
    "important_node_ids",
    "honeypot_node_ids",
)


# 保存したマップ(player_status.map_snapshot)の形式のバージョン。
# 保存の形を変えるときはこの数字を上げ、古い形を読む処理を _deserialize_map に足す。
MAP_SNAPSHOT_VERSION = 1


class MapSnapshotError(Exception):
    """保存したマップが壊れている、または読めない形式のバージョン。API は 409 map_snapshot_invalid を返す。"""


def _serialize_map(stage: dict) -> str:
    payload = dict(stage)
    for key in _SET_FIELDS:
        if key in payload:
            payload[key] = sorted(payload[key])
    payload["schema_version"] = MAP_SNAPSHOT_VERSION
    return json.dumps(payload, ensure_ascii=False)


def _deserialize_map(raw: str) -> dict:
    try:
        payload = json.loads(raw)
    except (TypeError, ValueError) as error:
        raise MapSnapshotError("saved map is not valid JSON") from error
    if not isinstance(payload, dict):
        raise MapSnapshotError("saved map is not an object")
    # バージョンが付く前(2026-11-17 以前)に保存したマップは、形が同じなので 1 として読む
    version = payload.pop("schema_version", 1)
    if version != MAP_SNAPSHOT_VERSION:
        raise MapSnapshotError(f"unsupported saved map version: {version}")
    if not isinstance(payload.get("nodes"), list) or not isinstance(payload.get("edges"), list) or "id" not in payload:
        raise MapSnapshotError("saved map is missing nodes, edges or id")
    for key in _SET_FIELDS:
        if key in payload:
            payload[key] = set(payload[key])
    return payload


def _player_stage(player: models.PlayerStatus) -> dict:
    if getattr(player, "map_snapshot", None):
        return _deserialize_map(player.map_snapshot)
    stage_id = player.stage_id if player.stage_id is not None else DEFAULT_STAGE_ID
    return get_stage(stage_id)


def _start_message(stage: dict) -> str:
    if stage.get("start_message"):
        return stage["start_message"]
    if stage["id"] == 4:
        mode = "HARDCORE" if stage.get("hardcore") else "STANDARD"
        return f"動的ネットワーク作戦（SEED: {stage.get('seed')} / {mode}）を開始。ハニーポットの矛盾を見破り、ARGUSの反撃に注意してCoreを制圧せよ！"
    if stage["id"] == 1:
        return "侵入作戦を開始しました。唯一の初期侵入口E01をスキャンして侵入してください。ターン制のため操作時だけ時間が進みます。"
    return "基礎侵入訓練を開始しました。公開サーバーが入口です。ステージ1の初期侵入口はE01のみです。"


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
    from game_rules import evaluate_mission_result as evaluate
    return evaluate(player, EVALUATION_CONFIG)


def _security_events(logs) -> dict[str, list[str]]:
    result = {}
    for log in logs:
        if log.message.startswith("[SECURITY:") and log.message.endswith("]"):
            parts = log.message[1:-1].split(":")
            if len(parts) == 3 and parts[2] in ("INFO_CONFIRMED", "ANALYSIS_COMPLETED"):
                result.setdefault(parts[1], []).append(parts[2])
    return result


def _extract_tag_ids(logs, prefix: str) -> list[str]:
    ids: list[str] = []
    marker = f"[{prefix}:"
    for log in logs:
        if log.message.startswith(marker):
            end = log.message.find("]")
            if end > len(marker):
                nid = log.message[len(marker):end]
                if nid not in ids:
                    ids.append(nid)
    return ids


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


def _build_stage_for_new_game(stage_id: int, hardcore: bool = False, seed: Optional[str] = None) -> tuple[dict, Optional[str]]:
    if stage_id == 4:
        from random_map import generate_random_stage
        stage = generate_random_stage(seed=seed, hardcore=hardcore)
        return stage, _serialize_map(stage)
    return get_stage(stage_id), None


def create_game(
    db: Session,
    stage_id: int = DEFAULT_STAGE_ID,
    hardcore: bool = False,
    seed: Optional[str] = None,
) -> models.PlayerStatus:
    stage, snapshot = _build_stage_for_new_game(stage_id, hardcore=hardcore, seed=seed)
    init = stage.get("initial_state", {})
    player = models.PlayerStatus(
        game_time=init.get("game_time", 0),
        alert_level=init.get("alert_level", 0.0),
        analysis_resource=init.get("analysis_resource", INITIAL_ANALYSIS_RESOURCE),
        current_privilege=init.get("current_privilege", INITIAL_PRIVILEGE),
        game_status="playing",
        stage_id=stage["id"],
        map_snapshot=snapshot,
        key_fragment_a=_generate_key_fragment(),
        key_fragment_b=_generate_key_fragment(),
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
    db: Session,
    player: models.PlayerStatus,
    stage_id: Optional[int] = None,
    hardcore: Optional[bool] = None,
    seed: Optional[str] = None,
) -> models.PlayerStatus:
    """指定されたゲームを初期状態にリセットする（stage_id を渡せば別ステージに切り替え可能）。"""
    db.query(models.NodeState).filter(models.NodeState.player_id == player.id).delete()
    db.query(models.GameLog).filter(models.GameLog.player_id == player.id).delete()

    target_stage_id = stage_id if stage_id is not None else (player.stage_id if player.stage_id is not None else DEFAULT_STAGE_ID)
    prev_hardcore = False
    if getattr(player, "map_snapshot", None):
        try:
            prev_hardcore = bool(_deserialize_map(player.map_snapshot).get("hardcore", False))
        except MapSnapshotError:
            # 保存したマップが壊れていても、リセットすれば新しいマップで遊び直せるようにする
            prev_hardcore = False
    actual_hardcore = prev_hardcore if hardcore is None else hardcore

    stage, snapshot = _build_stage_for_new_game(target_stage_id, hardcore=actual_hardcore, seed=seed)
    init = stage.get("initial_state", {})
    player.stage_id = stage["id"]
    player.map_snapshot = snapshot
    player.game_time = init.get("game_time", 0)
    player.alert_level = init.get("alert_level", 0.0)
    player.analysis_resource = init.get("analysis_resource", INITIAL_ANALYSIS_RESOURCE)
    player.current_privilege = init.get("current_privilege", INITIAL_PRIVILEGE)
    player.game_status = "playing"
    player.key_fragment_a = _generate_key_fragment()
    player.key_fragment_b = _generate_key_fragment()

    add_log(
        db,
        player,
        "info",
        _start_message(stage),
    )

    db.commit()
    db.refresh(player)
    return player


def game_query(db: Session, game_id: int, for_update: bool = False):
    """ゲーム(player_status の行)を取り出すクエリ。

    for_update=True のときは行をロックする(PostgreSQL の SELECT ... FOR UPDATE)。
    同じゲームへの操作が同時に届いても、ロックが外れる(commit/rollback)まで次の操作を待たせ、
    「両方が同じ状態を読んでコストを1回分しか引かない」「同じ侵入が2回成功する」のを防ぐ。
    SQLite(テスト用)では FOR UPDATE は付かない。
    """
    query = db.query(models.PlayerStatus).filter(models.PlayerStatus.id == game_id)
    return query.with_for_update() if for_update else query


def get_game(
    db: Session,
    game_id: int,
    for_update: bool = False,
) -> Optional[models.PlayerStatus]:
    return game_query(db, game_id, for_update=for_update).first()


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
    frag_a, frag_b = _ensure_player_fragments(player)
    stage = _player_stage(player)
    stage_nodes = stage["nodes"]
    stage_node_ids = {n["id"] for n in stage_nodes}
    order = {n["id"]: i for i, n in enumerate(stage_nodes)}
    ordered_key_ids = sorted(stage.get("key_fragment_node_ids", set()))
    frag_by_node_id = {}
    if len(ordered_key_ids) >= 1:
        frag_by_node_id[ordered_key_ids[0]] = ("断片A", frag_a)
    if len(ordered_key_ids) >= 2:
        frag_by_node_id[ordered_key_ids[1]] = ("断片B", frag_b)

    statuses = _node_statuses(db, player)
    has_snapshot = bool(getattr(player, "map_snapshot", None))
    if has_snapshot:
        source_nodes = stage_nodes
    else:
        db_nodes = sorted(
            db.query(models.NodeMaster).filter(models.NodeMaster.id.in_(stage_node_ids)).all(),
            key=lambda n: order.get(n.id, len(order)),
        )
        source_nodes = [
            {
                "id": n.id,
                "name": n.name,
                "layer": n.layer,
                "pos_x": n.pos_x,
                "pos_y": n.pos_y,
                "info": n.info,
                "vulnerability": n.vulnerability,
            }
            for n in db_nodes
        ]

    nodes = []
    for node in source_nodes:
        nid = node["id"]
        status = statuses.get(nid, "unscanned")
        revealed = status != "unscanned"
        info_text = node["info"] if revealed else "不明（スキャンが必要です）"
        if status == "hacked" and nid in frag_by_node_id:
            label_name, frag_val = frag_by_node_id[nid]
            info_text = f"{node['info'] or ''} 【入手済み{label_name}: {frag_val}】".strip()

        nodes.append({
            "id": nid,
            "position": {
                "x": node["pos_x"],
                "y": node["pos_y"],
            },
            "data": {
                "label": node["name"],
                "layer": node["layer"],
                "info": info_text,
                "vulnerability": (
                    node["vulnerability"]
                    if revealed
                    else None
                ),
                "status": status,
            },
        })

    logs = db.query(models.GameLog).filter(
        models.GameLog.player_id == player.id
    ).order_by(models.GameLog.id).all()

    collected_a = frag_a if len(ordered_key_ids) >= 1 and statuses.get(ordered_key_ids[0]) == "hacked" else None
    collected_b = frag_b if len(ordered_key_ids) >= 2 and statuses.get(ordered_key_ids[1]) == "hacked" else None
    has_all_keys = bool(ordered_key_ids) and all(statuses.get(kid) == "hacked" for kid in ordered_key_ids)
    cipher_unlocked = has_all_keys and (
        any("暗号キー認証に成功" in l.message for l in logs)
        or player.analysis_resource < ACTION_COSTS["dataExtract"]["resource"]
    )

    flagged_traps = _extract_tag_ids(logs, "TRAP_FLAGGED")
    triggered_traps = _extract_tag_ids(logs, "TRAP_TRIGGERED")
    argus_reinforced = _extract_tag_ids(logs, "ARGUS_REINFORCE")
    monitor = stage.get("conditional_breach_alert")
    argus_disabled = bool(monitor and statuses.get(monitor["disabled_by_node_id"]) == "hacked")

    state_payload = {
        "gameId": str(player.id),
        "stageId": stage["id"],
        "status": player.game_status,
        "elapsedSeconds": player.game_time,
        "alertLevel": round(player.alert_level, 2),
        "analysisResource": player.analysis_resource,
        "privilege": player.current_privilege,
        "keyFragments": {
            "a": collected_a,
            "b": collected_b,
            "unlocked": cipher_unlocked,
        },
        "securityEvents": _security_events(logs),
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
    if has_snapshot:
        state_payload["dynamicMap"] = {
            "seed": stage.get("seed"),
            "hardcore": bool(stage.get("hardcore", False)),
            "entryNodeIds": sorted(stage.get("entry_node_ids", set())),
            "targetNodeIds": sorted(stage.get("target_node_ids", set())),
            "keyFragmentNodeIds": sorted(stage.get("key_fragment_node_ids", set())),
            "nodeEffects": {
                nid: {
                    "resourceBonus": eff.get("resource_bonus", 0),
                    "alertDelta": eff.get("alert_delta", 0),
                    "log": eff.get("log"),
                }
                for nid, eff in stage.get("node_effects", {}).items()
            },
            "breachRequirements": stage.get("breach_requirements", {}),
            "conditionalBreachAlert": (
                {
                    "disabledByNodeId": monitor["disabled_by_node_id"],
                    "targetNodeIds": monitor["target_node_ids"],
                    "alertDelta": monitor["alert_delta"],
                }
                if monitor
                else None
            ),
            "flaggedTraps": flagged_traps,
            "triggeredTraps": triggered_traps,
            "argusReinforced": argus_reinforced,
            "argusDisabled": argus_disabled,
            "enableArgusCounterattack": bool(stage.get("enable_argus_counterattack", False)),
        }
    return state_payload


# ---------- アクション ----------

def _rule_state(db: Session, player: models.PlayerStatus):
    from game_rules import RuleState
    logs = db.query(models.GameLog).filter_by(player_id=player.id).order_by(models.GameLog.id).all()
    authenticated = any("暗号キー認証に成功" in l.message for l in logs)
    return RuleState(
        game_time=player.game_time, alert_level=player.alert_level,
        analysis_resource=player.analysis_resource, current_privilege=player.current_privilege,
        game_status=player.game_status, node_statuses=_node_statuses(db, player),
        fragment_a=player.key_fragment_a or "", fragment_b=player.key_fragment_b or "",
        cipher_authenticated=authenticated,
        security_events=_security_events(logs),
        flagged_traps=_extract_tag_ids(logs, "TRAP_FLAGGED"),
        triggered_traps=_extract_tag_ids(logs, "TRAP_TRIGGERED"),
        argus_reinforced=_extract_tag_ids(logs, "ARGUS_REINFORCE"),
    )


def _monitoring_extra(stage: dict, statuses: dict[str, str], node_id: str) -> float:
    from game_rules import _monitoring_extra as monitoring_extra
    return monitoring_extra(stage, statuses, node_id)


def apply_action(db: Session, player: models.PlayerStatus, action_type: str,
                 node_id: Optional[str], passcode: Optional[str] = None,
                 exploit_mismatch: bool = False, exploit_id: Optional[str] = None, question_id: Optional[str] = None) -> None:
    """DB入出力アダプター。判定・状態遷移は純粋ルールへ委譲する。"""
    from game_rules import RuleAction, transition
    from map_definition import map_from_stage

    stage = _player_stage(player)
    definition = stage if getattr(player, "map_snapshot", None) else map_from_stage(stage)
    before = _rule_state(db, player)
    result = transition(definition, before, RuleAction(action_type, node_id, passcode, exploit_mismatch, exploit_id, question_id))
    if not result.accepted:
        raise ActionRejected(result.reason)
    after = result.state
    for attribute in ("game_time", "alert_level", "analysis_resource", "current_privilege", "game_status"):
        setattr(player, attribute, getattr(after, attribute))
    for nid, status in after.node_statuses.items():
        if before.node_statuses.get(nid) != status:
            _set_node_status(db, player, nid, status)
    for event in result.events:
        db.add(models.GameLog(player_id=player.id, timestamp=event.timestamp,
                              message=event.message, severity=event.severity))
    db.commit()
