// 1回のラン・成長・進化・報酬・イベント・闇市(docs/deckbattle-plan-v0.3.md の3章・5章・9章・10章)。
// 画面に依存しない純粋な関数で実装し、node --test と画面の両方から使う。
import { getQuizQuestionsByType, type DeckQuizQuestion } from '../data/securityLearningData';
import { createBattle, getCardDefinition } from './battle';
import { RARE_CARD_IDS, REWARD_CARD_IDS } from './cards';
import { ALL_RELIC_IDS, FORENSICS_LAB_XP, RELIC_DEFINITIONS, SIPHON_MODULE_HEAL } from './relics';
import { nextRandom, shuffled } from './rng';
import {
  ALL_MYSTERY_EVENT_IDS,
  LOADOUT_DEFINITIONS,
  MAX_SECURITY_LEVEL,
} from './roguelike';
import { ALL_TOOL_IDS, MAX_TOOLS, TOOL_DEFINITIONS } from './tools';
import type {
  BattleState,
  CardInstance,
  CardLevel,
  LoadoutId,
  MysteryEventId,
  RelicId,
  RunEventId,
  RunNode,
  RunState,
  ToolId,
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
export const MAX_EVENT_STREAK = 3;
export const RECON_COIN_DROP_RATE = 0.2;
export const STARTING_RECON_COINS = 2;
export const REST_HEAL_RATIO = 0.35;

/** 序盤でカードを育て、中盤の闇市と3回の休憩を経てボスに向かう16マス。 */
export const DEFAULT_RUN_NODES: RunNode[] = [
  { kind: 'battle', enemyIds: ['scanner_bot'] },
  { kind: 'event', eventId: 'vuln_check' },
  { kind: 'battle', enemyIds: ['ids_sensor', 'ids_sensor'] },
  { kind: 'rest' },
  { kind: 'battle', enemyIds: ['scanner_bot', 'ids_sensor'] },
  { kind: 'mystery' },
  { kind: 'battle', enemyIds: ['firewall_ai'], eliteEnemyIds: ['zero_trust_gate'] },
  { kind: 'shop' },
  { kind: 'event', eventId: 'patch' },
  { kind: 'rest' },
  { kind: 'battle', enemyIds: ['firewall_ai', 'scanner_bot'] },
  { kind: 'mystery' },
  { kind: 'battle', enemyIds: ['firewall_ai', 'ids_sensor'] },
  { kind: 'battle', enemyIds: ['zero_trust_gate', 'scanner_bot'] },
  { kind: 'rest' },
  { kind: 'boss', enemyIds: ['argus'] },
];

export function createCardInstance(defId: string, uid: string): CardInstance {
  return { uid, defId, level: 1, xp: 0 };
}

export function createRun(
  options: { fastGrowth?: boolean; loadoutId?: LoadoutId; securityLevel?: number } = {},
): RunState {
  const loadoutId: LoadoutId = options.loadoutId ?? 'balanced';
  const loadout = LOADOUT_DEFINITIONS[loadoutId] ?? LOADOUT_DEFINITIONS.balanced;
  const securityLevel = Math.max(0, Math.min(MAX_SECURITY_LEVEL, Math.floor(options.securityLevel ?? 0)));
  const maxHp = Math.max(25, loadout.maxHp - (securityLevel >= 3 ? 10 : 0));
  const deck = loadout.deckIds.map((defId, i) => createCardInstance(defId, `c${i + 1}`));
  return {
    status: 'playing',
    deck,
    hp: maxHp,
    maxHp,
    nodes: DEFAULT_RUN_NODES.map((n) => ({ ...n })),
    nodeIndex: 0,
    relics: [...loadout.relics],
    tools: [...loadout.tools],
    reconCoins: STARTING_RECON_COINS,
    currentBattleElite: false,
    pendingEvolutions: [],
    askedQuestionIds: [],
    fastGrowth: options.fastGrowth ?? false,
    loadoutId,
    securityLevel,
    seenMysteryIds: [],
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
export function createBattleForCurrentNode(run: RunState, seed: number, useElite = false): BattleState {
  const node = run.nodes[run.nodeIndex];
  if (node?.kind !== 'battle' && node?.kind !== 'boss') throw new Error('current node is not a battle');
  const enemyIds = useElite && node.kind === 'battle' && node.eliteEnemyIds ? node.eliteEnemyIds : node.enemyIds;
  return createBattle({
    deck: run.deck,
    playerHp: run.hp,
    playerMaxHp: run.maxHp,
    enemyIds,
    seed,
    relics: run.relics,
    tools: run.tools,
    securityLevel: run.securityLevel,
  });
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
  coinsDropped: number;
}

/** 戦闘終了時(勝利/敗北)に HP・経験値・進化待ち・報酬3択・解析コインドロップを反映する */
export function applyBattleResult(run: RunState, battle: BattleState, rewardSeed: number): BattleResolutionResult {
  if (battle.status === 'lost') {
    return {
      run: { ...run, hp: 0, status: 'lost' },
      xpGains: [],
      rewardChoices: [],
      healed: 0,
      coinsDropped: 0,
    };
  }
  if (battle.status !== 'won') {
    throw new Error('battle is not finished');
  }

  const node = run.nodes[run.nodeIndex];
  const isBoss = node?.kind === 'boss';
  const baseHp = Math.max(1, Math.min(run.maxHp, battle.player.hp));
  const siphonBonus = run.relics.includes('siphon_module') ? SIPHON_MODULE_HEAL : 0;
  const healAmount = isBoss ? 0 : Math.floor(run.maxHp * BATTLE_WIN_HEAL_RATIO) + siphonBonus;
  const nextHp = Math.min(run.maxHp, baseHp + healAmount);
  const healed = nextHp - baseHp;

  let deck = run.deck.map((c) => ({ ...c }));
  let pendingEvolutions = [...run.pendingEvolutions];
  const xpGains: XpGainEntry[] = [];

  for (const card of run.deck) {
    const uses = battle.usesThisBattle[card.uid] ?? 0;
    if (uses <= 0) continue;
    const baseDelta = run.fastGrowth ? uses * 3 + 2 : Math.min(MAX_BATTLE_XP, uses + 1);
    const delta = run.currentBattleElite ? baseDelta * 2 : baseDelta;
    const res = addXp(deck, pendingEvolutions, card.uid, delta);
    deck = res.deck;
    pendingEvolutions = res.pendingEvolutions;
    if (res.entry) xpGains.push(res.entry);
  }

  let rewardChoices: string[] = [];
  if (!isBoss) {
    if (run.currentBattleElite) {
      const rare = shuffled(RARE_CARD_IDS, rewardSeed).items[0];
      const others = shuffled(REWARD_CARD_IDS.filter((id) => id !== rare), rewardSeed + 1).items.slice(0, 2);
      rewardChoices = [rare, ...others];
    } else {
      rewardChoices = shuffled(REWARD_CARD_IDS, rewardSeed).items.slice(0, 3);
    }
  }

  // 倒した敵1体ごとに20%で解析コインがドロップ(エリート敵は確定1枚)
  let coinsDropped = 0;
  if (!isBoss) {
    if (run.currentBattleElite) {
      coinsDropped = 1;
    } else {
      let rng = rewardSeed + 97;
      for (const enemy of battle.enemies) {
        if (enemy.hp > 0) continue;
        const roll = nextRandom(rng);
        rng = roll.state;
        if (roll.value < RECON_COIN_DROP_RATE) {
          coinsDropped += 1;
        }
      }
    }
    if (run.relics.includes('coin_miner')) {
      coinsDropped += 1;
    }
  }

  return {
    run: {
      ...run,
      status: isBoss ? 'won' : run.status,
      hp: nextHp,
      deck,
      tools: [...battle.tools],
      reconCoins: run.reconCoins + coinsDropped,
      currentBattleElite: false,
      // ボスに勝てばランは終わりなので、Lv.3 に届いても進化先は選ばせない(結果画面へそのまま進む)
      pendingEvolutions: isBoss ? [] : pendingEvolutions,
    },
    xpGains,
    rewardChoices,
    healed,
    coinsDropped,
  };
}

/** 解析コインを1枚消費してイベントの事前調査を実行する */
export function spendReconCoin(run: RunState): RunState {
  if (run.reconCoins <= 0) {
    throw new Error('解析コインが足りません');
  }
  return {
    ...run,
    reconCoins: run.reconCoins - 1,
  };
}

export type CoinShopAction =
  | { type: 'heal' }
  | { type: 'tool'; toolId: ToolId }
  | { type: 'remove'; cardUid: string }
  | { type: 'relic'; relicId: RelicId };

/** 解析コインの闇市ショップで交換する */
export function spendCoinShop(run: RunState, action: CoinShopAction): RunState {
  if (run.status !== 'playing' || run.nodes[run.nodeIndex]?.kind !== 'shop') {
    throw new Error('闇市マスでのみ交換できます');
  }
  switch (action.type) {
    case 'heal':
      if (run.reconCoins < 1) throw new Error('解析コインが足りません');
      return {
        ...run,
        reconCoins: run.reconCoins - 1,
        hp: Math.min(run.maxHp, run.hp + 12),
      };
    case 'tool':
      if (run.reconCoins < 1) throw new Error('解析コインが足りません');
      if (run.tools.length >= MAX_TOOLS) throw new Error('ツール枠がいっぱいです');
      return {
        ...run,
        reconCoins: run.reconCoins - 1,
        tools: [...run.tools, action.toolId],
      };
    case 'remove':
      if (run.reconCoins < 2) throw new Error('解析コインが足りません');
      if (run.deck.length <= 1) throw new Error('これ以上カードを削除できません');
      return {
        ...removeCardFromDeck(run, action.cardUid),
        reconCoins: run.reconCoins - 2,
      };
    case 'relic':
      if (run.reconCoins < 3) throw new Error('解析コインが足りません');
      if (run.relics.includes(action.relicId)) throw new Error('すでに所持しています');
      return {
        ...grantRelic(run, action.relicId),
        reconCoins: run.reconCoins - 3,
      };
  }
}

export function pickShopTools(seed: number): ToolId[] {
  return shuffled(ALL_TOOL_IDS, seed).items.slice(0, 2);
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

export function getQuizXpReward(run: RunState): number {
  if (run.fastGrowth) return XP_TO_LV3;
  return QUIZ_XP_REWARD + (run.relics.includes('forensics_lab') ? FORENSICS_LAB_XP : 0);
}

/** クイズ正解報酬のEXPをカードに与えた場合の変化(進化・強化プレビューおよびLv.3 MAX判定)を返す */
export function previewQuizXpReward(run: RunState, cardUid: string): QuizXpPreview {
  const card = run.deck.find((c) => c.uid === cardUid);
  if (!card) throw new Error(`card not found: ${cardUid}`);
  const xpDelta = getQuizXpReward(run);
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

/** クイズ正解報酬を選んだカードに適用する */
export function applyQuizXpReward(run: RunState, cardUid: string): { run: RunState; gain: XpGainEntry | null } {
  const target = run.deck.find((c) => c.uid === cardUid);
  if (!target) throw new Error(`card not found: ${cardUid}`);
  const hasNonMaxedCard = run.deck.some((c) => !(c.level === 3 && Boolean(c.branchId)));
  if (target.level === 3 && Boolean(target.branchId) && hasNonMaxedCard) {
    throw new Error('すでに最終進化(Lv.3 MAX)済みのカードには経験値を付与できません');
  }
  const res = addXp(run.deck, run.pendingEvolutions, cardUid, getQuizXpReward(run));
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
  choice: { type: 'heal'; amount?: number } | { type: 'remove'; cardUid: string },
): RunState {
  if (choice.type === 'heal') {
    const amount = choice.amount ?? PATCH_EVENT_HEAL;
    return { ...run, hp: Math.min(run.maxHp, run.hp + amount) };
  }
  return removeCardFromDeck(run, choice.cardUid);
}

/** デッキから不要なカードを1枚削除する(圧縮用) */
export function removeCardFromDeck(run: RunState, cardUid: string): RunState {
  if (run.deck.length <= 1) return run;
  return {
    ...run,
    deck: run.deck.filter((c) => c.uid !== cardUid),
    pendingEvolutions: run.pendingEvolutions.filter((id) => id !== cardUid),
  };
}

/** 未所持のパッシブ装備を1つランダムに選ぶ(全部所持済みなら null) */
export function pickAvailableRelic(run: RunState, seed: number): RelicId | null {
  const available = ALL_RELIC_IDS.filter((id) => !run.relics.includes(id));
  if (available.length === 0) return null;
  return shuffled(available, seed).items[0];
}

/** パッシブ装備をランに追加する */
export function grantRelic(run: RunState, relicId: RelicId): RunState {
  if (run.relics.includes(relicId)) return run;
  return { ...run, relics: [...run.relics, relicId] };
}

/** イベント報酬用:3枚のカード候補を返す */
export function pickRewardPool(seed: number, count = 3): string[] {
  return shuffled(REWARD_CARD_IDS, seed).items.slice(0, count);
}

/** イベント3問目報酬用:レアカード候補を返す */
export function pickRarePool(seed: number): string[] {
  return shuffled(RARE_CARD_IDS, seed).items;
}

export type RestAction =
  | { type: 'heal' }
  | { type: 'upgrade'; cardUid: string }
  | { type: 'remove'; cardUid: string };

/** 休憩・システム保守マスの処理(大幅回復 / カード即強化・進化 / 不要カード削除) */
export function applyRestAction(run: RunState, action: RestAction): { run: RunState; summary: string } {
  if (action.type === 'heal') {
    const amount = Math.floor(run.maxHp * REST_HEAL_RATIO);
    const nextHp = Math.min(run.maxHp, run.hp + amount);
    const gained = nextHp - run.hp;
    return {
      run: { ...run, hp: nextHp },
      summary: `回線を保守し、HP を +${gained} 回復した（${nextHp}/${run.maxHp}）。`,
    };
  }
  if (action.type === 'remove') {
    const target = run.deck.find((c) => c.uid === action.cardUid);
    if (!target || run.deck.length <= 1) return { run, summary: '削除できるカードがありません。' };
    const def = getCardDefinition(target.defId);
    return {
      run: removeCardFromDeck(run, action.cardUid),
      summary: `${def.name} (${target.uid}) をデッキから削除した。`,
    };
  }
  const card = run.deck.find((c) => c.uid === action.cardUid);
  if (!card) return { run, summary: '強化対象が見つかりません。' };
  const def = getCardDefinition(card.defId);
  const delta = card.level === 1 ? Math.max(1, XP_TO_LV2 - card.xp) : card.level === 2 ? Math.max(1, XP_TO_LV3 - card.xp) : 0;
  if (delta <= 0) return { run, summary: `${def.name} はすでに最大レベルです。` };
  const res = addXp(run.deck, run.pendingEvolutions, card.uid, delta);
  const nextLv = res.entry?.newLevel ?? card.level;
  return {
    run: { ...run, deck: res.deck, pendingEvolutions: res.pendingEvolutions },
    summary:
      nextLv === 3
        ? `${def.name} が Lv.3 に到達！分岐進化を選べます。`
        : `${def.name} を Lv.${nextLv} に即チューニングした！`,
  };
}

/** ハプニングマスで発生するイベントを1つ選ぶ(同じラン内では重複を避ける) */
export function pickMysteryEvent(run: RunState, seed: number): MysteryEventId {
  const unseen = ALL_MYSTERY_EVENT_IDS.filter((id) => !run.seenMysteryIds.includes(id));
  const pool = unseen.length > 0 ? unseen : ALL_MYSTERY_EVENT_IDS;
  return shuffled(pool, seed).items[0];
}

/** ハプニングマスの選択肢を解決する */
export function resolveMysteryChoice(
  run: RunState,
  eventId: MysteryEventId,
  choiceId: string,
  seed: number,
): { run: RunState; summary: string; discoveredCardId?: string } {
  const baseRun: RunState = {
    ...run,
    seenMysteryIds: run.seenMysteryIds.includes(eventId) ? run.seenMysteryIds : [...run.seenMysteryIds, eventId],
  };

  if (eventId === 'dark_zero_day') {
    if (choiceId === 'buy_rare') {
      const nextHp = Math.max(1, baseRun.hp - 12);
      const rareId = shuffled(RARE_CARD_IDS, seed).items[0];
      const def = getCardDefinition(rareId);
      const withCard = pickRewardCard({ ...baseRun, hp: nextHp, reconCoins: baseRun.reconCoins + 1 }, rareId);
      return {
        run: withCard,
        summary: `HP−12の代償にレアカード「${def.name}」と解析コイン+1を入手した！`,
        discoveredCardId: rareId,
      };
    }
    return {
      run: { ...baseRun, reconCoins: baseRun.reconCoins + 1 },
      summary: '安全に通信ログだけ抜き取り、解析コイン +1 を獲得した。',
    };
  }

  if (eventId === 'overclock_terminal') {
    if (choiceId === 'extract_relic') {
      const nextHp = Math.max(1, baseRun.hp - 8);
      const relicId = pickAvailableRelic(baseRun, seed);
      if (relicId) {
        const relic = RELIC_DEFINITIONS[relicId];
        return {
          run: grantRelic({ ...baseRun, hp: nextHp }, relicId),
          summary: `HP−8と引き換えに常駐装備 「${relic.name}」を抽出した！`,
        };
      }
      return {
        run: { ...baseRun, hp: nextHp, reconCoins: baseRun.reconCoins + 2 },
        summary: 'すべての常駐装備を所持済みだったため、代わりに解析コイン +2 を抽出した！',
      };
    }
    const nextHp = Math.min(baseRun.maxHp, baseRun.hp + 8);
    return {
      run: { ...baseRun, hp: nextHp },
      summary: `冷却回路を流用し、HP を +${nextHp - baseRun.hp} 回復した。`,
    };
  }

  if (eventId === 'corrupted_forge') {
    const upgradable = baseRun.deck.filter((c) => c.level < 3 && !getCardDefinition(c.defId).unplayable);
    if (choiceId === 'force_evolve') {
      const nextHp = Math.max(1, baseRun.hp - 10);
      if (upgradable.length === 0) {
        return {
          run: { ...baseRun, hp: nextHp, reconCoins: baseRun.reconCoins + 1 },
          summary: '未進化カードがなかったため、代わりに解析コイン +1 を回収した（HP−10）。',
        };
      }
      const picked = shuffled(upgradable, seed).items[0];
      const def = getCardDefinition(picked.defId);
      const delta = Math.max(1, XP_TO_LV3 - picked.xp);
      const res = addXp(baseRun.deck, baseRun.pendingEvolutions, picked.uid, delta);
      return {
        run: { ...baseRun, hp: nextHp, deck: res.deck, pendingEvolutions: res.pendingEvolutions },
        summary: `HP−10の負荷と引き換えに 「${def.name}」が即座に Lv.3 進化待ちになった！`,
      };
    }
    if (choiceId === 'coin_tune') {
      if (baseRun.reconCoins < 1) {
        return { run: baseRun, summary: '解析コインが足りないため実行できなかった。' };
      }
      const nextCoins = baseRun.reconCoins - 1;
      if (upgradable.length === 0) {
        return { run: { ...baseRun, reconCoins: nextCoins }, summary: 'すでに全カードが最大レベルだった。' };
      }
      const picked = shuffled(upgradable, seed).items[0];
      const def = getCardDefinition(picked.defId);
      const res = addXp(baseRun.deck, baseRun.pendingEvolutions, picked.uid, 3);
      return {
        run: { ...baseRun, reconCoins: nextCoins, deck: res.deck, pendingEvolutions: res.pendingEvolutions },
        summary: `コイン1枚で 「${def.name}」に EXP+3 を安全に注入した！`,
      };
    }
    return { run: baseRun, summary: '危険を察知してサーバーから切断した。' };
  }

  // abandoned_cache
  if (choiceId === 'take_supplies') {
    let tools = [...baseRun.tools];
    let toolMsg = '';
    if (tools.length < MAX_TOOLS) {
      const toolId = shuffled(ALL_TOOL_IDS, seed).items[0];
      tools = [...tools, toolId];
      toolMsg = `緊急ツール 「${TOOL_DEFINITIONS[toolId].name}」と`;
    }
    return {
      run: { ...baseRun, tools, reconCoins: baseRun.reconCoins + 1 },
      summary: `${toolMsg}解析コイン +1 を回収した！`,
    };
  }
  const candidates = baseRun.deck.filter((c) => c.level < 3 && !getCardDefinition(c.defId).unplayable);
  if (candidates.length === 0) {
    return {
      run: { ...baseRun, reconCoins: baseRun.reconCoins + 1 },
      summary: '全カードが最大強化済みだったため、代わりに解析コイン +1 を獲得した。',
    };
  }
  const picked = shuffled(candidates, seed).items[0];
  const def = getCardDefinition(picked.defId);
  const res = addXp(baseRun.deck, baseRun.pendingEvolutions, picked.uid, 3);
  return {
    run: { ...baseRun, deck: res.deck, pendingEvolutions: res.pendingEvolutions },
    summary: `学習データを注入し、「${def.name}」に EXP+3 を付与した！`,
  };
}
