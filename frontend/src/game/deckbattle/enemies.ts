// 敵(docs/deckbattle-plan-v0.3.md の8章)。行動は pattern の順にくり返す(ランダムにしない)。
// 数値は 2026-11-19 のシミュレーション(1条件400ラン)で調整:上手いプレイで勝率9割前後、適当なプレイで5割前後。
import type { EnemyDefinition, EnemyWeakness } from './types';

export const WEAKNESS_LABEL: Record<EnemyWeakness, string> = {
  multi: '連撃',
  pierce: '貫通',
  burn: '過熱',
  all: '全体',
};

export function describeEnemyGroup(enemyIds: string[]): string {
  const names = enemyIds.map((id) => ENEMY_DEFINITIONS[id]?.name ?? id);
  return names.length > 1 && new Set(names).size === 1
    ? `${names[0]}×${names.length}`
    : names.join('・');
}

export const ENEMY_DEFINITIONS: Record<string, EnemyDefinition> = {
  scanner_bot: {
    id: 'scanner_bot',
    name: 'スキャナーbot',
    icon: '🛰️',
    maxHp: 42,
    weakness: 'burn',
    pattern: [
      { type: 'attack', amount: 9 },
      { type: 'block', amount: 9 },
      { type: 'attack', amount: 12 },
    ],
  },
  ids_sensor: {
    id: 'ids_sensor',
    name: 'IDSセンサー',
    icon: '👁️',
    maxHp: 32,
    weakness: 'pierce',
    pattern: [
      { type: 'attack', amount: 8, hits: 2 },
      { type: 'detect', amount: 1 },
    ],
  },
  firewall_ai: {
    id: 'firewall_ai',
    name: 'ファイアウォールAI',
    icon: '🧠',
    maxHp: 80,
    weakness: 'pierce',
    pattern: [
      { type: 'blockAttack', block: 20, amount: 10 },
      { type: 'buff', amount: 3 },
      { type: 'attack', amount: 24 },
    ],
  },
  argus: {
    id: 'argus',
    name: '監視AI ARGUS',
    icon: '🔺',
    maxHp: 240,
    weakness: 'pierce',
    pattern: [
      { type: 'attack', amount: 20 },
      { type: 'block', amount: 24 },
      { type: 'noise', count: 2 },
    ],
    phase2: {
      hpRatio: 0.5,
      pattern: [
        { type: 'attack', amount: 14, hits: 2 },
        { type: 'attack', amount: 36 },
        { type: 'noise', count: 2 },
      ],
    },
  },
  zero_trust_gate: {
    id: 'zero_trust_gate',
    name: 'ゼロトラストゲート(強敵)',
    icon: '⛩️',
    maxHp: 124,
    weakness: 'multi',
    pattern: [
      { type: 'blockAttack', block: 24, amount: 14 },
      { type: 'detect', amount: 1 },
      { type: 'attack', amount: 28 },
    ],
  },
};
