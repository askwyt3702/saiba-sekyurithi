// パッシブ装備(常駐ツール / レリック)。イベント3問正解や報酬で獲得し、戦闘中ずっと自動で発動する。
import type { RelicDefinition, RelicId } from './types';

export const ADAPTIVE_FILTER_FW = 3;
export const FORENSICS_LAB_XP = 1;
export const THERMAL_CORE_BURN = 2;
export const THORN_DAEMON_RETALIATE = 4;
export const SIPHON_MODULE_HEAL = 6;
export const ECHO_REPAIR_RATIO = .16;
export const ECHO_HP_COST = 8;
export const ECHO_OVERCLOCK_HP = 4;

export const RELIC_DEFINITIONS: Record<RelicId, RelicDefinition> = {
  echo_bandwidth: { id: 'echo_bandwidth', name: '帯域拡張コア', icon: 'bus', description: '最大帯域+1。初回ドロー−1。' },
  echo_repair: { id: 'echo_repair', name: '自動修復モジュール', icon: 'siphon', description: '戦闘勝利時に最大HPの16%を追加回復。獲得時に最大HP−8。' },
  echo_analysis: { id: 'echo_analysis', name: '深層解析エンジン', icon: 'forensics', description: '毎ターン最初のカード−1EN。初手にノイズ1枚が入る。' },
  echo_overclock: { id: 'echo_overclock', name: 'オーバークロック装置', icon: 'energy', description: '戦闘の初ターンの帯域+2。初ターン終了時にHP−4（最低1）。' },
  echo_compression: { id: 'echo_compression', name: 'データ圧縮装置', icon: 'cache', description: '毎ターンドロー+2。最大帯域−1。' },
  echo_defense: { id: 'echo_defense', name: '防衛同期システム', icon: 'filter', description: '毎ターン開始時にFW+6。戦闘ごとのコイン獲得−1（最低0）。' },
  encrypted_vpn: {
    id: 'encrypted_vpn',
    name: '暗号化VPN',
    icon: 'vpn',
    description: '毎ターン開始時に FW+3 を得る。',
  },
  auto_scraper: {
    id: 'auto_scraper',
    name: '自動スクレイパー',
    icon: 'scraper',
    description: '毎ターン開始時に「次の攻撃+3」を得る。',
  },
  packet_cache: {
    id: 'packet_cache',
    name: 'パケットキャッシュ',
    icon: 'cache',
    description: '毎ターンのドロー枚数 +1。',
  },
  zero_trust_key: {
    id: 'zero_trust_key',
    name: 'ゼロトラスト鍵',
    icon: 'key',
    description: '毎ターン開始時の帯域 +1。',
  },
  adaptive_filter: {
    id: 'adaptive_filter',
    name: '適応型フィルター',
    icon: 'filter',
    description: `解析コンボが発動すると、帯域に加えて FW+${ADAPTIVE_FILTER_FW} を得る。`,
  },
  forensics_lab: {
    id: 'forensics_lab',
    name: '証跡ラボ',
    icon: 'forensics',
    description: `通常成長時、イベントの1問目に正解してカードに与える経験値が +${FORENSICS_LAB_XP} 増える。`,
  },
  thermal_core: {
    id: 'thermal_core',
    name: 'ウイルスコア',
    icon: 'thermal',
    description: `毎ターン開始時、敵全体にウイルス+${THERMAL_CORE_BURN}を付与する(残りターンは延びない)。`,
  },
  thorn_daemon: {
    id: 'thorn_daemon',
    name: '反撃デーモン',
    icon: 'thorn',
    description: `毎ターン開始時、反撃が${THORN_DAEMON_RETALIATE}より少なければ${THORN_DAEMON_RETALIATE}にする。`,
  },
  siphon_module: {
    id: 'siphon_module',
    name: '吸収モジュール',
    icon: 'siphon',
    description: `戦闘勝利時のHP回復量が +${SIPHON_MODULE_HEAL} 増える。`,
  },
  overclock_bus: {
    id: 'overclock_bus',
    name: 'オーバークロックバス',
    icon: 'bus',
    description: '各戦闘の1ターン目だけ帯域+2・ドロー+1を得る。',
  },
  weak_scanner: {
    id: 'weak_scanner',
    name: '脆弱スキャナー',
    icon: 'scanner',
    description: '各戦闘の開始時、敵全体に「脆弱(2T)」を付与する。',
  },
  coin_miner: {
    id: 'coin_miner',
    name: 'コインマイナー',
    icon: 'miner',
    description: '戦闘に勝利するたび、必ず解析コイン+1を追加獲得する。',
  },
};

export const ECHO_RELIC_IDS = Object.values(RELIC_DEFINITIONS).map(({ id }) => id).filter((id) => id.startsWith('echo_'));
export const ALL_RELIC_IDS = Object.values(RELIC_DEFINITIONS).map(({ id }) => id).filter((id) => !ECHO_RELIC_IDS.includes(id));
