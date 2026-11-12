import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../../game/model/types';
import { calculateMissionResult, formatMissionTime } from '../../game/model/missionResult';
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
  const result = calculateMissionResult(state);

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
        <p className="mission-result__note">クリア時間・警戒度・残り解析資源による画面専用評価</p>
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
