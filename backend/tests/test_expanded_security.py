"""Approved main penalties, free prerequisite refusal, and question-scoped answers."""
import pytest
import main
import models
import game_data
import game_logic
from balance_config import SECURITY_RULES


PENALTIES = {
    "D01": 5, "D02": 5, "D03": 6, "D04": 5, "D05": 5, "D06": 4, "D07": 6,
    "I01": 6, "I02": 5, "I03": 5, "I04": 7, "I05": 4, "I06": 5,
    "I07": 5, "I08": 6, "I09": 6, "I10": 5,
}


@pytest.mark.parametrize("node,penalty", PENALTIES.items())
def test_main_penalty_and_prerequisite_precedence(node, penalty, game, act, client, set_player):
    rule = SECURITY_RULES[node]
    assert rule["exploit_failure_alert"] == rule["failure_alert"] == penalty
    assert rule["failure_resource"] == 1 and rule["success_resource"] == 0
    assert rule["required_info"] and rule["failure_mode"] == "reject"
    assert rule["allowed_scan_types"] == ["scan", "remoteScan"]
    with main.SessionLocal() as db:
        player = db.get(models.PlayerStatus, int(game))
        player.current_privilege = "ROOT"
        player.alert_level = 10
        for entry in game_data.NODES:
            game_logic._set_node_status(db, player, entry["id"], "scanned" if entry["id"] == node else "hacked")
        db.commit()
    question = next(iter(rule["question_answers"]))
    before = client.get(f"/api/games/{game}").json()
    rejected = act(game, "breach", node, exploitId="invalid", questionId=question)
    assert not rejected["accepted"] and rejected["reason"] == "security_requirements_unmet"
    assert rejected["state"] == before
    confirmed = act(game, "confirmInfo", node)["state"]
    wrong = act(game, "breach", node, exploitMismatch=False, exploitId="invalid", questionId=question)
    assert wrong["accepted"]
    after = wrong["state"]
    assert after["analysisResource"] == confirmed["analysisResource"] - 1
    assert after["elapsedSeconds"] == confirmed["elapsedSeconds"]
    assert after["alertLevel"] == 10 + penalty
    assert after["nodes"] == confirmed["nodes"] and after["privilege"] == confirmed["privilege"]
    set_player(game, alert_level=100-penalty)
    lost = act(game, "breach", node, exploitId="invalid", questionId=question)["state"]
    assert lost["status"] == "lost" and lost["alertLevel"] == 100 and lost["evaluation"] is None


@pytest.mark.parametrize("node", ["I01", "I02"])
def test_privilege_questions_are_scoped_and_preserved(node):
    rule = SECURITY_RULES[node]
    assert rule["correct_exploits"] == ["priv_esc", "priv_sudo_b"]
    assert rule["required_question"]
    assert rule["question_answers"] == {"priv-q1": ["priv_esc"], "priv-q2": ["priv_sudo_b"]}
    assert all("priv_sudo_b" not in r["correct_exploits"] for nid, r in SECURITY_RULES.items() if nid not in ("I01", "I02"))
