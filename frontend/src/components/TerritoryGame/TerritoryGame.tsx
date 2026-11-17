import { useMemo, useState } from 'react';
import {
  Background,
  Controls,
  PanOnScrollMode,
  ReactFlow,
  ReactFlowProvider,
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
import type { TerritoryGameState } from '../../game/territory/territoryTypes';
import { TerritoryNodeView, type TerritoryFlowNode } from './TerritoryNodeView';
import './TerritoryGame.css';

interface TerritoryGameProps {
  onBackToMissions: () => void;
}

const nodeTypes = {
  territoryNode: TerritoryNodeView,
};

function TerritoryBoard({ onBackToMissions }: TerritoryGameProps) {
  const [game, setGame] = useState<TerritoryGameState>(() => createInitialTerritoryState());
  const [notice, setNotice] = useState<string | null>(null);

  const selectedCardInstance = game.hand.find((c) => c.uid === game.selectedCardUid) ?? null;
  const selectedCardDef = selectedCardInstance ? CARD_CATALOG[selectedCardInstance.defId] : null;

  const attackableIds = useMemo(() => getAttackableNodeIds(game), [game]);

  const flowNodes: TerritoryFlowNode[] = useMemo(
    () =>
      game.nodes.map((node) => {
        const intent = game.intents.find((i) => i.sourceNodeId === node.id);
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
          data: { node, targetable, isWeakness, intent },
        };
      }),
    [game.nodes, game.intents, selectedCardDef, attackableIds],
  );

  const flowEdges: Edge[] = useMemo(() => {
    const ownerMap = new Map(game.nodes.map((n) => [n.id, n.owner]));
    return game.edges.map((edge) => {
      const s = ownerMap.get(edge.source);
      const t = ownerMap.get(edge.target);
      const bothPlayer = s === 'player' && t === 'player';
      const bothArgus = s === 'argus' && t === 'argus';
      const frontier = (s === 'player' && t !== 'player') || (t === 'player' && s !== 'player');
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
                : '#3b6472',
          strokeWidth: bothPlayer ? 2.8 : frontier ? 2.2 : 1.7,
          strokeDasharray: frontier ? '6 4' : undefined,
          opacity: bothPlayer || frontier ? 0.92 : 0.65,
        },
      };
    });
  }, [game.nodes, game.edges]);

  const playerCount = game.nodes.filter((n) => n.owner === 'player').length;
  const argusCount = game.nodes.filter((n) => n.owner === 'argus').length;
  const totalCount = game.nodes.length;
  const playerPct = Math.round((playerCount / totalCount) * 100);
  const argusPct = Math.round((argusCount / totalCount) * 100);

  const handleSelectCard = (uid: string, defId: string) => {
    if (game.status !== 'playing' || game.rewardChoices) return;
    const def = CARD_CATALOG[defId];
    if (!def) return;
    setNotice(null);
    if (game.bandwidth < def.cost) {
      setNotice(`帯域(コスト)が不足しています（必要: ${def.cost} / 残り: ${game.bandwidth}）。`);
      return;
    }
    if (def.targetType === 'none') {
      const res = playTerritoryCard(game, uid);
      if (res.accepted) setGame(res.state);
      else if (res.reason) setNotice(res.reason);
      return;
    }
    setGame((prev) => ({
      ...prev,
      selectedCardUid: prev.selectedCardUid === uid ? null : uid,
    }));
  };

  const handleNodeClick = (nodeId: string) => {
    if (game.status !== 'playing' || game.rewardChoices || !game.selectedCardUid) return;
    const res = playTerritoryCard(game, game.selectedCardUid, nodeId);
    if (res.accepted) {
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
          <div className="tw-stat tw-stat--alert">
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
          {selectedCardDef && (
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
            onNodeClick={(_, node) => handleNodeClick(node.id)}
            fitView
            fitViewOptions={{ padding: 0.16 }}
            minZoom={0.45}
            maxZoom={1.5}
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
                disabled={!affordable || game.status !== 'playing' || Boolean(game.rewardChoices)}
                className={[
                  'tw-card',
                  `tw-card--${def.kind}`,
                  isSelected ? 'tw-card--selected' : '',
                  !affordable ? 'tw-card--unaffordable' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => handleSelectCard(item.uid, item.defId)}
              >
                <div className="tw-card__top">
                  <span className="tw-card__cost">{def.cost}</span>
                  <span className="tw-card__kind">
                    {def.kind === 'attack' ? 'ATTACK' : def.kind === 'defense' ? 'DEFENSE' : 'UTILITY'}
                  </span>
                </div>
                <div className="tw-card__name">{def.name}</div>
                <div className="tw-card__desc">{def.description}</div>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="tw-end-turn-btn"
          disabled={game.status !== 'playing' || Boolean(game.rewardChoices)}
          onClick={() => {
            setNotice(null);
            setGame((prev) => endTerritoryTurn(prev));
          }}
        >
          TURN END ▶
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
                  className={`tw-card tw-card--${card.kind} tw-card--reward`}
                  onClick={() => setGame((prev) => pickRewardCard(prev, card.id))}
                >
                  <div className="tw-card__top">
                    <span className="tw-card__cost">{card.cost}</span>
                    <span className="tw-card__kind">{card.rarity.toUpperCase()}</span>
                  </div>
                  <div className="tw-card__name">{card.name}</div>
                  <div className="tw-card__desc">{card.description}</div>
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
      {game.status !== 'playing' && (
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
