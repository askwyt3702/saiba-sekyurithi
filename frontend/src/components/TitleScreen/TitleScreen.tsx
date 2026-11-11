import './TitleScreen.css';

interface TitleScreenProps {
  onStart: () => void;
}

export function TitleScreen({ onStart }: TitleScreenProps) {
  return (
    <main className="title-screen">
      <div className="title-corner-decoration top-left"></div>
      <div className="title-corner-decoration bottom-right"></div>

      <div className="title-content">
        <p className="title-game-label">CYBER MYSTERY PROJECT</p>

        <h1 className="title-game-title">
          NULL <span>ROUTE</span>
        </h1>

        <div className="title-line"></div>

        <p className="title-game-subtitle">CYBER MYSTERY GAME</p>

        <div className="title-menu">
          <button id="startButton" className="title-start-button" onClick={onStart}>
            START GAME
            <span>▶</span>
          </button>

          <button id="settingButton" className="title-setting-button">
            SETTING
          </button>
        </div>

        <p className="title-version">VERSION 1.0.0</p>
      </div>
    </main>
  );
}
