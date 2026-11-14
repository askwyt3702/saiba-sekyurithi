"""Every node validates a node-scoped question before applying quiz penalties."""
import json
from pathlib import Path
import pytest
import main
import models
import game_data
import game_logic
from balance_config import SECURITY_RULES

NODES = [(stage["id"], node["id"]) for stage in game_data.STAGES.values() for node in stage["nodes"]]
MAIN_RULES = json.loads((Path(__file__).parent / "fixtures/core-stage2-tutorial-security.json").read_text())


@pytest.mark.parametrize("node,expected", MAIN_RULES.items())
def test_new_rules_keep_main_values(node, expected):
    rule = SECURITY_RULES[node]
    assert {key: rule[key] for key in expected} == expected
    assert rule["failure_mode"] == "reject"
    assert rule["exploit_failure_alert"] == expected["failure_alert"]


def prepare(client, stage_id, node):
    # Question/penalty regression uses the fixed catalog; dynamic creation is
    # independently exercised through real API calls in test_dynamic_games.py.
    with main.SessionLocal() as db:
        player = game_logic.create_game(db, stage_id)
        gid = str(player.id)
        player.current_privilege = "ROOT"
        player.alert_level = 10
        for entry in game_data.get_stage(stage_id)["nodes"]:
            game_logic._set_node_status(db, player, entry["id"], "scanned" if entry["id"] == node else "hacked")
        db.commit()
    return gid


@pytest.mark.parametrize("stage_id,node", NODES)
def test_all_questions_and_foreign_question_rejection(stage_id, node, client, act):
    rule = SECURITY_RULES[node]
    assert rule["required_question"] and rule["question_answers"]
    assert all(q.startswith(node + ":") for q in rule["question_answers"])
    foreign = next(q for other, r in SECURITY_RULES.items() if other != node for q in r["question_answers"])
    for question, answers in rule["question_answers"].items():
        gid = prepare(client, stage_id, node)
        act(gid, "confirmInfo", node)
        if rule.get("required_analysis"):
            act(gid, "completeAnalysis", node)
        state = client.get(f"/api/games/{gid}").json()
        for invalid, reason in ((None, "question_required"), ("", "question_required"), ("unknown", "invalid_question"), (foreign, "invalid_question")):
            rejected = act(gid, "breach", node, questionId=invalid, exploitId="unknown")
            assert not rejected["accepted"] and rejected["reason"] == reason
            assert rejected["state"] == state
        missing_answer = act(gid, "breach", node, questionId=question)
        assert not missing_answer["accepted"] and missing_answer["reason"] == "exploit_required"
        assert missing_answer["state"] == state
        other_answer = next(answer for q, ids in rule["question_answers"].items() if q != question for answer in ids)
        for wrong in ("unknown", other_answer):
            before = state
            result = act(gid, "breach", node, questionId=question, exploitId=wrong, exploitMismatch=False)
            assert result["accepted"]
            state = result["state"]
            assert state["alertLevel"] == before["alertLevel"] + rule.get("exploit_failure_alert", 8)
            assert state["analysisResource"] == before["analysisResource"] - rule.get("failure_resource", 0)
            assert state["elapsedSeconds"] == before["elapsedSeconds"] and state["nodes"] == before["nodes"]
        success = act(gid, "breach", node, questionId=question, exploitId=answers[0], exploitMismatch=True)
        assert success["accepted"]
        assert next(n for n in success["state"]["nodes"] if n["id"] == node)["data"]["status"] == "hacked"


@pytest.mark.parametrize("stage_id,node", NODES)
def test_quiz_detection_at_100_precedes_all_node_effects(stage_id, node, client, act, set_player):
    rule = SECURITY_RULES[node]
    gid = prepare(client, stage_id, node)
    act(gid, "confirmInfo", node)
    if rule.get("required_analysis"):
        act(gid, "completeAnalysis", node)
    set_player(gid, alert_level=100-rule.get("exploit_failure_alert", 8))
    lost = act(gid, "breach", node, questionId=next(iter(rule["question_answers"])), exploitId="unknown")["state"]
    assert lost["status"] == "lost" and lost["alertLevel"] == 100 and lost["evaluation"] is None
    assert next(n for n in lost["nodes"] if n["id"] == node)["data"]["status"] == "scanned"


@pytest.mark.parametrize("stage_id,entry", [(0, "external-1"), (2, "S2-E01")])
def test_entry_scan_keeps_confirmation_available_without_relaxing_resources(stage_id, entry, client, act, set_player):
    gid = client.post("/api/games", json={"stageId": stage_id}).json()["gameId"]
    state = act(gid, "scan", entry)["state"]
    assert state["status"] == "playing"
    assert act(gid, "confirmInfo", entry)["accepted"]
    depleted = client.post("/api/games", json={"stageId": stage_id}).json()["gameId"]
    set_player(depleted, analysis_resource=1)
    assert act(depleted, "scan", entry)["state"]["status"] == "lost"
