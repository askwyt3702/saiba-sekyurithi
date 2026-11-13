import './TitleScreen.css';

interface TitleScreenProps {
  onStart: () => void;
}

export function TitleScreen({ onStart }: TitleScreenProps) {
  return (
    <main className="ts-root">
      {/* ゆらゆら動く背景レイヤー */}
      <div className="ts-bg-layer" />

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
            <button id="startButton" className="ts-btn-start" onClick={onStart}>
              ▶&nbsp;&nbsp;&nbsp;START GAME
            </button>
            <button id="settingButton" className="ts-btn-setting">
              ⚙&nbsp;&nbsp;&nbsp;SETTING
            </button>
          </div>

          <p className="ts-ver">v1.0.0 // CYBER_LABYRINTH_SYS</p>
        </div>
      </div>
    </main>
  );
}
