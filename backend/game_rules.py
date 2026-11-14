"""DB・乱数・時刻を使用しない行動判定と状態遷移。"""
from copy import deepcopy
from dataclasses import dataclass, field
from math import floor
import re
from types import SimpleNamespace
from typing import Optional
from map_definition import GameMapDefinition

TIMED_ACTIONS = ("scan", "remoteScan", "breach", "dataExtract", "recover")
EXPLOIT_MISMATCH_ALERT = 8.0

class ActionRejected(Exception):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason

@dataclass(eq=True)
class RuleEvent:
    timestamp: int
    severity: str
    message: str

@dataclass(eq=True)
class RuleState:
    game_time: int = 0
    alert_level: float = 0.0
    analysis_resource: int = 25
    current_privilege: str = "GUEST"
    game_status: str = "playing"
    node_statuses: dict[str, str] = field(default_factory=dict)
    fragment_a: str = ""
    fragment_b: str = ""
    cipher_authenticated: bool = False
    security_events: dict[str, list[str]] = field(default_factory=dict)
    events: list[RuleEvent] = field(default_factory=list, repr=False)

@dataclass(eq=True)
class RuleAction:
    type: str
    node_id: str | None = None
    passcode: str | None = None
    exploit_mismatch: bool = False
    exploit_id: str | None = None
    question_id: str | None = None

@dataclass(eq=True)
class TransitionResult:
    accepted: bool
    reason: str | None
    state: RuleState
    events: list[RuleEvent]

def initial_rule_state(stage: GameMapDefinition, fragment_a: str = "", fragment_b: str = "") -> RuleState:
    return RuleState(**stage["initial_state"], fragment_a=fragment_a, fragment_b=fragment_b)

def _log(player: RuleState, severity: str, message: str) -> None:
    player.events.append(RuleEvent(player.game_time, severity, message))

def _privilege_index(value: str, stage: GameMapDefinition) -> int:
    return stage["privilege_ladder"].index(value) if value in stage["privilege_ladder"] else 0

def _layer_index(value: str, stage: GameMapDefinition) -> int:
    return stage["layer_order"].index(value) if value in stage["layer_order"] else len(stage["layer_order"])-1

def _clamp_alert(value: float) -> float:
    return max(0.0, min(100.0, value))

def _normalize_passcode(value: str) -> str:
    return re.sub(r"[\s\-]", "", value).upper()


def security_requirements_met(stage: GameMapDefinition, state: RuleState, node_id: str) -> bool:
    rule = stage.get("security_rules", {}).get(node_id, {})
    events = state.security_events.get(node_id, [])
    return ((not rule.get("required_info") or "INFO_CONFIRMED" in events)
            and (not rule.get("required_analysis") or "ANALYSIS_COMPLETED" in events))

def _neighbors(node_id: str, edges: list[dict]) -> set[str]:
    result = set()
    for e in edges:
        if e["source"] == node_id:
            result.add(e["target"])
        elif e["target"] == node_id:
            result.add(e["source"])
    return result

def evaluate_mission_result(player: RuleState, config: dict) -> dict:
    """表示と同じ警戒度・共有係数でS〜D評価を計算する。"""
    score = max(0, floor(
        config["baseScore"]
        - max(0, player.game_time - config["timeGraceSeconds"]) * config["timePenaltyPerSecond"]
        - round(player.alert_level, 2) * config["alertPenaltyPerPoint"]
        + min(config["resourceBonusCap"], max(0, player.analysis_resource)) * config["resourceBonusPerPoint"]
        + 0.5
    ))
    threshold = next(t for t in config["thresholds"] if score >= t["minimum"])
    return {"rank": threshold["rank"], "score": score, "title": threshold["title"]}

def _validate_timed_action(
    player: RuleState, stage: GameMapDefinition,
    action_type: str,
    node: Optional[SimpleNamespace],
) -> None:
    if player.game_status != "playing":
        raise ActionRejected("invalid_state")


    if action_type == "recover":
        statuses = player.node_statuses

        # 侵入済みノードが必要
        if not any(status == "hacked" for status in statuses.values()):
            raise ActionRejected("node_unreachable")

        # RESOURCEが上限なら回復できない
        if player.analysis_resource >= stage["max_analysis_resource"]:
            raise ActionRejected("invalid_state")

        return

    if node is None:
        raise ActionRejected("invalid_state")
    stage_node_ids = {n["id"] for n in stage["nodes"]}
    if node.id not in stage_node_ids:
        raise ActionRejected("invalid_state")

    cost = stage["action_costs"][action_type]
    statuses = player.node_statuses
    key_ids = stage["key_fragment_node_ids"]
    has_all_keys = bool(key_ids) and all(statuses.get(kid) == "hacked" for kid in key_ids)
    required_resource = 0 if (action_type == "dataExtract" and has_all_keys) else cost["resource"]

    if player.analysis_resource < required_resource:
        raise ActionRejected("insufficient_resource")

    status = statuses.get(node.id, "unscanned")
    entry_ids = stage["entry_node_ids"]
    has_foothold = any(statuses.get(nid) == "hacked" for nid in stage_node_ids)
    # リモートスキャンも最初の侵入を迂回しない。拠点確保後は遠隔調査できる。
    if action_type in ("scan", "remoteScan", "breach") and not has_foothold and node.id not in entry_ids:
        raise ActionRejected("node_unreachable")


    if action_type in ("scan", "remoteScan"):
        allowed = stage.get("security_rules", {}).get(node.id, {}).get("allowed_scan_types", ["scan", "remoteScan"])
        if action_type not in allowed:
            raise ActionRejected("invalid_state")
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

        if any(statuses.get(required) != "hacked" for required in stage.get("breach_requirements", {}).get(node.id, [])):
            raise ActionRejected("node_locked")

        rule = stage.get("security_rules", {}).get(node.id, {})
        if rule.get("failure_mode") == "reject" and not security_requirements_met(stage, player, node.id):
            raise ActionRejected("security_requirements_unmet")

        # 必要な権限を確認
        if (
            _privilege_index(player.current_privilege, stage)
            < _layer_index(node.layer, stage)
        ):
            raise ActionRejected("insufficient_privilege")


    elif action_type == "dataExtract":
        if node.layer != "Core" or status != "hacked":
            raise ActionRejected("invalid_state")
        target_ids = stage["target_node_ids"]
        if target_ids and node.id not in target_ids:
            raise ActionRejected("invalid_state")

def _advance_time(
    player: RuleState, stage: GameMapDefinition,
    seconds: int,
    alert_delta: float,
) -> None:
    """アクションにかかった時間を経過させ、警戒度を更新する。"""

    player.game_time += seconds

    player.alert_level = _clamp_alert(
        player.alert_level
        - stage["alert_decay_per_second"] * seconds
        + alert_delta
    )

def _has_any_affordable_action(player: RuleState, stage: GameMapDefinition) -> bool:
    """Use action validation to detect dead ends, including recovery."""
    try:
        _validate_timed_action(player, stage, "recover", None)
        return True
    except ActionRejected:
        pass
    for data in stage["nodes"]:
        node = SimpleNamespace(**data)
        if any(validate_action(stage, player, RuleAction(kind, node.id)) is None for kind in ("confirmInfo", "completeAnalysis")):
            planned = deepcopy(player)
            planned.security_events[node.id] = ["INFO_CONFIRMED", "ANALYSIS_COMPLETED"]
            try:
                _validate_timed_action(planned, stage, "breach", node)
                return True
            except ActionRejected:
                pass
        for action in ("scan", "remoteScan", "breach", "dataExtract"):
            try:
                _validate_timed_action(player, stage, action, node)
                return True
            except ActionRejected:
                pass
    return False

def _check_game_over(player: RuleState, stage: GameMapDefinition) -> None:
    if player.game_status != "playing":
        return
    if player.alert_level >= stage["alert_game_over_threshold"]:
        player.game_status = "lost"
        _log(player, "danger", "警戒度が限界に達しました。侵入が検知され、作戦は失敗です。")
    elif not _has_any_affordable_action(player, stage):
        player.game_status = "lost"
        _log(player, "danger", "解析資源が枯渇しました。これ以上の作戦継続は不可能です。")

def _apply_node_effect(player: RuleState, stage: GameMapDefinition, node: SimpleNamespace) -> None:
    """侵入成功時の資源補給・警戒度変化・鍵断片取得を適用する。"""
    frag_a, frag_b = (player.fragment_a, player.fragment_b)
    key_ids = stage["key_fragment_node_ids"]
    ordered_key_ids = sorted(key_ids)
    effect = stage["node_effects"].get(node.id)
    if effect:
        # 同一ノードの補給は RESOURCE_REWARDS と二重加算しない。
        # NODE_EFFECTS 側に設定があればそちらの値を優先する。
        res_bonus = effect.get("resource_bonus", 0)
        alert_delta = effect.get("alert_delta", 0.0)
        if res_bonus:
            before = player.analysis_resource
            player.analysis_resource = min(stage["max_analysis_resource"], max(0, before + res_bonus))
            actual_bonus = player.analysis_resource - before
            _log(player, "success", f"{node.name}: RESOURCE +{actual_bonus} ({player.analysis_resource}/{stage['max_analysis_resource']})")
        if alert_delta:
            player.alert_level = _clamp_alert(player.alert_level + alert_delta)
        msg = effect.get("log")
        if len(ordered_key_ids) >= 1 and node.id == ordered_key_ids[0]:
            msg = f"【重要】{node.name}から「暗号鍵の断片A: {frag_a}」を入手しました。"
        elif len(ordered_key_ids) >= 2 and node.id == ordered_key_ids[1]:
            msg = f"【重要】{node.name}から「暗号鍵の断片B: {frag_b}」を入手しました。"
        if msg:
            _log(player, "info", msg)
    else:
        reward = stage.get("resource_rewards", {}).get(node.id, 0)
        if reward:
            before = player.analysis_resource
            player.analysis_resource = min(stage["max_analysis_resource"], before + reward)
            _log(player, "success", f"{node.name}: RESOURCE +{player.analysis_resource - before} ({player.analysis_resource}/{stage['max_analysis_resource']})")

    if key_ids and node.id in key_ids:
        statuses = player.node_statuses
        statuses = dict(statuses)
        statuses[node.id] = "hacked"
        if all(statuses.get(kid) == "hacked" for kid in key_ids):
            _log(player,
                "success",
                f"すべての暗号鍵断片が揃いました！断片A「{frag_a}」と断片B「{frag_b}」を繋げた暗号を最終目標の侵入時に入力すると、警戒度上昇を0に抑えられます。",
            )

def _monitoring_extra(stage: dict, statuses: dict[str, str], node_id: str) -> float:
    monitor = stage.get("conditional_breach_alert")
    if monitor and node_id in monitor["target_node_ids"] and statuses.get(monitor["disabled_by_node_id"]) != "hacked":
        return monitor["alert_delta"]
    return 0

def _log_mechanics_unlocked(player: RuleState, stage: GameMapDefinition, node_id: str) -> None:
    statuses = player.node_statuses
    monitor = stage.get("conditional_breach_alert")
    if monitor and node_id == monitor["disabled_by_node_id"]:
        _log(player, "success", f"監視解除: {node_id}攻略により対象ノードの追加警戒度+{monitor['alert_delta']}%が無効になりました。")
    for gate, required in stage.get("breach_requirements", {}).items():
        if node_id in required and statuses.get(gate) != "hacked" and all(statuses.get(n) == "hacked" for n in required):
            _log(player, "success", f"ゲート解除: {gate} の侵入条件を満たしました（前提: {', '.join(sorted(required))}）。")

def _apply_validated_action(
    player: RuleState, stage: GameMapDefinition,
    action_type: str,
    node_id: Optional[str],
    passcode: Optional[str] = None,
    exploit_mismatch: bool = False,
    exploit_id: Optional[str] = None,
    question_id: Optional[str] = None,
) -> None:
    """アクションを検証して適用する。却下時は ActionRejected を投げる。"""

    if action_type in ("confirmInfo", "completeAnalysis"):
        event = "INFO_CONFIRMED" if action_type == "confirmInfo" else "ANALYSIS_COMPLETED"
        player.security_events.setdefault(node_id, []).append(event)
        _log(player, "success", f"[SECURITY:{node_id}:{event}]")
        hint = stage.get("security_rules", {}).get(node_id, {}).get("info_hint")
        if action_type == "confirmInfo" and hint:
            _log(player, "info", f"【調査完了】{hint}")
        return

    if action_type == "pause":
        player.game_status = "paused"
        _log(player, "info", "作戦を一時停止しました。")
        return

    if action_type == "resume":
        player.game_status = "playing"
        _log(player, "info", "作戦を再開しました。")
        return


    # RESOURCE回復はノード選択不要
    if action_type == "recover":

        cost = stage["action_costs"]["recover"]

        player.analysis_resource = min(
            stage["max_analysis_resource"],
            player.analysis_resource + stage["resource_recovery_amount"],
        )

        _advance_time(player, stage,
            cost["time"],
            cost["alert_delta"],
        )

        _log(player,
            "success",
            f"解析資源を回復しました。"
            f"現在のRESOURCE: {player.analysis_resource}",
        )

        _check_game_over(player, stage)
        return

    node = None

    if node_id is not None:
        data = next((n for n in stage["nodes"] if n["id"] == node_id), None)
        node = SimpleNamespace(**data) if data else None

    rule = stage.get("security_rules", {}).get(node_id, {})
    if action_type == "breach" and rule.get("failure_mode") == "consume" and not security_requirements_met(stage, player, node_id):
        cost = stage["action_costs"]["breach"]
        player.analysis_resource -= cost["resource"]
        _advance_time(player, stage, cost["time"], rule["failure_alert"])
        _log(player, "warning", f"{node.name} の攻略条件を満たしていません。侵入は未完了です。")
        _check_game_over(player, stage)
        return

    answers = rule.get("question_answers", {}).get(question_id, rule.get("correct_exploits", []))
    wrong = bool(answers) and exploit_id not in answers
    if action_type == "breach" and wrong:
        penalty = rule.get("exploit_failure_alert", EXPLOIT_MISMATCH_ALERT)
        resource = rule.get("failure_resource", 0)
        player.analysis_resource = max(0, player.analysis_resource - resource)
        player.alert_level = _clamp_alert(player.alert_level + penalty)
        _log(player, "danger", f"【IDS検知警告】{node.name}への不適切な攻撃手法を検知。解析資源 -{resource}、警戒度 +{penalty:g}%（現在: {floor(player.alert_level + 0.5)}%）。")
        _check_game_over(player, stage)
        return

    key_ids = stage["key_fragment_node_ids"]
    cost = stage["action_costs"][action_type]
    # 鍵が揃っていればデータ回収時、または最終目標への暗号付き侵入時の警戒度増加を打ち消す。
    alert_delta = cost["alert_delta"]
    has_all_keys = False
    silent_breach = False
    if key_ids:
        statuses = player.node_statuses
        has_all_keys = all(statuses.get(kid) == "hacked" for kid in key_ids)

    if action_type == "breach" and passcode is not None and passcode.strip():
        silent_breach = True
        alert_delta = 0.0

    if action_type == "dataExtract" and key_ids and has_all_keys:
        alert_delta = 0.0
        cipher_authenticated = player.cipher_authenticated
        resource_cost = 0 if (cipher_authenticated or player.analysis_resource < cost["resource"]) else cost["resource"]
    else:
        resource_cost = cost["resource"]

    monitoring_extra = _monitoring_extra(stage, player.node_statuses, node.id) if action_type == "breach" else 0
    alert_delta += monitoring_extra

    player.analysis_resource -= resource_cost

    _advance_time(player, stage,
        cost["time"],
        alert_delta,
    )

    if monitoring_extra:
        _log(player, "warning", f"条件付き監視: {node.id} 侵入の追加警戒度 +{monitoring_extra}%。")

    # 検知はノード効果・鍵以外の事後軽減・勝利より優先する。
    # 鍵による回収の軽減は上のalert_delta計算で既に適用済み。
    if player.alert_level >= stage["alert_game_over_threshold"]:
        _check_game_over(player, stage)
        return

    if action_type in ("scan", "remoteScan"):
        player.node_statuses[node.id] = "scanned"

        scan_label = (
            "リモートスキャン"
            if action_type == "remoteScan"
            else "通常スキャン"
        )

        _log(player,
            "success",
            f"{node.name} の{scan_label}が完了しました。"
            f"脆弱性: {node.vulnerability or '不明'}"
        )


    elif action_type == "breach":
        player.node_statuses[node.id] = "hacked"


        # 侵入したレイヤーに応じて権限を昇格
        granted = min(
            _layer_index(node.layer, stage) + 1,
            len(stage["privilege_ladder"]) - 1,
        )

        if granted > _privilege_index(player.current_privilege, stage):
            player.current_privilege = stage["privilege_ladder"][granted]

            _log(player,
                "success",
                f"{node.name} への侵入に成功。権限が {player.current_privilege} に昇格しました。",
            )
        elif silent_breach:
            player.cipher_authenticated = True
            _log(player,
                "success",
                f"暗号キー認証に成功！{node.name} へ隠密侵入しました（警戒度上昇なし）。",
            )
        else:
            _log(player, "success", f"{node.name} への侵入に成功しました。")
        _apply_node_effect(player, stage, node)
        _log_mechanics_unlocked(player, stage, node.id)
        reward = rule.get("success_resource", 0)
        if reward:
            player.analysis_resource = min(stage["max_analysis_resource"], player.analysis_resource + reward)
            _log(player, "success", f"{node.name} の攻略報酬として解析資源を{reward}獲得しました。")

    elif action_type == "dataExtract":
        if has_all_keys:
            _log(player, "success", f"復元した暗号鍵を使用し、{node.name} から極秘研究データを隠密回収しました。目的達成！")
        else:
            _log(player, "success", f"{node.name} から機密データを回収しました。目的達成！")
        player.game_status = "won"
        ev = evaluate_mission_result(player, stage["evaluation_config"])
        _log(player,
            "success",
            f"作戦評価: RANK {ev['rank']}（スコア: {ev['score']} / 経過: {player.game_time}秒 / 最終警戒度: {player.alert_level:.0f}% / 残資源: {player.analysis_resource}） - {ev['title']}",
        )

    if player.alert_level >= 70 and player.game_status == "playing":
        _log(player,
            "warning",
            f"警戒度が {player.alert_level:.0f}% に上昇しています。",
        )

    _check_game_over(player, stage)

def validate_action(stage: GameMapDefinition, state: RuleState, action: RuleAction) -> str | None:
    """行動前の確認。入力の変更・消費・ログ追加を行わない。"""
    if action.type in ("pause", "resume"):
        return None if state.game_status == ("playing" if action.type == "pause" else "paused") else "invalid_state"
    if action.type in ("confirmInfo", "completeAnalysis"):
        if state.game_status != "playing" or action.node_id not in stage.get("security_rules", {}):
            return "invalid_state"
        events = state.security_events.get(action.node_id, [])
        if action.type == "confirmInfo":
            if state.node_statuses.get(action.node_id) != "scanned":
                return "node_not_scanned"
            return "invalid_state" if "INFO_CONFIRMED" in events else None
        if "INFO_CONFIRMED" not in events or "ANALYSIS_COMPLETED" in events:
            return "invalid_state"
        return None
    if action.type not in TIMED_ACTIONS:
        return "invalid_state"
    data = next((n for n in stage["nodes"] if n["id"] == action.node_id), None)
    node = SimpleNamespace(**data) if data else None
    try:
        _validate_timed_action(state, stage, action.type, node)
    except ActionRejected as error:
        return error.reason
    if action.type == "breach":
        rule = stage.get("security_rules", {}).get(action.node_id, {})
        if rule.get("required_question") and not action.question_id:
            return "question_required"
        if action.question_id is not None and rule.get("question_answers") and action.question_id not in rule["question_answers"]:
            return "invalid_question"
        if rule.get("failure_mode") == "consume" and not security_requirements_met(stage, state, action.node_id):
            return None
        if rule.get("correct_exploits") and (action.exploit_id is None or not action.exploit_id.strip()):
            return "exploit_required"
    if action.type == "breach" and action.passcode is not None and action.passcode.strip():
        keys = stage["key_fragment_node_ids"]
        target = node.id in stage["target_node_ids"] or (not stage["target_node_ids"] and node.layer == "Core")
        if not target or not keys or not all(state.node_statuses.get(n) == "hacked" for n in keys) or _normalize_passcode(action.passcode) != _normalize_passcode(state.fragment_a + state.fragment_b):
            return "invalid_passcode"
    return None


def transition(stage: GameMapDefinition, state: RuleState, action: RuleAction) -> TransitionResult:
    """同じ入力から同じ結果を返す。返却状態とイベントは入力と共有しない。"""
    reason = validate_action(stage, state, action)
    result = deepcopy(state)
    if reason:
        return TransitionResult(False, reason, result, [])
    result.events = []
    _apply_validated_action(result, stage, action.type, action.node_id, action.passcode, action.exploit_mismatch, action.exploit_id, action.question_id)
    events = result.events
    result.events = []
    return TransitionResult(True, None, result, events)
