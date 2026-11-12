
import game_logic
import main
import models


def test_obsolete_nodes_are_never_included_in_game_state_and_removed_from_db(game, client):
    db = main.SessionLocal()
    try:
        # 古いステージのノードがDBに残っている状況を再現
        db.add(
            models.NodeMaster(
                id="old-node",
                name="古いノード",
                layer="Core",
                pos_x=0,
                pos_y=0,
            )
        )
        db.add(
            models.NodeState(
                player_id=int(game),
                node_id="old-node",
                status="scanned",
            )
        )
        db.commit()

        # 古いノードがDBに存在することを確認
        assert (
            db.query(models.NodeMaster)
            .filter_by(id="old-node")
            .count()
            == 1
        )

        # 現在のゲーム画面には古いノードを表示しない
        nodes_before = client.get(
            f"/api/games/{game}"
        ).json()["nodes"]

        assert all(
            node["id"] != "old-node"
            for node in nodes_before
        )

        # 古いノードを削除
        assert game_logic.remove_obsolete_nodes(db) == 1

        # DBから削除されたことを確認
        assert (
            db.query(models.NodeMaster)
            .filter_by(id="old-node")
            .count()
            == 0
        )

        assert (
            db.query(models.NodeState)
            .filter_by(node_id="old-node")
            .count()
            == 0
        )

        # APIにも古いノードが存在しない
        nodes_after = client.get(
            f"/api/games/{game}"
        ).json()["nodes"]

        assert all(
            node["id"] != "old-node"
            for node in nodes_after
        )

    finally:
        db.close()


def test_remove_obsolete_nodes_keeps_current_stage_nodes(game, client):
    db = main.SessionLocal()
    try:
        before = len(
            client.get(f"/api/games/{game}").json()["nodes"]
        )

        # 削除対象がなければ0件
        assert game_logic.remove_obsolete_nodes(db) == 0

        after = len(
            client.get(f"/api/games/{game}").json()["nodes"]
        )

        # 現在のステージのノード数は変わらない
        assert after == before

    finally:
        db.close()
