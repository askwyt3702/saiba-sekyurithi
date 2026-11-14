"""ゲーム単位の内部定義。固定定義の変換を担当し、DB保存はmap_repositoryへ分離する。"""
from copy import deepcopy
from typing import TypedDict

import balance_config as balance


class MapNode(TypedDict):
    id: str
    name: str
    layer: str
    pos_x: float
    pos_y: float
    info: str | None
    vulnerability: str | None


class MapEdge(TypedDict):
    id: str
    source: str
    target: str


class NodeEffect(TypedDict, total=False):
    resource_bonus: int
    alert_delta: float
    log: str


class Monitoring(TypedDict):
    disabled_by_node_id: str
    target_node_ids: list[str]
    alert_delta: float


class InitialState(TypedDict):
    game_time: int
    alert_level: float
    analysis_resource: int
    current_privilege: str
    game_status: str


class ActionCost(TypedDict):
    time: int
    resource: int
    alert_delta: float


class SecurityRule(TypedDict, total=False):
    question_answers: dict[str, list[str]]
    required_question: bool
    exploit_failure_alert: float
    failure_resource: int
    correct_exploits: list[str]
    info_hint: str
    allowed_scan_types: list[str]
    required_scan: bool
    required_info: bool
    required_analysis: bool
    required_privilege: str
    failure_mode: str
    failure_alert: float
    success_resource: int
    vulnerability: str
    risk_level: str


class GameMapDefinition(TypedDict):
    id: int
    seed: str | None
    generator_version: str
    rules_version: str
    nodes: list[MapNode]
    edges: list[MapEdge]
    entry_node_ids: set[str]
    target_node_ids: set[str]
    key_fragment_node_ids: set[str]
    important_node_ids: set[str]
    node_effects: dict[str, NodeEffect]
    conditional_breach_alert: Monitoring | None
    breach_requirements: dict[str, list[str]]
    initial_state: InitialState
    action_costs: dict[str, ActionCost]
    alert_decay_per_second: float
    max_analysis_resource: int
    resource_recovery_amount: int
    alert_game_over_threshold: float
    privilege_ladder: list[str]
    layer_order: list[str]
    evaluation_config: dict
    resource_rewards: dict[str, int]
    security_rules: dict[str, SecurityRule]


def map_from_stage(stage: dict) -> GameMapDefinition:
    """元定義と共有しない作業用コピー。既存キーは互換性のため保持する。"""
    result = deepcopy(stage)
    # 互換の補給定義もマップへ閉じ込め、純粋ルールはグローバル値を読まない。
    from game_data import DEFAULT_STAGE_ID, RESOURCE_REWARDS
    result.update(
        security_rules={nid: deepcopy(rule) for nid, rule in balance.SECURITY_RULES.items()
                        if nid in {n["id"] for n in stage["nodes"]}},
        seed=None, generator_version="fixed-v1", rules_version="turn-v1",
        important_node_ids=set(stage.get("important_node_ids", [])),
        conditional_breach_alert=deepcopy(stage.get("conditional_breach_alert")),
        breach_requirements=deepcopy(stage.get("breach_requirements", {})),
        initial_state={"game_time": 0, "alert_level": 0.0,
                       "analysis_resource": balance.INITIAL_ANALYSIS_RESOURCE,
                       "current_privilege": balance.INITIAL_PRIVILEGE, "game_status": "playing"},
        action_costs=deepcopy(balance.ACTION_COSTS),
        alert_decay_per_second=balance.ALERT_DECAY_PER_SECOND,
        max_analysis_resource=balance.MAX_ANALYSIS_RESOURCE,
        resource_recovery_amount=balance.RESOURCE_RECOVERY_AMOUNT,
        alert_game_over_threshold=balance.ALERT_GAME_OVER_THRESHOLD,
        privilege_ladder=list(balance.PRIVILEGE_LADDER), layer_order=list(balance.LAYER_ORDER),
        evaluation_config=deepcopy(balance.EVALUATION_CONFIG),
        resource_rewards=deepcopy(RESOURCE_REWARDS) if stage["id"] == DEFAULT_STAGE_ID else {},
    )
    return result
