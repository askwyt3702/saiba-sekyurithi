// SECTOR 06 のゲーム画面(M1:戦闘 + M2:成長・進化 + M3:6マスラン・報酬・クイズイベント・結果)。
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
import { randomSeed } from '../../game/deckbattle/rng';
import {
  advanceToNextNode,
  applyBattleResult,
  applyPatchBonus,
  applyQuizXpReward,
  chooseEvolution,
  createBattleForCurrentNode,
  createRun,
  getXpProgress,
  pickEventQuestion,
  pickRewardCard,
  resolveEventQuiz,
} from '../../game/deckbattle/run';
import type {
  BattleState,
  CardInstance,
  CardKind,
  EnemyActionEvent,
  EnemyMove,
  EnemyState,
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

type StagePhase = 'battle' | 'post_battle' | 'evolve' | 'reward' | 'event' | 'run_result';

interface PostBattleSummary {
  xpGains: XpGainEntry[];
  rewardChoices: string[];
  healed: number;
}

interface EventViewState {
  eventId: RunEventId;
  question: DeckQuizQuestion;
  selectedChoiceId: string | null;
  isCorrect: boolean | null;
  hpLost: number;
  xpChosen: boolean;
  patchBonusDone: boolean;
  xpGain: XpGainEntry | null;
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

export function DeckBattle({ onBackToMissions }: DeckBattleProps) {
  const [run, setRun] = useState<RunState>(() => createRun({ fastGrowth: true }));
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
      const resolved = applyBattleResult(run, finishedBattle, randomSeed());
      setRun(resolved.run);
      if (resolved.run.status === 'lost') {
        setPhase('run_result');
        return;
      }
      setPostBattle({
        xpGains: resolved.xpGains,
        rewardChoices: resolved.rewardChoices,
        healed: resolved.healed,
      });
      setPhase('post_battle');
    },
    [run],
  );

  // 敵ターン再生が終わったらバトル完了処理へ
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
      else if (ev.kind === 'burn') playSound('breach');
      else if (ev.kind === 'retaliate') playSound('breach');
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
    const fresh = createRun({ fastGrowth });
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
      const question = pickEventQuestion(nextRun, node.eventId, randomSeed());
      setEventView({
        eventId: node.eventId,
        question,
        selectedChoiceId: null,
        isCorrect: null,
        hpLost: 0,
        xpChosen: false,
        patchBonusDone: false,
        xpGain: null,
      });
      setPhase('event');
      return;
    }
    setBattle(createBattleForCurrentNode(nextRun, randomSeed()));
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
    setRun(updated);
    if (updated.pendingEvolutions.length > 0) return;
    if (evolveOrigin === 'event') {
      setPhase('event');
      return;
    }
    if (updated.status === 'won') {
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
    const withReward = pickRewardCard(run, defId);
    const nextRun = advanceToNextNode(withReward);
    setRun(nextRun);
    setPostBattle(null);
    enterNode(nextRun);
  };

  const onAnswerQuiz = (choiceId: string) => {
    if (!eventView || eventView.selectedChoiceId) return;
    const choice = eventView.question.choices.find((c) => c.id === choiceId);
    if (!choice) return;
    const resolved = resolveEventQuiz(run, eventView.eventId, eventView.question.id, choice.isCorrect);
    playSound(choice.isCorrect ? 'extract' : 'alert');
    setRun(resolved.run);
    setEventView({
      ...eventView,
      selectedChoiceId: choiceId,
      isCorrect: choice.isCorrect,
      hpLost: resolved.hpLost,
    });
    if (resolved.run.status === 'lost') {
      window.setTimeout(() => setPhase('run_result'), 900);
    }
  };

  const onPickEventXpCard = (cardUid: string) => {
    if (!eventView || eventView.xpChosen) return;
    playSound('recover');
    const res = applyQuizXpReward(run, cardUid);
    setRun(res.run);
    setEventView({ ...eventView, xpChosen: true, xpGain: res.gain });
    if (res.run.pendingEvolutions.length > 0) {
      setEvolveOrigin('event');
      setPhase('evolve');
    }
  };

  const onPatchBonus = (choice: { type: 'heal' } | { type: 'remove'; cardUid: string }) => {
    if (!eventView || eventView.patchBonusDone) return;
    playSound('recover');
    setRun((prev) => applyPatchBonus(prev, choice));
    setEventView({ ...eventView, patchBonusDone: true });
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

      <div className="db-reload-note">※ 試作版のため、ブラウザを読み込み直すとランは最初からやり直しになります。</div>

      {phase === 'event' && eventView ? (
        <EventScreen
          run={run}
          eventView={eventView}
          onAnswer={onAnswerQuiz}
          onPickXpCard={onPickEventXpCard}
          onPatchBonus={onPatchBonus}
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
              <div className="db-energy" title="帯域:カードを使うのに必要。毎ターン4に戻る">
                <span className="db-energy__value">
                  {player.energy}
                  <small>/{player.maxEnergy}</small>
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
        <RewardOverlay rewardDefIds={postBattle.rewardChoices} onPick={onPickReward} />
      )}

      {phase === 'run_result' && (
        <RunResultOverlay run={run} onRetry={() => startRun()} onBack={onBackToMissions} />
      )}

      {showDeckModal && <DeckModal deck={run.deck} onClose={() => setShowDeckModal(false)} />}
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

function RewardOverlay({ rewardDefIds, onPick }: { rewardDefIds: string[]; onPick: (defId: string | null) => void }) {
  return (
    <div className="db-overlay" role="dialog" aria-modal="true">
      <div className="db-result db-result--wide db-result--won">
        <div className="db-result__title">REWARD DRAFT</div>
        <p className="db-result__sub">デッキに加えるカードを1枚選んでください（スキップもできます）。</p>
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
          <button type="button" className="db-btn db-btn--ghost" onClick={() => onPick(null)}>
            スキップして次のマスへ
          </button>
        </div>
      </div>
    </div>
  );
}

function EventScreen({
  run,
  eventView,
  onAnswer,
  onPickXpCard,
  onPatchBonus,
  onContinue,
}: {
  run: RunState;
  eventView: EventViewState;
  onAnswer: (choiceId: string) => void;
  onPickXpCard: (cardUid: string) => void;
  onPatchBonus: (choice: { type: 'heal' } | { type: 'remove'; cardUid: string }) => void;
  onContinue: () => void;
}) {
  const { eventId, question, selectedChoiceId, isCorrect, hpLost, xpChosen, patchBonusDone, xpGain } = eventView;
  const selectedChoice = question.choices.find((c) => c.id === selectedChoiceId);
  const needsPatchBonus = eventId === 'patch' && isCorrect === true && !patchBonusDone;
  const needsXpPick = isCorrect === true && !xpChosen;
  const canContinue = selectedChoiceId !== null && run.status === 'playing' && !needsXpPick && !needsPatchBonus;

  return (
    <main className="db-event-wrap">
      <section className="db-event-card">
        <div className="db-event-head">
          <span className="db-brand__tag">{eventId === 'vuln_check' ? 'EVENT 1 // 脆弱性診断' : 'EVENT 2 // パッチ適用'}</span>
          <span className="db-event-hp">
            現在 HP {run.hp} / {run.maxHp}
          </span>
        </div>
        <h2 className="db-event-cat">{question.category}</h2>
        <p className="db-event-prompt">{question.prompt}</p>
        {question.codeSnippet && <pre className="db-event-code">{question.codeSnippet}</pre>}

        <div className="db-event-choices">
          {question.choices.map((choice) => {
            const picked = selectedChoiceId === choice.id;
            return (
              <button
                key={choice.id}
                type="button"
                disabled={selectedChoiceId !== null}
                onClick={() => onAnswer(choice.id)}
                className={[
                  'db-event-choice',
                  picked && choice.isCorrect ? 'db-event-choice--ok' : '',
                  picked && !choice.isCorrect ? 'db-event-choice--ng' : '',
                  selectedChoiceId && choice.isCorrect ? 'db-event-choice--reveal-ok' : '',
                ].join(' ')}
              >
                <div className="db-event-choice__title">{choice.title}</div>
                <div className="db-event-choice__desc">{choice.description}</div>
              </button>
            );
          })}
        </div>

        {selectedChoice && (
          <div className={`db-event-feedback ${isCorrect ? 'db-event-feedback--ok' : 'db-event-feedback--ng'}`}>
            <div className="db-event-feedback__badge">
              {isCorrect ? '✔ 正解！カードの経験値を獲得できます' : `✖ 不正解${hpLost > 0 ? `（HP -${hpLost}）` : '（ペナルティなし）'}`}
            </div>
            <p>{selectedChoice.feedback}</p>
            <p className="db-event-feedback__sub">
              <strong>なぜ危険か:</strong> {question.whyDangerous}
            </p>
            <p className="db-event-feedback__sub">
              <strong>{question.defenseMeasure}</strong>
            </p>
          </div>
        )}

        {needsXpPick && (
          <div className="db-event-reward-box">
            <h3>経験値 +{run.fastGrowth ? 5 : 2} を与えるカードを1枚選んでください</h3>
            <div className="db-deck-grid">
              {run.deck.map((card) => {
                const stats = getCardStats(card);
                return (
                  <button key={card.uid} type="button" className="db-deck-pill" onClick={() => onPickXpCard(card.uid)}>
                    <span>
                      {stats.icon} {stats.name} ({card.uid})
                    </span>
                    <span className="db-muted">{getXpProgress(card).label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {xpGain && (
          <div className="db-xp-row db-xp-row--levelup">
            <span>
              {getCardDefinition(xpGain.defId).icon} {getCardDefinition(xpGain.defId).name} ({xpGain.uid}) に +{xpGain.xpAdded} EXP!
            </span>
            <span>{xpGain.newLevel > xpGain.previousLevel ? `🎉 Lv.${xpGain.previousLevel} → Lv.${xpGain.newLevel}` : ''}</span>
          </div>
        )}

        {isCorrect && xpChosen && needsPatchBonus && (
          <div className="db-event-reward-box">
            <h3>パッチ適用ボーナスを選択してください</h3>
            <div className="db-result__actions">
              <button type="button" className="db-btn db-btn--end" onClick={() => onPatchBonus({ type: 'heal' })}>
                HP を 15 回復する ({run.hp} → {Math.min(run.maxHp, run.hp + 15)})
              </button>
            </div>
            <div className="db-muted" style={{ margin: '10px 0 6px' }}>
              または不要なカードを 1 枚削除する:
            </div>
            <div className="db-deck-grid">
              {run.deck.map((card) => {
                const stats = getCardStats(card);
                return (
                  <button
                    key={card.uid}
                    type="button"
                    className="db-deck-pill db-deck-pill--danger"
                    onClick={() => onPatchBonus({ type: 'remove', cardUid: card.uid })}
                  >
                    <span>
                      🗑 {stats.icon} {stats.name} ({card.uid})
                    </span>
                    <span className="db-muted">{getXpProgress(card).label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {canContinue && (
          <div className="db-result__actions" style={{ marginTop: 14 }}>
            <button type="button" className="db-btn db-btn--end" onClick={onContinue}>
              次のマスへ進む →
            </button>
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
          <span>到達マス {run.nodeIndex + 1} / {run.nodes.length}</span>
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
