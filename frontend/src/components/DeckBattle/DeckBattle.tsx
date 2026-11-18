// SECTOR 06 の戦闘画面(デッキ構築ローグライトの試作・M1)。
// ルールはすべて game/deckbattle/battle.ts にあり、この画面は表示と操作の受け渡しだけをする。
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cardNeedsTarget,
  createBattle,
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
import { createRun } from '../../game/deckbattle/run';
import type { BattleState, CardKind, EnemyActionEvent, EnemyMove, EnemyState } from '../../game/deckbattle/types';
import { playSound } from '../../game/sound/soundEffects';
import './DeckBattle.css';

/** 敵の行動を1つずつ見せる間隔(ミリ秒) */
const ENEMY_STEP_MS = 900;
const FX_MS = 1100;

/** 試作用:戦う相手を選べるようにしておく(ランの流れは M3 で作る) */
const ENCOUNTERS: Array<{ id: string; label: string; enemyIds: string[] }> = [
  { id: 'scanner', label: 'スキャナーbot', enemyIds: ['scanner_bot'] },
  { id: 'ids', label: 'IDSセンサー ×2', enemyIds: ['ids_sensor', 'ids_sensor'] },
  { id: 'fwai', label: 'ファイアウォールAI', enemyIds: ['firewall_ai'] },
  { id: 'argus', label: 'ボス:監視AI ARGUS', enemyIds: ['argus'] },
];

const KIND_LABEL: Record<CardKind, string> = { attack: '攻撃', defense: '防御', utility: '補助' };

type FxTone = 'hit' | 'shield' | 'heal' | 'buff' | 'bad' | 'burn';
interface Fx {
  id: number;
  /** 'player' か敵の uid */
  at: string;
  text: string;
  tone: FxTone;
}
type FxSpec = Omit<Fx, 'id'>;

interface Playback {
  /** 敵のターンが始まる前の状態(手札は捨て札へ移したあと) */
  base: BattleState;
  events: EnemyActionEvent[];
  index: number;
  final: BattleState;
}

interface DeckBattleProps {
  onBackToMissions: () => void;
}

function newBattle(enemyIds: string[]): BattleState {
  const run = createRun();
  return createBattle({ deck: run.deck, playerHp: run.hp, playerMaxHp: run.maxHp, enemyIds, seed: randomSeed() });
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

/** 敵のターンの出来事1つ分の演出 */
function fxForEvent(ev: EnemyActionEvent): FxSpec[] {
  switch (ev.kind) {
    case 'attack':
      return [
        ev.damage > 0
          ? { at: 'player', text: `-${ev.damage}`, tone: 'hit' }
          : { at: 'player', text: '防いだ', tone: 'shield' },
      ];
    case 'block':
      return [{ at: ev.enemyUid, text: `+FW${ev.amount}`, tone: 'shield' }];
    case 'buff':
      return [{ at: ev.enemyUid, text: `攻撃力+${ev.amount}`, tone: 'bad' }];
    case 'detect':
      return [{ at: 'player', text: `検知:帯域-${ev.amount}`, tone: 'bad' }];
    case 'noise':
      return [{ at: 'player', text: `ノイズ×${ev.count}`, tone: 'bad' }];
    case 'retaliate':
      return [{ at: ev.enemyUid, text: `反撃 -${ev.damage}`, tone: 'hit' }];
    case 'burn':
      return [{ at: ev.enemyUid, text: `🔥-${ev.damage}`, tone: 'burn' }];
  }
}

function soundForEvent(ev: EnemyActionEvent): Parameters<typeof playSound>[0] {
  if (ev.kind === 'attack') return ev.damage > 0 ? 'alert' : 'recover';
  if (ev.kind === 'retaliate' || ev.kind === 'burn') return 'breach';
  if (ev.kind === 'block') return 'scan';
  return 'alert';
}

/** カードを使う前と後を比べて、出す演出を決める */
function fxForPlay(prev: BattleState, next: BattleState): FxSpec[] {
  const out: FxSpec[] = [];
  next.enemies.forEach((e, i) => {
    const before = prev.enemies[i];
    const lost = before.hp + before.block - (e.hp + e.block);
    if (lost > 0) out.push({ at: e.uid, text: `-${lost}`, tone: 'hit' });
    if ((e.burn?.amount ?? 0) > (before.burn?.amount ?? 0)) out.push({ at: e.uid, text: `過熱${e.burn?.amount}`, tone: 'burn' });
  });
  const p0 = prev.player;
  const p1 = next.player;
  if (p1.block > p0.block) out.push({ at: 'player', text: `+FW${p1.block - p0.block}`, tone: 'shield' });
  if (p1.hp > p0.hp) out.push({ at: 'player', text: `+${p1.hp - p0.hp}`, tone: 'heal' });
  if (p1.retaliate > p0.retaliate) out.push({ at: 'player', text: `反撃${p1.retaliate}`, tone: 'buff' });
  const m0 = prev.modifiers;
  const m1 = next.modifiers;
  if (m1.nextAttackBonus > m0.nextAttackBonus) out.push({ at: 'player', text: `次の攻撃+${m1.nextAttackBonus}`, tone: 'buff' });
  if (m1.repeatNextAttack && !m0.repeatNextAttack) out.push({ at: 'player', text: '次の攻撃×2', tone: 'buff' });
  return out;
}

export function DeckBattle({ onBackToMissions }: DeckBattleProps) {
  const [encounterId, setEncounterId] = useState(ENCOUNTERS[0].id);
  const [battle, setBattle] = useState<BattleState>(() => newBattle(ENCOUNTERS[0].enemyIds));
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fx, setFx] = useState<Fx[]>([]);
  const fxId = useRef(0);

  const pushFx = useCallback((specs: FxSpec[]) => {
    if (specs.length === 0) return;
    const items = specs.map((s) => ({ ...s, id: ++fxId.current }));
    setFx((cur) => [...cur, ...items]);
    window.setTimeout(() => {
      setFx((cur) => cur.filter((f) => !items.some((i) => i.id === f.id)));
    }, FX_MS);
  }, []);

  // 敵のターンを1つずつ再生する
  useEffect(() => {
    if (!playback) return;
    const timer = window.setTimeout(
      () => {
        const nextIndex = playback.index + 1;
        if (nextIndex >= playback.events.length) {
          setBattle(playback.final);
          setPlayback(null);
          if (playback.final.status === 'won') playSound('extract');
          else if (playback.final.status === 'lost') playSound('alert');
          return;
        }
        const ev = playback.events[nextIndex];
        pushFx(fxForEvent(ev));
        playSound(soundForEvent(ev));
        setPlayback({ ...playback, index: nextIndex });
      },
      playback.index < 0 ? 300 : ENEMY_STEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [playback, pushFx]);

  // Esc で対象選びをやめる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedUid(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const busy = playback !== null || battle.status !== 'playing';

  // 再生中は、敵のターン前の状態に、その時点の HP・FW を重ねて見せる
  const shown: BattleState = (() => {
    if (!playback) return battle;
    const frame = playback.index >= 0 ? playback.events[playback.index].after : null;
    if (!frame) return playback.base;
    return {
      ...playback.base,
      player: { ...playback.base.player, hp: frame.playerHp, block: frame.playerBlock },
      enemies: playback.base.enemies.map((e) => {
        const f = frame.enemies.find((x) => x.uid === e.uid);
        return f ? { ...e, hp: f.hp, block: f.block } : e;
      }),
    };
  })();
  const actingUid = playback && playback.index >= 0 ? playback.events[playback.index].enemyUid : null;

  const restart = (id = encounterId) => {
    const enc = ENCOUNTERS.find((e) => e.id === id) ?? ENCOUNTERS[0];
    setEncounterId(enc.id);
    setBattle(newBattle(enc.enemyIds));
    setPlayback(null);
    setSelectedUid(null);
    setNotice(null);
    setFx([]);
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
    if (result.state.status === 'won') window.setTimeout(() => playSound('extract'), 250);
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

  const fxAt = (at: string) => fx.filter((f) => f.at === at);
  const { player, modifiers } = shown;
  const hpRatio = Math.max(0, player.hp / player.maxHp);

  return (
    <div className="db-shell">
      <header className="db-topbar">
        <div className="db-brand">
          <span className="db-brand__tag">SECTOR 06</span>
          <span>DECK BREACH</span>
          <span className="db-brand__proto">試作 M1:1回の戦闘</span>
        </div>
        <div className="db-topbar__right">
          <label className="db-encounter">
            相手
            <select value={encounterId} onChange={(e) => restart(e.target.value)} disabled={playback !== null}>
              {ENCOUNTERS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
          <span className="db-turn">TURN {shown.turn}</span>
          <button type="button" className="db-btn db-btn--ghost" onClick={onBackToMissions}>
            ミッション選択へ
          </button>
        </div>
      </header>

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
                    {enemy.block > 0 && <span className="db-chip db-chip--shield" title="ファイアウォール:先にこちらが削られる">🛡 {enemy.block}</span>}
                    {enemy.attackBonus > 0 && <span className="db-chip db-chip--bad" title="攻撃力の上乗せ">⬆ +{enemy.attackBonus}</span>}
                    {enemy.burn && (
                      <span className="db-chip db-chip--burn" title={`過熱:敵のターンの終わりに${enemy.burn.amount}ダメージ(FW無視)、あと${enemy.burn.turns}ターン`}>
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
              {player.block > 0 && <span className="db-chip db-chip--shield" title="ファイアウォール:次の自分のターン開始で消える">🛡 FW {player.block}</span>}
              {player.retaliate > 0 && <span className="db-chip db-chip--buff" title="次に受ける攻撃1回で、攻撃してきた敵にダメージ">🪤 反撃 {player.retaliate}</span>}
              {modifiers.nextAttackBonus > 0 && <span className="db-chip db-chip--buff" title="次の攻撃カードのダメージに上乗せ">🎯 次の攻撃+{modifiers.nextAttackBonus}</span>}
              {modifiers.repeatNextAttack && <span className="db-chip db-chip--buff" title="次の攻撃カードを2回発動">⏩ 次の攻撃×2</span>}
              {modifiers.nextCardDiscount > 0 && <span className="db-chip db-chip--buff" title="次に使うカードの帯域が減る">📜 次のカード−{modifiers.nextCardDiscount}EN</span>}
              {player.energyPenalty > 0 && <span className="db-chip db-chip--bad" title="次のターンの帯域が減る">👁 検知 −{player.energyPenalty}</span>}
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
            <div className="db-pile" title="山札:ここからカードを引く。尽きたら捨て札をシャッフルして戻す">
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
                    title={def.lore}
                  >
                    <span className={`db-card__cost ${cost < stats.cost ? 'db-card__cost--discounted' : ''}`}>{unplayable ? '×' : cost}</span>
                    <span className="db-card__band">{unplayable ? 'NOISE' : KIND_LABEL[def.kind]}</span>
                    <span className="db-card__art">{stats.icon}</span>
                    <span className="db-card__name">{stats.name}</span>
                    <span className="db-card__desc">{stats.text}</span>
                    {!unplayable && <span className="db-card__level">Lv.{card.level}</span>}
                  </button>
                );
              })}
            </div>

            <div className="db-pile" title="捨て札:使ったカードと、ターン終了時の手札">
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

      {!playback && battle.status !== 'playing' && <ResultOverlay battle={battle} onRetry={() => restart()} onBack={onBackToMissions} />}
    </div>
  );
}

function ResultOverlay({ battle, onRetry, onBack }: { battle: BattleState; onRetry: () => void; onBack: () => void }) {
  const won = battle.status === 'won';
  // 使ったカードを種類ごとにまとめる(M2 でここが XP になる)
  const used = new Map<string, { name: string; icon: string; count: number }>();
  for (const [uid, count] of Object.entries(battle.usesThisBattle)) {
    const card = battle.cards[uid];
    if (!card) continue;
    const stats = getCardStats(card);
    const cur = used.get(card.defId) ?? { name: stats.name, icon: stats.icon, count: 0 };
    cur.count += count;
    used.set(card.defId, cur);
  }
  return (
    <div className="db-overlay" role="dialog" aria-modal="true">
      <div className={`db-result ${won ? 'db-result--won' : 'db-result--lost'}`}>
        <div className="db-result__title">{won ? 'BREACH SUCCESS' : 'CONNECTION LOST'}</div>
        <p className="db-result__sub">{won ? '防御システムを突破した。' : '回線を切断された…。'}</p>
        <div className="db-result__stats">
          <span>ターン数 {battle.turn}</span>
          <span>
            残りHP {battle.player.hp} / {battle.player.maxHp}
          </span>
        </div>
        {used.size > 0 && (
          <div className="db-result__used">
            <div className="db-result__used-title">このバトルで使ったカード(次の段階で XP として育つ)</div>
            <div className="db-result__used-list">
              {[...used.values()].map((u) => (
                <span key={u.name} className="db-chip">
                  {u.icon} {u.name} ×{u.count}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="db-result__actions">
          <button type="button" className="db-btn db-btn--end" onClick={onRetry}>
            もう一度戦う
          </button>
          <button type="button" className="db-btn db-btn--ghost" onClick={onBack}>
            ミッション選択へ
          </button>
        </div>
      </div>
    </div>
  );
}
