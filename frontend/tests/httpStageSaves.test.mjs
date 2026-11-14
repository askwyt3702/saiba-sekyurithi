import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function harness(initial = {}, forceWrongStage = false) {
  const storage = new Map(Object.entries(initial));
  const games = new Map();
  const calls = [];
  let nextId = 100;
  let failure = null;
  const make = (stageId, id) => ({ gameId: id, stageId, status: 'playing', elapsedSeconds: 0,
    analysisResource: 25, alertLevel: 0, privilege: 'GUEST', nodes: [], edges: [], log: [], evaluation: null });
  const fetch = async (url, options = {}) => {
    calls.push({ url, ...options });
    if (failure) return { ok: false, status: failure.status, json: async () => ({detail: failure.code}) };
    let value;
    if (url.endsWith('/api/games') && options.method === 'POST') {
      const stage = forceWrongStage ? 1 : JSON.parse(options.body).stageId;
      value = make(stage, String(nextId++));
      games.set(value.gameId, value);
    } else {
      const match = url.match(/\/api\/games\/([^/]+)(\/reset)?$/);
      const game = match && games.get(match[1]);
      if (game && match[2]) {
        value = make(JSON.parse(options.body).stageId, game.gameId);
        games.set(game.gameId, value);
      } else value = game;
    }
    return { ok: !!value, status: value ? 200 : 404, json: async () => structuredClone(value) };
  };
  const { outputText } = ts.transpileModule(readFileSync(new URL('../src/game/client/httpGameClient.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  const dependencies = { '../model/types': { fromApiNode: (node) => node }, '../data/stageData': { DEFAULT_STAGE_ID: 1 } };
  const context = { fetch, console, localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };
  runInNewContext('(function(require,module,exports){' + outputText + '\n})', context)((id) => dependencies[id], module, module.exports);
  return { Client: module.exports.HttpGameClient, storage, games, calls, make,
    fail(status, code) { failure = {status, code}; } };
}

test('new HTTP game sends seed and request ID, preserving the previous game', async () => {
  const h = harness({'nullroute.gameId.1':'previous'});
  h.games.set('previous', {...h.make(1, 'previous'), elapsedSeconds: 90});
  const start = {mode:'new', seed:'0'.repeat(32), requestId:'new-game-proof'};
  const state = await new h.Client('http://test', 1, start).connect(() => {});
  assert.notEqual(state.gameId, 'previous');
  assert.equal(h.storage.get('nullroute.gameId.1'), state.gameId);
  assert.equal(h.games.get('previous').elapsedSeconds, 90);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(JSON.parse(h.calls[0].body), {stageId:1, seed:start.seed, requestId:start.requestId});
});

test('failed new HTTP generation preserves the previous bookmark and blocks fallback', async () => {
  const h = harness({'nullroute.gameId.1':'previous'});
  h.fail(503, 'map_generation_failed');
  await assert.rejects(new h.Client('http://test', 1, {mode:'new'}).connect(() => {}), error => {
    assert.equal(error.blocksFallback, true);
    return true;
  });
  assert.equal(h.storage.get('nullroute.gameId.1'), 'previous');
});

test('actual HTTP snapshot 409 keeps the saved game ID and is classified without creating another game', async () => {
  const h = harness({'nullroute.gameId.1':'saved-game'});
  h.fail(409, 'map_snapshot_invalid');
  await assert.rejects(new h.Client('http://test', 1).connect(() => {}), error => {
    assert.equal(error.status, 409);
    assert.equal(error.code, 'map_snapshot_invalid');
    assert.equal(error.isSnapshotInvalid, true);
    return true;
  });
  assert.equal(h.storage.get('nullroute.gameId.1'), 'saved-game');
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].method, undefined);
});

test('actual HTTP action and reset snapshot errors propagate for safe stopping', async () => {
  const h = harness();
  const client = new h.Client('http://test', 1);
  await client.connect(() => {});
  h.fail(409, 'map_snapshot_invalid');
  await assert.rejects(client.sendAction({type:'scan',nodeId:'E01'}), error => error.isSnapshotInvalid);
  await assert.rejects(client.reset(), error => error.isSnapshotInvalid);
});

test('unavailable HTTP server remains distinguishable from an invalid snapshot', async () => {
  const h = harness();
  h.fail(503, 'unavailable');
  await assert.rejects(new h.Client('http://test', 1).connect(() => {}), error => {
    assert.equal(error.status, 503);
    assert.equal(error.isSnapshotInvalid, false);
    return true;
  });
});

test('legacy stage1 save is preserved while stage2 gets an independent save and reset', async () => {
  const h = harness({ 'nullroute.gameId': 'old-stage1' });
  h.games.set('old-stage1', { ...h.make(1, 'old-stage1'), analysisResource: 17, elapsedSeconds: 70 });
  const stage2 = new h.Client('http://test', 2);
  const initial = await stage2.connect(() => {});
  assert.equal(initial.stageId, 2);
  assert.equal(h.storage.get('nullroute.gameId.1'), 'old-stage1');
  assert.equal(h.storage.get('nullroute.gameId.2'), initial.gameId);
  assert.ok(!h.calls.some((call) => call.url.endsWith('/reset')));
  const resumed1 = await new h.Client('http://test', 1).connect(() => {});
  assert.equal(resumed1.analysisResource, 17);
  assert.equal(resumed1.elapsedSeconds, 70);
  h.games.get(initial.gameId).analysisResource = 9;
  const resumed2 = await new h.Client('http://test', 2).connect(() => {});
  assert.equal(resumed2.gameId, initial.gameId);
  assert.equal(resumed2.analysisResource, 9);
  await stage2.reset();
  assert.equal(h.games.get(initial.gameId).analysisResource, 25);
  assert.equal(h.games.get('old-stage1').analysisResource, 17);
});

test('legacy migration does not overwrite a newer stage1 bookmark', async () => {
  const h = harness({ 'nullroute.gameId': 'old', 'nullroute.gameId.1': 'newer' });
  h.games.set('old', h.make(1, 'old'));
  h.games.set('newer', { ...h.make(1, 'newer'), analysisResource: 4 });
  await new h.Client('http://test', 2).connect(() => {});
  assert.equal(h.storage.get('nullroute.gameId.1'), 'newer');
  assert.equal((await new h.Client('http://test', 1).connect(() => {})).analysisResource, 4);
});

test('simultaneous stage1/stage2 creation is separate; same-stage creation is deduplicated', async () => {
  const h = harness();
  const [a, b] = await Promise.all([new h.Client('http://test', 1).connect(() => {}), new h.Client('http://test', 2).connect(() => {})]);
  assert.equal(a.stageId, 1);
  assert.equal(b.stageId, 2);
  assert.notEqual(a.gameId, b.gameId);
  const fresh = harness();
  const [c, d] = await Promise.all([new fresh.Client('http://test', 2).connect(() => {}), new fresh.Client('http://test', 2).connect(() => {})]);
  assert.equal(c.gameId, d.gameId);
  assert.equal(fresh.games.size, 1);
});

test('wrong-stage response from an outdated server is rejected and never saved as stage2', async () => {
  const h = harness({}, true);
  await assert.rejects(new h.Client('http://test', 2).connect(() => {}), /指定ステージ/);
  assert.equal(h.storage.has('nullroute.gameId.2'), false);
});
