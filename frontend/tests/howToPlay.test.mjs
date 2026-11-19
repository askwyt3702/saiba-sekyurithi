// 遊び方の説明(game/deckbattle/howToPlay.ts)のテスト。説明の数値がルールの定数とずれないことを確かめる。
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
  runInNewContext('(function(require,module,exports){' + outputText + '\n})', { console, JSON, Math, Set })(localRequire, module, module.exports);
  return module.exports;
}

const htp = load(new URL('../src/game/deckbattle/howToPlay.ts', import.meta.url));
const battle = load(new URL('../src/game/deckbattle/battle.ts', import.meta.url));
const run = load(new URL('../src/game/deckbattle/run.ts', import.meta.url));

const allText = (pages) => pages.map((p) => [p.title, p.lead, ...p.items.map((i) => `${i.term} ${i.text}`)].join('\n')).join('\n');

test('遊び方は6ページで、どのページにも説明がある', () => {
  const pages = htp.buildHowToPlayPages();
  assert.equal(pages.length, 6);
  for (const page of pages) {
    assert.ok(page.title && page.icon && page.lead, page.title);
    assert.ok(page.items.length >= 3, page.title);
    assert.equal(new Set(page.items.map((i) => i.term)).size, page.items.length, `${page.title} の用語が重複している`);
  }
});

test('説明の数値はルールの定数から作られている', () => {
  const text = allText(htp.buildHowToPlayPages());
  assert.ok(text.includes(`毎ターン${battle.ENERGY_PER_TURN}に戻り`));
  assert.ok(text.includes(`毎ターン${battle.DRAW_PER_TURN}枚引く`));
  assert.ok(text.includes(`経験値${run.XP_TO_LV2}で自動で強くなる`));
  assert.ok(text.includes(`経験値${run.XP_TO_LV3}で`));
  assert.ok(text.includes(`最大${run.PLAYER_MAX_HP}`));
  assert.ok(text.includes(`${run.STARTING_RECON_COINS}枚で始まり`));
  assert.ok(text.includes(`${run.DEFAULT_RUN_NODES.length}つのマス`));
});

test('マスの順番の説明に、すべてのマスが出てくる', () => {
  const route = htp.buildHowToPlayPages()[0].items.find((i) => i.term === 'マスの順番').text;
  run.DEFAULT_RUN_NODES.forEach((_, index) => assert.ok(route.includes(`${index + 1}. `), `${index + 1}番目のマス`));
  assert.ok(route.includes('闇市'));
  assert.ok(route.includes('ボス'));
});

test('説明に必要な用語がそろっている', () => {
  const terms = htp.buildHowToPlayPages().flatMap((p) => p.items.map((i) => i.term)).join(' ');
  for (const word of ['帯域', 'FW', '弱点', '脆弱', 'ジャミング', '過熱', '反撃', '貫通', '解析コンボ', 'ノイズ', '解析コイン', '闇市', 'カード基地']) {
    assert.ok(terms.includes(word), word);
  }
});

test('一度見たら、次からは自動で出ない', () => {
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  assert.equal(htp.hasSeenHowToPlay(storage), false);
  htp.markHowToPlaySeen(storage);
  assert.equal(htp.hasSeenHowToPlay(storage), true);
  assert.equal(htp.hasSeenHowToPlay(null), false, 'ストレージが使えないときは毎回出す');
});
