"""backend/game_data.py・balance_config.py からフロント用の frontend/src/game/data/stageData.ts を生成する。

ステージやギミックを変えたら、リポジトリのルートで次を実行して stageData.ts も更新すること:
    python scripts/gen_stage_data.py
"""
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "backend"))

import balance_config  # noqa: E402
import game_data as g  # noqa: E402

OUTPUT = REPO / "frontend" / "src" / "game" / "data" / "stageData.ts"


def ts_str(value: str) -> str:
    return "'" + json.dumps(value, ensure_ascii=False)[1:-1].replace("'", "\\'") + "'"


def ts_num(value) -> str:
    return str(int(value)) if float(value).is_integer() else str(value)


def ts_id_list(ids) -> str:
    return "[" + ", ".join(ts_str(i) for i in sorted(ids)) + "]"


nodes = [
    f"  {{ id: {ts_str(n['id'])}, layer: {ts_str(n['layer'])}, name: {ts_str(n['name'])}, "
    f"position: {{ x: {ts_num(n['pos_x'])}, y: {ts_num(n['pos_y'])} }}, status: 'unscanned', "
    f"info: {ts_str(n['info'])}, vulnerability: null }},"
    for n in g.NODES
]
edges = [
    f"  {{ id: {ts_str(e['id'])}, source: {ts_str(e['source'])}, target: {ts_str(e['target'])}"
    f"{', animated: true' if e.get('animated') else ''} }},"
    for e in g.EDGES
]
vulnerabilities = [
    f"  {ts_str(n['id'])}: {ts_str(n['vulnerability'])}," for n in g.NODES if n.get("vulnerability")
]
effects = [
    f"  {ts_str(node_id)}: {{ resourceBonus: {ts_num(e.get('resource_bonus', 0))}, "
    f"alertDelta: {ts_num(e.get('alert_delta', 0.0))}, log: {ts_str(e.get('log', ''))} }},"
    for node_id, e in g.NODE_EFFECTS.items()
]

NL = "\n"
OUTPUT.write_text(
    f"""// このファイルは scripts/gen_stage_data.py で backend/game_data.py・balance_config.py から生成している。
// 手で編集せず、バックエンド側を変えたらスクリプトを実行し直すこと。
import type {{ ApiNetworkEdge, NetworkNode }} from '../model/types';

export const INITIAL_ANALYSIS_RESOURCE = {ts_num(balance_config.INITIAL_ANALYSIS_RESOURCE)};
export const MAX_ANALYSIS_RESOURCE = {ts_num(balance_config.MAX_ANALYSIS_RESOURCE)};
export const RESOURCE_RECOVERY_AMOUNT = {ts_num(balance_config.RESOURCE_RECOVERY_AMOUNT)};
export const RECOVERY_COST = {{ time: {ts_num(balance_config.ACTION_COSTS["recover"]["time"])}, alertDelta: {ts_num(balance_config.ACTION_COSTS["recover"]["alert_delta"])} }};
export const RESOURCE_REWARDS: Record<string, number> = {json.dumps(g.RESOURCE_REWARDS)};
export const ENTRY_LAYERS: string[] = {ts_id_list(g.ENTRY_LAYERS)};

export const STAGE_NODES: NetworkNode[] = [
{NL.join(nodes)}
];

export const STAGE_EDGES: ApiNetworkEdge[] = [
{NL.join(edges)}
];

// 脆弱性はスキャンするまで伏せておき、スキャン完了時に開示する。
export const STAGE_VULNERABILITIES: Record<string, string> = {{
{NL.join(vulnerabilities)}
}};

// データ回収でクリアになるノード。空のときはCore層のすべてのノードが対象。
export const TARGET_NODE_IDS: string[] = {ts_id_list(g.TARGET_NODE_IDS)};

// すべて侵入済みにしてから最終目標でデータ回収すると、回収時の警戒度上昇が0になる。
export const KEY_FRAGMENT_NODE_IDS: string[] = {ts_id_list(g.KEY_FRAGMENT_NODE_IDS)};

export interface NodeEffect {{
  resourceBonus: number;
  alertDelta: number;
  log: string;
}}

// 侵入(breach)成功時に発動する特殊効果。
export const NODE_EFFECTS: Record<string, NodeEffect> = {{
{NL.join(effects)}
}};

export function isExtractTarget(node: Pick<NetworkNode, 'id' | 'layer'>): boolean {{
  return TARGET_NODE_IDS.length === 0 ? node.layer === 'Core' : TARGET_NODE_IDS.includes(node.id);
}}
""",
    encoding="utf-8",
    newline="\n",
)
print(f"wrote {OUTPUT.relative_to(REPO)}: {len(g.NODES)} nodes, {len(g.EDGES)} edges, {len(effects)} effects")
