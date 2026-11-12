import {
  MAX_ANALYSIS_RESOURCE,
  RECOVERY_COST,
  RESOURCE_RECOVERY_AMOUNT,
} from '../../game/data/stageData';
import './StatusBar.css';

interface StatusBarProps {
  elapsedSeconds: number;
  alertLevel: number;
  analysisResource: number;
  privilege: string;
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
  canRecover,
  onRecover,
  onReset,
  onSelectMission,
}: StatusBarProps) {
  return (
    <header className="status-bar">
      <div className="status-bar__title">NULL ROUTE</div>

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
