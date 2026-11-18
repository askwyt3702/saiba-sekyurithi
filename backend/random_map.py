"""ステージ4（ローグライク型ランダム生成ネットワーク）の決定論的マップ生成器。"""
from copy import deepcopy
import hashlib
import secrets

import balance_config as balance
import game_data
from map_definition import GameMapDefinition


class DeterministicRng:
    """Python/TypeScript間で同じ結果を再現できるシンプルな決定論的PRNG（Mulberry32互換）。"""

    def __init__(self, seed: str):
        digest = hashlib.sha256(seed.encode("utf-8")).digest()
        self.state = int.from_bytes(digest[:4], "big") or 0x6D2B79F5

    def next_uint32(self) -> int:
        self.state = (self.state + 0x6D2B79F5) & 0xFFFFFFFF
        t = self.state
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t = (t ^ (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF))) & 0xFFFFFFFF
        return (t ^ (t >> 14)) & 0xFFFFFFFF

    def rand(self) -> float:
        return self.next_uint32() / 0x100000000

    def randint(self, low: int, high: int) -> int:
        return low + (self.next_uint32() % (high - low + 1))

    def shuffle(self, items: list) -> list:
        arr = list(items)
        for i in range(len(arr) - 1, 0, -1):
            j = self.next_uint32() % (i + 1)
            arr[i], arr[j] = arr[j], arr[i]
        return arr


HONEYPOT_CLUES = [
    "【資源補給候補？】解析資源 +12 が無防備に露出しているように見えるが、SSHバナーの応答遅延が 0.01ms で全ポートにダミーのテスト鍵が置かれている（不自然な挙動）。",
    "【最短迂回路？】管理画面が認証なしで開いているように見えるが、証明書の組織名が「ARGUS-DECOY-LAB」かつシステム時刻が2099年に固定されている。",
    "【極秘キャッシュ？】巨大な機密ファイルが見えるが、ログ出力先が /dev/null ではなく監視AIの即時通報ポート 31337 に直結している形跡がある。",
]


def _layer_y(layer: str) -> float:
    return {"External": 100.0, "DMZ": 520.0, "Internal": 1050.0, "Core": 1620.0}[layer]


def generate_random_stage(seed: str | None = None, hardcore: bool = False) -> GameMapDefinition:
    """シードとハードコア設定に基づき、必ずクリア可能でハニーポットを含む動的マップを生成する。"""
    actual_seed = seed.strip() if seed and seed.strip() else secrets.token_hex(4).upper()
    rng = DeterministicRng(f"{actual_seed}:{'hc' if hardcore else 'std'}")

    base_nodes = {n["id"]: deepcopy(n) for n in game_data.NODES}

    # 1. 各層からノードを選出（14ノード構成：E=1, DMZ=4, I=6, C=3）
    entry_id = "E01"
    target_id = "C03"

    dmz_pool = rng.shuffle(["D01", "D02", "D03", "D04", "D05", "D06", "D07"])[:4]
    # Internal は監視解除役 I04 と補助ノードを含めて6つ
    internal_candidates = [nid for nid in ["I01", "I02", "I03", "I05", "I06", "I07", "I08", "I09", "I10"]]
    internal_pool = ["I04"] + rng.shuffle(internal_candidates)[:5]
    internal_pool = rng.shuffle(internal_pool)

    core_others = rng.shuffle(["C01", "C02", "C04"])[:2]
    core_pool = rng.shuffle([target_id] + core_others)

    selected_ids = [entry_id] + dmz_pool + internal_pool + core_pool

    # 2. レイヤーごとの綺麗な座標割り当て
    nodes: list[dict] = []
    for layer, ids in [("External", [entry_id]), ("DMZ", dmz_pool), ("Internal", internal_pool), ("Core", core_pool)]:
        y_base = _layer_y(layer)
        count = len(ids)
        spacing = 280 if count <= 4 else 230
        start_x = 640.0 - ((count - 1) * spacing) / 2.0
        for idx, nid in enumerate(ids):
            src = base_nodes[nid]
            y_jitter = (idx % 2) * 70.0 - 25.0 if count > 2 else 0.0
            nodes.append({
                "id": nid,
                "name": src["name"],
                "layer": layer,
                "pos_x": round(start_x + idx * spacing, 1),
                "pos_y": round(y_base + y_jitter, 1),
                "info": src["info"],
                "vulnerability": src["vulnerability"],
            })

    # 3. 到達可能性を保証する接続辺（DAG基幹 + 横断・分岐）
    edges: list[dict] = []
    edge_pairs: set[tuple[str, str]] = set()

    def add_edge(u: str, v: str) -> None:
        if u == v:
            return
        pair = (min(u, v), max(u, v))
        if pair in edge_pairs:
            return
        edge_pairs.add(pair)
        edges.append({"id": f"rnd-e{len(edges) + 1}", "source": u, "target": v})

    # External -> DMZ (2〜3本接続)
    for d in dmz_pool[:3]:
        add_edge(entry_id, d)
    if len(dmz_pool) >= 4:
        add_edge(dmz_pool[1], dmz_pool[3])

    # DMZ -> Internal（各InternalノードがいずれかのDMZから到達可能にする）
    for idx, i_id in enumerate(internal_pool):
        parent_dmz = dmz_pool[idx % len(dmz_pool)]
        add_edge(parent_dmz, i_id)
        if rng.rand() < 0.45:
            other_dmz = dmz_pool[(idx + 1) % len(dmz_pool)]
            add_edge(other_dmz, i_id)

    # Internal 内の横接続（回遊性）
    for idx in range(len(internal_pool) - 1):
        if rng.rand() < 0.55:
            add_edge(internal_pool[idx], internal_pool[idx + 1])

    # 4. ハニーポット（罠ノード）を1〜2個配置（入口・監視解除I04・最終目標C03・最後の橋渡し以外）
    # 必ず安全ルートが残るように、DMZ後半1個とInternal後半1個（ただしI04以外）から選ぶ
    honeypot_candidates = [dmz_pool[2]] + [nid for nid in internal_pool[-2:] if nid != "I04"]
    honeypot_count = 2 if len(honeypot_candidates) >= 2 else 1
    honeypot_ids = set(honeypot_candidates[:honeypot_count])

    # Core 接続（ハニーポットでないInternalノードから必ずCoreへ到達可能にする）
    safe_internals = [nid for nid in internal_pool if nid not in honeypot_ids]
    for idx, c_id in enumerate(core_pool):
        parent_i = safe_internals[idx % len(safe_internals)]
        add_edge(parent_i, c_id)
        if len(safe_internals) > 1 and rng.rand() < 0.5:
            add_edge(safe_internals[(idx + 1) % len(safe_internals)], c_id)
    # 最後のハニーポットが孤立しないようダミーの誘惑エッジをCoreに向ける（正規ルートは既に確保済み）
    for hp in honeypot_ids:
        add_edge(hp, target_id)

    # 5. 鍵断片（2つ）・効果・監視・ハニーポット情報を設定
    key_candidates = [nid for nid in safe_internals if nid != "I04"]
    key_fragment_ids = set(key_candidates[:2]) if len(key_candidates) >= 2 else set()

    node_effects: dict[str, dict] = {}
    for nid in safe_internals:
        if nid in key_fragment_ids:
            node_effects[nid] = {
                "resource_bonus": 0,
                "alert_delta": 0.0,
                "log": f"{nid} から暗号鍵の断片を回収しました。",
            }
        elif nid == "I04":
            node_effects[nid] = {
                "resource_bonus": 0,
                "alert_delta": -15.0,
                "log": "ARGUS監視制御を一時停止！追加警戒度およびAI反撃を抑止しました（警戒度 -15%）。",
            }

    # DMZの安全ノード1つに資源補給ボーナスを配置
    safe_dmz = [nid for nid in dmz_pool if nid not in honeypot_ids]
    if safe_dmz:
        supply_node = safe_dmz[0]
        node_effects[supply_node] = {
            "resource_bonus": 5,
            "alert_delta": 0.0,
            "log": f"{supply_node} の隠しキャッシュから解析資源 +5 を確保しました。",
        }

    # ハニーポットに「美味しそうな偽装＋技術的矛盾のヒント」を埋め込む
    for idx, node in enumerate(nodes):
        if node["id"] in honeypot_ids:
            clue = HONEYPOT_CLUES[idx % len(HONEYPOT_CLUES)]
            node["info"] = clue

    # 監視対象ノード（I04攻略まで+10%追加警戒度）
    monitored_targets = [nid for nid in (safe_internals[:2] + [target_id]) if nid != "I04"]
    monitoring = {
        "disabled_by_node_id": "I04",
        "target_node_ids": monitored_targets,
        "alert_delta": 12 if hardcore else 10,  # 整数にする(小数だとログが「+12.0%」になり Mock とずれる)
    }

    # ゲート制限（Coreの非目標1つにI04前提を付けるか、またはC03以外にロックを置く）
    breach_requirements: dict[str, list[str]] = {}
    non_target_core = [c for c in core_pool if c != target_id]
    if non_target_core:
        breach_requirements[non_target_core[0]] = ["I04"]

    # セキュリティルール（既存の全問ルールを流用）
    security_rules = {
        nid: deepcopy(balance.SECURITY_RULES[nid])
        for nid in selected_ids
        if nid in balance.SECURITY_RULES
    }
    if hardcore:
        for rule in security_rules.values():
            rule["exploit_failure_alert"] = float(rule.get("exploit_failure_alert", 8.0)) + 4.0
            rule["failure_resource"] = max(1, int(rule.get("failure_resource", 0)))

    return {
        "id": 4,
        "seed": actual_seed,
        "hardcore": hardcore,
        "generator_version": "rogue-v1",
        "rules_version": "rogue-turn-v1",
        "nodes": nodes,
        "edges": edges,
        "entry_node_ids": {entry_id},
        "target_node_ids": {target_id},
        "key_fragment_node_ids": key_fragment_ids,
        "important_node_ids": key_fragment_ids | {"I04"},
        "honeypot_node_ids": honeypot_ids,
        "enable_argus_counterattack": True,
        "node_effects": node_effects,
        "conditional_breach_alert": monitoring,
        "breach_requirements": breach_requirements,
        "initial_state": {
            "game_time": 0,
            "alert_level": 5.0 if hardcore else 0.0,
            "analysis_resource": 22 if hardcore else balance.INITIAL_ANALYSIS_RESOURCE,
            "current_privilege": balance.INITIAL_PRIVILEGE,
            "game_status": "playing",
        },
        "action_costs": deepcopy(balance.ACTION_COSTS),
        "alert_decay_per_second": 0.0 if hardcore else balance.ALERT_DECAY_PER_SECOND,
        "max_analysis_resource": balance.MAX_ANALYSIS_RESOURCE,
        "resource_recovery_amount": 4 if hardcore else balance.RESOURCE_RECOVERY_AMOUNT,
        "alert_game_over_threshold": balance.ALERT_GAME_OVER_THRESHOLD,
        "privilege_ladder": list(balance.PRIVILEGE_LADDER),
        "layer_order": list(balance.LAYER_ORDER),
        "evaluation_config": deepcopy(balance.EVALUATION_CONFIG),
        "resource_rewards": {},
        "security_rules": security_rules,
    }
