import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const STORAGE_KEY = 'cyber_labyrinth_clear_records_v1';
const { outputText } = ts.transpileModule(
  readFileSync(new URL('../src/game/model/missionRecords.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
);

// テストごとに、空の localStorage を持つ新しいブラウザ環境で missionRecords.ts を読み込む
function load({ storage = new Map(), withWindow = true, failWrites = false } = {}) {
  const localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => {
      if (failWrites) throw new Error('QuotaExceededError');
      storage.set(key, String(value));
    },
  };
  const module = { exports: {} };
  const context = withWindow ? { window: { localStorage } } : {};
  runInNewContext('(function(module, exports) {' + outputText + '\n})', context)(module, module.exports);
  // vm の中で作られたオブジェクトを、比較しやすい普通のオブジェクトに直す
  const plain = (value) => JSON.parse(JSON.stringify(value));
  return {
    storage,
    save: module.exports.saveStageClearRecord,
    records: () => plain(module.exports.getStageClearRecords()),
  };
}

test('the first clear of a mission is saved', () => {
  const { save, records, storage } = load();
  assert.deepEqual(records(), {});
  save(1, 'A', 800, 240);
  assert.deepEqual(records(), { 1: { rank: 'A', score: 800, bestTimeSeconds: 240 } });
  assert.ok(storage.has(STORAGE_KEY), 'records should be kept in localStorage');
});

test('a worse result never overwrites the best record', () => {
  const { save, records } = load();
  save(1, 'S', 950, 200);
  save(1, 'B', 600, 400);
  assert.deepEqual(records()[1], { rank: 'S', score: 950, bestTimeSeconds: 200 });
});

test('rank, score and time are each kept at their own best', () => {
  const { save, records } = load();
  save(1, 'S', 900, 300);
  // ランクは下がったが、スコアとタイムは良くなった
  save(1, 'A', 950, 250);
  assert.deepEqual(records()[1], { rank: 'S', score: 950, bestTimeSeconds: 250 });
  // ランクだけが上がることもある(D < C < B < A < S)
  const other = load();
  other.save(2, 'C', 500, 100);
  other.save(2, 'B', 400, 200);
  assert.deepEqual(other.records()[2], { rank: 'B', score: 500, bestTimeSeconds: 100 });
});

test('each mission keeps its own record', () => {
  const { save, records } = load();
  save(0, 'S', 990, 135);
  save(1, 'C', 450, 500);
  assert.deepEqual(records(), {
    0: { rank: 'S', score: 990, bestTimeSeconds: 135 },
    1: { rank: 'C', score: 450, bestTimeSeconds: 500 },
  });
});

test('records survive a reload because they are read back from localStorage', () => {
  const first = load();
  first.save(1, 'A', 820, 260);
  const reloaded = load({ storage: first.storage });
  assert.deepEqual(reloaded.records()[1], { rank: 'A', score: 820, bestTimeSeconds: 260 });
});

test('broken saved data is treated as no records instead of crashing', () => {
  const storage = new Map([[STORAGE_KEY, '{not json']]);
  const { save, records } = load({ storage });
  assert.deepEqual(records(), {});
  // 壊れたデータは、次のクリアで正しい記録に置き換わる
  save(1, 'B', 700, 300);
  assert.deepEqual(records(), { 1: { rank: 'B', score: 700, bestTimeSeconds: 300 } });
});

test('saving never throws when storage is full or there is no browser', () => {
  const full = load({ failWrites: true });
  assert.doesNotThrow(() => full.save(1, 'S', 999, 100));
  assert.deepEqual(full.records(), {});

  const server = load({ withWindow: false });
  assert.doesNotThrow(() => server.save(1, 'S', 999, 100));
  assert.deepEqual(server.records(), {});
});
