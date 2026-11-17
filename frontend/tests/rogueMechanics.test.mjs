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
    useState: (v) => [v, () => {}],
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

test('Stage 4 generates deterministic rogue maps and handles honeypots and ARGUS counterattacks in Mock', async () => {
  const { generateRandomStage } = load(new URL('../src/game/model/randomMap.ts', import.meta.url));
  const { MockGameClient } = load(new URL('../src/game/client/mockGameClient.ts', import.meta.url));
  const { SECURITY_RULES } = load(new URL('../src/game/data/stageData.ts', import.meta.url));

  const mapA = generateRandomStage('SEED42', false);
  const mapB = generateRandomStage('SEED42', false);
  assert.deepEqual(mapA, mapB);
  assert.equal(mapA.nodes.length, 14);
  assert.ok(mapA.honeypotNodeIds.length >= 1);

  const mapHc = generateRandomStage('SEED42', true);
  const client = new MockGameClient('rogue-1', 4, undefined, { seed: 'SEED42', hardcore: true });
  await client.connect(() => {});
  assert.equal(client.state.stageId, 4);
  assert.equal(client.state.dynamicMap.hardcore, true);
  assert.equal(client.state.alertLevel, 5);

  // E01 を突破してからハニーポットを隔離
  await client.sendAction({ type: 'scan', nodeId: 'E01' });
  await client.sendAction({ type: 'confirmInfo', nodeId: 'E01' });
  await client.sendAction({ type: 'completeAnalysis', nodeId: 'E01' });
  const qE01 = Object.keys(SECURITY_RULES.E01.question_answers)[0];
  await client.sendAction({
    type: 'breach',
    nodeId: 'E01',
    questionId: qE01,
    exploitId: SECURITY_RULES.E01.question_answers[qE01][0],
  });

  const hpId = mapHc.honeypotNodeIds[0];
  await client.sendAction({ type: 'remoteScan', nodeId: hpId });
  const beforeFlagAlert = client.state.alertLevel;
  const flagRes = await client.sendAction({ type: 'flagTrap', nodeId: hpId });
  assert.equal(flagRes.accepted, true);
  assert.ok(client.state.dynamicMap.flaggedTraps.includes(hpId));
  assert.equal(client.state.alertLevel, Math.max(0, beforeFlagAlert - 5));

  // ハードコア時は経過時間で警戒度が自然減衰しないため、40%以上にするとARGUS強化監視が展開される
  client.state.alertLevel = 45;
  const safeDmz = mapHc.nodes.find((n) => n.layer === 'DMZ' && !mapHc.honeypotNodeIds.includes(n.id));
  await client.sendAction({ type: 'remoteScan', nodeId: safeDmz.id });
  assert.ok(client.state.dynamicMap.argusReinforced.length >= 1);
});

test('MissionScreen renders Sector 04 Rogue card with Hardcore toggle', () => {
  const { MissionScreen } = load(new URL('../src/components/MissionScreen/MissionScreen.tsx', import.meta.url));
  let picked;
  const tree = MissionScreen({ onSelectMission: (id, opts) => { picked = { id, opts }; }, onBack() {} });
  const cards = elements(tree, 'article');
  assert.equal(cards.length, 6);
  cards[4].props.onClick();
  assert.equal(picked.id, 4);
  assert.equal(picked.opts.hardcore, false);
});
