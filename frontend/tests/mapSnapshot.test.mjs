import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const cache = new Map();
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
const plain = value => JSON.parse(JSON.stringify(value));
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('saved Mock progress, map and internal keys survive reconstruction; RETRY keeps the map', async () => {
  const disk = storage();
  const map = mapFromStage(getStageData(1));
  map.nodes[0].position.x += 123;
  map.entryNodeIds = ['E03'];
  let state;
  const first = new MockGameClient('saved-run', 1, map, disk);
  await first.connect(event => { if (event.type === 'state_snapshot') state = event.state; });
  assert.equal((await first.sendAction({ type: 'scan', nodeId: 'E01' })).reason, 'node_unreachable');
  for (const type of ['scan', 'confirmInfo']) assert.ok((await first.sendAction({ type, nodeId: 'E03' })).accepted);
  assert.ok((await first.sendAction({ type: 'breach', nodeId: 'E03', questionId: 'E03:acl-q1', exploitId: 'acl_smb' })).accepted);
  const before = plain(state);
  first.disconnect();
  const restored = new MockGameClient('saved-run', 1, undefined, disk);
  assert.deepEqual(plain(await restored.connect(() => {})), before);
  assert.equal(restored.fragmentA, first.fragmentA);
  assert.equal(restored.fragmentB, first.fragmentB);
  await restored.reset();
  const reset = await restored.connect(() => {});
  assert.equal(reset.elapsedSeconds, 0);
  assert.equal(reset.analysisResource, 25);
  assert.deepEqual(plain(reset.mapSnapshot.definition.edges), plain(map.edges));
  assert.deepEqual(plain(reset.mapSnapshot.definition.entryNodeIds), ['E03']);
  assert.equal(reset.nodes[0].position.x, map.nodes[0].position.x);
  const other = new MockGameClient('other-run', 1, undefined, disk);
  assert.deepEqual(plain((await other.connect(() => {})).mapSnapshot.definition.entryNodeIds), ['E01']);
});

test('corrupt Mock save is rejected without overwriting or silently starting another game', () => {
  const disk = storage(), key = 'nullroute.mock.snapshot.v1.1.broken';
  disk.setItem(key, '{broken');
  assert.throws(() => new MockGameClient('broken', 1, undefined, disk));
  assert.equal(disk.getItem(key), '{broken');
});

test('storage failure does not advance Mock progress', async () => {
  let fail = false;
  const disk = { getItem: () => null, setItem() { if (fail) throw new Error('quota'); } };
  const client = new MockGameClient('quota', 1, undefined, disk);
  await client.connect(() => {});
  const before = plain(client.state);
  fail = true;
  assert.throws(() => client.sendAction({ type: 'scan', nodeId: 'E01' }), /quota/);
  assert.deepEqual(plain(client.state), before);
});

test('Python and Mock use the same fixed snapshot wire definition', t => {
  const root = new URL('../../', import.meta.url);
  const candidates = ['backend/.venv/Scripts/python.exe', 'backend/.venv/bin/python', '.venv/bin/python'];
  const python = process.env.NULL_ROUTE_TEST_PYTHON ?? candidates.map(p => fileURLToPath(new URL(p, root))).find(existsSync) ?? 'python';
  const result = spawnSync(python, ['-c', "import sys,json;sys.path.insert(0,'backend');from map_repository import to_wire;from map_definition import map_from_stage;from game_data import STAGES;print(json.dumps([to_wire(map_from_stage(STAGES[i])) for i in [0,1,2]]))"],
    { cwd: fileURLToPath(root), encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'sqlite:///:memory:' } });
  if ((result.error?.code === 'ENOENT' || /ModuleNotFoundError/.test(result.stderr ?? '')) && !process.env.NULL_ROUTE_TEST_PYTHON && process.env.CI !== 'true') {
    t.skip('Python unavailable'); return;
  }
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [0, 1, 2].map(id => plain(mapFromStage(getStageData(id)))));
});
