// MVP の敵(docs/deckbattle-plan-v0.2.md の8章)。行動は pattern の順にくり返す(ランダムにしない)。
import type { EnemyDefinition, EnemyWeakness } from './types';

export const WEAKNESS_LABEL: Record<EnemyWeakness, string> = {
  multi: '連撃',
  pierce: '貫通',
  burn: '過熱',
  all: '全体',
};

export const ENEMY_DEFINITIONS: Record<string, EnemyDefinition> = {
  scanner_bot: {
    id: 'scanner_bot',
    name: 'スキャナーbot',
    icon: '🛰️',
    maxHp: 28,
    weakness: 'burn',
    pattern: [
      { type: 'attack', amount: 6 },
      { type: 'block', amount: 6 },
      { type: 'attack', amount: 8 },
    ],
  },
  ids_sensor: {
    id: 'ids_sensor',
    name: 'IDSセンサー',
    icon: '👁️',
    maxHp: 16,
    weakness: 'pierce',
    pattern: [
      { type: 'attack', amount: 4, hits: 2 },
      { type: 'detect', amount: 1 },
    ],
  },
  firewall_ai: {
    id: 'firewall_ai',
    name: 'ファイアウォールAI',
    icon: '🧠',
    maxHp: 40,
    weakness: 'pierce',
    pattern: [
      { type: 'blockAttack', block: 10, amount: 5 },
      { type: 'buff', amount: 3 },
      { type: 'attack', amount: 12 },
    ],
  },
  argus: {
    id: 'argus',
    name: '監視AI ARGUS',
    icon: '🔺',
    maxHp: 120,
    weakness: 'pierce',
    pattern: [
      { type: 'attack', amount: 10 },
      { type: 'block', amount: 12 },
      { type: 'noise', count: 2 },
    ],
    phase2: {
      hpRatio: 0.5,
      pattern: [
        { type: 'attack', amount: 7, hits: 2 },
        { type: 'attack', amount: 18 },
        { type: 'noise', count: 2 },
      ],
    },
  },
  zero_trust_gate: {
    id: 'zero_trust_gate',
    name: 'ゼロトラストゲート(強敵)',
    icon: '⛩️',
    maxHp: 62,
    weakness: 'multi',
    pattern: [
      { type: 'blockAttack', block: 12, amount: 7 },
      { type: 'detect', amount: 1 },
      { type: 'attack', amount: 14 },
    ],
  },
};
