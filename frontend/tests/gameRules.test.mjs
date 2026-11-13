import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const cache = new Map();
function load(url) {
  if (cache.has(url.href)) return cache.get(url.href).exports;
  const module = { exports: {} };
  cache.set(url.href, module);
  const { outputText } = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  });
  const localRequire = (id) => {
    if (id.endsWith('.css')) return {};
    if (id.startsWith('.')) {
      const target = new URL(id + '.ts', url);
      if (!existsSync(target)) target.pathname += 'x';
      return load(target);
    }
    return require(id);
  };
  runInNewContext('(function(require, module, exports) {' + outputText + '\n})', { console, crypto: globalThis.crypto })(localRequire, module, module.exports);
  return module.exports;
}
const { transition, validateAction } = load(new URL('../src/game/model/gameRules.ts', import.meta.url));
const { mapFromStage } = load(new URL('../src/game/model/mapDefinition.ts', import.meta.url));
const { STAGES } = load(new URL('../src/game/data/stageData.ts', import.meta.url));
const { createMockGameState } = load(new URL('../src/game/data/mockGameState.ts', import.meta.url));
const { MockGameClient } = load(new URL('../src/game/client/mockGameClient.ts', import.meta.url));
const context = { fragmentA: 'ABCD', fragmentB: 'EFGH' };
const plain = (value) => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const scenarios = JSON.parse(readFileSync(new URL('../../backend/tests/fixtures/stage_routes.json', import.meta.url)));
for (const scenario of scenarios) {
  test(`pure transition deterministic, detached and non-mutating: ${scenario.name}`, () => {
    const map = freeze(mapFromStage(STAGES[scenario.stageId ?? 1]));
    let state = createMockGameState('pure', map.id, map);
    state.keyFragments = { a: null, b: null };
    const fields = { alert_level: 'alertLevel', analysis_resource: 'analysisResource', current_privilege: 'privilege', game_time: 'elapsedSeconds' };
    for (const [key, value] of Object.entries(scenario.seed ?? {})) if (fields[key]) state[fields[key]] = value;
    for (const status of ['hacked', 'scanned']) for (const id of scenario[status] ?? []) state.nodes.find((n) => n.id === id).status = status;
    const actions = scenario.actions ?? [
      ...scenario.route.flatMap((nodeId) => [{ type: 'scan', nodeId }, { type: 'breach', nodeId }]),
      { type: 'dataExtract', nodeId: scenario.target ?? 'C03' },
    ];
    for (const action of actions) {
      freeze(state); freeze(action); freeze(context);
      const input = plain(state);
      const reason = validateAction(map, state, action, context);
      const result = transition(map, state, action, context);
      if (scenario.name === 'authenticated_extract_keeps_resources') assert.equal(result.accepted, true, result.reason);
      assert.deepEqual(plain(result), plain(transition(map, state, action, context)));
      assert.deepEqual(plain(state), input);
      assert.equal(result.reason, reason);
      if (!result.accepted) {
        assert.deepEqual(plain(result.state), input);
        assert.equal(result.events.length, 0);
      }
      const next = plain(result.state);
      result.state.nodes[0].position.x += 123;
      assert.deepEqual(plain(state), input);
      state = next;
    }
    for (const [key, value] of Object.entries(scenario.expected ?? {})) {
      assert.equal(['rank', 'score'].includes(key) ? state.evaluation[key] : state[key], value, key);
    }
  });
}

test('custom map controls initial state, gate and target; no global definition is changed', async () => {
  const baseline = plain(STAGES);
  const map = mapFromStage(STAGES[2]);
  map.seed = 'test-map'; map.generatorVersion = 'test-only';
  map.initialState.analysisResource = 17;
  map.entryNodeIds = ['S2-C02'];
  map.importantNodeIds = ['S2-I04'];
  map.breachRequirements = { 'S2-C02': ['S2-I06'] };
  map.targetNodeIds = ['S2-C02'];
  const client = new MockGameClient('custom', 2, map);
  await client.connect(() => {});
  assert.equal(client.state.analysisResource, 17);
  client.state.privilege = 'ROOT';
  client.state.nodes.find((n) => n.id === 'S2-C02').status = 'scanned';
  const before = plain(client.state);
  assert.equal((await client.sendAction({ type: 'breach', nodeId: 'S2-C02' })).reason, 'node_locked');
  assert.deepEqual(plain(client.state), before);
  client.state.nodes.find((n) => n.id === 'S2-I06').status = 'hacked';
  await client.sendAction({type:'confirmInfo',nodeId:'S2-C02'});
  const questionId=Object.keys(map.securityRules['S2-C02'].question_answers)[0];
  assert.equal((await client.sendAction({ type: 'breach', nodeId: 'S2-C02', questionId, exploitId: map.securityRules['S2-C02'].question_answers[questionId][0] })).accepted, true);
  assert.equal((await client.sendAction({ type: 'dataExtract', nodeId: 'S2-C02' })).accepted, true);
  assert.equal(client.state.status, 'won');
  assert.deepEqual(plain(STAGES), baseline);
  assert.equal(map.seed, 'test-map');
});
