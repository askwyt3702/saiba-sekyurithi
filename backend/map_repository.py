"""Versioned, game-owned snapshots. No generation and no mutation of NodeMaster."""
from copy import deepcopy
from math import isfinite

import models
from game_data import get_stage, DEFAULT_STAGE_ID
from map_definition import map_from_stage

SCHEMA_VERSION = 1


class MapSnapshotError(ValueError):
    pass


def to_wire(stage):
    monitor = stage.get("conditional_breach_alert")
    result = {
        "id": stage["id"], "name": stage["name"], "difficulty": stage["difficulty"],
        "startMessage": stage.get("start_message", ""), "prototypeNotice": stage.get("prototype_notice", ""),
        "nodes": [{"id": n["id"], "name": n["name"], "layer": n["layer"],
                   "position": {"x": n["pos_x"], "y": n["pos_y"]}, "status": "unscanned",
                   "info": n.get("info"), "vulnerability": None} for n in stage["nodes"]],
        "vulnerabilities": {n["id"]: n["vulnerability"] for n in stage["nodes"] if n.get("vulnerability")},
        "edges": deepcopy(stage["edges"]),
        "entryLayers": sorted(stage.get("entry_layers", [])),
        "entryNodeIds": sorted(stage["entry_node_ids"]), "targetNodeIds": sorted(stage["target_node_ids"]),
        "keyFragmentNodeIds": sorted(stage["key_fragment_node_ids"]),
        "importantNodeIds": sorted(stage.get("important_node_ids", [])),
        "nodeEffects": {nid: {"resourceBonus": e.get("resource_bonus", 0), "alertDelta": e.get("alert_delta", 0),
                               "log": e.get("log", "")} for nid, e in stage["node_effects"].items()},
        "conditionalBreachAlert": {"disabledByNodeId": monitor["disabled_by_node_id"],
                                    "targetNodeIds": monitor["target_node_ids"], "alertDelta": monitor["alert_delta"]} if monitor else None,
        "breachRequirements": deepcopy(stage.get("breach_requirements", {})),
        "seed": stage["seed"], "generatorVersion": stage["generator_version"], "rulesVersion": stage["rules_version"],
        "securityRules": deepcopy(stage["security_rules"]),
        "initialState": {"elapsedSeconds": stage["initial_state"]["game_time"],
                         "alertLevel": stage["initial_state"]["alert_level"],
                         "analysisResource": stage["initial_state"]["analysis_resource"],
                         "privilege": stage["initial_state"]["current_privilege"], "status": stage["initial_state"]["game_status"]},
        "rules": {
            "costs": {k: {"time": c["time"], "resource": c["resource"], "alertDelta": c["alert_delta"]} for k, c in stage["action_costs"].items()},
            "alertDecayPerSecond": stage["alert_decay_per_second"], "alertGameOverThreshold": stage["alert_game_over_threshold"],
            "maxAnalysisResource": stage["max_analysis_resource"], "resourceRecoveryAmount": stage["resource_recovery_amount"],
            "privilegeLadder": stage["privilege_ladder"], "layerOrder": stage["layer_order"],
            "resourceRewards": stage["resource_rewards"], "evaluation": stage["evaluation_config"],
        },
    }

    return deepcopy(result)


def from_wire(value, *, supported_generator_versions=("fixed-v1",)):
    """Decode without consulting current stage/config data (including old saved games)."""
    try:
        w = deepcopy(value)
        if w["generatorVersion"] not in supported_generator_versions or w["rulesVersion"] != "turn-v1":
            raise MapSnapshotError("Unsupported map version")
        ids = [n["id"] for n in w["nodes"]]
        if not ids or len(set(ids)) != len(ids) or any(e["source"] not in ids or e["target"] not in ids for e in w["edges"]):
            raise MapSnapshotError("Invalid map graph")
        if any(n["layer"] not in w["rules"]["layerOrder"] or
               not all(isfinite(n["position"][axis]) for axis in ("x", "y")) for n in w["nodes"]):
            raise MapSnapshotError("Invalid map nodes")
        if any(nid not in ids for key in ("entryNodeIds", "targetNodeIds", "keyFragmentNodeIds") for nid in w[key]):
            raise MapSnapshotError("Invalid map roles")
        r, initial = w["rules"], w["initialState"]
        return {
            "id": w["id"], "name": w["name"], "difficulty": w["difficulty"],
            "start_message": w["startMessage"], "prototype_notice": w["prototypeNotice"],
            "nodes": [{"id": n["id"], "name": n["name"], "layer": n["layer"], "pos_x": n["position"]["x"],
                       "pos_y": n["position"]["y"], "info": n["info"], "vulnerability": w["vulnerabilities"].get(n["id"])} for n in w["nodes"]],
            "edges": w["edges"], "entry_layers": set(w["entryLayers"]), "entry_node_ids": set(w["entryNodeIds"]),
            "target_node_ids": set(w["targetNodeIds"]), "key_fragment_node_ids": set(w["keyFragmentNodeIds"]),
            "important_node_ids": set(w["importantNodeIds"]),
            "node_effects": {nid: {"resource_bonus": e["resourceBonus"], "alert_delta": e["alertDelta"], "log": e["log"]} for nid, e in w["nodeEffects"].items()},
            "conditional_breach_alert": {"disabled_by_node_id": w["conditionalBreachAlert"]["disabledByNodeId"],
                                        "target_node_ids": w["conditionalBreachAlert"]["targetNodeIds"],
                                        "alert_delta": w["conditionalBreachAlert"]["alertDelta"]} if w["conditionalBreachAlert"] else None,
            "breach_requirements": w["breachRequirements"], "seed": w["seed"],
            "generator_version": w["generatorVersion"], "rules_version": w["rulesVersion"], "security_rules": w["securityRules"],
            "initial_state": {"game_time": initial["elapsedSeconds"], "alert_level": initial["alertLevel"],
                              "analysis_resource": initial["analysisResource"], "current_privilege": initial["privilege"], "game_status": initial["status"]},
            "action_costs": {k: {"time": c["time"], "resource": c["resource"], "alert_delta": c["alertDelta"]} for k, c in r["costs"].items()},
            "alert_decay_per_second": r["alertDecayPerSecond"], "alert_game_over_threshold": r["alertGameOverThreshold"],
            "max_analysis_resource": r["maxAnalysisResource"], "resource_recovery_amount": r["resourceRecoveryAmount"],
            "privilege_ladder": r["privilegeLadder"], "layer_order": r["layerOrder"],
            "resource_rewards": r["resourceRewards"], "evaluation_config": r["evaluation"],
        }
    except (KeyError, TypeError, AttributeError, OverflowError) as error:
        raise MapSnapshotError("Invalid saved map") from error


def save_map(db, player, definition, source="fixed"):
    wire = to_wire(definition)
    from_wire(wire)
    row = db.get(models.GameMap, player.id)
    if row is None:
        row = models.GameMap(game_id=player.id)
        db.add(row)
    row.schema_version, row.source, row.definition = SCHEMA_VERSION, source, wire
    db.flush()
    return row


def ensure_map(db, player):
    row = db.get(models.GameMap, player.id)
    if row is None:
        # Capture the existing master's display data before startup synchronization.
        definition = map_from_stage(get_stage(player.stage_id if player.stage_id is not None else DEFAULT_STAGE_ID))
        for node in definition["nodes"]:
            master = db.get(models.NodeMaster, node["id"])
            if master is not None:
                node.update({key: getattr(master, key) for key in ("name", "layer", "pos_x", "pos_y", "info", "vulnerability")})
        row = save_map(db, player, definition, "legacy-fixed")
        player.stage_id = definition["id"]
        db.commit()
    if row.schema_version != SCHEMA_VERSION or row.source not in ("fixed", "legacy-fixed"):
        raise MapSnapshotError("Unsupported snapshot schema")
    return row


def load_map(db, player):
    definition = from_wire(ensure_map(db, player).definition)
    if definition["id"] != player.stage_id:
        raise MapSnapshotError("Map stage does not match game")
    return definition


def public_snapshot(db, player, definition, nodes):
    wire = to_wire(definition)
    wire["nodes"] = [{"id": n["id"], "position": n["position"], "name": n["data"]["label"], "layer": n["data"]["layer"],
                      "status": "unscanned", "info": n["data"]["info"], "vulnerability": n["data"]["vulnerability"]} for n in nodes]
    wire["vulnerabilities"] = {n["id"]: n["data"]["vulnerability"] for n in nodes if n["data"]["vulnerability"]}
    revealed = {n["id"] for n in nodes if n["data"]["status"] != "unscanned"}
    wire["securityRules"] = {nid: {k: v for k, v in r.items() if k not in ("question_answers", "vulnerability") and
                                   (k != "info_hint" or nid in revealed)} for nid, r in wire["securityRules"].items()}
    return {"schemaVersion": SCHEMA_VERSION, "source": ensure_map(db, player).source, "definition": wire}
