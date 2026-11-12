import json
import math
import subprocess
import sys
from collections import deque
from pathlib import Path
from types import SimpleNamespace

import pytest

import game_data
import game_logic
import main
import models
from balance_config import EVALUATION_CONFIG

ROOT = Path(__file__).resolve().parents[2]
SCENARIOS = json.loads((Path(__file__).parent / "fixtures/stage_routes.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("scenario", SCENARIOS, ids=lambda s: s["name"])
def test_strategy_scenarios_via_api(scenario, client, act):
    state = client.post("/api/games", json={"stageId": scenario.get("stageId", 1)}).json()
    gid = state["gameId"]
    with main.SessionLocal() as db:
        player = db.get(models.PlayerStatus, int(gid))
        for key, value in scenario.get("seed", {}).items():
            setattr(player, key, value)
        for status in ("hacked", "scanned"):
            for node in scenario.get(status, []):
                game_logic._set_node_status(db, player, node, status)
        db.commit()
    actions = scenario.get("actions")
    if actions is None:
        actions = [{"type": kind, "nodeId": node} for node in scenario["route"] for kind in ("scan", "breach")]
        actions += [{"type": "dataExtract", "nodeId": scenario.get("target", "C03")}]
    results = [act(gid, action["type"], action.get("nodeId"), **({"passcode": action["passcode"]} if "passcode" in action else {})) for action in actions]
    state = results[-1]["state"]
    for key, value in scenario.get("expected", {}).items():
        actual = state["evaluation"][key] if key in ("score", "rank") else state[key]
        assert actual == value, (scenario["name"], key, actual, value)
    if "route" in scenario:
        assert all(result["accepted"] for result in results)
        assert state["evaluation"]["rank"] in "SABCD"
        assert any(f"RANK {state['evaluation']['rank']}" in line["message"] for line in state["log"])
    if scenario["name"] == "initial_gates":
        ordinary = [r for action, r in zip(actions, results) if action["type"] not in ("confirmInfo", "completeAnalysis")]
        assert [r["accepted"] for r in ordinary] == [False] * 7 + [True, False, False] + [True] * 6 + [False]
        assert all(r["reason"] == "node_unreachable" for r in results[:7])
    if state["status"] == "lost":
        assert state["evaluation"] is None
        assert not any("目的達成" in line["message"] or "作戦評価" in line["message"] for line in state["log"])
    if scenario["name"] == "breach_reduction_cannot_rescue_detection":
        assert next(n for n in state["nodes"] if n["id"] == "I04")["data"]["status"] == "scanned"


def test_all_connected_shortest_strategies_have_no_supply_or_alert_reduction():
    """移動経路だけでなく、分岐を含む全接続済み集合を7ノードまで調べる。"""
    adjacency = {node["id"]: set() for node in game_data.NODES}
    for a, b in game_data.EDGE_PAIRS:
        adjacency[a].add(b)
        adjacency[b].add(a)
    queue = deque([frozenset({"E01"})])
    seen = set(queue)
    winners = []
    while queue:
        hacked = queue.popleft()
        if "C03" in hacked:
            winners.append(hacked)
            continue
        if len(hacked) == 7:
            continue
        for node in set().union(*(adjacency[n] for n in hacked)) - hacked:
            expanded = hacked | {node}
            if expanded not in seen:
                seen.add(expanded)
                queue.append(expanded)
    assert len(winners) == 2
    assert all(len(nodes) == 7 for nodes in winners)
    useful_effects = {
        nid for nid, effect in game_data.NODE_EFFECTS.items()
        if effect.get("resource_bonus", 0) or effect.get("alert_delta", 0)
    } | set(game_data.RESOURCE_REWARDS)
    assert all(not (nodes & useful_effects) for nodes in winners)
    reachable, pending = {"E01"}, ["E01"]
    while pending:
        for node in adjacency[pending.pop()] - reachable:
            reachable.add(node)
            pending.append(node)
    assert reachable == set(adjacency)
    assert len(reachable) == 24


def test_all_paths_up_to_eight_nodes_can_clear(client, ready_act):
    adjacency = {node["id"]: set() for node in game_data.NODES}
    for a, b in game_data.EDGE_PAIRS:
        adjacency[a].add(b)
        adjacency[b].add(a)
    paths = []

    def visit(path):
        if path[-1] == "C03":
            paths.append(path)
        elif len(path) < 8:
            for node in sorted(adjacency[path[-1]] - set(path)):
                visit(path + [node])

    visit(["E01"])
    assert len(paths) == 15  # 最短2本だけでなく、次点13本も実際のAPIで再生する。
    for path in paths:
        state = client.post("/api/games").json()
        game_id = state["gameId"]
        recoveries = 0
        actions = [(kind, node) for node in path for kind in ("scan", "breach")] + [("dataExtract", "C03")]
        for kind, node in actions:
            if state["analysisResource"] < game_logic.ACTION_COSTS[kind]["resource"]:
                result = ready_act(game_id, "recover")
                assert result["accepted"], path
                state = result["state"]
                recoveries += 1
            result = ready_act(game_id, kind, node)
            assert result["accepted"], (path, kind, node, result)
            state = result["state"]
        assert state["status"] == "won", path
        assert recoveries <= 1
        if len(path) == 7:
            assert recoveries == 0
            assert state["elapsedSeconds"] == 225
            assert state["analysisResource"] == 4
            assert state["alertLevel"] == 47.75


@pytest.mark.parametrize("extra", ["recover", "E02"])
def test_unnecessary_recovery_or_no_reward_detour_does_not_improve_score(extra, client, ready_act):
    route = next(s["route"] for s in SCENARIOS if s["name"] == "resource")
    state = client.post("/api/games").json()
    gid = state["gameId"]
    for node in route:
        for kind in ("scan", "breach"):
            assert ready_act(gid, kind, node)["accepted"]
    if extra == "recover":
        assert ready_act(gid, "recover")["accepted"]
    else:
        for kind in ("scan", "breach"):
            assert ready_act(gid, kind, extra)["accepted"]
    final = ready_act(gid, "dataExtract", "C03")["state"]
    assert final["status"] == "won"
    assert final["evaluation"]["score"] < next(s["expected"]["score"] for s in SCENARIOS if s["name"] == "resource")


@pytest.mark.parametrize("threshold", EVALUATION_CONFIG["thresholds"])
def test_shared_rank_boundaries(threshold):
    config = EVALUATION_CONFIG
    seconds = config["timeGraceSeconds"] + (config["baseScore"] - threshold["minimum"]) / config["timePenaltyPerSecond"]
    player = SimpleNamespace(game_time=seconds, alert_level=0, analysis_resource=0)
    result = game_logic.evaluate_mission_result(player)
    assert result["rank"] == threshold["rank"]
    assert result["score"] == threshold["minimum"]
    if threshold["rank"] != "D":
        player.game_time += 2
        assert game_logic.evaluate_mission_result(player)["rank"] != threshold["rank"]


@pytest.mark.parametrize("resource", range(30))
@pytest.mark.parametrize("time", [0, 240, 600])
def test_recovery_cannot_increase_score(resource, time):
    player = SimpleNamespace(game_time=time, alert_level=20, analysis_resource=resource)
    before = game_logic.evaluate_mission_result(player)["score"]
    player.game_time += 30
    player.alert_level += 10.5
    player.analysis_resource = min(30, player.analysis_resource + 5)
    assert game_logic.evaluate_mission_result(player)["score"] <= before


def test_generation_is_reproducible():
    generated = ROOT / "frontend/src/game/data/stageData.ts"
    before = generated.read_bytes()
    subprocess.run([sys.executable, str(ROOT / "scripts/gen_stage_data.py"), "--check"], cwd=ROOT, check=True, capture_output=True)
    assert generated.read_bytes() == before


def test_routes_have_tradeoffs():
    expected = {s["name"]: s["expected"] for s in SCENARIOS if "expected" in s}
    fast, safe, supply = (expected[name] for name in ("fast", "safe", "resource"))
    assert fast["elapsedSeconds"] < safe["elapsedSeconds"] == supply["elapsedSeconds"]
    assert safe["alertLevel"] < supply["alertLevel"] < fast["alertLevel"]
    assert supply["analysisResource"] > fast["analysisResource"]
    assert math.isclose(safe["alertLevel"], 18.25)
