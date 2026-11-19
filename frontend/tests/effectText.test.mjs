// カードの説明文・戦闘ログの数字の色分け(game/deckbattle/effectText.ts)のテスト。
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const cache = new Map();

function load(url) {
  const key = url.href;
  if (cache.has(key)) return cache.get(key);
  const module = { exports: {} };
  cache.set(key, module.exports);
  const { outputText } = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const localRequire = (id) => {
    if (id.startsWith('.')) {
      const target = new URL(id + '.ts', url);
      if (!existsSync(target)) target.pathname += 'x';
      return load(target);
    }
    return require(id);
  };
  runInNewContext('(function(require,module,exports){' + outputText + '\n})', { console, RegExp })(localRequire, module, module.exports);
  return module.exports;
}

const { splitEffectText } = load(new URL('../src/game/deckbattle/effectText.ts', import.meta.url));
const { CARD_DEFINITIONS } = load(new URL('../src/game/deckbattle/cards.ts', import.meta.url));

// サンドボックスで作った配列は deepEqual できないので、普通の配列にコピーする
const kinds = (text) => [...splitEffectText(text)].filter((p) => p.kind !== 'plain').map((p) => `${p.kind}:${p.text}`);

test('効果ごとに種類を分ける', () => {
  assert.deepEqual(kinds('8ダメージ＋過熱4。'), ['damage:8ダメージ', 'burn:過熱4']);
  assert.deepEqual(kinds('FW7＋次に受ける攻撃に5反撃。'), ['block:FW7', 'retaliate:5反撃']);
  assert.deepEqual(kinds('HP−3／敵全体にFW貫通26ダメージ。'), ['self:HP−3', 'damage:FW貫通26ダメージ']);
  assert.deepEqual(kinds('2枚引く＋帯域1回復。'), ['draw:2枚引く', 'energy:帯域1回復']);
  assert.deepEqual(kinds('FW貫通8＋脆弱2T。'), ['damage:FW貫通8', 'debuff:脆弱2T']);
  assert.deepEqual(kinds('8ダメージ＋HP3回復。'), ['damage:8ダメージ', 'heal:HP3回復']);
  assert.deepEqual(kinds('次の攻撃＋8。'), ['buff:次の攻撃＋8']);
});

test('戦闘ログの数字も色分けする', () => {
  assert.deepEqual(kinds('スキャナーbot の攻撃:4ダメージ(FWで5防いだ)。'), ['damage:4ダメージ', 'block:FWで5防いだ']);
  assert.deepEqual(kinds('IDSセンサー に検知された。次のターンの帯域−1。'), ['energy:帯域−1']);
});

test('文字はそのまま残す(分けた部分をつなげると元の文になる)', () => {
  const text = '0EN・全ノイズ消去(1枚ごと全体10＆FW5)＋2ドロー＋帯域+1。';
  assert.equal(splitEffectText(text).map((p) => p.text).join(''), text);
});

test('すべてのカードの説明文で、数字が色分けされずに残らない', () => {
  for (const def of Object.values(CARD_DEFINITIONS)) {
    if (def.unplayable) continue;
    for (const stats of [def.levels[1], def.levels[2], ...def.branches]) {
      const leftover = splitEffectText(stats.text).filter((p) => p.kind === 'plain' && /\d/.test(p.text));
      assert.equal(leftover.length, 0, `${def.name}: ${stats.text}`);
    }
  }
});
