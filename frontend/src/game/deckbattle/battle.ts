// 戦闘のルール(docs/deckbattle-plan-v0.3.md の4章・7章・8章)。
// すべて「今の状態を受け取って、新しい状態を返す」純粋な関数。画面からもテストからも同じように呼ぶ。
import { CARD_DEFINITIONS } from './cards';
import { ENEMY_DEFINITIONS } from './enemies';
import { ADAPTIVE_FILTER_FW, RELIC_DEFINITIONS } from './relics';
import { shuffled } from './rng';
import { TOOL_DEFINITIONS } from './tools';
import type {
  BattleState,
  CardDefinition,
  CardEffect,
  CardInstance,
  CardStats,
  EnemyActionKind,
  EnemyMove,
  EnemyState,
  RelicId,
  ToolId,
} from './types';

// ---------- 設定(4章) ----------
export const ENERGY_PER_TURN = 4;
export const DRAW_PER_TURN = 4;
export const MAX_HAND_SIZE = 10;
export const BURN_TURNS = 3;

// ---------- カードの性能 ----------

export function getCardDefinition(defId: string): CardDefinition {
  const def = CARD_DEFINITIONS[defId];
  if (!def) throw new Error(`unknown card: ${defId}`);
  return def;
}

/** カード1枚の今の性能(レベルと進化先で決まる) */
export function getCardStats(card: CardInstance): CardStats & { name: string; icon: string } {
  const def = getCardDefinition(card.defId);
  if (card.level === 3) {
    const branch = def.branches.find((b) => b.id === card.branchId);
    if (branch) return { ...branch, name: branch.name, icon: branch.icon ?? def.icon };
    // 進化先がまだ選ばれていなければ Lv.2 の性能で動く
    return { ...def.levels[2], name: def.name, icon: def.icon };
  }
  return { ...def.levels[card.level], name: def.name, icon: def.icon };
}

/** 対象の敵を選ぶ必要があるカードか(1体を狙うダメージ・過熱等を含む) */
export function cardNeedsTarget(stats: Pick<CardStats, 'effects'>): boolean {
  return stats.effects.some(
    (e) =>
      ((e.type === 'damage' ||
        e.type === 'shieldBash' ||
        e.type === 'stripBlock' ||
        e.type === 'bonusIfDebuffed' ||
        e.type === 'triggerBurn' ||
        e.type === 'handScaleDamage' ||
        e.type === 'clearEnemyBuff') &&
        e.target === 'single') ||
      e.type === 'burn',
  );
}

/** 「次のカード−1EN」を考えた、今このカードを使うのに必要な帯域 */
export function getPlayCost(state: BattleState, uid: string): number {
  const card = state.cards[uid];
  return Math.max(0, getCardStats(card).cost - state.modifiers.nextCardDiscount);
}

// ---------- 敵 ----------

function currentPattern(enemy: EnemyState): EnemyMove[] {
  const def = ENEMY_DEFINITIONS[enemy.defId];
  return enemy.phase === 2 && def.phase2 ? def.phase2.pattern : def.pattern;
}

/** カードが指定した敵の弱点を突くか判定する(画面表示とダメージ計算で共通利用) */
export function doesCardHitWeakness(stats: Pick<CardStats, 'effects'>, enemy: Pick<EnemyState, 'weakness'>): boolean {
  return stats.effects.some((e) => {
    if (e.type !== 'damage') return false;
    if (enemy.weakness === 'pierce') return Boolean(e.pierce);
    if (enemy.weakness === 'multi') return (e.hits ?? 1) >= 2;
    if (enemy.weakness === 'all') return e.target === 'all';
    if (enemy.weakness === 'burn') return stats.effects.some((x) => x.type === 'burn');
    return false;
  });
}

/** 敵が次のターンに行う行動(予告)。攻撃力の上乗せ・ジャミングも反映した値 */
export function getEnemyIntent(enemy: EnemyState): EnemyMove {
  const pattern = currentPattern(enemy);
  const move = pattern[enemy.moveIndex % pattern.length];
  const factor = enemy.jammed && enemy.jammed > 0 ? 0.7 : 1;
  if (move.type === 'attack') {
    return { ...move, amount: Math.floor((move.amount + enemy.attackBonus) * factor) };
  }
  if (move.type === 'blockAttack') {
    return { ...move, amount: Math.floor((move.amount + enemy.attackBonus) * factor) };
  }
  return move;
}

export function livingEnemies(state: BattleState): EnemyState[] {
  return state.enemies.filter((e) => e.hp > 0);
}

// ---------- 戦闘の作成 ----------

export interface CreateBattleOptions {
  deck: CardInstance[];
  playerHp: number;
  playerMaxHp: number;
  enemyIds: string[];
  seed: number;
  relics?: RelicId[];
  tools?: ToolId[];
}

export function createBattle({ deck, playerHp, playerMaxHp, enemyIds, seed, relics = [], tools = [] }: CreateBattleOptions): BattleState {
  const seen: Record<string, number> = {};
  const total = (id: string) => enemyIds.filter((x) => x === id).length;
  const enemies: EnemyState[] = enemyIds.map((id, index) => {
    const def = ENEMY_DEFINITIONS[id];
    if (!def) throw new Error(`unknown enemy: ${id}`);
    // 同じ敵が2体いるときは、1ターンずつずらして動かす(8章)
    const offset = seen[id] ?? 0;
    seen[id] = offset + 1;
    return {
      uid: `e${index + 1}`,
      defId: id,
      name: total(id) > 1 ? `${def.name} ${String.fromCharCode(65 + offset)}` : def.name,
      icon: def.icon,
      hp: def.maxHp,
      maxHp: def.maxHp,
      block: 0,
      weakness: def.weakness,
      attackBonus: 0,
      moveIndex: offset % def.pattern.length,
      phase: 1,
    };
  });
  const cards: Record<string, CardInstance> = {};
  for (const card of deck) cards[card.uid] = { ...card };
  const { items: drawPile, state: rngState } = shuffled(deck.map((c) => c.uid), seed);

  const state: BattleState = {
    status: 'playing',
    turn: 0,
    player: {
      hp: playerHp,
      maxHp: playerMaxHp,
      block: 0,
      energy: 0,
      maxEnergy: ENERGY_PER_TURN,
      retaliate: 0,
      energyPenalty: 0,
      turnBlockBonus: relics.includes('encrypted_vpn') ? 3 : 0,
      turnDrawBonus: relics.includes('packet_cache') ? 1 : 0,
      turnEnergyBonus: relics.includes('zero_trust_key') ? 1 : 0,
      turnAttackBonus: relics.includes('auto_scraper') ? 3 : 0,
    },
    enemies,
    cards,
    drawPile,
    hand: [],
    discard: [],
    modifiers: { nextAttackBonus: 0, repeatNextAttack: false, nextCardDiscount: 0, reconCombo: 'none' },
    usesThisBattle: {},
    relics: [...relics],
    tools: [...tools],
    log: [],
    lastEnemyActions: [],
    nextUid: 1,
    rngState,
  };
  startPlayerTurn(state);
  addLog(state, `戦闘開始:${enemies.map((e) => e.name).join('・')}`, 'info');
  return state;
}

// ---------- 内部の処理(渡された state を書き換える) ----------

function clone(state: BattleState): BattleState {
  return JSON.parse(JSON.stringify(state)) as BattleState;
}

function addLog(state: BattleState, message: string, tone: 'info' | 'good' | 'bad'): void {
  state.log.push({ id: state.log.length + 1, turn: state.turn, message, tone });
}

function drawCards(state: BattleState, count: number): void {
  for (let i = 0; i < count; i++) {
    if (state.hand.length >= MAX_HAND_SIZE) return;
    if (state.drawPile.length === 0) {
      if (state.discard.length === 0) return;
      // 山札が尽きたら、捨て札をシャッフルして山札にする
      const r = shuffled(state.discard, state.rngState);
      state.drawPile = r.items;
      state.rngState = r.state;
      state.discard = [];
    }
    const uid = state.drawPile.shift();
    if (uid) state.hand.push(uid);
  }
}

function startPlayerTurn(state: BattleState): void {
  state.turn += 1;
  state.player.block = state.player.turnBlockBonus;
  state.player.energy = Math.max(0, state.player.maxEnergy + state.player.turnEnergyBonus - state.player.energyPenalty);
  if (state.player.energyPenalty > 0) addLog(state, `検知されたため、帯域が ${state.player.energyPenalty} 減った。`, 'bad');
  state.player.energyPenalty = 0;
  state.modifiers.reconCombo = 'none';
  if (state.player.turnAttackBonus > 0) {
    state.modifiers.nextAttackBonus += state.player.turnAttackBonus;
  }
  drawCards(state, DRAW_PER_TURN + state.player.turnDrawBonus);
}

/** 敵にダメージ(脆弱1.5倍・FW から先に削る)。実際に HP が減った量を返す */
function damageEnemy(enemy: EnemyState, amount: number, ignoreBlock = false): number {
  let rest = enemy.vulnerable && enemy.vulnerable > 0 ? Math.floor(amount * 1.5) : amount;
  if (!ignoreBlock) {
    const absorbed = Math.min(enemy.block, rest);
    enemy.block -= absorbed;
    rest -= absorbed;
  }
  const dealt = Math.min(enemy.hp, rest);
  enemy.hp -= dealt;
  return dealt;
}

/** ボスの HP が一定以下になったら行動パターンを切り替える */
function updatePhases(state: BattleState): void {
  for (const enemy of state.enemies) {
    const def = ENEMY_DEFINITIONS[enemy.defId];
    if (enemy.hp > 0 && enemy.phase === 1 && def.phase2 && enemy.hp <= enemy.maxHp * def.phase2.hpRatio) {
      enemy.phase = 2;
      enemy.moveIndex = 0;
      addLog(state, `${enemy.name} が本気を出した!行動が変わる。`, 'bad');
    }
  }
}

function checkVictory(state: BattleState): void {
  if (state.status === 'playing' && livingEnemies(state).length === 0) {
    state.status = 'won';
    addLog(state, '勝利!すべての防御システムを突破した。', 'good');
  }
}

function applyEffect(
  state: BattleState,
  effect: CardEffect,
  target: EnemyState | undefined,
  attackBonus: number,
  cardEffects: CardEffect[],
): void {
  switch (effect.type) {
    case 'damage': {
      const hits = effect.hits ?? 1;
      for (let i = 0; i < hits; i++) {
        const targets = effect.target === 'all' ? livingEnemies(state) : target && target.hp > 0 ? [target] : [];
        for (const enemy of targets) {
          const baseDmg = effect.amount + attackBonus;
          const weakDmg = doesCardHitWeakness({ effects: cardEffects }, enemy) ? Math.floor(baseDmg * 1.5) : baseDmg;
          damageEnemy(enemy, weakDmg, Boolean(effect.pierce));
        }
      }
      break;
    }
    case 'block':
      state.player.block += effect.amount;
      break;
    case 'draw':
      drawCards(state, effect.amount);
      break;
    case 'energy':
      state.player.energy += effect.amount;
      break;
    case 'nextAttackBonus':
      state.modifiers.nextAttackBonus += effect.amount;
      break;
    case 'repeatNextAttack':
      state.modifiers.repeatNextAttack = true;
      break;
    case 'nextCardDiscount':
      state.modifiers.nextCardDiscount += effect.amount;
      break;
    case 'heal':
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + effect.amount);
      break;
    case 'burn':
      if (target && target.hp > 0) {
        // 重ねると量を足し、残りターンは3に戻る(7章)
        target.burn = { amount: (target.burn?.amount ?? 0) + effect.amount, turns: BURN_TURNS };
      }
      break;
    case 'retaliate':
      state.player.retaliate += effect.amount;
      break;
    case 'vulnerable': {
      // 対象を選ぶカードはその敵だけ(先に倒していたら付けない)。対象のないカードは敵全体
      const targets = target ? (target.hp > 0 ? [target] : []) : livingEnemies(state);
      for (const enemy of targets) {
        enemy.vulnerable = (enemy.vulnerable ?? 0) + effect.amount;
      }
      break;
    }
    case 'jam': {
      // 対象を選ぶカードはその敵だけ(先に倒していたら付けない)。対象のないカードは敵全体
      const targets = target ? (target.hp > 0 ? [target] : []) : livingEnemies(state);
      for (const enemy of targets) {
        enemy.jammed = (enemy.jammed ?? 0) + effect.amount;
      }
      break;
    }
    case 'persistent':
      if (effect.stat === 'turnBlock') state.player.turnBlockBonus += effect.amount;
      else if (effect.stat === 'turnDraw') state.player.turnDrawBonus += effect.amount;
      else if (effect.stat === 'turnEnergy') state.player.turnEnergyBonus += effect.amount;
      else if (effect.stat === 'turnAttackBonus') state.player.turnAttackBonus += effect.amount;
      break;
    case 'shieldBash': {
      const mult = effect.multiplier ?? 1;
      const dmg = Math.floor(state.player.block * mult) + attackBonus;
      const targets = effect.target === 'all' ? livingEnemies(state) : target && target.hp > 0 ? [target] : [];
      for (const enemy of targets) {
        if (dmg > 0) damageEnemy(enemy, dmg);
      }
      break;
    }
    case 'stripBlock': {
      const targets = effect.target === 'all' ? livingEnemies(state) : target && target.hp > 0 ? [target] : [];
      for (const enemy of targets) {
        const stolen = enemy.block;
        enemy.block = 0;
        if (effect.steal && stolen > 0) {
          state.player.block += stolen;
        }
      }
      break;
    }
    case 'bonusIfDebuffed': {
      const targets = effect.target === 'all' ? livingEnemies(state) : target && target.hp > 0 ? [target] : [];
      for (const enemy of targets) {
        const isDebuffed = Boolean(enemy.burn || (enemy.vulnerable && enemy.vulnerable > 0) || (enemy.jammed && enemy.jammed > 0));
        if (isDebuffed) {
          damageEnemy(enemy, effect.amount + attackBonus);
        }
      }
      break;
    }
    case 'triggerBurn': {
      const mult = effect.multiplier ?? 1;
      const targets = effect.target === 'all' ? livingEnemies(state) : target && target.hp > 0 ? [target] : [];
      for (const enemy of targets) {
        if (enemy.burn && enemy.burn.amount > 0) {
          damageEnemy(enemy, Math.floor(enemy.burn.amount * mult), true);
        }
      }
      break;
    }
    case 'selfDamage':
      state.player.hp = Math.max(1, state.player.hp - effect.amount);
      break;
    case 'handScaleDamage': {
      const dmg = state.hand.length * effect.perCard + attackBonus;
      const targets = effect.target === 'all' ? livingEnemies(state) : target && target.hp > 0 ? [target] : [];
      for (const enemy of targets) {
        if (dmg > 0) damageEnemy(enemy, dmg);
      }
      break;
    }
    case 'purgeNoise': {
      const isNoise = (uid: string) => state.cards[uid]?.defId === 'noise';
      const handNoises = state.hand.filter(isNoise);
      const discardNoises = state.discard.filter(isNoise);
      const drawNoises = state.drawPile.filter(isNoise);
      const totalPurged = handNoises.length + discardNoises.length + drawNoises.length;
      state.hand = state.hand.filter((id) => !isNoise(id));
      state.discard = state.discard.filter((id) => !isNoise(id));
      state.drawPile = state.drawPile.filter((id) => !isNoise(id));
      for (const uid of [...handNoises, ...discardNoises, ...drawNoises]) {
        delete state.cards[uid];
      }
      if (totalPurged > 0) {
        if (effect.blockPerNoise) state.player.block += totalPurged * effect.blockPerNoise;
        if (effect.damagePerNoise) {
          for (const enemy of livingEnemies(state)) {
            damageEnemy(enemy, totalPurged * effect.damagePerNoise, true);
          }
        }
        if (effect.drawPerNoise) drawCards(state, totalPurged * effect.drawPerNoise);
      }
      break;
    }
    case 'clearEnemyBuff': {
      const targets = effect.target === 'all' ? livingEnemies(state) : target && target.hp > 0 ? [target] : [];
      for (const enemy of targets) {
        enemy.attackBonus = 0;
      }
      break;
    }
    case 'doubleBlock':
      state.player.block *= 2;
      break;
  }
}

// ---------- プレイヤーの操作 ----------

export interface PlayResult {
  state: BattleState;
  accepted: boolean;
  /** 却下したときの理由 */
  reason?: string;
}

export function playCard(prev: BattleState, uid: string, targetUid?: string): PlayResult {
  if (prev.status !== 'playing') return { state: prev, accepted: false, reason: '戦闘は終わっています。' };
  if (!prev.hand.includes(uid)) return { state: prev, accepted: false, reason: 'そのカードは手札にありません。' };
  const card = prev.cards[uid];
  const def = getCardDefinition(card.defId);
  if (def.unplayable) return { state: prev, accepted: false, reason: `${def.name} は使えません。` };
  const stats = getCardStats(card);
  const cost = getPlayCost(prev, uid);
  if (cost > prev.player.energy) return { state: prev, accepted: false, reason: `帯域が足りません(必要 ${cost} / 残り ${prev.player.energy})。` };

  let target: EnemyState | undefined;
  if (cardNeedsTarget(stats)) {
    const living = livingEnemies(prev);
    const chosen = targetUid ? living.find((e) => e.uid === targetUid) : living.length === 1 ? living[0] : undefined;
    if (!chosen) return { state: prev, accepted: false, reason: '対象の敵を選んでください。' };
    target = chosen;
  }

  const state = clone(prev);
  if (target) target = state.enemies.find((e) => e.uid === target!.uid);
  state.player.energy -= cost;
  // 「次のカード−1EN」は、どのカードを使っても1回で消える
  state.modifiers.nextCardDiscount = 0;
  state.hand = state.hand.filter((h) => h !== uid);
  state.usesThisBattle[uid] = (state.usesThisBattle[uid] ?? 0) + 1;

  const isAttack = def.kind === 'attack';
  const bonus = isAttack ? state.modifiers.nextAttackBonus : 0;
  const times = isAttack && state.modifiers.repeatNextAttack ? 2 : 1;
  if (isAttack) {
    // 攻撃カードに乗った修正は、このカードで使い切る(7章)
    state.modifiers.nextAttackBonus = 0;
    state.modifiers.repeatNextAttack = false;
  }

  const hpBefore = Object.fromEntries(state.enemies.map((e) => [e.uid, e.hp + e.block]));
  for (let t = 0; t < times; t++) {
    for (const effect of stats.effects) applyEffect(state, effect, target, bonus, stats.effects);
  }
  state.discard.push(uid);

  // 解析コンボ(補助 → 攻撃で1ターンに1回 帯域+1)
  if (def.kind === 'utility' && state.modifiers.reconCombo === 'none') {
    state.modifiers.reconCombo = 'ready';
  } else if (isAttack && state.modifiers.reconCombo === 'ready') {
    state.modifiers.reconCombo = 'done';
    state.player.energy += 1;
    addLog(state, '🔍 解析コンボ発動! 帯域 +1', 'good');
    if (state.relics.includes('adaptive_filter')) {
      state.player.block += ADAPTIVE_FILTER_FW;
      addLog(state, `[${RELIC_DEFINITIONS.adaptive_filter.name}] FW+${ADAPTIVE_FILTER_FW}`, 'good');
    }
  }

  const hits = state.enemies
    .map((e) => ({ e, lost: hpBefore[e.uid] - (e.hp + e.block) }))
    .filter((x) => x.lost > 0)
    .map((x) => `${x.e.name}に${x.lost}`);
  const detail = hits.length ? `${hits.join('、')}ダメージ` : stats.text;
  addLog(state, `[${stats.name}]${times === 2 ? '(2回発動)' : ''} ${detail}`, 'info');
  updatePhases(state);
  checkVictory(state);
  return { state, accepted: true };
}

/** ターン終了:手札を捨て、敵が予告どおりに動き、次のターンを始める */
export function endTurn(prev: BattleState): BattleState {
  if (prev.status !== 'playing') return prev;
  const state = clone(prev);
  state.discard.push(...state.hand);
  state.hand = [];
  state.lastEnemyActions = [];

  for (const enemy of state.enemies) {
    if (enemy.hp <= 0 || state.status !== 'playing') continue;
    // 敵のファイアウォールは、その敵の次の行動の前に消える
    enemy.block = 0;
    const move = getEnemyIntent(enemy);
    runEnemyMove(state, enemy, move);
    const pattern = currentPattern(enemy);
    enemy.moveIndex = (enemy.moveIndex + 1) % pattern.length;
    if (state.player.hp <= 0) {
      state.player.hp = 0;
      state.status = 'lost';
      addLog(state, '回線を切断された…ラン失敗。', 'bad');
    }
  }

  if (state.status === 'playing') {
    // 過熱:敵のターンの終わりにダメージ(FW 無視)、3ターンで消える
    for (const enemy of livingEnemies(state)) {
      if (enemy.burn) {
        const dealt = damageEnemy(enemy, enemy.burn.amount, true);
        recordAction(state, { kind: 'burn', enemyUid: enemy.uid, damage: dealt });
        addLog(state, `過熱で ${enemy.name} に${dealt}ダメージ。`, 'good');
        enemy.burn.turns -= 1;
        if (enemy.burn.turns <= 0) delete enemy.burn;
      }
      if (enemy.vulnerable) {
        enemy.vulnerable -= 1;
        if (enemy.vulnerable <= 0) delete enemy.vulnerable;
      }
      if (enemy.jammed) {
        enemy.jammed -= 1;
        if (enemy.jammed <= 0) delete enemy.jammed;
      }
    }
    updatePhases(state);
    checkVictory(state);
  }

  if (state.status === 'playing') startPlayerTurn(state);
  return state;
}

/** 敵のターンの出来事を、その直後の HP・FW と一緒に記録する */
function recordAction(state: BattleState, event: EnemyActionKind): void {
  state.lastEnemyActions.push({
    ...event,
    after: {
      playerHp: Math.max(0, state.player.hp),
      playerBlock: state.player.block,
      enemies: state.enemies.map((e) => ({ uid: e.uid, hp: e.hp, block: e.block })),
    },
  });
}

function runEnemyMove(state: BattleState, enemy: EnemyState, move: EnemyMove): void {
  const push = (event: EnemyActionKind) => recordAction(state, event);
  switch (move.type) {
    case 'blockAttack':
      enemy.block += move.block;
      push({ kind: 'block', enemyUid: enemy.uid, amount: move.block });
      enemyAttack(state, enemy, move.amount, 1);
      break;
    case 'attack':
      enemyAttack(state, enemy, move.amount, move.hits ?? 1);
      break;
    case 'block':
      enemy.block += move.amount;
      push({ kind: 'block', enemyUid: enemy.uid, amount: move.amount });
      addLog(state, `${enemy.name} がFW${move.amount}を張った。`, 'info');
      break;
    case 'buff':
      enemy.attackBonus += move.amount;
      push({ kind: 'buff', enemyUid: enemy.uid, amount: move.amount });
      addLog(state, `${enemy.name} の攻撃力が+${move.amount}された。`, 'bad');
      break;
    case 'detect':
      state.player.energyPenalty += move.amount;
      push({ kind: 'detect', enemyUid: enemy.uid, amount: move.amount });
      addLog(state, `${enemy.name} に検知された。次のターンの帯域−${move.amount}。`, 'bad');
      break;
    case 'noise':
      for (let i = 0; i < move.count; i++) {
        const uid = `noise-${state.nextUid++}`;
        state.cards[uid] = { uid, defId: 'noise', level: 1, xp: 0 };
        state.discard.push(uid);
      }
      push({ kind: 'noise', enemyUid: enemy.uid, count: move.count });
      addLog(state, `${enemy.name} がノイズを${move.count}枚送り込んだ。`, 'bad');
      break;
  }
}

/** 敵の攻撃。amount は攻撃力の上乗せを含んだ値 */
function enemyAttack(state: BattleState, enemy: EnemyState, amount: number, hits: number): void {
  let damage = 0;
  let blocked = 0;
  for (let i = 0; i < hits; i++) {
    const absorbed = Math.min(state.player.block, amount);
    state.player.block -= absorbed;
    blocked += absorbed;
    damage += amount - absorbed;
  }
  state.player.hp -= damage;
  recordAction(state, { kind: 'attack', enemyUid: enemy.uid, damage, blocked, hits });
  addLog(state, `${enemy.name} の攻撃:${damage}ダメージ${blocked ? `(FWで${blocked}防いだ)` : ''}。`, damage > 0 ? 'bad' : 'info');

  // 反撃:次に受ける攻撃1回で、攻撃してきた敵にダメージ(FW で全部防いでも発動する)
  if (state.player.retaliate > 0 && enemy.hp > 0) {
    const dealt = damageEnemy(enemy, state.player.retaliate);
    recordAction(state, { kind: 'retaliate', enemyUid: enemy.uid, damage: dealt });
    addLog(state, `反撃で ${enemy.name} に${dealt}ダメージ。`, 'good');
    state.player.retaliate = 0;
    updatePhases(state);
    checkVictory(state);
  }
}

/** 戦闘中に帯域0で緊急ツールを使う */
export function activateBattleTool(prev: BattleState, toolIndex: number): PlayResult {
  if (prev.status !== 'playing') return { state: prev, accepted: false, reason: '戦闘は終わっています。' };
  const toolId = prev.tools[toolIndex];
  if (!toolId) return { state: prev, accepted: false, reason: 'ツールがありません。' };
  const def = TOOL_DEFINITIONS[toolId];
  const state = clone(prev);
  state.tools.splice(toolIndex, 1);

  switch (toolId) {
    case 'hotfix':
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + 12);
      addLog(state, `[ツール:${def.name}] 回線耐久 +12 回復`, 'good');
      break;
    case 'overclock':
      state.player.energy += 2;
      addLog(state, `[ツール:${def.name}] 帯域 +2`, 'good');
      break;
    case 'packet_purge': {
      const removed = state.hand.filter((uid) => state.cards[uid]?.defId === 'noise').length;
      state.hand = state.hand.filter((uid) => state.cards[uid]?.defId !== 'noise');
      drawCards(state, 2);
      addLog(state, `[ツール:${def.name}] ノイズ${removed}枚破棄＋2枚ドロー`, 'good');
      break;
    }
    case 'jammer_pulse':
      for (const enemy of livingEnemies(state)) {
        enemy.vulnerable = (enemy.vulnerable ?? 0) + 2;
        enemy.jammed = (enemy.jammed ?? 0) + 2;
      }
      addLog(state, `[ツール:${def.name}] 敵全体に脆弱(2T)＋ジャミング(2T)`, 'good');
      break;
  }
  return { state, accepted: true };
}

/** 戦闘が終わった後のデッキ(戦闘中に入ったノイズは消える) */
export function deckAfterBattle(state: BattleState): CardInstance[] {
  return Object.values(state.cards).filter((c) => c.defId !== 'noise');
}
