// 分岐マップ(docs/deckbattle-plan-v0.3.md の3章)。画面に依存しない純粋な関数で作る。
// 下から上へ12段＋ボス。1段目は起動ノード(1つだけ)、最後は1体のボスに全部の道が集まる。
// 段ごとに役割(序盤・中盤・補給・終盤・休憩)を決め、その中で種から同じ結果になるランダムで種類を選ぶ。
import { nextRandom } from './rng';
import type { RunEventId, RunMap, RunNode, RunNodeKind } from './types';

type WeightedKind = Exclude<RunNodeKind, 'start' | 'boss' | 'shop'>;

export interface FloorPlan {
  /** マップの左に出す役割の名前 */
  name: string;
  /** この段は全部この種類にする */
  fixed?: RunNodeKind;
  /** 種類の出やすさ(fixed がないとき) */
  weights?: Partial<Record<WeightedKind, number>>;
  /** この段の戦闘で出る敵の組み合わせ */
  battles?: string[][];
  /** この段の強敵 */
  elites?: string[][];
  /** この段のクイズの種類 */
  eventId?: RunEventId;
}

const EARLY_BATTLES = [['scanner_bot'], ['ids_sensor', 'ids_sensor']];
const MID_BATTLES = [['scanner_bot', 'ids_sensor'], ['firewall_ai']];
const LATE_BATTLES = [['firewall_ai', 'scanner_bot'], ['firewall_ai', 'ids_sensor']];
const MID_ELITES = [['zero_trust_gate']];
const LATE_ELITES = [['zero_trust_gate', 'scanner_bot']];

/** 段の役割(下から)。数値の調整はここで行う */
export const FLOOR_PLAN: FloorPlan[] = [
  { name: 'BOOT', fixed: 'start' },
  { name: 'EARLY', weights: { battle: 70, event: 30 }, battles: [['scanner_bot']], eventId: 'vuln_check' },
  { name: 'EARLY', weights: { battle: 55, event: 25, mystery: 20 }, battles: EARLY_BATTLES, eventId: 'vuln_check' },
  { name: 'EARLY', weights: { battle: 55, event: 25, mystery: 20 }, battles: EARLY_BATTLES, eventId: 'vuln_check' },
  { name: 'MID', weights: { battle: 45, event: 15, mystery: 15, elite: 12, rest: 13 }, battles: MID_BATTLES, elites: MID_ELITES, eventId: 'vuln_check' },
  { name: 'MID', weights: { battle: 45, event: 15, mystery: 15, elite: 12, rest: 13 }, battles: MID_BATTLES, elites: MID_ELITES, eventId: 'vuln_check' },
  { name: 'SUPPLY', fixed: 'shop' },
  { name: 'LATE', weights: { battle: 42, event: 14, mystery: 14, elite: 16, rest: 14 }, battles: LATE_BATTLES, elites: LATE_ELITES, eventId: 'patch' },
  { name: 'LATE', weights: { battle: 42, event: 14, mystery: 14, elite: 16, rest: 14 }, battles: LATE_BATTLES, elites: LATE_ELITES, eventId: 'patch' },
  { name: 'LATE', weights: { battle: 42, event: 14, mystery: 14, elite: 16, rest: 14 }, battles: LATE_BATTLES, elites: LATE_ELITES, eventId: 'patch' },
  { name: 'LATE', weights: { battle: 46, event: 16, mystery: 16, elite: 18 }, battles: LATE_BATTLES, elites: LATE_ELITES, eventId: 'patch' },
  { name: 'REST', fixed: 'rest' },
];

export const MAP_FLOORS = FLOOR_PLAN.length;
/** ボスを入れた段の数(画面の「◯段目 / 13」) */
export const MAP_TOTAL_FLOORS = MAP_FLOORS + 1;
export const MAP_COLUMNS = 7;
export const MAP_PATHS = 5;
const CENTER = Math.floor(MAP_COLUMNS / 2);
/** この段より上では、道が中央に寄りやすくなる(最後にボスへ集まるように) */
const FUNNEL_FROM_FLOOR = 7;
export const BOSS_ENEMY_IDS = ['argus', 'aegis_omega', 'hydra_net'];

const nodeId = (floor: number, col: number) => `${floor}-${col}`;

/** 種から分岐マップを作る(同じ種なら同じマップ) */
const DEEP_PLAN = FLOOR_PLAN.map((floor, index): FloorPlan => floor.fixed ? floor : ({
  ...floor,
  battles: index < 4 ? [['watcher'], ['bulwark'], ['null_process'], ['watcher', 'repair_node']]
    : [['bulwark', 'repair_node'], ['watcher', 'null_process'], ['bulwark', 'watcher'], ['null_process', 'repair_node']],
  elites: [['guardian_proxy'], ['mirror_daemon']],
  weights: index >= 4 && index !== 7 ? { ...floor.weights, elite: 22, mystery: 19 } : floor.weights,
}));

export function generateRunMap(seed: number, act: 1 | 2 = 1): RunMap {
  const floorPlan = act === 2 ? DEEP_PLAN : FLOOR_PLAN;
  let state = seed;
  const rand = () => {
    const r = nextRandom(state);
    state = r.state;
    return r.value;
  };
  // (テストの読み込みは .ts を TSX として扱うので、型引数つきのアロー関数ではなく function で書く)
  function pick<T>(items: readonly T[]): T {
    return items[Math.floor(rand() * items.length)];
  }

  const nodes: Record<string, RunNode & { prev: string[] }> = {};
  const edges: Array<{ floor: number; from: number; to: number }> = [];
  const ensure = (floor: number, col: number) => {
    const id = nodeId(floor, col);
    if (!nodes[id]) nodes[id] = { id, floor, col, kind: 'battle', next: [], prev: [] };
    return nodes[id];
  };
  const link = (floor: number, from: number, to: number) => {
    const a = ensure(floor, from);
    const b = ensure(floor + 1, to);
    if (!a.next.includes(b.id)) a.next.push(b.id);
    if (!b.prev.includes(a.id)) b.prev.push(a.id);
    if (!edges.some((e) => e.floor === floor && e.from === from && e.to === to)) edges.push({ floor, from, to });
  };
  // 同じ段の線が交差するか(左右が入れ替わる線は引かない)
  const crosses = (floor: number, from: number, to: number) =>
    edges.some((e) => e.floor === floor && ((from < e.from && to > e.to) || (from > e.from && to < e.to)));

  // 起動ノード(1つ)から、2段目の別々の列へ広がる
  const start = ensure(0, CENTER);
  const firstCols = [1, 2, 3, 4, 5]
    .map((c) => ({ c, k: rand() }))
    .sort((a, b) => a.k - b.k)
    .slice(0, 4)
    .map((x) => x.c)
    .sort((a, b) => a - b);
  for (let p = 0; p < MAP_PATHS; p++) {
    let col = firstCols[p % firstCols.length];
    link(0, CENTER, col);
    for (let floor = 1; floor < MAP_FLOORS - 1; floor++) {
      let options = [col - 1, col, col + 1].filter((c) => c >= 0 && c < MAP_COLUMNS && !crosses(floor, col, c));
      if (floor >= FUNNEL_FROM_FLOOR) {
        const closer = options.filter((c) => Math.abs(c - CENTER) < Math.abs(col - CENTER));
        if (closer.length > 0 && rand() < 0.85) options = closer;
      }
      if (options.length > 1 && rand() < 0.5) {
        const inner = options.filter((c) => c !== 0 && c !== MAP_COLUMNS - 1);
        if (inner.length > 0) options = inner;
      }
      // 真上へ進む線は交差しないので、候補が空になることはないが念のため
      const next = options.length > 0 ? pick(options) : col;
      link(floor, col, next);
      col = next;
    }
  }

  // 最後の段から、ランダム選出された1体のボスへ全部つなぐ
  const pickedBossId = act === 2 ? 'nexus' : pick(BOSS_ENEMY_IDS);
  const boss: RunNode & { prev: string[] } = { id: 'boss', floor: MAP_FLOORS, col: CENTER, kind: 'boss', next: [], prev: [], enemyIds: [pickedBossId] };
  nodes[boss.id] = boss;
  for (const n of Object.values(nodes)) {
    if (n.floor === MAP_FLOORS - 1) {
      n.next.push(boss.id);
      boss.prev.push(n.id);
    }
  }

  // 種類を決める(下の段から順に)。どの道を通っても守られるように、
  // 道ごとの「戦闘の連続数(多い方)」と「クイズの回数(少ない方)」を持ち回る
  const streak: Record<string, number> = {};
  const quizMin: Record<string, number> = {};
  const order = Object.values(nodes)
    .filter((n) => n.id !== boss.id)
    .sort((a, b) => a.floor - b.floor || a.col - b.col);
  for (const n of order) {
    const plan = floorPlan[n.floor];
    const parents = n.prev.map((id) => nodes[id]);
    if (plan.fixed) {
      n.kind = plan.fixed;
    } else {
      const parentKinds = parents.map((p) => p.kind);
      let weights = Object.entries(plan.weights ?? {}) as Array<[WeightedKind, number]>;
      // 休憩・強敵は続けて出ない
      weights = weights.filter(([k]) => !((k === 'rest' || k === 'elite') && parentKinds.includes(k)));
      // 戦闘は3回続かない
      if (Math.max(0, ...parents.map((p) => streak[p.id] ?? 0)) >= 2) weights = weights.filter(([k]) => k !== 'battle');
      // 補給(闇市)の段の直後は休憩にしない
      if (floorPlan[n.floor - 1]?.fixed === 'shop') weights = weights.filter(([k]) => k !== 'rest');
      // 補給の段の手前までに、どの道でもクイズを1回は通る
      if (floorPlan[n.floor + 1]?.fixed === 'shop' && Math.min(...parents.map((p) => quizMin[p.id] ?? 0)) === 0) {
        weights = [['event', 1]];
      }
      const total = weights.reduce((s, [, w]) => s + w, 0);
      let x = rand() * total;
      n.kind = (weights.find(([, w]) => (x -= w) < 0) ?? weights[0])[0];
    }
    if (n.kind === 'battle') n.enemyIds = [...pick(plan.battles ?? EARLY_BATTLES)];
    if (n.kind === 'elite') n.enemyIds = [...pick(plan.elites ?? MID_ELITES)];
    if (n.kind === 'event') n.eventId = plan.eventId ?? 'vuln_check';
    const parentStreak = Math.max(0, ...parents.map((p) => streak[p.id] ?? 0));
    const parentQuiz = parents.length > 0 ? Math.min(...parents.map((p) => quizMin[p.id] ?? 0)) : 0;
    streak[n.id] = n.kind === 'battle' ? parentStreak + 1 : 0;
    quizMin[n.id] = parentQuiz + (n.kind === 'event' ? 1 : 0);
  }

  // 画面とテストで使わない prev は外して返す(next だけでたどれる)
  const out: Record<string, RunNode> = {};
  for (const n of Object.values(nodes)) {
    const { prev: _prev, ...rest } = n;
    void _prev;
    out[n.id] = { ...rest, next: [...rest.next].sort((a, b) => nodesCol(nodes, a) - nodesCol(nodes, b)) };
  }
  return { nodes: out, startId: start.id, bossId: boss.id, floorCount: MAP_TOTAL_FLOORS };
}

function nodesCol(nodes: Record<string, RunNode>, id: string): number {
  return nodes[id]?.col ?? 0;
}

/** 段の役割の名前(画面の左端に出す) */
export function floorName(floor: number): string {
  return floor >= MAP_FLOORS ? 'BOSS' : FLOOR_PLAN[floor].name;
}
