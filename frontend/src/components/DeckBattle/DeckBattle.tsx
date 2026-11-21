// SECTOR 06 のゲーム画面(戦闘・成長・進化・連続クイズ・闇市・エリート分岐)。
// ルールはすべて game/deckbattle/ にあり、この画面は表示と操作の受け渡しだけをする。
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeckQuizQuestion } from '../../game/data/securityLearningData';
import {
  cardNeedsTarget,
  createBattle,
  doesCardHitWeakness,
  endTurn,
  getCardDefinition,
  getCardStats,
  getEnemyIntent,
  getPlayCost,
  livingEnemies,
  playCard,
  activateBattleTool,
} from '../../game/deckbattle/battle';
import { getCardTelemetry } from '../../game/deckbattle/attackTelemetry';
import { ENEMY_DEFINITIONS, WEAKNESS_LABEL } from '../../game/deckbattle/enemies';
import {
  type DeckProfile,
  consumeBonusStartCoins,
  loadDeckProfile,
  recordDiscovery,
  recordEliteDefeat,
  recordEvolutionUnlocked,
  recordQuizOutcome,
  recordRunResult,
  saveDeckProfile,
} from '../../game/deckbattle/profile';
import { RELIC_DEFINITIONS } from '../../game/deckbattle/relics';
import { randomSeed } from '../../game/deckbattle/rng';
import {
  ALL_LOADOUT_IDS,
  LOADOUT_DEFINITIONS,
  MYSTERY_EVENTS,
  SECURITY_LEVELS,
} from '../../game/deckbattle/roguelike';
import {
  type CoinShopAction,
  type RestAction,
  MAX_EVENT_STREAK,
  REST_HEAL_RATIO,
  applyBattleResult,
  applyPatchBonus,
  applyQuizXpReward,
  applyRestAction,
  applyStartBonus,
  chooseEvolution,
  createBattleForCurrentNode,
  createRun,
  createTutorialTrialRun,
  getCurrentFloor,
  getCurrentNode,
  getFilteredOutQuizChoiceId,
  getQuizXpReward,
  getXpProgress,
  grantRelic,
  moveToNode,
  pickAvailableRelic,
  pickEventQuestion,
  pickMysteryEvent,
  pickRarePool,
  pickRewardCard,
  pickRewardPool,
  pickShopTools,
  previewQuizXpReward,
  removeCardFromDeck,
  resolveEventQuiz,
  resolveMysteryChoice,
  spendCoinShop,
  spendReconCoin,
} from '../../game/deckbattle/run';
import { MAX_TOOLS, TOOL_DEFINITIONS } from '../../game/deckbattle/tools';
import type {
  BattleLog,
  BattleState,
  BattleSnapshot,
  CardInstance,
  CardKind,
  EnemyActionEvent,
  EnemyMove,
  EnemyState,
  LoadoutId,
  MysteryEventId,
  RelicId,
  RunEventId,
  RunState,
  StartBonusId,
  ToolId,
  XpGainEntry,
} from '../../game/deckbattle/types';
import { bgm, isBgmEnabled, setBgmEnabled } from '../../game/sound/bgm';
import { isSoundEnabled, playSound, setSoundEnabled } from '../../game/sound/soundEffects';
import { CardArtwork } from './CardArtwork';
import { RunMapView } from './RunMapView';
import { OracleEncounter } from './OracleEncounter';
import { MAP_TOTAL_FLOORS } from '../../game/deckbattle/map';
import { EnemyArtwork } from './EnemyArtwork';
import { GameIcon } from '../GameIcon/GameIcon';
import { CARD_KIND_ICON as KIND_ICON, type GameIconName } from '../../game/deckbattle/icons';
import { EffectText, GlossaryList } from './EffectText';
import { HowToPlayModal } from './HowToPlayModal';
import { EvolutionOverlay, LevelUpOverlay, type LevelUpPresentation } from './CardGrowth';
import { hasSeenHowToPlay, markHowToPlaySeen } from '../../game/deckbattle/howToPlay';
import operatorBalancedImg from '../../assets/operator-balanced.jpg';
import operatorRedImg from '../../assets/operator-red.jpg';
import operatorBlueImg from '../../assets/operator-blue.jpg';
import operatorVirusImg from '../../assets/operator-virus.jpg';
import operatorBalancedSprite from '../../assets/operator-balanced-sprite.jpg';
import operatorBalancedAttack from '../../assets/operator-balanced-attack.jpg';
import operatorVirusSprite from '../../assets/operator-virus-sprite.jpg';

const LOADOUT_PORTRAIT: Record<LoadoutId, string> = {
  balanced: operatorBalancedImg,
  red_team: operatorRedImg,
  blue_team: operatorBlueImg,
  thermal_ops: operatorVirusImg,
};

type BattleSpriteMode = 'lighten' | 'mask-red' | 'mask-blue' | 'mask-balanced-attack';
interface LoadoutBattleSprites {
  idle: { src: string; mode: BattleSpriteMode };
  attack?: { src: string; mode: BattleSpriteMode };
  guard?: { src: string; mode: BattleSpriteMode };
  hurt?: { src: string; mode: BattleSpriteMode };
}

const LOADOUT_BATTLE_SPRITE: Record<LoadoutId, LoadoutBattleSprites> = {
  balanced: {
    idle: { src: operatorBalancedSprite, mode: 'lighten' },
    attack: { src: operatorBalancedAttack, mode: 'mask-balanced-attack' },
  },
  red_team: {
    idle: { src: operatorRedImg, mode: 'mask-red' },
  },
  blue_team: {
    idle: { src: operatorBlueImg, mode: 'mask-blue' },
  },
  thermal_ops: {
    idle: { src: operatorVirusSprite, mode: 'lighten' },
  },
};
import './DeckBattle.css';
import './RunSetup.css';
import './TerminalTheme.css';
import { CARD_DISCARD_MS, CARD_TRAVEL_MS, reduceBattleMotion, useBattleMotion } from './useBattleMotion';
import './BattleMotion.css';

const TURN_CUE_MS = 330;
const ENEMY_STEP_MS = 420;
const HIT_STEP_MS = 270;
const FX_MS = 500;
const PLAYER_POSE_MS = 460;
const KIND_LABEL: Record<CardKind, string> = { attack: '攻撃', defense: '防御', utility: '補助' };

type FxTone = 'hit' | 'shield' | 'heal' | 'buff' | 'bad' | 'burn';
type FxImpact = 'strike' | 'guard' | 'burn' | 'debuff' | 'buff' | 'heal';
type FxPower = 'normal' | 'heavy' | 'crit';
interface Fx {
  id: number;
  at: string;
  text: string;
  icon?: GameIconName;
  tone: FxTone;
  impact?: FxImpact;
  power?: FxPower;
  damaging?: boolean;
}
type FxSpec = Omit<Fx, 'id'>;

interface ActionBanner {
  id: number;
  actor: 'player' | 'enemy';
  kind: 'attack' | 'defense' | 'utility' | 'enemy';
  icon: GameIconName;
  title: string;
  detail?: string;
  tag?: string;
  command?: string;
  lore?: string;
  isAoe?: boolean;
  power?: FxPower;
}

const HEAVY_DAMAGE_THRESHOLD = 12;
const CRIT_DAMAGE_THRESHOLD = 25;

function damagePower(amount: number): FxPower {
  if (amount >= CRIT_DAMAGE_THRESHOLD) return 'crit';
  if (amount >= HEAVY_DAMAGE_THRESHOLD) return 'heavy';
  return 'normal';
}

function powerClass(fx: Pick<Fx, 'power'> | undefined, prefix: string): string {
  return fx?.power && fx.power !== 'normal' ? ` ${prefix}-${fx.power}` : '';
}

function formatDamageText(amount: number, prefix = ''): string {
  const power = damagePower(amount);
  if (power === 'crit') return `${prefix}-${amount}!!`;
  if (power === 'heavy') return `${prefix}-${amount}!`;
  return `${prefix}-${amount}`;
}

interface PlaybackState {
  base: BattleState;
  index: number;
  final: BattleState;
}

type Playback = PlaybackState & (
  | { actor: 'enemy'; events: EnemyActionEvent[] }
  | { actor: 'player'; events: Array<{ after: BattleSnapshot }>; banner: Omit<ActionBanner, 'id'>; playedCard: boolean }
);

type StagePhase =
  | 'setup'
  | 'battle'
  | 'map'
  | 'start_bonus'
  | 'post_battle'
  | 'evolve'
  | 'reward'
  | 'event'
  | 'mystery'
  | 'rest'
  | 'shop'
  | 'run_result';

interface MysteryViewState {
  eventId: MysteryEventId;
  summary: string | null;
}

interface PostBattleSummary {
  xpGains: XpGainEntry[];
  rewardChoices: string[];
  healed: number;
  coinsDropped: number;
}

interface EventViewState {
  eventId: RunEventId;
  step: number; // 1..3
  question: DeckQuizQuestion;
  reconUsed: boolean;
  selectedChoiceId: string | null;
  isCorrect: boolean | null;
  hpLost: number;
  stepRewardDone: boolean;
  xpGain: XpGainEntry | null;
  rewardCards: string[];
  rareCards: string[];
  offeredRelic: RelicId | null;
  finished: boolean;
}

interface DeckBattleProps {
  onBackToMissions: () => void;
}

function describeIntent(move: EnemyMove): { icon: GameIconName[]; text: string; title: string; tone: 'attack' | 'defend' | 'debuff' } {
  switch (move.type) {
    case 'attack':
      return {
        icon: ['attack'],
        text: move.hits && move.hits > 1 ? `${move.amount}×${move.hits}` : `${move.amount}`,
        title: move.hits && move.hits > 1 ? `${move.amount}ダメージの攻撃を${move.hits}回` : `${move.amount}ダメージの攻撃`,
        tone: 'attack',
      };
    case 'blockAttack':
      return { icon: ['shield', 'attack'], text: `${move.block} / ${move.amount}`, title: `FW${move.block}を張って、${move.amount}ダメージの攻撃`, tone: 'attack' };
    case 'block':
      return { icon: ['shield'], text: `${move.amount}`, title: `FW${move.amount}を張る`, tone: 'defend' };
    case 'buff':
      return { icon: ['buff'], text: `+${move.amount}`, title: `攻撃力を+${move.amount}する(ずっと続く)`, tone: 'debuff' };
    case 'detect':
      return { icon: ['detect'], text: '検知', title: `検知:次のターンの帯域が${move.amount}減る`, tone: 'debuff' };
    case 'noise':
      return { icon: ['noise'], text: `×${move.count}`, title: `使えないノイズを${move.count}枚、捨て札に入れる`, tone: 'debuff' };
  }
}

function fxForEvent(ev: EnemyActionEvent): FxSpec[] {
  switch (ev.kind) {
    case 'attack': {
      const effects: FxSpec[] = [];
      if (ev.damage > 0) {
        effects.push({
          at: 'player', text: formatDamageText(ev.damage), tone: 'hit', impact: 'strike',
          damaging: true, power: damagePower(ev.damage),
        });
      }
      if (ev.blocked > 0 || ev.damage === 0) {
        effects.push({
          at: 'player', icon: 'shield', text: ev.blocked ? `FWで ${ev.blocked} 防御` : '防いだ！',
          tone: 'shield', impact: 'guard',
        });
      }
      return effects;
    }
    case 'block':
      return [{ at: ev.enemyUid, icon: 'shield', text: `+FW${ev.amount}`, tone: 'shield', impact: 'guard' }];
    case 'buff':
      return [{ at: ev.enemyUid, icon: 'buff', text: `攻撃力+${ev.amount}`, tone: 'bad', impact: 'buff' }];
    case 'detect':
      return [{ at: 'player', icon: 'detect', text: `検知:帯域-${ev.amount}`, tone: 'bad', impact: 'debuff' }];
    case 'noise':
      return [{ at: 'player', icon: 'noise', text: `ノイズ+${ev.count}`, tone: 'bad', impact: 'debuff' }];
    case 'retaliate':
      return ev.damage > 0 ? [
        {
          at: ev.enemyUid,
          icon: 'retaliate',
          text: formatDamageText(ev.damage, '反撃'),
          tone: 'hit',
          impact: 'strike',
          damaging: true,
          power: damagePower(ev.damage),
        },
      ] : [{ at: ev.enemyUid, icon: 'shield', text: '反撃を防御', tone: 'shield', impact: 'guard' }];
    case 'burn':
      return [
        {
          at: ev.enemyUid,
          icon: 'burn',
          text: formatDamageText(ev.damage, 'ウイルス'),
          tone: 'burn',
          impact: 'burn',
          damaging: true,
          power: damagePower(ev.damage),
        },
      ];
  }
}

function bannerForEnemyEvent(ev: EnemyActionEvent, base: BattleState): Omit<ActionBanner, 'id'> {
  const enemy = base.enemies.find((e) => e.uid === ev.enemyUid);
  const name = enemy?.name ?? '敵';
  const icon: GameIconName = enemy?.icon ?? 'elite';
  switch (ev.kind) {
    case 'attack':
      return {
        actor: 'enemy',
        kind: 'enemy',
        icon,
        title: `${name} の攻撃${ev.hits > 1 ? ` ${ev.hit}/${ev.hits}` : ''}`,
        detail: ev.damage > 0 ? `→ あなた · ${ev.damage} ダメージ` : '→ あなた · FWで防御',
        power: ev.damage > 0 ? damagePower(ev.damage) : 'normal',
      };
    case 'block':
      return { actor: 'enemy', kind: 'enemy', icon, title: `${name} の防御`, detail: `FW +${ev.amount}` };
    case 'buff':
      return { actor: 'enemy', kind: 'enemy', icon, title: `${name} の強化`, detail: `攻撃力 +${ev.amount}` };
    case 'detect':
      return { actor: 'enemy', kind: 'enemy', icon, title: `${name} の検知`, detail: `次ターン帯域 -${ev.amount}` };
    case 'noise':
      return { actor: 'enemy', kind: 'enemy', icon, title: `${name} の妨害`, detail: `ノイズ ×${ev.count} 混入` };
    case 'retaliate':
      return {
        actor: 'player',
        kind: 'defense',
        icon: 'retaliate',
        title: '反撃トラップ発動！',
        detail: `${name} に ${ev.damage} ダメージ`,
        power: damagePower(ev.damage),
      };
    case 'burn':
      return {
        actor: 'player',
        kind: 'attack',
        icon: 'burn',
        title: 'ウイルスダメージ発動！',
        detail: `${name} に ${ev.damage} ダメージ`,
        power: damagePower(ev.damage),
      };
  }
}

function countNoiseCards(state: BattleState): number {
  const allUids = [...state.hand, ...state.drawPile, ...state.discard];
  return allUids.filter((uid) => state.cards[uid]?.defId === 'noise').length;
}

function fxForEnemyDamage(before: BattleSnapshot['enemies'], after: BattleSnapshot['enemies'], burn = false): FxSpec[] {
  const specs: FxSpec[] = [];
  for (const enemy of after) {
    const prev = before.find((e) => e.uid === enemy.uid);
    if (!prev) continue;
    const hpLost = prev.hp - enemy.hp;
    const blockLost = prev.block - enemy.block;
    if (hpLost > 0) {
      specs.push({
        at: enemy.uid,
        text: formatDamageText(hpLost, burn ? 'ウイルス ' : ''),
        icon: burn ? 'burn' : undefined,
        tone: burn ? 'burn' : 'hit',
        impact: burn ? 'burn' : 'strike',
        damaging: true,
        power: damagePower(hpLost),
      });
    }
    if (blockLost > 0) {
      specs.push({
        at: enemy.uid,
        text: hpLost > 0 ? `FW破壊 -${blockLost}` : `FW-${blockLost}`,
        tone: 'shield',
        impact: hpLost > 0 ? undefined : 'guard',
      });
    }
  }
  return specs;
}

function fxForPlay(before: BattleState, after: BattleState): FxSpec[] {
  const specs: FxSpec[] = [];
  for (const enemy of after.enemies) {
    const prev = before.enemies.find((e) => e.uid === enemy.uid);
    if (!prev) continue;
    if (enemy.burn && !prev.burn) {
      specs.push({ at: enemy.uid, icon: 'burn', text: `ウイルス${enemy.burn.amount}`, tone: 'burn', impact: 'burn' });
    } else if (enemy.burn && prev.burn && enemy.burn.amount > prev.burn.amount) {
      specs.push({
        at: enemy.uid,
        icon: 'burn',
        text: `ウイルス+${enemy.burn.amount - prev.burn.amount}`,
        tone: 'burn',
        impact: 'burn',
      });
    }
    const prevVuln = prev.vulnerable ?? 0;
    const nextVuln = enemy.vulnerable ?? 0;
    if (nextVuln > prevVuln) {
      specs.push({ at: enemy.uid, icon: 'vulnerable', text: `脆弱 ${nextVuln}T`, tone: 'bad', impact: 'debuff' });
    }
    const prevJam = prev.jammed ?? 0;
    const nextJam = enemy.jammed ?? 0;
    if (nextJam > prevJam) {
      specs.push({ at: enemy.uid, icon: 'jam', text: `ジャム ${nextJam}T`, tone: 'bad', impact: 'debuff' });
    }
    if (prev.attackBonus > enemy.attackBonus) {
      specs.push({ at: enemy.uid, icon: 'cancel', text: '攻撃強化解除', tone: 'buff', impact: 'debuff' });
    }
  }

  const blockGain = after.player.block - before.player.block;
  if (blockGain > 0) specs.push({ at: 'player', icon: 'shield', text: `+${blockGain} FW`, tone: 'shield', impact: 'guard' });

  const hpGain = after.player.hp - before.player.hp;
  if (hpGain > 0) specs.push({ at: 'player', icon: 'heal', text: `+${hpGain} HP`, tone: 'heal', impact: 'heal' });
  const selfDmg = before.player.hp - after.player.hp;
  if (selfDmg > 0) specs.push({ at: 'player', text: `-${selfDmg} HP`, tone: 'hit', impact: 'strike', power: damagePower(selfDmg) });

  const noisePurged = countNoiseCards(before) - countNoiseCards(after);
  if (noisePurged > 0) {
    specs.push({ at: 'player', icon: 'purge', text: `ノイズ${noisePurged}枚消去`, tone: 'heal', impact: 'buff' });
  }

  const drawn = after.hand.filter((uid) => !before.hand.includes(uid)).length;
  if (drawn > 0) specs.push({ at: 'player', icon: 'layers', text: `+${drawn}枚ドロー`, tone: 'buff', impact: 'buff' });

  const energyGain = after.player.energy - before.player.energy;
  if (energyGain > 0) specs.push({ at: 'player', icon: 'energy', text: `帯域+${energyGain}`, tone: 'buff', impact: 'buff' });

  if (after.modifiers.reconCombo === 'done' && before.modifiers.reconCombo === 'ready') {
    specs.push({ at: 'player', icon: 'combo', text: '解析コンボ +1EN', tone: 'buff', impact: 'buff' });
  }
  if (after.modifiers.nextAttackBonus > before.modifiers.nextAttackBonus) {
    specs.push({
      at: 'player',
      icon: 'nextAttack',
      text: `次攻撃+${after.modifiers.nextAttackBonus - before.modifiers.nextAttackBonus}`,
      tone: 'buff',
      impact: 'buff',
    });
  }
  if (after.modifiers.repeatNextAttack && !before.modifiers.repeatNextAttack) {
    specs.push({ at: 'player', icon: 'repeat', text: '次攻撃2回発動', tone: 'buff', impact: 'buff' });
  }
  if (after.modifiers.nextCardDiscount > before.modifiers.nextCardDiscount) {
    specs.push({
      at: 'player',
      icon: 'discount',
      text: `次カード-${after.modifiers.nextCardDiscount - before.modifiers.nextCardDiscount}EN`,
      tone: 'buff',
      impact: 'buff',
    });
  }
  if (after.player.retaliate > before.player.retaliate) {
    specs.push({
      at: 'player',
      icon: 'retaliate',
      text: `反撃+${after.player.retaliate - before.player.retaliate}`,
      tone: 'buff',
      impact: 'buff',
    });
  }
  if (
    after.player.turnBlockBonus > before.player.turnBlockBonus ||
    after.player.turnDrawBonus > before.player.turnDrawBonus ||
    after.player.turnEnergyBonus > before.player.turnEnergyBonus ||
    after.player.turnAttackBonus > before.player.turnAttackBonus
  ) {
    specs.push({ at: 'player', icon: 'persistent', text: '常駐効果セット', tone: 'buff', impact: 'buff' });
  }
  return specs;
}

function snapshotState(base: BattleState, event: { after: BattleSnapshot }): BattleState {
  const { after } = event;
  return {
    ...base,
    player: { ...base.player, hp: after.playerHp, block: after.playerBlock },
    enemies: base.enemies.map((e) => {
      const snap = after.enemies.find((s) => s.uid === e.uid);
      return snap ? { ...e, hp: snap.hp, block: snap.block } : e;
    }),
  };
}

function playerFrames(final: BattleState, frames: BattleSnapshot[] = []) {
  const last = frames.at(-1);
  const after: BattleSnapshot = {
    playerHp: final.player.hp,
    playerBlock: final.player.block,
    enemies: final.enemies,
  };
  const enemyChanged = !last ||
    after.enemies.some((enemy, i) => last.enemies[i]?.hp !== enemy.hp || last.enemies[i]?.block !== enemy.block);
  if (enemyChanged) return [...frames, after].map((snapshot) => ({ after: snapshot }));
  return frames.map((snapshot) => ({
    after: snapshot === last ? { ...snapshot, playerHp: after.playerHp, playerBlock: after.playerBlock } : snapshot,
  }));
}

function buildEventStep(run: RunState, eventId: RunEventId, step: number): EventViewState {
  const seed = randomSeed();
  return {
    eventId,
    step,
    question: pickEventQuestion(run, eventId, seed),
    reconUsed: false,
    selectedChoiceId: null,
    isCorrect: null,
    hpLost: 0,
    stepRewardDone: false,
    xpGain: null,
    rewardCards: pickRewardPool(seed + 3),
    rareCards: pickRarePool(seed + 7),
    offeredRelic: pickAvailableRelic(run, seed + 11),
    finished: false,
  };
}

function updateProfile(mutator: (p: DeckProfile) => DeckProfile): void {
  const next = mutator(loadDeckProfile());
  saveDeckProfile(next);
}

function createRunWithProfileCoins(
  fastGrowth: boolean,
  loadoutId: LoadoutId = 'balanced',
  securityLevel = 0,
): RunState {
  // マップは毎回ランダムな種で作る(種を省くとテスト用の決まったマップになる)
  const fresh = createRun({ fastGrowth, loadoutId, securityLevel, mapSeed: randomSeed() });
  const { profile, coins } = consumeBonusStartCoins(loadDeckProfile());
  if (coins > 0) saveDeckProfile(profile);
  return coins > 0 ? { ...fresh, reconCoins: fresh.reconCoins + coins } : fresh;
}

/** 最初のランの作成用:開始コインを読むだけで、消費(保存)はしない */
function createInitialRun(): RunState {
  const fresh = createRun();
  const coins = loadDeckProfile().bonusStartCoins;
  return coins > 0 ? { ...fresh, reconCoins: fresh.reconCoins + coins } : fresh;
}

function BattleLogPanel({ entries }: { entries: BattleLog[] }) {
  const recent = entries.slice(-30).reverse();
  return (
    <div className="db-log">
      <ol className="db-log__list db-log__list--recent" aria-label="直近の戦闘ログ">
        {recent.slice(0, 2).map((entry) => <BattleLogRow key={entry.id} entry={entry} />)}
      </ol>
      <details>
        <summary className="db-log__summary">戦闘ログ</summary>
        <ol className="db-log__list db-log__list--full" aria-label="詳細な戦闘ログ">
          {recent.map((entry) => <BattleLogRow key={entry.id} entry={entry} />)}
        </ol>
      </details>
    </div>
  );
}

function BattleLogRow({ entry }: { entry: BattleLog }) {
  const actor = entry.actor ?? 'system';
  const label = actor === 'player' ? '自分' : actor === 'enemy' ? '敵' : '進行';
  return (
    <li className={`db-log__item db-log__item--actor-${actor} ${entry.effect ? `db-log__item--${entry.effect}` : ''}`}>
      <span className={`db-log__badge db-log__badge--${actor}`}>{label}</span>
      <span className="db-log__turn">T{entry.turn}</span>
      <span className="db-log__msg" title={entry.message}><EffectText text={entry.message} /></span>
    </li>
  );
}

interface Turn1Coach {
  step: 1 | 2 | 3;
  title: string;
  detail: string;
  highlightCardUid?: string;
  cardBadge?: string;
  highlightEndTurn?: boolean;
  highlightIntentEnemyUid?: string;
  intentBadge?: string;
}

function computeTurn1Coach(state: BattleState, playsThisTurn: number): Turn1Coach {
  const target = livingEnemies(state)[0];
  const affordable = state.hand
    .map((uid) => {
      const card = state.cards[uid];
      const def = getCardDefinition(card.defId);
      const stats = getCardStats(card);
      const cost = getPlayCost(state, uid);
      return { uid, def, stats, cost };
    })
    .filter((c) => !c.def.unplayable && c.cost <= state.player.energy);

  if (affordable.length === 0 || playsThisTurn >= 2) {
    return {
      step: 3,
      highlightEndTurn: true,
      title: '「ターン終了」を押して敵の行動を見よう！',
      detail: '自分の行動が終わったら右下の「ターン終了」をクリック。次のターンに帯域（EN）は全回復します。',
    };
  }

  const weakAttack = target
    ? affordable.find((c) => c.def.kind === 'attack' && doesCardHitWeakness(c.stats, target))
    : undefined;
  const anyAttack = affordable.find((c) => c.def.kind === 'attack');
  const anyUtility = affordable.find((c) => c.def.kind === 'utility');
  const anyDefense = affordable.find((c) => c.def.kind === 'defense');

  if (playsThisTurn === 0) {
    if (weakAttack) {
      return {
        step: 1,
        highlightCardUid: weakAttack.uid,
        cardBadge: '弱点 ×1.5',
        title: '光っているカードで弱点を突こう！',
        detail: '敵の弱点に合う攻撃は 1.5倍ダメージ！まずは光っているカードをクリックしてみよう。',
      };
    }
    if (anyUtility && state.modifiers.reconCombo === 'none' && anyAttack) {
      return {
        step: 1,
        highlightCardUid: anyUtility.uid,
        cardBadge: 'コンボ始動',
        title: '補助カードでコンボを始めよう！',
        detail: '補助カードのあとに攻撃カードを使うと「解析コンボ」で帯域（EN）が +1 増えるよ。',
      };
    }
    const pick = anyAttack ?? affordable[0];
    return {
      step: 1,
      highlightCardUid: pick.uid,
      cardBadge: 'ここをクリック',
      title: '最初の一手を打ってみよう！',
      detail: '光っているカードをクリックすると、帯域（EN）を使ってカードを発動できるよ。',
    };
  }

  if (state.modifiers.reconCombo === 'ready' && (weakAttack ?? anyAttack)) {
    const pick = weakAttack ?? anyAttack!;
    return {
      step: 2,
      highlightCardUid: pick.uid,
      cardBadge: 'コンボ発動!',
      title: '攻撃カードで「解析コンボ」を決めよう！',
      detail: '光っている攻撃カードをクリック！コンボ発動で帯域（EN）が +1 回復するよ。',
    };
  }
  const enemyMove = target ? getEnemyIntent(target) : null;
  const enemyAttacking = enemyMove?.type === 'attack' || enemyMove?.type === 'blockAttack';
  if (target && enemyAttacking && state.player.block === 0 && anyDefense) {
    const incoming =
      enemyMove.type === 'attack' && enemyMove.hits && enemyMove.hits > 1
        ? `${enemyMove.amount}×${enemyMove.hits}`
        : `${enemyMove.amount}`;
    return {
      step: 2,
      highlightCardUid: anyDefense.uid,
      cardBadge: 'FWで防ごう！',
      highlightIntentEnemyUid: target.uid,
      intentBadge: `次の敵の攻撃（${incoming}）`,
      title: '敵の攻撃を FW（盾）で防ごう！',
      detail: `敵の頭上に次の攻撃（${incoming}ダメージ）が表示されているよ。光っている防御カードでFWを張って防ごう！`,
    };
  }
  const nextPick = weakAttack ?? anyAttack ?? anyDefense ?? affordable[0];
  return {
    step: 2,
    highlightCardUid: nextPick.uid,
    cardBadge: '続けて使う',
    title: 'もう1枚カードを使ってみよう！',
    detail: '帯域（EN）が残っているうちは何枚でもカードを使えるよ。光っているカードをクリック！',
  };
}

export function DeckBattle({ onBackToMissions }: DeckBattleProps) {
  const { hoverProps, previewNode, hoveredUid } = useCardHoverPreview();
  const [runNumber, setRunNumber] = useState(0);
  // useState の初期化は開発時(StrictMode)に2回呼ばれるため、ここで開始コインを消費すると2回目が0枚になる。
  // 読むのは初期化で、消費は下の useEffect で1回だけ行う
  const [run, setRun] = useState<RunState>(createInitialRun);
  const [levelUps, setLevelUps] = useState<LevelUpPresentation[]>([]);
  const cardPositions = useRef(new Map<string, DOMRect>());
  // 戦闘の画面は、最初の戦闘マスに入るまで使わない。それまでの間に表示が崩れないよう、仮の戦闘を入れておく
  const [battle, setBattle] = useState<BattleState>(() =>
    createBattle({ deck: run.deck, playerHp: run.hp, playerMaxHp: run.maxHp, enemyIds: ['scanner_bot'], seed: 1 }),
  );
  const [showMap, setShowMap] = useState(false);
  const startBonusClaimed = useRef(false);
  const [phase, setPhase] = useState<StagePhase>('setup');
  const [postBattle, setPostBattle] = useState<PostBattleSummary | null>(null);
  const [evolveOrigin, setEvolveOrigin] = useState<'post_battle' | 'event' | 'rest' | 'mystery'>('post_battle');
  const [eventView, setEventView] = useState<EventViewState | null>(null);
  const [mysteryView, setMysteryView] = useState<MysteryViewState | null>(null);
  const [restSummary, setRestSummary] = useState<string | null>(null);
  const [showDeckModal, setShowDeckModal] = useState(false);
  // 遊び方モーダルは「遊び方」ボタンからいつでも開ける。初回戦闘の1ターン目は軽いインタラクティブガイドで誘導する
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [turn1CoachActive, setTurn1CoachActive] = useState(() => !hasSeenHowToPlay());
  const closeHowToPlay = useCallback(() => {
    markHowToPlaySeen();
    setShowHowToPlay(false);
  }, []);
  const dismissTurn1Coach = useCallback(() => {
    markHowToPlaySeen();
    setTurn1CoachActive(false);
  }, []);

  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [audioOn, setAudioOn] = useState(() => isSoundEnabled() || isBgmEnabled());
  const [notice, setNotice] = useState<string | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [fx, setFx] = useState<Fx[]>([]);
  const [banner, setBanner] = useState<ActionBanner | null>(null);
  const [bossPhaseCutin, setBossPhaseCutin] = useState<{ id: number; name: string; sub: string } | null>(null);
  const fxId = useRef(1);
  const bannerTimer = useRef<number | null>(null);
  const phaseCutinTimer = useRef<number | null>(null);

  const maybeTriggerBossPhase2 = useCallback((before: BattleState, after: BattleState) => {
    const awakened = after.enemies.find((enemy) => {
      const prev = before.enemies.find((p) => p.uid === enemy.uid);
      return prev && prev.phase === 1 && enemy.phase === 2 && enemy.hp > 0;
    });
    if (!awakened) return;
    playSound('alert');
    if (phaseCutinTimer.current !== null) window.clearTimeout(phaseCutinTimer.current);
    const id = fxId.current++;
    const sub =
      awakened.defId === 'aegis_omega'
        ? '行動パターン変化：重装甲FW34 ＆ 攻撃強化＋連撃'
        : awakened.defId === 'hydra_net'
          ? '行動パターン変化：4連撃バースト ＆ 検知による帯域妨害'
          : '行動パターン変化：連続攻撃 ＆ 超高出力バースト';
    setBossPhaseCutin({ id, name: awakened.name, sub });
    phaseCutinTimer.current = window.setTimeout(() => {
      setBossPhaseCutin((prev) => (prev?.id === id ? null : prev));
      phaseCutinTimer.current = null;
    }, 1750);
  }, []);

  const showBanner = useCallback((spec: Omit<ActionBanner, 'id'>, duration = FX_MS) => {
    if (bannerTimer.current !== null) window.clearTimeout(bannerTimer.current);
    const id = fxId.current++;
    setBanner({ ...spec, id });
    bannerTimer.current = window.setTimeout(() => {
      setBanner((prev) => (prev?.id === id ? null : prev));
      bannerTimer.current = null;
    }, duration);
  }, []);

  const actionLocked = useRef(false);
  const settling = playback !== null && playback.index === playback.events.length;
  const shown = playback ? settling ? playback.final
    : playback.index >= 0 ? snapshotState(playback.base, playback.events[playback.index]) : playback.base
    : battle;
  const { layer: motionLayer, launch: launchCard, discard: animateDiscard, clear: clearMotion, drawing, isDrawing } =
    useBattleMotion(shown.hand, shown.turn, `${runNumber}-${run.currentNodeId}`, phase === 'battle' && shown.status === 'playing');
  const activeEnemyAction = playback?.actor === 'enemy' ? playback.events[playback.index] : undefined;
  const actingUid = activeEnemyAction?.enemyUid;
  const busy = playback !== null || drawing || battle.status !== 'playing' || phase !== 'battle';
  const yourTurnCue = settling && playback.actor === 'enemy' && shown.status === 'playing';

  const showLevelUps = useCallback((nextRun: RunState) => {
    const previousCards = new Map(run.deck.map((card) => [card.uid, card]));
    const upgrades = nextRun.deck.flatMap((card) => {
      const before = previousCards.get(card.uid);
      if (before?.level !== 1 || card.level < 2) return [];
      const source = document.querySelector(`[data-growth-card="${CSS.escape(card.uid)}"]`)?.getBoundingClientRect();
      return [{ before, after: { ...card, level: 2 as const, branchId: undefined }, source: source ?? cardPositions.current.get(card.uid) }];
    });
    if (upgrades.length > 0) setLevelUps(upgrades);
  }, [run.deck]);

  // 最初のランに渡した開始コインを、プロフィールから消費する
  useEffect(() => {
    const profile = loadDeckProfile();
    if (profile.bonusStartCoins > 0) saveDeckProfile(consumeBonusStartCoins(profile).profile);
  }, []);

  const pushFx = useCallback((specs: FxSpec[], duration = FX_MS) => {
    if (specs.length === 0) return;
    const added = specs.map((s) => ({ ...s, id: fxId.current++ }));
    setFx((prev) => [...prev, ...added]);
    const ids = new Set(added.map((a) => a.id));
    window.setTimeout(() => setFx((prev) => prev.filter((f) => !ids.has(f.id))), duration);
  }, []);

  const handleBattleFinished = useCallback(
    (finishedBattle: BattleState) => {
      const wasElite = run.currentBattleElite;
      const resolved = applyBattleResult(run, finishedBattle, randomSeed());
      updateProfile((p) => {
        let next = recordDiscovery(
          p,
          resolved.run.deck.map((c) => c.defId),
          finishedBattle.enemies.map((e) => e.defId),
        );
        if (wasElite && finishedBattle.status === 'won') next = recordEliteDefeat(next);
        if (resolved.run.status !== 'playing') next = recordRunResult(next, resolved.run);
        return next;
      });
      setRun(resolved.run);
      if (resolved.run.status === 'lost') {
        setPhase('run_result');
        return;
      }
      showLevelUps(resolved.run);
      setPostBattle({
        xpGains: resolved.xpGains,
        rewardChoices: resolved.rewardChoices,
        healed: resolved.healed,
        coinsDropped: resolved.coinsDropped,
      });
      setPhase('post_battle');
    },
    [run, showLevelUps],
  );

  const completePlayback = useCallback((current: Playback, skipped = false) => {
    if (!actionLocked.current) return;
    actionLocked.current = false;
    if (skipped) {
      clearMotion(current.index < current.events.length);
      setFx([]);
      setBanner(null);
      setBossPhaseCutin(null);
    } else {
      maybeTriggerBossPhase2(current.base, current.final);
    }
    setBattle(current.final);
    setPlayback(null);
    if (current.final.status !== 'playing') {
      playSound(current.final.status === 'won' ? 'extract' : 'alert');
      handleBattleFinished(current.final);
    }
  }, [clearMotion, handleBattleFinished, maybeTriggerBossPhase2]);

  useEffect(() => {
    if (!playback) return;
    const { actor, base, events, final, index } = playback;
    const next = index + 1;
    const reduced = reduceBattleMotion();
    const schedule = (callback: () => void, duration: number) => {
      const timer = window.setTimeout(callback, reduced ? Math.min(duration, 180) : duration);
      return () => window.clearTimeout(timer);
    };

    if (settling) {
      return schedule(() => completePlayback(playback), actor === 'enemy' ? TURN_CUE_MS : CARD_DISCARD_MS);
    }
    if (next === events.length) {
      return schedule(() => {
        if (actor === 'player') animateDiscard();
        else setBanner(null);
        setPlayback({ ...playback, index: next });
      }, actor === 'player' ? (final.status === 'playing' ? 150 : 265) : ENEMY_STEP_MS);
    }

    if (playback.actor === 'player') {
      return schedule(() => {
        const previous = events[index]?.after.enemies ?? base.enemies;
        const frame = events[next].after;
        const damage = fxForEnemyDamage(previous, frame.enemies, frame.damageKind === 'burn');
        const power = damage.find((spec) => spec.power === 'crit')?.power ??
          damage.find((spec) => spec.power === 'heavy')?.power ?? 'normal';
        const finalFrame = next === events.length - 1;
        pushFx(finalFrame ? [...damage, ...fxForPlay(base, final)] : damage);
        const { banner: action } = playback;
        if (action.kind === 'attack' && frame.damageKind !== 'burn') {
          pushFx([{ at: 'player-launch', text: '', tone: 'buff', power }], PLAYER_POSE_MS);
        }
        playSound(action.kind === 'attack' ? 'breach' : action.kind === 'defense' ? 'recover' : 'scan');
        const title = frame.damageKind === 'burn' ? 'ウイルスダメージ'
          : events.length > 1 ? `${action.title} · ${next + 1}/${events.length}` : action.title;
        showBanner({ ...action, title, power }, finalFrame && action.command ? 1850 : events.length > 1 ? HIT_STEP_MS : FX_MS);
        setPlayback({ ...playback, index: next });
      }, next === 0 ? (playback.playedCard ? CARD_TRAVEL_MS : 0) : HIT_STEP_MS);
    }

    const event = playback.events[next];
    return schedule(() => {
      const previousHp = playback.events[index]?.after.playerHp ?? base.player.hp;
      const ev = event.kind === 'attack' ? { ...event, damage: previousHp - event.after.playerHp } : event;
      if (ev.kind === 'attack') playSound(ev.damage > 0 ? 'alert' : 'recover');
      else if (ev.kind === 'burn' || ev.kind === 'retaliate') playSound('breach');
      else playSound('scan');
      pushFx(fxForEvent(ev));
      showBanner(bannerForEnemyEvent(ev, base), ev.kind === 'attack' && ev.hits > 1 ? HIT_STEP_MS : ENEMY_STEP_MS);
      setPlayback({ ...playback, index: next });
    }, next === 0 ? TURN_CUE_MS : event.kind === 'attack' && event.hit > 1 ? HIT_STEP_MS : ENEMY_STEP_MS);
  }, [playback, settling, animateDiscard, completePlayback, pushFx, showBanner]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedUid(null);
        setNotice(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const startRun = (loadoutId: LoadoutId = run.loadoutId, securityLevel: number = run.securityLevel, fastGrowth = run.fastGrowth) => {
    startBonusClaimed.current = false;
    actionLocked.current = false;
    clearMotion();
    cardPositions.current.clear();
    setRunNumber((number) => number + 1);
    playSound('breach');
    const fresh = createRunWithProfileCoins(fastGrowth, loadoutId, securityLevel);
    updateProfile((p) => recordDiscovery(p, fresh.deck.map((c) => c.defId), []));
    setRun(fresh);
    // 起動ノードで出発前の強化を選んでから、マップで最初のマスを選ぶ
    setPhase('start_bonus');
    setShowMap(false);
    setPostBattle(null);
    setEventView(null);
    setMysteryView(null);
    setRestSummary(null);
    setSelectedUid(null);
    setNotice(null);
    setPlayback(null);
    setFx([]);
    setBanner(null);
  };

  const startTutorialTrialRun = () => {
    playSound('breach');
    const fresh = createTutorialTrialRun();
    setRunNumber((n) => n + 1);
    setRun(fresh);
    setBattle(createBattleForCurrentNode(fresh, 42));
    setTurn1CoachActive(true);
    setPhase('battle');
    setPostBattle(null);
    setEventView(null);
    setMysteryView(null);
    setRestSummary(null);
    setSelectedUid(null);
    setNotice(null);
    setPlayback(null);
    setFx([]);
    setBanner(null);
  };

  const openSetupScreen = () => {
    actionLocked.current = false;
    clearMotion();
    playSound('click');
    setPhase('setup');
    setPostBattle(null);
    setEventView(null);
    setMysteryView(null);
    setRestSummary(null);
    setSelectedUid(null);
    setNotice(null);
    setPlayback(null);
    setFx([]);
    setBanner(null);
  };

  const toggleFastGrowth = () => {
    playSound('click');
    setRun((prev) => ({ ...prev, fastGrowth: !prev.fastGrowth }));
  };

  const toggleAudio = () => {
    const next = !audioOn;
    setAudioOn(next);
    setSoundEnabled(next);
    setBgmEnabled(next);
    if (next) {
      playSound('scan');
      bgm.start();
    } else {
      bgm.stop();
    }
  };

  const enterNode = (nextRun: RunState) => {
    actionLocked.current = false;
    clearMotion();
    cardPositions.current.clear();
    const node = getCurrentNode(nextRun);
    setSelectedUid(null);
    setNotice(null);
    setPlayback(null);
    setFx([]);
    setBanner(null);
    if (!node) {
      setPhase('run_result');
      return;
    }
    if (node.kind === 'event') {
      setEventView(buildEventStep(nextRun, node.eventId ?? 'vuln_check', 1));
      setPhase('event');
      return;
    }
    if (node.kind === 'mystery') {
      setMysteryView({ eventId: pickMysteryEvent(nextRun, randomSeed()), summary: null });
      setPhase('mystery');
      return;
    }
    if (node.kind === 'rest') {
      setRestSummary(null);
      setPhase('rest');
      return;
    }
    if (node.kind === 'shop') {
      setPhase('shop');
      return;
    }
    if (node.kind === 'start') {
      setPhase('map');
      return;
    }
    setBattle(createBattleForCurrentNode(nextRun, randomSeed()));
    setPhase('battle');
  };

  /** マスを終えたらマップに戻り、次のマスを選んでもらう */
  const goToMap = (nextRun: RunState) => {
    setRun(nextRun);
    setSelectedUid(null);
    setNotice(null);
    setPlayback(null);
    setFx([]);
    setBanner(null);
    setPhase('map');
  };

  const onChooseMapNode = (nodeId: string) => {
    playSound('click');
    const nextRun = moveToNode(run, nodeId);
    enterNode(nextRun);
    setRun(nextRun);
  };

  const onChooseStartBonus = (bonusId: StartBonusId) => {
    if (phase !== 'start_bonus' || startBonusClaimed.current || !run.startBonusChoices.includes(bonusId)) return;
    startBonusClaimed.current = true;
    const nextRun = applyStartBonus(run, bonusId, randomSeed());
    const added = nextRun.deck.filter((c) => !run.deck.some((d) => d.uid === c.uid)).map((c) => c.defId);
    if (added.length > 0) updateProfile((p) => recordDiscovery(p, added, []));
    setRun(nextRun);
    setPhase('map');
  };

  const onResolveMystery = (choiceId: string) => {
    if (!mysteryView || mysteryView.summary) return;
    playSound('extract');
    const res = resolveMysteryChoice(run, mysteryView.eventId, choiceId, randomSeed());
    showLevelUps(res.run);
    if (res.discoveredCardId) {
      const cardId = res.discoveredCardId;
      updateProfile((p) => recordDiscovery(p, [cardId], []));
    }
    setRun(res.run);
    setMysteryView({ ...mysteryView, summary: res.summary });
    if (res.run.pendingEvolutions.length > 0) {
      setEvolveOrigin('mystery');
      setPhase('evolve');
    }
  };

  const onFinishMystery = () => {
    playSound('click');
    setMysteryView(null);
    goToMap(run);
  };

  const onApplyRest = (action: RestAction) => {
    if (restSummary) return;
    playSound('recover');
    const res = applyRestAction(run, action);
    showLevelUps(res.run);
    setRun(res.run);
    setRestSummary(res.summary);
    if (res.run.pendingEvolutions.length > 0) {
      setEvolveOrigin('rest');
      setPhase('evolve');
    }
  };

  const onFinishRest = () => {
    playSound('click');
    setRestSummary(null);
    goToMap(run);
  };

  const tryPlay = (uid: string, targetUid?: string) => {
    if (actionLocked.current || isDrawing()) return;
    const result = playCard(battle, uid, targetUid);
    if (!result.accepted) {
      setNotice(result.reason ?? 'そのカードは使えません。');
      playSound('alert');
      return;
    }
    playSound('click');
    const card = battle.cards[uid];
    const source = document.querySelector(`[data-growth-card="${CSS.escape(uid)}"]`)?.getBoundingClientRect();
    if (source) cardPositions.current.set(uid, source);
    const def = getCardDefinition(card.defId);
    const stats = getCardStats(card);
    const kind = def.kind;
    const isAoe = stats.effects.some((e) => 'target' in e && e.target === 'all');
    const telemetry = getCardTelemetry(card.defId);
    const banner: Omit<ActionBanner, 'id'> = {
      actor: 'player',
      kind,
      icon: KIND_ICON[kind],
      title: stats.name,
      detail: stats.text,
      tag: telemetry.tag,
      command: telemetry.command,
      lore: def.lore,
      isAoe,
    };
    const enemy = targetUid ?? livingEnemies(battle)[0]?.uid;
    launchCard(uid, kind === 'attack' && enemy ? enemy : 'player');
    actionLocked.current = true;
    setSelectedUid(null);
    setNotice(null);
    setPlayback({
      actor: 'player',
      base: { ...battle, hand: battle.hand.filter((id) => id !== uid) },
      events: playerFrames(result.state, result.attackFrames),
      index: -1,
      final: result.state,
      playedCard: true,
      banner,
    });
  };

  const onCardClick = (uid: string) => {
    if (busy || actionLocked.current || isDrawing()) return;
    if (selectedUid === uid) {
      setSelectedUid(null);
      return;
    }
    const stats = getCardStats(battle.cards[uid]);
    if (cardNeedsTarget(stats) && livingEnemies(battle).length > 1) {
      if (getPlayCost(battle, uid) > battle.player.energy) {
        setNotice(`帯域が足りません(必要 ${getPlayCost(battle, uid)} / 残り ${battle.player.energy})。`);
        playSound('alert');
        return;
      }
      playSound('click');
      setSelectedUid(uid);
      setNotice('攻撃する敵をクリックしてください(Esc でやめる)。');
      return;
    }
    tryPlay(uid);
  };

  const onEnemyClick = (enemy: EnemyState) => {
    if (busy || !selectedUid || enemy.hp <= 0) return;
    tryPlay(selectedUid, enemy.uid);
  };

  const onEndTurn = () => {
    if (busy || actionLocked.current || isDrawing()) return;
    if (turn1CoachActive && getCurrentNode(run).kind !== 'boss' && getCurrentFloor(run) <= 2 && battle.turn === 1) {
      dismissTurn1Coach();
    }
    actionLocked.current = true;
    playSound('click');
    const final = endTurn(battle);
    const base: BattleState = { ...battle, hand: [], discard: [...battle.discard, ...battle.hand] };
    setSelectedUid(null);
    setNotice(null);
    setPlayback({ actor: 'enemy', base, events: final.lastEnemyActions, index: -1, final });
  };

  const onUseTool = (toolIndex: number) => {
    if (busy || actionLocked.current || isDrawing()) return;
    const res = activateBattleTool(battle, toolIndex);
    if (!res.accepted) {
      setNotice(res.reason ?? 'ツールを使えません。');
      playSound('alert');
      return;
    }
    const usedToolId = battle.tools[toolIndex];
    const toolDef = usedToolId ? TOOL_DEFINITIONS[usedToolId] : null;
    actionLocked.current = true;
    setPlayback({
      actor: 'player',
      base: battle,
      events: playerFrames(res.state),
      index: -1,
      final: res.state,
      playedCard: false,
      banner: {
        actor: 'player',
        kind: 'utility',
        icon: toolDef?.icon ?? 'heal',
        title: toolDef?.name ?? 'ツール',
        detail: toolDef?.description,
      },
    });
    setRun((prev) => ({ ...prev, tools: [...res.state.tools] }));
  };

  const onBuyCoinShop = (action: CoinShopAction) => {
    try {
      const next = spendCoinShop(run, action);
      playSound('extract');
      setNotice(null);
      setRun(next);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '交換できませんでした。');
      playSound('alert');
    }
  };

  const proceedAfterPostBattle = () => {
    playSound('click');
    // ランに勝ったら、ほかの画面を挟まずに結果画面へ
    if (run.status === 'won') {
      setPhase('run_result');
      return;
    }
    if (run.pendingEvolutions.length > 0) {
      setEvolveOrigin('post_battle');
      setPhase('evolve');
      return;
    }
    if (postBattle && postBattle.rewardChoices.length > 0) {
      setPhase('reward');
      return;
    }
    goToMap(run);
  };

  const onChooseBranch = (cardUid: string, branchId: string) => {
    playSound('extract');
    const updated = chooseEvolution(run, cardUid, branchId);
    updateProfile((p) => recordEvolutionUnlocked(p, branchId));
    setRun(updated);
    if (updated.pendingEvolutions.length > 0) return;
    if (evolveOrigin === 'event') {
      setPhase('event');
      return;
    }
    if (evolveOrigin === 'rest') {
      setPhase('rest');
      return;
    }
    if (evolveOrigin === 'mystery') {
      setPhase('mystery');
      return;
    }
    if (updated.status === 'won') {
      // ラン結果の記録は handleBattleFinished で済んでいるので、ここでは画面だけ進める
      setPhase('run_result');
      return;
    }
    if (postBattle && postBattle.rewardChoices.length > 0) {
      setPhase('reward');
      return;
    }
    goToMap(updated);
  };

  const onPickReward = (defId: string | null) => {
    playSound('click');
    if (defId) updateProfile((p) => recordDiscovery(p, [defId], []));
    const withReward = pickRewardCard(run, defId);
    setPostBattle(null);
    goToMap(withReward);
  };

  const onRemoveInReward = (cardUid: string) => {
    playSound('recover');
    const compressed = removeCardFromDeck(run, cardUid);
    setPostBattle(null);
    goToMap(compressed);
  };

  const onUseEventRecon = () => {
    if (!eventView || eventView.reconUsed || eventView.selectedChoiceId || run.reconCoins <= 0) return;
    playSound('scan');
    setRun((prev) => spendReconCoin(prev));
    setEventView({ ...eventView, reconUsed: true });
  };

  const onAnswerQuiz = (choiceId: string) => {
    if (!eventView || eventView.selectedChoiceId) return;
    const filteredOutId = eventView.reconUsed ? getFilteredOutQuizChoiceId(eventView.question) : null;
    if (filteredOutId === choiceId) return;
    const choice = eventView.question.choices.find((c) => c.id === choiceId);
    if (!choice) return;
    const resolved = resolveEventQuiz(run, eventView.eventId, eventView.question.id, choice.isCorrect);
    playSound(choice.isCorrect ? 'extract' : 'alert');
    updateProfile((p) => {
      let next = recordQuizOutcome(p, eventView.question.id, choice.isCorrect, eventView.step);
      if (resolved.run.status === 'lost') next = recordRunResult(next, resolved.run);
      return next;
    });
    setRun(resolved.run);
    setEventView({
      ...eventView,
      selectedChoiceId: choiceId,
      isCorrect: choice.isCorrect,
      hpLost: resolved.hpLost,
      finished: !choice.isCorrect,
    });
    if (resolved.run.status === 'lost') {
      window.setTimeout(() => setPhase('run_result'), 900);
    }
  };

  const onPickEventXpCard = (cardUid: string) => {
    if (!eventView || eventView.stepRewardDone) return;
    const preview = previewQuizXpReward(run, cardUid);
    const allMaxed = run.deck.every((c) => c.level === 3 && Boolean(c.branchId));
    if (preview.isMaxed && !allMaxed) return;
    playSound('recover');
    const res = applyQuizXpReward(run, cardUid);
    showLevelUps(res.run);
    setRun(res.run);
    setEventView({ ...eventView, stepRewardDone: true, xpGain: res.gain });
    if (res.run.pendingEvolutions.length > 0) {
      setEvolveOrigin('event');
      setPhase('evolve');
    }
  };

  const onEventStep2Reward = (action: { type: 'heal' } | { type: 'card'; defId: string } | { type: 'remove'; cardUid: string }) => {
    if (!eventView || eventView.stepRewardDone) return;
    if (action.type === 'remove' && run.deck.length <= 1) return;
    playSound('recover');
    if (action.type === 'heal') {
      setRun((prev) => applyPatchBonus(prev, { type: 'heal', amount: 10 }));
    } else if (action.type === 'card') {
      setRun((prev) => pickRewardCard(prev, action.defId));
    } else {
      setRun((prev) => removeCardFromDeck(prev, action.cardUid));
    }
    setEventView({ ...eventView, stepRewardDone: true });
  };

  const onEventStep3Reward = (action: { type: 'relic'; relicId: RelicId } | { type: 'rare'; defId: string }) => {
    if (!eventView || eventView.stepRewardDone) return;
    playSound('extract');
    if (action.type === 'relic') {
      setRun((prev) => grantRelic(prev, action.relicId));
    } else {
      setRun((prev) => pickRewardCard(prev, action.defId));
    }
    setEventView({ ...eventView, stepRewardDone: true, finished: true });
  };

  const onChallengeNextQuestion = () => {
    if (!eventView || eventView.step >= MAX_EVENT_STREAK) return;
    playSound('click');
    setEventView(buildEventStep(run, eventView.eventId, eventView.step + 1));
  };

  const onFinishEvent = () => {
    playSound('click');
    setEventView(null);
    goToMap(run);
  };

  const fxAt = (at: string) => fx.filter((f) => f.at === at);
  const playerFx = fxAt('player');
  const playerImpact = playerFx.filter((f) => f.impact && f.impact !== 'guard' && f.impact !== 'heal').at(-1);
  const shield = playerFx.filter((f) => f.impact === 'guard').at(-1);
  const heal = playerFx.filter((f) => f.impact === 'heal').at(-1);
  const playerHit = playerFx.filter((f) => f.tone === 'hit').at(-1);
  const launch = fxAt('player-launch').at(-1);
  const playerHurt = Boolean(playerHit);
  const playerAttacking = !playerHurt && Boolean(launch && launch.id > (shield?.id ?? -1));
  const playerGuarding = !playerHurt && !playerAttacking && Boolean(shield);
  const playerMotion = playerAttacking ? launch : playerHit ?? shield;
  const { player, modifiers } = shown;
  const hpRatio = Math.max(0, player.hp / player.maxHp);
  const isBoss = getCurrentNode(run).kind === 'boss';

  useEffect(() => {
    if (!audioOn || !isBgmEnabled()) {
      bgm.stop();
      return;
    }
    bgm.start();
    return () => bgm.stop();
  }, [audioOn]);

  useEffect(() => {
    const intensity =
      phase === 'battle' && (isBoss || hpRatio <= 0.25)
        ? 2
        : phase === 'battle' && (run.currentBattleElite || hpRatio <= 0.5)
          ? 1
          : 0;
    bgm.setIntensity(intensity);
  }, [phase, isBoss, run.currentBattleElite, hpRatio]);
  const playsThisBattle = Object.values(shown.usesThisBattle).reduce((sum, n) => sum + n, 0);
  const turn1Coach =
    turn1CoachActive &&
    phase === 'battle' &&
    !isBoss &&
    getCurrentFloor(run) <= 2 &&
    shown.turn === 1 &&
    shown.status === 'playing' &&
    !busy
      ? computeTurn1Coach(shown, playsThisBattle)
      : null;

  return (
    <div className={`db-shell${phase === 'map' && run.visitedNodeIds.length === 1 ? ' db-shell--oracle-arrival' : ''}`}>
      <header className="db-topbar">
        <div className="db-brand">
          <span className="db-brand__tag">SECTOR 06</span>
          <span>DECK BREACH</span>
          <span className="db-brand__progress" aria-label={`全${MAP_TOTAL_FLOORS}段のうち${getCurrentFloor(run)}段目`}>
            FLOOR {getCurrentFloor(run)}/{MAP_TOTAL_FLOORS}
          </span>
        </div>

        {phase !== 'setup' && phase !== 'map' && phase !== 'start_bonus' && (
          <button type="button" className="db-btn db-btn--ghost db-map-btn" onClick={() => setShowMap(true)} title="マップを見る">
            <GameIcon name="map" /> マップを見る
          </button>
        )}

        <div className="db-topbar__right">
          {run.securityLevel > 0 && (
            <span className="db-chip db-chip--bad" title={`セキュリティLv.${run.securityLevel}`}>
              <GameIcon name="lock" /> SEC Lv.{run.securityLevel}
            </span>
          )}
          <span className="db-chip db-chip--hp" title="今の HP / 最大 HP">
            <GameIcon name="hp" /> HP {phase === 'battle' ? shown.player.hp : run.hp}/{phase === 'battle' ? shown.player.maxHp : run.maxHp}
          </span>
          <span className="db-chip db-chip--buff"><GameIcon name="coin" /> 解析コイン {run.reconCoins}枚</span>
          <button type="button" className="db-btn db-btn--ghost" onClick={toggleAudio} title="BGM・効果音のON/OFF切替">
            {audioOn ? '🔊 音:ON' : '🔇 音:OFF'}
          </button>
          <button type="button" className="db-btn db-btn--ghost" onClick={() => setShowDeckModal(true)}>
            デッキ ({run.deck.length})
          </button>
          <button type="button" className="db-btn db-btn--ghost" onClick={() => setShowHowToPlay(true)} title="遊び方と用語の説明">
            <GameIcon name="help" /> 遊び方
          </button>
          <button type="button" className="db-btn db-btn--ghost" onClick={onBackToMissions}>
            ミッション選択へ
          </button>
        </div>
      </header>

      <div className="db-reload-note">
        <span>※ 試作版のため、ブラウザを読み込み直すとランは最初からやり直しになります。</span>
        {run.relics.length > 0 && (
          <span className="db-relic-bar">
            {run.relics.map((id) => {
              const r = RELIC_DEFINITIONS[id];
              return (
                <span key={id} className="db-chip db-chip--buff" title={r.description}>
                  <GameIcon name={r.icon} /> {r.name}
                </span>
              );
            })}
          </span>
        )}
        <button
          type="button"
          className={`db-btn db-fast-toggle ${run.fastGrowth ? 'db-fast-toggle--on' : ''}`}
          onClick={toggleFastGrowth}
          title="試作用:ONにすると1回の戦闘・クイズですぐLv.3進化まで試せます"
        >
          {run.fastGrowth ? <><GameIcon name="energy" /> 試用高速成長:ON</> : '試用高速成長:OFF'}
        </button>
      </div>

      {phase === 'setup' ? (
        <RunSetupScreen
          initialLoadout={run.loadoutId}
          initialSecurityLevel={run.securityLevel}
          onDeploy={(loadoutId, securityLevel) => startRun(loadoutId, securityLevel)}
          onStartTutorialTrial={startTutorialTrialRun}
          onBack={onBackToMissions}
        />
      ) : phase === 'map' ? (
        <RunMapView run={run} onChoose={onChooseMapNode} />
      ) : phase === 'start_bonus' ? (
        <OracleEncounter choices={run.startBonusChoices} onComplete={onChooseStartBonus} />
      ) : phase === 'mystery' && mysteryView ? (
        <MysteryScreen
          run={run}
          mysteryView={mysteryView}
          onChoose={onResolveMystery}
          onContinue={onFinishMystery}
        />
      ) : phase === 'rest' ? (
        <RestScreen
          run={run}
          summary={restSummary}
          onAction={onApplyRest}
          onContinue={onFinishRest}
        />
      ) : phase === 'event' && eventView ? (
        <EventScreen
          run={run}
          eventView={eventView}
          onUseRecon={onUseEventRecon}
          onAnswer={onAnswerQuiz}
          onPickXpCard={onPickEventXpCard}
          onStep2Reward={onEventStep2Reward}
          onStep3Reward={onEventStep3Reward}
          onNextQuestion={onChallengeNextQuestion}
          onContinue={onFinishEvent}
        />
      ) : phase !== 'shop' && (
        <div className={`db-main db-motion-field ${isBoss ? 'db-main--boss' : ''}`}>
          <div ref={motionLayer} className="db-motion-layer" aria-hidden="true" />
          <section className={`db-left${turn1Coach ? ' db-left--tutorial' : ''}`}>
            {turn1Coach && <div className="db-tutorial-dim" aria-hidden="true" />}
            {turn1Coach && (
              <div className="db-coach-card" role="status" aria-live="polite">
                <div className="db-coach-card__top">
                  <span className="db-coach-bar__step">TUTORIAL {turn1Coach.step} / 3</span>
                  <span className="db-coach-card__dots" aria-hidden="true">
                    {[1, 2, 3].map((n) => (
                      <span
                        key={n}
                        className={`db-coach-card__dot${n <= turn1Coach.step ? ' db-coach-card__dot--on' : ''}`}
                      />
                    ))}
                  </span>
                  <span className="db-coach-bar__actions">
                    <button
                      type="button"
                      className="db-coach-bar__btn"
                      onClick={() => setShowHowToPlay(true)}
                    >
                      遊び方を見る
                    </button>
                    <button
                      type="button"
                      className="db-coach-bar__btn db-coach-bar__btn--skip"
                      onClick={dismissTurn1Coach}
                    >
                      ✕ スキップ
                    </button>
                  </span>
                </div>
                <div className="db-coach-card__title">{turn1Coach.title}</div>
                <div className="db-coach-card__detail">{turn1Coach.detail}</div>
              </div>
            )}
            <div
              className={[
                'db-arena',
                selectedUid ? 'db-arena--targeting' : '',
                banner?.power === 'crit' ? 'db-arena--shake-crit' : banner?.power === 'heavy' ? 'db-arena--shake-heavy' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {playback?.actor === 'enemy' && (playback.index < 0 || yourTurnCue) && (
                <div key={yourTurnCue ? 'player' : 'enemy'} className={`db-turn-cue${yourTurnCue ? '' : ' db-turn-cue--enemy'}`} role="status">
                  {yourTurnCue ? 'YOUR TURN' : 'ENEMY TURN'}
                </div>
              )}
              {banner && (
                <>
                  <div
                    key={`beam-${banner.id}`}
                    className={[
                      'db-arena-beam',
                      `db-arena-beam--${banner.kind}`,
                      banner.isAoe ? 'db-arena-beam--aoe' : '',
                      banner.power && banner.power !== 'normal' ? `db-arena-beam--power-${banner.power}` : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-hidden="true"
                  />
                  {banner.power && banner.power !== 'normal' && (
                    <div
                      key={`shock-${banner.id}`}
                      className={`db-arena-shockwave db-arena-shockwave--${banner.power}`}
                      aria-hidden="true"
                    />
                  )}
                  <div
                    key={`banner-${banner.id}`}
                    className={[
                      'db-action-banner',
                      `db-action-banner--${banner.kind}`,
                      banner.command ? 'db-action-banner--terminal' : '',
                      banner.power && banner.power !== 'normal' ? `db-action-banner--power-${banner.power}` : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    role="status"
                    aria-live="polite"
                  >
                    <div className="db-action-banner__head">
                      <span className="db-action-banner__icon"><GameIcon name={banner.icon} /></span>
                      {banner.tag && <span className="db-action-banner__tag">{banner.tag}</span>}
                      <span className="db-action-banner__title">{banner.title}</span>
                      {banner.detail && <span className="db-action-banner__detail">{banner.detail}</span>}
                    </div>
                    {banner.command && (
                      <div className="db-action-banner__cmd">
                        <span className="db-action-banner__prompt">$</span> {banner.command}
                      </div>
                    )}
                    {banner.lore && (
                      <div className="db-action-banner__lore">{banner.lore}</div>
                    )}
                  </div>
                </>
              )}
              {isBoss && (
                <div key={runNumber} className="db-boss-intro" aria-hidden="true">
                  ボス戦 <strong>{shown.enemies[0]?.name ?? 'ARGUS'}</strong>
                </div>
              )}
              {bossPhaseCutin && (
                <div key={`cutin-${bossPhaseCutin.id}`} className="db-phase2-cutin" role="alert" aria-live="assertive">
                  <div className="db-phase2-cutin__stripe" aria-hidden="true" />
                  <div className="db-phase2-cutin__body">
                    <span className="db-phase2-cutin__tag">WARNING // PHASE 2 OVERDRIVE</span>
                    <strong className="db-phase2-cutin__title">{bossPhaseCutin.name} リミッター解除</strong>
                    <span className="db-phase2-cutin__sub">{bossPhaseCutin.sub}</span>
                  </div>
                  <div className="db-phase2-cutin__stripe" aria-hidden="true" />
                </div>
              )}
              <div className="db-player-side">
                <div
                  className={[
                    'db-fighter',
                    `db-fighter--loadout-${run.loadoutId}`,
                    player.hp === 0 ? 'db-fighter--defeated' : '',
                    player.block > 0 ? 'db-fighter--shielded' : '',
                    modifiers.nextAttackBonus > 0 || modifiers.repeatNextAttack || modifiers.reconCombo === 'ready'
                      ? 'db-fighter--charged'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-battle-anchor="player"
                  aria-hidden="true"
                >
                  {/* 人型シルエット切り抜き用SVGマスク（赤・青オペレーター用） */}
                  <svg width="0" height="0" className="db-fighter-mask-defs" aria-hidden="true">
                    <defs>
                      <filter id="db-soft-cut">
                        <feGaussianBlur stdDeviation="0.012" />
                      </filter>
                      <mask id="db-mask-red" maskContentUnits="objectBoundingBox">
                        <rect width="1" height="1" fill="black" />
                        <path
                          d="M0.45 0.03 C0.51 0.01 0.60 0.02 0.63 0.09 C0.65 0.14 0.62 0.18 0.63 0.21 L0.70 0.28 L0.74 0.42 L0.81 0.43 L0.82 0.48 L0.76 0.56 L0.93 0.64 L0.85 0.72 L0.87 0.89 L0.94 0.96 L0.76 0.97 L0.73 0.82 L0.58 0.78 L0.34 0.99 L0.15 0.99 L0.10 0.94 L0.15 0.82 L0.21 0.66 L0.01 0.54 L0.05 0.36 L0.28 0.27 L0.36 0.17 L0.42 0.12 Z"
                          fill="white"
                          filter="url(#db-soft-cut)"
                        />
                      </mask>
                      <mask id="db-mask-blue" maskContentUnits="objectBoundingBox">
                        <rect width="1" height="1" fill="black" />
                        <path
                          d="M0.39 0.12 C0.44 0.10 0.53 0.11 0.56 0.17 L0.62 0.15 L0.74 0.13 L0.99 0.26 L0.99 0.88 L0.88 0.94 L0.75 0.86 L0.59 0.84 L0.52 0.77 L0.38 0.78 L0.24 0.88 L0.21 0.96 L0.05 0.96 L0.07 0.80 L0.01 0.62 L0.14 0.44 L0.06 0.35 L0.09 0.25 L0.24 0.26 L0.33 0.20 Z"
                          fill="white"
                          filter="url(#db-soft-cut)"
                        />
                      </mask>
                      <mask id="db-mask-balanced-attack" maskContentUnits="objectBoundingBox">
                        <rect width="1" height="1" fill="black" />
                        <path
                          d="M0.22 0.08 C0.26 0.06 0.30 0.09 0.30 0.16 L0.29 0.23 L0.38 0.21 L0.65 0.20 L0.67 0.54 L0.44 0.51 L0.36 0.46 L0.33 0.55 L0.37 0.73 L0.37 0.86 L0.31 0.86 L0.29 0.73 L0.24 0.62 L0.18 0.76 L0.15 0.94 L0.10 0.94 L0.11 0.80 L0.16 0.58 L0.14 0.46 L0.17 0.27 L0.20 0.18 Z"
                          fill="white"
                          filter="url(#db-soft-cut)"
                        />
                      </mask>
                    </defs>
                  </svg>
                  {(() => {
                    const set = LOADOUT_BATTLE_SPRITE[run.loadoutId];
                    const activeSprite =
                      (playerAttacking && set.attack) ||
                      (playerGuarding && set.guard) ||
                      (playerHurt && set.hurt) ||
                      set.idle;
                    return (
                      <span
                        key={playerMotion?.id ?? 'idle'}
                        className={[
                          'db-fighter__avatar',
                          activeSprite.mode === 'lighten'
                            ? 'db-fighter__avatar--cutout-lighten'
                            : 'db-fighter__avatar--cutout-mask',
                          playerAttacking ? 'db-fighter__avatar--launch' : '',
                          playerGuarding ? 'db-fighter__avatar--guard' : '',
                          playerHurt ? 'db-fighter__avatar--hit' : '',
                          playerHurt ? powerClass(playerHit, 'db-fighter__avatar--hit') : '',
                          playerAttacking ? powerClass(playerMotion, 'db-fighter__avatar--launch') : '',
                        ].join(' ')}
                      >
                        <span className="db-fighter__poses db-fighter__poses--human">
                          <img
                            src={activeSprite.src}
                            alt={LOADOUT_DEFINITIONS[run.loadoutId].name}
                            className={`db-fighter__human-img db-fighter__human-img--${activeSprite.mode}`}
                            draggable={false}
                          />
                        </span>
                      </span>
                    );
                  })()}
                  {playerImpact && <span key={`impact-${playerImpact.id}`} className={`db-impact db-impact--${playerImpact.impact}${powerClass(playerImpact, "db-impact--power")}`} />}
                  {shield && <span key={`shield-${shield.id}`} className="db-player-shield" />}
                  {heal && <span key={`heal-${heal.id}`} className="db-player-repair" />}
                </div>
                <div className="db-player">
                  <div className={`db-player__stats ${fxAt('player').some((f) => f.tone === 'hit') ? 'db-player--hit' : ''}`}>
                    <span className="db-player__label">あなた({LOADOUT_DEFINITIONS[run.loadoutId].name})</span>
                    <span className="db-bar db-bar--player">
                      <span className="db-bar__fill db-bar__fill--player" style={{ width: `${hpRatio * 100}%` }} />
                      <span className="db-bar__text">
                        HP {player.hp} / {player.maxHp}
                      </span>
                    </span>
                    {player.block > 0 && <span className="db-chip db-chip--shield"><GameIcon name="shield" /> FW {player.block}</span>}
                    {player.retaliate > 0 && <span className="db-chip db-chip--buff"><GameIcon name="retaliate" /> 反撃 {player.retaliate}</span>}
                    {modifiers.reconCombo === 'ready' && (
                      <span className="db-chip db-chip--buff" title="このターン中に攻撃カードを使うと帯域+1">
                        <GameIcon name="combo" /> 解析コンボ準備中(攻撃で+1EN)
                      </span>
                    )}
                    {modifiers.nextAttackBonus > 0 && <span className="db-chip db-chip--buff"><GameIcon name="nextAttack" /> 次の攻撃+{modifiers.nextAttackBonus}</span>}
                    {modifiers.repeatNextAttack && <span className="db-chip db-chip--buff"><GameIcon name="repeat" /> 次の攻撃×2</span>}
                    {modifiers.nextCardDiscount > 0 && <span className="db-chip db-chip--buff"><GameIcon name="discount" /> 次のカード−{modifiers.nextCardDiscount}EN</span>}
                    {player.energyPenalty > 0 && <span className="db-chip db-chip--bad"><GameIcon name="detect" /> 検知 −{player.energyPenalty}</span>}
                    {shown.tools.length > 0 && (
                      <span className="db-tool-bar">
                        {shown.tools.map((toolId, idx) => {
                          const t = TOOL_DEFINITIONS[toolId];
                          return (
                            <button
                              key={`${toolId}-${idx}`}
                              type="button"
                              className="db-tool-btn"
                              disabled={busy || Boolean(turn1Coach)}
                              onClick={() => onUseTool(idx)}
                              title={`帯域0で使用: ${t.description}`}
                            >
                              <GameIcon name={t.icon} /> {t.name}
                            </button>
                          );
                        })}
                      </span>
                    )}
                    <span className="db-fx db-fx--player">
                      {fxAt('player').map((f) => (
                        <span key={f.id} className={`db-fx__float db-fx__float--${f.tone}${powerClass(f, "db-fx__float--power")}`}>
                          {f.icon && <GameIcon name={f.icon} />}
                          {f.text}
                        </span>
                      ))}
                    </span>
                  </div>
                </div>
              </div>
              <div className="db-enemies">
                {shown.enemies.map((enemy) => {
                  const dead = enemy.hp <= 0;
                  const intent = describeIntent(getEnemyIntent(enemy));
                  const enemyFx = fxAt(enemy.uid);
                  const hpImpact = enemyFx.filter((f) => f.damaging).at(-1);
                  const impact = hpImpact ?? enemyFx.filter((f) => f.impact).at(-1);
                  const attacking = activeEnemyAction?.kind === 'attack' && actingUid === enemy.uid;
                  const def = ENEMY_DEFINITIONS[enemy.defId];
                  return (
                    <button
                      type="button"
                      key={`${enemy.defId}-${enemy.uid}`}
                      className={[
                        'db-enemy',
                        dead ? 'db-enemy--dead' : '',
                        selectedUid && !dead ? 'db-enemy--targetable' : '',
                        actingUid === enemy.uid ? 'db-enemy--acting' : '',
                        def.phase2 ? 'db-enemy--boss' : '',
                      ].join(' ')}
                      onClick={() => onEnemyClick(enemy)}
                      disabled={dead || !selectedUid || busy}
                      aria-label={`${enemy.name}、HP ${enemy.hp}/${enemy.maxHp}${dead ? '、撃破済み' : `、次の行動 ${intent.title}、弱点 ${WEAKNESS_LABEL[enemy.weakness]}`}`}
                    >
                      <span
                        className={`db-enemy__intent-slot${turn1Coach?.highlightIntentEnemyUid === enemy.uid ? ' db-enemy__intent-slot--spotlight' : ''}`}
                      >
                        {!dead && (
                          <span
                            className={`db-intent db-intent--${intent.tone}${turn1Coach?.highlightIntentEnemyUid === enemy.uid ? ' db-intent--coach-spotlight' : ''}`}
                            title={intent.title}
                          >
                            <span className="db-intent__icon">{intent.icon.map((name) => <GameIcon key={name} name={name} />)}</span>
                            <span>{intent.text}</span>
                          </span>
                        )}
                        {!dead && turn1Coach?.highlightIntentEnemyUid === enemy.uid && turn1Coach.intentBadge && (
                          <span className="db-intent__coach-tag">▲ {turn1Coach.intentBadge}</span>
                        )}
                      </span>
                      <span className="db-enemy__stage" data-battle-anchor={enemy.uid} aria-hidden="true">
                        <span
                          key={attacking ? `attack-${playback?.index}` : impact?.id ?? 'idle'}
                          className={[
                            'db-enemy__model',
                            'db-enemy__model--art',
                            `db-enemy__model--${def.phase2 ? 'argus' : enemy.defId}`,
                            enemy.phase === 2 ? 'db-enemy__model--phase2' : '',
                            attacking ? 'db-enemy__model--attack' : '',
                            hpImpact && !attacking ? `db-enemy__model--hit${powerClass(hpImpact, 'db-enemy__model--hit')}` : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <EnemyArtwork defId={enemy.defId} phase={enemy.phase} dead={dead} />
                        </span>
                        {impact && <span key={`impact-${impact.id}`} className={`db-impact db-impact--${impact.impact}${powerClass(impact, "db-impact--power")}`} />}
                        {dead && <span className="db-enemy-defeat" />}
                      </span>
                      <span className="db-enemy__name">
                        {enemy.name}
                        {enemy.phase === 2 && <span className="db-enemy__phase">本気</span>}
                      </span>
                      <span className="db-bar">
                        <span className="db-bar__fill db-bar__fill--enemy" style={{ width: `${(enemy.hp / enemy.maxHp) * 100}%` }} />
                        <span className="db-bar__text">
                          {enemy.hp} / {enemy.maxHp}
                        </span>
                      </span>
                      <span className="db-enemy__status">
                        {!dead && (
                          <span className="db-chip db-chip--weak" title={`弱点:${WEAKNESS_LABEL[enemy.weakness]}(1.5倍ダメージ)`}>
                            <GameIcon name="weakness" /> 弱点:{WEAKNESS_LABEL[enemy.weakness]}
                          </span>
                        )}
                        {!dead && selectedUid && battle.cards[selectedUid] && doesCardHitWeakness(getCardStats(battle.cards[selectedUid]), enemy) && (
                          <span className="db-chip db-chip--burn"><GameIcon name="target" /> WEAK ×1.5</span>
                        )}
                        {enemy.block > 0 && <span className="db-chip db-chip--shield"><GameIcon name="shield" /> {enemy.block}</span>}
                        {enemy.attackBonus > 0 && <span className="db-chip db-chip--bad"><GameIcon name="buff" /> +{enemy.attackBonus}</span>}
                        {enemy.vulnerable && enemy.vulnerable > 0 && (
                          <span className="db-chip db-chip--burn" title="受けるダメージ1.5倍">
                            <GameIcon name="vulnerable" /> 脆弱 {enemy.vulnerable}T
                          </span>
                        )}
                        {enemy.jammed && enemy.jammed > 0 && (
                          <span className="db-chip db-chip--shield" title="与えるダメージ-30%">
                            <GameIcon name="jam" /> ジャム {enemy.jammed}T
                          </span>
                        )}
                        {enemy.burn && (
                          <span className="db-chip db-chip--burn">
                            <GameIcon name="burn" /> {enemy.burn.amount}・{enemy.burn.turns}T
                          </span>
                        )}
                      </span>
                      <span className="db-fx">
                        {enemyFx.map((f) => (
                          <span key={f.id} className={`db-fx__float db-fx__float--${f.tone}${powerClass(f, "db-fx__float--power")}`}>
                            {f.icon && <GameIcon name={f.icon} />}
                            {f.text}
                          </span>
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="db-battle-strip">
              <div className={`db-battle-status ${playback?.actor === 'enemy' ? 'db-battle-status--enemy' : ''}`} role="status">
                {notice ?? (playback?.actor === 'enemy' && !yourTurnCue ? '敵のターン' : playback?.actor === 'player' ? 'カード処理中' : selectedUid ? '攻撃対象を選択' : `あなたのターン · ${shown.turn}`)}
              </div>
              {(playback || drawing) && phase === 'battle' && (
                <button type="button" className="db-btn db-btn--ghost db-motion-skip" onClick={() => {
                  if (playback) completePlayback(playback, true);
                  else clearMotion();
                }}>演出をスキップ</button>
              )}
              <BattleLogPanel key={`${runNumber}-${run.currentNodeId}`} entries={shown.log} />
            </div>

            <div className="db-table">
              <div className={`db-energy${yourTurnCue ? ' db-energy--restored' : ''}`} title="帯域:カードを使うのに必要">
                <span className="db-energy__value">
                  {player.energy}
                  <small>/{player.maxEnergy + player.turnEnergyBonus}</small>
                </span>
                <span className="db-energy__label">帯域</span>
              </div>
              <div className="db-pile" title="山札" data-battle-anchor="draw">
                <span className="db-pile__count">{shown.drawPile.length}</span>
                <span>山札</span>
              </div>

              <div className="db-hand" role="group" aria-label="手札">
                <div className="db-hand__cards">
                  {shown.hand.map((uid) => {
                    const card = shown.cards[uid];
                    const def = getCardDefinition(card.defId);
                    const stats = getCardStats(card);
                    const cost = getPlayCost(shown, uid);
                    const unplayable = !!def.unplayable;
                    const affordable = !unplayable && cost <= player.energy;
                    const xpProg = getXpProgress(card);
                    const isCoachCard = turn1Coach?.highlightCardUid === uid;
                    const lockedByCoach = Boolean(turn1Coach) && !isCoachCard;
                    return (
                      <button
                        type="button"
                        key={uid}
                        data-growth-card={uid}
                        className={[
                          'db-card',
                          `db-card--${def.kind}`,
                          `db-card--${def.rarity}`,
                          unplayable ? 'db-card--noise' : '',
                          selectedUid === uid ? 'db-card--selected' : '',
                          isCoachCard ? 'db-card--coach' : '',
                          lockedByCoach ? 'db-card--coach-locked' : '',
                          !affordable ? 'db-card--unaffordable' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        {...(lockedByCoach ? {} : hoverProps(card, cost))}
                        onClick={() => {
                          if (!lockedByCoach && affordable) onCardClick(uid);
                        }}
                        disabled={busy || lockedByCoach}
                        aria-disabled={!affordable || lockedByCoach}
                        aria-pressed={selectedUid === uid}
                        title={
                          lockedByCoach
                            ? 'チュートリアル案内のボタンを押してください'
                            : !affordable
                              ? unplayable
                                ? '使用不可'
                                : '帯域不足'
                              : undefined
                        }
                      >
                        {isCoachCard && turn1Coach?.cardBadge && (
                          <span className="db-card__coach-tag">▼ {turn1Coach.cardBadge}</span>
                        )}
                        <span className={`db-card__cost ${cost < stats.cost ? 'db-card__cost--discounted' : ''}`}>{unplayable ? '×' : cost}</span>
                        <span className="db-card__band">{unplayable ? 'NOISE' : KIND_LABEL[def.kind]}</span>
                        <CardArtwork defId={def.id} kind={def.kind} rarity={def.rarity} level={card.level} branchId={card.branchId} />
                        <span className="db-card__name">{stats.name}</span>
                        <span className="db-card__desc"><EffectText text={stats.text} /></span>
                        {!unplayable && <span className="db-card__level">{xpProg.label}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="db-pile" title="捨て札" data-battle-anchor="discard">
                <span className="db-pile__count">{shown.discard.length}</span>
                <span>捨て札</span>
              </div>
              <button
                type="button"
                className={`db-btn db-btn--end${turn1Coach?.highlightEndTurn ? ' db-btn--coach-pulse' : ''}${turn1Coach && !turn1Coach.highlightEndTurn ? ' db-btn--coach-locked' : ''}`}
                onClick={onEndTurn}
                disabled={busy || Boolean(turn1Coach && !turn1Coach.highlightEndTurn)}
              >
                {turn1Coach?.highlightEndTurn && (
                  <span className="db-btn__coach-tag">▼ ここを押す！</span>
                )}
                ターン終了
              </button>
            </div>
          </section>

          {phase === 'battle' && !busy && hoveredUid && shown.hand.includes(hoveredUid) && previewNode}
        </div>
      )}


      {!playback && phase === 'post_battle' && postBattle && (
        <PostBattleOverlay run={run} summary={postBattle} onProceed={proceedAfterPostBattle} />
      )}

      {levelUps.length > 0 && (
        <LevelUpOverlay
          queue={levelUps}
          onNext={() => setLevelUps(levelUps.slice(1))}
          onSkip={() => setLevelUps([])}
        />
      )}

      {levelUps.length === 0 && phase === 'evolve' && run.pendingEvolutions.length > 0 && (
        <EvolutionOverlay
          cards={run.pendingEvolutions
            .map((uid) => run.deck.find((c) => c.uid === uid))
            .filter((c): c is CardInstance => Boolean(c))}
          onChoose={onChooseBranch}
          onOpenDeck={() => setShowDeckModal(true)}
        >
          {showDeckModal && <DeckModal deck={run.deck} onClose={() => setShowDeckModal(false)} />}
        </EvolutionOverlay>
      )}

      {phase === 'reward' && postBattle && (
        <RewardOverlay run={run} rewardDefIds={postBattle.rewardChoices} onPick={onPickReward} onRemove={onRemoveInReward} />
      )}

      {phase === 'run_result' && (
        <RunResultOverlay run={run} onRetry={openSetupScreen} onBack={onBackToMissions} />
      )}

      {phase === 'shop' && (
        <CoinShopScreen
          run={run}
          notice={notice}
          onBuy={onBuyCoinShop}
          onContinue={() => {
            playSound('click');
            goToMap(run);
          }}
        />
      )}
      {showMap && (
        <div className="rm-overlay" role="dialog" aria-modal="true" aria-label="マップ">
          <RunMapView run={run} onClose={() => setShowMap(false)} />
        </div>
      )}
      {showDeckModal && phase !== 'evolve' && <DeckModal deck={run.deck} onClose={() => setShowDeckModal(false)} />}
      {showHowToPlay && <HowToPlayModal onClose={closeHowToPlay} />}
    </div>
  );
}

function PostBattleOverlay({ run, summary, onProceed }: { run: RunState; summary: PostBattleSummary; onProceed: () => void }) {
  return (
    <div className="db-overlay" role="dialog" aria-modal="true">
      <div className="db-result db-result--won db-result--wide">
        <div className="db-result__title">BATTLE CLEAR</div>
        <p className="db-result__sub">
          システムを突破した！{summary.healed > 0 ? `（回線耐久 +${summary.healed} 回復 → ${run.hp}/${run.maxHp}）` : ''}
          {summary.coinsDropped > 0 && <> <GameIcon name="coin" /> 解析コイン +{summary.coinsDropped} ドロップ！</>}
        </p>

        <div className="db-result__used">
          <div className="db-result__used-title">カードの成長(EXP)</div>
          {summary.xpGains.length === 0 ? (
            <p className="db-muted">今回成長したカードはありませんでした。</p>
          ) : (
            <div className="db-xp-list">
              {summary.xpGains.map((g) => {
                const card = run.deck.find((c) => c.uid === g.uid);
                const def = getCardDefinition(g.defId);
                const leveled = g.newLevel > g.previousLevel;
                return (
                  <div key={g.uid} className={`db-xp-row ${leveled ? 'db-xp-row--levelup' : ''}`}>
                    <span>
                      <GameIcon name={KIND_ICON[def.kind]} /> {def.name} ({g.uid})
                    </span>
                    <span>+{g.xpAdded} EXP</span>
                    <span className="db-xp-row__lv">
                      {leveled ? <><GameIcon name="levelUp" /> Lv.{g.previousLevel} → Lv.{g.newLevel}!</> : card ? getXpProgress(card).label : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="db-result__actions">
          <button type="button" className="db-btn db-btn--end" onClick={onProceed}>
            {run.pendingEvolutions.length > 0
              ? `Lv.3 進化先を選ぶ (${run.pendingEvolutions.length}枚)`
              : run.status === 'won'
                ? '最終結果を見る'
                : '報酬を選ぶ'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CardPreviewPanel({
  card,
  cost,
  className = '',
}: {
  card: CardInstance;
  cost?: number;
  className?: string;
}) {
  const def = getCardDefinition(card.defId);
  const stats = getCardStats(card);
  const xpProg = getXpProgress(card);
  const telemetry = getCardTelemetry(card.defId);

  return (
    <aside className={`db-card-preview-panel ${className}`.trim()} aria-label="カードプレビュー">
      <div className="db-card-preview-float__tag">
        {telemetry.tag} // {card.uid}
      </div>
      <div className={`db-card db-card--${def.kind} db-card--${def.rarity} db-card--preview-large`}>
        <span className={`db-card__cost ${cost !== undefined && cost < stats.cost ? 'db-card__cost--discounted' : ''}`}>
          {def.unplayable ? '×' : cost ?? stats.cost}
        </span>
        <span className="db-card__band">{KIND_LABEL[def.kind]}</span>
        <CardArtwork defId={def.id} kind={def.kind} rarity={def.rarity} level={card.level} branchId={card.branchId} />
        <span className="db-card__name">{stats.name}</span>
        <span className="db-card__desc"><EffectText text={stats.text} /></span>
        <span className="db-card__lore">{def.lore}</span>
        <span className="db-card__level">{xpProg.label}</span>
      </div>
      <div className="db-card-preview-float__cmd" title="実行される攻撃・防御コマンドの例">
        <span>$</span> {telemetry.command}
      </div>
      <div className="db-card-preview-float__next">
        {card.level === 1 && (
          <span>
            <strong>Lv.2 強化後:</strong> {def.levels[2].cost}EN / <EffectText text={def.levels[2].text} />
          </span>
        )}
        {(card.level === 2 || (card.level === 3 && !card.branchId)) && def.branches.length > 0 && (
          <span>
            <strong>Lv.3 進化先:</strong>
            {def.branches.map((b) => (
              <span key={b.id} className="db-preview-branch">
                {b.name}({b.cost}EN):<EffectText text={b.text} />
              </span>
            ))}
          </span>
        )}
        {card.level === 3 && card.branchId && (
          <span>
            <strong>Lv.3 最終進化形態</strong>
          </span>
        )}
      </div>
      <GlossaryList text={stats.text} />
    </aside>
  );
}

function FloatingCardPreview({ card, side, cost }: { card: CardInstance; side: 'left' | 'right'; cost?: number }) {
  return <CardPreviewPanel card={card} cost={cost} className={`db-card-preview-float db-card-preview-float--${side}`} />;
}

function useCardHoverPreview(resetKey?: string | number | boolean) {
  const [hovered, setHovered] = useState<{
    card: CardInstance;
    side: 'left' | 'right';
    cost?: number;
    target: HTMLElement | null;
    key: string | number | boolean | undefined;
  } | null>(null);

  const hoverProps = (card: CardInstance, cost?: number) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const mid = typeof window !== 'undefined' ? window.innerWidth / 2 : 640;
      const side: 'left' | 'right' = rect.left + rect.width / 2 > mid ? 'left' : 'right';
      setHovered({ card, side, cost, target: e.currentTarget, key: resetKey });
    },
    onMouseLeave: () => setHovered((prev) => (prev?.card.uid === card.uid ? null : prev)),
    onFocus: (e: React.FocusEvent<HTMLElement>) =>
      setHovered({ card, side: 'right', cost, target: e.currentTarget, key: resetKey }),
    onBlur: () => setHovered((prev) => (prev?.card.uid === card.uid ? null : prev)),
  });

  const clearPreview = () => setHovered(null);
  const activeHovered =
    hovered && hovered.key === resetKey && (!hovered.target || hovered.target.isConnected)
      ? hovered
      : null;
  const previewNode = activeHovered ? (
    <FloatingCardPreview card={activeHovered.card} side={activeHovered.side} cost={activeHovered.cost} />
  ) : null;
  return { hoverProps, clearPreview, previewNode, hoveredUid: activeHovered?.card.uid };
}

function RewardOverlay({
  run,
  rewardDefIds,
  onPick,
  onRemove,
}: {
  run: RunState;
  rewardDefIds: string[];
  onPick: (defId: string | null) => void;
  onRemove: (cardUid: string) => void;
}) {
  const [compressMode, setCompressMode] = useState(false);
  const { hoverProps, clearPreview, previewNode } = useCardHoverPreview(compressMode);

  return (
    <div className="db-overlay" role="dialog" aria-modal="true">
      <div className="db-result db-result--wide db-result--won">
        <div className="db-result__title">REWARD DRAFT</div>
        {!compressMode ? (
          <>
            <p className="db-result__sub">デッキに加えるカードを1枚選んでください（代わりに不要カード1枚削除・スキップも可）。</p>
            <div className="db-reward-grid">
              {rewardDefIds.map((defId) => {
                const def = getCardDefinition(defId);
                const lv1 = def.levels[1];
                return (
                  <button
                    key={defId}
                    type="button"
                    className={`db-card db-card--${def.kind} db-card--${def.rarity} db-card--reward`}
                    onClick={() => onPick(defId)}
                  >
                    <span className="db-card__cost">{lv1.cost}</span>
                    <span className="db-card__band">{KIND_LABEL[def.kind]}</span>
                    <CardArtwork defId={def.id} kind={def.kind} rarity={def.rarity} level={1} />
                    <span className="db-card__name">{def.name}</span>
                    <span className="db-card__desc"><EffectText text={lv1.text} /></span>
                    <span className="db-card__lore">{def.lore}</span>
                  </button>
                );
              })}
            </div>
            <div className="db-result__actions">
              {run.deck.length > 1 && (
                <button type="button" className="db-btn db-btn--end" onClick={() => setCompressMode(true)}>
                  カードを1枚削除して圧縮する
                </button>
              )}
              <button type="button" className="db-btn db-btn--ghost" onClick={() => onPick(null)}>
                スキップして次のマスへ
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="db-result__sub">デッキから削除するカードを1枚選んでください。</p>
            <div className="db-deck-grid" style={{ margin: '12px 0 18px' }}>
              {run.deck.map((card) => {
                const stats = getCardStats(card);
                return (
                  <button
                    key={card.uid}
                    type="button"
                    className="db-deck-pill db-deck-pill--danger"
                    onClick={() => {
                      clearPreview();
                      onRemove(card.uid);
                    }}
                    {...hoverProps(card)}
                  >
                    <span>
                      <GameIcon name="trash" /> {stats.name} ({card.uid}) · {stats.cost}EN
                    </span>
                    <span className="db-muted">{getXpProgress(card).label} / <EffectText text={stats.text} /></span>
                  </button>
                );
              })}
            </div>
            <div className="db-result__actions">
              <button type="button" className="db-btn db-btn--ghost" onClick={() => setCompressMode(false)}>
                カード選択に戻る
              </button>
            </div>
          </>
        )}
      </div>
      {previewNode}
    </div>
  );
}

function EventScreen({
  run,
  eventView,
  onUseRecon,
  onAnswer,
  onPickXpCard,
  onStep2Reward,
  onStep3Reward,
  onNextQuestion,
  onContinue,
}: {
  run: RunState;
  eventView: EventViewState;
  onUseRecon: () => void;
  onAnswer: (choiceId: string) => void;
  onPickXpCard: (cardUid: string) => void;
  onStep2Reward: (action: { type: 'heal' } | { type: 'card'; defId: string } | { type: 'remove'; cardUid: string }) => void;
  onStep3Reward: (action: { type: 'relic'; relicId: RelicId } | { type: 'rare'; defId: string }) => void;
  onNextQuestion: () => void;
  onContinue: () => void;
}) {
  const {
    eventId,
    step,
    question,
    reconUsed,
    selectedChoiceId,
    isCorrect,
    hpLost,
    stepRewardDone,
    xpGain,
    rewardCards,
    rareCards,
    offeredRelic,
    finished,
  } = eventView;
  const selectedChoice = question.choices.find((c) => c.id === selectedChoiceId);
  const correctChoice = question.choices.find((c) => c.isCorrect);
  const filteredOutChoiceId = reconUsed ? getFilteredOutQuizChoiceId(question) : null;
  const allDeckMaxed = run.deck.every((c) => c.level === 3 && Boolean(c.branchId));
  const canChallengeMore = isCorrect === true && stepRewardDone && step < MAX_EVENT_STREAK && run.status === 'playing' && !finished;
  const canLeave = (selectedChoiceId !== null && !isCorrect && run.status === 'playing') || (isCorrect === true && stepRewardDone && run.status === 'playing');
  const { hoverProps, clearPreview, previewNode } = useCardHoverPreview(
    `${eventId}-${step}-${stepRewardDone}-${selectedChoiceId ?? ''}`,
  );

  return (
    <main className="db-event-wrap">
      <section className="db-event-card">
        <div className="db-event-head">
          <div className="db-event-head__left">
            <span className="db-event-pill db-event-pill--type">
              {eventId === 'vuln_check' ? '脆弱性診断' : 'パッチ適用'}
            </span>
            <span className="db-event-pill db-event-pill--step">
              {step} / {MAX_EVENT_STREAK} 問目
            </span>
            {selectedChoiceId !== null && question.mitreId && (
              <span className="db-event-tag db-event-tag--attck">{question.mitreId}</span>
            )}
            {selectedChoiceId !== null && question.cweId && (
              <span className="db-event-tag db-event-tag--cwe">{question.cweId}</span>
            )}
          </div>
          <div className="db-event-head__right">
            {!reconUsed && selectedChoiceId === null && (
              <button
                type="button"
                className="db-event-recon-mini"
                onClick={onUseRecon}
                disabled={run.reconCoins <= 0}
                title="解析コインを1枚消費してヒントを開示し、不正解の選択肢を1つ除外します"
              >
                {<GameIcon name="coin" />} {run.reconCoins > 0 ? `事前調査 (残${run.reconCoins})` : 'コイン不足'}
              </button>
            )}
            <span className="db-event-hp">
              HP {run.hp}/{run.maxHp}
            </span>
          </div>
        </div>

        <div className="db-event-question-box">
          {selectedChoiceId !== null && <div className="db-event-cat">{question.category}</div>}
          <p className="db-event-prompt">{question.prompt}</p>
          <div className="db-event-rules">
            <span className="db-event-rule db-event-rule--ok">
              正解:{' '}
              {step === 1
                ? `EXP +${getQuizXpReward(run)}`
                : step === 2
                  ? 'HP+10 / カード追加 / 削除'
                  : '常駐ツール / レアカード'}
            </span>
            <span className="db-event-rule db-event-rule--ng">
              不正解: {eventId === 'vuln_check' ? 'HP -5' : 'ペナルティなし'}
            </span>
          </div>
          <div className="db-event-scanlog">{question.scanTerminalLog}</div>
          {question.codeSnippet && <pre className="db-event-code">{question.codeSnippet}</pre>}
        </div>

        {reconUsed && (
          <div className="db-event-recon db-event-recon--done">
            <span className="db-event-recon__badge">事前調査済</span>
            <span className="db-event-recon__text">ダミー1択を除外しました — ヒント: {question.whyDangerous}</span>
          </div>
        )}

        <div className="db-event-choices" role="radiogroup" aria-label="イベント問題の選択肢">
          {question.choices.map((choice, idx) => {
            const picked = selectedChoiceId === choice.id;
            const isFilteredOut = filteredOutChoiceId === choice.id && selectedChoiceId === null;
            return (
              <button
                key={choice.id}
                type="button"
                disabled={selectedChoiceId !== null || isFilteredOut}
                onClick={() => onAnswer(choice.id)}
                className={[
                  'db-event-choice',
                  picked && choice.isCorrect ? 'db-event-choice--ok' : '',
                  picked && !choice.isCorrect ? 'db-event-choice--ng' : '',
                  selectedChoiceId && choice.isCorrect ? 'db-event-choice--reveal-ok' : '',
                  isFilteredOut ? 'db-event-choice--filtered' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="db-event-choice__num">{idx + 1}</span>
                <div className="db-event-choice__body">
                  <div className="db-event-choice__head">
                    <div className="db-event-choice__title">{choice.title}</div>
                    {isFilteredOut && (
                      <span className="db-event-choice__badge db-event-choice__badge--filtered">除外済</span>
                    )}
                    {selectedChoiceId !== null && choice.isCorrect && (
                      <span className="db-event-choice__badge db-event-choice__badge--ok"><GameIcon name="check" /> 正解</span>
                    )}
                    {picked && !choice.isCorrect && (
                      <span className="db-event-choice__badge db-event-choice__badge--ng"><GameIcon name="cross" /> 選択</span>
                    )}
                  </div>
                  <div className="db-event-choice__desc">{choice.description}</div>
                  {selectedChoiceId !== null && choice.command && (
                    <code className="db-event-choice__cmd">{choice.command}</code>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {selectedChoice && (
          <div className={`db-event-feedback ${isCorrect ? 'db-event-feedback--ok' : 'db-event-feedback--ng'}`}>
            <div className="db-event-feedback__badge">
              {isCorrect
                ? <><GameIcon name="check" /> {step}問目 正解！</>
                : <><GameIcon name="cross" /> 不正解（チャレンジ終了{hpLost > 0 ? `・HP -${hpLost}` : '・ペナルティなし'}）</>}
            </div>
            <p>{selectedChoice.feedback}</p>
            {!isCorrect && correctChoice && (
              <div className="db-event-feedback__correct-box">
                <strong><GameIcon name="hint" /> 正解の選択肢：「{correctChoice.title}」</strong>
                <p style={{ margin: '4px 0 0' }}>{correctChoice.feedback}</p>
              </div>
            )}
            <p className="db-event-feedback__sub">
              <strong>なぜ危険か:</strong> {question.whyDangerous}
            </p>
            <p className="db-event-feedback__sub">
              <strong>{question.defenseMeasure}</strong>
            </p>
          </div>
        )}

        {isCorrect === true && !stepRewardDone && step === 1 && (
          <div className="db-event-reward-box">
            <h3>1問目報酬: 経験値 +{getQuizXpReward(run)} を与えるカードを1枚選んでください</h3>
            <div className="db-deck-grid">
              {run.deck.map((card) => {
                const stats = getCardStats(card);
                const preview = previewQuizXpReward(run, card.uid);
                const disabled = preview.isMaxed && !allDeckMaxed;
                return (
                  <button
                    key={card.uid}
                    data-growth-card={card.uid}
                    type="button"
                    disabled={disabled}
                    className={[
                      'db-deck-pill',
                      preview.willEvolve ? 'db-deck-pill--evolve' : '',
                      preview.willLevelUp && !preview.willEvolve ? 'db-deck-pill--levelup' : '',
                      disabled ? 'db-deck-pill--maxed' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => {
                      clearPreview();
                      onPickXpCard(card.uid);
                    }}
                    {...hoverProps(card)}
                  >
                    <span className="db-deck-pill__title">
                      <GameIcon name={KIND_ICON[getCardDefinition(card.defId).kind]} /> {stats.name} ({card.uid})
                    </span>
                    <span className="db-muted">{getXpProgress(card).label}</span>
                    {preview.isMaxed ? (
                      <span className="db-deck-pill__preview db-deck-pill__preview--max">
                        <GameIcon name="lock" /> Lv.3 MAX（最大進化済）
                      </span>
                    ) : preview.willEvolve ? (
                      <span className="db-deck-pill__preview db-deck-pill__preview--evolve">
                        <GameIcon name="evolve" /> 選ぶと Lv.3 分岐進化！ (EXP {preview.currentXp}→{preview.nextXp})
                      </span>
                    ) : preview.willLevelUp ? (
                      <span className="db-deck-pill__preview db-deck-pill__preview--levelup">
                        <GameIcon name="levelUp" /> 選ぶと Lv.2 に強化！ (EXP {preview.currentXp}→{preview.nextXp})
                      </span>
                    ) : (
                      <span className="db-deck-pill__preview">
                        EXP {preview.currentXp} → {preview.nextXp}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {xpGain && (
          <div className="db-xp-row db-xp-row--levelup" style={{ marginTop: 10 }}>
            <span>
              <GameIcon name={KIND_ICON[getCardDefinition(xpGain.defId).kind]} /> {getCardDefinition(xpGain.defId).name} ({xpGain.uid}) に +{xpGain.xpAdded} EXP!
            </span>
            <span>{xpGain.newLevel > xpGain.previousLevel && <><GameIcon name="levelUp" /> Lv.{xpGain.previousLevel} → Lv.{xpGain.newLevel}</>}</span>
          </div>
        )}

        {isCorrect === true && !stepRewardDone && step === 2 && (
          <div className="db-event-reward-box">
            <h3>2問目連続正解ボーナス！以下から1つ選んでください</h3>
            <div className="db-result__actions" style={{ justifyContent: 'flex-start', marginBottom: 10 }}>
              <button type="button" className="db-btn db-btn--end" onClick={() => onStep2Reward({ type: 'heal' })}>
                HP を 10 回復 ({run.hp} → {Math.min(run.maxHp, run.hp + 10)})
              </button>
            </div>
            <div className="db-muted" style={{ marginBottom: 6 }}>
              またはカードを1枚デッキに加える:
            </div>
            <div className="db-reward-grid" style={{ margin: '6px 0 12px' }}>
              {rewardCards.map((defId) => {
                const def = getCardDefinition(defId);
                return (
                  <button
                    key={defId}
                    type="button"
                    className={`db-card db-card--${def.kind} db-card--${def.rarity} db-card--reward`}
                    onClick={() => onStep2Reward({ type: 'card', defId })}
                  >
                    <span className="db-card__cost">{def.levels[1].cost}</span>
                    <span className="db-card__band">{KIND_LABEL[def.kind]}</span>
                    <CardArtwork defId={def.id} kind={def.kind} rarity={def.rarity} level={1} />
                    <span className="db-card__name">{def.name}</span>
                    <span className="db-card__desc"><EffectText text={def.levels[1].text} /></span>
                  </button>
                );
              })}
            </div>
            {run.deck.length > 1 && (
              <>
                <div className="db-muted" style={{ marginBottom: 6 }}>
                  または不要なカードを1枚削除する:
                </div>
                <div className="db-deck-grid">
                  {run.deck.map((card) => {
                    const stats = getCardStats(card);
                    return (
                      <button
                        key={card.uid}
                        type="button"
                        className="db-deck-pill db-deck-pill--danger"
                        onClick={() => {
                          clearPreview();
                          onStep2Reward({ type: 'remove', cardUid: card.uid });
                        }}
                        {...hoverProps(card)}
                      >
                        <span>
                          <GameIcon name="trash" /> {stats.name} ({card.uid}) · Lv.{card.level}
                        </span>
                        <span className="db-muted">{stats.cost}EN / <EffectText text={stats.text} /></span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {isCorrect === true && !stepRewardDone && step === 3 && (
          <div className="db-event-reward-box">
            <h3>3問目パーフェクト達成！特賞を選んでください</h3>
            {offeredRelic && (
              <div style={{ marginBottom: 12 }}>
                <button type="button" className="db-evo-card db-evo-card--elite" onClick={() => onStep3Reward({ type: 'relic', relicId: offeredRelic })}>
                  <div className="db-evo-card__head">
                    <span className="db-evo-card__icon"><GameIcon name={RELIC_DEFINITIONS[offeredRelic].icon} /></span>
                    <span className="db-evo-card__cost">パッシブ装備</span>
                  </div>
                  <div className="db-evo-card__name">{RELIC_DEFINITIONS[offeredRelic].name}</div>
                  <div className="db-evo-card__text">{RELIC_DEFINITIONS[offeredRelic].description}</div>
                  <div className="db-evo-card__cta">この常駐ツールを装備する</div>
                </button>
              </div>
            )}
            <div className="db-muted" style={{ marginBottom: 6 }}>
              またはレアカードを1枚獲得する:
            </div>
            <div className="db-reward-grid" style={{ margin: '6px 0' }}>
              {rareCards.map((defId) => {
                const def = getCardDefinition(defId);
                return (
                  <button
                    key={defId}
                    type="button"
                    className={`db-card db-card--${def.kind} db-card--${def.rarity} db-card--reward`}
                    onClick={() => onStep3Reward({ type: 'rare', defId })}
                  >
                    <span className="db-card__cost">{def.levels[1].cost}</span>
                    <span className="db-card__band">{KIND_LABEL[def.kind]}</span>
                    <CardArtwork defId={def.id} kind={def.kind} rarity={def.rarity} level={1} />
                    <span className="db-card__name">{def.name}</span>
                    <span className="db-card__desc"><EffectText text={def.levels[1].text} /></span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {(canChallengeMore || canLeave) && (
          <div className="db-result__actions" style={{ marginTop: 14 }}>
            {canChallengeMore && (
              <button type="button" className="db-btn db-btn--end" onClick={onNextQuestion}>
                次の問題に挑戦する ({step + 1} / {MAX_EVENT_STREAK}問目) →
              </button>
            )}
            {canLeave && (
              <button type="button" className="db-btn db-btn--ghost" onClick={onContinue}>
                {canChallengeMore ? '報酬を確定して次のマスへ' : '次のマスへ進む →'}
              </button>
            )}
          </div>
        )}
      </section>
      {previewNode}
    </main>
  );
}

function RunResultOverlay({ run, onRetry, onBack }: { run: RunState; onRetry: () => void; onBack: () => void }) {
  const won = run.status === 'won';
  const { hoverProps, previewNode } = useCardHoverPreview(run.deck.length);
  return (
    <div className="db-overlay" role="dialog" aria-modal="true">
      <div className={`db-result db-result--wide ${won ? 'db-result--won' : 'db-result--lost'}`}>
        <div className="db-result__title">{won ? 'RUN COMPLETE // ARGUS 撃破' : 'CONNECTION LOST'}</div>
        <p className="db-result__sub">{won ? `全${MAP_TOTAL_FLOORS}段を突破し、監視AI ARGUSを攻略した！` : '回線耐久が尽きた…。'}</p>
        <div className="db-result__stats">
          <span>
            到達した段 {getCurrentFloor(run)} / {MAP_TOTAL_FLOORS}
          </span>
          <span>
            残りHP {run.hp} / {run.maxHp}
          </span>
          <span>デッキ {run.deck.length} 枚</span>
        </div>
        <div className="db-result__used">
          <div className="db-result__used-title">育てたカード一覧（カーソルを合わせるとカード詳細を表示）</div>
          <div className="db-deck-grid">
            {run.deck.map((card) => {
              const stats = getCardStats(card);
              return (
                <div key={card.uid} className="db-deck-pill" tabIndex={0} {...hoverProps(card)}>
                  <span>
                    <GameIcon name={KIND_ICON[getCardDefinition(card.defId).kind]} /> {stats.name}
                  </span>
                  <span className="db-muted">
                    Lv.{card.level} (EXP {card.xp})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="db-result__actions">
          <button type="button" className="db-btn db-btn--end" onClick={onRetry}>
            もう一度遊ぶ
          </button>
          <button type="button" className="db-btn db-btn--ghost" onClick={onBack}>
            ミッション選択へ
          </button>
        </div>
      </div>
      {previewNode}
    </div>
  );
}

function DeckModal({ deck, onClose }: { deck: CardInstance[]; onClose: () => void }) {
  const [hoveredCard, setHoveredCard] = useState<CardInstance | null>(null);
  return (
    <div className="db-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="db-deck-stage">
        <div className="db-result db-result--wide db-result--deck" onClick={(e) => e.stopPropagation()}>
          <div className="db-result__title">現在のデッキ ({deck.length}枚)</div>
          <div className="db-deck-grid" style={{ margin: '14px 0' }}>
            {deck.map((card) => {
              const def = getCardDefinition(card.defId);
              const stats = getCardStats(card);
              const isActive = hoveredCard?.uid === card.uid;
              return (
                <div
                  key={card.uid}
                  className={`db-deck-pill${isActive ? ' db-deck-pill--active' : ''}`}
                  tabIndex={0}
                  onMouseEnter={() => setHoveredCard(card)}
                  onMouseLeave={() => setHoveredCard((prev) => (prev?.uid === card.uid ? null : prev))}
                  onFocus={() => setHoveredCard(card)}
                  onBlur={() => setHoveredCard((prev) => (prev?.uid === card.uid ? null : prev))}
                >
                  <span>
                    <GameIcon name={KIND_ICON[getCardDefinition(card.defId).kind]} /> {stats.name} ({card.uid}) · {stats.cost}EN
                  </span>
                  <span className="db-muted">
                    {getXpProgress(card).label} / <EffectText text={stats.text} />
                  </span>
                  <span className="db-muted" style={{ fontSize: 10 }}>
                    {def.lore}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="db-result__actions">
            <button type="button" className="db-btn db-btn--ghost" onClick={onClose}>
              閉じる
            </button>
          </div>
        </div>
        <div className="db-deck-preview-dock" onClick={(e) => e.stopPropagation()}>
          {hoveredCard ? (
            <CardPreviewPanel card={hoveredCard} className="db-card-preview-panel--dock" />
          ) : (
            <div className="db-deck-preview-empty" aria-hidden="true">
              <div className="db-deck-preview-empty__tag">CARD PREVIEW</div>
              <div className="db-deck-preview-empty__text">
                カードにカーソルを合わせると
                <br />
                ここに拡大表示されます
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function CoinShopScreen({
  run,
  notice,
  onBuy,
  onContinue,
}: {
  run: RunState;
  notice: string | null;
  onBuy: (action: CoinShopAction) => void;
  onContinue: () => void;
}) {
  const [shopTools] = useState<ToolId[]>(() => pickShopTools(run.visitedNodeIds.length * 31 + run.reconCoins + 7));
  const offeredRelic = pickAvailableRelic(run, run.visitedNodeIds.length * 17 + 5);
  const { hoverProps, clearPreview, previewNode } = useCardHoverPreview(
    `${run.deck.length}-${run.reconCoins}`,
  );

  return (
    <main className="db-event-wrap" aria-label="解析コイン闇市">
      <section className="db-result db-result--wide db-hub">
        <div className="db-hub__head">
          <div>
            <div className="db-result__title" style={{ fontSize: 18 }}>
              BLACK MARKET // 解析コイン闇市
            </div>
            <p className="db-muted" style={{ margin: '2px 0 0' }}>
              所持コイン: <GameIcon name="coin" /> {run.reconCoins} 枚（イベントの事前調査にも使えます）
            </p>
          </div>
          <button type="button" className="db-btn db-btn--end" onClick={onContinue}>
            次のマスへ進む →
          </button>
        </div>

        {notice && <p className="db-notice" role="status">{notice}</p>}

        <div className="db-codex-grid" style={{ marginBottom: 14 }}>
          <button
            type="button"
            className="db-evo-card"
            disabled={run.reconCoins < 1 || run.hp >= run.maxHp}
            onClick={() => onBuy({ type: 'heal' })}
          >
            <div className="db-evo-card__head">
              <span className="db-evo-card__icon"><GameIcon name="heal" /></span>
              <span className="db-evo-card__cost"><GameIcon name="coin" /> 1枚</span>
            </div>
            <div className="db-evo-card__name">緊急回線修復 (HP +12)</div>
            <div className="db-evo-card__text">
              現在 HP {run.hp} / {run.maxHp}
            </div>
          </button>

          {shopTools.map((toolId) => {
            const t = TOOL_DEFINITIONS[toolId];
            return (
              <button
                key={toolId}
                type="button"
                className="db-evo-card"
                disabled={run.reconCoins < 1 || run.tools.length >= MAX_TOOLS}
                onClick={() => onBuy({ type: 'tool', toolId })}
              >
                <div className="db-evo-card__head">
                  <span className="db-evo-card__icon"><GameIcon name={t.icon} /></span>
                  <span className="db-evo-card__cost"><GameIcon name="coin" /> 1枚</span>
                </div>
                <div className="db-evo-card__name">{t.name}（常備ツール）</div>
                <div className="db-evo-card__text">
                  {t.description}（所持 {run.tools.length}/{MAX_TOOLS}）
                </div>
              </button>
            );
          })}

          {offeredRelic && (
            <button
              type="button"
              className="db-evo-card db-evo-card--elite"
              disabled={run.reconCoins < 3}
              onClick={() => onBuy({ type: 'relic', relicId: offeredRelic })}
            >
              <div className="db-evo-card__head">
                <span className="db-evo-card__icon"><GameIcon name={RELIC_DEFINITIONS[offeredRelic].icon} /></span>
                <span className="db-evo-card__cost"><GameIcon name="coin" /> 3枚</span>
              </div>
              <div className="db-evo-card__name">{RELIC_DEFINITIONS[offeredRelic].name}</div>
              <div className="db-evo-card__text">
                {RELIC_DEFINITIONS[offeredRelic].description}
              </div>
            </button>
          )}
        </div>

        <h3 className="db-hub__sub"><GameIcon name="coin" /> 2枚で不要カードを1枚削除（現在デッキ {run.deck.length} 枚）</h3>
        <div className="db-deck-grid">
          {run.deck.map((card) => {
            const stats = getCardStats(card);
            return (
              <button
                key={card.uid}
                type="button"
                className="db-deck-pill db-deck-pill--danger"
                disabled={run.reconCoins < 2 || run.deck.length <= 1}
                onClick={() => {
                  clearPreview();
                  onBuy({ type: 'remove', cardUid: card.uid });
                }}
                {...hoverProps(card)}
              >
                <span>
                  <GameIcon name="trash" /> {stats.name} ({card.uid}) · Lv.{card.level}
                </span>
                <span className="db-muted"><GameIcon name="coin" /> 2枚で削除 / {stats.cost}EN · <EffectText text={stats.text} /></span>
              </button>
            );
          })}
        </div>
      </section>
      {previewNode}
    </main>
  );
}


/** 初期ビルドごとの枠の色(ミッション選択画面のカードと同じ考え方) */
const LOADOUT_ACCENT: Record<LoadoutId, 'green' | 'red' | 'cyan' | 'amber'> = {
  balanced: 'green',
  red_team: 'red',
  blue_team: 'cyan',
  thermal_ops: 'amber',
};

function RunSetupScreen({
  initialLoadout,
  initialSecurityLevel,
  onDeploy,
  onStartTutorialTrial,
  onBack,
}: {
  initialLoadout: LoadoutId;
  initialSecurityLevel: number;
  onDeploy: (loadoutId: LoadoutId, securityLevel: number) => void;
  onStartTutorialTrial: () => void;
  onBack: () => void;
}) {
  const [loadoutId, setLoadoutId] = useState<LoadoutId>(initialLoadout);
  const [secLevel, setSecLevel] = useState<number>(initialSecurityLevel);
  const activeSec = SECURITY_LEVELS[secLevel] ?? SECURITY_LEVELS[0];

  return (
    <main className="db-setup" aria-label="出撃構成の選択">
      <div className="db-setup__overlay" aria-hidden="true" />
      <div className="db-setup__inner">
        <header className="db-setup__hero">
          <div>
            <div className="db-setup__code">// OPERATION_BRIEFING :: DECK_BREACH</div>
            <h2 className="db-setup__title">LOADOUT SELECT</h2>
            <p className="db-setup__sub">初期ビルド(オペレーター)と難易度を選んで出撃する。</p>
          </div>
          <button type="button" className="db-setup__back" onClick={onBack}>
            <span aria-hidden="true">←</span> RETURN (ミッション選択へ)
          </button>
        </header>

        <div className="db-setup__label">01 // 初期ビルド(オペレーター)</div>
        <div className="db-setup__grid">
          {ALL_LOADOUT_IDS.map((id, index) => {
            const def = LOADOUT_DEFINITIONS[id];
            const selected = loadoutId === id;
            const relicNames = def.relics.map((r) => RELIC_DEFINITIONS[r].name).join(' / ');
            const toolNames = def.tools.map((t) => TOOL_DEFINITIONS[t].name).join(' / ');
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                className={`db-setup-op db-setup-op--${LOADOUT_ACCENT[id]}${selected ? ' db-setup-op--selected' : ''}`}
                style={{ animationDelay: `${index * 60}ms` }}
                onClick={() => {
                  playSound('click');
                  setLoadoutId(id);
                }}
              >
                <span className="db-setup-op__corner db-setup-op__corner--tl" aria-hidden="true" />
                <span className="db-setup-op__corner db-setup-op__corner--tr" aria-hidden="true" />
                <span className="db-setup-op__corner db-setup-op__corner--bl" aria-hidden="true" />
                <span className="db-setup-op__corner db-setup-op__corner--br" aria-hidden="true" />
                <span className="db-setup-op__head">
                  <span className="db-setup-op__code">OP-0{index + 1} // {def.tag}</span>
                  {selected && <span className="db-setup-op__badge">SELECTED</span>}
                </span>
                <span className="db-setup-op__portrait">
                  <img src={LOADOUT_PORTRAIT[id]} alt={def.name} draggable={false} />
                </span>
                <span className="db-setup-op__body">
                  <span className="db-setup-op__name">
                    <GameIcon name={def.icon} /> {def.name}
                  </span>
                  <span className="db-setup-op__desc">{def.description}</span>
                </span>
                <span className="db-setup-op__meta">
                  <span className="db-setup-op__row">
                    <span className="db-setup-op__key">HP</span>
                    <span className="db-setup-op__val">{Math.max(25, def.maxHp - (secLevel >= 3 ? 10 : 0))}</span>
                  </span>
                  <span className="db-setup-op__row">
                    <span className="db-setup-op__key">TOOL</span>
                    <span className="db-setup-op__val">{toolNames}</span>
                  </span>
                  <span className="db-setup-op__row">
                    <span className="db-setup-op__key">RELIC</span>
                    <span className="db-setup-op__val">{relicNames || 'なし(汎用デッキ)'}</span>
                  </span>
                </span>
                <span className="db-setup-op__foot">
                  {selected ? (
                    <>
                      <GameIcon name="check" /> READY
                    </>
                  ) : (
                    <>▶ SELECT</>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="db-setup__label">02 // セキュリティレベル(高難度モード)</div>
        <div className="db-setup__sec">
          <div className="db-setup__sec-bar" role="radiogroup" aria-label="セキュリティレベル">
            {SECURITY_LEVELS.map((info) => (
              <button
                key={info.level}
                type="button"
                role="radio"
                aria-checked={secLevel === info.level}
                className={`db-setup__sec-pill${secLevel === info.level ? ' db-setup__sec-pill--active' : ''}${info.level >= 3 ? ' db-setup__sec-pill--hot' : ''}`}
                onClick={() => {
                  playSound('click');
                  setSecLevel(info.level);
                }}
              >
                {info.label}
              </button>
            ))}
          </div>
          <p className="db-setup__sec-desc">
            <span className="db-setup__sec-tag">THREAT</span> {activeSec.summary}
          </p>
        </div>

        <footer className="db-setup__foot">
          <span className="db-setup__foot-info">
            ENCRYPTED TUNNEL: READY // {LOADOUT_DEFINITIONS[loadoutId].tag} / SEC Lv.{secLevel}
          </span>
          <div className="db-setup__foot-actions">
            <button
              type="button"
              className="db-setup__trial"
              onClick={onStartTutorialTrial}
              title="はじめての方向け：操作ガイド付きで弱点攻撃・防御・ボス戦を実戦で学べるチュートリアル"
            >
              チュートリアルをプレイ <span className="db-setup__trial-en">// TUTORIAL</span>
            </button>
            <button type="button" className="db-setup__deploy" onClick={() => onDeploy(loadoutId, secLevel)}>
              ▶ この構成で出撃する <span className="db-setup__deploy-en">// DEPLOY</span>
            </button>
          </div>
        </footer>
      </div>
    </main>
  );
}

function MysteryScreen({
  run,
  mysteryView,
  onChoose,
  onContinue,
}: {
  run: RunState;
  mysteryView: MysteryViewState;
  onChoose: (choiceId: string) => void;
  onContinue: () => void;
}) {
  const def = MYSTERY_EVENTS[mysteryView.eventId];

  return (
    <main className="db-event-wrap" aria-label="ハプニングイベント">
      <section className="db-event-card">
        <div className="db-event-head">
          <div className="db-event-head__left">
            <span className="db-event-pill db-event-pill--type"><GameIcon name="mystery" /> MYSTERY NODE</span>
            <span className="db-event-pill db-event-pill--step">リスク＆リターン選択</span>
          </div>
          <span className="db-event-hp">
            HP {run.hp} / {run.maxHp} · <GameIcon name="coin" /> {run.reconCoins}
          </span>
        </div>

        <div className="db-event-question-box">
          <p className="db-event-cat"><GameIcon name={def.icon} /> ハプニング発生</p>
          <p className="db-event-prompt">{def.title}</p>
          <p className="db-muted" style={{ margin: 0, lineHeight: 1.6, color: '#cbd5e1' }}>
            {def.lead}
          </p>
        </div>

        {!mysteryView.summary ? (
          <div className="db-event-choices">
            {def.choices.map((c) => {
              const notEnoughCoin = c.id === 'coin_tune' && run.reconCoins < 1;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`db-event-choice db-mystery-choice--${c.tone}`}
                  disabled={notEnoughCoin}
                  onClick={() => onChoose(c.id)}
                >
                  <span className={`db-mystery-badge db-mystery-badge--${c.tone}`}>{c.riskTag}</span>
                  <div className="db-event-choice__body">
                    <div className="db-event-choice__title">{c.label}</div>
                    <div className="db-event-choice__desc">
                      {notEnoughCoin ? '解析コインが足りません（必要: 1枚）' : c.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <>
            <div className="db-event-feedback db-event-feedback--ok" style={{ marginTop: 12 }}>
              <div className="db-event-feedback__badge"><GameIcon name="check" /> 選択結果</div>
              <p style={{ margin: '4px 0 0' }}>{mysteryView.summary}</p>
            </div>
            <div className="db-result__actions" style={{ marginTop: 16 }}>
              <button type="button" className="db-btn db-btn--end" onClick={onContinue}>
                次のマスへ進む →
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function RestScreen({
  run,
  summary,
  onAction,
  onContinue,
}: {
  run: RunState;
  summary: string | null;
  onAction: (action: RestAction) => void;
  onContinue: () => void;
}) {
  const [mode, setMode] = useState<'menu' | 'upgrade' | 'remove'>('menu');
  const { hoverProps, clearPreview, previewNode } = useCardHoverPreview(`${mode}-${Boolean(summary)}`);
  const healAmt = Math.floor(run.maxHp * REST_HEAL_RATIO);
  const upgradable = run.deck.filter((c) => c.level < 3 && !getCardDefinition(c.defId).unplayable);

  return (
    <main className="db-event-wrap" aria-label="休憩・システム保守">
      <section className="db-event-card">
        <div className="db-event-head">
          <div className="db-event-head__left">
            <span className="db-event-pill db-event-pill--type"><GameIcon name="rest" /> SYSTEM MAINTENANCE</span>
            <span className="db-event-pill db-event-pill--step">整備マス</span>
          </div>
          <span className="db-event-hp">
            HP {run.hp} / {run.maxHp}
          </span>
        </div>

        <div className="db-event-question-box">
          <p className="db-event-cat">セーフハウス接続完了</p>
          <p className="db-event-prompt">次の戦いに備えて、1つだけメンテナンスを実行できます。</p>
        </div>

        {summary ? (
          <>
            <div className="db-event-feedback db-event-feedback--ok">
              <div className="db-event-feedback__badge"><GameIcon name="check" /> メンテナンス完了</div>
              <p style={{ margin: '4px 0 0' }}>{summary}</p>
            </div>
            <div className="db-result__actions" style={{ marginTop: 16 }}>
              <button type="button" className="db-btn db-btn--end" onClick={onContinue}>
                次のマスへ進む →
              </button>
            </div>
          </>
        ) : mode === 'menu' ? (
          <div className="db-rest-grid">
            <button
              type="button"
              className="db-evo-card"
              disabled={run.hp >= run.maxHp}
              onClick={() => onAction({ type: 'heal' })}
            >
              <div className="db-evo-card__head">
                <span className="db-evo-card__icon"><GameIcon name="heal" /></span>
                <span className="db-evo-card__cost">HP +{healAmt}</span>
              </div>
              <div className="db-evo-card__name">回線メンテ（大幅回復）</div>
              <div className="db-evo-card__text">
                最大HPの35%を回復する（{run.hp} → {Math.min(run.maxHp, run.hp + healAmt)}）。
              </div>
            </button>

            <button
              type="button"
              className="db-evo-card db-evo-card--elite"
              disabled={upgradable.length === 0}
              onClick={() => {
                playSound('click');
                setMode('upgrade');
              }}
            >
              <div className="db-evo-card__head">
                <span className="db-evo-card__icon"><GameIcon name="upgrade" /></span>
                <span className="db-evo-card__cost">即LvUP / 進化</span>
              </div>
              <div className="db-evo-card__name">カード即チューニング</div>
              <div className="db-evo-card__text">
                好きなカード1枚を即座に次のレベルへ強化（Lv.2なら即Lv.3分岐進化）。
              </div>
            </button>

            <button
              type="button"
              className="db-evo-card"
              disabled={run.deck.length <= 1}
              onClick={() => {
                playSound('click');
                setMode('remove');
              }}
            >
              <div className="db-evo-card__head">
                <span className="db-evo-card__icon"><GameIcon name="trash" /></span>
                <span className="db-evo-card__cost">デッキ圧縮</span>
              </div>
              <div className="db-evo-card__name">不要カード削除</div>
              <div className="db-evo-card__text">
                デッキから不要なカードを1枚削除して、主力カードを引きやすくする。
              </div>
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span className="db-muted">
                {mode === 'upgrade' ? 'レベルアップするカードを1枚選択:' : '削除するカードを1枚選択:'}
              </span>
              <button
                type="button"
                className="db-btn db-btn--ghost"
                onClick={() => {
                  clearPreview();
                  setMode('menu');
                }}
              >
                ← 戻る
              </button>
            </div>
            <div className="db-deck-grid">
              {(mode === 'upgrade' ? upgradable : run.deck).map((card) => {
                const stats = getCardStats(card);
                return (
                  <button
                    key={card.uid}
                    data-growth-card={card.uid}
                    type="button"
                    className={`db-deck-pill${mode === 'remove' ? ' db-deck-pill--danger' : ''}`}
                    onClick={() => {
                      clearPreview();
                      onAction(mode === 'upgrade' ? { type: 'upgrade', cardUid: card.uid } : { type: 'remove', cardUid: card.uid });
                    }}
                    {...hoverProps(card)}
                  >
                    <span>
                      <GameIcon name={mode === 'upgrade' ? 'upgrade' : 'trash'} /> {stats.name} ({card.uid}) · Lv.{card.level}
                    </span>
                    <span className="db-muted">
                      {mode === 'upgrade'
                        ? card.level === 2
                          ? '即 Lv.3 分岐進化！'
                          : '即 Lv.2 強化！'
                        : `${stats.cost}EN / ${stats.text}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>
      {previewNode}
    </main>
  );
}
