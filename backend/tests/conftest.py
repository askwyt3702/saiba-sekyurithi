"""テスト共通設定。

テストは外部のPostgreSQLに依存させず、使い捨てのSQLiteファイルで動かす
(database.py は import 時に DATABASE_URL を読むので、main を import する前に差し替える)。
"""
import os
import sys
import tempfile
from pathlib import Path

_tmp_dir = tempfile.mkdtemp(prefix="nullroute-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_tmp_dir, 'test.db').as_posix()}"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402


@pytest.fixture(scope="session")
def client():
    return TestClient(main.app)
