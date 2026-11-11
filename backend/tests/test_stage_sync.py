import game_logic
import main
import models


def test_obsolete_nodes_are_never_included_in_game_state_and_removed_from_db(game, client):
    db = main.SessionLocal()
    try:
        # ステージ差し替え前に使っていた古いノードが DB に残っている状況を再現する
        db.add(models.NodeMaster(id="old-node", name="古いノード", layer="Core", pos_x=0, pos_y=0))
        db.add(models.NodeState(player_id=int(game), node_id="old-node", status="scanned"))
        db.commit()

        # build_game_state はプレイ中ステージのノードだけを返すため、古いノードは混ざらない
        nodes = client.get(f"/api/games/{game}").json()["nodes"]
        assert all(n["id"] != "old-node" for n in nodes)

        # remove_obsolete_nodes で DB テーブル自体からも綺麗に消える
        assert game_logic.remove_obsolete_nodes(db) == 1
        assert db.get(models.NodeMaster, "old-node") is None
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
