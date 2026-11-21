import { useState } from 'react';
import { REWARD_CARD_IDS } from '../../game/deckbattle/cards';
import { isBgmEnabled, setBgmEnabled } from '../../game/sound/bgm';
import { isSoundEnabled, playSound, setSoundEnabled } from '../../game/sound/soundEffects';
import { GameIcon } from '../GameIcon/GameIcon';
import './TitleScreen.css';

interface TitleScreenProps {
  onStart: () => void;
}

const LEFT_STREAM_LINES = [
  '0x7F4A  SYN_ACK  443/TCP',
  '0x9C12  TLS_1.3  CIPHER_OK',
  '0x3E08  SQLI_CHK PASS',
  '0xA1B4  FW_RULE  BYPASS',
  '0x6D20  XSS_VEC  LOADED',
  '0xF051  IDS_EVD  99.4%',
  '0x2A9E  ZERO_DAY READY',
  '0x8B44  HMAC_256 VERIFIED',
];

const RIGHT_STREAM_LINES = [
  'NODE_01  ARGUS_EYE   LOCK',
  'NODE_02  AEGIS_WALL  SCAN',
  'NODE_03  HYDRA_NET   PING',
  'DECK_DB  40_MODULES  SYNC',
  'CRYPTO   AES_256_GCM OK',
  'SHELL    /bin/breach INIT',
  'TRACE    0.00%       SAFE',
  'STATUS   AWAIT_EXEC  LIVE',
];

export function TitleScreen({ onStart }: TitleScreenProps) {
  const [isSettingOpen, setIsSettingOpen] = useState(false);
  const [bgMotion, setBgMotion] = useState(true);
  const [seEnabled, setSeEnabled] = useState(() => isSoundEnabled());
  const [bgmEnabled, setBgmEnabledState] = useState(() => isBgmEnabled());

  const handleToggleSe = () => {
    const next = !seEnabled;
    setSeEnabled(next);
    setSoundEnabled(next);
    if (next) {
      playSound('scan');
    }
  };

  return (
    <main className={`ts-root ${bgMotion ? '' : 'is-motion-paused'}`}>
      {/* 背景レイヤー（設定でON/OFF切り替え可能） */}
      <div className={`ts-bg-layer ${bgMotion ? '' : 'is-paused'}`} />
      <div className="ts-grid-overlay" aria-hidden="true" />
      <div className="ts-scan-beam" aria-hidden="true" />

      {/* 左右のサイバー通信ログ演出（装飾） */}
      <aside className="ts-stream ts-stream--left" aria-hidden="true">
        <div className="ts-stream-track">
          {[...LEFT_STREAM_LINES, ...LEFT_STREAM_LINES].map((line, i) => (
            <div key={i} className="ts-stream-line">{line}</div>
          ))}
        </div>
      </aside>
      <aside className="ts-stream ts-stream--right" aria-hidden="true">
        <div className="ts-stream-track ts-stream-track--reverse">
          {[...RIGHT_STREAM_LINES, ...RIGHT_STREAM_LINES].map((line, i) => (
            <div key={i} className="ts-stream-line">{line}</div>
          ))}
        </div>
      </aside>

      {/* 上部セキュリティHUDバー */}
      <header className="ts-hud-top">
        <div className="ts-hud-chip">
          <span className="ts-hud-bracket">[</span>
          SYS://ROOT_ACCESS
          <span className="ts-hud-bracket">]</span>
        </div>
        <div className="ts-hud-status">
          <span className="ts-pulse-dot" />
          <span>TLS 1.3 ENCRYPTED</span>
          <span className="ts-hud-sep">//</span>
          <span>IDS EVASION: 99.4%</span>
        </div>
      </header>

      {/* 中央ヒーローコンテンツ */}
      <div className="ts-center">
        <div className="ts-panel">
          <span className="ts-corner ts-corner--tl" aria-hidden="true" />
          <span className="ts-corner ts-corner--tr" aria-hidden="true" />
          <span className="ts-corner ts-corner--bl" aria-hidden="true" />
          <span className="ts-corner ts-corner--br" aria-hidden="true" />

          {/* 回転するサイバーセキュリティ・エンブレム */}
          <div className="ts-emblem" aria-hidden="true">
            <svg viewBox="0 0 120 120" className="ts-emblem-svg">
              <circle cx="60" cy="60" r="54" className="ts-ring ts-ring--outer" />
              <circle cx="60" cy="60" r="43" className="ts-ring ts-ring--inner" />
              <polygon
                points="60,16 96,37 96,83 60,104 24,83 24,37"
                className="ts-hex"
              />
              <path
                d="M60 32 L80 41 V59 C80 73 71 83 60 88 C49 83 40 73 40 59 V41 Z"
                className="ts-shield"
              />
              <circle cx="60" cy="57" r="6" className="ts-core-dot" />
              <path d="M60 63 V72" className="ts-core-line" />
            </svg>
          </div>

          <p className="ts-label">
            <span className="ts-label-dot" />
            CYBERSECURITY ROGUELIKE DECKBUILDER
          </p>

          <h1 className="ts-title">
            <span className="ts-t-null">CYBER</span>
            <span className="ts-t-route" data-text="LABYRINTH">LABYRINTH</span>
          </h1>

          <div className="ts-divider">
            <span className="ts-divider-node" />
          </div>

          <p className="ts-subtitle">
            脆弱性を突き、システム深層を突破せよ — DECK BREACH
          </p>

          {/* 簡易セキュリティ端末ステータス */}
          <div className="ts-terminal-box" aria-hidden="true">
            <div className="ts-term-line">
              <span className="ts-term-prompt">$</span>
              <span>nmap -sV --vuln target.internal</span>
            </div>
            <div className="ts-term-line ts-term-line--ok">
              <span className="ts-term-tag">[OK]</span>
              <span>{REWARD_CARD_IDS.length} EXPLOIT &amp; FIREWALL MODULES LOADED</span>
            </div>
            <div className="ts-term-line ts-term-line--ready">
              <span className="ts-term-tag">[READY]</span>
              <span>AWAITING OPERATOR BREACH</span>
              <span className="ts-cursor">_</span>
            </div>
          </div>

          <div className="ts-menu">
            <button
              id="startButton"
              type="button"
              className="ts-btn-start"
              onClick={() => {
                playSound('breach');
                onStart();
              }}
            >
              <span className="ts-btn-start-main">▶&nbsp;&nbsp;START BREACH</span>
              <span className="ts-btn-start-sub">作戦司令室へ接続</span>
            </button>
            <button
              id="settingButton"
              type="button"
              className="ts-btn-setting"
              onClick={() => {
                playSound('click');
                setIsSettingOpen(true);
              }}
            >
              <GameIcon name="settings" />&nbsp;&nbsp;SYSTEM SETTING &amp; CREDITS
            </button>
          </div>
        </div>
      </div>

      {/* 下部テレメトリフッター */}
      <footer className="ts-hud-bottom">
        <span>CVE-SCANNER: READY</span>
        <span className="ts-hud-sep">//</span>
        <span>FINAL TARGET: NEXUS</span>
        <span className="ts-hud-sep">//</span>
        <span>v1.0.0 CYBER_LABYRINTH_SYS</span>
      </footer>

      {/* SETTING / CREDIT モーダル */}
      {isSettingOpen && (
        <div
          className="ts-modal-backdrop"
          onClick={() => setIsSettingOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ts-modal-title"
        >
          <div
            className="ts-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ts-modal-header">
              <h2 id="ts-modal-title" className="ts-modal-title">
                <GameIcon name="settings" /> SYSTEM SETTING &amp; CREDITS
              </h2>
              <button
                type="button"
                className="ts-modal-close"
                onClick={() => setIsSettingOpen(false)}
                aria-label="閉じる"
              >
                <GameIcon name="cross" />
              </button>
            </div>

            <div className="ts-modal-body">
              {/* 設定項目：サイバー効果音 */}
              <div className="ts-setting-row">
                <div>
                  <div className="ts-setting-name">サイバー効果音 (CYBER SE)</div>
                  <div className="ts-setting-desc">
                    スキャン・侵入・IDS警告などの軽量シンセ効果音を鳴らします
                  </div>
                </div>
                <button
                  type="button"
                  className={`ts-toggle-btn ${seEnabled ? 'is-on' : 'is-off'}`}
                  onClick={handleToggleSe}
                >
                  {seEnabled ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* 設定項目：BGM */}
              <div className="ts-setting-row">
                <div>
                  <div className="ts-setting-name">BGM</div>
                  <div className="ts-setting-desc">
                    プレイ中に流れる音楽。戦況・ボス戦に応じて緊張感が増します
                  </div>
                </div>
                <button
                  type="button"
                  className={`ts-toggle-btn ${bgmEnabled ? 'is-on' : 'is-off'}`}
                  onClick={() => {
                    const next = !bgmEnabled;
                    playSound('click');
                    setBgmEnabledState(next);
                    setBgmEnabled(next);
                  }}
                >
                  {bgmEnabled ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* 設定項目：背景アニメーション */}
              <div className="ts-setting-row">
                <div>
                  <div className="ts-setting-name">背景アニメーション (BG MOTION)</div>
                  <div className="ts-setting-desc">
                    オフにするとノートPCでのバッテリー消費・負荷をさらに抑えます
                  </div>
                </div>
                <button
                  type="button"
                  className={`ts-toggle-btn ${bgMotion ? 'is-on' : 'is-off'}`}
                  onClick={() => {
                    playSound('click');
                    setBgMotion((prev) => !prev);
                  }}
                >
                  {bgMotion ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* 簡易操作ガイド */}
              <div className="ts-modal-section">
                <div className="ts-section-head">// OPERATION BRIEFING（基本ルール）</div>
                <ul className="ts-guide-list">
                  <li>
                    <strong>1. EXPLOIT（攻撃）</strong>：敵の脆弱性（弱点）を突くカードで 1.5倍ダメージを狙おう
                  </li>
                  <li>
                    <strong>2. FIREWALL（防御）</strong>：敵の頭上に表示される次の攻撃を防御カード（FW）で受け止めよう
                  </li>
                  <li>
                    <strong>3. EVOLVE（進化）</strong>：使うほどカードが成長し、Lv.3で強力な分岐進化を解放できる
                  </li>
                </ul>
              </div>

              {/* クレジット */}
              <div className="ts-modal-section">
                <div className="ts-section-head">// CREDITS</div>
                <div className="ts-credit-box">
                  <p>TITLE : CYBER LABYRINTH — DECK BREACH</p>
                  <p>DEVELOPED BY : CYBER MYSTERY PROJECT TEAM</p>
                  <p>BUILD : VERSION 1.0.0</p>
                </div>
              </div>
            </div>

            <div className="ts-modal-footer">
              <button
                type="button"
                className="ts-modal-ok"
                onClick={() => setIsSettingOpen(false)}
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
