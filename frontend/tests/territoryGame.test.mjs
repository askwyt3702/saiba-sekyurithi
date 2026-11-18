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
  assert.equal(cards.length, 7);
  cards[5].props.onClick();
  assert.equal(picked, 5);
  cards[6].props.onClick();
  assert.equal(picked, 6);
});
