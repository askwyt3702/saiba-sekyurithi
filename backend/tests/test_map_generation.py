"""The generator is offline, deterministic, bounded and uses real game rules."""
from copy import deepcopy
from dataclasses import replace
import json
from pathlib import Path

import pytest

import game_data
from game_rules import initial_rule_state, transition
from map_definition import map_from_stage
from map_generation import construct_candidate, generate_stage1, GenerationFailure, canonical_json, digest
from map_generation_config import DEFAULT_CONFIG, GENERATOR_VERSION
from map_random import CounterRandom, normalize_seed
from map_validation import structural_errors, validate_candidate, replay_route
from map_repository import to_wire, from_wire, MapSnapshotError


def test_generator_is_repeatable_detached_and_does_not_mutate_fixed_data():
    before = deepcopy(game_data.STAGES)
    first = generate_stage1("a" * 32)
    second = generate_stage1("A" * 32)
    assert first == second
    assert game_data.STAGES == before
    first.definition["nodes"][0]["pos_x"] += 1
    assert first != second
    assert game_data.STAGES == before


@pytest.mark.parametrize("index", range(32))
def test_generated_maps_have_three_real_winning_routes_and_unchanged_rules(index):
    generated = generate_stage1(f"{index:032x}")
    definition, validation = generated.definition, generated.validation
    assert validation.accepted and validation.shortest_time_proven
    assert not structural_errors(definition)
    assert len(definition["nodes"]) == 24
    assert 34 <= len(definition["edges"]) <= 40
    assert generated.accepted_attempt < DEFAULT_CONFIG.max_attempts
    assert validation.examined_paths <= DEFAULT_CONFIG.max_paths
    assert validation.examined_states <= DEFAULT_CONFIG.max_search_states
    for evidence in validation.routes.values():
        state = initial_rule_state(definition, "ABCD", "EFGH")
        for action in evidence.actions:
            before = deepcopy(state)
            result = transition(definition, state, action)
            assert state == before
            assert result.accepted and result.state.game_status != "lost"
            assert 0 <= result.state.analysis_resource <= 30
            assert result.state.alert_level < 100
            state = result.state
        assert state.game_status == "won"
        assert state.game_time == evidence.elapsed_seconds
        assert state.analysis_resource == evidence.analysis_resource
        assert state.alert_level == evidence.alert_level
    assert len({frozenset(r.nodes) for r in validation.routes.values()}) == 3


def test_seeds_change_geometry_and_topology():
    maps = [generate_stage1(f"{i:032x}").definition for i in range(12)]
    assert len({digest(m["edges"]) for m in maps}) == len(maps)
    assert len({digest(m["nodes"]) for m in maps}) == len(maps)


@pytest.mark.parametrize("seed", ["", "1", "g" * 32, " " + "0" * 32, None, 1, "0" * 33])
def test_bad_seed_rejected(seed):
    with pytest.raises(ValueError):
        generate_stage1(seed)


def test_invalid_candidate_is_discarded_without_fixed_fallback(monkeypatch):
    import map_generation
    original = map_generation.construct_candidate
    calls = []

    def bad_first(seed, attempt, config):
        calls.append(attempt)
        definition, routes = original(seed, attempt, config)
        if attempt == 0:
            definition["edges"] = []
        return definition, routes

    monkeypatch.setattr(map_generation, "construct_candidate", bad_first)
    generated = generate_stage1("0" * 32)
    assert generated.accepted_attempt > 0
    assert generated.rejected[0] == ["edge_count"]
    assert calls == list(range(generated.accepted_attempt + 1))
    with pytest.raises(GenerationFailure) as failure:
        generate_stage1("0" * 32, replace(DEFAULT_CONFIG, max_attempts=1))
    assert failure.value.seed == "0" * 32 and len(failure.value.rejected) == 1


def test_search_budget_exhaustion_never_accepts_unknown_map():
    definition, routes = construct_candidate("0" * 32, 0)
    for config in (replace(DEFAULT_CONFIG, max_paths=1), replace(DEFAULT_CONFIG, max_search_states=1)):
        result = validate_candidate(definition, routes, config)
        assert not result.accepted
        assert any("budget_exhausted" in reason for reason in result.reasons)


def test_auxiliary_shortcut_cannot_silently_replace_risky_fast_route():
    definition, routes = construct_candidate("0" * 32, 0)
    first_dmz, first_internal = routes["fast"][1], routes["fast"][3]
    definition["edges"].append({"id": "shortcut", "source": first_dmz, "target": first_internal})
    result = validate_candidate(definition, routes, replace(DEFAULT_CONFIG, max_degree=8))
    assert not result.accepted and "fast_profile" in result.reasons


@pytest.mark.parametrize("bad", [None, [], {"nodes": [None]}, {"nodes": [{"id": []}]}])
def test_malformed_candidate_is_an_explicit_rejection(bad):
    assert not validate_candidate(bad, {}).accepted


def test_invalid_proof_is_not_an_accepted_map():
    definition, _ = construct_candidate("0" * 32, 0)
    for proposed in (None, {}, {"fast": [None]}):
        assert not validate_candidate(definition, proposed).accepted


@pytest.mark.parametrize("damage", ["self", "duplicate", "missing", "isolated", "skip", "overlap", "rules", "node"])
def test_invalid_structure_is_rejected(damage):
    definition, routes = construct_candidate("0" * 32, 0)
    if damage == "self":
        definition["edges"][0]["target"] = definition["edges"][0]["source"]
    elif damage == "duplicate":
        definition["edges"][1] = deepcopy(definition["edges"][0])
    elif damage == "missing":
        definition["edges"][0]["target"] = "not-a-node"
    elif damage == "isolated":
        definition["edges"] = [e for e in definition["edges"] if "E02" not in (e["source"], e["target"])]
    elif damage == "skip":
        definition["edges"][0].update(source="E01", target="C03")
    elif damage == "overlap":
        definition["nodes"][1].update(pos_x=definition["nodes"][0]["pos_x"], pos_y=definition["nodes"][0]["pos_y"])
    elif damage == "rules":
        definition["initial_state"]["analysis_resource"] = 100
    else:
        definition["nodes"][0]["info"] = "changed"
    assert not validate_candidate(definition, routes).accepted


def test_replay_uses_confirm_analysis_keys_and_real_loss_conditions():
    generated = generate_stage1("0" * 32)
    route = generated.validation.routes["stealth"]
    assert any(a.type == "confirmInfo" and a.node_id == "E01" for a in route.actions)
    assert any(a.type == "completeAnalysis" and a.node_id == "E01" for a in route.actions)
    assert any(a.passcode == "ABCDEFGH" for a in route.actions)
    bad = deepcopy(generated.definition)
    bad["initial_state"]["alert_level"] = 99
    assert replay_route(bad, route.nodes) is None
    bad = deepcopy(generated.definition)
    bad["initial_state"]["analysis_resource"] = 1
    assert replay_route(bad, route.nodes) is None
    bad = deepcopy(generated.definition)
    bad["breach_requirements"]["C03"] = ["E02"]
    assert replay_route(bad, route.nodes) is None


@pytest.mark.parametrize("strategy", ["fast", "stealth", "resource"])
def test_example_has_room_for_one_real_target_question_mistake(strategy):
    generated = generate_stage1("0" * 32)
    state = initial_rule_state(generated.definition, "ABCD", "EFGH")
    for action in generated.validation.routes[strategy].actions:
        if action.type == "breach" and action.node_id == "C03":
            wrong = transition(generated.definition, state, replace(action, exploit_id="not-a-correct-answer"))
            assert wrong.accepted
            assert wrong.state.game_time == state.game_time
            assert wrong.state.alert_level == state.alert_level + 10
            assert wrong.state.analysis_resource == state.analysis_resource - 1
            state = wrong.state
        step = transition(generated.definition, state, action)
        assert step.accepted and step.state.game_status != "lost"
        state = step.state
    assert state.game_status == "won"


def test_snapshot_wire_roundtrip_requires_explicit_generator_version_opt_in():
    generated = generate_stage1("0" * 32)
    wire = to_wire(generated.definition)
    with pytest.raises(MapSnapshotError):
        from_wire(wire)
    assert to_wire(from_wire(wire, supported_generator_versions=(GENERATOR_VERSION,))) == wire


def test_canonical_numbers_and_prng_portable_vectors():
    assert canonical_json({"b": 1.0, "a": -0.0, "ids": {"b", "a"}}) == '{"a":0,"b":1,"ids":["a","b"]}'
    fixture = json.loads((Path(__file__).parent / "fixtures/stage1_generator_v1.json").read_text(encoding="utf-8"))
    rng = CounterRandom(fixture["rng"]["seed"], fixture["rng"]["stream"])
    assert [rng.uint32() for _ in fixture["rng"]["uint32"]] == fixture["rng"]["uint32"]
    for example in fixture["maps"]:
        generated = generate_stage1(example["seed"])
        assert generated.map_hash == example["mapHash"]
        assert generated.config_hash == example["configHash"]
        assert generated.accepted_attempt == example["acceptedAttempt"]


@pytest.mark.parametrize("config", [replace(DEFAULT_CONFIG, max_attempts=0), replace(DEFAULT_CONFIG, max_attempts=65),
                                  replace(DEFAULT_CONFIG, min_edges=50, max_edges=40), replace(DEFAULT_CONFIG, max_paths=0)])
def test_invalid_limits_rejected(config):
    with pytest.raises(ValueError):
        generate_stage1("0" * 32, config)
