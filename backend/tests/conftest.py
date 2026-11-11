"""テスト共通設定。

テストは外部のPostgreSQLに依存させず、使い捨てのSQLiteファイルで動かす
(database.py は import 時に DATABASE_URL を読むので、main を import する前に差し替える)。
ゲームごとに別の player_status 行を使うため、テスト同士は互いに干渉しない。
"""
import os
import sys
import tempfile
from pathlib import Path

_tmp_dir = tempfile.mkdtemp(prefix="nullroute-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_tmp_dir, 'test.db').as_posix()}"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi.testclient import TestClient

import main
import models


@pytest.fixture(scope="session")
def client():
    return TestClient(main.app)


@pytest.fixture
def game(client):
    """新しいゲームを作り、gameId(文字列)を返す。"""
    return client.post("/api/games").json()["gameId"]


@pytest.fixture
def set_player():
    """DBを直接書き換えて、テストに必要な状態(資源・警戒度・権限など)を作る。"""

    def _set(game_id, **fields):
        db = main.SessionLocal()
        try:
            player = db.get(models.PlayerStatus, int(game_id))
            for key, value in fields.items():
                setattr(player, key, value)
            db.commit()
        finally:
            db.close()

    return _set


@pytest.fixture
def act(client):
    """アクションを送り、レスポンス全体(accepted/reason/state)を返す。"""

    def _act(game_id, type_, node=None):
        body = {"type": type_}
        if node is not None:
            body["nodeId"] = node
        res = client.post(f"/api/games/{game_id}/actions", json=body)
        assert res.status_code == 200, res.text
        return res.json()

    return _act
