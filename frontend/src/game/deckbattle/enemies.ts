// 敵(docs/deckbattle-plan-v0.3.md の8章)。行動は pattern の順にくり返す(ランダムにしない)。
// 数値は 2026-11-19 のシミュレーション(1条件400ラン)で調整:上手いプレイで勝率9割前後、適当なプレイで5割前後。
import type { EnemyDefinition, EnemyWeakness } from './types';

export const WEAKNESS_LABEL: Record<EnemyWeakness, string> = {
  multi: '連撃',
  pierce: '貫通',
  burn: 'ウイルス',
  all: '全体',
};

export function describeEnemyGroup(enemyIds: string[]): string {
  const names = enemyIds.map((id) => ENEMY_DEFINITIONS[id]?.name ?? id);
  return names.length > 1 && new Set(names).size === 1
    ? `${names[0]}×${names.length}`
    : names.join('・');
}

export const ENEMY_DEFINITIONS: Record<string, EnemyDefinition> = {
  watcher: { id: 'watcher', name: 'WATCHER // 監視ドローン', icon: 'scannerBot', maxHp: 48, weakness: 'burn',
    pattern: [{ type: 'watch', amount: 9, extra: 6, threshold: 4 }, { type: 'attack', amount: 12 }] },
  bulwark: { id: 'bulwark', name: 'BULWARK // 防衛ユニット', icon: 'firewallAi', maxHp: 68, weakness: 'pierce',
    pattern: [{ type: 'block', amount: 15 }, { type: 'blockAttack', block: 13, amount: 8 }, { type: 'blockAttack', block: 10, amount: 20 }] },
  repair_node: { id: 'repair_node', name: 'REPAIR NODE // 修復プロセス', icon: 'idsSensor', maxHp: 31, weakness: 'all',
    pattern: [{ type: 'support', heal: 7, block: 4, buff: 1 }, { type: 'attack', amount: 7 }] },
  null_process: { id: 'null_process', name: 'NULL PROCESS // 無効化プロセス', icon: 'idsSensor', maxHp: 42, weakness: 'pierce',
    pattern: [{ type: 'interfere', count: 1 }, { type: 'attack', amount: 12 }, { type: 'noise', count: 2 }] },
  guardian_proxy: { id: 'guardian_proxy', name: 'GUARDIAN PROXY // 門番代理', icon: 'zeroTrustGate', maxHp: 138, weakness: 'pierce',
    pattern: [{ type: 'blockAttack', block: 25, amount: 11 }, { type: 'block', amount: 20 }, { type: 'blockAttack', block: 12, amount: 28 }] },
  mirror_daemon: { id: 'mirror_daemon', name: 'MIRROR DAEMON // 模倣デーモン', icon: 'zeroTrustGate', maxHp: 126, weakness: 'multi',
    pattern: [{ type: 'mirror', amount: 19, block: 19 }, { type: 'attack', amount: 13, hits: 2 }] },
  nexus: { id: 'nexus', name: 'NEXUS // 統合防衛中枢', icon: 'argus', maxHp: 305, weakness: 'all',
    pattern: [{ type: 'attack', amount: 18 }, { type: 'blockAttack', block: 24, amount: 10 }, { type: 'interfere', count: 1 }],
    phase2: { hpRatio: .65, pattern: [{ type: 'attack', amount: 11, hits: 2 }, { type: 'interfere', count: 2 }, { type: 'blockAttack', block: 18, amount: 14 }] },
    phase3: { hpRatio: .28, pattern: [{ type: 'attack', amount: 33 }, { type: 'block', amount: 26 }, { type: 'attack', amount: 12, hits: 2 }] },
    summon: 'repair_node' },
  scanner_bot: {
    id: 'scanner_bot',
    name: 'スキャナーbot',
    icon: 'scannerBot',
    maxHp: 42,
    weakness: 'burn',
    pattern: [
      { type: 'attack', amount: 7 },
      { type: 'block', amount: 9 },
      { type: 'attack', amount: 10 },
    ],
  },
  ids_sensor: {
    id: 'ids_sensor',
    name: 'IDSセンサー',
    icon: 'idsSensor',
    maxHp: 32,
    weakness: 'pierce',
    pattern: [
      { type: 'attack', amount: 6, hits: 2 },
      { type: 'detect', amount: 1 },
    ],
  },
  firewall_ai: {
    id: 'firewall_ai',
    name: 'ファイアウォールAI',
    icon: 'firewallAi',
    maxHp: 80,
    weakness: 'pierce',
    pattern: [
      { type: 'blockAttack', block: 20, amount: 8 },
      { type: 'buff', amount: 3 },
      { type: 'attack', amount: 18 },
    ],
  },
  argus: {
    id: 'argus',
    name: '監視AI ARGUS',
    icon: 'argus',
    maxHp: 240,
    weakness: 'pierce',
    pattern: [
      { type: 'attack', amount: 15 },
      { type: 'block', amount: 24 },
      { type: 'noise', count: 2 },
    ],
    phase2: {
      hpRatio: 0.5,
      pattern: [
        { type: 'attack', amount: 10, hits: 2 },
        { type: 'attack', amount: 28 },
        { type: 'noise', count: 2 },
      ],
    },
  },
  argus_tutorial: {
    id: 'argus_tutorial',
    name: '監視AI ARGUS（訓練機）',
    icon: 'argus',
    maxHp: 70,
    weakness: 'pierce',
    pattern: [
      { type: 'attack', amount: 6 },
      { type: 'block', amount: 8 },
      { type: 'noise', count: 1 },
    ],
    phase2: {
      hpRatio: 0.5,
      pattern: [
        { type: 'attack', amount: 4, hits: 2 },
        { type: 'attack', amount: 10 },
        { type: 'noise', count: 1 },
      ],
    },
  },
  aegis_omega: {
    id: 'aegis_omega',
    name: '自律要塞 AEGIS-OMEGA',
    icon: 'firewallAi',
    maxHp: 230,
    weakness: 'burn',
    pattern: [
      { type: 'blockAttack', block: 20, amount: 12 },
      { type: 'buff', amount: 2 },
      { type: 'attack', amount: 18 },
    ],
    phase2: {
      hpRatio: 0.5,
      pattern: [
        { type: 'blockAttack', block: 24, amount: 14 },
        { type: 'buff', amount: 2 },
        { type: 'attack', amount: 12, hits: 2 },
      ],
    },
  },
  hydra_net: {
    id: 'hydra_net',
    name: '分散群知能 HYDRA-NET',
    icon: 'idsSensor',
    maxHp: 240,
    weakness: 'multi',
    pattern: [
      { type: 'attack', amount: 7, hits: 3 },
      { type: 'detect', amount: 1 },
      { type: 'attack', amount: 9, hits: 2 },
    ],
    phase2: {
      hpRatio: 0.5,
      pattern: [
        { type: 'attack', amount: 7, hits: 4 },
        { type: 'detect', amount: 1 },
        { type: 'attack', amount: 12, hits: 2 },
      ],
    },
  },
  zero_trust_gate: {
    id: 'zero_trust_gate',
    name: 'ゼロトラストゲート(強敵)',
    icon: 'zeroTrustGate',
    maxHp: 124,
    weakness: 'multi',
    pattern: [
      { type: 'blockAttack', block: 24, amount: 10 },
      { type: 'detect', amount: 1 },
      { type: 'attack', amount: 21 },
    ],
  },
};
