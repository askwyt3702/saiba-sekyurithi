// SECTOR 06 のゲーム画面(M1:戦闘 + M2:成長・進化 + M3:6マスラン・連続クイズ・レリック・エリート分岐)。
// ルールはすべて game/deckbattle/ にあり、この画面は表示と操作の受け渡しだけをする。
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeckQuizQuestion } from '../../game/data/securityLearningData';
import {
  cardNeedsTarget,
  endTurn,
  getCardDefinition,
  getCardStats,
  getEnemyIntent,
  getPlayCost,
  livingEnemies,
  playCard,
} from '../../game/deckbattle/battle';
import { ENEMY_DEFINITIONS } from '../../game/deckbattle/enemies';
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
  MAX_EVENT_STREAK,
  advanceToNextNode,
  applyBattleResult,
  applyPatchBonus,
  applyQuizXpReward,
  chooseEvolution,
  createBattleForCurrentNode,
  createRun,
  getFilteredOutQuizChoiceId,
  getXpProgress,
  grantRelic,
  pickAvailableRelic,
  pickEventQuestion,
  pickRarePool,
  pickRewardCard,
  pickRewardPool,
  previewQuizXpReward,
  removeCardFromDeck,
  resolveEventQuiz,
  spendReconCoin,
} from '../../game/deckbattle/run';
import type {
  BattleState,
  CardInstance,
  CardKind,
  EnemyActionEvent,
  EnemyMove,
  EnemyState,
  RelicId,
  RunEventId,
  RunNode,
  RunState,
  XpGainEntry,
} from '../../game/deckbattle/types';
import { playSound } from '../../game/sound/soundEffects';
import './DeckBattle.css';

const ENEMY_STEP_MS = 900;
const FX_MS = 1100;
const KIND_LABEL: Record<CardKind, string> = { attack: '攻撃', defense: '防御', utility: '補助' };

type FxTone = 'hit' | 'shield' | 'heal' | 'buff' | 'bad' | 'burn';
interface Fx {
  id: number;
  at: string;
  text: string;
  tone: FxTone;
}
type FxSpec = Omit<Fx, 'id'>;

interface Playback {
  base: BattleState;
  events: EnemyActionEvent[];
  index: number;
  final: BattleState;
}

type StagePhase = 'battle' | 'elite_choice' | 'post_battle' | 'evolve' | 'reward' | 'event' | 'run_result';

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

function describeNodeShort(node: RunNode, index: number): string {
  if (node.kind === 'boss') return `${index + 1}. ボス:ARGUS`;
  if (node.kind === 'event') return `${index + 1}. ${node.eventId === 'vuln_check' ? '診断クイズ' : 'パッチ適用'}`;
  const first = ENEMY_DEFINITIONS[node.enemyIds[0]];
  const suffix = node.enemyIds.length > 1 ? `×${node.enemyIds.length}` : '';
  return `${index + 1}. ${first?.name ?? '敵'}${suffix}`;
}

function describeIntent(move: EnemyMove): { icon: string; text: string; title: string; tone: 'attack' | 'defend' | 'debuff' } {
  switch (move.type) {
    case 'attack':
      return {
        icon: '⚔',
        text: move.hits && move.hits > 1 ? `${move.amount}×${move.hits}` : `${move.amount}`,
        title: move.hits && move.hits > 1 ? `${move.amount}ダメージの攻撃を${move.hits}回` : `${move.amount}ダメージの攻撃`,
        tone: 'attack',
      };
    case 'blockAttack':
      return { icon: '🛡⚔', text: `${move.block} / ${move.amount}`, title: `FW${move.block}を張って、${move.amount}ダメージの攻撃`, tone: 'attack' };
    case 'block':
      return { icon: '🛡', text: `${move.amount}`, title: `FW${move.amount}を張る`, tone: 'defend' };
    case 'buff':
      return { icon: '⬆', text: `+${move.amount}`, title: `攻撃力を+${move.amount}する(ずっと続く)`, tone: 'debuff' };
    case 'detect':
      return { icon: '👁', text: '検知', title: `検知:次のターンの帯域が${move.amount}減る`, tone: 'debuff' };
    case 'noise':
      return { icon: '☣', text: `×${move.count}`, title: `使えないノイズを${move.count}枚、捨て札に入れる`, tone: 'debuff' };
  }
}

function fxForEvent(ev: EnemyActionEvent): FxSpec[] {
  switch (ev.kind) {
    case 'attack':
      return [ev.damage > 0 ? { at: 'player', text: `-${ev.damage}`, tone: 'hit' } : { at: 'player', text: '防いだ', tone: 'shield' }];
    case 'block':
      return [{ at: ev.enemyUid, text: `+FW${ev.amount}`, tone: 'shield' }];
    case 'buff':
      return [{ at: ev.enemyUid, text: `攻撃力+${ev.amount}`, tone: 'bad' }];
    case 'detect':
      return [{ at: 'player', text: `検知:帯域-${ev.amount}`, tone: 'bad' }];
    case 'noise':
      return [{ at: 'player', text: `ノイズ+${ev.count}`, tone: 'bad' }];
    case 'retaliate':
      return [{ at: ev.enemyUid, text: `反撃-${ev.damage}`, tone: 'hit' }];
    case 'burn':
      return [{ at: ev.enemyUid, text: `過熱-${ev.damage}`, tone: 'burn' }];
  }
}

function fxForPlay(before: BattleState, after: BattleState): FxSpec[] {
  const specs: FxSpec[] = [];
  for (const enemy of after.enemies) {
    const prev = before.enemies.find((e) => e.uid === enemy.uid);
    if (!prev) continue;
    const hpLost = prev.hp - enemy.hp;
    const blockLost = prev.block - enemy.block;
    if (hpLost > 0) specs.push({ at: enemy.uid, text: `-${hpLost}`, tone: 'hit' });
    else if (blockLost > 0) specs.push({ at: enemy.uid, text: `FW-${blockLost}`, tone: 'shield' });
    if (enemy.burn && !prev.burn) specs.push({ at: enemy.uid, text: `過熱${enemy.burn.amount}`, tone: 'burn' });
    else if (enemy.burn && prev.burn && enemy.burn.amount > prev.burn.amount) {
      specs.push({ at: enemy.uid, text: `過熱+${enemy.burn.amount - prev.burn.amount}`, tone: 'burn' });
    }
  }
  const blockGain = after.player.block - before.player.block;
  if (blockGain > 0) specs.push({ at: 'player', text: `+FW${blockGain}`, tone: 'shield' });
  const hpGain = after.player.hp - before.player.hp;
  if (hpGain > 0) specs.push({ at: 'player', text: `+HP${hpGain}`, tone: 'heal' });
  if (after.modifiers.reconCombo === 'done' && before.modifiers.reconCombo === 'ready') {
    specs.push({ at: 'player', text: '解析コンボ +1EN', tone: 'buff' });
  }
  if (after.modifiers.nextAttackBonus > before.modifiers.nextAttackBonus) {
    specs.push({ at: 'player', text: `次攻撃+${after.modifiers.nextAttackBonus - before.modifiers.nextAttackBonus}`, tone: 'buff' });
  }
  if (after.modifiers.repeatNextAttack && !before.modifiers.repeatNextAttack) {
    specs.push({ at: 'player', text: '2回発動準備', tone: 'buff' });
  }
  if (after.player.retaliate > before.player.retaliate) {
    specs.push({ at: 'player', text: `反撃+${after.player.retaliate - before.player.retaliate}`, tone: 'buff' });
  }
  return specs;
}

function snapshotState(base: BattleState, event: EnemyActionEvent): BattleState {
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

function createRunWithProfileCoins(fastGrowth: boolean): RunState {
  const fresh = createRun({ fastGrowth });
  const { profile, coins } = consumeBonusStartCoins(loadDeckProfile());
  if (coins > 0) saveDeckProfile(profile);
  return coins > 0 ? { ...fresh, reconCoins: fresh.reconCoins + coins } : fresh;
}

export function DeckBattle({ onBackToMissions }: DeckBattleProps) {
  const [run, setRun] = useState<RunState>(() => createRunWithProfileCoins(true));
  const [battle, setBattle] = useState<BattleState>(() => createBattleForCurrentNode(run, randomSeed()));
  const [phase, setPhase] = useState<StagePhase>('battle');
  const [postBattle, setPostBattle] = useState<PostBattleSummary | null>(null);
  const [evolveOrigin, setEvolveOrigin] = useState<'post_battle' | 'event'>('post_battle');
  const [eventView, setEventView] = useState<EventViewState | null>(null);
  const [showDeckModal, setShowDeckModal] = useState(false);

  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [fx, setFx] = useState<Fx[]>([]);
  const fxId = useRef(1);

  const shown = playback ? (playback.index >= 0 ? snapshotState(playback.base, playback.events[playback.index]) : playback.base) : battle;
  const actingUid = playback && playback.index >= 0 ? playback.events[playback.index].enemyUid : null;
  const busy = playback !== null || battle.status !== 'playing' || phase !== 'battle';

  const pushFx = useCallback((specs: FxSpec[]) => {
    if (specs.length === 0) return;
    const added = specs.map((s) => ({ ...s, id: fxId.current++ }));
    setFx((prev) => [...prev, ...added]);
    const ids = new Set(added.map((a) => a.id));
    window.setTimeout(() => setFx((prev) => prev.filter((f) => !ids.has(f.id))), FX_MS);
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
      setPostBattle({
        xpGains: resolved.xpGains,
        rewardChoices: resolved.rewardChoices,
        healed: resolved.healed,
        coinsDropped: resolved.coinsDropped,
      });
      setPhase('post_battle');
    },
    [run],
  );

  useEffect(() => {
    if (!playback) return;
    const next = playback.index + 1;
    if (next >= playback.events.length) {
      const t = window.setTimeout(() => {
        const final = playback.final;
        setBattle(final);
        setPlayback(null);
        if (final.status === 'lost') {
          playSound('alert');
          handleBattleFinished(final);
        } else if (final.status === 'won') {
          playSound('extract');
          handleBattleFinished(final);
        }
      }, ENEMY_STEP_MS);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => {
      const ev = playback.events[next];
      if (ev.kind === 'attack') playSound(ev.damage > 0 ? 'alert' : 'recover');
      else if (ev.kind === 'burn' || ev.kind === 'retaliate') playSound('breach');
      else playSound('scan');
      pushFx(fxForEvent(ev));
      setPlayback((p) => (p ? { ...p, index: next } : null));
    }, next === 0 ? 350 : ENEMY_STEP_MS);
    return () => window.clearTimeout(t);
  }, [playback, pushFx, handleBattleFinished]);

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

  const startRun = (fastGrowth = run.fastGrowth) => {
    playSound('click');
    const fresh = createRunWithProfileCoins(fastGrowth);
    setRun(fresh);
    setBattle(createBattleForCurrentNode(fresh, randomSeed()));
    setPhase('battle');
    setPostBattle(null);
    setEventView(null);
    setSelectedUid(null);
    setNotice(null);
    setPlayback(null);
    setFx([]);
  };

  const toggleFastGrowth = () => {
    playSound('click');
    setRun((prev) => ({ ...prev, fastGrowth: !prev.fastGrowth }));
  };

  const enterNode = (nextRun: RunState) => {
    const node = nextRun.nodes[nextRun.nodeIndex];
    setSelectedUid(null);
    setNotice(null);
    setPlayback(null);
    setFx([]);
    if (!node) {
      setPhase('run_result');
      return;
    }
    if (node.kind === 'event') {
      setEventView(buildEventStep(nextRun, node.eventId, 1));
      setPhase('event');
      return;
    }
    if (node.kind === 'battle' && node.eliteEnemyIds && node.eliteEnemyIds.length > 0) {
      setPhase('elite_choice');
      return;
    }
    setBattle(createBattleForCurrentNode(nextRun, randomSeed()));
    setPhase('battle');
  };

  const onChooseRoute = (useElite: boolean) => {
    playSound('click');
    const updated: RunState = { ...run, currentBattleElite: useElite };
    setRun(updated);
    setBattle(createBattleForCurrentNode(updated, randomSeed(), useElite));
    setPhase('battle');
  };

  const tryPlay = (uid: string, targetUid?: string) => {
    const result = playCard(battle, uid, targetUid);
    if (!result.accepted) {
      setNotice(result.reason ?? 'そのカードは使えません。');
      playSound('alert');
      return;
    }
    const kind = getCardDefinition(battle.cards[uid].defId).kind;
    playSound(kind === 'attack' ? 'breach' : kind === 'defense' ? 'recover' : 'scan');
    pushFx(fxForPlay(battle, result.state));
    setBattle(result.state);
    setSelectedUid(null);
    setNotice(null);
    if (result.state.status === 'won') {
      window.setTimeout(() => {
        playSound('extract');
        handleBattleFinished(result.state);
      }, 400);
    }
  };

  const onCardClick = (uid: string) => {
    if (busy) return;
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
    if (busy) return;
    playSound('click');
    const final = endTurn(battle);
    const base: BattleState = { ...battle, hand: [], discard: [...battle.discard, ...battle.hand] };
    setSelectedUid(null);
    setNotice(null);
    setPlayback({ base, events: final.lastEnemyActions, index: -1, final });
  };

  const proceedAfterPostBattle = () => {
    playSound('click');
    if (run.pendingEvolutions.length > 0) {
      setEvolveOrigin('post_battle');
      setPhase('evolve');
      return;
    }
    if (run.status === 'won') {
      setPhase('run_result');
      return;
    }
    if (postBattle && postBattle.rewardChoices.length > 0) {
      setPhase('reward');
      return;
    }
    const nextRun = advanceToNextNode(run);
    setRun(nextRun);
    enterNode(nextRun);
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
    if (updated.status === 'won') {
      updateProfile((p) => recordRunResult(p, updated));
      setPhase('run_result');
      return;
    }
    if (postBattle && postBattle.rewardChoices.length > 0) {
      setPhase('reward');
      return;
    }
    const nextRun = advanceToNextNode(updated);
    setRun(nextRun);
    enterNode(nextRun);
  };

  const onPickReward = (defId: string | null) => {
    playSound('click');
    if (defId) updateProfile((p) => recordDiscovery(p, [defId], []));
    const withReward = pickRewardCard(run, defId);
    const nextRun = advanceToNextNode(withReward);
    setRun(nextRun);
    setPostBattle(null);
    enterNode(nextRun);
  };

  const onRemoveInReward = (cardUid: string) => {
    playSound('recover');
    const compressed = removeCardFromDeck(run, cardUid);
    const nextRun = advanceToNextNode(compressed);
    setRun(nextRun);
    setPostBattle(null);
    enterNode(nextRun);
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
    const nextRun = advanceToNextNode(run);
    setRun(nextRun);
    setEventView(null);
    enterNode(nextRun);
  };

  const fxAt = (at: string) => fx.filter((f) => f.at === at);
  const { player, modifiers } = shown;
  const hpRatio = Math.max(0, player.hp / player.maxHp);

  return (
    <div className="db-shell">
      <header className="db-topbar">
        <div className="db-brand">
          <span className="db-brand__tag">SECTOR 06</span>
          <span>DECK BREACH</span>
          <span className="db-brand__proto">6マス試作ラン</span>
        </div>

        <nav className="db-stepper" aria-label="ラン進行">
          {run.nodes.map((node, idx) => (
            <span
              key={idx}
              className={[
                'db-step',
                idx === run.nodeIndex ? 'db-step--current' : '',
                idx < run.nodeIndex || (idx === run.nodeIndex && run.status === 'won') ? 'db-step--done' : '',
              ].join(' ')}
            >
              {describeNodeShort(node, idx)}
            </span>
          ))}
        </nav>

        <div className="db-topbar__right">
          <span className="db-chip db-chip--buff" title="イベントの事前調査(ダミー1択除外)に使う。敵撃破時20%でドロップ">
            🪙 解析コイン: {run.reconCoins}
          </span>
          <button
            type="button"
            className={`db-btn db-fast-toggle ${run.fastGrowth ? 'db-fast-toggle--on' : ''}`}
            onClick={toggleFastGrowth}
            title="試作用:ONにすると1回の戦闘・クイズですぐLv.3進化まで試せます"
          >
            {run.fastGrowth ? '⚡ 試用高速成長:ON' : '試用高速成長:OFF'}
          </button>
          <button type="button" className="db-btn db-btn--ghost" onClick={() => setShowDeckModal(true)}>
            デッキ ({run.deck.length})
          </button>
          {phase === 'battle' && <span className="db-turn">TURN {shown.turn}</span>}
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
                  {r.icon} {r.name}
                </span>
              );
            })}
          </span>
        )}
      </div>

      {phase === 'event' && eventView ? (
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
      ) : (
        <div className="db-main">
          <section className="db-left">
            <div className={`db-arena ${selectedUid ? 'db-arena--targeting' : ''}`}>
              {shown.enemies.map((enemy) => {
                const dead = enemy.hp <= 0;
                const intent = describeIntent(getEnemyIntent(enemy));
                const hit = fxAt(enemy.uid).some((f) => f.tone === 'hit' || f.tone === 'burn');
                const def = ENEMY_DEFINITIONS[enemy.defId];
                return (
                  <button
                    type="button"
                    key={enemy.uid}
                    className={[
                      'db-enemy',
                      dead ? 'db-enemy--dead' : '',
                      selectedUid && !dead ? 'db-enemy--targetable' : '',
                      actingUid === enemy.uid ? 'db-enemy--acting' : '',
                      hit ? 'db-enemy--hit' : '',
                      def.phase2 ? 'db-enemy--boss' : '',
                    ].join(' ')}
                    onClick={() => onEnemyClick(enemy)}
                    disabled={dead || !selectedUid || busy}
                    aria-label={`${enemy.name} HP ${enemy.hp}/${enemy.maxHp}`}
                  >
                    {!dead && (
                      <span className={`db-intent db-intent--${intent.tone}`} title={intent.title}>
                        <span className="db-intent__icon">{intent.icon}</span>
                        <span>{intent.text}</span>
                      </span>
                    )}
                    <span className="db-enemy__icon">{dead ? '💀' : enemy.icon}</span>
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
                      {enemy.block > 0 && <span className="db-chip db-chip--shield">🛡 {enemy.block}</span>}
                      {enemy.attackBonus > 0 && <span className="db-chip db-chip--bad">⬆ +{enemy.attackBonus}</span>}
                      {enemy.burn && (
                        <span className="db-chip db-chip--burn">
                          🔥 {enemy.burn.amount}・{enemy.burn.turns}T
                        </span>
                      )}
                    </span>
                    <span className="db-fx">
                      {fxAt(enemy.uid).map((f) => (
                        <span key={f.id} className={`db-fx__float db-fx__float--${f.tone}`}>
                          {f.text}
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="db-player">
              <div className={`db-player__stats ${fxAt('player').some((f) => f.tone === 'hit') ? 'db-player--hit' : ''}`}>
                <span className="db-player__label">あなた(侵入者)</span>
                <span className="db-bar db-bar--player">
                  <span className="db-bar__fill db-bar__fill--player" style={{ width: `${hpRatio * 100}%` }} />
                  <span className="db-bar__text">
                    HP {player.hp} / {player.maxHp}
                  </span>
                </span>
                {player.block > 0 && <span className="db-chip db-chip--shield">🛡 FW {player.block}</span>}
                {player.retaliate > 0 && <span className="db-chip db-chip--buff">🪤 反撃 {player.retaliate}</span>}
                {modifiers.reconCombo === 'ready' && (
                  <span className="db-chip db-chip--buff" title="このターン中に攻撃カードを使うと帯域+1">
                    🔍 解析コンボ準備中(攻撃で+1EN)
                  </span>
                )}
                {modifiers.nextAttackBonus > 0 && <span className="db-chip db-chip--buff">🎯 次の攻撃+{modifiers.nextAttackBonus}</span>}
                {modifiers.repeatNextAttack && <span className="db-chip db-chip--buff">⏩ 次の攻撃×2</span>}
                {modifiers.nextCardDiscount > 0 && <span className="db-chip db-chip--buff">📜 次のカード−{modifiers.nextCardDiscount}EN</span>}
                {player.energyPenalty > 0 && <span className="db-chip db-chip--bad">👁 検知 −{player.energyPenalty}</span>}
                <span className="db-fx db-fx--player">
                  {fxAt('player').map((f) => (
                    <span key={f.id} className={`db-fx__float db-fx__float--${f.tone}`}>
                      {f.text}
                    </span>
                  ))}
                </span>
              </div>
              <div className="db-notice" role="status">
                {notice ?? (playback ? '敵のターン…' : '')}
              </div>
            </div>

            <div className="db-table">
              <div className="db-energy" title="帯域:カードを使うのに必要">
                <span className="db-energy__value">
                  {player.energy}
                  <small>/{player.maxEnergy + player.turnEnergyBonus}</small>
                </span>
                <span className="db-energy__label">帯域</span>
              </div>
              <div className="db-pile" title="山札">
                <span className="db-pile__count">{shown.drawPile.length}</span>
                <span>山札</span>
              </div>

              <div className="db-hand">
                {shown.hand.map((uid) => {
                  const card = shown.cards[uid];
                  const def = getCardDefinition(card.defId);
                  const stats = getCardStats(card);
                  const cost = getPlayCost(shown, uid);
                  const unplayable = !!def.unplayable;
                  const affordable = !unplayable && cost <= player.energy;
                  const xpProg = getXpProgress(card);
                  return (
                    <button
                      type="button"
                      key={uid}
                      className={[
                        'db-card',
                        `db-card--${def.kind}`,
                        `db-card--${def.rarity}`,
                        unplayable ? 'db-card--noise' : '',
                        selectedUid === uid ? 'db-card--selected' : '',
                        !affordable ? 'db-card--unaffordable' : '',
                      ].join(' ')}
                      onClick={() => onCardClick(uid)}
                      disabled={busy || unplayable}
                      title={`${def.lore} (${xpProg.label})`}
                    >
                      <span className={`db-card__cost ${cost < stats.cost ? 'db-card__cost--discounted' : ''}`}>{unplayable ? '×' : cost}</span>
                      <span className="db-card__band">{unplayable ? 'NOISE' : KIND_LABEL[def.kind]}</span>
                      <span className="db-card__art">{stats.icon}</span>
                      <span className="db-card__name">{stats.name}</span>
                      <span className="db-card__desc">{stats.text}</span>
                      {!unplayable && <span className="db-card__level">{xpProg.label}</span>}
                    </button>
                  );
                })}
              </div>

              <div className="db-pile" title="捨て札">
                <span className="db-pile__count">{shown.discard.length}</span>
                <span>捨て札</span>
              </div>
              <button type="button" className="db-btn db-btn--end" onClick={onEndTurn} disabled={busy}>
                ターン終了
              </button>
            </div>
          </section>

          <aside className="db-log" aria-label="戦闘ログ">
            <div className="db-log__title">LOG</div>
            <ol className="db-log__list">
              {[...shown.log].reverse().slice(0, 30).map((entry) => (
                <li key={entry.id} className={`db-log__item db-log__item--${entry.tone}`}>
                  <span className="db-log__turn">T{entry.turn}</span>
                  {entry.message}
                </li>
              ))}
            </ol>
          </aside>
        </div>
      )}

      {phase === 'elite_choice' && (
        <EliteChoiceOverlay onChoose={onChooseRoute} />
      )}

      {!playback && phase === 'post_battle' && postBattle && (
        <PostBattleOverlay run={run} summary={postBattle} onProceed={proceedAfterPostBattle} />
      )}

      {phase === 'evolve' && run.pendingEvolutions.length > 0 && (
        <EvolutionOverlay
          card={run.deck.find((c) => c.uid === run.pendingEvolutions[0])!}
          remainingCount={run.pendingEvolutions.length}
          onChoose={(branchId) => onChooseBranch(run.pendingEvolutions[0], branchId)}
        />
      )}

      {phase === 'reward' && postBattle && (
        <RewardOverlay run={run} rewardDefIds={postBattle.rewardChoices} onPick={onPickReward} onRemove={onRemoveInReward} />
      )}

      {phase === 'run_result' && (
        <RunResultOverlay run={run} onRetry={() => startRun()} onBack={onBackToMissions} />
      )}

      {showDeckModal && <DeckModal deck={run.deck} onClose={() => setShowDeckModal(false)} />}
    </div>
  );
}

function EliteChoiceOverlay({ onChoose }: { onChoose: (useElite: boolean) => void }) {
  return (
    <div className="db-overlay" role="dialog" aria-modal="true">
      <div className="db-result db-result--wide db-result--won">
        <div className="db-result__title">ROUTE SELECTION // 侵入経路選択</div>
        <p className="db-result__sub">通常の防衛ルートを進むか、強敵(エリート)を突破してレア報酬を狙うか選べます。</p>
        <div className="db-evo-grid">
          <button type="button" className="db-evo-card" onClick={() => onChoose(false)}>
            <div className="db-evo-card__head">
              <span className="db-evo-card__icon">🧠</span>
              <span className="db-evo-card__cost">通常ルート</span>
            </div>
            <div className="db-evo-card__name">ファイアウォールAI (HP 40)</div>
            <div className="db-evo-card__text">標準的な強さの敵。通常の報酬とEXPを獲得します。</div>
            <div className="db-evo-card__cta">通常ルートへ進む</div>
          </button>
          <button type="button" className="db-evo-card db-evo-card--elite" onClick={() => onChoose(true)}>
            <div className="db-evo-card__head">
              <span className="db-evo-card__icon">⛩️</span>
              <span className="db-evo-card__cost">エリート(強敵)</span>
            </div>
            <div className="db-evo-card__name">ゼロトラストゲート (HP 62)</div>
            <div className="db-evo-card__text">強敵だが、勝利すると「獲得EXP 2倍」＋「レアカード1枚確定」！</div>
            <div className="db-evo-card__cta">強敵に挑む！</div>
          </button>
        </div>
      </div>
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
          {summary.coinsDropped > 0 ? ` 🪙 解析コイン +${summary.coinsDropped} ドロップ！` : ''}
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
                      {def.icon} {def.name} ({g.uid})
                    </span>
                    <span>+{g.xpAdded} EXP</span>
                    <span className="db-xp-row__lv">
                      {leveled ? `🎉 Lv.${g.previousLevel} → Lv.${g.newLevel}!` : card ? getXpProgress(card).label : ''}
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

function EvolutionOverlay({
  card,
  remainingCount,
  onChoose,
}: {
  card: CardInstance;
  remainingCount: number;
  onChoose: (branchId: string) => void;
}) {
  const def = getCardDefinition(card.defId);
  return (
    <div className="db-overlay" role="dialog" aria-modal="true">
      <div className="db-result db-result--wide db-result--won">
        <div className="db-result__title">EVOLUTION READY</div>
        <p className="db-result__sub">
          {def.icon} <strong>{def.name}</strong> ({card.uid}) が <strong>Lv.3</strong> に到達！進化先を選んでください（残り {remainingCount} 枚）
        </p>
        <div className="db-evo-grid">
          {def.branches.map((branch) => (
            <button key={branch.id} type="button" className="db-evo-card" onClick={() => onChoose(branch.id)}>
              <div className="db-evo-card__head">
                <span className="db-evo-card__icon">{branch.icon ?? def.icon}</span>
                <span className="db-evo-card__cost">{branch.cost} EN</span>
              </div>
              <div className="db-evo-card__name">{branch.name}</div>
              <div className="db-evo-card__text">{branch.text}</div>
              <div className="db-evo-card__cta">この進化にする</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
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
                    <span className="db-card__art">{def.icon}</span>
                    <span className="db-card__name">{def.name}</span>
                    <span className="db-card__desc">{lv1.text}</span>
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
                    onClick={() => onRemove(card.uid)}
                  >
                    <span>
                      🗑 {stats.icon} {stats.name} ({card.uid})
                    </span>
                    <span className="db-muted">{getXpProgress(card).label}</span>
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

  return (
    <main className="db-event-wrap">
      <section className="db-event-card">
        <div className="db-event-head">
          <div className="db-event-head__left">
            <span className="db-brand__tag">
              {eventId === 'vuln_check' ? 'EVENT 1 // 脆弱性診断 (TYPE A)' : 'EVENT 2 // パッチ適用 (TYPE B)'}
            </span>
            <span className="db-step db-step--current">
              連続チャレンジ {step} / {MAX_EVENT_STREAK} 問目
            </span>
            {question.mitreId && <span className="db-event-tag db-event-tag--attck">ATT&amp;CK: {question.mitreId}</span>}
            {question.cweId && <span className="db-event-tag db-event-tag--cwe">{question.cweId}</span>}
          </div>
          <span className="db-event-hp">
            現在 HP {run.hp} / {run.maxHp}
          </span>
        </div>

        <h2 className="db-event-cat">{question.category}</h2>
        <div className="db-event-scanlog">{question.scanTerminalLog}</div>

        {reconUsed ? (
          <div className="db-event-recon db-event-recon--done">
            <div className="db-event-recon__head">
              <span className="db-event-recon__badge">RECON INTEL ✓</span>
              <strong>事前調査完了 — 無関係なダミー選択肢を1つ除外し、2択に絞り込みました！</strong>
            </div>
            <p className="db-event-recon__text">
              💡 <strong>診断ヒント：</strong>{question.whyDangerous}
            </p>
          </div>
        ) : selectedChoiceId === null ? (
          <div className="db-event-recon">
            <span className="db-event-recon__prompt">
              🪙 「解析コイン」を1枚使うと、セキュリティヒント開示＆ダミー選択肢を1つ除外（2択化）できます（所持: {run.reconCoins}枚 / 敵撃破で20%ドロップ）
            </span>
            <button
              type="button"
              className="db-event-recon__btn"
              onClick={onUseRecon}
              disabled={run.reconCoins <= 0}
            >
              {run.reconCoins > 0 ? '🪙 コイン×1で事前調査（ダミー1択カット）' : '🪙 解析コイン不足（使用不可）'}
            </button>
          </div>
        ) : null}

        <p className="db-event-prompt">
          &gt; {question.prompt}
          <span className="db-event-prompt__rule">
            {eventId === 'vuln_check'
              ? `（正解：好きなカードに EXP +${run.fastGrowth ? 5 : 2} ／ 不正解：HP -5）`
              : `（正解：好きなカードに EXP +${run.fastGrowth ? 5 : 2} ＋ HP15回復またはカード削除 ／ 不正解：ペナルティなし）`}
          </span>
        </p>
        {question.codeSnippet && <pre className="db-event-code">{question.codeSnippet}</pre>}

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
                <div className="db-event-choice__head">
                  <div className="db-event-choice__title">
                    [{idx + 1}] {choice.title}
                  </div>
                  {isFilteredOut && (
                    <span className="db-event-choice__badge db-event-choice__badge--filtered">
                      調査により除外済（対象外）
                    </span>
                  )}
                  {selectedChoiceId !== null && choice.isCorrect && (
                    <span className="db-event-choice__badge db-event-choice__badge--ok">✔ 正解</span>
                  )}
                  {picked && !choice.isCorrect && (
                    <span className="db-event-choice__badge db-event-choice__badge--ng">✖ 選択した回答</span>
                  )}
                </div>
                {choice.command && <code className="db-event-choice__cmd">{choice.command}</code>}
                <div className="db-event-choice__desc">{choice.description}</div>
              </button>
            );
          })}
        </div>

        {selectedChoice && (
          <div className={`db-event-feedback ${isCorrect ? 'db-event-feedback--ok' : 'db-event-feedback--ng'}`}>
            <div className="db-event-feedback__badge">
              {isCorrect
                ? `✔ ${step}問目 正解！`
                : `✖ 不正解（チャレンジ終了${hpLost > 0 ? `・HP -${hpLost}` : '・ペナルティなし'}）`}
            </div>
            <p>{selectedChoice.feedback}</p>
            {!isCorrect && correctChoice && (
              <div className="db-event-feedback__correct-box">
                <strong>💡 正解の選択肢：「{correctChoice.title}」</strong>
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
            <h3>1問目報酬: 経験値 +{run.fastGrowth ? 5 : 2} を与えるカードを1枚選んでください</h3>
            <div className="db-deck-grid">
              {run.deck.map((card) => {
                const stats = getCardStats(card);
                const preview = previewQuizXpReward(run, card.uid);
                const disabled = preview.isMaxed && !allDeckMaxed;
                return (
                  <button
                    key={card.uid}
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
                    onClick={() => onPickXpCard(card.uid)}
                  >
                    <span className="db-deck-pill__title">
                      {stats.icon} {stats.name} ({card.uid})
                    </span>
                    <span className="db-muted">{getXpProgress(card).label}</span>
                    {preview.isMaxed ? (
                      <span className="db-deck-pill__preview db-deck-pill__preview--max">
                        🔒 Lv.3 MAX（最大進化済）
                      </span>
                    ) : preview.willEvolve ? (
                      <span className="db-deck-pill__preview db-deck-pill__preview--evolve">
                        🌟 選ぶと Lv.3 分岐進化！ (EXP {preview.currentXp}→{preview.nextXp})
                      </span>
                    ) : preview.willLevelUp ? (
                      <span className="db-deck-pill__preview db-deck-pill__preview--levelup">
                        🎉 選ぶと Lv.2 に強化！ (EXP {preview.currentXp}→{preview.nextXp})
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
              {getCardDefinition(xpGain.defId).icon} {getCardDefinition(xpGain.defId).name} ({xpGain.uid}) に +{xpGain.xpAdded} EXP!
            </span>
            <span>{xpGain.newLevel > xpGain.previousLevel ? `🎉 Lv.${xpGain.previousLevel} → Lv.${xpGain.newLevel}` : ''}</span>
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
                    <span className="db-card__art">{def.icon}</span>
                    <span className="db-card__name">{def.name}</span>
                    <span className="db-card__desc">{def.levels[1].text}</span>
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
                        onClick={() => onStep2Reward({ type: 'remove', cardUid: card.uid })}
                      >
                        <span>
                          🗑 {stats.icon} {stats.name} ({card.uid})
                        </span>
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
                    <span className="db-evo-card__icon">{RELIC_DEFINITIONS[offeredRelic].icon}</span>
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
                    <span className="db-card__art">{def.icon}</span>
                    <span className="db-card__name">{def.name}</span>
                    <span className="db-card__desc">{def.levels[1].text}</span>
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
    </main>
  );
}

function RunResultOverlay({ run, onRetry, onBack }: { run: RunState; onRetry: () => void; onBack: () => void }) {
  const won = run.status === 'won';
  return (
    <div className="db-overlay" role="dialog" aria-modal="true">
      <div className={`db-result db-result--wide ${won ? 'db-result--won' : 'db-result--lost'}`}>
        <div className="db-result__title">{won ? 'RUN COMPLETE // ARGUS 撃破' : 'CONNECTION LOST'}</div>
        <p className="db-result__sub">{won ? '6マスすべてを突破し、監視AI ARGUSを攻略した！' : '回線耐久が尽きた…。'}</p>
        <div className="db-result__stats">
          <span>
            到達マス {run.nodeIndex + 1} / {run.nodes.length}
          </span>
          <span>
            残りHP {run.hp} / {run.maxHp}
          </span>
          <span>デッキ {run.deck.length} 枚</span>
        </div>
        <div className="db-result__used">
          <div className="db-result__used-title">育てたカード一覧</div>
          <div className="db-deck-grid">
            {run.deck.map((card) => {
              const stats = getCardStats(card);
              return (
                <div key={card.uid} className="db-deck-pill">
                  <span>
                    {stats.icon} {stats.name}
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
    </div>
  );
}

function DeckModal({ deck, onClose }: { deck: CardInstance[]; onClose: () => void }) {
  return (
    <div className="db-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="db-result db-result--wide" onClick={(e) => e.stopPropagation()}>
        <div className="db-result__title">現在のデッキ ({deck.length}枚)</div>
        <div className="db-deck-grid" style={{ margin: '14px 0' }}>
          {deck.map((card) => {
            const def = getCardDefinition(card.defId);
            const stats = getCardStats(card);
            return (
              <div key={card.uid} className="db-deck-pill">
                <span>
                  {stats.icon} {stats.name} ({card.uid}) · {stats.cost}EN
                </span>
                <span className="db-muted">
                  {getXpProgress(card).label} / {stats.text}
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
    </div>
  );
}
