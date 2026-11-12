import { DEFAULT_STAGE_ID, MAX_ANALYSIS_RESOURCE, getStageData, isExtractTarget } from '../../game/data/stageData';
import { canReachNode, canRemoteScanNode } from '../../game/model/actionRules';

import type {
  ActionType,
  NetworkNode,
  ApiNetworkEdge,
  GameStatus,
} from '../../game/model/types';
import { balanceConfig } from '../../game/data/balanceConfig';
import './NodeDetailPanel.css';

type TimedActionType = Exclude<ActionType, 'pause' | 'resume'>;

interface NodeDetailPanelProps {
  node: NetworkNode | null;
  nodes: NetworkNode[];
  edges: ApiNetworkEdge[];
  stageId?: number;
  gameStatus?: GameStatus;
  privilege?: string;
  analysisResource: number;
  notice: string | null;
  onAction: (type: TimedActionType) => void;
}

export function NodeDetailPanel({
  node,
  nodes,
  edges,
  stageId = DEFAULT_STAGE_ID,
  gameStatus = 'playing',
  privilege = 'GUEST',
  analysisResource,
  notice,
  onAction,
}: NodeDetailPanelProps) {
  const stage = getStageData(stageId);
  if (!node) {
    return (
      <aside className="node-detail node-detail--empty">
        {stage.entryNodeIds.join('・')}が初期侵入口です。スキャンして侵入後、隣接ノードへ進んでください。
      </aside>
    );
  }

  const isUnscanned = node.status === 'unscanned';

  const reachable = canReachNode(node.id, nodes, edges, stage);
  const playing = gameStatus === 'playing';
  const effect = stage.nodeEffects[node.id];
  const layers = ['External', 'DMZ', 'Internal', 'Core'];
  const privileges = ['GUEST', 'USER', 'ADMIN', 'ROOT'];

  // 通常スキャンはExternal層か、侵入済みノードの隣接先のみ
  const canScan =
    isUnscanned &&
    playing && reachable &&
    analysisResource >= balanceConfig.scan.resource;

  // リモートスキャンは未スキャンならどこでも可能
  const canRemoteScan =
    isUnscanned &&
    playing && canRemoteScanNode(node.id, nodes, stage) &&
    analysisResource >= balanceConfig.remoteScan.resource;

  const canBreach =
    node.status === 'scanned' &&
    playing && reachable && privileges.indexOf(privilege) >= layers.indexOf(node.layer) &&
    analysisResource >= balanceConfig.breach.resource;

  const canExtract =
    playing && isExtractTarget(node, stageId) &&
    node.status === 'hacked' &&
    analysisResource >= balanceConfig.dataExtract.resource;

  return (
    <aside className="node-detail">
      <h2>{isUnscanned ? '不明ノード' : node.name}</h2>
      {stage.entryNodeIds.includes(node.id) && <p>初期侵入口：{node.id}</p>}

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
      {!isUnscanned && effect && (
        <p>初回侵入効果：資源 {effect.resourceBonus >= 0 ? '+' : ''}{effect.resourceBonus}（上限{MAX_ANALYSIS_RESOURCE}）、警戒度 {effect.alertDelta >= 0 ? '+' : ''}{effect.alertDelta}%</p>
      )}
      {!isUnscanned && stage.keyFragmentNodeIds.includes(node.id) && <p>暗号鍵の断片：2個揃うとデータ回収時の警戒度上昇を無効化します。</p>}
      <p>警戒度100%に到達すると、侵入効果やデータ回収成功より先に敗北します。</p>

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
