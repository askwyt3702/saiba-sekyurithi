// デッキ構築ローグライトの永続プロフィール(図鑑・弱点ノート・戦績・実績)。
// localStorage が使えない環境(Node テスト等)でも安全に動作する。
import { getQuizQuestionsByType, type DeckQuizQuestion } from '../data/securityLearningData';
import { CARD_DEFINITIONS, REWARD_CARD_IDS } from './cards';
import { ENEMY_DEFINITIONS } from './enemies';
import type { RunState } from './types';

export const DECK_PROFILE_STORAGE_KEY = 'cyber_mystery_deck_profile_v1';
export const MAX_BONUS_START_COINS = 3;

export interface AchievementDef {
  id: string;
  icon: string;
  title: string;
  description: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_clear', icon: '🏆', title: 'ARGUS 撃破', description: '6マスランを最後までクリアし、監視AI ARGUSを倒す。' },
  { id: 'elite_slayer', icon: '⛩️', title: '強敵突破', description: 'エリート敵「ゼロトラストゲート」を撃破する。' },
  { id: 'quiz_streak_3', icon: '🧠', title: '連続診断パーフェクト', description: 'イベントマスの連続クイズで3問連続正解を達成する。' },
  { id: 'evo_collector', icon: '🌟', title: '進化の探求者', description: 'Lv.3 進化先を累計5種類以上解放する。' },
  { id: 'card_collector', icon: '🎴', title: 'ツール収集家', description: '全12種類のカードをすべて図鑑に登録する。' },
  { id: 'weakness_cleared', icon: '📖', title: '弱点克服', description: 'ホームの弱点ノートで復習クイズに1問以上正解する。' },
];

export interface DeckProfileStats {
  runsPlayed: number;
  runsWon: number;
  elitesDefeated: number;
  maxEventStreak: number;
  totalQuizCorrect: number;
  reviewsCleared: number;
}

export interface DeckProfile {
  seenCardIds: string[];
  unlockedBranches: string[];
  seenEnemyIds: string[];
  wrongQuestionIds: string[];
  bonusStartCoins: number;
  stats: DeckProfileStats;
  achievements: string[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export function createEmptyProfile(): DeckProfile {
  return {
    seenCardIds: ['ssh_brute', 'firewall', 'port_scan', 'session_hijack'],
    unlockedBranches: [],
    seenEnemyIds: [],
    wrongQuestionIds: [],
    bonusStartCoins: 0,
    stats: {
      runsPlayed: 0,
      runsWon: 0,
      elitesDefeated: 0,
      maxEventStreak: 0,
      totalQuizCorrect: 0,
      reviewsCleared: 0,
    },
    achievements: [],
  };
}

export function loadDeckProfile(storage: StorageLike | null = getDefaultStorage()): DeckProfile {
  const base = createEmptyProfile();
  if (!storage) return base;
  try {
    const raw = storage.getItem(DECK_PROFILE_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<DeckProfile>;
    return {
      seenCardIds: Array.isArray(parsed.seenCardIds) ? parsed.seenCardIds : base.seenCardIds,
      unlockedBranches: Array.isArray(parsed.unlockedBranches) ? parsed.unlockedBranches : [],
      seenEnemyIds: Array.isArray(parsed.seenEnemyIds) ? parsed.seenEnemyIds : [],
      wrongQuestionIds: Array.isArray(parsed.wrongQuestionIds) ? parsed.wrongQuestionIds : [],
      bonusStartCoins: typeof parsed.bonusStartCoins === 'number' ? Math.max(0, parsed.bonusStartCoins) : 0,
      stats: { ...base.stats, ...(parsed.stats ?? {}) },
      achievements: Array.isArray(parsed.achievements) ? parsed.achievements : [],
    };
  } catch {
    return base;
  }
}

export function saveDeckProfile(profile: DeckProfile, storage: StorageLike | null = getDefaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(DECK_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // ストレージ容量超過や無効環境では無視する
  }
}

function unlockAchievement(achievements: string[], id: string): string[] {
  return achievements.includes(id) ? achievements : [...achievements, id];
}

function evaluateAchievements(profile: DeckProfile): DeckProfile {
  let achievements = [...profile.achievements];
  if (profile.stats.runsWon >= 1) achievements = unlockAchievement(achievements, 'first_clear');
  if (profile.stats.elitesDefeated >= 1) achievements = unlockAchievement(achievements, 'elite_slayer');
  if (profile.stats.maxEventStreak >= 3) achievements = unlockAchievement(achievements, 'quiz_streak_3');
  if (profile.unlockedBranches.length >= 5) achievements = unlockAchievement(achievements, 'evo_collector');
  if (REWARD_CARD_IDS.every((id) => profile.seenCardIds.includes(id))) {
    achievements = unlockAchievement(achievements, 'card_collector');
  }
  if (profile.stats.reviewsCleared >= 1) achievements = unlockAchievement(achievements, 'weakness_cleared');
  return { ...profile, achievements };
}

function uniqueAdd(list: string[], items: string[]): string[] {
  const set = new Set(list);
  for (const item of items) set.add(item);
  return [...set];
}

/** ラン中のカード・敵を図鑑に登録する */
export function recordDiscovery(profile: DeckProfile, cardIds: string[], enemyIds: string[]): DeckProfile {
  const validCards = cardIds.filter((id) => Boolean(CARD_DEFINITIONS[id]) && !CARD_DEFINITIONS[id].unplayable);
  const validEnemies = enemyIds.filter((id) => Boolean(ENEMY_DEFINITIONS[id]));
  return evaluateAchievements({
    ...profile,
    seenCardIds: uniqueAdd(profile.seenCardIds, validCards),
    seenEnemyIds: uniqueAdd(profile.seenEnemyIds, validEnemies),
  });
}

/** 進化先解放を記録する */
export function recordEvolutionUnlocked(profile: DeckProfile, branchId: string): DeckProfile {
  return evaluateAchievements({
    ...profile,
    unlockedBranches: uniqueAdd(profile.unlockedBranches, [branchId]),
  });
}

/** イベントクイズの回答結果を戦績・弱点ノートに記録する */
export function recordQuizOutcome(profile: DeckProfile, questionId: string, isCorrect: boolean, streak: number): DeckProfile {
  const wrongQuestionIds = isCorrect
    ? profile.wrongQuestionIds
    : uniqueAdd(profile.wrongQuestionIds, [questionId]);
  const nextStats: DeckProfileStats = {
    ...profile.stats,
    totalQuizCorrect: profile.stats.totalQuizCorrect + (isCorrect ? 1 : 0),
    maxEventStreak: isCorrect ? Math.max(profile.stats.maxEventStreak, streak) : profile.stats.maxEventStreak,
  };
  return evaluateAchievements({
    ...profile,
    wrongQuestionIds,
    stats: nextStats,
  });
}

/** エリート撃破を記録する */
export function recordEliteDefeat(profile: DeckProfile): DeckProfile {
  return evaluateAchievements({
    ...profile,
    stats: { ...profile.stats, elitesDefeated: profile.stats.elitesDefeated + 1 },
  });
}

/** ラン終了(勝利/敗北)を戦績に記録する */
export function recordRunResult(profile: DeckProfile, run: RunState): DeckProfile {
  const cardIds = run.deck.map((c) => c.defId);
  const branches = run.deck.map((c) => c.branchId).filter((b): b is string => Boolean(b));
  return evaluateAchievements({
    ...profile,
    seenCardIds: uniqueAdd(profile.seenCardIds, cardIds),
    unlockedBranches: uniqueAdd(profile.unlockedBranches, branches),
    stats: {
      ...profile.stats,
      runsPlayed: profile.stats.runsPlayed + 1,
      runsWon: profile.stats.runsWon + (run.status === 'won' ? 1 : 0),
    },
  });
}

/** 弱点ノートで復習クイズに正解したときの処理(リストから外し、次回開始コイン+1) */
export function resolveWeaknessReview(profile: DeckProfile, questionId: string, isCorrect: boolean): DeckProfile {
  if (!isCorrect) return profile;
  const wrongQuestionIds = profile.wrongQuestionIds.filter((id) => id !== questionId);
  const bonusStartCoins = Math.min(MAX_BONUS_START_COINS, profile.bonusStartCoins + 1);
  return evaluateAchievements({
    ...profile,
    wrongQuestionIds,
    bonusStartCoins,
    stats: {
      ...profile.stats,
      reviewsCleared: profile.stats.reviewsCleared + 1,
    },
  });
}

/** ラン開始時に次回開始コインボーナスを消費して受け取る */
export function consumeBonusStartCoins(profile: DeckProfile): { profile: DeckProfile; coins: number } {
  return {
    profile: { ...profile, bonusStartCoins: 0 },
    coins: profile.bonusStartCoins,
  };
}

/** 問題ID一覧から弱点ノートの問題データを取得する */
export function getWeaknessQuestions(wrongQuestionIds: string[]): DeckQuizQuestion[] {
  if (wrongQuestionIds.length === 0) return [];
  const all = [...getQuizQuestionsByType('TYPE A'), ...getQuizQuestionsByType('TYPE B')];
  const byId = new Map(all.map((q) => [q.id, q]));
  return wrongQuestionIds.map((id) => byId.get(id)).filter((q): q is DeckQuizQuestion => Boolean(q));
}
