"""Bounded Stage1 validation by replaying real pure rules, never a DB adapter."""
from collections import deque
from dataclasses import dataclass, field
from math import isfinite

from game_data import get_stage
from game_rules import RuleAction, initial_rule_state, transition, evaluate_mission_result
from map_definition import map_from_stage
from map_generation_config import DEFAULT_CONFIG, GENERATOR_VERSION, VALIDATOR_VERSION
from map_random import normalize_seed


@dataclass(eq=True)
class RouteEvidence:
    nodes: list[str]
    actions: list[RuleAction]
    elapsed_seconds: int
    alert_level: float
    peak_alert: float
    analysis_resource: int
    privilege: str
    rank: str
    score: int


@dataclass(eq=True)
class ValidationResult:
    accepted: bool
    reasons: list[str]
    version: str = VALIDATOR_VERSION
    routes: dict[str, RouteEvidence] = field(default_factory=dict)
    examined_paths: int = 0
    shortest_node_count: int | None = None
    shortest_time_proven: bool = False
    examined_states: int = 0


def structural_errors(definition, config=DEFAULT_CONFIG):
    try:
        return _structural_errors(definition, config)
    except (KeyError, TypeError, ValueError, AttributeError, OverflowError):
        return ["invalid_definition"]


def _structural_errors(definition, config):
    """Validate against the fixed node/rule pool; only edges/positions may differ."""
    fixed = map_from_stage(get_stage(1))
    if not isinstance(definition, dict):
        return ["invalid_definition"]
    if definition.get("generator_version") != GENERATOR_VERSION or normalize_seed(definition.get("seed")) != definition.get("seed"):
        return ["invalid_generation_identity"]
    nodes, edges = definition.get("nodes", []), definition.get("edges", [])
    if not isinstance(nodes, list) or not isinstance(edges, list):
        return ["invalid_graph"]
    if any(not isinstance(n, dict) for n in nodes):
        return ["invalid_nodes"]
    ids = [n.get("id") for n in nodes]
    if len(ids) != 24 or len(set(ids)) != 24 or set(ids) != {n["id"] for n in fixed["nodes"]}:
        return ["node_pool_changed"]
    fixed_nodes = {n["id"]: n for n in fixed["nodes"]}
    for n in nodes:
        if {k: v for k, v in n.items() if k not in ("pos_x", "pos_y")} != {
            k: v for k, v in fixed_nodes[n["id"]].items() if k not in ("pos_x", "pos_y")
        }:
            return ["node_semantics_changed"]
        if any(isinstance(n.get(k), bool) or not isinstance(n.get(k), (int, float)) or
               not isfinite(n[k]) or int(n[k]) != n[k] for k in ("pos_x", "pos_y")):
            return ["invalid_coordinates"]
        bands = {"External": (0, 420), "DMZ": (600, 1300), "Internal": (1500, 2800), "Core": (3000, 3500)}
        lo, hi = bands[n["layer"]]
        if not 0 <= n["pos_x"] <= 1250 or not lo <= n["pos_y"] <= hi:
            return ["layout_out_of_bounds"]
    for i, a in enumerate(nodes):
        for b in nodes[i + 1:]:
            if abs(a["pos_x"] - b["pos_x"]) < 210 and abs(a["pos_y"] - b["pos_y"]) < 150:
                return ["node_overlap"]
    for key in fixed:
        if key not in ("nodes", "edges", "seed", "generator_version") and definition.get(key) != fixed[key]:
            return ["rules_changed:" + key]
    if not config.min_edges <= len(edges) <= config.max_edges:
        return ["edge_count"]
    seen, edge_ids, adjacency = set(), set(), {nid: set() for nid in ids}
    layers = {n["id"]: fixed["layer_order"].index(n["layer"]) for n in nodes}
    for edge in edges:
        if not isinstance(edge, dict):
            return ["invalid_edge"]
        a, b, eid = edge.get("source"), edge.get("target"), edge.get("id")
        if a not in adjacency or b not in adjacency or a == b or not isinstance(eid, str) or not eid:
            return ["invalid_edge"]
        pair = tuple(sorted((a, b)))
        if pair in seen or eid in edge_ids or abs(layers[a] - layers[b]) > 1:
            return ["duplicate_or_layer_skipping_edge"]
        seen.add(pair)
        edge_ids.add(eid)
        adjacency[a].add(b)
        adjacency[b].add(a)
    if any(not config.min_degree <= len(ns) <= config.max_degree for ns in adjacency.values()):
        return ["degree_bound"]
    visited, queue = {"E01"}, deque(["E01"])
    while queue:
        for nid in sorted(adjacency[queue.popleft()] - visited):
            visited.add(nid)
            queue.append(nid)
    return [] if len(visited) == 24 else ["disconnected"]


def replay_route(definition, nodes, *, authenticate=True):
    """A proof consists of actual accepted actions including intermediate losses."""
    state = initial_rule_state(definition, "ABCD", "EFGH")
    actions, peak = [], state.alert_level

    def run(action):
        nonlocal state, peak
        result = transition(definition, state, action)
        if not result.accepted or result.state.game_status == "lost":
            return False
        state = result.state
        peak = max(peak, state.alert_level)
        actions.append(action)
        return True

    if (not isinstance(nodes, (list, tuple)) or not nodes or not all(isinstance(nid, str) for nid in nodes) or
            len(set(nodes)) != len(nodes) or nodes[-1] != "C03"):
        return None
    for nid in nodes:
        rule = definition["security_rules"].get(nid, {})
        scans = rule.get("allowed_scan_types", ["scan", "remoteScan"])
        scan = "scan" if "scan" in scans else "remoteScan"
        if not run(RuleAction(scan, nid)):
            return None
        if rule.get("required_info") or rule.get("required_analysis"):
            if not run(RuleAction("confirmInfo", nid)):
                return None
        if rule.get("required_analysis") and not run(RuleAction("completeAnalysis", nid)):
            return None
        answers = rule.get("question_answers", {})
        if not answers:
            return None
        question = sorted(answers)[0]
        exploit = sorted(answers[question])[0]
        keys = definition["key_fragment_node_ids"]
        passcode = state.fragment_a + state.fragment_b if (
            authenticate and nid == "C03" and keys and all(state.node_statuses.get(k) == "hacked" for k in keys)
        ) else None
        if not run(RuleAction("breach", nid, passcode=passcode, exploit_id=exploit, question_id=question)):
            return None
        if state.node_statuses.get(nid) != "hacked":
            return None
    if not run(RuleAction("dataExtract", "C03")) or state.game_status != "won":
        return None
    evaluation = evaluate_mission_result(state, definition["evaluation_config"])
    return RouteEvidence(list(nodes), actions, state.game_time, state.alert_level, peak,
                         state.analysis_resource, state.current_privilege, evaluation["rank"], evaluation["score"])


def _dominates(a, b):
    av = (a.elapsed_seconds, a.alert_level, -a.analysis_resource)
    bv = (b.elapsed_seconds, b.alert_level, -b.analysis_resource)
    return all(x <= y for x, y in zip(av, bv)) and any(x < y for x, y in zip(av, bv))


def validate_candidate(definition, proposed_routes, config=DEFAULT_CONFIG):
    errors = structural_errors(definition, config)
    result = ValidationResult(False, errors)
    if errors:
        return result
    if not isinstance(proposed_routes, dict):
        result.reasons.append("invalid_witnesses")
        return result
    for name in ("fast", "stealth", "resource"):
        evidence = replay_route(definition, proposed_routes.get(name, []))
        if evidence is None:
            result.reasons.append("route_not_winnable:" + name)
            return result
        result.routes[name] = evidence
    adjacency = {n["id"]: set() for n in definition["nodes"]}
    for edge in definition["edges"]:
        adjacency[edge["source"]].add(edge["target"])
        adjacency[edge["target"]].add(edge["source"])
    # Search every simple path within the documented finite horizon. Re-select
    # witnesses when auxiliary edges expose a better option, rather than certify
    # a dominated construction hint. Every evaluated route uses real actions.
    alternatives = []
    stack = [("E01",)]
    while stack:
        path = stack.pop()
        result.examined_states += 1
        if result.examined_states > config.max_search_states:
            result.reasons.append("state_budget_exhausted")
            return result
        if path[-1] == "C03":
            result.examined_paths += 1
            if result.examined_paths > config.max_paths:
                result.reasons.append("path_budget_exhausted")
                return result
            evidence = replay_route(definition, path)
            if evidence:
                alternatives.append(evidence)
        elif len(path) < config.max_route_nodes:
            for nid in sorted(adjacency[path[-1]], reverse=True):
                if nid not in path:
                    stack.append(path + (nid,))
    if not alternatives:
        result.reasons.append("no_winning_path")
        return result
    frontier = [r for r in alternatives if not any(_dominates(other, r) for other in alternatives)]
    fast = min(frontier, key=lambda r: (r.elapsed_seconds, r.alert_level, -r.analysis_resource, r.nodes))
    detours = [r for r in frontier if config.detour_min_seconds <= r.elapsed_seconds - fast.elapsed_seconds <= config.detour_max_seconds]
    if not detours:
        result.reasons.append("no_meaningful_detour")
        return result
    stealth = min(detours, key=lambda r: (r.alert_level, r.peak_alert, r.elapsed_seconds, -r.analysis_resource, r.nodes))
    resource = min(detours, key=lambda r: (-r.analysis_resource, r.elapsed_seconds, r.alert_level, r.nodes))
    result.routes = {"fast": fast, "stealth": stealth, "resource": resource}
    if len({frozenset(r.nodes) for r in result.routes.values()}) != 3:
        result.reasons.append("routes_not_distinct")
    if not (config.fast_min_seconds <= fast.elapsed_seconds <= config.fast_max_seconds and
            config.fast_min_alert <= fast.alert_level <= config.fast_max_alert and
            fast.analysis_resource <= config.fast_max_resource):
        result.reasons.append("fast_profile")
    for route in (stealth, resource):
        if not config.detour_min_seconds <= route.elapsed_seconds - fast.elapsed_seconds <= config.detour_max_seconds:
            result.reasons.append("detour_time")
    if fast.alert_level - stealth.alert_level < config.stealth_alert_advantage or stealth.peak_alert >= fast.peak_alert:
        result.reasons.append("stealth_advantage")
    if resource.analysis_resource < fast.analysis_resource + config.resource_advantage or resource.analysis_resource <= stealth.analysis_resource:
        result.reasons.append("resource_advantage")
    if resource.alert_level <= stealth.alert_level:
        result.reasons.append("resource_tradeoff")
    if any(_dominates(a, b) for a in result.routes.values() for b in result.routes.values() if a is not b):
        result.reasons.append("dominated_witness")
    if result.reasons:
        return result
    distances, queue = {"E01": 1}, deque(["E01"])
    while queue:
        nid = queue.popleft()
        for neighbor in sorted(adjacency[nid]):
            if neighbor not in distances:
                distances[neighbor] = distances[nid] + 1
                queue.append(neighbor)
    result.shortest_node_count = distances["C03"]
    costs = definition["action_costs"]
    # Graph distance is a lower bound on all connected hacked sets, not just paths.
    minimum_scan = min(costs[k]["time"] for k in ("scan", "remoteScan"))
    lower_bound = distances["C03"] * (minimum_scan + costs["breach"]["time"]) + costs["dataExtract"]["time"]
    result.shortest_time_proven = fast.elapsed_seconds == lower_bound
    if not result.shortest_time_proven:
        result.reasons.append("fastest_not_proven")
        return result
    result.accepted = True
    return result
