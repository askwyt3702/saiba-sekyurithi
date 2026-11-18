import { useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  PanOnScrollMode,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { CARD_CATALOG } from '../../game/territory/cards';
import {
  createInitialTerritoryState,
  endTerritoryTurn,
  getAttackableNodeIds,
  pickRewardCard,
  playTerritoryCard,
  skipRewardCard,
} from '../../game/territory/territoryEngine';
import type { CardDef, EnemyActionEvent, TerritoryGameState } from '../../game/territory/territoryTypes';
import { TerritoryNodeView, type TerritoryFlowNode, type TerritoryNodeFx } from './TerritoryNodeView';
import { TerritoryThreatEdge, type ThreatFlowEdge } from './TerritoryThreatEdge';
import { useUiScale } from '../../useUiScale';
import { playSound, type SoundEffectType } from '../../game/sound/soundEffects';
import './TerritoryGame.css';

interface TerritoryGameProps {
  onBackToMissions: () => void;
}

const nodeTypes = {
  territoryNode: TerritoryNodeView,
};

const edgeTypes = {
  threat: TerritoryThreatEdge,
};

// ARGUS のターンの演出で、行動1つにかける時間(ミリ秒)。演出専用で、ゲームの時間やルールには関係しない
const ENEMY_STEP_MS = 1100;

interface EnemyPlayback {
  events: EnemyActionEvent[];
  index: number;
  /** 演出が終わったら表示する、ARGUS のターンが終わった後の状態 */
  next: TerritoryGameState;
}

function nodeName(state: TerritoryGameState, id: string): string {
  return state.nodes.find((n) => n.id === id)?.name ?? id;
}

/** 演出中のバナーに出す説明 */
function describeEnemyAction(event: EnemyActionEvent, state: TerritoryGameState): string {
  switch (event.kind) {
    case 'attack':
      return event.captured
        ? `${event.sourceNodeId} が ${nodeName(state, event.targetNodeId)} を攻撃し、奪還した！`
        : `${event.sourceNodeId} が ${nodeName(state, event.targetNodeId)} に ${event.damage} ダメージ`;
    case 'expand':
      return event.captured
        ? `${event.sourceNodeId} が ${nodeName(state, event.targetNodeId)} を侵食し、ARGUS の陣地にした！`
        : `${event.sourceNodeId} が ${nodeName(state, event.targetNodeId)} を侵食中(${event.damage} ダメージ)`;
    case 'reflect':
      return event.knockedOut
        ? `${nodeName(state, event.targetNodeId)} の罠が攻撃を跳ね返し、${event.sourceNodeId} を無力化した！`
        : `${nodeName(state, event.targetNodeId)} の罠が ${event.sourceNodeId} の攻撃を跳ね返した(${event.damage} ダメージ)`;
    case 'fortify':
      return `${nodeName(state, event.nodeId)} がシールドを +${event.value} 強化`;
    case 'alert':
      return `監視網が強化され、警戒度 +${event.value}%`;
    case 'fizzle':
      return `${event.sourceNodeId} は制圧済みのため、行動できなかった`;
  }
}

/** 演出中、各ノードに出す効果 */
function fxForEvent(event: EnemyActionEvent, key: string): Map<string, TerritoryNodeFx> {
  const fx = new Map<string, TerritoryNodeFx>();
  switch (event.kind) {
    case 'attack':
      fx.set(event.sourceNodeId, { kind: 'attacker', key });
      fx.set(event.targetNodeId, event.captured
        ? { kind: 'captured', text: '奪還された!', key }
        : { kind: 'hit', text: `-${event.damage}`, key });
      break;
    case 'expand':
      fx.set(event.sourceNodeId, { kind: 'attacker', key });
      fx.set(event.targetNodeId, event.captured
        ? { kind: 'captured', text: '侵食された!', key }
        : { kind: 'hit', text: `-${event.damage}`, key });
      break;
    case 'reflect':
      fx.set(event.targetNodeId, { kind: 'fortify', text: '🍯 反射!', key });
      fx.set(event.sourceNodeId, { kind: 'hit', text: `-${event.damage}`, key });
      break;
    case 'fortify':
      fx.set(event.nodeId, { kind: 'fortify', text: `🛡+${event.value}`, key });
      break;
    case 'alert':
      fx.set(event.nodeId, { kind: 'alert', text: `警戒度 +${event.value}%`, key });
      break;
    case 'fizzle':
      fx.set(event.sourceNodeId, { kind: 'fizzle', text: '不発', key });
      break;
  }
  return fx;
}

/** カードを使った前後を比べて、ダメージを受けた・制圧したノードに出す演出を作る(余波ダメージも見えるように) */
function fxForPlayerCard(before: TerritoryGameState, after: TerritoryGameState, key: string): Map<string, TerritoryNodeFx> {
  const fx = new Map<string, TerritoryNodeFx>();
  for (const node of after.nodes) {
    const prev = before.nodes.find((n) => n.id === node.id);
    if (!prev) continue;
    if (prev.owner !== 'player' && node.owner === 'player') {
      fx.set(node.id, { kind: 'seized', text: '制圧!', key });
      continue;
    }
    if (prev.owner === 'argus' && node.owner === 'neutral') {
      fx.set(node.id, { kind: 'strike', text: '無力化!', key });
      continue;
    }
    const lost = prev.hp + prev.shield - (node.hp + node.shield);
    if (lost > 0) {
      fx.set(node.id, { kind: 'strike', text: `-${lost}`, key });
      continue;
    }
    if (node.owner === 'player' && node.hp > prev.hp) {
      fx.set(node.id, { kind: 'fortify', text: `+${node.hp - prev.hp}`, key });
      continue;
    }
    if (node.trapped && !prev.trapped) {
      fx.set(node.id, { kind: 'fortify', text: '🍯 罠', key });
      continue;
    }
    if (node.infection && !prev.infection) {
      fx.set(node.id, { kind: 'strike', text: '🦠 感染', key });
      continue;
    }
    const hadIntent = before.intents.some((i) => i.sourceNodeId === node.id);
    const hasIntent = after.intents.some((i) => i.sourceNodeId === node.id);
    if (hadIntent && !hasIntent && node.owner === 'argus') {
      fx.set(node.id, { kind: 'fizzle', text: '🚫 遮断', key });
    }
  }
  return fx;
}

// カードの演出を表示しておく時間(ミリ秒)。演出専用で、ゲームのルールには関係しない
const PLAYER_FX_MS = 1000;

const KIND_LABELS = { attack: 'ATTACK', defense: 'DEFENSE', utility: 'UTILITY' } as const;
const KIND_ICONS = { attack: '⚔️', defense: '🛡️', utility: '✦' } as const;
const RARITY_LABELS = { starter: '基本', common: 'コモン', rare: 'レア' } as const;

/** カード1枚の見た目(手札と報酬の両方で使う) */
function CardFace({ def }: { def: CardDef }) {
  return (
    <>
      <span className="tw-card__cost" title="使うのに必要な帯域(コスト)">{def.cost}</span>
      <span className="tw-card__band">{KIND_LABELS[def.kind]}</span>
      <span className="tw-card__art" aria-hidden="true">{def.icon ?? KIND_ICONS[def.kind]}</span>
      <span className="tw-card__name">{def.name}</span>
      <span className="tw-card__desc">{def.description}</span>
      <span className="tw-card__rarity">{RARITY_LABELS[def.rarity]}</span>
    </>
  );
}

/** ARGUS の行動ごとの効果音 */
const ENEMY_ACTION_SOUNDS: Record<EnemyActionEvent['kind'], SoundEffectType> = {
  attack: 'alert',
  expand: 'alert',
  reflect: 'breach',
  fortify: 'click',
  alert: 'alert',
  fizzle: 'click',
};

/** カードを使った結果に合った効果音(制圧 > 攻撃が当たった > 回復・防御 > その他) */
function soundForPlayerFx(fx: Map<string, TerritoryNodeFx>): SoundEffectType {
  const kinds = [...fx.values()].map((f) => f.kind);
  if (kinds.includes('seized')) return 'breach';
  if (kinds.includes('strike')) return 'scan';
  if (kinds.includes('fortify')) return 'recover';
  return 'click';
}

function samePair(edge: { source: string; target: string }, a: string, b: string): boolean {
  return (edge.source === a && edge.target === b) || (edge.source === b && edge.target === a);
}

function TerritoryBoard({ onBackToMissions }: TerritoryGameProps) {
  const [game, setGame] = useState<TerritoryGameState>(() => createInitialTerritoryState());
  const [notice, setNotice] = useState<string | null>(null);
  const [playback, setPlayback] = useState<EnemyPlayback | null>(null);
  const [playerFx, setPlayerFx] = useState<{ map: Map<string, TerritoryNodeFx>; key: string } | null>(null);
  const uiScale = useUiScale();
  const { fitView } = useReactFlow();

  // カードの演出は少し見せたら消す
  useEffect(() => {
    if (!playerFx) return;
    const timer = setTimeout(() => setPlayerFx(null), PLAYER_FX_MS);
    return () => clearTimeout(timer);
  }, [playerFx]);

  // 画面の倍率が変わったら(ウィンドウの大きさを変えたら)、マップ全体が収まるように合わせ直す
  useEffect(() => {
    const timer = setTimeout(() => void fitView({ padding: 0.12 }), 60);
    return () => clearTimeout(timer);
  }, [uiScale, fitView]);
  const busy = playback !== null;
  const currentEvent = playback ? playback.events[playback.index] : null;
  const playKey = playback ? `${playback.next.turn}-${playback.index}` : '';

  // ARGUS の行動の演出に合わせて効果音を鳴らす
  useEffect(() => {
    if (currentEvent) playSound(ENEMY_ACTION_SOUNDS[currentEvent.kind]);
    // playKey が変わったとき(=次の行動に進んだとき)だけ鳴らす
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey]);

  // 勝敗が決まったとき
  useEffect(() => {
    if (game.status === 'won') playSound('extract');
    else if (game.status === 'lost') playSound('alert');
  }, [game.status]);

  // ARGUS の行動を1つずつ見せ、全部見せ終わったら、ターン終了後の状態に切り替える
  useEffect(() => {
    if (!playback) return;
    const timer = setTimeout(() => {
      if (playback.index + 1 < playback.events.length) {
        setPlayback({ ...playback, index: playback.index + 1 });
      } else {
        setGame(playback.next);
        setPlayback(null);
      }
    }, ENEMY_STEP_MS);
    return () => clearTimeout(timer);
  }, [playback]);

  const selectedCardInstance = game.hand.find((c) => c.uid === game.selectedCardUid) ?? null;
  const selectedCardDef = selectedCardInstance ? CARD_CATALOG[selectedCardInstance.defId] : null;

  const attackableIds = useMemo(() => getAttackableNodeIds(game), [game]);

  const fxMap = useMemo(
    () => (currentEvent
      ? fxForEvent(currentEvent, playKey)
      : playerFx?.map ?? new Map<string, TerritoryNodeFx>()),
    [currentEvent, playKey, playerFx],
  );

  const flowNodes: TerritoryFlowNode[] = useMemo(
    () =>
      game.nodes.map((node) => {
        const intent = game.intents.find((i) => i.sourceNodeId === node.id);
        const fx = fxMap.get(node.id);
        let targetable = false;
        let isWeakness = false;
        if (selectedCardDef) {
          if (selectedCardDef.targetType === 'hostile' && attackableIds.has(node.id)) {
            targetable = true;
            isWeakness = Boolean(selectedCardDef.weakRoles?.includes(node.role));
          } else if (selectedCardDef.targetType === 'player' && node.owner === 'player') {
            targetable = true;
          }
        }
        return {
          id: node.id,
          type: 'territoryNode',
          position: node.position,
          draggable: false,
          data: { node, targetable, isWeakness, intent, fx },
        };
      }),
    [game.nodes, game.intents, selectedCardDef, attackableIds, fxMap],
  );

  const flowEdges: (Edge | ThreatFlowEdge)[] = useMemo(() => {
    const ownerMap = new Map(game.nodes.map((n) => [n.id, n.owner]));
    return game.edges.map((edge) => {
      const s = ownerMap.get(edge.source);
      const t = ownerMap.get(edge.target);
      const bothPlayer = s === 'player' && t === 'player';
      const bothArgus = s === 'argus' && t === 'argus';
      const frontier = (s === 'player' && t !== 'player') || (t === 'player' && s !== 'player');

      // 演出中:今まさに攻撃している線には、パケットを飛ばす
      if ((currentEvent?.kind === 'attack' || currentEvent?.kind === 'expand' || currentEvent?.kind === 'reflect')
        && samePair(edge, currentEvent.sourceNodeId, currentEvent.targetNodeId)) {
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: 'threat' as const,
          data: { mode: 'attack' as const, reverse: edge.source !== currentEvent.sourceNodeId, playKey },
          markerEnd: { type: 'arrowclosed' as const, color: '#ff4d6d', width: 18, height: 18 },
          zIndex: 5,
        };
      }
      // 自分のターン:次の ARGUS の攻撃先を、赤い点線の矢印で予告する
      const threat = busy ? undefined : game.intents.find(
        (i) => (i.action === 'attack' || i.action === 'expand') && samePair(edge, i.sourceNodeId, i.targetNodeId),
      );
      if (threat) {
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: 'threat' as const,
          animated: true,
          data: { mode: 'intent' as const, reverse: edge.source !== threat.sourceNodeId },
          markerEnd: { type: 'arrowclosed' as const, color: '#f43f5e', width: 16, height: 16 },
          zIndex: 4,
        };
      }

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        animated: bothPlayer,
        style: {
          stroke: bothPlayer
            ? '#00ff64'
            : frontier
              ? '#fbbf24'
              : bothArgus
                ? '#f43f5e'
                : '#3a4148',
          strokeWidth: bothPlayer ? 2.8 : frontier ? 2.2 : 1.7,
          strokeDasharray: frontier ? '6 4' : undefined,
          opacity: bothPlayer || frontier ? 0.92 : 0.65,
        },
      };
    });
  }, [game.nodes, game.edges, game.intents, currentEvent, busy, playKey]);

  const playerCount = game.nodes.filter((n) => n.owner === 'player').length;
  const argusCount = game.nodes.filter((n) => n.owner === 'argus').length;
  const totalCount = game.nodes.length;
  const playerPct = Math.round((playerCount / totalCount) * 100);
  const argusPct = Math.round((argusCount / totalCount) * 100);

  const handleSelectCard = (uid: string, defId: string) => {
    if (busy || game.status !== 'playing' || game.rewardChoices) return;
    const def = CARD_CATALOG[defId];
    if (!def) return;
    playSound('click');
    setNotice(null);
    if (game.bandwidth < def.cost) {
      setNotice(`帯域(コスト)が不足しています（必要: ${def.cost} / 残り: ${game.bandwidth}）。`);
      return;
    }
    if (def.targetType === 'none') {
      const res = playTerritoryCard(game, uid);
      if (res.accepted) {
        const map = fxForPlayerCard(game, res.state, `p-${res.state.logs.length}`);
        playSound(soundForPlayerFx(map));
        setPlayerFx({ map, key: `p-${res.state.logs.length}` });
        setGame(res.state);
      }
      else if (res.reason) setNotice(res.reason);
      return;
    }
    setGame((prev) => ({
      ...prev,
      selectedCardUid: prev.selectedCardUid === uid ? null : uid,
    }));
  };

  const handleNodeClick = (nodeId: string) => {
    if (busy || game.status !== 'playing' || game.rewardChoices || !game.selectedCardUid) return;
    const res = playTerritoryCard(game, game.selectedCardUid, nodeId);
    if (res.accepted) {
      const key = `p-${res.state.logs.length}`;
      const map = fxForPlayerCard(game, res.state, key);
      playSound(soundForPlayerFx(map));
      setPlayerFx({ map, key });
      setNotice(null);
      setGame(res.state);
    } else if (res.reason) {
      setNotice(res.reason);
    }
  };

  return (
    <div className="tw-shell">
      {/* 上部戦況バー */}
      <header className="tw-topbar">
        <div className="tw-brand">
          <span className="tw-brand__tag">SECTOR 05</span>
          <strong>CYBER TERRITORY WAR</strong>
        </div>

        <div className="tw-dominance">
          <span className="tw-dom-label tw-dom-label--player">PLAYER {playerCount}</span>
          <div className="tw-dom-bar">
            <div className="tw-dom-fill tw-dom-fill--player" style={{ width: `${playerPct}%` }} />
            <div className="tw-dom-fill tw-dom-fill--argus" style={{ width: `${argusPct}%` }} />
          </div>
          <span className="tw-dom-label tw-dom-label--argus">ARGUS {argusCount}</span>
        </div>

        <div className="tw-stats">
          <div className="tw-stat">
            <span>TURN</span>
            <strong>{game.turn}</strong>
          </div>
          <div className="tw-stat tw-stat--bw">
            <span>BANDWIDTH</span>
            <strong>{game.bandwidth} / {game.maxBandwidth}</strong>
          </div>
          <div key={currentEvent?.kind === 'alert' ? playKey : 'alert'} className={`tw-stat tw-stat--alert ${currentEvent?.kind === 'alert' ? 'tw-stat--flash' : ''}`}>
            <span>ALERT</span>
            <strong>{game.alertLevel}%</strong>
          </div>
        </div>

        <div className="tw-top-actions">
          <button
            type="button"
            className="tw-btn"
            onClick={() => {
              setNotice(null);
              setPlayback(null);
              setGame(createInitialTerritoryState());
            }}
          >
            やり直す
          </button>
          <button type="button" className="tw-btn" onClick={onBackToMissions}>
            ミッション選択
          </button>
        </div>
      </header>

      {/* メイン盤面 + 戦術ログ */}
      <div className="tw-main">
        <div className="tw-map-area">
          <div className="tw-legend" aria-label="色の意味">
            <span className="tw-legend__item tw-legend__item--player">自陣</span>
            <span className="tw-legend__item tw-legend__item--argus">ARGUS</span>
            <span className="tw-legend__item tw-legend__item--neutral">中立(誰のものでもない)</span>
            <span className="tw-legend__item tw-legend__item--threat">次の攻撃</span>
          </div>
          {playback && currentEvent && (
            <div className="tw-enemy-banner" role="status">
              <span className="tw-enemy-banner__tag">ARGUS TURN {playback.index + 1}/{playback.events.length}</span>
              {describeEnemyAction(currentEvent, game)}
            </div>
          )}
          {selectedCardDef && !busy && (
            <div className="tw-target-banner" role="status">
              🎯 <strong>[{selectedCardDef.name}]</strong> 選択中 —{' '}
              {selectedCardDef.targetType === 'hostile'
                ? '光っている隣接の敵/中立ノードをクリックして攻撃！'
                : '自陣（緑）のノードをクリックして強化！'}
              <button
                type="button"
                className="tw-cancel-btn"
                onClick={() => setGame((prev) => ({ ...prev, selectedCardUid: null }))}
              >
                キャンセル
              </button>
            </div>
          )}
          {notice && (
            <div className="tw-notice-banner" role="alert">
              ⚠ {notice}
            </div>
          )}
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={(_, node) => handleNodeClick(node.id)}
            fitView
            fitViewOptions={{ padding: 0.12 }}
            minZoom={0.35 * uiScale}
            maxZoom={1.6 * uiScale}
            panOnScroll
            panOnScrollMode={PanOnScrollMode.Vertical}
            nodesDraggable={false}
            nodesConnectable={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#164e63" gap={26} />
            <Controls showInteractive={false} position="bottom-left" />
          </ReactFlow>
        </div>

        <aside className="tw-sidebar">
          <section className="tw-panel-box">
            <h3>支配ボーナス（盤面効果）</h3>
            <ul className="tw-bonus-list">
              <li>🌐 <strong>Web球体</strong>：毎ターン開始時のドロー +1</li>
              <li>🛡 <strong>FW盾</strong>：ターン終了時、隣接自陣にシールド +2</li>
              <li>👁 <strong>監視アイ(I04)</strong>：ARGUS反撃の攻撃力・警戒上昇を軽減</li>
              <li>⚡ <strong>支配数2つごと</strong>：最大帯域(コスト) +1</li>
            </ul>
          </section>

          <section className="tw-panel-box tw-panel-box--log">
            <h3>戦術ログ ({game.logs.length})</h3>
            <div className="tw-log-list">
              {[...game.logs].reverse().map((entry) => (
                <div key={entry.id} className={`tw-log tw-log--${entry.severity}`}>
                  <span className="tw-log__turn">T{entry.turn}</span>
                  <span>{entry.message}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {/* 下部手札トレイ */}
      <footer className="tw-hand-dock">
        <div className="tw-pile-info">
          <div>山札: <strong>{game.deck.length}</strong></div>
          <div>捨札: <strong>{game.discard.length}</strong></div>
        </div>

        <div className="tw-hand">
          {game.hand.map((item) => {
            const def = CARD_CATALOG[item.defId];
            if (!def) return null;
            const affordable = game.bandwidth >= def.cost;
            const isSelected = game.selectedCardUid === item.uid;
            return (
              <button
                key={item.uid}
                type="button"
                disabled={busy || !affordable || game.status !== 'playing' || Boolean(game.rewardChoices)}
                className={[
                  'tw-card',
                  `tw-card--${def.kind}`,
                  `tw-card--${def.rarity}`,
                  isSelected ? 'tw-card--selected' : '',
                  !affordable ? 'tw-card--unaffordable' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => handleSelectCard(item.uid, item.defId)}
              >
                <CardFace def={def} />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="tw-end-turn-btn"
          disabled={busy || game.status !== 'playing' || Boolean(game.rewardChoices)}
          onClick={() => {
            setNotice(null);
            const next = endTerritoryTurn(game);
            // ARGUS が何かしたなら、結果に切り替える前に1つずつ見せる
            if (next.lastEnemyActions.length > 0) {
              setGame((prev) => ({ ...prev, selectedCardUid: null }));
              setPlayback({ events: next.lastEnemyActions, index: 0, next });
            } else {
              setGame(next);
            }
          }}
        >
          {busy ? 'ARGUS 行動中…' : 'TURN END ▶'}
        </button>
      </footer>

      {/* ノード制圧時の報酬カード選択モーダル */}
      {game.rewardChoices && (
        <div className="tw-modal-backdrop" role="dialog" aria-modal="true">
          <div className="tw-modal">
            <h2>📦 SYSTEM BREACHED! 戦利品モジュールを1枚獲得</h2>
            <p className="tw-modal__sub">選んだカードがデッキ（捨て札）に追加されます。</p>
            <div className="tw-reward-grid">
              {game.rewardChoices.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  className={`tw-card tw-card--${card.kind} tw-card--${card.rarity} tw-card--reward`}
                  onClick={() => setGame((prev) => pickRewardCard(prev, card.id))}
                >
                  <CardFace def={card} />
                </button>
              ))}
            </div>
            <button
              type="button"
              className="tw-btn"
              onClick={() => setGame((prev) => skipRewardCard(prev))}
            >
              スキップ（デッキを増やさない）
            </button>
          </div>
        </div>
      )}

      {/* 勝敗リザルトモーダル */}
      {game.status !== 'playing' && !busy && (
        <div className="tw-modal-backdrop" role="dialog" aria-modal="true">
          <div className="tw-modal">
            <h2>
              {game.status === 'won'
                ? '🏆 VICTORY — 極秘研究DB (C03) 制圧完了！'
                : '💀 DEFEAT — 作戦失敗'}
            </h2>
            <p className="tw-modal__sub">
              経過ターン: {game.turn} ／ 最終警戒度: {game.alertLevel}% ／ 支配ノード: {playerCount}/{totalCount}
            </p>
            <div className="tw-modal__actions">
              <button
                type="button"
                className="tw-end-turn-btn"
                onClick={() => {
                  setNotice(null);
                  setPlayback(null);
                  setGame(createInitialTerritoryState());
                }}
              >
                もう1戦プレイ
              </button>
              <button type="button" className="tw-btn" onClick={onBackToMissions}>
                ミッション選択へ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function TerritoryGame(props: TerritoryGameProps) {
  return (
    <ReactFlowProvider>
      <TerritoryBoard {...props} />
    </ReactFlowProvider>
  );
}
