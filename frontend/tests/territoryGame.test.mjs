import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const cache = new Map();
const overrides = {
  react: {
    useEffect() {},
    useMemo: (cb) => cb(),
    useRef: (v) => ({ current: v }),
    useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  },
  '@xyflow/react': {
    ReactFlow: 'Flow',
    ReactFlowProvider: 'Provider',
    Background: 'Background',
    Controls: 'Controls',
    PanOnScrollMode: { Vertical: 'vertical' },
    Position: { Top: 'top', Bottom: 'bottom' },
    Handle: 'Handle',
  },
};

function load(url) {
  const key = url.href;
  if (cache.has(key)) return cache.get(key);
  const module = { exports: {} };
  cache.set(key, module.exports);
  const { outputText } = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const localRequire = (id) => {
    if (id.endsWith('.css')) return {};
    if (id in overrides) return overrides[id];
    if (id.startsWith('.')) {
      const target = new URL(id + '.ts', url);
      if (!existsSync(target)) target.pathname += 'x';
      return load(target);
    }
    return require(id);
  };
  runInNewContext('(function(require,module,exports){' + outputText + '\n})', { console })(
    localRequire,
    module,
    module.exports,
  );
  return module.exports;
}

function elements(tree, type) {
  if (!tree || typeof tree !== 'object') return [];
  return [
    ...(tree.type === type ? [tree] : []),
    ...[tree.props?.children].flat(Infinity).flatMap((child) => elements(child, type)),
  ];
}

test('territory card battle handles adjacency, weakness, capture rewards, enemy turns, and victory', () => {
  const {
    createInitialTerritoryState,
    playTerritoryCard,
    pickRewardCard,
    endTerritoryTurn,
    getAttackableNodeIds,
  } = load(new URL('../src/game/territory/territoryEngine.ts', import.meta.url));

  let state = createInitialTerritoryState(() => 0.1);
  assert.equal(state.nodes.length, 11);
  assert.equal(state.bandwidth, 3);
  assert.equal(state.hand.length, 4);

  // 最初は E01 隣接の D01 / E02 / D03 のみ攻撃可能（C03 には届かない）
  const attackable = getAttackableNodeIds(state);
  assert.equal(attackable.has('D01'), true);
  assert.equal(attackable.has('C03'), false);

  // テスト用に強力な SQLi カードを手札に持たせて D01 (Web, HP 10) を攻撃 → 13 * 1.5 = 20dmg で一撃制圧
  state.hand.push({ uid: 'test-sqli', defId: 'union_sqli' });
  const badTarget = playTerritoryCard(state, 'test-sqli', 'C03');
  assert.equal(badTarget.accepted, false);

  const captureRes = playTerritoryCard(state, 'test-sqli', 'D01', () => 0.2);
  assert.equal(captureRes.accepted, true);
  state = captureRes.state;
  assert.equal(state.nodes.find((n) => n.id === 'D01').owner, 'player');
  assert.equal(state.rewardChoices.length, 3);

  const pickedId = state.rewardChoices[0].id;
  state = pickRewardCard(state, pickedId);
  assert.equal(state.rewardChoices, null);
  assert.ok(state.discard.some((c) => c.defId === pickedId));

  // ターン終了で ARGUS が反撃し、次のターンで手札補充・Web支配によるドロー+1（計5枚）
  state = endTerritoryTurn(state, () => 0.2);
  assert.equal(state.turn, 2);
  assert.equal(state.hand.length, 5);

  // 最終目標 C03 隣接まで支配して制圧すると勝利
  state.nodes.find((n) => n.id === 'C01').owner = 'player';
  const core = state.nodes.find((n) => n.id === 'C03');
  core.hp = 5;
  core.shield = 0;
  state.bandwidth = 3;
  state.hand.push({ uid: 'test-finisher', defId: 'zero_day' });
  const winRes = playTerritoryCard(state, 'test-finisher', 'C03');
  assert.equal(winRes.accepted, true);
  assert.equal(winRes.state.status, 'won');
});

test('MissionScreen includes Sector 05 Card x Territory War card', () => {
  const { MissionScreen } = load(new URL('../src/components/MissionScreen/MissionScreen.tsx', import.meta.url));
  let picked;
  const tree = MissionScreen({ onSelectMission: (id) => { picked = id; }, onBack() {} });
  const cards = elements(tree, 'article');
  assert.equal(cards.length, 6);
  cards[5].props.onClick();
  assert.equal(picked, 5);
});

test('enemy turn records what ARGUS actually did so the screen can replay it', () => {
  const { createInitialTerritoryState, endTerritoryTurn } = load(new URL('../src/game/territory/territoryEngine.ts', import.meta.url));

  const state = createInitialTerritoryState(() => 0.1);
  assert.equal(state.lastEnemyActions.length, 0);
  const attack = state.intents.find((i) => i.action === 'attack');
  assert.ok(attack, 'D03 is next to the player base, so ARGUS should announce an attack');

  const next = endTerritoryTurn(state, () => 0.1);
  const event = next.lastEnemyActions.find((e) => e.kind === 'attack');
  assert.equal(event.sourceNodeId, attack.sourceNodeId);
  assert.equal(event.targetNodeId, attack.targetNodeId);
  assert.ok(event.damage > 0);
  assert.equal(event.captured, false);
  // 記録と実際の結果が一致している(画面の演出とログ・HPがずれない)
  const before = state.nodes.find((n) => n.id === attack.targetNodeId);
  const after = next.nodes.find((n) => n.id === attack.targetNodeId);
  assert.equal(before.hp + before.shield - (after.hp + after.shield), event.damage);

  // 攻撃予告していたノードを先に制圧すると、ARGUS の行動は「不発」として記録される
  const captured = JSON.parse(JSON.stringify(state));
  captured.nodes.find((n) => n.id === attack.sourceNodeId).owner = 'player';
  const fizzled = endTerritoryTurn(captured, () => 0.1);
  assert.ok(fizzled.lastEnemyActions.some((e) => e.kind === 'fizzle' && e.sourceNodeId === attack.sourceNodeId));
  assert.ok(!fizzled.lastEnemyActions.some((e) => e.kind === 'attack' && e.sourceNodeId === attack.sourceNodeId));
});

test('splash damage from DDoS is applied to connected nodes and shows up in the log', () => {
  const { createInitialTerritoryState, playTerritoryCard } = load(new URL('../src/game/territory/territoryEngine.ts', import.meta.url));
  const state = createInitialTerritoryState(() => 0.1);
  state.hand.push({ uid: 'dd', defId: 'ddos_flood' });
  const hp = (s, id) => s.nodes.find((n) => n.id === id).hp;
  const res = playTerritoryCard(state, 'dd', 'D01', () => 0.1);
  assert.equal(res.accepted, true);
  // D01 と線でつながった I06(中立)と I02(ARGUS)が余波を受ける
  assert.ok(hp(res.state, 'I06') < hp(state, 'I06'));
  assert.ok(res.state.logs.some((l) => l.message.includes('余波で 機密ファイル共有 に')), 'splash damage must be logged, not silent');
});

test('capturing a node that announced an attack removes its stale announcement immediately', () => {
  const { createInitialTerritoryState, playTerritoryCard } = load(new URL('../src/game/territory/territoryEngine.ts', import.meta.url));
  const state = createInitialTerritoryState(() => 0.1);
  const attack = state.intents.find((i) => i.action === 'attack');
  assert.equal(attack.sourceNodeId, 'D03');
  state.nodes.find((n) => n.id === 'D03').hp = 1;
  state.nodes.find((n) => n.id === 'D03').shield = 0;
  state.hand.push({ uid: 'kill', defId: 'zero_day' });
  const res = playTerritoryCard(state, 'kill', 'D03', () => 0.1);
  // ARGUS のノードはまず無力化(中立)される
  assert.equal(res.state.nodes.find((n) => n.id === 'D03').owner, 'neutral');
  assert.ok(!res.state.intents.some((i) => i.sourceNodeId === 'D03'), 'a disabled node can no longer act, so its announcement must go');
});

test('ARGUS nodes are taken in two steps: first disabled (neutral), then captured', () => {
  const { createInitialTerritoryState, playTerritoryCard } = load(new URL('../src/game/territory/territoryEngine.ts', import.meta.url));
  let state = createInitialTerritoryState(() => 0.1);
  const d03 = () => state.nodes.find((n) => n.id === 'D03');
  d03().hp = 1;
  d03().shield = 0;
  state.hand.push({ uid: 'a', defId: 'zero_day' }, { uid: 'b', defId: 'zero_day' });
  state.bandwidth = 10;

  let res = playTerritoryCard(state, 'a', 'D03', () => 0.1);
  state = res.state;
  assert.equal(d03().owner, 'neutral');
  assert.ok(d03().hp > 0, 'a disabled node keeps some HP, so it takes another attack to own it');
  assert.equal(state.rewardChoices, null, 'no reward for only disabling a node');
  assert.ok(state.logs.some((l) => l.message.includes('無力化')));

  res = playTerritoryCard(state, 'b', 'D03', () => 0.1);
  state = res.state;
  assert.equal(d03().owner, 'player');
  assert.equal(state.rewardChoices.length, 3);
});

test('the node in front of the enemy base is an ARGUS outpost, not an unclaimed node', () => {
  const { createInitialTerritoryState } = load(new URL('../src/game/territory/territoryEngine.ts', import.meta.url));
  const state = createInitialTerritoryState(() => 0.1);
  assert.equal(state.nodes.find((n) => n.id === 'I10').owner, 'argus');
});

test('ARGUS spreads into neutral nodes next to it', () => {
  const { createInitialTerritoryState, endTerritoryTurn } = load(new URL('../src/game/territory/territoryEngine.ts', import.meta.url));
  const state = createInitialTerritoryState(() => 0.1);
  const expand = state.intents.find((i) => i.action === 'expand');
  assert.ok(expand, 'ARGUS should announce spreading into a neutral neighbour');
  assert.equal(state.nodes.find((n) => n.id === expand.targetNodeId).owner, 'neutral');
  const before = state.nodes.find((n) => n.id === expand.targetNodeId);
  const next = endTerritoryTurn(state, () => 0.1);
  const after = next.nodes.find((n) => n.id === expand.targetNodeId);
  assert.ok(after.hp + after.shield < before.hp + before.shield || after.owner === 'argus');
  assert.ok(next.lastEnemyActions.some((e) => e.kind === 'expand' && e.targetNodeId === expand.targetNodeId));
});

test('ARGUS attacks the weakest player node it can reach', () => {
  const { createInitialTerritoryState, generateEnemyIntents } = load(new URL('../src/game/territory/territoryEngine.ts', import.meta.url));
  const state = createInitialTerritoryState(() => 0.1);
  // E01 と E02 を自陣にして、E02 を弱らせる。D03 は E01 にしか隣接していないので、I04 側から E02 を狙わせる
  const e02 = state.nodes.find((n) => n.id === 'E02');
  e02.owner = 'player';
  e02.hp = 2;
  e02.shield = 0;
  const intents = generateEnemyIntents(state, () => 0.1);
  const fromI04 = intents.find((i) => i.sourceNodeId === 'I04' && i.action === 'attack');
  assert.equal(fromI04.targetNodeId, 'E02');
});

test('new cards: malware, chain, route cut, trap, patch, botnet, sniffer and phishing work as described', () => {
  const { createInitialTerritoryState, playTerritoryCard, endTerritoryTurn } = load(new URL('../src/game/territory/territoryEngine.ts', import.meta.url));
  const fresh = () => { const s = createInitialTerritoryState(() => 0.1); s.bandwidth = 20; return s; };
  const node = (s, id) => s.nodes.find((n) => n.id === id);
  const play = (s, defId, target) => { s.hand.push({ uid: defId, defId }); const r = playTerritoryCard(s, defId, target, () => 0.1); assert.equal(r.accepted, true, `${defId}: ${r.reason}`); return r.state; };

  // マルウェア:2ダメージ+感染。ターン終了時にさらに3ダメージ
  let s = play(fresh(), 'malware_implant', 'E02');
  assert.equal(node(s, 'E02').hp, 7);
  assert.equal(node(s, 'E02').infection.turns, 3);
  s = endTerritoryTurn(s, () => 0.1);
  // (その後 ARGUS が弱った E02 を侵食して奪うこともあるので、感染のダメージはログで確かめる)
  assert.ok(s.logs.some((l) => l.message.includes('マルウェアが DNS情報リレー に3ダメージ')), 'infection deals damage at the end of the turn');

  // 標的型メール:中立には2.5倍
  s = play(fresh(), 'phishing_mail', 'E02');
  assert.equal(node(s, 'E02').owner, 'player', '4 x 2.5 = 10 >= 9 HP, so the neutral DNS relay is taken');

  // 連鎖:倒したら別のノードにも
  s = fresh();
  node(s, 'E02').hp = 1;
  s = play(s, 'chain_exploit', 'E02');
  assert.ok(s.logs.some((l) => l.message.includes('連鎖で')), 'chain damage hits another node');

  // ルート遮断:予告を取り消す
  s = play(fresh(), 'route_blackhole', 'D03');
  assert.ok(!s.intents.some((i) => i.sourceNodeId === 'D03'));

  // 罠:D03 の攻撃を跳ね返す
  s = play(fresh(), 'honeypot_trap', 'E01');
  const e01Before = node(s, 'E01').hp + node(s, 'E01').shield;
  const d03Before = node(s, 'D03').hp + node(s, 'D03').shield;
  s = endTerritoryTurn(s, () => 0.1);
  assert.equal(node(s, 'E01').hp + node(s, 'E01').shield, e01Before, 'the trapped node takes no damage');
  assert.ok(node(s, 'D03').hp + node(s, 'D03').shield < d03Before || node(s, 'D03').owner !== 'argus');
  assert.ok(s.lastEnemyActions.some((e) => e.kind === 'reflect'));

  // 緊急パッチ:回復
  s = fresh();
  node(s, 'E01').hp = 5;
  s = play(s, 'emergency_patch', 'E01');
  assert.equal(node(s, 'E01').hp, 12);

  // ボットネット:隣接する自陣の数だけ強くなる(E01 と D01 が I02… ではなく E02 に隣接)
  s = fresh();
  node(s, 'D01').owner = 'player';
  const before = node(s, 'I02').hp + node(s, 'I02').shield;
  s = play(s, 'botnet_surge', 'I02');
  assert.equal(before - (node(s, 'I02').hp + node(s, 'I02').shield), 5, 'only D01 is next to I02, so 5 damage');

  // パケット盗聴:攻撃できるノードすべてが露出
  s = play(fresh(), 'packet_sniffer');
  for (const id of ['D01', 'E02', 'D03']) assert.equal(node(s, id).exposed, true);
});
