import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function connectionHarness() {
  const slots = [];
  let cursor = 0;
  let effects = [];
  const http = [];
  const mocks = [];
  class HttpFailure extends Error {}
  const stateFor = (stageId) => ({ stageId, gameId: String(stageId), status: 'playing', nodes: [], log: [] });
  class Http {
    constructor(_base, stageId) { this.stageId = stageId; http.push(this); }
    connect(callback) { this.callback = callback; return new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; }); }
    ready() { const state = stateFor(this.stageId); this.callback({ type: 'state_snapshot', state }); this.resolve(state); }
    disconnect() {}
  }
  class Mock {
    constructor(_id, stageId) { this.stageId = stageId; mocks.push(this); }
    connect(callback) { const state = stateFor(this.stageId); callback({ type: 'state_snapshot', state }); return Promise.resolve(state); }
    disconnect() {}
  }
  const same = (a, b) => a?.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], (value) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useMemo(callback, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) slots[i] = { value: callback(), deps };
      return slots[i].value;
    },
    useEffect(callback, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: callback() }; });
    },
  };
  const dependencies = { react, '../client/httpGameClient': { HttpGameClient: Http, HttpGameError: HttpFailure },
    '../client/mockGameClient': { MockGameClient: Mock }, '../data/stageData': { DEFAULT_STAGE_ID: 1 } };
  const { outputText } = ts.transpileModule(readFileSync(new URL('../src/game/hooks/useGameClient.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  runInNewContext('(function(require,module,exports){' + outputText + '\n})', { console: { warn() {} } })((id) => dependencies[id], module, module.exports);
  return { http, mocks, HttpFailure, render(enabled, stage) {
    cursor = 0; effects = [];
    const result = module.exports.useGameClient(enabled, stage);
    effects.forEach((effect) => effect());
    return result;
  } };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('new stage ignores stale snapshots and old callbacks after disconnection', async () => {
  const h = connectionHarness();
  assert.equal(h.render(true, 1).state, null);
  h.http[0].ready(); await settle();
  assert.equal(h.render(true, 1).state.stageId, 1);
  assert.equal(h.render(true, 2).state, null);
  h.http[0].callback({ type: 'state_snapshot', state: { stageId: 1, status: 'won' } });
  assert.equal(h.render(true, 2).state, null);
  h.http[1].ready(); await settle();
  assert.equal(h.render(true, 2).state.stageId, 2);
  assert.equal(h.render(false, 2).state, null);
  assert.equal(h.render(true, 2).state, null);
});

test('saved HTTP game or server snapshot error never silently switches to another Mock map', async () => {
  for (const saved of [true, false]) {
    const h = connectionHarness();
    h.render(true, 1);
    h.http[0].hasSavedGame = saved;
    h.http[0].reject(saved ? new Error('offline') : new h.HttpFailure('map_snapshot_invalid'));
    await settle();
    const result = h.render(true, 1);
    assert.equal(result.state, null);
    assert.ok(result.connectionError);
    assert.equal(h.mocks.length, 0);
  }
});

test('backend connection failure falls back to the selected stage2 Mock', async () => {
  const h = connectionHarness();
  h.render(true, 2);
  h.http[0].reject(new Error('offline'));
  await settle();
  assert.equal(h.render(true, 2).state.stageId, 2);
});

test('connectionMode reports backend or Mock so the UI can show an offline badge', async () => {
  const online = connectionHarness();
  assert.equal(online.render(true, 1).connectionMode, null);
  online.http[0].ready(); await settle();
  assert.equal(online.render(true, 1).connectionMode, 'backend');

  const offline = connectionHarness();
  offline.render(true, 1);
  offline.http[0].reject(new Error('offline'));
  await settle();
  assert.equal(offline.render(true, 1).connectionMode, 'mock');
  assert.equal(offline.render(false, 1).connectionMode, null);
});
