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
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  });
  const localRequire = (id) => {
    if (id.startsWith('.')) {
      const target = new URL(id + '.ts', url);
      if (!existsSync(target)) target.pathname += 'x';
      return load(target);
    }
    return require(id);
  };
  runInNewContext('(function(require,module,exports){' + outputText + '\n})', { console })(localRequire, module, module.exports);
  return module.exports;
}

const battle = load(new URL('../src/game/deckbattle/battle.ts', import.meta.url));
const run = load(new URL('../src/game/deckbattle/run.ts', import.meta.url));

/** 手札を指定した戦闘を作る(山札は残りのカード) */
function setup(cards, enemyIds, hand) {
  const deck = cards.map((c, i) => ({ uid: `c${i + 1}`, level: 1, xp: 0, ...c }));
  const state = battle.createBattle({ deck, playerHp: 65, playerMaxHp: 65, enemyIds, seed: 1 });
  const s = JSON.parse(JSON.stringify(state));
  s.hand = hand ?? deck.slice(0, 4).map((c) => c.uid);
  s.drawPile = deck.map((c) => c.uid).filter((u) => !s.hand.includes(u));
  return s;
}

function play(state, uid, target) {
  const r = battle.playCard(state, uid, target);
  assert.equal(r.accepted, true, r.reason);
  return r.state;
}

test('戦闘開始:手札4枚・帯域4・山札6枚、敵は定義どおりのHP', () => {
  const r = run.createRun();
  assert.equal(r.deck.length, 10);
  const s = run.createBattleForCurrentNode(r, 42);
  assert.equal(s.hand.length, 4);
  assert.equal(s.drawPile.length, 6);
  assert.equal(s.player.energy, 4);
  assert.equal(s.player.hp, 65);
  assert.equal(s.enemies[0].hp, 28);
  assert.equal(s.turn, 1);
});

test('同じ種から作った戦闘は、同じ手札になる', () => {
  const r = run.createRun();
  const a = run.createBattleForCurrentNode(r, 7);
  const b = run.createBattleForCurrentNode(r, 7);
  assert.equal(a.hand.join(','), b.hand.join(','));
});

test('攻撃カードで敵のHPが減り、帯域と使用回数が記録される', () => {
  let s = setup([{ defId: 'ssh_brute' }, { defId: 'firewall' }], ['scanner_bot'], ['c1', 'c2']);
  s = play(s, 'c1');
  assert.equal(s.enemies[0].hp, 22);
  assert.equal(s.player.energy, 3);
  assert.equal(s.usesThisBattle.c1, 1);
  assert.equal(s.discard.includes('c1'), true);
});

test('帯域が足りないカード・使えないカード・手札にないカードは却下される', () => {
  const s = setup([{ defId: 'ssh_brute' }, { defId: 'noise' }, { defId: 'firewall' }], ['scanner_bot'], ['c1', 'c2']);
  s.player.energy = 0;
  assert.equal(battle.playCard(s, 'c1').accepted, false);
  assert.equal(battle.playCard(s, 'c2').accepted, false);
  assert.equal(battle.playCard(s, 'c3').accepted, false);
});

test('敵が2体いるときは対象を選ぶ必要があり、2体目は1ターンずらして動く', () => {
  const s = setup([{ defId: 'ssh_brute' }], ['ids_sensor', 'ids_sensor'], ['c1']);
  assert.equal(battle.playCard(s, 'c1').accepted, false);
  const after = play(s, 'c1', 'e2');
  assert.equal(after.enemies[1].hp, 10);
  assert.equal(battle.getEnemyIntent(s.enemies[0]).type, 'attack');
  assert.equal(battle.getEnemyIntent(s.enemies[1]).type, 'detect');
  assert.notEqual(s.enemies[0].name, s.enemies[1].name);
});

test('7章の例:脆弱性特定+並列実行+総当たり連打で (4+8)×3×2 = 72', () => {
  let s = setup(
    [
      { defId: 'port_scan', level: 3, branchId: 'scan_vuln' },
      { defId: 'script_auto', level: 3, branchId: 'auto_parallel' },
      { defId: 'ssh_brute', level: 3, branchId: 'ssh_rapid' },
      { defId: 'ssh_brute' },
    ],
    ['argus'],
  );
  s = play(s, 'c1');
  s = play(s, 'c2');
  s = play(s, 'c3');
  assert.equal(s.enemies[0].hp, 120 - 72);
  assert.equal(s.usesThisBattle.c3, 1, '2回発動しても使用回数は1回');
  // 修正は使い切っている
  assert.equal(s.modifiers.nextAttackBonus, 0);
  assert.equal(s.modifiers.repeatNextAttack, false);
  s = play(s, 'c4');
  assert.equal(s.enemies[0].hp, 48 - 6);
});

test('次の攻撃+N は重ねて足され、防御カードでは消えない', () => {
  let s = setup([{ defId: 'script_auto' }, { defId: 'script_auto' }, { defId: 'firewall' }, { defId: 'ssh_brute' }], ['argus']);
  s = play(s, 'c1');
  s = play(s, 'c2');
  s = play(s, 'c3');
  assert.equal(s.modifiers.nextAttackBonus, 6);
  s.player.energy = 1;
  s = play(s, 'c4');
  assert.equal(s.enemies[0].hp, 120 - 12);
});

test('全体攻撃には「次の攻撃+N」が敵ごとに乗る', () => {
  let s = setup(
    [{ defId: 'script_auto' }, { defId: 'ddos', level: 3, branchId: 'ddos_botnet' }],
    ['ids_sensor', 'ids_sensor'],
    ['c1', 'c2'],
  );
  s = play(s, 'c1');
  s = play(s, 'c2');
  // (12+3) を2体それぞれに → 16-15 = 1
  assert.equal(s.enemies[0].hp, 1);
  assert.equal(s.enemies[1].hp, 1);
});

test('次のカード−1EN はどのカードにも効き、0未満にならない', () => {
  let s = setup(
    [{ defId: 'script_auto', level: 3, branchId: 'auto_macro' }, { defId: 'port_scan' }, { defId: 'ssh_brute' }],
    ['argus'],
    ['c1', 'c2', 'c3'],
  );
  s = play(s, 'c1');
  assert.equal(battle.getPlayCost(s, 'c2'), 0);
  s = play(s, 'c2');
  assert.equal(s.modifiers.nextCardDiscount, 0, '0ENのカードでも割引は消える');
  assert.equal(s.player.energy, 4);
});

test('FWは敵の攻撃を防ぎ、次のプレイヤーのターン開始で消える', () => {
  let s = setup(
    [{ defId: 'firewall' }, { defId: 'firewall' }, { defId: 'ssh_brute' }, { defId: 'ssh_brute' }, { defId: 'ssh_brute' }],
    ['scanner_bot'],
  );
  s = play(s, 'c1');
  assert.equal(s.player.block, 5);
  s = battle.endTurn(s);
  // スキャナーbot の最初の行動は 6 の攻撃 → 1 だけ通る
  assert.equal(s.player.hp, 64);
  assert.equal(s.player.block, 0);
  assert.equal(s.lastEnemyActions[0].kind, 'attack');
  assert.equal(s.lastEnemyActions[0].blocked, 5);
  assert.equal(s.hand.length, 4);
  assert.equal(s.player.energy, 4);
  assert.equal(s.turn, 2);
});

test('反撃は攻撃を全部防いでも発動し、1回で消える', () => {
  let s = setup([{ defId: 'firewall', level: 3, branchId: 'fw_trap' }, { defId: 'firewall' }], ['scanner_bot'], ['c1', 'c2']);
  s = play(s, 'c1');
  s = battle.endTurn(s);
  assert.equal(s.player.hp, 65);
  assert.equal(s.enemies[0].hp, 23);
  assert.equal(s.player.retaliate, 0);
  assert.equal(s.lastEnemyActions.some((a) => a.kind === 'retaliate'), true);
});

test('過熱はFWを無視して3ターン続き、重ねると量が増えてターンが3に戻る', () => {
  let s = setup(
    [{ defId: 'ddos', level: 3, branchId: 'ddos_overload' }, { defId: 'ddos', level: 3, branchId: 'ddos_overload' }],
    ['argus'],
    ['c1'],
  );
  s = play(s, 'c1');
  assert.equal(s.enemies[0].hp, 112);
  assert.equal(s.enemies[0].burn.amount, 4);
  s = battle.endTurn(s); // ARGUS の攻撃 → 過熱4
  assert.equal(s.enemies[0].hp, 108);
  assert.equal(s.enemies[0].burn.turns, 2);
  s = battle.endTurn(s); // FW12 を張るが、過熱は FW を無視
  assert.equal(s.enemies[0].block, 12);
  assert.equal(s.enemies[0].hp, 104);
  s.hand = ['c2'];
  s.player.energy = 1;
  s = play(s, 'c2');
  assert.equal(s.enemies[0].burn.amount, 8);
  assert.equal(s.enemies[0].burn.turns, 3);
});

test('検知されると次のターンの帯域が1減る', () => {
  const s = setup([{ defId: 'ssh_brute' }], ['ids_sensor'], []);
  s.enemies[0].moveIndex = 1;
  const after = battle.endTurn(s);
  assert.equal(after.player.energy, 3);
  assert.equal(after.player.energyPenalty, 0);
  const next = battle.endTurn(after);
  assert.equal(next.player.energy, 4);
});

test('ノイズは捨て札に入り、使えず、戦闘後のデッキには残らない', () => {
  const s = setup([{ defId: 'ssh_brute' }], ['argus'], []);
  s.enemies[0].moveIndex = 2;
  const after = battle.endTurn(s);
  const noise = Object.values(after.cards).filter((c) => c.defId === 'noise');
  assert.equal(noise.length, 2);
  assert.equal(battle.deckAfterBattle(after).length, 1);
  assert.equal(battle.playCard({ ...after, hand: [noise[0].uid] }, noise[0].uid).accepted, false);
});

test('ボスはHPが半分以下になると行動が変わる', () => {
  let s = setup([{ defId: 'ssh_brute', level: 3, branchId: 'ssh_breaker' }], ['argus'], ['c1']);
  s.enemies[0].hp = 70;
  s.enemies[0].moveIndex = 1;
  s = play(s, 'c1');
  assert.equal(s.enemies[0].phase, 2);
  assert.equal(s.enemies[0].moveIndex, 0);
  const intent = battle.getEnemyIntent(s.enemies[0]);
  assert.equal(intent.type, 'attack');
  assert.equal(intent.hits, 2);
});

test('攻撃力の強化は予告と実際の攻撃に反映される', () => {
  const s = setup([{ defId: 'ssh_brute' }], ['firewall_ai'], []);
  s.enemies[0].moveIndex = 1;
  const after = battle.endTurn(s);
  assert.equal(after.enemies[0].attackBonus, 3);
  assert.equal(battle.getEnemyIntent(after.enemies[0]).amount, 15);
  const next = battle.endTurn(after);
  assert.equal(next.player.hp, 65 - 15);
});

test('回復は最大HPを超えない', () => {
  let s = setup([{ defId: 'session_hijack', level: 3, branchId: 'hijack_token' }], ['argus'], ['c1']);
  s.player.hp = 64;
  s = play(s, 'c1');
  assert.equal(s.player.hp, 65);
});

test('敵を全部倒すと勝利、HPが0になると敗北し、それ以上操作できない', () => {
  let s = setup([{ defId: 'ssh_brute' }], ['scanner_bot'], ['c1']);
  s.enemies[0].hp = 5;
  s = play(s, 'c1');
  assert.equal(s.status, 'won');
  assert.equal(battle.endTurn(s), s);

  const l = setup([{ defId: 'ssh_brute' }], ['scanner_bot'], []);
  l.player.hp = 3;
  const lost = battle.endTurn(l);
  assert.equal(lost.status, 'lost');
  assert.equal(lost.player.hp, 0);
});

test('山札が尽きたら捨て札をシャッフルして引き直す', () => {
  const s = setup([{ defId: 'ssh_brute' }, { defId: 'ssh_brute' }, { defId: 'firewall' }], ['argus'], ['c1', 'c2', 'c3']);
  s.drawPile = [];
  const after = battle.endTurn(s);
  assert.equal(after.hand.length, 3);
  assert.equal(after.discard.length, 0);
});
