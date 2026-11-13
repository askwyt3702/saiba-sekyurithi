"""Pure simulation must agree with the production DB adapter, without owning a DB."""
from copy import deepcopy
import json
from pathlib import Path

import pytest

import game_data
import game_logic
import main
import models
from game_rules import RuleAction, initial_rule_state, transition, validate_action
from map_definition import map_from_stage

SCENARIOS = json.loads((Path(__file__).parent / "fixtures/stage_routes.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("scenario", SCENARIOS, ids=lambda s: s["name"])
def test_pure_simulation_is_repeatable_non_mutating_and_matches_db(scenario):
    definition = map_from_stage(game_data.get_stage(scenario.get("stageId", 1)))
    state = initial_rule_state(definition, "ABCD", "EFGH")
    for key, value in scenario.get("seed", {}).items():
        setattr(state, {"key_fragment_a": "fragment_a", "key_fragment_b": "fragment_b"}.get(key, key), value)
    for status in ("hacked", "scanned"):
        state.node_statuses.update({node: status for node in scenario.get(status, [])})
    actions = scenario.get("actions")
    if actions is None:
        actions = [{"type": kind, "nodeId": node} for node in scenario["route"] for kind in ("scan", "breach")]
        actions += [{"type": "dataExtract", "nodeId": scenario.get("target", "C03")}]
    with main.SessionLocal() as db:
        player = game_logic.create_game(db, scenario.get("stageId", 1))
        for attr in ("game_time", "alert_level", "analysis_resource", "current_privilege", "game_status"):
            setattr(player, attr, getattr(state, attr))
        player.key_fragment_a, player.key_fragment_b = state.fragment_a, state.fragment_b
        for nid, status in state.node_statuses.items():
            game_logic._set_node_status(db, player, nid, status)
        db.commit()
        for data in actions:
            action = RuleAction(data["type"], data.get("nodeId"), data.get("passcode"), data.get("exploitMismatch", False), data.get("exploitId"))
            before, before_map, before_action = deepcopy(state), deepcopy(definition), deepcopy(action)
            reason = validate_action(definition, state, action)
            result = transition(definition, state, action)
            if result.accepted and action.type == "breach" and action.exploit_mismatch and result.state.game_time == state.game_time:
                assert result.state.analysis_resource == state.analysis_resource
                assert result.state.game_time == state.game_time
                assert result.state.alert_level == min(100, state.alert_level + 8)
                assert result.state.node_statuses == state.node_statuses
                assert result.state.security_events == state.security_events
                assert result.state.current_privilege == state.current_privilege
                assert result.state.cipher_authenticated == state.cipher_authenticated
                assert any("IDS" in event.message for event in result.events)
            assert result == transition(definition, state, action)
            assert state == before and definition == before_map and action == before_action
            assert result.reason == reason
            if not result.accepted:
                assert result.state == before and not result.events
            old_logs = db.query(models.GameLog).filter_by(player_id=player.id).count()
            try:
                game_logic.apply_action(db, player, action.type, action.node_id, action.passcode, action.exploit_mismatch, action.exploit_id)
                assert result.accepted
            except game_logic.ActionRejected as error:
                assert not result.accepted and error.reason == result.reason
                db.rollback()
            assert game_logic._rule_state(db, player) == result.state
            logs = db.query(models.GameLog).filter_by(player_id=player.id).order_by(models.GameLog.id).all()[old_logs:]
            assert [(e.timestamp, e.severity, e.message) for e in logs] == [(e.timestamp, e.severity, e.message) for e in result.events]
            state = result.state


def test_map_definition_is_detached_and_controls_rules_without_global_stage_lookup():
    definition = map_from_stage(game_data.get_stage(2))
    original = deepcopy(game_data.STAGES)
    definition["seed"] = "test-map"
    definition["generator_version"] = "test-only"
    definition["important_node_ids"] = {"S2-I04"}
    definition["entry_node_ids"] = {"S2-C02"}
    definition["breach_requirements"] = {"S2-C02": ["S2-I06"]}
    definition["target_node_ids"] = {"S2-C02"}
    definition["initial_state"]["analysis_resource"] = 17
    state = initial_rule_state(definition)
    assert state.analysis_resource == 17
    state.current_privilege = "ROOT"
    state.node_statuses["S2-C02"] = "scanned"
    assert validate_action(definition, state, RuleAction("breach", "S2-C02")) == "node_locked"
    state.node_statuses["S2-I06"] = "hacked"
    state = transition(definition, state, RuleAction("breach", "S2-C02")).state
    assert transition(definition, state, RuleAction("dataExtract", "S2-C02")).state.game_status == "won"
    assert game_data.STAGES == original


def test_returned_state_does_not_alias_inputs_on_rejection_or_acceptance():
    definition = map_from_stage(game_data.get_stage(1))
    state = initial_rule_state(definition)
    for action in (RuleAction("breach", "E02"), RuleAction("scan", "E01")):
        result = transition(definition, state, action)
        result.state.node_statuses["E03"] = "hacked"
        assert state.node_statuses == {}
