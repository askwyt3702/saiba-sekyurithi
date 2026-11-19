// パッシブ装備(常駐ツール / レリック)。イベント3問正解や報酬で獲得し、戦闘中ずっと自動で発動する。
import type { RelicDefinition, RelicId } from './types';

export const ADAPTIVE_FILTER_FW = 3;
export const FORENSICS_LAB_XP = 1;
export const THERMAL_CORE_BURN = 2;
export const THORN_DAEMON_RETALIATE = 4;
export const SIPHON_MODULE_HEAL = 6;

export const RELIC_DEFINITIONS: Record<RelicId, RelicDefinition> = {
  encrypted_vpn: {
    id: 'encrypted_vpn',
    name: '暗号化VPN',
    icon: '🔐',
    description: '毎ターン開始時に FW+3 を得る。',
  },
  auto_scraper: {
    id: 'auto_scraper',
    name: '自動スクレイパー',
    icon: '🦾',
    description: '毎ターン開始時に「次の攻撃+3」を得る。',
  },
  packet_cache: {
    id: 'packet_cache',
    name: 'パケットキャッシュ',
    icon: '💾',
    description: '毎ターンのドロー枚数 +1。',
  },
  zero_trust_key: {
    id: 'zero_trust_key',
    name: 'ゼロトラスト鍵',
    icon: '🗝️',
    description: '毎ターン開始時の帯域 +1。',
  },
  adaptive_filter: {
    id: 'adaptive_filter',
    name: '適応型フィルター',
    icon: '🛡️',
    description: `解析コンボが発動すると、帯域に加えて FW+${ADAPTIVE_FILTER_FW} を得る。`,
  },
  forensics_lab: {
    id: 'forensics_lab',
    name: '証跡ラボ',
    icon: '🔬',
    description: `通常成長時、イベントの1問目に正解してカードに与える経験値が +${FORENSICS_LAB_XP} 増える。`,
  },
  thermal_core: {
    id: 'thermal_core',
    name: '過熱コア',
    icon: '🔥',
    description: `毎ターン開始時、敵全体に過熱+${THERMAL_CORE_BURN}を付与する(残りターンは延びない)。`,
  },
  thorn_daemon: {
    id: 'thorn_daemon',
    name: '反撃デーモン',
    icon: '🪤',
    description: `毎ターン開始時、反撃が${THORN_DAEMON_RETALIATE}より少なければ${THORN_DAEMON_RETALIATE}にする。`,
  },
  siphon_module: {
    id: 'siphon_module',
    name: '吸収モジュール',
    icon: '🩸',
    description: `戦闘勝利時のHP回復量が +${SIPHON_MODULE_HEAL} 増える。`,
  },
  overclock_bus: {
    id: 'overclock_bus',
    name: 'オーバークロックバス',
    icon: '⚡',
    description: '各戦闘の1ターン目だけ帯域+2・ドロー+1を得る。',
  },
  weak_scanner: {
    id: 'weak_scanner',
    name: '脆弱スキャナー',
    icon: '🎯',
    description: '各戦闘の開始時、敵全体に「脆弱(2T)」を付与する。',
  },
  coin_miner: {
    id: 'coin_miner',
    name: 'コインマイナー',
    icon: '🪙',
    description: '戦闘に勝利するたび、必ず解析コイン+1を追加獲得する。',
  },
};

export const ALL_RELIC_IDS = Object.values(RELIC_DEFINITIONS).map(({ id }) => id);
