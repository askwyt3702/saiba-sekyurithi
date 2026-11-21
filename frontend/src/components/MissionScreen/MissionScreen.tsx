import { useState } from 'react';
import { CARD_DEFINITIONS } from '../../game/deckbattle/cards';
import { MAP_TOTAL_FLOORS } from '../../game/deckbattle/map';
import { ACHIEVEMENTS, loadDeckProfile } from '../../game/deckbattle/profile';
import { STARTING_RECON_COINS } from '../../game/deckbattle/run';
import { playSound } from '../../game/sound/soundEffects';
import { DeckHubModal } from '../DeckBattle/DeckHubModal';
import { HowToPlayModal } from '../DeckBattle/HowToPlayModal';
import { usePlayerSync } from '../DeckBattle/usePlayerSync';
import { GameIcon } from '../GameIcon/GameIcon';
import { PlayerPanel } from './PlayerPanel';
import './MissionScreen.css';

interface MissionScreenProps {
  onSelectMission: (id: number) => void;
  onBack: () => void;
}

const TOTAL_CARDS = Object.keys(CARD_DEFINITIONS).length;

export function MissionScreen({ onSelectMission, onBack }: MissionScreenProps) {
  const [hubOpen, setHubOpen] = useState(false);
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  // サーバーからカード基地を読み込んだら再描画して、最新の戦績を出す
  usePlayerSync();
  const profile = loadDeckProfile();

  const seenCount = profile.seenCardIds.length;
  const codexPct = Math.min(100, Math.round((seenCount / Math.max(1, TOTAL_CARDS)) * 100));
  const reviewCount = profile.wrongQuestionIds.length;

  const handleLaunch = () => {
    playSound('breach');
    onSelectMission(6);
  };

  return (
    <main className="ms-root" id="missionScreen">
      <div className="ms-bg-overlay" aria-hidden="true" />
      <div className="ms-scan-beam" aria-hidden="true" />

      <div className="ms-container">
        {/* ヘッダー：ブランド＆オペレーター状態 */}
        <header className="ms-header">
          <div className="ms-brand">
            <span className="ms-brand-cyber">CYBER</span>
            <span className="ms-brand-labyrinth">LABYRINTH</span>
            <span className="ms-brand-divider">//</span>
            <span className="ms-brand-sub">COMMAND_HUB</span>
          </div>

          <div className="ms-status">
            <PlayerPanel />
            <button
              type="button"
              className="ms-hub-btn ms-hub-btn--ghost"
              onClick={() => {
                playSound('click');
                setHowToPlayOpen(true);
              }}
            >
              <GameIcon name="help" /> 遊び方
            </button>
            <button
              type="button"
              className="ms-hub-btn"
              title="図鑑・弱点ノート・戦績・実績"
              onClick={() => {
                playSound('click');
                setHubOpen(true);
              }}
            >
              <GameIcon name="layers" /> カード基地
            </button>
            <div className="ms-link-pill">
              <span className="ms-status-dot" />
              <span>STEALTH LINK: ACTIVE</span>
            </div>
          </div>
        </header>

        {/* ヒーロー見出し */}
        <section className="ms-hero">
          <div className="ms-hero-top">
            <p className="ms-section-code">&gt; SYS://OPERATIONS_CENTER // DECK_BREACH</p>
            <p className="ms-recommend-tag">
              ✦ SECURITY DECKBUILDER — 攻撃・防御・脆弱性診断で最深層を攻略
            </p>
          </div>
          <div className="ms-hero-headline">
            <h1 className="ms-title">SELECT OPERATION</h1>
            <p className="ms-subtitle">
              使うほど育つ攻撃・防御カードでデッキを構築し、セキュリティ脆弱性を突いて3体の監視AIボスが待つ最深層を突破せよ。
            </p>
          </div>
        </section>

        {/* メイン2カラム：左＝作戦カード / 右＝戦績テレメトリ＆クイックアクセス */}
        <section className="ms-hub-grid">
          {/* 左：メイン作戦ヒーローカード */}
          <article
            className="ms-op-card"
            onClick={handleLaunch}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleLaunch();
              }
            }}
          >
            <span className="ms-corner ms-corner--tl" aria-hidden="true" />
            <span className="ms-corner ms-corner--tr" aria-hidden="true" />
            <span className="ms-corner ms-corner--bl" aria-hidden="true" />
            <span className="ms-corner ms-corner--br" aria-hidden="true" />
            <div className="ms-card-scanner" aria-hidden="true" />

            {/* 背景レーダー装飾 */}
            <svg viewBox="0 0 180 180" className="ms-op-radar" aria-hidden="true">
              <circle cx="90" cy="90" r="80" className="ms-radar-ring" />
              <circle cx="90" cy="90" r="54" className="ms-radar-ring" />
              <circle cx="90" cy="90" r="28" className="ms-radar-ring" />
              <line x1="90" y1="6" x2="90" y2="174" className="ms-radar-axis" />
              <line x1="6" y1="90" x2="174" y2="90" className="ms-radar-axis" />
              <path d="M90 90 L90 10 A80 80 0 0 1 160 50 Z" className="ms-radar-sweep" />
            </svg>

            <div className="ms-op-head">
              <span className="ms-op-code">
                <span className="ms-op-live-dot" />
                OPERATION 01 // ACTIVE
              </span>
              <div className="ms-op-badges">
                <span className="ms-op-badge">{MAP_TOTAL_FLOORS} FLOORS</span>
                <span className="ms-op-badge">{TOTAL_CARDS} CARDS</span>
                <span className="ms-op-badge ms-op-badge--accent">3 BOSSES</span>
              </div>
            </div>

            <div className="ms-op-body">
              <div className="ms-op-kicker">ROGUELIKE CYBER DECK BREACH</div>
              <h2 className="ms-op-title">
                DECK BREACH <span className="ms-op-title-jp">— 監視網突破作戦</span>
              </h2>
              <p className="ms-op-desc">
                全{TOTAL_CARDS}種類の攻撃・防御・解析カードを育て、Lv.3で分岐進化させながら最奥の監視AI撃破を目指す。初期解析コイン{STARTING_RECON_COINS}枚（＋ボーナス{profile.bonusStartCoins}枚）を携え、分岐ルートを攻略せよ。
              </p>

              {/* ボス候補ロスター */}
              <div className="ms-boss-roster">
                <div className="ms-boss-roster-label">DETECTED FINAL TARGETS（ランダム出現ボス）</div>
                <div className="ms-boss-chips">
                  <div className="ms-boss-chip ms-boss-chip--red">
                    <span className="ms-boss-dot" />
                    <div>
                      <div className="ms-boss-name">ARGUS</div>
                      <div className="ms-boss-role">監視AI / 強襲型</div>
                    </div>
                  </div>
                  <div className="ms-boss-chip ms-boss-chip--cyan">
                    <span className="ms-boss-dot" />
                    <div>
                      <div className="ms-boss-name">AEGIS-OMEGA</div>
                      <div className="ms-boss-role">要塞FW / 鉄壁型</div>
                    </div>
                  </div>
                  <div className="ms-boss-chip ms-boss-chip--purple">
                    <span className="ms-boss-dot" />
                    <div>
                      <div className="ms-boss-name">HYDRA-NET</div>
                      <div className="ms-boss-role">分散ボット / 増殖型</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* スペックチップ */}
              <div className="ms-spec-row">
                <span className="ms-spec-pill">⚔ 4種の初期ロードアウト</span>
                <span className="ms-spec-pill">⚡ チュートリアル搭載</span>
                <span className="ms-spec-pill">🛡 セキュリティLv 0–5</span>
              </div>
            </div>

            <div className="ms-op-foot">
              <div className="ms-op-cta-text">
                <span className="ms-op-cta-main">▶ START DECK BREACH</span>
                <span className="ms-op-cta-sub">クリックして作戦準備へ</span>
              </div>
              <span className="ms-action-arrow">→</span>
            </div>
          </article>

          {/* 右：オペレーター・テレメトリ＆クイックコマンド */}
          <aside className="ms-side-stack">
            {/* 戦績＆図鑑テレメトリ */}
            <div className="ms-telemetry-panel">
              <div className="ms-panel-head">
                <span className="ms-panel-code">// OPERATOR TELEMETRY</span>
                <span className="ms-panel-sub">作戦記録</span>
              </div>

              <div className="ms-stats-grid">
                <div className="ms-stat-tile">
                  <span className="ms-stat-label">CLEAR RECORD</span>
                  <div className="ms-stat-val">
                    {profile.stats.runsWon}
                    <span className="ms-stat-unit">勝</span>
                  </div>
                  <span className="ms-stat-sub">挑戦 {profile.stats.runsPlayed} 回</span>
                </div>

                <div className="ms-stat-tile">
                  <span className="ms-stat-label">CARD CODEX</span>
                  <div className="ms-stat-val">
                    {seenCount}
                    <span className="ms-stat-unit">/{TOTAL_CARDS}</span>
                  </div>
                  <div className="ms-codex-bar" aria-hidden="true">
                    <div className="ms-codex-fill" style={{ width: `${codexPct}%` }} />
                  </div>
                </div>

                <div className="ms-stat-tile">
                  <span className="ms-stat-label">EVOLUTIONS</span>
                  <div className="ms-stat-val">
                    {profile.unlockedBranches.length}
                    <span className="ms-stat-unit">種</span>
                  </div>
                  <span className="ms-stat-sub">
                    実績 {profile.achievements.length}/{ACHIEVEMENTS.length}
                  </span>
                </div>

                <div className="ms-stat-tile ms-stat-tile--amber">
                  <span className="ms-stat-label">BONUS COINS</span>
                  <div className="ms-stat-val">
                    +{profile.bonusStartCoins}
                    <span className="ms-stat-unit">枚</span>
                  </div>
                  <span className="ms-stat-sub">
                    合計 {STARTING_RECON_COINS + profile.bonusStartCoins} 枚で開始
                  </span>
                </div>
              </div>
            </div>

            {/* クイックコマンド（カード基地・遊び方） */}
            <div className="ms-quick-grid">
              <button
                type="button"
                className="ms-quick-btn ms-quick-btn--emerald"
                onClick={() => {
                  playSound('click');
                  setHubOpen(true);
                }}
              >
                <div className="ms-quick-top">
                  <span className="ms-quick-icon"><GameIcon name="layers" /></span>
                  {reviewCount > 0 && (
                    <span className="ms-quick-alert">復習 {reviewCount}件</span>
                  )}
                </div>
                <div className="ms-quick-title">カード基地</div>
                <div className="ms-quick-desc">図鑑・進化ツリー・弱点ノート・実績</div>
              </button>

              <button
                type="button"
                className="ms-quick-btn ms-quick-btn--cyan"
                onClick={() => {
                  playSound('click');
                  setHowToPlayOpen(true);
                }}
              >
                <div className="ms-quick-top">
                  <span className="ms-quick-icon"><GameIcon name="help" /></span>
                  <span className="ms-quick-tag">GUIDE</span>
                </div>
                <div className="ms-quick-title">遊び方・ルール</div>
                <div className="ms-quick-desc">弱点1.5倍・FW防御・進化のコツを確認</div>
              </button>
            </div>

            {/* ライブ脅威モニター */}
            <div className="ms-threat-bar" aria-hidden="true">
              <div className="ms-threat-head">
                <span className="ms-threat-dot" />
                <span>LIVE THREAT MONITOR</span>
              </div>
              <div className="ms-threat-log">
                <span>[SCAN] SQLi · XSS · CSRF · RCE SIGNATURES LOADED</span>
                <span>[WARN] ADAPTIVE BOSS FIREWALL ACTIVE AT FLOOR {MAP_TOTAL_FLOORS}</span>
              </div>
            </div>
          </aside>
        </section>

        {/* フッター */}
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
            ENCRYPTED TUNNEL: TLS 1.3 // DECK BREACH ENGINE v1.0
          </div>
        </footer>
      </div>

      {hubOpen && <DeckHubModal onClose={() => setHubOpen(false)} />}
      {howToPlayOpen && <HowToPlayModal onClose={() => setHowToPlayOpen(false)} />}
    </main>
  );
}
