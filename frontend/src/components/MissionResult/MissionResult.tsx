import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../../game/model/types';
import { RESULT_RANK_CONFIG, calculateMissionResult, formatMissionTime } from '../../game/model/missionResult';
import { getSecurityChallenge } from '../../game/data/securityLearningData';
import './MissionResult.css';

interface MissionResultProps {
  state: GameState;
  onRetry: () => Promise<void>;
  onTitle: () => Promise<void>;
}

export function MissionResult({ state, onRetry, onTitle }: MissionResultProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const calculated = calculateMissionResult(state);
  const result = { ...calculated, ...state.evaluation };
  const idsAlertCount = (state.log ?? []).filter((l) => l.message.includes('【IDS検知警告】')).length;
  const reconCount = (state.log ?? []).filter((l) => l.message.includes('INFO_CONFIRMED')).length;
  const accuracyPercent =
    result.hackedNodes + idsAlertCount > 0
      ? Math.round((result.hackedNodes / (result.hackedNodes + idsAlertCount)) * 100)
      : 100;

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
      console.error('[MissionResult] リセットに失敗しました:', err);
      setError('ゲームを開始できませんでした。接続を確認して、もう一度お試しください。');
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <dialog ref={dialogRef} className="mission-result" aria-labelledby="mission-result-title"
      aria-describedby="mission-result-description" onCancel={(event) => event.preventDefault()}>
      <div className="mission-result__content">
        <p className="mission-result__eyebrow">NULL ROUTE / OPERATION REPORT</p>
        <h1 id="mission-result-title">MISSION COMPLETE</h1>
        <p id="mission-result-description">機密データの回収に成功しました</p>
        <div className="mission-result__rank" aria-label={`クリアランク ${result.rank}`}>
          <span>CLEAR RANK</span><strong>{result.rank}</strong>
          <small>SCORE {result.score.toLocaleString('ja-JP')}</small>
        </div>
        <dl className="mission-result__stats">
          <div><dt>クリアまでの経過時間</dt><dd>{formatMissionTime(state.elapsedSeconds)}</dd></div>
          <div><dt>最終警戒度</dt><dd>{state.alertLevel.toFixed(1)}<small>%</small></dd></div>
          <div><dt>残り解析資源</dt><dd>{state.analysisResource}</dd></div>
          <div><dt>最終権限</dt><dd>{state.privilege}</dd></div>
          <div><dt>攻略したノード数（侵入済み）</dt><dd>{result.hackedNodes}<small> / {state.nodes.length}</small></dd></div>
        </dl>
        <p className="mission-result__note">クリア時間・警戒度・残り解析資源による共通評価（資源加点は{RESULT_RANK_CONFIG.resourceBonusCap}まで）</p>

        {/* ペネトレーションテスト診断レポート */}
        <div className="mission-result__report">
          <div className="mission-result__report-head">
            <h2 className="mission-result__report-title">
              <span className="mission-result__report-tag">SECURITY AUDIT</span>
              ペネトレーションテスト診断レポート（悪用された脆弱性と防御提言）
            </h2>
            <div className="mission-result__accuracy-badges">
              <span className={`report-badge ${idsAlertCount === 0 ? 'report-badge--stealth' : 'report-badge--warn'}`}>
                {idsAlertCount === 0
                  ? `✦ PERFECT STEALTH (攻撃選定精度 100% / IDS誤検知 0回)`
                  : `攻撃選定精度 ${accuracyPercent}% (IDS誤検知 ${idsAlertCount}回)`}
              </span>
              <span className="report-badge report-badge--attck">
                事前調査実施: {reconCount}ノード
              </span>
            </div>
          </div>
          <div className="mission-result__report-list">
            {state.nodes
              .filter((n) => n.status === 'hacked')
              .map((n) => {
                const ch = getSecurityChallenge(n.id, n.vulnerability, n.info);
                return (
                  <div key={n.id} className="mission-result__report-item">
                    <div className="mission-result__report-item-head">
                      <span className="mission-result__report-node-id">{n.id}</span>
                      <span className="mission-result__report-node-name">{n.name || n.id}</span>
                      {ch.mitreId && (
                        <span className="report-badge report-badge--attck">ATT&CK: {ch.mitreId}</span>
                      )}
                      {ch.cweId && <span className="report-badge report-badge--cwe">{ch.cweId}</span>}
                    </div>
                    <div className="mission-result__report-item-vuln">
                      <strong>脆弱性:</strong> {n.vulnerability || ch.category}
                    </div>
                    <div className="mission-result__report-item-defense">
                      {ch.defenseMeasure}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {error && <p className="mission-result__error" role="alert">{error}</p>}
        <div className="mission-result__actions" aria-busy={pending}>
          <button type="button" disabled={pending} onClick={() => void navigate(onRetry)}>RETRY</button>
          <button type="button" disabled={pending} onClick={() => void navigate(onTitle)}>TITLE</button>
        </div>
        {pending && <p role="status">次の作戦を準備中...</p>}
      </div>
    </dialog>
  );
}
