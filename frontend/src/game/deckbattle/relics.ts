// パッシブ装備(常駐ツール / レリック)。イベント3問正解や報酬で獲得し、戦闘中ずっと自動で発動する。
import type { RelicDefinition, RelicId } from './types';

export const ADAPTIVE_FILTER_FW = 3;
export const FORENSICS_LAB_XP = 1;

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
};

export const ALL_RELIC_IDS = Object.values(RELIC_DEFINITIONS).map(({ id }) => id);
