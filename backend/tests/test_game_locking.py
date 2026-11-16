"""同じゲームへの操作が同時に届いたときの扱い(行ロック)のテスト。

テストは SQLite で動くため、実際に2つの操作を同時に送ってもロックの効果は確かめられない
(SQLite には SELECT ... FOR UPDATE が無い)。ここでは
- 本番の PostgreSQL に対しては FOR UPDATE 付きのクエリになること
- ロックのために処理の順番を変えても、操作・リセット・「使われた記録」が今まで通り動くこと
を確かめる。実際の同時送信での挙動は、Docker の PostgreSQL に対して手で確認した。
"""
from datetime import timedelta

import pytest
from sqlalchemy.dialects import postgresql

import game_logic
import main
import models


@pytest.fixture
def db():
    session = main.SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _sql(query):
    return str(query.statement.compile(dialect=postgresql.dialect()))


def test_state_changing_requests_lock_the_game_row_on_postgresql(db):
    assert "FOR UPDATE" in _sql(game_logic.game_query(db, 1, for_update=True))
    # 読むだけのとき(GET)はロックしない
    assert "FOR UPDATE" not in _sql(game_logic.game_query(db, 1))


def _last_access(db, game_id):
    db.expire_all()
    return db.get(models.PlayerStatus, int(game_id)).last_accessed_at


@pytest.mark.parametrize("type_,node,accepted", [
    ("scan", "E01", True),
    ("scan", "ZZZ", False),  # 拒否された操作でも「使われた記録」は残す
])
def test_actions_still_record_access_while_holding_the_lock(game, act, set_player, db, type_, node, accepted):
    old = models.utcnow() - timedelta(days=3)
    set_player(game, last_accessed_at=old)

    body = act(game, type_, node)

    assert body["accepted"] is accepted
    assert _last_access(db, game) > old


def test_accepted_action_is_saved_and_rejected_action_changes_nothing(game, act):
    before = act(game, "scan", "ZZZ")["state"]
    after_reject = act(game, "scan", "ZZZ")["state"]
    assert after_reject["analysisResource"] == before["analysisResource"]
    assert after_reject["elapsedSeconds"] == before["elapsedSeconds"]

    scanned = act(game, "scan", "E01")
    assert scanned["accepted"] is True
    assert scanned["state"]["analysisResource"] < before["analysisResource"]
    # 同じスキャンをもう一度送ると、保存済みの状態を見て拒否される
    again = act(game, "scan", "E01")
    assert again["accepted"] is False
    assert again["state"]["analysisResource"] == scanned["state"]["analysisResource"]


def test_reset_still_works_with_the_lock(client, game, act, set_player, db):
    act(game, "scan", "E01")
    old = models.utcnow() - timedelta(days=3)
    set_player(game, last_accessed_at=old)

    res = client.post(f"/api/games/{game}/reset")

    assert res.status_code == 200
    state = res.json()
    assert state["elapsedSeconds"] == 0
    assert all(n["data"]["status"] == "unscanned" for n in state["nodes"])
    assert _last_access(db, game) > old
