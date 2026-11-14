"""Unconnected prototype: construct, validate, then return a Stage1 map or fail.

No DB, clock, global RNG, UI or game-creation hooks. Complete maps are never presets.
"""
from dataclasses import dataclass
import hashlib
import json

from game_data import get_stage
from map_definition import GameMapDefinition, map_from_stage
from map_generation_config import DEFAULT_CONFIG, GENERATOR_VERSION, VALIDATOR_VERSION
from map_random import CounterRandom, normalize_seed
from map_validation import ValidationResult, validate_candidate


@dataclass(eq=True)
class GeneratedMap:
    definition: GameMapDefinition
    validation: ValidationResult
    accepted_attempt: int
    config_hash: str
    map_hash: str
    rejected: list[list[str]]


class GenerationFailure(ValueError):
    def __init__(self, seed, rejected):
        self.seed, self.rejected = seed, rejected
        super().__init__(f"No validated map for seed {seed} after {len(rejected)} attempts")


def canonical_json(value):
    """Canonical UTF-8 JSON: sorted keys, arrays retained, integral floats as ints."""
    def normalize(v):
        if isinstance(v, dict):
            return {k: normalize(v[k]) for k in sorted(v)}
        if isinstance(v, (set, frozenset)):
            return [normalize(x) for x in sorted(v)]
        if isinstance(v, (list, tuple)):
            return [normalize(x) for x in v]
        if isinstance(v, float) and v.is_integer():
            return int(v)
        return v
    return json.dumps(normalize(value), ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))


def digest(value):
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def construct_candidate(seed: str, attempt: int, config=DEFAULT_CONFIG) -> tuple[GameMapDefinition, dict[str, list[str]]]:
    """Build role branches from shuffled pools, then bounded-degree cycles.

    Depth limits preserve a time lower bound. Auxiliary vertices stay in one
    branch, so a supply/stealth bypass must be paid for rather than free-ridden.
    """
    seed = normalize_seed(seed)
    if not isinstance(attempt, int) or isinstance(attempt, bool) or attempt < 0:
        raise ValueError("attempt must be a non-negative integer")
    roles = CounterRandom(seed, f"{GENERATOR_VERSION}/attempt/{attempt}/roles")
    links = CounterRandom(seed, f"{GENERATOR_VERSION}/attempt/{attempt}/edges")
    layout = CounterRandom(seed, f"{GENERATOR_VERSION}/attempt/{attempt}/layout")
    definition = map_from_stage(get_stage(1))
    definition.update(seed=seed, generator_version=GENERATOR_VERSION)
    dmz = roles.shuffle([f"D{i:02}" for i in range(1, 8) if i != 6])
    neutral = roles.shuffle(["I01", "I02", "I08", "I10"])
    low = roles.shuffle(["I03", "I04"])
    cores = roles.shuffle(["C01", "C02"])
    safe_dmz = roles.shuffle(["D06", dmz[2]])
    routes = {
        "fast": ["E01", *dmz[:2], *neutral[:2], cores[0], "C03"],
        "stealth": ["E01", *safe_dmz, low[0], "I06", "I07", "C04", "C03"],
        "resource": ["E01", "E03", dmz[3], "I05", "I09", neutral[2], cores[1], "C03"],
    }
    depths = {"fast": [0, 1, 2, 3, 4, 5, 6],
              "stealth": [0, 1, 2, 2, 3, 4, 5, 6],
              "resource": [0, 0, 1, 2, 3, 4, 5, 6]}
    # Optional additional supply detour changes branch length as well as identities.
    extra_supply = bool(roles.below(2))
    if extra_supply:
        routes["resource"].insert(3, dmz[4])
        depths["resource"].insert(3, 1)
    membership, depth = {}, {}
    pairs = set()
    for branch, route in routes.items():
        for nid, d in zip(route, depths[branch]):
            depth[nid] = d
            if nid not in ("E01", "C03"):
                membership[nid] = branch
        pairs.update(tuple(sorted((a, b))) for a, b in zip(route, route[1:]))
    membership["E02"], depth["E02"] = "resource", 0
    membership[low[1]], depth[low[1]] = "stealth", 2
    membership[neutral[3]], depth[neutral[3]] = "fast", 3 + roles.below(2)
    for nid in dmz[4 + int(extra_supply):]:
        membership[nid], depth[nid] = ("fast" if roles.below(2) == 0 else "stealth"), 1 + roles.below(2)
    layers = {n["id"]: definition["layer_order"].index(n["layer"]) for n in definition["nodes"]}
    ids = sorted(layers)
    possible = []
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            # Entry and final node may only connect at their own depth boundary.
            same_branch = a in ("E01", "C03") or b in ("E01", "C03") or membership[a] == membership[b]
            # Preserve the paid entry detour and two-DMZ stealth approach.
            # Other local cross-layer links are allowed, then replay-validated.
            protected = False
            for outer, inner in ((a, b), (b, a)):
                protected |= (outer == "E01" and membership.get(inner) == "resource" and layers[inner] == 1)
                protected |= (membership.get(outer) == "stealth" and layers[outer] == 1 and layers[inner] == 2 and depth[outer] != depth[inner])
            if same_branch and not protected and abs(depth[a] - depth[b]) <= 1 and abs(layers[a] - layers[b]) <= 1:
                possible.append((a, b))
    possible = links.shuffle(possible)
    degree = {nid: sum(nid in pair for pair in pairs) for nid in ids}

    def add(pair):
        a, b = pair
        if pair not in pairs and degree[a] < config.max_degree and degree[b] < config.max_degree:
            pairs.add(pair)
            degree[a] += 1
            degree[b] += 1

    for nid in roles.shuffle(ids):
        for pair in possible:
            if degree[nid] >= config.min_degree:
                break
            if nid in pair:
                add(pair)
    desired = config.min_edges + links.below(config.max_edges - config.min_edges + 1)
    for pair in possible:
        if len(pairs) >= desired:
            break
        add(pair)
    definition["edges"] = [{"id": f"generated-{a}-{b}", "source": a, "target": b} for a, b in sorted(pairs)]
    # Four columns and separated rows fit existing MapView bounds; all integers.
    bands = {"External": (40, 1), "DMZ": (640, 2), "Internal": (1540, 3), "Core": (3040, 1)}
    for layer, (base_y, rows) in bands.items():
        nodes = sorted((n for n in definition["nodes"] if n["layer"] == layer), key=lambda n: n["id"])
        columns = 3 if layer == "External" else 4
        slots = layout.shuffle([(col, row) for row in range(rows) for col in range(columns)])
        for node, (col, row) in zip(nodes, slots):
            node["pos_x"] = 80 + col * 300 + layout.below(31)
            node["pos_y"] = base_y + row * 330 + layout.below(31)
    return definition, routes


def generate_stage1(seed: str, config=DEFAULT_CONFIG) -> GeneratedMap:
    seed = normalize_seed(seed)
    if not 1 <= config.max_attempts <= 64 or not 24 <= config.min_edges <= config.max_edges <= 60:
        raise ValueError("invalid generation limits")
    if (not 1 <= config.min_degree <= config.max_degree <= 8 or not 1 <= config.max_paths <= 4096 or
            not 1 <= config.max_search_states <= 80000 or not 3 <= config.max_route_nodes <= 12):
        raise ValueError("invalid validation limits")
    config_hash = digest({"generator": GENERATOR_VERSION, "validator": VALIDATOR_VERSION,
                          "config": config.as_dict(), "fixed_definition": map_from_stage(get_stage(1))})
    rejected = []
    for attempt in range(config.max_attempts):
        definition, routes = construct_candidate(seed, attempt, config)
        validation = validate_candidate(definition, routes, config)
        if validation.accepted:
            return GeneratedMap(definition, validation, attempt, config_hash, digest(definition), rejected)
        rejected.append(validation.reasons)
    raise GenerationFailure(seed, rejected)
