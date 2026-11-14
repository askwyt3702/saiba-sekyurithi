"""Stage1 prototype constraints. Version whenever generation/acceptance changes."""
from dataclasses import asdict, dataclass

GENERATOR_VERSION = "stage1-sha256-v1"
VALIDATOR_VERSION = "stage1-witness-v1"

# Display-only overlays; stored generator definitions and their hashes stay intact.
DYNAMIC_NODE_INFO = {
    "D01": "公開Webサービス。接続先は現在のマップを確認してください。",
    "D03": "VPNの接続点。接続先は現在のマップを確認してください。",
    "D07": "管理情報を確認できるサーバー。接続先は現在のマップを確認してください。",
    "I04": "初回侵入で警戒度-20%。接続先は現在のマップを確認してください。効果は一度だけ。",
}
DYNAMIC_TEXT_REPLACEMENTS = {
    "DMZ層の Web(D01)・Mail(D02) の内部通信経路を特定しました。": "接続先は現在のマップで確認してください。",
}


@dataclass(frozen=True)
class GenerationConfig:
    max_attempts: int = 16
    min_edges: int = 34
    max_edges: int = 40
    min_degree: int = 2
    max_degree: int = 5
    max_paths: int = 1024
    max_search_states: int = 10000
    max_route_nodes: int = 10
    fast_min_seconds: int = 225
    fast_max_seconds: int = 255
    fast_min_alert: float = 40.0
    fast_max_alert: float = 65.0
    fast_max_resource: int = 6
    detour_min_seconds: int = 30
    detour_max_seconds: int = 90
    stealth_alert_advantage: float = 15.0
    resource_advantage: int = 5

    def as_dict(self):
        return asdict(self)


DEFAULT_CONFIG = GenerationConfig()
