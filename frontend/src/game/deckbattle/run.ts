// 1回のラン・成長・進化・報酬・イベント(docs/deckbattle-plan-v0.2.md の3章・5章・9章)。
// 画面に依存しない純粋な関数で実装し、node --test と画面の両方から使う。
import { getQuizQuestionsByType, type DeckQuizQuestion } from '../data/securityLearningData';
import { createBattle, getCardDefinition } from './battle';
import { REWARD_CARD_IDS, STARTER_DECK_IDS } from './cards';
import { shuffled } from './rng';
import type {
  BattleState,
  CardInstance,
  CardLevel,
  RunEventId,
  RunNode,
  RunState,
  XpGainEntry,
} from './types';

export const PLAYER_MAX_HP = 65;
export const XP_TO_LV2 = 2;
export const XP_TO_LV3 = 5;
export const MAX_BATTLE_XP = 3;
export const QUIZ_XP_REWARD = 2;
export const BATTLE_WIN_HEAL_RATIO = 0.1;
export const VULN_EVENT_FAIL_DAMAGE = 5;
export const PATCH_EVENT_HEAL = 15;

/** 1回のランのマスの並び(分岐マップを足すときは、この一覧の形を変える) */
export const DEFAULT_RUN_NODES: RunNode[] = [
  { kind: 'battle', enemyIds: ['scanner_bot'] },
  { kind: 'event', eventId: 'vuln_check' },
  { kind: 'battle', enemyIds: ['ids_sensor', 'ids_sensor'] },
  { kind: 'event', eventId: 'patch' },
  { kind: 'battle', enemyIds: ['firewall_ai'] },
  { kind: 'boss', enemyIds: ['argus'] },
];

export function createCardInstance(defId: string, uid: string): CardInstance {
  return { uid, defId, level: 1, xp: 0 };
}

export function createRun(options: { fastGrowth?: boolean } = {}): RunState {
  const deck = STARTER_DECK_IDS.map((defId, i) => createCardInstance(defId, `c${i + 1}`));
  return {
    status: 'playing',
    deck,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    nodes: DEFAULT_RUN_NODES.map((n) => ({ ...n })),
    nodeIndex: 0,
    pendingEvolutions: [],
    askedQuestionIds: [],
    fastGrowth: options.fastGrowth ?? false,
    nextUid: deck.length + 1,
  };
}

/** 累計経験値からレベルを計算する */
export function levelForXp(xp: number): CardLevel {
  if (xp >= XP_TO_LV3) return 3;
  if (xp >= XP_TO_LV2) return 2;
  return 1;
}

/** カード上に「Lv.2 → あと1で Lv.3」を出すための表示情報 */
export function getXpProgress(card: CardInstance): { label: string; remainingToNext: number } {
  if (card.level === 1) {
    const remaining = Math.max(0, XP_TO_LV2 - card.xp);
    return { label: `Lv.1 (あと${remaining}でLv.2)`, remainingToNext: remaining };
  }
  if (card.level === 2) {
    const remaining = Math.max(0, XP_TO_LV3 - card.xp);
    return { label: `Lv.2 (あと${remaining}でLv.3)`, remainingToNext: remaining };
  }
  if (!card.branchId) {
    return { label: 'Lv.3 (進化待ち)', remainingToNext: 0 };
  }
  return { label: 'Lv.3 MAX', remainingToNext: 0 };
}

/** 今のマスが戦闘(またはボス)なら、その戦闘を作る */
export function createBattleForCurrentNode(run: RunState, seed: number): BattleState {
  const node = run.nodes[run.nodeIndex];
  if (!node || node.kind === 'event') throw new Error('current node is not a battle');
  return createBattle({ deck: run.deck, playerHp: run.hp, playerMaxHp: run.maxHp, enemyIds: node.enemyIds, seed });
}

function addXp(
  deck: CardInstance[],
  pendingEvolutions: string[],
  cardUid: string,
  xpDelta: number,
): { deck: CardInstance[]; pendingEvolutions: string[]; entry: XpGainEntry | null } {
  if (xpDelta <= 0) return { deck, pendingEvolutions, entry: null };
  let entry: XpGainEntry | null = null;
  const nextPending = [...pendingEvolutions];

  const nextDeck = deck.map((card) => {
    if (card.uid !== cardUid) return card;
    const def = getCardDefinition(card.defId);
    if (def.unplayable) return card;

    const previousXp = card.xp;
    const previousLevel = card.level;
    const newXp = previousXp + xpDelta;
    const newLevel = levelForXp(newXp);
    if (newLevel === 3 && !card.branchId && !nextPending.includes(card.uid)) {
      nextPending.push(card.uid);
    }
    entry = {
      uid: card.uid,
      defId: card.defId,
      xpAdded: xpDelta,
      previousLevel,
      newLevel,
      previousXp,
      newXp,
    };
    return { ...card, xp: newXp, level: newLevel };
  });

  return { deck: nextDeck, pendingEvolutions: nextPending, entry };
}

export interface BattleResolutionResult {
  run: RunState;
  xpGains: XpGainEntry[];
  rewardChoices: string[];
  healed: number;
}

/** 戦闘終了時(勝利/敗北)に HP・経験値・進化待ち・報酬3択を反映する */
export function applyBattleResult(run: RunState, battle: BattleState, rewardSeed: number): BattleResolutionResult {
  if (battle.status === 'lost') {
    return {
      run: { ...run, hp: 0, status: 'lost' },
      xpGains: [],
      rewardChoices: [],
      healed: 0,
    };
  }
  if (battle.status !== 'won') {
    throw new Error('battle is not finished');
  }

  const node = run.nodes[run.nodeIndex];
  const isBoss = node?.kind === 'boss';
  const baseHp = Math.max(1, Math.min(run.maxHp, battle.player.hp));
  const healAmount = isBoss ? 0 : Math.floor(run.maxHp * BATTLE_WIN_HEAL_RATIO);
  const nextHp = Math.min(run.maxHp, baseHp + healAmount);
  const healed = nextHp - baseHp;

  let deck = run.deck.map((c) => ({ ...c }));
  let pendingEvolutions = [...run.pendingEvolutions];
  const xpGains: XpGainEntry[] = [];

  for (const card of run.deck) {
    const uses = battle.usesThisBattle[card.uid] ?? 0;
    if (uses <= 0) continue;
    const delta = run.fastGrowth ? uses * 3 + 2 : Math.min(MAX_BATTLE_XP, uses + 1);
    const res = addXp(deck, pendingEvolutions, card.uid, delta);
    deck = res.deck;
    pendingEvolutions = res.pendingEvolutions;
    if (res.entry) xpGains.push(res.entry);
  }

  const rewardChoices = isBoss ? [] : shuffled(REWARD_CARD_IDS, rewardSeed).items.slice(0, 3);

  return {
    run: {
      ...run,
      status: isBoss ? 'won' : run.status,
      hp: nextHp,
      deck,
      pendingEvolutions,
    },
    xpGains,
    rewardChoices,
    healed,
  };
}

/** Lv.3 に到達したカードの進化先を1つ選ぶ */
export function chooseEvolution(run: RunState, cardUid: string, branchId: string): RunState {
  const target = run.deck.find((c) => c.uid === cardUid);
  if (!target) throw new Error(`card not found: ${cardUid}`);
  if (target.level < 3) throw new Error(`card is not Lv.3: ${cardUid}`);
  const def = getCardDefinition(target.defId);
  const valid = def.branches.some((b) => b.id === branchId);
  if (!valid) throw new Error(`invalid branch ${branchId} for ${target.defId}`);

  return {
    ...run,
    deck: run.deck.map((c) => (c.uid === cardUid ? { ...c, branchId } : c)),
    pendingEvolutions: run.pendingEvolutions.filter((id) => id !== cardUid),
  };
}

/** 戦闘報酬のカードを受け取る(null ならスキップ) */
export function pickRewardCard(run: RunState, defId: string | null): RunState {
  if (defId === null) return run;
  getCardDefinition(defId);
  const newCard = createCardInstance(defId, `c${run.nextUid}`);
  return {
    ...run,
    deck: [...run.deck, newCard],
    nextUid: run.nextUid + 1,
  };
}

/** 進化待ちが残っていないことを確認して次のマスへ進む */
export function advanceToNextNode(run: RunState): RunState {
  if (run.pendingEvolutions.length > 0) {
    throw new Error('進化先の選択が終わるまで次のマスに進めません');
  }
  if (run.status !== 'playing') return run;
  const nextIndex = Math.min(run.nodes.length - 1, run.nodeIndex + 1);
  return { ...run, nodeIndex: nextIndex };
}

/** イベントマスの問題を1問選ぶ(同じランで同じ問題は出さない) */
export function pickEventQuestion(run: RunState, eventId: RunEventId, seed: number): DeckQuizQuestion {
  const prefix = eventId === 'vuln_check' ? 'TYPE A' : 'TYPE B';
  const pool = getQuizQuestionsByType(prefix);
  const unused = pool.filter((q) => !run.askedQuestionIds.includes(q.id));
  const candidates = unused.length > 0 ? unused : pool;
  if (candidates.length === 0) {
    throw new Error(`no quiz questions found for ${prefix}`);
  }
  return shuffled(candidates, seed).items[0];
}

/** イベントの回答結果を反映する(出題済み記録 + 不正解ペナルティ) */
export function resolveEventQuiz(
  run: RunState,
  eventId: RunEventId,
  questionId: string,
  isCorrect: boolean,
): { run: RunState; hpLost: number } {
  const askedQuestionIds = run.askedQuestionIds.includes(questionId)
    ? run.askedQuestionIds
    : [...run.askedQuestionIds, questionId];

  if (isCorrect || eventId === 'patch') {
    return { run: { ...run, askedQuestionIds }, hpLost: 0 };
  }

  const nextHp = Math.max(0, run.hp - VULN_EVENT_FAIL_DAMAGE);
  return {
    run: {
      ...run,
      hp: nextHp,
      status: nextHp <= 0 ? 'lost' : run.status,
      askedQuestionIds,
    },
    hpLost: run.hp - nextHp,
  };
}

/** イベントの事前調査(ディープスキャン)で除外されるダミー選択肢IDを1つ返す */
export function getFilteredOutQuizChoiceId(question: DeckQuizQuestion): string | null {
  return [...question.choices].reverse().find((c) => !c.isCorrect)?.id ?? null;
}

export interface QuizXpPreview {
  isMaxed: boolean;
  currentLevel: CardLevel;
  nextLevel: CardLevel;
  currentXp: number;
  nextXp: number;
  xpDelta: number;
  willLevelUp: boolean;
  willEvolve: boolean;
}

/** クイズ正解報酬のEXPをカードに与えた場合の変化(進化・強化プレビューおよびLv.3 MAX判定)を返す */
export function previewQuizXpReward(run: RunState, cardUid: string): QuizXpPreview {
  const card = run.deck.find((c) => c.uid === cardUid);
  if (!card) throw new Error(`card not found: ${cardUid}`);
  const xpDelta = run.fastGrowth ? XP_TO_LV3 : QUIZ_XP_REWARD;
  const isMaxed = card.level === 3 && Boolean(card.branchId);
  if (isMaxed) {
    return {
      isMaxed: true,
      currentLevel: 3,
      nextLevel: 3,
      currentXp: card.xp,
      nextXp: card.xp,
      xpDelta: 0,
      willLevelUp: false,
      willEvolve: false,
    };
  }
  const nextXp = card.xp + xpDelta;
  const nextLevel = levelForXp(nextXp);
  return {
    isMaxed: false,
    currentLevel: card.level,
    nextLevel,
    currentXp: card.xp,
    nextXp,
    xpDelta,
    willLevelUp: nextLevel > card.level,
    willEvolve: nextLevel === 3 && !card.branchId,
  };
}

/** クイズ正解報酬:好きなカード1枚に経験値 +2(試用ブースト時は+5) */
export function applyQuizXpReward(run: RunState, cardUid: string): { run: RunState; gain: XpGainEntry | null } {
  const target = run.deck.find((c) => c.uid === cardUid);
  if (!target) throw new Error(`card not found: ${cardUid}`);
  const hasNonMaxedCard = run.deck.some((c) => !(c.level === 3 && Boolean(c.branchId)));
  if (target.level === 3 && Boolean(target.branchId) && hasNonMaxedCard) {
    throw new Error('すでに最終進化(Lv.3 MAX)済みのカードには経験値を付与できません');
  }
  const delta = run.fastGrowth ? XP_TO_LV3 : QUIZ_XP_REWARD;
  const res = addXp(run.deck, run.pendingEvolutions, cardUid, delta);
  return {
    run: {
      ...run,
      deck: res.deck,
      pendingEvolutions: res.pendingEvolutions,
    },
    gain: res.entry,
  };
}

/** イベント2(パッチ適用)正解時の追加報酬:HP 15回復 または カード1枚削除 */
export function applyPatchBonus(
  run: RunState,
  choice: { type: 'heal' } | { type: 'remove'; cardUid: string },
): RunState {
  if (choice.type === 'heal') {
    return { ...run, hp: Math.min(run.maxHp, run.hp + PATCH_EVENT_HEAL) };
  }
  return {
    ...run,
    deck: run.deck.filter((c) => c.uid !== choice.cardUid),
    pendingEvolutions: run.pendingEvolutions.filter((id) => id !== choice.cardUid),
  };
}
