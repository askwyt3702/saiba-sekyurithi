"""プレイヤー登録とカード基地の保存 API(docs/api-contract.md)のテスト。"""


def full_profile(**overrides):
    profile = {
        "seenCardIds": ["ssh_brute", "firewall", "zero_day"],
        "unlockedBranches": ["ssh_rapid"],
        "seenEnemyIds": ["scanner_bot", "argus"],
        "wrongQuestionIds": ["q-1", "q-2"],
        "bonusStartCoins": 2,
        "stats": {
            "runsPlayed": 3,
            "runsWon": 1,
            "elitesDefeated": 1,
            "maxEventStreak": 2,
            "totalQuizCorrect": 7,
            "reviewsCleared": 1,
        },
        "achievements": ["first_clear"],
    }
    profile.update(overrides)
    return profile


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_create_player_without_profile_starts_empty(client):
    res = client.post("/api/players", json={"name": "  高橋  "})
    assert res.status_code == 201
    body = res.json()
    assert body["name"] == "高橋", "前後の空白は取り除く"
    assert len(body["playerId"]) == 36
    assert body["profile"]["seenCardIds"] == []
    assert body["profile"]["bonusStartCoins"] == 0
    assert body["profile"]["stats"]["runsPlayed"] == 0
    assert body["profile"]["achievements"] == []


def test_create_player_keeps_progress_from_browser(client):
    body = client.post("/api/players", json={"name": "suge", "profile": full_profile()}).json()
    again = client.get(f"/api/players/{body['playerId']}").json()
    assert again == body
    assert again["profile"]["stats"]["totalQuizCorrect"] == 7
    assert again["profile"]["unlockedBranches"] == ["ssh_rapid"]


def test_player_ids_are_unique(client):
    a = client.post("/api/players", json={"name": "a"}).json()["playerId"]
    b = client.post("/api/players", json={"name": "a"}).json()["playerId"]
    assert a != b, "同じ名前でも別のプレイヤーになる"


def test_save_profile_replaces_everything(client):
    player_id = client.post("/api/players", json={"name": "yuma", "profile": full_profile()}).json()["playerId"]
    # 弱点ノートの復習で問題が外れ、開始コインを使った後の状態を送る
    updated = full_profile(wrongQuestionIds=["q-2"], bonusStartCoins=0)
    res = client.put(f"/api/players/{player_id}/profile", json={"profile": updated})
    assert res.status_code == 200
    assert res.json()["profile"]["wrongQuestionIds"] == ["q-2"]
    assert res.json()["profile"]["bonusStartCoins"] == 0
    assert client.get(f"/api/players/{player_id}").json()["profile"] == res.json()["profile"]


def test_duplicate_ids_are_merged(client):
    player_id = client.post("/api/players", json={"name": "dup"}).json()["playerId"]
    res = client.put(
        f"/api/players/{player_id}/profile",
        json={"profile": full_profile(seenCardIds=["firewall", "firewall", "ddos"])},
    )
    assert res.json()["profile"]["seenCardIds"] == ["firewall", "ddos"]


def test_unknown_player_is_404(client):
    assert client.get("/api/players/no-such-player").status_code == 404
    res = client.put("/api/players/no-such-player/profile", json={"profile": full_profile()})
    assert res.status_code == 404
    assert res.json()["detail"] == "player_not_found"


def test_invalid_names_are_rejected(client):
    assert client.post("/api/players", json={"name": "   "}).status_code == 422
    assert client.post("/api/players", json={"name": "あ" * 21}).status_code == 422
    assert client.post("/api/players", json={"name": "あ" * 20}).status_code == 201


def test_invalid_profiles_are_rejected(client):
    player_id = client.post("/api/players", json={"name": "check"}).json()["playerId"]
    url = f"/api/players/{player_id}/profile"
    bad_profiles = [
        full_profile(bonusStartCoins=4),  # 開始コインは最大3
        full_profile(stats={**full_profile()["stats"], "runsWon": -1}),  # 戦績はマイナスにならない
        full_profile(seenCardIds=["x" * 65]),  # ID が長すぎる
        full_profile(seenCardIds=[""]),  # 空の ID
        full_profile(seenCardIds=[f"c{i}" for i in range(501)]),  # 多すぎる
        {**full_profile(), "unknownField": 1},  # 知らない項目
    ]
    for bad in bad_profiles:
        assert client.put(url, json={"profile": bad}).status_code == 422, bad
    # 失敗しても保存済みの内容は変わらない
    assert client.get(f"/api/players/{player_id}").json()["profile"]["seenCardIds"] == []
