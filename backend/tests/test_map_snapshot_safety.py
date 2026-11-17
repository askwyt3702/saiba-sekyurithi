"""保存したマップ(ステージ4のランダムマップ)が壊れている・読めない形式のときの扱い。"""
import json

import pytest

import game_logic
import main
import models


def _snapshot(game_id):
    db = main.SessionLocal()
    try:
        return db.get(models.PlayerStatus, int(game_id)).map_snapshot
    finally:
        db.close()


@pytest.fixture
def random_game(client):
    return client.post("/api/games", json={"stageId": 4, "seed": "safety"}).json()["gameId"]


def test_saved_map_carries_a_schema_version(random_game):
    payload = json.loads(_snapshot(random_game))
    assert payload["schema_version"] == game_logic.MAP_SNAPSHOT_VERSION


def test_maps_saved_before_versioning_still_load(client, random_game, set_player):
    legacy = json.loads(_snapshot(random_game))
    legacy.pop("schema_version")
    set_player(random_game, map_snapshot=json.dumps(legacy, ensure_ascii=False))

    res = client.get(f"/api/games/{random_game}")
    assert res.status_code == 200
    assert res.json()["stageId"] == 4


@pytest.mark.parametrize("broken", [
    "{not json",
    json.dumps([1, 2, 3]),
    json.dumps({"schema_version": 99, "id": 4, "nodes": [], "edges": []}),
    json.dumps({"schema_version": 1, "id": 4}),
])
def test_unreadable_saved_map_returns_409_instead_of_crashing(client, random_game, set_player, broken):
    set_player(random_game, map_snapshot=broken)

    res = client.get(f"/api/games/{random_game}")
    assert res.status_code == 409
    assert res.json() == {"detail": "map_snapshot_invalid"}

    action = client.post(f"/api/games/{random_game}/actions", json={"type": "scan", "nodeId": "E01"})
    assert action.status_code == 409


def test_reset_recovers_a_game_with_a_broken_saved_map(client, random_game, set_player):
    set_player(random_game, map_snapshot="{not json")

    res = client.post(f"/api/games/{random_game}/reset", json={"stageId": 4})
    assert res.status_code == 200
    assert res.json()["stageId"] == 4
    assert client.get(f"/api/games/{random_game}").status_code == 200
