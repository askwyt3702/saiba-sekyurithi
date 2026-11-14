import { useState } from 'react';
import { isSoundEnabled, playSound, setSoundEnabled } from '../../game/sound/soundEffects';
import './TitleScreen.css';

interface TitleScreenProps {
  onStart: () => void;
}

export function TitleScreen({ onStart }: TitleScreenProps) {
  const [isSettingOpen, setIsSettingOpen] = useState(false);
  const [bgMotion, setBgMotion] = useState(true);
  const [seEnabled, setSeEnabled] = useState(() => isSoundEnabled());

  const handleToggleSe = () => {
    const next = !seEnabled;
    setSeEnabled(next);
    setSoundEnabled(next);
    if (next) {
      playSound('scan');
    }
  };

  return (
    <main className="ts-root">
      {/* ゆらゆら動く背景レイヤー（設定でON/OFF切り替え可能） */}
      <div className={`ts-bg-layer ${bgMotion ? '' : 'is-paused'}`} />

      {/* 中央パネル */}
      <div className="ts-center">
        <div className="ts-panel">
          <p className="ts-label">CYBER MYSTERY PROJECT</p>

          <h1 className="ts-title">
            <span className="ts-t-null">CYBER</span>
            <span className="ts-t-route">LABYRINTH</span>
          </h1>

          <div className="ts-divider" />
          <p className="ts-subtitle">— CYBER MYSTERY GAME —</p>

          <div className="ts-menu">
            <button
              id="startButton"
              className="ts-btn-start"
              onClick={() => {
                playSound('breach');
                onStart();
              }}
            >
              ▶&nbsp;&nbsp;&nbsp;START GAME
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
              ⚙&nbsp;&nbsp;&nbsp;SETTING
            </button>
          </div>

          <p className="ts-ver">v1.0.0 // CYBER_LABYRINTH_SYS</p>
        </div>
      </div>

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
                ⚙ SYSTEM SETTING &amp; CREDITS
              </h2>
              <button
                type="button"
                className="ts-modal-close"
                onClick={() => setIsSettingOpen(false)}
                aria-label="閉じる"
              >
                ✕
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
                    <strong>1. SCAN（スキャン）</strong>：隣接ノードの脆弱性やセキュリティ情報を調査
                  </li>
                  <li>
                    <strong>2. BREACH（侵入）</strong>：権限を奪取し、ネットワーク深層へのルートを開拓
                  </li>
                  <li>
                    <strong>3. EXTRACT（回収）</strong>：警戒度（ALERT）が100%に達する前にコアから機密データを回収
                  </li>
                </ul>
              </div>

              {/* クレジット */}
              <div className="ts-modal-section">
                <div className="ts-section-head">// CREDITS</div>
                <div className="ts-credit-box">
                  <p>TITLE : CYBER LABYRINTH (NULL ROUTE PROJECT)</p>
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
