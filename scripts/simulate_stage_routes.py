"""実判定によるルート再生。ゲームDBに接続せずメモリ内SQLiteを使用。

backend/.venv/Scripts/python.exe scripts/simulate_stage_routes.py
JSON出力をフロントテストでも読み、Mockと一手ずつ比較する。
"""
import json
import sys
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import game_data  # noqa: E402
import game_logic  # noqa: E402
import models  # noqa: E402

SCENARIOS = ROOT / "backend/tests/fixtures/stage_routes.json"


def actions_for(scenario):
    if "actions" in scenario:
        return scenario["actions"]
    actions = [
        {"type": action, "nodeId": node}
        for node in scenario["route"]
        for action in ("scan", "breach")
    ]
    return actions + [{"type": "dataExtract", "nodeId": scenario.get("target", "C03")}]


def summary(state):
    return {
        key: state[key]
        for key in ("status", "elapsedSeconds", "alertLevel", "analysisResource", "privilege", "evaluation")
    } | {
        "nodes": {n["id"]: n["data"]["status"] for n in state["nodes"]},
        "successLogged": any("目的達成" in line["message"] for line in state["log"]),
        "securityEvents": state.get("securityEvents", {}),
        "mechanicsLogs": [line["message"] for line in state["log"] if line["message"].startswith(("監視解除:", "ゲート解除:", "条件付き監視:"))],
    }


def simulate(scenario, engine):
    with Session(engine) as db:
        player = game_logic.create_game(db, scenario.get("stageId", 1))
        for key, value in scenario.get("seed", {}).items():
            setattr(player, key, value)
        for status in ("hacked", "scanned"):
            for node in scenario.get(status, []):
                game_logic._set_node_status(db, player, node, status)
        db.commit()
        steps = []
        for action in actions_for(scenario):
            accepted, reason = True, None
            try:
                game_logic.apply_action(db, player, action["type"], action.get("nodeId"), action.get("passcode"))
            except game_logic.ActionRejected as error:
                db.rollback()
                accepted, reason = False, error.reason
            steps.append({"accepted": accepted, "reason": reason,
                          "state": summary(game_logic.build_game_state(db, player))})
        return {"name": scenario["name"], "steps": steps}


def main():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add_all(models.NodeMaster(**n) for n in game_data.ALL_STAGE_NODES)
        db.commit()
    scenarios = json.loads(SCENARIOS.read_text(encoding="utf-8"))
    print(json.dumps([simulate(scenario, engine) for scenario in scenarios], ensure_ascii=True))


if __name__ == "__main__":
    main()
