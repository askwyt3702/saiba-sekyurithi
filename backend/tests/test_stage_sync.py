import game_logic
import main
import models
from helpers import node_of


def test_obsolete_nodes_are_removed_from_db_and_game_state(game, client):
    db = main.SessionLocal()
    try:
        # ステージ差し替え前に使っていた古いノードが DB に残っている状況を再現する
        db.add(models.NodeMaster(id="old-node", name="古いノード", layer="Core", pos_x=0, pos_y=0))
        db.add(models.NodeState(player_id=int(game), node_id="old-node", status="scanned"))
        db.commit()
        assert any(n["id"] == "old-node" for n in client.get(f"/api/games/{game}").json()["nodes"])

        assert game_logic.remove_obsolete_nodes(db) == 1

        nodes = client.get(f"/api/games/{game}").json()["nodes"]
        assert all(n["id"] != "old-node" for n in nodes)
        assert db.query(models.NodeState).filter_by(node_id="old-node").count() == 0
    finally:
        db.close()


def test_remove_obsolete_nodes_keeps_current_stage_nodes(game, client):
    db = main.SessionLocal()
    try:
        before = len(client.get(f"/api/games/{game}").json()["nodes"])
        assert game_logic.remove_obsolete_nodes(db) == 0
        assert len(client.get(f"/api/games/{game}").json()["nodes"]) == before
    finally:
        db.close()
