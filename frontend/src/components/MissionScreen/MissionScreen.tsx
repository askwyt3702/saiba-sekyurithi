import './MissionScreen.css';

interface MissionScreenProps {
  onSelectMission: (id: number) => void;
  onBack: () => void;
}

interface MissionItem {
  id: number;
  code: string;
  badge: string;
  title: string;
  description: string;
  targetNode: string;
  nodeCount: string;
  difficultyLabel: string;
  difficultyLevel: number; // 1〜4
  theme: 'cyan' | 'green' | 'amber' | 'locked';
  locked?: boolean;
  actionText: string;
}

const MISSIONS: MissionItem[] = [
  {
    id: 0,
    code: 'STAGE 00 // TRAINING',
    badge: '5 NODES',
    title: '基礎侵入訓練',
    description:
      '5ノードの小規模ネットワークで、スキャン・侵入・データ回収を習得せよ。操作時だけ時間が進むターン制。初期侵入口はE01のみ。',
    targetNode: 'C01 (CORE)',
    nodeCount: '05',
    difficultyLabel: '訓練 / TRAINING',
    difficultyLevel: 1,
    theme: 'cyan',
    actionText: 'START TRAINING',
  },
  {
    id: 1,
    code: 'MISSION 01 // INFILTRATION',
    badge: '24 NODES',
    title: '消えた機密データ',
    description:
      'E01から侵入し、最短・安全・資源回収の方針を選んでC03のデータを回収せよ。回収時も警戒度100%で敗北。',
    targetNode: 'C03 (CORE)',
    nodeCount: '24',
    difficultyLabel: '初級 / NORMAL',
    difficultyLevel: 2,
    theme: 'green',
    actionText: 'LAUNCH MISSION',
  },
  {
    id: 2,
    code: 'MISSION 02 // DEEP TRACE',
    badge: '16 NODES',
    title: '偽装された通信記録',
    description:
      'S2-E01から侵入し、S2-C03で原本通信証跡を回収せよ。監視の追加警戒度+12%とゲート条件を確認し、攻略方針を選べ。',
    targetNode: 'S2-C03 (CORE)',
    nodeCount: '16',
    difficultyLabel: '中〜上級 / HARD',
    difficultyLevel: 3,
    theme: 'amber',
    actionText: 'LAUNCH MISSION',
  },
  {
    id: 3,
    code: 'MISSION 03 // CLASSIFIED',
    badge: 'LOCKED',
    title: '封鎖されたセキュリティコア',
    description:
      'システムの最深部に隠された真実を暴け。現在このセクターへのアクセスルートは暗号化により封鎖されている。',
    targetNode: 'UNKNOWN',
    nodeCount: '??',
    difficultyLabel: '上級 / EXTREME',
    difficultyLevel: 4,
    theme: 'locked',
    locked: true,
    actionText: 'ACCESS DENIED',
  },
];

export function MissionScreen({ onSelectMission, onBack }: MissionScreenProps) {
  return (
    <main className="ms-root" id="missionScreen">
      {/* ゆらゆら動く背景＆グリッド＆スキャンライン */}
      <div className="ms-bg-image" />
      <div className="ms-bg-grid" />
      <div className="ms-scan-beam" />

      <div className="ms-container">
        {/* ヘッダー */}
        <header className="ms-header">
          <div className="ms-brand">
            <span className="ms-brand-cyber">CYBER</span>
            <span className="ms-brand-labyrinth">LABYRINTH</span>
            <span className="ms-brand-divider">//</span>
            <span className="ms-brand-sub">MISSION SELECT</span>
          </div>

          <div className="ms-status">
            <span className="ms-status-dot" />
            <span>SYSTEM ONLINE // DEPTH_SELECT</span>
          </div>
        </header>

        {/* タイトルセクション */}
        <section className="ms-hero">
          <div className="ms-hero-top">
            <p className="ms-section-code">OPERATION CONTROL // 001</p>
            <p className="ms-recommend-tag">
              ✦ 初めてプレイする方は「STAGE 00 基礎侵入訓練」から推奨
            </p>
          </div>
          <h1 className="ms-title">SELECT TARGET SECTOR</h1>
          <p className="ms-subtitle">
            潜入するネットワークセクターを選択してください。各ミッションでターゲットと監視条件が異なります。
          </p>
        </section>

        {/* ホログラム・カードグリッド（案B） */}
        <section className="ms-grid">
          {MISSIONS.map((m, idx) => {
            const isLocked = Boolean(m.locked);
            return (
              <article
                key={m.id}
                style={{ animationDelay: `${idx * 0.09}s` }}
                className={`ms-card ms-card--${m.theme} ${isLocked ? 'is-locked' : ''}`}
                onClick={() => {
                  if (!isLocked) onSelectMission(m.id);
                }}
                role={isLocked ? undefined : 'button'}
                tabIndex={isLocked ? -1 : 0}
                onKeyDown={(e) => {
                  if (!isLocked && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onSelectMission(m.id);
                  }
                }}
              >
                {/* ホバー時に走るホログラム・スキャンライン */}
                <div className="ms-card-scanner" />

                {/* 四隅のコーナーブラケット */}
                <span className="ms-corner ms-corner--tl" />
                <span className="ms-corner ms-corner--tr" />
                <span className="ms-corner ms-corner--bl" />
                <span className="ms-corner ms-corner--br" />

                {/* カード上部：コード＆バッジ */}
                <div className="ms-card-head">
                  <span className="ms-card-code">{m.code}</span>
                  <span className="ms-card-badge">{m.badge}</span>
                </div>

                {/* カード中央：タイトル＆説明文 */}
                <div className="ms-card-body">
                  <h2 className="ms-card-title">{m.title}</h2>
                  <p className="ms-card-desc">{m.description}</p>
                </div>

                {/* メタ情報（ターゲット・難易度バー） */}
                <div className="ms-card-meta">
                  <div className="ms-meta-row">
                    <span className="ms-meta-label">TARGET</span>
                    <span className="ms-meta-val">{m.targetNode}</span>
                  </div>
                  <div className="ms-meta-row">
                    <span className="ms-meta-label">THREAT</span>
                    <div className="ms-diff-wrap">
                      <span className="ms-diff-text">{m.difficultyLabel}</span>
                      <div className="ms-diff-bars">
                        {[1, 2, 3, 4].map((level) => (
                          <span
                            key={level}
                            className={`ms-diff-bar ${
                              level <= m.difficultyLevel ? 'is-active' : ''
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* カード下部：アクションバー */}
                <div className="ms-card-foot">
                  <span className="ms-action-text">
                    {isLocked ? '🔒 ' : '▶ '}
                    {m.actionText}
                  </span>
                  <span className="ms-action-arrow">{isLocked ? '—' : '→'}</span>
                </div>
              </article>
            );
          })}
        </section>

        {/* フッター（タイトルへ戻る） */}
        <footer className="ms-footer">
          <button type="button" className="ms-back-btn" onClick={onBack}>
            <span className="ms-back-arrow">←</span>
            <span>RETURN TO TITLE</span>
          </button>

          <div className="ms-footer-info">
            CYBER_LABYRINTH_OS // SECURE TERMINAL v1.0.0
          </div>
        </footer>
      </div>
    </main>
  );
}
