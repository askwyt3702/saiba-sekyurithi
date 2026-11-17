"""動的生成(Stage 4)・ハニーポット・ARGUSアクティブ反撃のバックエンドテスト。"""
from collections import deque

from balance_config import SECURITY_RULES
from random_map import generate_random_stage


def _reachable_without_honeypots(stage: dict) -> set[str]:
    honeypots = set(stage["honeypot_node_ids"])
    adj: dict[str, list[str]] = {n["id"]: [] for n in stage["nodes"]}
    for edge in stage["edges"]:
        u, v = edge["source"], edge["target"]
        if u not in honeypots and v not in honeypots:
            adj[u].append(v)
            adj[v].append(u)
    entry = next(iter(stage["entry_node_ids"]))
    visited = {entry}
    queue = deque([entry])
    while queue:
        cur = queue.popleft()
        for nxt in adj[cur]:
            if nxt not in visited:
                visited.add(nxt)
                queue.append(nxt)
    return visited


def test_random_stage_is_deterministic_and_always_solvable():
    m1 = generate_random_stage(seed="ALPHA123", hardcore=False)
    m2 = generate_random_stage(seed="ALPHA123", hardcore=False)
    m3 = generate_random_stage(seed="BETA9999", hardcore=False)
    assert m1 == m2
    assert m1["edges"] != m3["edges"] or [n["id"] for n in m1["nodes"]] != [n["id"] for n in m3["nodes"]]
    assert len(m1["nodes"]) == 14
    assert len(m1["honeypot_node_ids"]) >= 1
    reachable = _reachable_without_honeypots(m1)
    assert set(m1["target_node_ids"]).issubset(reachable)
    assert "I04" in reachable

    hc = generate_random_stage(seed="ALPHA123", hardcore=True)
    assert hc["alert_decay_per_second"] == 0.0
    assert hc["initial_state"]["alert_level"] == 5.0


def test_honeypot_flagging_and_trap_trigger_via_api(client, act):
    res = client.post("/api/games", json={"stageId": 4, "seed": "TRAPSEED1", "hardcore": False})
    assert res.status_code == 200
    state = res.json()
    gid = state["gameId"]
    assert state["stageId"] == 4
    assert state["dynamicMap"]["seed"] == "TRAPSEED1"

    # バックエンドで同シードから期待されるハニーポットを取得（APIには秘密のまま漏らさない）
    expected_map = generate_random_stage(seed="TRAPSEED1", hardcore=False)
    assert "honeypot_node_ids" not in state["dynamicMap"]
    honeypot_id = sorted(expected_map["honeypot_node_ids"])[0]

    # 入口 E01 を攻略してからリモートスキャンでハニーポットを調査
    assert act(gid, "scan", "E01")["accepted"]
    assert act(gid, "confirmInfo", "E01")["accepted"]
    assert act(gid, "completeAnalysis", "E01")["accepted"]
    q_e01 = next(iter(SECURITY_RULES["E01"]["question_answers"]))
    a_e01 = SECURITY_RULES["E01"]["question_answers"][q_e01][0]
    assert act(gid, "breach", "E01", questionId=q_e01, exploitId=a_e01)["accepted"]

    assert act(gid, "remoteScan", honeypot_id)["accepted"]
    before_flag = client.get(f"/api/games/{gid}").json()
    flagged = act(gid, "flagTrap", honeypot_id)
    assert flagged["accepted"] is True
    assert honeypot_id in flagged["state"]["dynamicMap"]["flaggedTraps"]
    assert flagged["state"]["alertLevel"] == max(0.0, before_flag["alertLevel"] - 5.0)
    # 隔離済みノードへの侵入は拒否される
    blocked = act(gid, "breach", honeypot_id, questionId=next(iter(SECURITY_RULES[honeypot_id]["question_answers"])), exploitId=SECURITY_RULES[honeypot_id]["correct_exploits"][0])
    assert blocked["accepted"] is False

    # 別ゲームで罠を踏む（DMZのハニーポットに直接侵入）
    res2 = client.post("/api/games", json={"stageId": 4, "seed": "TRAPSEED1", "hardcore": False})
    gid2 = res2.json()["gameId"]
    dmz_hp = next(n["id"] for n in expected_map["nodes"] if n["id"] in expected_map["honeypot_node_ids"] and n["layer"] == "DMZ")
    assert act(gid2, "scan", "E01")["accepted"]
    assert act(gid2, "confirmInfo", "E01")["accepted"]
    assert act(gid2, "completeAnalysis", "E01")["accepted"]
    assert act(gid2, "breach", "E01", questionId=q_e01, exploitId=a_e01)["accepted"]
    assert act(gid2, "remoteScan", dmz_hp)["accepted"]
    assert act(gid2, "confirmInfo", dmz_hp)["accepted"]
    q_hp = next(iter(SECURITY_RULES[dmz_hp]["question_answers"]))
    a_hp = SECURITY_RULES[dmz_hp]["question_answers"][q_hp][0]
    before_trap = client.get(f"/api/games/{gid2}").json()
    trapped = act(gid2, "breach", dmz_hp, questionId=q_hp, exploitId=a_hp)
    assert trapped["accepted"] is True
    assert dmz_hp in trapped["state"]["dynamicMap"]["triggeredTraps"]
    assert trapped["state"]["alertLevel"] == before_trap["alertLevel"] + 25.0
    assert trapped["state"]["analysisResource"] == before_trap["analysisResource"] - 4


def test_argus_counterattack_reinforces_and_severs_sessions(client, act, set_player):
    res = client.post("/api/games", json={"stageId": 4, "seed": "ARGUS77", "hardcore": True})
    assert res.status_code == 200
    gid = res.json()["gameId"]
    stage = generate_random_stage(seed="ARGUS77", hardcore=True)

    # E01 を突破
    assert act(gid, "scan", "E01")["accepted"]
    assert act(gid, "confirmInfo", "E01")["accepted"]
    assert act(gid, "completeAnalysis", "E01")["accepted"]
    q_e01 = next(iter(SECURITY_RULES["E01"]["question_answers"]))
    a_e01 = SECURITY_RULES["E01"]["question_answers"][q_e01][0]
    assert act(gid, "breach", "E01", questionId=q_e01, exploitId=a_e01)["accepted"]

    # 安全なDMZノードを攻略したあと、警戒度70%以上で次の侵入時にARGUS反撃が発動するか検証
    safe_dmz = next(
        e["target"] for e in stage["edges"]
        if e["source"] == "E01" and e["target"] not in stage["honeypot_node_ids"]
    )
    assert act(gid, "scan", safe_dmz)["accepted"]
    assert act(gid, "confirmInfo", safe_dmz)["accepted"]
    q_d = next(iter(SECURITY_RULES[safe_dmz]["question_answers"]))
    a_d = SECURITY_RULES[safe_dmz]["question_answers"][q_d][0]
    assert act(gid, "breach", safe_dmz, questionId=q_d, exploitId=a_d)["accepted"]

    # もう1つの安全なノードへ警戒度72%で侵入 -> 40%+強化監視 & 70%+セッション遮断が両方発生
    second_dmz = next(
        n["id"] for n in stage["nodes"]
        if n["layer"] == "DMZ" and n["id"] != safe_dmz and n["id"] not in stage["honeypot_node_ids"]
    )
    set_player(gid, alert_level=72.0, analysis_resource=25)
    assert act(gid, "remoteScan", second_dmz)["accepted"]
    assert act(gid, "confirmInfo", second_dmz)["accepted"]
    q_d2 = next(iter(SECURITY_RULES[second_dmz]["question_answers"]))
    a_d2 = SECURITY_RULES[second_dmz]["question_answers"][q_d2][0]
    after = act(gid, "breach", second_dmz, questionId=q_d2, exploitId=a_d2)
    assert after["accepted"] is True
    assert len(after["state"]["dynamicMap"]["argusReinforced"]) >= 1
    assert any("[ARGUS_SEVER:" in entry["message"] for entry in after["state"]["log"])
