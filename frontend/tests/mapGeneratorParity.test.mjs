import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url), cache = new Map();
function load(url) {
  if (cache.has(url.href)) return cache.get(url.href).exports;
  const module = { exports: {} };
  cache.set(url.href, module);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const localRequire = id => id.startsWith('.') ? load(new URL(id + '.ts', url)) : require(id);
  runInNewContext('(function(require,module,exports){' + compiled.outputText + '\n})', { crypto: globalThis.crypto })(localRequire, module, module.exports);
  return module.exports;
}
const { mapFromStage } = load(new URL('../src/game/model/mapDefinition.ts', import.meta.url));
const { getStageData } = load(new URL('../src/game/data/stageData.ts', import.meta.url));
const { MockGameClient } = load(new URL('../src/game/client/mockGameClient.ts', import.meta.url));
const { transition } = load(new URL('../src/game/model/gameRules.ts', import.meta.url));
const { createMockGameState } = load(new URL('../src/game/data/mockGameState.ts', import.meta.url));
const fixture = JSON.parse(readFileSync(new URL('../../backend/tests/fixtures/stage1_generator_v1.json', import.meta.url), 'utf8'));
const plain = value => JSON.parse(JSON.stringify(value));

test('SHA256 counter vectors specify portable UTF-8 and big-endian conversion', () => {
  const { seed, stream, uint32 } = fixture.rng;
  assert.deepEqual(uint32, uint32.map((_, i) => createHash('sha256').update(`nullroute|${seed}|${stream}|${i}`, 'utf8').digest().readUInt32BE(0)));
});

for (const example of fixture.maps) {
  for (const [name, route] of Object.entries(example.routes)) {
    test(`generated map ${example.seed} ${name}: Mock agrees with every Backend transition`, async () => {
      const map = mapFromStage(getStageData(1));
      map.seed = example.seed;
      map.generatorVersion = fixture.generatorVersion;
      map.edges = example.edges;
      for (const node of map.nodes) node.position = example.positions[node.id];
      const client = new MockGameClient('generated-parity', 1, map, null);
      // Test keys are independent of the seed, just as real game keys will be.
      client.fragmentA = 'ABCD'; client.fragmentB = 'EFGH';
      let state;
      await client.connect(event => { if (event.type === 'state_snapshot') state = event.state; });
      let pure = createMockGameState('generated-parity', 1, map);
      for (const [i, a] of route.actions.entries()) {
        const action = { type: a.type, nodeId: a.node_id ?? undefined, passcode: a.passcode ?? undefined,
          exploitId: a.exploit_id ?? undefined, questionId: a.question_id ?? undefined };
        const pureResult = transition(map, pure, action, { fragmentA: 'ABCD', fragmentB: 'EFGH' });
        assert.ok(pureResult.accepted);
        pure = pureResult.state;
        assert.ok((await client.sendAction(action)).accepted);
        const actual = { elapsedSeconds: state.elapsedSeconds, alertLevel: state.alertLevel,
          analysisResource: state.analysisResource, privilege: state.privilege, status: state.status,
          nodes: Object.fromEntries(state.nodes.filter(n => n.status !== 'unscanned').map(n => [n.id, n.status])),
          securityEvents: state.securityEvents, cipherAuthenticated: state.keyFragments?.unlocked ?? false };
        assert.deepEqual(plain(actual), route.trace[i]);
        assert.equal(pure.elapsedSeconds, state.elapsedSeconds);
        assert.equal(pure.alertLevel, state.alertLevel);
        assert.equal(pure.analysisResource, state.analysisResource);
      }
      assert.equal(state.status, 'won');
      assert.equal(state.evaluation.rank, route.rank);
      assert.equal(state.evaluation.score, route.score);
    });
  }
}
