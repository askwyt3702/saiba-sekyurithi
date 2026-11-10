import type { ActionType, NetworkNode } from '../../game/model/types';
import './NodeDetailPanel.css';

type TimedActionType = Exclude<ActionType, 'pause' | 'resume'>;

interface NodeDetailPanelProps {
  node: NetworkNode | null;
  pending: boolean;
  onAction: (type: TimedActionType) => void;
}

export function NodeDetailPanel({ node, pending, onAction }: NodeDetailPanelProps) {
  if (!node) {
    return (
      <aside className="node-detail node-detail--empty">
        マップ上のノードを選択してください。
      </aside>
    );
  }

  const isUnscanned = node.status === 'unscanned';
  const canScan = !pending && isUnscanned;
  const canBreach = !pending && node.status === 'scanned';
  const canExtract = !pending && node.layer === 'Core' && node.status === 'hacked';

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
      {pending && <p className="node-detail__pending">処理中...</p>}
    </aside>
  );
}
