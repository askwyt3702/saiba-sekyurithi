"""Explicit offline golden-vector export for the future TypeScript generator."""
from dataclasses import asdict
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from game_rules import initial_rule_state, transition
from map_generation import generate_stage1
from map_generation_config import GENERATOR_VERSION, VALIDATOR_VERSION
from map_random import CounterRandom


def state_summary(state):
    return {"elapsedSeconds": state.game_time, "alertLevel": state.alert_level,
            "analysisResource": state.analysis_resource, "privilege": state.current_privilege,
            "status": state.game_status, "nodes": dict(sorted(state.node_statuses.items())),
            "securityEvents": state.security_events, "cipherAuthenticated": state.cipher_authenticated}


def build_fixture():
    rng = CounterRandom("0" * 32, "portable-v1")
    result = {"generatorVersion": GENERATOR_VERSION, "validatorVersion": VALIDATOR_VERSION,
              "rng": {"seed": "0" * 32, "stream": "portable-v1", "uint32": [rng.uint32() for _ in range(8)]}, "maps": []}
    for seed in ("0" * 32, "1" * 32, "abcdef0123456789abcdef0123456789"):
        generated = generate_stage1(seed)
        d = generated.definition
        example = {"seed": seed, "acceptedAttempt": generated.accepted_attempt, "configHash": generated.config_hash,
                   "mapHash": generated.map_hash, "rejected": generated.rejected,
                   "positions": {n["id"]: {"x": n["pos_x"], "y": n["pos_y"]} for n in d["nodes"]},
                   "edges": d["edges"], "routes": {}}
        for name, evidence in generated.validation.routes.items():
            state = initial_rule_state(d, "ABCD", "EFGH")
            trace = []
            for action in evidence.actions:
                transition_result = transition(d, state, action)
                assert transition_result.accepted
                state = transition_result.state
                trace.append(state_summary(state))
            example["routes"][name] = {"nodes": evidence.nodes, "actions": [asdict(a) for a in evidence.actions],
                                      "trace": trace, "rank": evidence.rank, "score": evidence.score}
        result["maps"].append(example)
    return result


if __name__ == "__main__":
    target = ROOT / "backend/tests/fixtures/stage1_generator_v1.json"
    target.write_text(json.dumps(build_fixture(), ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(target.relative_to(ROOT))
