import './MissionScreen.css';

interface MissionScreenProps {
  onSelectMission: (id: number) => void;
  onBack: () => void;
}

export function MissionScreen({ onSelectMission, onBack }: MissionScreenProps) {
  return (
    <main className="mission-screen" id="missionScreen">
      <header className="mission-header">
        <div className="mission-header-logo">NULL ROUTE</div>
        <div className="mission-header-label">ミッション選択</div>
      </header>

      <section className="mission-content">
        <p className="mission-section-label">作戦管理 / 001</p>

        <h1>ミッション選択</h1>

        <p className="mission-description">
          調査するミッションを選択してください。初めてプレイする方はチュートリアルから始めるのがおすすめです。
        </p>

        <div className="mission-list">
          <div className="mission-card" onClick={() => onSelectMission(0)}>
            <div className="mission-number">チュートリアル / TRAINING</div>
            <h2>基礎侵入訓練</h2>
            <p>5ノードの小規模ネットワークで、スキャン・侵入・データ回収を習得せよ。操作時だけ時間が進むターン制。本編の初期侵入口はE01のみ。</p>
            <div className="mission-bottom">
              <span>訓練 (5ノード)</span>
              <span>選択可能 →</span>
            </div>
          </div>

          <div className="mission-card" onClick={() => onSelectMission(1)}>
            <div className="mission-number">ミッション 01</div>
            <h2>消えた機密データ</h2>
            <p>E01から侵入し、最短・安全・資源回収の方針を選んでC03のデータを回収せよ。回収時も警戒度100%で敗北。</p>
            <div className="mission-bottom">
              <span>初級 (24ノード)</span>
              <span>選択可能 →</span>
            </div>
          </div>

          <div className="mission-card locked">
            <div className="mission-number">ミッション 02</div>
            <h2>偽装された通信記録</h2>
            <p>通信ログに隠された異常を発見せよ。</p>
            <div className="mission-bottom">
              <span>中級</span>
              <span>未解放</span>
            </div>
          </div>

          <div className="mission-card locked">
            <div className="mission-number">ミッション 03</div>
            <h2>封鎖されたセキュリティコア</h2>
            <p>システムの最深部に隠された真実を暴け。</p>
            <div className="mission-bottom">
              <span>上級</span>
              <span>未解放</span>
            </div>
          </div>
        </div>

        <button className="mission-back-button" onClick={onBack}>
          ← タイトルに戻る
        </button>
      </section>
    </main>
  );
}
