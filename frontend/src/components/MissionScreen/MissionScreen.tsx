import { useState } from 'react';
import { loadDeckProfile } from '../../game/deckbattle/profile';
import { DEFAULT_RUN_NODES, STARTING_RECON_COINS } from '../../game/deckbattle/run';
import { playSound } from '../../game/sound/soundEffects';
import { DeckHubModal } from '../DeckBattle/DeckHubModal';
import { usePlayerSync } from '../DeckBattle/usePlayerSync';
import { PlayerPanel } from './PlayerPanel';
import './MissionScreen.css';

interface MissionScreenProps {
  onSelectMission: (id: number) => void;
  onBack: () => void;
}

export function MissionScreen({ onSelectMission, onBack }: MissionScreenProps) {
  const [hubOpen, setHubOpen] = useState(false);
  // サーバーからカード基地を読み込んだら再描画して、最新の戦績を出す
  usePlayerSync();
  const profile = loadDeckProfile();

  return (
    <main className="ms-root" id="missionScreen">
      <div className="ms-bg-overlay" />
      <div className="ms-scan-beam" />

      <div className="ms-container">
        <header className="ms-header">
          <div className="ms-brand">
            <span className="ms-brand-cyber">CYBER</span>
            <span className="ms-brand-labyrinth">LABYRINTH</span>
            <span className="ms-brand-divider">//</span>
            <span className="ms-brand-sub">DECK_BREACH_TERMINAL</span>
          </div>

          <div className="ms-status">
            <PlayerPanel />
            <button
              type="button"
              className="ms-hub-btn"
              onClick={() => {
                playSound('click');
                setHubOpen(true);
              }}
            >
              🎴 カード基地（図鑑・弱点・戦績・実績）
            </button>
            <span className="ms-status-dot" />
            <span>STEALTH LINK: ACTIVE</span>
          </div>
        </header>

        <section className="ms-hero">
          <div className="ms-hero-top">
            <p className="ms-section-code">&gt; DECK_BREACH // ROGUELIKE_CARD_OPERATIONS</p>
            <p className="ms-recommend-tag">
              ✦ クリア実績 {profile.stats.runsWon} 回 / 図鑑登録 {profile.seenCardIds.length} 種 / 次回開始コイン +{profile.bonusStartCoins}
            </p>
          </div>
          <h1 className="ms-title">SELECT OPERATION</h1>
          <p className="ms-subtitle">
            使うほど育つ攻撃・防御カードでデッキを構築し、セキュリティ診断イベントを突破して最奥の監視AI「ARGUS」を攻略せよ。
          </p>
        </section>

        <section className="ms-grid">
          <article
            className="ms-card ms-card--amber"
            onClick={() => {
              playSound('breach');
              onSelectMission(6);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                playSound('breach');
                onSelectMission(6);
              }
            }}
          >
            <div className="ms-card-top">
              <span className="ms-card-code">OPERATION // DECK BREACH</span>
              <span className="ms-card-badge">{DEFAULT_RUN_NODES.length} NODES / 40 CARDS</span>
            </div>

            <div className="ms-card-hazard">TARGET: 監視AI ARGUS</div>

            <h2 className="ms-card-title">デッキ構築ローグライト</h2>
            <p className="ms-card-desc">
              全40種類のカードを育て、Lv.3で分岐進化させながらARGUS撃破を目指す。解析コイン{STARTING_RECON_COINS}枚を持って出発し、診断クイズのあとに闇市へ立ち寄れる。
            </p>

            <div className="ms-card-meta">
              <div className="ms-meta-row">
                <span className="ms-meta-label">BOSS</span>
                <span className="ms-meta-val">監視AI ARGUS (HP 240)</span>
              </div>
              <div className="ms-meta-row">
                <span className="ms-meta-label">RECORDS</span>
                <span className="ms-meta-val">
                  挑戦 {profile.stats.runsPlayed}回 / 勝利 {profile.stats.runsWon}回
                </span>
              </div>
            </div>

            <div className="ms-card-foot">
              <span className="ms-action-text">▶ START DECK BREACH</span>
              <span className="ms-action-arrow">→</span>
            </div>
          </article>
        </section>

        <footer className="ms-footer">
          <button
            type="button"
            className="ms-back-btn"
            onClick={() => {
              playSound('click');
              onBack();
            }}
          >
            <span className="ms-back-arrow">←</span>
            <span>DISCONNECT (タイトルへ戻る)</span>
          </button>

          <div className="ms-footer-info">
            ENCRYPTED TUNNEL: ACTIVE // DECK BREACH ENGINE v0.3
          </div>
        </footer>
      </div>

      {hubOpen && <DeckHubModal onClose={() => setHubOpen(false)} />}
    </main>
  );
}
