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


// ---------- M2 / M3 テスト ----------

test('経験値は1枚ごとに増え、1回の戦闘で3を超えない(通常モード)', () => {
  const r = run.createRun({ fastGrowth: false });
  const b = battle.createBattle({
    deck: r.deck,
    playerHp: 50,
    playerMaxHp: 65,
    enemyIds: ['scanner_bot'],
    seed: 1,
  });
  b.status = 'won';
  b.usesThisBattle = { c1: 5, c2: 1 }; // c1を5回使っても上限3、c2は1+1=2
  const res = run.applyBattleResult(r, b, 10);
  const c1 = res.run.deck.find((c) => c.uid === 'c1');
  const c2 = res.run.deck.find((c) => c.uid === 'c2');
  const c3 = res.run.deck.find((c) => c.uid === 'c3');
  assert.equal(c1.xp, 3);
  assert.equal(c1.level, 2);
  assert.equal(c2.xp, 2);
  assert.equal(c2.level, 2);
  assert.equal(c3.xp, 0);
  assert.equal(c3.level, 1);
  assert.equal(res.healed, 6);
  assert.equal(res.run.hp, 56);
  assert.equal(res.rewardChoices.length, 3);
  assert.equal(new Set(res.rewardChoices).size, 3);
});

test('試用高速成長モードでは1回使うだけで即Lv.3になり進化先を選べる', () => {
  const r = run.createRun({ fastGrowth: true });
  const b = battle.createBattle({
    deck: r.deck,
    playerHp: 65,
    playerMaxHp: 65,
    enemyIds: ['scanner_bot'],
    seed: 2,
  });
  b.status = 'won';
  b.usesThisBattle = { c1: 1 };
  const res = run.applyBattleResult(r, b, 20);
  const c1 = res.run.deck.find((c) => c.uid === 'c1');
  assert.equal(c1.level, 3);
  assert.equal(res.run.pendingEvolutions.length, 1);
  assert.equal(res.run.pendingEvolutions[0], 'c1');
});

test('同じSSH辞書攻撃2枚を別々の進化先にでき、進化を選び終わるまで次のマスに進めない', () => {
  let r = run.createRun({ fastGrowth: false });
  // c1, c2 に経験値+5を付与してどちらもLv.3にする
  r.deck[0] = { ...r.deck[0], xp: 5, level: 3 };
  r.deck[1] = { ...r.deck[1], xp: 5, level: 3 };
  r.pendingEvolutions = ['c1', 'c2'];

  assert.throws(() => run.advanceToNextNode(r));
  r = run.chooseEvolution(r, 'c1', 'ssh_rapid');
  assert.throws(() => run.advanceToNextNode(r));
  r = run.chooseEvolution(r, 'c2', 'ssh_breaker');
  assert.equal(r.pendingEvolutions.length, 0);

  const next = run.advanceToNextNode(r);
  assert.equal(next.nodeIndex, 1);
  assert.equal(next.deck[0].branchId, 'ssh_rapid');
  assert.equal(next.deck[1].branchId, 'ssh_breaker');

  const nextBattle = battle.createBattle({
    deck: next.deck,
    playerHp: next.hp,
    playerMaxHp: next.maxHp,
    enemyIds: ['scanner_bot'],
    seed: 3,
  });
  assert.equal(battle.getCardStats(nextBattle.cards.c1).name, '総当たり連打');
  assert.equal(battle.getCardStats(nextBattle.cards.c2).name, '認証突破');
});

test('イベントマスでTYPE A/Bから重複せずに出題し、正解EXP+2・不正解罰・パッチボーナスが動く', () => {
  let r = run.createRun({ fastGrowth: false });
  const q1 = run.pickEventQuestion(r, 'vuln_check', 7);
  assert.ok(q1.questionType.startsWith('TYPE A'));

  const fail1 = run.resolveEventQuiz(r, 'vuln_check', q1.id, false);
  assert.equal(fail1.hpLost, 5);
  assert.equal(fail1.run.hp, 60);
  assert.ok(fail1.run.askedQuestionIds.includes(q1.id));

  const q1b = run.pickEventQuestion(fail1.run, 'vuln_check', 7);
  assert.notEqual(q1b.id, q1.id);

  const q2 = run.pickEventQuestion(fail1.run, 'patch', 9);
  assert.ok(q2.questionType.startsWith('TYPE B'));

  const fail2 = run.resolveEventQuiz(fail1.run, 'patch', q2.id, false);
  assert.equal(fail2.hpLost, 0);

  const ok2 = run.resolveEventQuiz(fail1.run, 'patch', q2.id, true);
  const xpRes = run.applyEventXp ? null : run.applyQuizXpReward(ok2.run, 'c1');
  assert.equal(xpRes.run.deck[0].xp, 2);
  assert.equal(xpRes.run.deck[0].level, 2);

  const healed = run.applyPatchBonus(xpRes.run, { type: 'heal' });
  assert.equal(healed.hp, 65);

  const trimmed = run.applyPatchBonus(xpRes.run, { type: 'remove', cardUid: 'c2' });
  assert.equal(trimmed.deck.length, 9);
});

test('6マス目のボス(ARGUS)に勝つとラン勝利になる', () => {
  const r = run.createRun({ fastGrowth: false });
  r.nodeIndex = 5;
  const b = run.createBattleForCurrentNode(r, 11);
  b.status = 'won';
  const res = run.applyBattleResult(r, b, 12);
  assert.equal(res.run.status, 'won');
  assert.equal(res.rewardChoices.length, 0);
});


// ---------- 拡張機能テスト(12種カード・レリック・解析コンボ・エリート・削除) ----------

test('SQLインジェクションは敵FWを貫通し、バックドア常駐は毎ターンFW+3を付与する', () => {
  let s = setup([{ defId: 'sql_injection' }, { defId: 'backdoor' }], ['scanner_bot'], ['c1', 'c2']);
  s.enemies[0].block = 10;
  s = play(s, 'c1');
  assert.equal(s.enemies[0].hp, 28 - 5);
  assert.equal(s.enemies[0].block, 10, 'FWを削らず貫通する');

  s = play(s, 'c2');
  assert.equal(s.player.turnBlockBonus, 3);
  const nextTurn = battle.endTurn(s);
  assert.equal(nextTurn.player.block, 3);
});

test('解析コンボ:補助カード後に攻撃カードを使うと1ターン1回だけ帯域+1される', () => {
  let s = setup([{ defId: 'port_scan' }, { defId: 'ssh_brute' }, { defId: 'ssh_brute' }], ['argus'], ['c1', 'c2', 'c3']);
  s = play(s, 'c1'); // 0EN -> reconCombo = 'ready'
  assert.equal(s.modifiers.reconCombo, 'ready');
  s = play(s, 'c2'); // 1EN消費だがコンボ+1ENで実質4EN維持
  assert.equal(s.modifiers.reconCombo, 'done');
  assert.equal(s.player.energy, 4);
  s = play(s, 'c3'); // 同ターン2回目は発動しない
  assert.equal(s.player.energy, 3);
});

test('パッシブ装備(暗号化VPN・ゼロトラスト鍵・パケットキャッシュ・自動スクレイパー)が戦闘に反映される', () => {
  const s = battle.createBattle({
    deck: [
      { uid: 'c1', defId: 'ssh_brute', level: 1, xp: 0 },
      { uid: 'c2', defId: 'ssh_brute', level: 1, xp: 0 },
      { uid: 'c3', defId: 'ssh_brute', level: 1, xp: 0 },
      { uid: 'c4', defId: 'ssh_brute', level: 1, xp: 0 },
      { uid: 'c5', defId: 'ssh_brute', level: 1, xp: 0 },
    ],
    playerHp: 65,
    playerMaxHp: 65,
    enemyIds: ['argus'],
    seed: 1,
    relics: ['encrypted_vpn', 'auto_scraper', 'packet_cache', 'zero_trust_key'],
  });
  assert.equal(s.player.block, 3);
  assert.equal(s.player.energy, 5);
  assert.equal(s.hand.length, 5);
  assert.equal(s.modifiers.nextAttackBonus, 3);
});

test('エリートルート(ゼロトラストゲート)はEXP2倍＆レアカード確定報酬になる', () => {
  let r = run.createRun({ fastGrowth: false });
  r.nodeIndex = 4;
  r.currentBattleElite = true;
  const b = run.createBattleForCurrentNode(r, 5, true);
  assert.equal(b.enemies[0].defId, 'zero_trust_gate');
  b.status = 'won';
  b.usesThisBattle = { c1: 1 }; // 通常2EXP -> エリートで4EXP
  const res = run.applyBattleResult(r, b, 15);
  assert.equal(res.run.deck[0].xp, 4);
  assert.ok(res.rewardChoices.some((id) => id === 'zero_day' || id === 'backdoor'));

  const compressed = run.removeCardFromDeck(res.run, 'c2');
  assert.equal(compressed.deck.length, 9);
});
