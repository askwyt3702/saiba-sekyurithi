import type { ActionType, NetworkNode } from '../../game/model/types';
import { isExtractTarget } from '../../game/data/stageData';
import './NodeDetailPanel.css';

type TimedActionType = Exclude<ActionType, 'pause' | 'resume'>;

interface NodeDetailPanelProps {
  node: NetworkNode | null;
  notice: string | null;
  onAction: (type: TimedActionType) => void;
}

export function NodeDetailPanel({ node, notice, onAction }: NodeDetailPanelProps) {
  if (!node) {
    return (
      <aside className="node-detail node-detail--empty">
        マップ上のノードを選択してください。
      </aside>
    );
  }

  const isUnscanned = node.status === 'unscanned';
  const canScan = isUnscanned;
  const canBreach = node.status === 'scanned';
  const canExtract = isExtractTarget(node) && node.status === 'hacked';

  return (
    <aside className="node-detail">
      <h2>{isUnscanned ? '不明ノード' : node.name}</h2>
      <dl className="node-detail__fields">
        <dt>階層</dt>
        <dd>{node.layer}</dd>
        <dt>状態</dt>
        <dd>{node.status}</dd>
        <dt>情報</dt>
        <dd>{isUnscanned ? '-' : node.info ?? '-'}</dd>
        <dt>脆弱性</dt>
        <dd>{node.vulnerability ?? '-'}</dd>
      </dl>
      <div className="node-detail__actions">
        <button type="button" disabled={!canScan} onClick={() => onAction('scan')}>
          スキャン
        </button>
        <button type="button" disabled={!canBreach} onClick={() => onAction('breach')}>
          侵入
        </button>
        <button type="button" disabled={!canExtract} onClick={() => onAction('dataExtract')}>
          データ回収
        </button>
      </div>
      {notice && (
        <p className="node-detail__notice" role="alert">
          {notice}
        </p>
      )}
    </aside>
  );
}
