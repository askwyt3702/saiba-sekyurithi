
import type {
  ActionType,
  NetworkNode,
} from '../../game/model/types';
import { balanceConfig } from '../../game/data/balanceConfig';
import './NodeDetailPanel.css';

type TimedActionType = Exclude<ActionType, 'pause' | 'resume'>;

interface NodeDetailPanelProps {
  node: NetworkNode | null;
  nodes: NetworkNode[];
  edges: { source: string; target: string }[];
  analysisResource: number;
  notice: string | null;
  onAction: (type: TimedActionType) => void;
}

export function NodeDetailPanel({
  node,
  nodes,
  edges,
  analysisResource,
  notice,
  onAction,
}: NodeDetailPanelProps) {
  if (!node) {
    return (
      <aside className="node-detail node-detail--empty">
        マップ上のノードを選択してください。
      </aside>
    );
  }

  const isUnscanned = node.status === 'unscanned';

  // 選択中ノードと接続しているノードを取得
  const neighborIds = edges
    .filter((edge) => edge.source === node.id || edge.target === node.id)
    .map((edge) =>
      edge.source === node.id ? edge.target : edge.source
    );

  // 隣接ノードの中に侵入済みノードがあるか
  const hasHackedNeighbor = nodes.some(
    (n) => neighborIds.includes(n.id) && n.status === 'hacked'
  );

  // 通常スキャンはExternal層か、侵入済みノードの隣接先のみ
  const canScan =
    isUnscanned &&
    (node.layer === 'External' || hasHackedNeighbor) &&
    analysisResource >= balanceConfig.scan.resource;

  // リモートスキャンは未スキャンならどこでも可能
  const canRemoteScan =
    isUnscanned &&
    analysisResource >= balanceConfig.remoteScan.resource;

  const canBreach =
    node.status === 'scanned' &&
    analysisResource >= balanceConfig.breach.resource;

  const canExtract =
    node.layer === 'Core' &&
    node.status === 'hacked' &&
    analysisResource >= balanceConfig.dataExtract.resource;

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
        <dd>{isUnscanned ? '-' : node.vulnerability ?? '-'}</dd>
      </dl>

      <div className="node-detail__actions">
        <button
          type="button"
          disabled={!canScan}
          onClick={() => onAction('scan')}
        >
          通常スキャン (R{balanceConfig.scan.resource})
        </button>

        <button
          type="button"
          disabled={!canRemoteScan}
          onClick={() => onAction('remoteScan')}
        >
          リモートスキャン (R{balanceConfig.remoteScan.resource})
        </button>

        <button
          type="button"
          disabled={!canBreach}
          onClick={() => onAction('breach')}
        >
          侵入
        </button>

        <button
          type="button"
          disabled={!canExtract}
          onClick={() => onAction('dataExtract')}
        >
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
