import { useEffect, useState } from 'react';
import { DEFAULT_STAGE_ID, MAX_ANALYSIS_RESOURCE, getStageData, isExtractTarget } from '../../game/data/stageData';
import { canReachNode, canRemoteScanNode } from '../../game/model/actionRules';

import type {
  ActionType,
  NetworkNode,
  ApiNetworkEdge,
  GameStatus,
  KeyFragments,
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
  keyFragments?: KeyFragments;
  analysisResource: number;
  notice: string | null;
  onAction: (type: TimedActionType, passcode?: string) => void;
}

export function NodeDetailPanel({
  node,
  nodes,
  edges,
  stageId = DEFAULT_STAGE_ID,
  gameStatus = 'playing',
  privilege = 'GUEST',
  keyFragments,
  analysisResource,
  notice,
  onAction,
}: NodeDetailPanelProps) {
  const [passcode, setPasscode] = useState('');

  useEffect(() => {
    setPasscode('');
  }, [node?.id, stageId]);

  if (!node) {
    return (
      <aside className="node-detail node-detail--empty">
        {stageId === 1 ? 'E01が唯一の初期侵入口です。スキャンして侵入後、隣接ノードへ進んでください。' : '訓練の公開サーバーを選択してスキャンしてください。本編の初期侵入口はE01のみです。'}
      </aside>
    );
  }

  const isUnscanned = node.status === 'unscanned';

  const stage = getStageData(stageId);
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

  const showPasscodeInput =
    stage.keyFragmentNodeIds.length > 0 &&
    isExtractTarget(node, stageId) &&
    node.status !== 'hacked';

  const fragA = keyFragments?.a ?? null;
  const fragB = keyFragments?.b ?? null;

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
      {stage.keyFragmentNodeIds.length > 0 && (
        <div className="node-detail__cipher-box">
          <div className="node-detail__cipher-title">暗号鍵の断片（A+Bで隠密侵入）</div>
          <div className="node-detail__cipher-fragments">
            <span>断片A: <strong>{fragA ?? '未入手'}</strong></span>
            <span>断片B: <strong>{fragB ?? '未入手'}</strong></span>
          </div>
          {showPasscodeInput && (
            <label className="node-detail__cipher-input-label">
              <span>最終目標 暗号キー入力（任意）</span>
              <input
                type="text"
                className="node-detail__cipher-input"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="断片A+Bを入力（空欄で強行突破）"
                disabled={!canBreach}
              />
            </label>
          )}
        </div>
      )}
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
          onClick={() => onAction('breach', showPasscodeInput ? passcode : undefined)}
        >
          {showPasscodeInput && passcode.trim() !== '' ? '暗号キーで隠密侵入' : '侵入'}
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
