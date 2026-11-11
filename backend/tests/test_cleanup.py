from datetime import timedelta

import pytest

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


def _exists(db, game_id):
    db.expire_all()
    return db.get(models.PlayerStatus, int(game_id)) is not None


def _age(set_player, game_id, days):
    set_player(game_id, last_accessed_at=models.utcnow() - timedelta(days=days))


def test_stale_game_is_removed_with_its_data(game, act, set_player, db):
    act(game, "scan", "external-1")                      # ノード状態とログを持たせる
    _age(set_player, game, days=30)

    removed = game_logic.cleanup_stale_games(db)

    assert removed >= 1
    assert not _exists(db, game)
    assert db.query(models.NodeState).filter_by(player_id=int(game)).count() == 0
    assert db.query(models.GameLog).filter_by(player_id=int(game)).count() == 0


def test_recent_game_is_kept(game, set_player, db):
    _age(set_player, game, days=1)
    game_logic.cleanup_stale_games(db)
    assert _exists(db, game)


def test_game_just_inside_the_limit_is_kept(game, set_player, db):
    _age(set_player, game, days=6)   # STALE_GAME_DAYS(7) より新しい
    game_logic.cleanup_stale_games(db)
    assert _exists(db, game)


def test_first_game_is_never_removed(set_player, db):
    first_id = db.query(models.PlayerStatus.id).order_by(models.PlayerStatus.id).first()[0]
    _age(set_player, first_id, days=365)
    game_logic.cleanup_stale_games(db)
    assert _exists(db, first_id)     # /api/network など旧APIが使うゲーム


def test_cleanup_returns_zero_when_nothing_is_stale(db):
    game_logic.cleanup_stale_games(db)          # 先に古いものを片付けておく
    assert game_logic.cleanup_stale_games(db) == 0


def test_using_a_game_keeps_it_alive(game, client, set_player, db):
    _age(set_player, game, days=5)
    client.get(f"/api/games/{game}")             # 触ると「最終アクセス」が更新される
    db.expire_all()
    player = db.get(models.PlayerStatus, int(game))
    assert models.utcnow() - player.last_accessed_at < timedelta(minutes=1)


def test_creating_a_game_cleans_up_stale_games(client, game, set_player, db):
    _age(set_player, game, days=30)
    client.post("/api/games")                    # 新規作成のついでに掃除される
    # (SQLite は削除した末尾のIDを再利用するので、IDではなく「古い行が残っていないか」で確かめる)
    cutoff = models.utcnow() - timedelta(days=7)
    first_id = db.query(models.PlayerStatus.id).order_by(models.PlayerStatus.id).first()[0]
    db.expire_all()
    stale = db.query(models.PlayerStatus).filter(
        models.PlayerStatus.last_accessed_at < cutoff,
        models.PlayerStatus.id != first_id,
    ).count()
    assert stale == 0
