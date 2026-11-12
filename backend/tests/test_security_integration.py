"""Confirmed integration contract for E01/E02/E03; uses raw actions, not ready_act."""
import pytest


def test_recovery_preserves_entry_reward_before_adding_five(game, ready_act, set_player):
    ready_act(game, "scan", "E01")
    set_player(game, analysis_resource=2)
    assert ready_act(game, "breach", "E01")["state"]["analysisResource"] == 3
    assert ready_act(game, "recover")["state"]["analysisResource"] == 8


def test_security_progress_survives_reload_and_is_cleared_by_reset(game, client, act):
    assert act(game, "scan", "E01")["accepted"]
    first = act(game, "confirmInfo", "E01")
    assert first["state"]["securityEvents"] == {"E01": ["INFO_CONFIRMED"]}
    assert client.get(f"/api/games/{game}").json() == first["state"]
    repeated = act(game, "confirmInfo", "E01")
    assert not repeated["accepted"] and repeated["state"] == first["state"]
    assert act(game, "completeAnalysis", "E01")["accepted"]
    success = act(game, "breach", "E01")["state"]
    assert success["analysisResource"] == 25
    assert next(n for n in success["nodes"] if n["id"] == "E01")["data"]["status"] == "hacked"
    reset = client.post(f"/api/games/{game}/reset").json()
    assert reset["securityEvents"] == {}
    assert not any(l["message"].startswith("[SECURITY:") for l in reset["log"])


@pytest.mark.parametrize("node", ["E01", "E02"])
def test_missing_requirements_are_paid_failed_attempts(node, game, act):
    assert act(game, "scan", "E01")["accepted"]
    if node == "E02":
        act(game, "confirmInfo", "E01")
        act(game, "completeAnalysis", "E01")
        act(game, "breach", "E01")
        before = act(game, "scan", "E02")["state"]
    else:
        before = act(game, "scan", "E01")["state"]  # rejected repeat does not consume
    failed = act(game, "breach", node)
    assert failed["accepted"]
    after = failed["state"]
    assert after["analysisResource"] == before["analysisResource"] - 2
    assert after["elapsedSeconds"] == before["elapsedSeconds"] + 20
    assert after["alertLevel"] == before["alertLevel"] + 4
    assert next(n for n in after["nodes"] if n["id"] == node)["data"]["status"] == "scanned"


def test_e03_refuses_without_consumption_and_does_not_duplicate_supply(game, ready_act, act):
    ready_act(game, "scan", "E01")
    ready_act(game, "breach", "E01")
    before = act(game, "scan", "E03")["state"]
    refused = act(game, "breach", "E03")
    assert not refused["accepted"] and refused["reason"] == "security_requirements_unmet"
    assert refused["state"] == before
    act(game, "confirmInfo", "E03")
    success = act(game, "breach", "E03")["state"]
    assert success["analysisResource"] == before["analysisResource"] - 2 + 5
    assert act(game, "breach", "E03")["state"] == success
