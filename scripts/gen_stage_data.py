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
NL = "\n"


def ts_str(value: str) -> str:
    return "'" + json.dumps(value, ensure_ascii=False)[1:-1].replace("'", "\\'") + "'"


def ts_num(value) -> str:
    return str(int(value)) if float(value).is_integer() else str(value)


def ts_id_list(ids) -> str:
    return "[" + ", ".join(ts_str(i) for i in sorted(ids)) + "]"


def format_nodes(node_list, indent="  ") -> str:
    return NL.join(
        f"{indent}{{ id: {ts_str(n['id'])}, layer: {ts_str(n['layer'])}, name: {ts_str(n['name'])}, "
        f"position: {{ x: {ts_num(n['pos_x'])}, y: {ts_num(n['pos_y'])} }}, status: 'unscanned', "
        f"info: {ts_str(n['info'])}, vulnerability: null }},"
        for n in node_list
    )


def format_edges(edge_list, indent="  ") -> str:
    return NL.join(
        f"{indent}{{ id: {ts_str(e['id'])}, source: {ts_str(e['source'])}, target: {ts_str(e['target'])}"
        f"{', animated: true' if e.get('animated') else ''} }},"
        for e in edge_list
    )


def format_vulnerabilities(node_list, indent="  ") -> str:
    return NL.join(
        f"{indent}{ts_str(n['id'])}: {ts_str(n['vulnerability'])},"
        for n in node_list
        if n.get("vulnerability")
    )


def format_effects(effect_map, indent="  ") -> str:
    return NL.join(
        f"{indent}{ts_str(node_id)}: {{ resourceBonus: {ts_num(e.get('resource_bonus', 0))}, "
        f"alertDelta: {ts_num(e.get('alert_delta', 0.0))}, log: {ts_str(e.get('log', ''))} }},"
        for node_id, e in effect_map.items()
    )


def format_stage_entry(stage_id: int, stage: dict) -> str:
    nodes_ts = format_nodes(stage["nodes"], indent="      ")
    edges_ts = format_edges(stage["edges"], indent="      ")
    vuln_ts = format_vulnerabilities(stage["nodes"], indent="      ")
    eff_ts = format_effects(stage.get("node_effects", {}), indent="      ")
    nodes_block = f"[\n{nodes_ts}\n    ]" if nodes_ts else "[]"
    edges_block = f"[\n{edges_ts}\n    ]" if edges_ts else "[]"
    vuln_block = f"{{\n{vuln_ts}\n    }}" if vuln_ts else "{}"
    eff_block = f"{{\n{eff_ts}\n    }}" if eff_ts else "{}"
    return (
        f"  {stage_id}: {{\n"
        f"    id: {stage['id']},\n"
        f"    name: {ts_str(stage['name'])},\n"
        f"    difficulty: {ts_str(stage['difficulty'])},\n"
        f"    nodes: {nodes_block},\n"
        f"    edges: {edges_block},\n"
        f"    vulnerabilities: {vuln_block},\n"
        f"    entryLayers: {ts_id_list(stage.get('entry_layers', {'External'}))},\n"
        f"    targetNodeIds: {ts_id_list(stage.get('target_node_ids', set()))},\n"
        f"    keyFragmentNodeIds: {ts_id_list(stage.get('key_fragment_node_ids', set()))},\n"
        f"    nodeEffects: {eff_block},\n"
        f"  }},"
    )


nodes = format_nodes(g.NODES)
edges = format_edges(g.EDGES)
vulnerabilities = format_vulnerabilities(g.NODES)
effects = format_effects(g.NODE_EFFECTS)
stages_ts = NL.join(format_stage_entry(sid, s) for sid, s in sorted(g.STAGES.items()))
all_target_ids = sorted({tid for s in g.STAGES.values() for tid in s.get("target_node_ids", set())})

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
export const DEFAULT_STAGE_ID = {ts_num(g.DEFAULT_STAGE_ID)};

export const STAGE_NODES: NetworkNode[] = [
{nodes}
];

export const STAGE_EDGES: ApiNetworkEdge[] = [
{edges}
];

// 脆弱性はスキャンするまで伏せておき、スキャン完了時に開示する。
export const STAGE_VULNERABILITIES: Record<string, string> = {{
{vulnerabilities}
}};

// データ回収でクリアになるノード。空のときはCore層のすべてのノードが対象。
export const TARGET_NODE_IDS: string[] = {ts_id_list(g.TARGET_NODE_IDS)};
export const ALL_TARGET_NODE_IDS: string[] = {ts_id_list(all_target_ids)};

// すべて侵入済みにしてから最終目標でデータ回収すると、回収時の警戒度上昇が0になる。
export const KEY_FRAGMENT_NODE_IDS: string[] = {ts_id_list(g.KEY_FRAGMENT_NODE_IDS)};

export interface NodeEffect {{
  resourceBonus: number;
  alertDelta: number;
  log: string;
}}

// 侵入(breach)成功時に発動する特殊効果。
export const NODE_EFFECTS: Record<string, NodeEffect> = {{
{effects}
}};

export interface StageDefinition {{
  id: number;
  name: string;
  difficulty: string;
  nodes: NetworkNode[];
  edges: ApiNetworkEdge[];
  vulnerabilities: Record<string, string>;
  entryLayers: string[];
  targetNodeIds: string[];
  keyFragmentNodeIds: string[];
  nodeEffects: Record<string, NodeEffect>;
}}

export const STAGES: Record<number, StageDefinition> = {{
{stages_ts}
}};

export function getStageData(stageId: number = DEFAULT_STAGE_ID): StageDefinition {{
  return STAGES[stageId] ?? STAGES[DEFAULT_STAGE_ID];
}}

export function isExtractTarget(node: Pick<NetworkNode, 'id' | 'layer'>, stageId?: number): boolean {{
  if (stageId !== undefined) {{
    const stageTargets = getStageData(stageId).targetNodeIds;
    return stageTargets.length === 0 ? node.layer === 'Core' : stageTargets.includes(node.id);
  }}
  return ALL_TARGET_NODE_IDS.length === 0 ? node.layer === 'Core' : ALL_TARGET_NODE_IDS.includes(node.id);
}}
""",
    encoding="utf-8",
    newline="\n",
)
print(
    f"wrote {OUTPUT.relative_to(REPO)}: {len(g.STAGES)} stages, "
    f"{len(g.ALL_STAGE_NODES)} total nodes"
)
