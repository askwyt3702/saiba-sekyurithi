import './MissionScreen.css';

interface MissionScreenProps {
  onSelectMission: (id: number) => void;
  onBack: () => void;
}

interface MissionItem {
  id: number;
  code: string;
  badge: string;
  hazardTag: string;
  title: string;
  description: string;
  targetNode: string;
  idsStatus: string;
  difficultyLabel: string;
  difficultyLevel: number; // 1〜4
  theme: 'cyan' | 'green' | 'amber' | 'locked';
  locked?: boolean;
  actionText: string;
}

const MISSIONS: MissionItem[] = [
  {
    id: 0,
    code: 'SECTOR 00 // SANDBOX',
    badge: '5 NODES',
    hazardTag: 'TRACE: ISOLATED',
    title: '基礎侵入訓練',
    description:
      '5ノードの隔離ネットワークで、スキャン・情報確認・問題回答・侵入・データ回収を習得せよ。操作時だけ時間が進むターン制。初期侵入口はexternal-1のみ。',
    targetNode: 'core-1 (CORE)',
    idsStatus: 'PASSIVE (訓練用監視)',
    difficultyLabel: '訓練 / LOW RISK',
    difficultyLevel: 1,
    theme: 'cyan',
    actionText: 'BREACH SECTOR',
  },
  {
    id: 1,
    code: 'SECTOR 01 // INFILTRATION',
    badge: '24 NODES',
    hazardTag: 'ALERT 100% = TERMINATED',
    title: '消えた機密データ',
    description:
      'E01から侵入し、最短・安全・資源回収の方針を選んでC03のデータを回収せよ。回収時も警戒度100%に達した瞬間、逆探知され敗北となる。',
    targetNode: 'C03 (CORE)',
    idsStatus: 'ACTIVE (100%で即遮断)',
    difficultyLabel: '初級 / MONITORED',
    difficultyLevel: 2,
    theme: 'green',
    actionText: 'EXECUTE BREACH',
  },
  {
    id: 2,
    code: 'SECTOR 02 // DEEP TRACE',
    badge: '16 NODES',
    hazardTag: 'TRAP: ALERT +12% SPIKE',
    title: '偽装された通信記録',
    description:
      'S2-E01から侵入し、S2-C03で原本通信証跡を回収せよ。監視の追加警戒度+12%トラップとゲート条件が侵入者を追い詰める。',
    targetNode: 'S2-C03 (CORE)',
    idsStatus: 'HOSTILE (監視トラップ稼働)',
    difficultyLabel: '中〜上級 / DANGER',
    difficultyLevel: 3,
    theme: 'amber',
    actionText: 'EXECUTE BREACH',
  },
  {
    id: 3,
    code: 'SECTOR 03 // BLACK CORE',
    badge: 'SEALED',
    hazardTag: 'LETHAL COUNTERMEASURE',
    title: '封鎖されたセキュリティコア',
    description:
      'システムの最深部に隠された真実を暴け。現在このセクターは防衛AIによって完全封鎖されており、アクセスルートは遮断されている。',
    targetNode: '0xDEAD_CORE',
    idsStatus: 'LOCKED (防衛機構ロック中)',
    difficultyLabel: '上級 / FATAL',
    difficultyLevel: 4,
    theme: 'locked',
    locked: true,
    actionText: 'CONNECTION BLOCKED',
  },
];

export function MissionScreen({ onSelectMission, onBack }: MissionScreenProps) {
  return (
    <main className="ms-root" id="missionScreen">
      {/* 軽量化した背景オーバーレイ（1枚に統合）＋スキャンレーザー1本 */}
      <div className="ms-bg-overlay" />
      <div className="ms-scan-beam" />

      <div className="ms-container">
        {/* ヘッダー */}
        <header className="ms-header">
          <div className="ms-brand">
            <span className="ms-brand-cyber">CYBER</span>
            <span className="ms-brand-labyrinth">LABYRINTH</span>
            <span className="ms-brand-divider">//</span>
            <span className="ms-brand-sub">BACKDOOR_TERMINAL</span>
          </div>

          <div className="ms-status">
            <span className="ms-status-dot" />
            <span>STEALTH LINK: ACTIVE // IDS EVADING</span>
          </div>
        </header>

        {/* タイトルセクション */}
        <section className="ms-hero">
          <div className="ms-hero-top">
            <p className="ms-section-code">
              &gt; TARGET_SECTOR_LIST // ENCRYPTED_NODES_DETECTED
            </p>
            <p className="ms-recommend-tag">
              ✦ 初回潜入時は「SECTOR 00 基礎侵入訓練」での事前シミュレーションを推奨
            </p>
          </div>
          <h1 className="ms-title">SELECT BREACH TARGET</h1>
          <p className="ms-subtitle">
            侵入するターゲットセクターを選択せよ。各セクターには監視網（IDS）が張られており、警戒度が限界に達すれば逆探知される。
          </p>
        </section>

        {/* ホログラム・カードグリッド（案B・ダーク侵入仕様） */}
        <section className="ms-grid">
          {MISSIONS.map((m, idx) => {
            const isLocked = Boolean(m.locked);
            return (
              <article
                key={m.id}
                style={{ animationDelay: `${idx * 0.08}s` }}
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
                {/* ホバー時に走るスキャンレーザー */}
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

                {/* 危険度・監視タグ */}
                <div className="ms-hazard-strip">
                  <span className="ms-hazard-dot" />
                  <span>{m.hazardTag}</span>
                </div>

                {/* カード中央：タイトル＆説明文 */}
                <div className="ms-card-body">
                  <h2 className="ms-card-title">{m.title}</h2>
                  <p className="ms-card-desc">{m.description}</p>
                </div>

                {/* メタ情報（ターゲット・IDS監視状態・危険度バー） */}
                <div className="ms-card-meta">
                  <div className="ms-meta-row">
                    <span className="ms-meta-label">TARGET</span>
                    <span className="ms-meta-val">{m.targetNode}</span>
                  </div>
                  <div className="ms-meta-row">
                    <span className="ms-meta-label">IDS_SYS</span>
                    <span className="ms-meta-ids">{m.idsStatus}</span>
                  </div>
                  <div className="ms-meta-row">
                    <span className="ms-meta-label">DANGER</span>
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
                  <span className="ms-action-arrow">{isLocked ? '×' : '→'}</span>
                </div>
              </article>
            );
          })}
        </section>

        {/* フッター（タイトルへ戻る） */}
        <footer className="ms-footer">
          <button type="button" className="ms-back-btn" onClick={onBack}>
            <span className="ms-back-arrow">←</span>
            <span>DISCONNECT (タイトルへ戻る)</span>
          </button>

          <div className="ms-footer-info">
            ENCRYPTED TUNNEL: ACTIVE // PACKET_LOSS: 0.02% // NO LOGS SAVED
          </div>
        </footer>
      </div>
    </main>
  );
}
