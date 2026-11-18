// パッシブ装備(常駐ツール / レリック)。イベント3問正解や報酬で獲得し、戦闘中ずっと自動で発動する。
import type { RelicDefinition, RelicId } from './types';

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
};

export const ALL_RELIC_IDS: RelicId[] = ['encrypted_vpn', 'auto_scraper', 'packet_cache', 'zero_trust_key'];
