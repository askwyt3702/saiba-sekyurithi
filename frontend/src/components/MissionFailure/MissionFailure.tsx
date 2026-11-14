import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../../game/model/types';
import { formatMissionTime } from '../../game/model/missionResult';
import './MissionFailure.css';

interface MissionFailureProps {
  state: GameState;
  onRetry: () => Promise<void>;
  onTitle: () => Promise<void>;
}

export function MissionFailure({ state, onRetry, onTitle }: MissionFailureProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const navigate = async (action: () => Promise<void>) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      console.error('[MissionFailure] リセットに失敗しました:', err);
      setError('作戦を再開できませんでした。接続を確認して、もう一度お試しください。');
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const isAlertThreshold = state.alertLevel >= 100;
  const hackedCount = state.nodes.filter((n) => n.status === 'hacked').length;
  const idsAlertCount = (state.log ?? []).filter((l) => l.message.includes('【IDS検知警告】')).length;

  // 直近の警告・危険ログまたは最新ログを抽出
  const recentIncidentLogs = (state.log ?? [])
    .filter((l) => l.severity === 'danger' || l.severity === 'warning' || l.message.includes('検知') || l.message.includes('失敗'))
    .slice(-4);

  return (
    <dialog
      ref={dialogRef}
      className="mission-failure"
      aria-labelledby="mission-failure-title"
      aria-describedby="mission-failure-description"
      onCancel={(event) => event.preventDefault()}
    >
      <div className="mission-failure__content">
        <p className="mission-failure__eyebrow">CYBER LABYRINTH // INCIDENT RESPONSE DEBRIEFING</p>
        <h1 id="mission-failure-title">OPERATION FAILED</h1>
        <p id="mission-failure-description">
          監視センター（SOC）により攻撃が検知・遮断されました
        </p>

        {/* 根本原因（Root Cause Analysis） */}
        <div className="mission-failure__cause-box">
          <div className="mission-failure__cause-head">
            <span className="mission-failure__cause-badge">
              {isAlertThreshold ? 'CRITICAL DETECTED' : 'RESOURCE EXHAUSTED'}
            </span>
            <span className="mission-failure__cause-name">
              {isAlertThreshold
                ? '警戒度上限（100%）到達によるSOC緊急遮断'
                : '解析資源枯渇によるC2セッション強制破棄'}
            </span>
          </div>
          <p className="mission-failure__cause-text">
            {isAlertThreshold
              ? '不正なエクスプロイトの連続試行、または常時監視対象ノードへの無防備なアクセスにより、SOC（セキュリティ監視センター）のSIEMが重大インシデントを発報。C2通信が遮断され、対象ホストから完全隔離されました。'
              : '暗号解析・ペイロード生成に必要な計算リソースが枯渇しました。これ以上の作戦継続は不可能と判断し、エージェントは緊急撤退しました。'}
          </p>
          {isAlertThreshold && (
            <div className="mission-failure__cause-mitre">
              <span className="report-badge report-badge--attck">ATT&CK: T1190 (Exploit Public-Facing App)</span>
              <span className="report-badge report-badge--cwe">CWE-398 (Indicator of Attack)</span>
              <span className="report-badge report-badge--cwe">IDS誤検知回数: {idsAlertCount}回</span>
            </div>
          )}
        </div>

        {/* インシデントログ（検知タイムライン） */}
        {recentIncidentLogs.length > 0 && (
          <div className="mission-failure__section">
            <h2 className="mission-failure__section-title">
              <span className="mission-failure__section-tag">INCIDENT LOGS</span>
              直近の検知・警告タイムライン
            </h2>
            <div className="mission-failure__log-list">
              {recentIncidentLogs.map((log, idx) => (
                <div key={idx} className={`mission-failure__log-item mission-failure__log-item--${log.severity}`}>
                  <span className="mission-failure__log-severity">{log.severity.toUpperCase()}</span>
                  <span className="mission-failure__log-msg">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ペンテスト振り返り・推奨作戦提言 */}
        <div className="mission-failure__section">
          <h2 className="mission-failure__section-title">
            <span className="mission-failure__section-tag">TACTICAL ADVICE</span>
            次回作戦への戦術提言（ペネトレーションテスト診断）
          </h2>
          <div className="mission-failure__advice-grid">
            <div className="mission-failure__advice-card">
              <strong>① スキャンによる事前偵察の徹底</strong>
              <p>当てずっぽうの攻撃はIDSに即座に検知されます。必ず「通常スキャン」を行い、開放ポートやサービス情報に合致するエクスプロイトを選択してください。</p>
            </div>
            <div className="mission-failure__advice-card">
              <strong>② 【痕跡消去】ノードの活用</strong>
              <p>警戒度が上がってきたら、マップ上で青く光る【痕跡消去】ノード（I03 / S2-I05 / D06 等）を優先攻略して警戒度を下げてください。</p>
            </div>
            <div className="mission-failure__advice-card">
              <strong>③ 資源マネジメント</strong>
              <p>資源が枯渇しそうな場合は、緑に光る【資源補給】ノード（I05 / S2-I03 等）を攻略するか、画面上部の「RESOURCE回復」を活用してください。</p>
            </div>
          </div>
        </div>

        {/* 作戦スタッツ */}
        <dl className="mission-failure__stats">
          <div><dt>作戦継続時間</dt><dd>{formatMissionTime(state.elapsedSeconds)}</dd></div>
          <div><dt>最終警戒度</dt><dd className="stat-danger">{state.alertLevel.toFixed(1)}<small>%</small></dd></div>
          <div><dt>残り解析資源</dt><dd>{state.analysisResource}</dd></div>
          <div><dt>到達権限</dt><dd>{state.privilege}</dd></div>
          <div><dt>攻略済みノード</dt><dd>{hackedCount}<small> / {state.nodes.length}</small></dd></div>
        </dl>

        {error && <p className="mission-failure__error" role="alert">{error}</p>}

        <div className="mission-failure__actions" aria-busy={pending}>
          <button type="button" className="btn-retry" disabled={pending} onClick={() => void navigate(onRetry)}>
            RETRY 作戦再開
          </button>
          <button type="button" className="btn-title" disabled={pending} onClick={() => void navigate(onTitle)}>
            TITLE タイトル
          </button>
        </div>
        {pending && <p role="status" className="mission-failure__pending">次の作戦を準備中...</p>}
      </div>
    </dialog>
  );
}
