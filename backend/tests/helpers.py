"""テスト用の補助関数。

ステージ(game_data.py)は他の担当者が差し替えるので、テストでノードIDを直書きせず、
game_data から「入口ノード」「Coreまでの最短経路」などを計算して使う。
こうしておけば、ステージのデータを変えてもテストは壊れない。
"""
from collections import deque

from game_data import EDGES, ENTRY_LAYERS, NODES, TARGET_NODE_IDS

HIDDEN_INFO = "不明（スキャンが必要です）"

NODE_BY_ID = {n["id"]: n for n in NODES}
ENTRY = next(n["id"] for n in NODES if n["layer"] in ENTRY_LAYERS)


def node_of(state, node_id):
    """GameState から指定ノードの data 部分を取り出す。"""
    return next(n for n in state["nodes"] if n["id"] == node_id)["data"]


def neighbors(node_id):
    result = []
    for e in EDGES:
        if e["source"] == node_id:
            result.append(e["target"])
        elif e["target"] == node_id:
            result.append(e["source"])
    return result


def nodes_in_layer(layer):
    return [n["id"] for n in NODES if n["layer"] == layer]


def shortest_path_to_core():
    """入口ノードから、最終目標(TARGET_NODE_IDS があればそれ、無ければ任意のCore)までの最短経路。"""
    def is_goal(node_id: str) -> bool:
        if TARGET_NODE_IDS:
            return node_id in TARGET_NODE_IDS
        return NODE_BY_ID[node_id]["layer"] == "Core"

    queue = deque([[ENTRY]])
    seen = {ENTRY}
    while queue:
        path = queue.popleft()
        if is_goal(path[-1]):
            return path
        for nxt in neighbors(path[-1]):
            if nxt not in seen:
                seen.add(nxt)
                queue.append(path + [nxt])
    raise AssertionError("入口から目標Coreノードに到達できません（ステージのデータを確認してください）")
