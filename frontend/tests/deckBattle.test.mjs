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
const { ENEMY_DEFINITIONS } = load(new URL('../src/game/deckbattle/enemies.ts', import.meta.url));

// 敵の数値は調整で変わるので、テストでは定義から読む
const hp = (id) => ENEMY_DEFINITIONS[id].maxHp;
const move = (id, index) => ENEMY_DEFINITIONS[id].pattern[index];

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

test('戦闘開始:手札・帯域・山札は定数どおり、敵は定義どおりのHP', () => {
  const r = run.createRun();
  assert.equal(r.deck.length, 10);
  const s = run.createBattleForCurrentNode(r, 42);
  assert.equal(s.hand.length, battle.DRAW_PER_TURN);
  assert.equal(s.drawPile.length, r.deck.length - battle.DRAW_PER_TURN);
  assert.equal(s.player.energy, battle.ENERGY_PER_TURN);
  assert.equal(s.player.hp, 65);
  assert.equal(s.enemies[0].hp, hp('scanner_bot'));
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
  assert.equal(s.enemies[0].hp, hp('scanner_bot') - 6);
  assert.equal(s.player.energy, battle.ENERGY_PER_TURN - 1);
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
  assert.equal(after.enemies[1].hp, hp('ids_sensor') - 6);
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
  const combo = battle.playCard(s, 'c3');
  assert.equal(combo.accepted, true);
  assert.deepEqual(Array.from(combo.attackFrames, (frame) => frame.enemies[0].hp), [
    12, 24, 36, 48, 60, 72,
  ].map((damage) => hp('argus') - damage));
  s = combo.state;
  assert.equal(s.enemies[0].hp, hp('argus') - 72);
  assert.equal(s.usesThisBattle.c3, 1, '2回発動しても使用回数は1回');
  // 修正は使い切っている
  assert.equal(s.modifiers.nextAttackBonus, 0);
  assert.equal(s.modifiers.repeatNextAttack, false);
  s = play(s, 'c4');
  assert.equal(s.enemies[0].hp, hp('argus') - 72 - 6);
});

test('次の攻撃+N は重ねて足され、防御カードでは消えない', () => {
  let s = setup([{ defId: 'script_auto' }, { defId: 'script_auto' }, { defId: 'firewall' }, { defId: 'ssh_brute' }], ['argus']);
  s = play(s, 'c1');
  s = play(s, 'c2');
  s = play(s, 'c3');
  assert.equal(s.modifiers.nextAttackBonus, 6);
  s.player.energy = 1;
  s = play(s, 'c4');
  assert.equal(s.enemies[0].hp, hp('argus') - 12);
});

test('全体攻撃には「次の攻撃+N」が敵ごとに乗る', () => {
  let s = setup(
    [{ defId: 'script_auto' }, { defId: 'ddos', level: 3, branchId: 'ddos_botnet' }],
    ['ids_sensor', 'ids_sensor'],
    ['c1', 'c2'],
  );
  s = play(s, 'c1');
  s = play(s, 'c2');
  // (12+3) を2体それぞれに
  assert.equal(s.enemies[0].hp, hp('ids_sensor') - 15);
  assert.equal(s.enemies[1].hp, hp('ids_sensor') - 15);
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
  assert.equal(s.player.energy, battle.ENERGY_PER_TURN);
});

test('FWは敵の攻撃を防ぎ、次のプレイヤーのターン開始で消える', () => {
  let s = setup(
    [{ defId: 'firewall' }, { defId: 'firewall' }, { defId: 'ssh_brute' }, { defId: 'ssh_brute' }, { defId: 'ssh_brute' }],
    ['scanner_bot'],
  );
  s = play(s, 'c1');
  assert.equal(s.player.block, 5);
  s = battle.endTurn(s);
  // スキャナーbot の最初の行動は攻撃 → FW5 を引いた分だけ通る
  assert.equal(s.player.hp, 65 - (move('scanner_bot', 0).amount - 5));
  assert.equal(s.player.block, 0);
  assert.equal(s.lastEnemyActions[0].kind, 'attack');
  assert.equal(s.lastEnemyActions[0].blocked, 5);
  // デッキは5枚なので、引ける枚数はデッキの枚数まで
  assert.equal(s.hand.length, Math.min(battle.DRAW_PER_TURN, 5));
  assert.equal(s.player.energy, battle.ENERGY_PER_TURN);
  assert.equal(s.turn, 2);
});

test('反撃は攻撃を全部防いでも発動し、1回で消える', () => {
  let s = setup([{ defId: 'firewall', level: 3, branchId: 'fw_trap' }, { defId: 'firewall' }], ['scanner_bot'], ['c1', 'c2']);
  s = play(s, 'c1');
  s = play(s, 'c2');
  assert.ok(s.player.block >= move('scanner_bot', 0).amount, '攻撃を全部防げる FW がある');
  s = battle.endTurn(s);
  assert.equal(s.player.hp, 65);
  assert.equal(s.enemies[0].hp, hp('scanner_bot') - 5);
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
  assert.equal(s.enemies[0].hp, hp('argus') - 8);
  assert.equal(s.enemies[0].burn.amount, 4);
  s = battle.endTurn(s); // ARGUS の攻撃 → 過熱4
  assert.equal(s.enemies[0].hp, hp('argus') - 12);
  assert.equal(s.enemies[0].burn.turns, 2);
  s = battle.endTurn(s); // FW を張るが、過熱は FW を無視
  assert.equal(s.enemies[0].block, move('argus', 1).amount);
  assert.equal(s.enemies[0].hp, hp('argus') - 16);
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
  assert.equal(after.player.energy, battle.ENERGY_PER_TURN - 1);
  assert.equal(after.player.energyPenalty, 0);
  const next = battle.endTurn(after);
  assert.equal(next.player.energy, battle.ENERGY_PER_TURN);
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
  const strengthened = move('firewall_ai', 2).amount + 3;
  assert.equal(battle.getEnemyIntent(after.enemies[0]).amount, strengthened);
  const next = battle.endTurn(after);
  assert.equal(next.player.hp, 65 - strengthened);
});

test('敵の連撃は1ヒットずつFWとHPを記録する', () => {
  const s = setup([{ defId: 'firewall' }], ['ids_sensor']);
  const intent = battle.getEnemyIntent(s.enemies[0]);
  s.player.block = intent.amount;
  const after = battle.endTurn(s);
  assert.deepEqual(Array.from(after.lastEnemyActions, (hit) => [
    hit.hit, hit.hits, hit.damage, hit.blocked, hit.after.playerHp,
  ]), [
    [1, 2, 0, intent.amount, 65],
    [2, 2, intent.amount, 0, 65 - intent.amount],
  ]);
  assert.equal(after.player.hp, 65 - intent.amount);
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

test('イベントの事前調査で除外される選択肢は必ず不正解であり、進化プレビューとLv.3 MAX保護が機能する', () => {
  let r = run.createRun({ fastGrowth: false });
  const q1 = run.pickEventQuestion(r, 'vuln_check', 15);
  assert.ok(q1.scanTerminalLog.length > 0);
  const filteredId = run.getFilteredOutQuizChoiceId(q1);
  assert.ok(filteredId);
  const filteredChoice = q1.choices.find((c) => c.id === filteredId);
  assert.equal(filteredChoice.isCorrect, false);

  // c1 (Lv.1, xp 0) -> +2 EXP で Lv.2 にレベルアップ予測
  const p1 = run.previewQuizXpReward(r, 'c1');
  assert.equal(p1.isMaxed, false);
  assert.equal(p1.willLevelUp, true);
  assert.equal(p1.willEvolve, false);
  assert.equal(p1.nextLevel, 2);

  // c2 を Lv.2 (xp 3) にすると、+2 EXP で Lv.3 進化予測
  r.deck[1] = { ...r.deck[1], xp: 3, level: 2 };
  const p2 = run.previewQuizXpReward(r, 'c2');
  assert.equal(p2.willLevelUp, true);
  assert.equal(p2.willEvolve, true);
  assert.equal(p2.nextLevel, 3);

  // c3 を Lv.3 MAX (branchId 設定済み) にすると、選択不可(isMaxed)になり誤付与がブロックされる
  r.deck[2] = { ...r.deck[2], xp: 5, level: 3, branchId: 'ssh_rapid' };
  const p3 = run.previewQuizXpReward(r, 'c3');
  assert.equal(p3.isMaxed, true);
  assert.throws(() => run.applyQuizXpReward(r, 'c3'));
});

test('最後のマスのボス(ARGUS)に勝つとラン勝利になる', () => {
  const r = run.createRun({ fastGrowth: false });
  r.nodeIndex = r.nodes.length - 1;
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
  assert.equal(s.enemies[0].hp, hp('scanner_bot') - 5);
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
  s = play(s, 'c2'); // 1EN消費だがコンボ+1ENで帯域は減らない
  assert.equal(s.modifiers.reconCombo, 'done');
  assert.equal(s.player.energy, battle.ENERGY_PER_TURN);
  s = play(s, 'c3'); // 同ターン2回目は発動しない
  assert.equal(s.player.energy, battle.ENERGY_PER_TURN - 1);
});

test('適応型フィルターは購入後の戦闘で、解析コンボに1ターン1回だけFWを追加する', () => {
  const base = { ...run.createRun(), reconCoins: 3 };
  const beforePurchase = run.createBattleForCurrentNode(base, 1);
  const atShop = { ...base, nodeIndex: base.nodes.findIndex((node) => node.kind === 'shop') };
  const purchased = run.spendCoinShop(atShop, { type: 'relic', relicId: 'adaptive_filter' });
  const nextBattleIndex = purchased.nodes.findIndex((node, index) => index > purchased.nodeIndex && node.kind === 'battle');
  let s = run.createBattleForCurrentNode({ ...purchased, nodeIndex: nextBattleIndex }, 1);
  assert.equal(beforePurchase.relics.includes('adaptive_filter'), false);
  assert.equal(purchased.reconCoins, 0);
  const utility = purchased.deck.find((card) => card.defId === 'port_scan').uid;
  const attacks = purchased.deck.filter((card) => card.defId === 'ssh_brute').map((card) => card.uid);
  s.hand = [utility, ...attacks.slice(0, 2)];
  s.drawPile = s.drawPile.filter((id) => !s.hand.includes(id));
  s = play(s, utility);
  assert.equal(s.player.block, 0);
  s = play(s, attacks[0], s.enemies[0].uid);
  assert.equal(s.player.energy, battle.ENERGY_PER_TURN);
  assert.equal(s.player.block, 3);
  s = play(s, attacks[1], s.enemies[0].uid);
  assert.equal(s.player.block, 3);
});

test('証跡ラボのクイズ報酬はプレビューと一致し、通常成長でEXP2のカードが進化する', () => {
  const r = run.grantRelic(run.createRun(), 'forensics_lab');
  const card = r.deck[0];
  card.level = 2;
  card.xp = 2;
  const preview = run.previewQuizXpReward(r, card.uid);
  const result = run.applyQuizXpReward(r, card.uid);
  assert.equal(preview.xpDelta, 3);
  assert.equal(preview.willEvolve, true);
  assert.equal(result.gain.xpAdded, preview.xpDelta);
  assert.ok(result.run.pendingEvolutions.includes(card.uid));
  assert.equal(run.getQuizXpReward({ ...r, fastGrowth: true }), 5);
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
  assert.equal(s.player.energy, battle.ENERGY_PER_TURN + 1);
  assert.equal(s.hand.length, 5);
  assert.equal(s.modifiers.nextAttackBonus, 3);
});

test('エリートルート(ゼロトラストゲート)はEXP2倍＆レアカード確定報酬になる', () => {
  let r = run.createRun({ fastGrowth: false });
  r.nodeIndex = r.nodes.findIndex((node) => node.kind === 'battle' && node.eliteEnemyIds);
  r.currentBattleElite = true;
  const b = run.createBattleForCurrentNode(r, 5, true);
  assert.equal(b.enemies[0].defId, 'zero_trust_gate');
  b.status = 'won';
  b.usesThisBattle = { c1: 1 }; // 通常2EXP -> エリートで4EXP
  const res = run.applyBattleResult(r, b, 15);
  assert.equal(res.run.deck[0].xp, 4);
  assert.ok(res.rewardChoices.some((id) => battle.getCardDefinition(id).rarity === 'rare'));

  const compressed = run.removeCardFromDeck(res.run, 'c2');
  assert.equal(compressed.deck.length, 9);
});


test('解析コインは敵撃破時に約20%・エリート撃破で確定ドロップし、事前調査で消費できる', () => {
  const baseRun = run.createRun({ fastGrowth: false });
  assert.equal(baseRun.reconCoins, 2);
  assert.throws(() => run.spendReconCoin({ ...baseRun, reconCoins: 0 }));

  // エリート撃破は確定+1
  const eliteIndex = baseRun.nodes.findIndex((node) => node.kind === 'battle' && node.eliteEnemyIds);
  const eliteRun = { ...baseRun, nodeIndex: eliteIndex, currentBattleElite: true };
  const eliteBattle = run.createBattleForCurrentNode(eliteRun, 1, true);
  eliteBattle.status = 'won';
  eliteBattle.enemies.forEach((e) => { e.hp = 0; });
  const eliteRes = run.applyBattleResult(eliteRun, eliteBattle, 5);
  assert.equal(eliteRes.coinsDropped, 1);
  assert.equal(eliteRes.run.reconCoins, 3);

  const afterSpend = run.spendReconCoin(eliteRes.run);
  assert.equal(afterSpend.reconCoins, 2);

  // 通常戦闘100回シミュレーションでドロップ率が20%前後になることを確認
  let drops = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const b = run.createBattleForCurrentNode(baseRun, seed);
    b.status = 'won';
    b.enemies.forEach((e) => { e.hp = 0; });
    drops += run.applyBattleResult(baseRun, b, seed * 7).coinsDropped;
  }
  assert.ok(drops >= 10 && drops <= 35, `expected ~20 drops out of 100, got ${drops}`);
});


test('カード基地プロフィール:図鑑・弱点ノート復習・ボーナスコイン・戦績・実績が正しく動く', () => {
  const profileMod = load(new URL('../src/game/deckbattle/profile.ts', import.meta.url));
  const mem = new Map();
  const storage = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => mem.set(k, v),
  };

  let p = profileMod.loadDeckProfile(storage);
  assert.equal(p.stats.runsPlayed, 0);
  assert.equal(p.bonusStartCoins, 0);

  // 間違えた問題を弱点ノートへ記録
  const r = run.createRun({ fastGrowth: false });
  const q = run.pickEventQuestion(r, 'vuln_check', 3);
  p = profileMod.recordQuizOutcome(p, q.id, false, 1);
  assert.ok(p.wrongQuestionIds.includes(q.id));

  // 弱点ノートで復習正解 -> ノートから外れ、次回開始コイン+1 & 実績「弱点克服」解除
  p = profileMod.resolveWeaknessReview(p, q.id, true);
  assert.ok(!p.wrongQuestionIds.includes(q.id));
  assert.equal(p.bonusStartCoins, 1);
  assert.ok(p.achievements.includes('weakness_cleared'));

  // 3問連続正解 & エリート撃破 & ラン勝利で実績解除
  p = profileMod.recordQuizOutcome(p, q.id, true, 3);
  p = profileMod.recordEliteDefeat(p);
  p = profileMod.recordRunResult(p, { ...r, status: 'won' });
  assert.ok(p.achievements.includes('quiz_streak_3'));
  assert.ok(p.achievements.includes('elite_slayer'));
  assert.ok(p.achievements.includes('first_clear'));

  profileMod.saveDeckProfile(p, storage);
  const reloaded = profileMod.loadDeckProfile(storage);
  assert.equal(reloaded.stats.runsWon, 1);

  const consumed = profileMod.consumeBonusStartCoins(reloaded);
  assert.equal(consumed.coins, 1);
  assert.equal(consumed.profile.bonusStartCoins, 0);
});


test('常備ツール(0EN)・弱点1.5倍・脆弱1.5倍・ジャミング-30%・コイン闇市ショップが動く', () => {
  // 1. 弱点1.5倍: firewall_ai の弱点は pierce -> sql_injection(5) は 7 ダメージ
  let s = setup([{ defId: 'sql_injection' }], ['firewall_ai'], ['c1']);
  s = play(s, 'c1');
  assert.equal(s.enemies[0].hp, hp('firewall_ai') - 7);

  // 2. 常備ツール: jammer_pulse で敵全体に脆弱2T + ジャミング2T
  s.tools = ['jammer_pulse', 'overclock'];
  const afterPulse = battle.activateBattleTool(s, 0);
  assert.equal(afterPulse.accepted, true);
  assert.equal(afterPulse.state.tools.length, 1);
  assert.equal(afterPulse.state.enemies[0].vulnerable, 2);
  assert.equal(afterPulse.state.enemies[0].jammed, 2);
  // ジャミングで攻撃 -30%(切り捨て)
  assert.equal(battle.getEnemyIntent(afterPulse.state.enemies[0]).amount, Math.floor(move('firewall_ai', 0).amount * 0.7));

  // 脆弱中はダメージ1.5倍
  let s2 = setup([{ defId: 'ssh_brute' }], ['scanner_bot'], ['c1']);
  s2.enemies[0].vulnerable = 2;
  s2 = play(s2, 'c1');
  assert.equal(s2.enemies[0].hp, hp('scanner_bot') - 9);

  // 3. コイン闇市ショップ: 回復(1)・ツール補充(1)・削除(2)・レリック(3)
  let r = run.createRun({ fastGrowth: false });
  const shopIndex = r.nodes.findIndex((node) => node.kind === 'shop');
  r = { ...r, nodeIndex: shopIndex, hp: 40, reconCoins: 7, tools: [] };
  r = run.spendCoinShop(r, { type: 'heal' });
  assert.equal(r.hp, 52);
  assert.equal(r.reconCoins, 6);
  r = run.spendCoinShop(r, { type: 'tool', toolId: 'overclock' });
  assert.equal(r.tools.length, 1);
  assert.equal(r.reconCoins, 5);
  r = run.spendCoinShop(r, { type: 'remove', cardUid: 'c1' });
  assert.equal(r.deck.length, 9);
  assert.equal(r.reconCoins, 3);
  r = run.spendCoinShop(r, { type: 'relic', relicId: 'encrypted_vpn' });
  assert.ok(r.relics.includes('encrypted_vpn'));
  assert.equal(r.reconCoins, 0);
});

test('16マスは戦闘7・イベント4・闇市1・休憩3と最後のボスで構成される', () => {
  const route = run.createRun().nodes;
  assert.deepEqual(Array.from(route, (node) => node.kind), [
    'battle', 'event', 'battle', 'rest', 'battle', 'mystery', 'battle', 'shop',
    'event', 'rest', 'battle', 'mystery', 'battle', 'battle', 'rest', 'boss',
  ]);
  assert.ok(route[6].eliteEnemyIds?.length);
  assert.equal(route.at(-1).enemyIds[0], 'argus');
});

test('8マス目の闇市で開始コインを使え、購入結果を持って進める', () => {
  const start = run.createRun();
  const shop = { ...start, nodeIndex: 7 };
  assert.equal(start.reconCoins, 2);
  assert.equal(shop.nodes[shop.nodeIndex].kind, 'shop');
  assert.throws(() => run.spendCoinShop(start, { type: 'heal' }), /闇市マス/);
  assert.throws(() => run.createBattleForCurrentNode(shop, 1), /not a battle/);
  const purchase = run.spendCoinShop(shop, { type: 'remove', cardUid: 'c1' });
  assert.equal(purchase.reconCoins, 0);
  assert.throws(() => run.spendCoinShop(purchase, { type: 'heal' }), /足りません/);
  const next = run.advanceToNextNode(purchase);
  assert.equal(next.nodes[next.nodeIndex].eventId, 'patch');
  const battleIndex = next.nodes.findIndex((node, index) => index > next.nodeIndex && node.kind === 'battle');
  const nextBattle = run.createBattleForCurrentNode({ ...next, nodeIndex: battleIndex }, 1);
  assert.equal(nextBattle.enemies[0].defId, 'firewall_ai');
  assert.equal(nextBattle.cards.c1, undefined);
  assert.throws(() => run.spendCoinShop(next, { type: 'heal' }), /闇市マス/);
});

test('脆弱は狙った敵だけに付き、その敵を倒したときはほかの敵に移らない', () => {
  let s = setup([{ defId: 'sql_injection', level: 2 }, { defId: 'sql_injection', level: 2 }], ['ids_sensor', 'ids_sensor'], ['c1', 'c2']);
  s = play(s, 'c1', 'e1');
  assert.equal(s.enemies[0].vulnerable, 2);
  assert.equal(s.enemies[1].vulnerable, undefined);
  s.enemies[1].hp = 3;
  s = play(s, 'c2', 'e2');
  assert.equal(s.enemies[1].hp, 0);
  assert.equal(s.enemies[0].vulnerable, 2, '倒した敵の分の脆弱が、残った敵に足されない');
});

test('対象のないカードのジャミングは敵全体に付く', () => {
  let s = setup([{ defId: 'arp_spoof' }], ['ids_sensor', 'ids_sensor'], ['c1']);
  s = play(s, 'c1');
  assert.equal(s.enemies[0].jammed, 1);
  assert.equal(s.enemies[1].jammed, 1);
});


test('40種類のカード(コモン20・アンコモン12・レア8)と差別化された9種の新効果が正しく動く', () => {
  const cardsMod = load(new URL('../src/game/deckbattle/cards.ts', import.meta.url));
  assert.equal(cardsMod.REWARD_CARD_IDS.length, 40);
  const commons = cardsMod.REWARD_CARD_IDS.filter((id) => cardsMod.CARD_DEFINITIONS[id].rarity === 'common');
  const uncommons = cardsMod.REWARD_CARD_IDS.filter((id) => cardsMod.CARD_DEFINITIONS[id].rarity === 'uncommon');
  const rares = cardsMod.REWARD_CARD_IDS.filter((id) => cardsMod.CARD_DEFINITIONS[id].rarity === 'rare');
  assert.equal(commons.length, 20);
  assert.equal(uncommons.length, 12);
  assert.equal(rares.length, 8);
  for (const id of rares) {
    assert.equal(cardsMod.CARD_DEFINITIONS[id].branches.length, 3, `${id} should have 3 branches`);
  }

  // 1. doubleBlock + shieldBash (fortress_double + shield_slam)
  let s = setup([{ defId: 'fortress_double' }, { defId: 'shield_slam' }], ['scanner_bot'], ['c1', 'c2']);
  s.player.block = 4;
  s = play(s, 'c1'); // (4+3)*2 = 14
  assert.equal(s.player.block, 14);
  s = play(s, 'c2'); // +3 -> 17 FW, 17 damage
  assert.equal(s.player.block, 17);
  assert.equal(s.enemies[0].hp, hp('scanner_bot') - 17);

  // 2. stripBlock(steal) + clearEnemyBuff (csrf_forge + privilege_reset)
  let s2 = setup([{ defId: 'csrf_forge' }, { defId: 'privilege_reset' }], ['firewall_ai'], ['c1', 'c2']);
  s2.enemies[0].block = 10;
  s2.enemies[0].attackBonus = 6;
  s2 = play(s2, 'c1');
  assert.equal(s2.enemies[0].block, 0);
  assert.equal(s2.player.block, 10);
  s2 = play(s2, 'c2');
  assert.equal(s2.enemies[0].attackBonus, 0);

  // 3. triggerBurn + bonusIfDebuffed (burn_detonate + cmd_inject)
  let s3 = setup([{ defId: 'burn_detonate' }, { defId: 'cmd_inject' }], ['argus'], ['c1', 'c2']);
  s3.enemies[0].burn = { amount: 5, turns: 3 };
  s3 = play(s3, 'c1'); // 4 dmg + burn(5+2=7) + triggerBurn(7) = 11 dmg
  assert.equal(s3.enemies[0].hp, hp('argus') - 11);
  s3 = play(s3, 'c2'); // 4 + bonusIfDebuffed(6) = 10 dmg
  assert.equal(s3.enemies[0].hp, hp('argus') - 21);

  // 4. selfDamage + handScaleDamage + purgeNoise (overvolt + packet_burst + sandbox_guard)
  let s4 = setup(
    [{ defId: 'overvolt' }, { defId: 'packet_burst' }, { defId: 'sandbox_guard' }, { defId: 'noise' }],
    ['argus'],
    ['c1', 'c2', 'c3', 'c4'],
  );
  s4 = play(s4, 'c1'); // HP-3, energy+2
  assert.equal(s4.player.hp, 62);
  s4 = play(s4, 'c3'); // FW5 + purge 1 noise (+3 FW) = 8 FW
  assert.equal(s4.player.block, 8);
  assert.equal(s4.hand.includes('c4'), false);
});


test('戦闘ログに自分(player)・敵(enemy)・システム(system)の区別が記録される', () => {
  let s = setup([{ defId: 'ssh_brute' }], ['scanner_bot'], ['c1']);
  assert.equal(s.log[0].actor, 'system');
  s = play(s, 'c1');
  assert.equal(s.log[s.log.length - 1].actor, 'player');
  s = battle.endTurn(s);
  assert.equal(s.log[s.log.length - 1].actor, 'enemy');
});


test('ローグライク拡張: 初期ビルド・高難度・休憩マス・ハプニング・新常駐装備が正しく動く', () => {
  // 1. 初期ビルド(red_team) + 高難度(securityLevel: 4)
  const r = run.createRun({ loadoutId: 'red_team', securityLevel: 4 });
  assert.equal(r.loadoutId, 'red_team');
  assert.equal(r.maxHp, 50, 'red_team(60) - Lv.3ペナルティ(10) = 50');
  assert.ok(r.relics.includes('auto_scraper'));
  const b = run.createBattleForCurrentNode(r, 1);
  assert.ok(b.enemies[0].maxHp > hp('scanner_bot'), 'Lv.1以上で敵HP増加');
  assert.equal(b.enemies[0].attackBonus, 2, 'Lv.2以上で敵攻撃力+2');
  assert.equal(b.discard.length, 1, 'Lv.4以上でノイズ1枚が捨て札に混入');

  // 2. 新規常駐装備(thermal_core / thorn_daemon / overclock_bus / weak_scanner)
  const bRelic = battle.createBattle({
    deck: r.deck,
    playerHp: 50,
    playerMaxHp: 50,
    enemyIds: ['scanner_bot'],
    seed: 1,
    relics: ['thermal_core', 'thorn_daemon', 'overclock_bus', 'weak_scanner'],
  });
  assert.equal(bRelic.enemies[0].vulnerable, 2);
  assert.equal(bRelic.enemies[0].burn?.amount, 2);
  assert.equal(bRelic.player.retaliate, 4);
  assert.equal(bRelic.player.energy, battle.ENERGY_PER_TURN + 2, '初期の帯域 + overclock_bus(+2)');
  assert.equal(bRelic.hand.length, battle.DRAW_PER_TURN + 1, '初期のドロー + overclock_bus(+1)');

  // 3. 休憩・システム保守マス(回復 / 即強化 / 削除)
  const hurt = { ...run.createRun(), hp: 30 };
  const healed = run.applyRestAction(hurt, { type: 'heal' });
  assert.equal(healed.run.hp, 30 + Math.floor(65 * run.REST_HEAL_RATIO));
  const upgraded = run.applyRestAction(hurt, { type: 'upgrade', cardUid: 'c1' });
  assert.equal(upgraded.run.deck.find((c) => c.uid === 'c1')?.level, 2);
  const removed = run.applyRestAction(hurt, { type: 'remove', cardUid: 'c1' });
  assert.equal(removed.run.deck.length, hurt.deck.length - 1);

  // 4. ハプニングマス(リスク＆リターン)
  const m1 = run.resolveMysteryChoice(run.createRun(), 'dark_zero_day', 'buy_rare', 7);
  assert.equal(m1.run.hp, 53);
  assert.equal(m1.run.deck.length, 11);
  assert.equal(m1.run.reconCoins, 3);
  const m2 = run.resolveMysteryChoice(run.createRun(), 'overclock_terminal', 'extract_relic', 7);
  assert.equal(m2.run.hp, 57);
  assert.equal(m2.run.relics.length, 1);
});

test('戦闘ログはHPダメージとFW減少を区別し、実際の回復量を表示する', () => {
  const { CARD_DEFINITIONS } = load(new URL('../src/game/deckbattle/cards.ts', import.meta.url));
  const sshDamage = CARD_DEFINITIONS.ssh_brute.levels[1].effects[0].amount;
  const fw = 2;
  let s = setup([{ defId: 'ssh_brute' }], ['scanner_bot'], ['c1']);
  s.enemies[0].block = fw;
  s = play(s, 'c1');
  assert.ok(
    s.log.at(-1).message.includes(`あなた → ${s.enemies[0].name}：${sshDamage - fw}ダメージ・FWを${fw}削った`),
    s.log.at(-1).message,
  );
  s.player.hp = s.player.maxHp - 3;
  s.tools = ['hotfix'];
  const healed = battle.activateBattleTool(s, 0).state;
  assert.equal(healed.log.at(-1).effect, 'heal');
  assert.match(healed.log.at(-1).message, /HPを3回復/);
});

test('反撃デーモンは攻撃されないターンが続いても反撃をためない(4より少なければ4にする)', () => {
  let s = battle.createBattle({ deck: [{ uid: 'c1', defId: 'firewall', level: 1, xp: 0 }], playerHp: 500, playerMaxHp: 500, enemyIds: ['argus'], seed: 1, relics: ['thorn_daemon'] });
  let max = 0;
  for (let t = 0; t < 8 && s.status === 'playing'; t++) {
    max = Math.max(max, s.player.retaliate);
    s = battle.endTurn(s);
  }
  assert.equal(max, 4);
});

test('過熱コアの過熱は残りターンが延びず、増え続けない', () => {
  let s = battle.createBattle({ deck: [{ uid: 'c1', defId: 'firewall', level: 1, xp: 0 }], playerHp: 500, playerMaxHp: 500, enemyIds: ['argus'], seed: 1, relics: ['thermal_core'] });
  let max = 0;
  for (let t = 0; t < 10 && s.status === 'playing'; t++) {
    max = Math.max(max, s.enemies[0].burn?.amount ?? 0);
    s = battle.endTurn(s);
  }
  // 2 → 4 → 6 と増えたあと、3ターンで一度切れてまた2から始まる
  assert.equal(max, 6);
});

test('図鑑の試用表示は実績を解除しない', () => {
  const profileMod = load(new URL('../src/game/deckbattle/profile.ts', import.meta.url));
  const shown = profileMod.unlockAllCodexEntries(profileMod.createEmptyProfile());
  assert.ok(shown.seenCardIds.length >= 40);
  assert.equal(shown.achievements.length, 0);
});

test('HPを払う攻撃カードは、敵へのダメージと自分のHP減少を両方ログに残す', () => {
  const { CARD_DEFINITIONS } = load(new URL('../src/game/deckbattle/cards.ts', import.meta.url));
  const [selfCost] = CARD_DEFINITIONS.kernel_panic.levels[1].effects;
  let s = setup([{ defId: 'kernel_panic' }], ['argus'], ['c1']);
  s = play(s, 'c1');
  const message = s.log.at(-1).message;
  assert.match(message, /あなた → .+ダメージ/);
  assert.ok(message.includes(`あなた：HPを${selfCost.amount}失った`), message);
});

test('ボスに勝ったときは、Lv.3 に届いたカードがあっても進化先を選ばせない(通常の戦闘では選ばせる)', () => {
  const finish = (nodeIndex) => {
    const base = run.createRun();
    const deck = base.deck.map((c, i) => (i === 0 ? { ...c, xp: run.XP_TO_LV3 - 1, level: 2 } : c));
    const r = { ...base, deck, nodeIndex };
    const s = run.createBattleForCurrentNode(r, 1);
    const won = {
      ...s,
      status: 'won',
      enemies: s.enemies.map((e) => ({ ...e, hp: 0 })),
      usesThisBattle: { [deck[0].uid]: 1 },
    };
    return run.applyBattleResult(r, won, 1).run;
  };
  const bossIndex = run.DEFAULT_RUN_NODES.findIndex((n) => n.kind === 'boss');
  const afterBoss = finish(bossIndex);
  assert.equal(afterBoss.status, 'won');
  assert.equal(afterBoss.deck[0].level, 3);
  assert.equal(afterBoss.pendingEvolutions.length, 0);

  const afterNormal = finish(0);
  assert.equal(afterNormal.status, 'playing');
  assert.deepEqual([...afterNormal.pendingEvolutions], [afterNormal.deck[0].uid]);
});
