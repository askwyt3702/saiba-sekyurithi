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
from balance_config import SECURITY_RULES


@pytest.fixture
def ready_act(act, client):
    """旧来の通常攻略テスト用。侵入前の新確認操作を明示的に完了する。

    条件未達・拒否・ペナルティの試験は生のactを使う。
    """
    def perform(game_id, type_, node=None, passcode=None):
        if type_ == "breach" and node in SECURITY_RULES:
            state = client.get(f"/api/games/{game_id}").json()
            target = next((n for n in state["nodes"] if n["id"] == node), None)
            if state["status"] == "playing" and target and target["data"]["status"] == "scanned":
                events = state.get("securityEvents", {}).get(node, [])
                if "INFO_CONFIRMED" not in events:
                    assert act(game_id, "confirmInfo", node)["accepted"]
                if SECURITY_RULES[node].get("required_analysis") and "ANALYSIS_COMPLETED" not in events:
                    assert act(game_id, "completeAnalysis", node)["accepted"]
        rule = SECURITY_RULES.get(node, {})
        answers = rule.get("question_answers", {})
        question = next(iter(answers), None)
        answer = answers[question][0] if question else next(iter(rule.get("correct_exploits", [])), None)
        return act(game_id, type_, node, passcode, exploitId=answer if type_ == "breach" else None, questionId=question if type_ == "breach" else None)
    return perform


@pytest.fixture(scope="session")
def client():
    return TestClient(main.app)


@pytest.fixture
def fixed_game(client):
    """Legacy fixed graph regression; normal POST /api/games is dynamic now."""
    import game_logic
    def create(stage_id=1):
        with main.SessionLocal() as db:
            player=game_logic.create_game(db,stage_id)
            return game_logic.build_game_state(db,player)
    return create


@pytest.fixture
def game(fixed_game):
    """固定Snapshotで既存の行動ルールを回帰確認する。"""
    return fixed_game()["gameId"]


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

    def _act(game_id, type_, node=None, passcode=None, exploitMismatch=False, exploitId=None, questionId=None):
        body = {"type": type_}
        if node is not None:
            body["nodeId"] = node
        if passcode is not None:
            body["passcode"] = passcode
        if questionId is not None:
            body["questionId"] = questionId
        if exploitId is not None:
            body["exploitId"] = exploitId
        if exploitMismatch:
            body["exploitMismatch"] = True
        res = client.post(f"/api/games/{game_id}/actions", json=body)
        assert res.status_code == 200, res.text
        return res.json()

    return _act
