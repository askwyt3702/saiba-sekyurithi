"""Offline generator benchmark; never imports database/main or writes game data."""
import argparse
from collections import Counter
from dataclasses import asdict
import json
from pathlib import Path
import statistics
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from map_generation import generate_stage1, GenerationFailure
from map_generation_config import GENERATOR_VERSION, VALIDATOR_VERSION


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seeds", type=int, default=256)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if not 1 <= args.seeds <= 10000:
        parser.error("seeds must be 1..10000")
    durations, failures, attempts, reasons, hashes, layouts, graphs, examples = [], [], [], Counter(), set(), set(), set(), []
    for i in range(args.seeds):
        seed = f"{i:032x}"
        start = time.perf_counter()
        try:
            generated = generate_stage1(seed)
            durations.append(time.perf_counter() - start)
            attempts.append(generated.accepted_attempt + 1)
            hashes.add(generated.map_hash)
            layouts.add(tuple((n["id"], n["pos_x"], n["pos_y"]) for n in generated.definition["nodes"]))
            graphs.add(tuple((e["source"], e["target"]) for e in generated.definition["edges"]))
            reasons.update(reason for rejected in generated.rejected for reason in rejected)
            if len(examples) < 3:
                examples.append({"seed": seed, "acceptedAttempt": generated.accepted_attempt,
                                 "edges": len(generated.definition["edges"]), "mapHash": generated.map_hash,
                                 "configHash": generated.config_hash,
                                 "examinedPaths": generated.validation.examined_paths,
                                 "examinedStates": generated.validation.examined_states,
                                 "routes": {k: asdict(v) for k, v in generated.validation.routes.items()}})
        except GenerationFailure as error:
            failures.append({"seed": seed, "reasons": error.rejected})
    ordered = sorted(durations)
    result = {"generatorVersion": GENERATOR_VERSION, "validatorVersion": VALIDATOR_VERSION,
              "testedSeeds": args.seeds, "successes": len(durations), "failures": failures,
              "uniqueMaps": len(hashes), "uniqueLayouts": len(layouts), "uniqueGraphs": len(graphs),
              "seconds": {"median": statistics.median(ordered) if ordered else None,
                          "p95": ordered[min(len(ordered) - 1, int(len(ordered) * .95))] if ordered else None,
                          "maximum": max(ordered, default=None), "total": sum(ordered)},
              "maxAttemptsUsed": max(attempts, default=0), "rejectionReasons": dict(reasons), "examples": examples}
    if args.output:
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k not in ("examples", "failures")}, ensure_ascii=True))
    if failures:
        print(f"failed seeds: {len(failures)}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
