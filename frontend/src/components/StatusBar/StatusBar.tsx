import {
  MAX_ANALYSIS_RESOURCE,
  RECOVERY_COST,
  RESOURCE_RECOVERY_AMOUNT,
} from '../../game/data/stageData';
import type { DynamicMapInfo } from '../../game/model/types';
import './StatusBar.css';

interface StatusBarProps {
  elapsedSeconds: number;
  alertLevel: number;
  analysisResource: number;
  privilege: string;
  // バックエンドにつながらず Mock で動いているとき true
  offline?: boolean;
  dynamicMap?: DynamicMapInfo;
  canRecover: boolean;
  onRecover: () => void;
  onReset: () => void;
  onSelectMission?: () => void;
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');

  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');

  return `${minutes}:${seconds}`;
}

export function StatusBar({
  elapsedSeconds,
  alertLevel,
  analysisResource,
  privilege,
  offline = false,
  dynamicMap,
  canRecover,
  onRecover,
  onReset,
  onSelectMission,
}: StatusBarProps) {
  const argusStatus = dynamicMap?.enableArgusCounterattack
    ? dynamicMap.argusDisabled
      ? { label: 'ARGUS: DISABLED', color: '#34d399' }
      : alertLevel >= 70
        ? { label: 'ARGUS: COUNTERATTACK (70%+)', color: '#fb7185' }
        : alertLevel >= 40
          ? { label: 'ARGUS: REINFORCED (40%+)', color: '#fbbf24' }
          : { label: 'ARGUS: STANDBY', color: '#67e8f9' }
    : null;

  return (
    <header className="status-bar">
      <div className="status-bar__title">CYBER LABYRINTH</div>

      {dynamicMap && (
        <span
          className="status-bar__offline"
          style={{
            borderColor: dynamicMap.hardcore ? '#f43f5e' : argusStatus?.color ?? '#38bdf8',
            color: dynamicMap.hardcore ? '#fda4af' : argusStatus?.color ?? '#67e8f9',
          }}
          title={`SEED: ${dynamicMap.seed ?? 'N/A'} / ハニーポットとARGUS反撃が有効`}
        >
          {dynamicMap.hardcore ? '☠ HARDCORE' : 'ROGUE'} // {argusStatus?.label ?? ''}
        </span>
      )}

      {offline && (
        <span
          className="status-bar__offline"
          role="status"
          title="バックエンド(localhost:8000)に接続できないため、ブラウザ内のMockで動いています。進行状況はサーバーに保存されません。"
        >
          OFFLINE (Mock)
        </span>
      )}

      <div className="status-bar__item">
        <span className="status-bar__label">TIME</span>
        <span className="status-bar__value">
          {formatTime(elapsedSeconds)}
        </span>
      </div>

      <div className="status-bar__item status-bar__item--grow">
        <span className="status-bar__label">ALERT</span>
        <div className="status-bar__alert-track">
          <div
            className="status-bar__alert-fill"
            style={{ width: `${alertLevel}%` }}
          />
        </div>
        <span className="status-bar__value">
          {Math.round(alertLevel)}%
        </span>
      </div>

      <div className="status-bar__item">
        <span className="status-bar__label">RESOURCE</span>
        <span className="status-bar__value">
          {analysisResource} / {MAX_ANALYSIS_RESOURCE}
        </span>
        <button
          type="button"
          disabled={!canRecover}
          onClick={onRecover}
          title={`RESOURCE +${RESOURCE_RECOVERY_AMOUNT} / TIME +${RECOVERY_COST.time}秒 / ALERT +${RECOVERY_COST.alertDelta}`}
        >
          回復 +{RESOURCE_RECOVERY_AMOUNT}
        </button>
      </div>

      <div className="status-bar__item">
        <span className="status-bar__label">PRIVILEGE</span>
        <span className="status-bar__value">
          {privilege}
        </span>
      </div>

      <div className="status-bar__actions">
        {onSelectMission && (
          <button
            type="button"
            className="status-bar__mission"
            onClick={onSelectMission}
          >
            MISSIONS
          </button>
        )}
        <button
          type="button"
          className="status-bar__reset"
          onClick={onReset}
        >
          RESET
        </button>
      </div>
    </header>
  );
}
