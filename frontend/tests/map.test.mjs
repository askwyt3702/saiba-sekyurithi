// 分岐マップ(game/deckbattle/map.ts)と、マップを進むランの関数(run.ts)のテスト。
// マップは毎回ランダムなので、たくさんの種で作って「どのマップでも守られる決まり」を確かめる。
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const cache = new Map();

function load(url) {
  const key = url.href;
  if (cache.has(key)) return cache.get(key);
  const module = { exports: {} };
  cache.set(key, module.exports);
  const { outputText } = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const localRequire = (id) => {
    if (id.startsWith('.')) {
      const target = new URL(id + '.ts', url);
      if (!existsSync(target)) target.pathname += 'x';
      return load(target);
    }
    return require(id);
  };
  runInNewContext('(function(require,module,exports){' + outputText + '\n})', { console, JSON, Math })(localRequire, module, module.exports);
  return module.exports;
}

const mapMod = load(new URL('../src/game/deckbattle/map.ts', import.meta.url));
const run = load(new URL('../src/game/deckbattle/run.ts', import.meta.url));
const { ENEMY_DEFINITIONS } = load(new URL('../src/game/deckbattle/enemies.ts', import.meta.url));
const { FLOOR_PLAN, MAP_FLOORS, MAP_COLUMNS, generateRunMap } = mapMod;

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 1);
const nodesOf = (map) => Object.values(map.nodes);
const at = (map, floor) => nodesOf(map).filter((n) => n.floor === floor);

/** 起動ノードからボスまでの道を全部たどる */
function allPaths(map) {
  const paths = [];
  (function walk(id, acc) {
    const n = map.nodes[id];
    if (n.kind === 'boss') return paths.push([...acc, n]);
    for (const next of n.next) walk(next, [...acc, n]);
  })(map.startId, []);
  return paths;
}

test('同じ種なら同じマップ、違う種なら違うマップになる', () => {
  assert.equal(JSON.stringify(generateRunMap(42)), JSON.stringify(generateRunMap(42)));
  assert.notEqual(JSON.stringify(generateRunMap(42)), JSON.stringify(generateRunMap(43)));
});

test('起動ノードは1つ、ボスは1体で、全部の道が起動ノードから始まりボスで終わる', () => {
  for (const seed of SEEDS) {
    const map = generateRunMap(seed);
    assert.equal(at(map, 0).length, 1, `seed ${seed}`);
    assert.equal(map.nodes[map.startId].kind, 'start');
    assert.equal(nodesOf(map).filter((n) => n.kind === 'boss').length, 1);
    assert.equal(map.floorCount, MAP_FLOORS + 1);
    // どのマスもボスへ行ける(行き止まりがない)
    for (const n of nodesOf(map)) {
      if (n.kind === 'boss') continue;
      assert.ok(n.next.length > 0, `seed ${seed} ${n.id} は行き止まり`);
      for (const next of n.next) assert.equal(map.nodes[next].floor, n.floor + 1, `seed ${seed} ${n.id} → ${next}`);
    }
    // どのマスも起動ノードからたどり着ける
    const reached = new Set();
    const stack = [map.startId];
    while (stack.length) {
      const id = stack.pop();
      if (reached.has(id)) continue;
      reached.add(id);
      stack.push(...map.nodes[id].next);
    }
    assert.equal(reached.size, nodesOf(map).length, `seed ${seed}`);
  }
});

test('同じ段の線は交差せず、横は決めた列の中に収まる', () => {
  for (const seed of SEEDS) {
    const map = generateRunMap(seed);
    const edges = [];
    for (const n of nodesOf(map)) {
      assert.ok(n.col >= 0 && n.col < MAP_COLUMNS);
      for (const id of n.next) {
        const m = map.nodes[id];
        if (n.kind === 'start' || m.kind === 'boss') continue;
        edges.push([n.floor, n.col, m.col]);
      }
    }
    for (const a of edges) for (const b of edges) {
      if (a[0] === b[0]) assert.ok(!(a[1] < b[1] && a[2] > b[2]), `seed ${seed} の ${a[0] + 1}段目で線が交差`);
    }
  }
});

test('段の役割どおりの種類になり、戦闘・強敵には敵、クイズには種類が入る', () => {
  for (const seed of SEEDS) {
    const map = generateRunMap(seed);
    for (const n of nodesOf(map)) {
      if (n.kind === 'boss') continue;
      const plan = FLOOR_PLAN[n.floor];
      if (plan.fixed) assert.equal(n.kind, plan.fixed, `seed ${seed} ${n.id}`);
      else assert.ok(n.kind in plan.weights, `seed ${seed} ${n.id} に ${n.kind} は出ない決まり`);
      if (n.kind === 'battle' || n.kind === 'elite') {
        assert.ok(n.enemyIds.length > 0);
        for (const id of n.enemyIds) assert.ok(ENEMY_DEFINITIONS[id], id);
      }
      if (n.kind === 'event') assert.ok(n.eventId === 'vuln_check' || n.eventId === 'patch');
    }
  }
});

test('どの道を通っても:休憩・強敵は続かず、戦闘は3回続かず、闇市の前にクイズを1回は通る', () => {
  for (const seed of SEEDS) {
    for (const path of allPaths(generateRunMap(seed))) {
      let battles = 0;
      let quizzes = 0;
      for (let i = 0; i < path.length; i++) {
        const kind = path[i].kind;
        if (i > 0 && (kind === 'rest' || kind === 'elite')) assert.notEqual(path[i - 1].kind, kind, `seed ${seed}`);
        battles = kind === 'battle' ? battles + 1 : 0;
        assert.ok(battles < 3, `seed ${seed} で戦闘が3回続く`);
        if (kind === 'event') quizzes++;
        if (kind === 'shop') assert.ok(quizzes >= 1, `seed ${seed} で闇市までにクイズがない`);
      }
    }
  }
});

test('ランは起動ノードで強化を選んでから、線でつながったマスにだけ進める', () => {
  let r = run.createRun({ mapSeed: 5 });
  assert.equal(run.getCurrentNode(r).kind, 'start');
  assert.equal(r.startBonusChoices.length, run.START_BONUS_CHOICES);
  const first = run.getNextNodes(r)[0];
  assert.throws(() => run.moveToNode(r, first.id), /強化を選んでから/);
  r = run.applyStartBonus(r, r.startBonusChoices[0], 1);
  assert.equal(r.startBonusChoices.length, 0);
  const far = Object.values(r.map.nodes).find((n) => n.floor === 3);
  assert.throws(() => run.moveToNode(r, far.id), /進めません/);
  r = run.moveToNode(r, first.id);
  assert.equal(r.currentNodeId, first.id);
  assert.deepEqual([...r.visitedNodeIds], [r.map.startId, first.id]);
  assert.equal(run.getCurrentFloor(r), 2);
});

test('強敵マスに入ると強敵の戦闘になり、ボスはマップの最後のマス', () => {
  for (const seed of SEEDS.slice(0, 40)) {
    let r = run.createRun({ mapSeed: seed });
    r = run.applyStartBonus(r, r.startBonusChoices[0], 1);
    const elite = Object.values(r.map.nodes).find((n) => n.kind === 'elite');
    if (!elite) continue;
    // 強敵マスへの道を、ボスからさかのぼらずに起動ノードから探す
    const path = allPaths(r.map).find((p) => p.some((n) => n.id === elite.id));
    for (const n of path.slice(1, path.indexOf(path.find((x) => x.id === elite.id)) + 1)) r = run.moveToNode(r, n.id);
    assert.equal(r.currentBattleElite, true);
    const battle = run.createBattleForCurrentNode(r, 1);
    assert.deepEqual([...battle.enemies.map((e) => e.defId)], [...elite.enemyIds]);
    return;
  }
  assert.fail('強敵マスのあるマップが見つからない');
});

test('起動ノードの強化:それぞれの効果が入り、候補にない強化は選べない', () => {
  const base = run.createRun({ mapSeed: 9 });
  const withChoice = (id) => ({ ...base, startBonusChoices: [id] });
  assert.equal(run.applyStartBonus(withChoice('max_hp'), 'max_hp', 1).maxHp, base.maxHp + 8);
  assert.equal(run.applyStartBonus(withChoice('coins'), 'coins', 1).reconCoins, base.reconCoins + 3);
  assert.equal(run.applyStartBonus(withChoice('relic'), 'relic', 1).relics.length, base.relics.length + 1);
  assert.equal(run.applyStartBonus(withChoice('tools'), 'tools', 1).tools.length, 2);
  assert.equal(run.applyStartBonus(withChoice('rare_card'), 'rare_card', 1).deck.length, base.deck.length + 1);
  assert.throws(() => run.applyStartBonus({ ...base, startBonusChoices: ['coins'] }, 'relic', 1), /選べません/);
});
