import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const { outputText } = ts.transpileModule(
  readFileSync(new URL('../src/game/sound/bgm.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
);

function load(context = {}) {
  const module = { exports: {} };
  runInNewContext('(function(module, exports) {' + outputText + '\n})', context)(module, module.exports);
  return module.exports;
}

test('BGM tension follows the same alert thresholds as the on-screen warning', () => {
  const { bgmIntensity, BGM_TEMPO } = load();
  assert.equal(bgmIntensity(0), 0);
  assert.equal(bgmIntensity(49.9), 0);
  assert.equal(bgmIntensity(50), 1);
  assert.equal(bgmIntensity(74.9), 1);
  assert.equal(bgmIntensity(75), 2);
  assert.equal(bgmIntensity(100), 2);
  assert.ok(BGM_TEMPO[0] < BGM_TEMPO[1] && BGM_TEMPO[1] < BGM_TEMPO[2], 'tempo should rise with tension');
});

test('BGM on/off setting is remembered in localStorage', () => {
  const storage = new Map();
  const localStorage = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)) };
  const first = load({ window: { localStorage } });
  assert.equal(first.isBgmEnabled(), true);
  first.setBgmEnabled(false);
  assert.equal(load({ window: { localStorage } }).isBgmEnabled(), false);
});

test('BGM does nothing and never throws outside a browser', () => {
  const { bgm, isBgmEnabled } = load();
  assert.equal(isBgmEnabled(), true);
  assert.doesNotThrow(() => { bgm.start(); bgm.setIntensity(2); bgm.stop(); });
  assert.equal(bgm.isPlaying, false);
});
