import pytest

from balance_config import ACTION_COSTS, INITIAL_ANALYSIS_RESOURCE
from game_data import EDGES, NODES
from helpers import (
    ENTRY,
    HIDDEN_INFO,
    neighbors,
    node_of,
    nodes_in_layer,
    shortest_path_to_core,
)

SCAN_COST = ACTION_COSTS["scan"]
BREACH_COST = ACTION_COSTS["breach"]


def clear_stage(act, game, set_player):
    """入口から最短経路でCoreを攻略する（最後のdataExtractは含まない）。経路を返す。"""
    set_player(game, analysis_resource=1000)   # 資源の量ではなくルールのほうを試したいので十分に与える
    path = shortest_path_to_core()
    for node in path:
       assert act(game, "scan", node)["accepted"] is True, ("scan", node)

    if node == "E01":
        assert act(game, "confirmInfo", node)["accepted"] is True
        assert act(game, "completeAnalysis", node)["accepted"] is True

    assert act(game, "breach", node)["accepted"] is True, ("breach", node)



# ---------- ゲームの作成・取得・リセット ----------

def test_create_game_initial_state(client):
    state = client.post("/api/games").json()
    assert state["status"] == "playing"
    assert state["elapsedSeconds"] == 0
    assert state["alertLevel"] == 0
    assert state["analysisResource"] == INITIAL_ANALYSIS_RESOURCE
    assert state["privilege"] == "GUEST"
    assert [n["id"] for n in state["nodes"]] == [n["id"] for n in NODES]
    assert len(state["edges"]) == len(EDGES)
    assert len(state["log"]) == 1
    assert all(n["data"]["status"] == "unscanned" for n in state["nodes"])


def test_unscanned_node_hides_info_and_vulnerability(game, client):
    state = client.get(f"/api/games/{game}").json()
    for node in state["nodes"]:
        assert node["data"]["vulnerability"] is None
        assert node["data"]["info"] == HIDDEN_INFO


def test_each_game_is_independent(client, act):
    a = client.post("/api/games").json()["gameId"]
    b = client.post("/api/games").json()["gameId"]
    assert a != b
    act(a, "scan", ENTRY)
    state_b = client.get(f"/api/games/{b}").json()
    assert node_of(state_b, ENTRY)["status"] == "unscanned"
    assert state_b["analysisResource"] == INITIAL_ANALYSIS_RESOURCE


def test_get_unknown_game_returns_404(client):
    assert client.get("/api/games/999999").status_code == 404


def test_reset_restores_initial_state(game, client, act):
    act(game, "scan", ENTRY)
    act(game, "breach", ENTRY)
    state = client.post(f"/api/games/{game}/reset").json()
    assert state["gameId"] == game
    assert state["status"] == "playing"
    assert state["elapsedSeconds"] == 0
    assert state["alertLevel"] == 0
    assert state["analysisResource"] == INITIAL_ANALYSIS_RESOURCE
    assert state["privilege"] == "GUEST"
    assert all(n["data"]["status"] == "unscanned" for n in state["nodes"])
    assert len(state["log"]) == 1


def test_reset_after_game_over_makes_game_playable_again(game, client, act, set_player):
    set_player(game, alert_level=99.0)
    assert act(game, "scan", ENTRY)["state"]["status"] == "lost"
    client.post(f"/api/games/{game}/reset")
    assert act(game, "scan", ENTRY)["accepted"] is True


def test_reset_unknown_game_returns_404(client):
    assert client.post("/api/games/999999/reset").status_code == 404


# ---------- scan ----------

def test_scan_reveals_node_and_spends_resource_and_time(game, act):
    result = act(game, "scan", ENTRY)
    assert result["accepted"] is True
    state = result["state"]
    data = node_of(state, ENTRY)
    assert data["status"] == "scanned"
    assert data["vulnerability"]
    assert data["info"] != HIDDEN_INFO
    assert state["analysisResource"] == INITIAL_ANALYSIS_RESOURCE - SCAN_COST["resource"]
    assert state["elapsedSeconds"] == SCAN_COST["time"]
    assert 0 < state["alertLevel"] < SCAN_COST["alert_delta"]   # 加算ぶんから自然減衰を引いた値
    assert any("スキャン" in entry["message"] for entry in state["log"])


def test_scan_same_node_twice_is_rejected(game, act):
    act(game, "scan", ENTRY)
    result = act(game, "scan", ENTRY)
    assert result["accepted"] is False
    assert result["reason"] == "invalid_state"
    # 却下されたら資源は減らない
    assert result["state"]["analysisResource"] == INITIAL_ANALYSIS_RESOURCE - SCAN_COST["resource"]


def test_scan_unknown_node_is_rejected(game, act):
    result = act(game, "scan", "no-such-node")
    assert result["accepted"] is False
    assert result["reason"] == "invalid_state"


def test_scan_without_node_is_rejected(game, act):
    result = act(game, "scan")
    assert result["accepted"] is False
    assert result["reason"] == "invalid_state"


def test_scan_with_insufficient_resource_is_rejected(game, act, set_player):
    set_player(game, analysis_resource=0)
    result = act(game, "scan", ENTRY)
    assert result["accepted"] is False
    assert result["reason"] == "insufficient_resource"


# ---------- breach ----------

def test_breach_requires_scan(game, act):
    result = act(game, "breach", ENTRY)
    assert result["accepted"] is False
    assert result["reason"] == "node_not_scanned"


def test_breach_promotes_privilege(game, act):
    act(game, "scan", ENTRY)
    result = act(game, "breach", ENTRY)
    assert result["accepted"] is True
    assert node_of(result["state"], ENTRY)["status"] == "hacked"
    assert result["state"]["privilege"] == "USER"
    assert result["state"]["analysisResource"] == (
        INITIAL_ANALYSIS_RESOURCE - SCAN_COST["resource"] - BREACH_COST["resource"]
    )


def test_breach_hacked_node_again_is_rejected(game, act):
    act(game, "scan", ENTRY)
    act(game, "breach", ENTRY)
    result = act(game, "breach", ENTRY)
    assert result["accepted"] is False
    assert result["reason"] == "invalid_state"


def test_breach_unreachable_node_is_rejected(game, act, set_player):
    # 入口以外のノードは、スキャンしただけでは侵入できない（隣接ノードを侵入済みにする必要がある）
    set_player(game, analysis_resource=1000)
    core = nodes_in_layer("Core")[0]
    act(game, "scan", core)
    result = act(game, "breach", core)
    assert result["accepted"] is False
    assert result["reason"] == "node_unreachable"


def test_breach_without_required_privilege_is_rejected(game, act, set_player):
    dmz_neighbors = [n for n in neighbors(ENTRY) if n in nodes_in_layer("DMZ")]
    assert dmz_neighbors, "入口に隣接するDMZノードがありません（このテストの前提）"
    target = dmz_neighbors[0]

    act(game, "scan", ENTRY)
    act(game, "breach", ENTRY)                   # USER に昇格
    act(game, "scan", target)
    set_player(game, current_privilege="GUEST")  # DMZ は USER 以上が必要
    result = act(game, "breach", target)
    assert result["accepted"] is False
    assert result["reason"] == "insufficient_privilege"


def test_privilege_never_goes_down(game, act, set_player):
    dmz_neighbors = [n for n in neighbors(ENTRY) if n in nodes_in_layer("DMZ")]
    if len(dmz_neighbors) < 2:
        pytest.skip("入口に隣接するDMZノードが2つ未満")
    set_player(game, analysis_resource=1000)
    privileges = []
    for node in [ENTRY, *dmz_neighbors[:2]]:
        act(game, "scan", node)
        privileges.append(act(game, "breach", node)["state"]["privilege"])
    # 入口 → USER、1つ目のDMZ → ADMIN、2つ目のDMZ でも ADMIN のまま（USER に戻らない）
    assert privileges == ["USER", "ADMIN", "ADMIN"]


# ---------- dataExtract ----------

def test_data_extract_requires_hacked_core(game, act, set_player):
    set_player(game, analysis_resource=1000)
    core = nodes_in_layer("Core")[0]

    result = act(game, "dataExtract", core)          # まだ侵入していない
    assert result["accepted"] is False
    assert result["reason"] == "invalid_state"

    result = act(game, "dataExtract", ENTRY)         # Core 以外は不可
    assert result["accepted"] is False
    assert result["reason"] == "invalid_state"


def test_full_playthrough_wins(game, act, set_player):
    path = clear_stage(act, game, set_player)
    result = act(game, "dataExtract", path[-1])
    assert result["accepted"] is True
    state = result["state"]
    assert state["status"] == "won"
    assert state["privilege"] == "ROOT"
    assert state["alertLevel"] < 100


def test_default_resource_is_enough_to_clear_the_stage(game, act):
    """初期の解析資源だけで、最短経路ならクリアできること（バランスの最低ライン）。"""
    path = shortest_path_to_core()
    for node in path:
        assert act(game, "scan", node)["accepted"] is True, ("scan", node)
        assert act(game, "breach", node)["accepted"] is True, ("breach", node)
    result = act(game, "dataExtract", path[-1])
    assert result["accepted"] is True, result.get("reason")
    assert result["state"]["status"] == "won"


def test_actions_are_rejected_after_winning(game, act, set_player):
    path = clear_stage(act, game, set_player)
    act(game, "dataExtract", path[-1])
    other = next(n["id"] for n in NODES if n["id"] not in path)
    result = act(game, "scan", other)
    assert result["accepted"] is False
    assert result["reason"] == "invalid_state"


# ---------- 警戒度・ゲームオーバー ----------

def test_alert_reaching_100_loses_the_game(game, act, set_player):
    set_player(game, alert_level=99.0)
    result = act(game, "scan", ENTRY)
    assert result["accepted"] is True            # この操作自体は受理され、その結果で敗北する
    state = result["state"]
    assert state["status"] == "lost"
    assert state["alertLevel"] == 100
    assert any("警戒度が限界" in entry["message"] for entry in state["log"])


def test_actions_are_rejected_after_losing(game, act, set_player):
    set_player(game, alert_level=99.0)
    act(game, "scan", ENTRY)
    result = act(game, "breach", ENTRY)
    assert result["accepted"] is False
    assert result["reason"] == "invalid_state"


def test_alert_warning_is_logged_when_high(game, act, set_player):
    set_player(game, alert_level=75.0)
    state = act(game, "scan", ENTRY)["state"]
    assert state["status"] == "playing"
    assert any("警戒度が" in entry["message"] and "上昇" in entry["message"] for entry in state["log"])


# ---------- pause / resume ----------

def test_pause_and_resume(game, act):
    paused = act(game, "pause")
    assert paused["accepted"] is True
    assert paused["state"]["status"] == "paused"

    # 一時停止中は他のアクションができない
    blocked = act(game, "scan", ENTRY)
    assert blocked["accepted"] is False
    assert blocked["reason"] == "invalid_state"

    resumed = act(game, "resume")
    assert resumed["accepted"] is True
    assert resumed["state"]["status"] == "playing"


def test_pause_and_resume_in_wrong_state_are_rejected(game, act):
    assert act(game, "resume")["accepted"] is False   # playing 中の resume
    act(game, "pause")
    assert act(game, "pause")["accepted"] is False    # paused 中の pause


# ---------- リクエストの検証・旧API ----------

def test_unknown_action_type_is_a_validation_error(game, client):
    res = client.post(f"/api/games/{game}/actions", json={"type": "hack-everything"})
    assert res.status_code == 422


def test_action_on_unknown_game_returns_404(client):
    res = client.post("/api/games/999999/actions", json={"type": "pause"})
    assert res.status_code == 404


def test_legacy_network_endpoint_returns_nodes_and_edges(client):
    body = client.get("/api/network").json()
    assert len(body["nodes"]) == len(NODES)
    assert len(body["edges"]) == len(EDGES)


def test_legacy_scan_endpoint_rejects_unknown_node(client):
    assert client.post("/api/scan", json={"node_id": "no-such-node"}).json() == {"error": "invalid_state"}
