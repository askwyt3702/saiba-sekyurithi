from collections import Counter
from pathlib import Path

import game_data
import main
import models


def test_stage2_matches_design_graph_and_has_unique_ids(client):
    stage = game_data.get_stage(2)
    assert stage["id"] == 2
    assert len(stage["nodes"]) == 16
    assert len(stage["edges"]) == 21
    assert Counter(n["layer"] for n in stage["nodes"]) == {"External": 1, "DMZ": 4, "Internal": 7, "Core": 4}
    all_ids = [node["id"] for node in game_data.ALL_STAGE_NODES]
    assert len(all_ids) == len(set(all_ids)) == 45
    assert all(n["id"].startswith("S2-") for n in stage["nodes"])
    design = (Path(__file__).resolve().parents[2] / "docs/stage2-level-design.md").read_text(encoding="utf-8")
    graph = design.split("```text", 1)[1].split("```", 1)[0]
    expected = set()
    for line in graph.strip().splitlines():
        source, targets = line.split(":")
        for target in targets.split(","):
            expected.add(frozenset((source.strip(), target.strip())))
    actual = {frozenset((e["source"], e["target"])) for e in stage["edges"]}
    assert actual == expected
    with main.SessionLocal() as db:
        assert all(db.get(models.NodeMaster, n["id"]) is not None for n in stage["nodes"])
    state = client.post("/api/games", json={"stageId": 2}).json()
    assert state["stageId"] == 2
    assert len(state["nodes"]) == 16 and len(state["edges"]) == 21
    assert state["analysisResource"] == 25
    assert state["status"] == "playing"
    assert all(n["data"]["status"] == "unscanned" for n in state["nodes"])
    assert "未実装" in state["log"][0]["message"]
    assert 2 in {s["id"] for s in client.get("/api/stages").json()["stages"]}


def test_stage2_plans_are_inactive_and_preserve_advanced_difficulty():
    stage = game_data.get_stage(2)
    plan = stage["planned_mechanics"]
    assert plan["conditionalBreachAlert"] == {
        "disabledByNodeId": "S2-I07", "targetNodeIds": ["S2-I01", "S2-C01", "S2-C03"], "alertDelta": 12,
    }
    assert plan["breachRequirements"] == {"S2-C02": ["S2-I04"], "S2-C04": ["S2-I07"]}
    assert stage["entry_node_ids"] == {"S2-E01"}
    assert stage["target_node_ids"] == {"S2-C03"}
    assert stage["node_effects"]["S2-I07"]["alert_delta"] == -15


def test_stage1_and_stage2_games_and_resets_are_independent(client, act):
    a = client.post("/api/games", json={"stageId": 1}).json()["gameId"]
    before = act(a, "scan", "E01")["state"]
    b = client.post("/api/games", json={"stageId": 2}).json()["gameId"]
    assert a != b
    assert act(b, "scan", "S2-E01")["accepted"]
    assert act(b, "breach", "S2-E01")["accepted"]
    assert act(b, "scan", "E01")["reason"] == "invalid_state"
    assert act(a, "scan", "S2-E01")["reason"] == "invalid_state"
    reset = client.post(f"/api/games/{b}/reset", json={"stageId": 2}).json()
    assert reset["stageId"] == 2 and reset["analysisResource"] == 25
    assert reset["elapsedSeconds"] == 0
    assert len(reset["nodes"]) == 16
    assert all(n["data"]["status"] == "unscanned" for n in reset["nodes"])
    assert client.get(f"/api/games/{a}").json() == before


def test_only_stage2_target_can_clear(client, act, set_player):
    gid = client.post("/api/games", json={"stageId": 2}).json()["gameId"]
    for node in ("S2-E01", "S2-D01", "S2-D03", "S2-I01", "S2-I02", "S2-C01"):
        assert act(gid, "scan", node)["accepted"]
        assert act(gid, "breach", node)["accepted"]
    result = act(gid, "dataExtract", "S2-C01")
    assert result["accepted"] is False and result["reason"] == "invalid_state"
    assert result["state"]["status"] == "playing"
