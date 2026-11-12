import { useEffect, useState } from 'react';
import { DEFAULT_STAGE_ID, MAX_ANALYSIS_RESOURCE, getStageData, isExtractTarget } from '../../game/data/stageData';
import { canReachNode, canRemoteScanNode, isMonitoringActive, missingGateRequirements, monitoringExtra } from '../../game/model/actionRules';

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
  alertLevel?: number;
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
  alertLevel = 0,
  notice,
  onAction,
}: NodeDetailPanelProps) {
  const stage = getStageData(stageId);
  const [passcode, setPasscode] = useState('');
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  useEffect(() => {
    setPasscode('');
  }, [node?.id, stageId]);

  useEffect(() => {
    if (!isInfoOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsInfoOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isInfoOpen]);

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
  const required = stage.breachRequirements[node.id];
  const missing = missingGateRequirements(node.id, nodes, stage);
  const locked = node.status !== 'hacked' && missing.length > 0;
  const monitor = stage.conditionalBreachAlert;
  const monitored = monitor?.targetNodeIds.includes(node.id);
  const extraAlert = monitoringExtra(node.id, nodes, stage);
  const decay = balanceConfig.alertDecayPerSecond * balanceConfig.breach.time;
  const breachAlertChange = balanceConfig.breach.alertDelta + extraAlert - decay;
  const detectionAlert = Math.max(0, Math.min(100, alertLevel + breachAlertChange));
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
    !locked &&
    playing && reachable && privileges.indexOf(privilege) >= layers.indexOf(node.layer) &&
    analysisResource >= balanceConfig.breach.resource;

  const hasAllKeyFragments =
    stage.keyFragmentNodeIds.length > 0 &&
    stage.keyFragmentNodeIds.every((id) =>
      nodes.some((n) => n.id === id && n.status === 'hacked')
    );

  const extractResourceCost =
    hasAllKeyFragments &&
    (Boolean(keyFragments?.unlocked) || analysisResource < balanceConfig.dataExtract.resource)
      ? 0
      : balanceConfig.dataExtract.resource;

  const canExtract =
    playing && isExtractTarget(node, stageId) &&
    node.status === 'hacked' &&
    analysisResource >= extractResourceCost;

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
      {monitored && monitor && (
        <section className="node-detail__mechanics" aria-label="監視情報">
          <p><strong>{isMonitoringActive(nodes, stage) ? '監視対象：追加警戒度あり' : '監視解除済み：追加警戒度なし'}</strong></p>
          <p>侵入時の追加警戒度：+{extraAlert}% ／ 解除条件：{monitor.disabledByNodeId}攻略</p>
          <p>基本+{balanceConfig.breach.alertDelta}% ＋ 監視{extraAlert}% − 自然減衰{decay}% ＝ +{breachAlertChange}%</p>
          {node.status !== 'hacked' && <p>侵入時の予測警戒度（ノード効果前）：{detectionAlert.toFixed(2)}%
            {detectionAlert >= 100 ? ' — 検知され敗北します' : ''}</p>}
        </section>
      )}
      {required && (
        <section className="node-detail__mechanics" aria-label="ゲート条件">
          <p><strong>ゲート：{node.status === 'hacked' ? '攻略済み' : locked ? 'ロック中' : '解除済み'}</strong></p>
          <p>侵入条件：{required.join('・')}を攻略</p>
          {locked && <p>未達成：{missing.join('・')}。スキャンは通常のルールで可能です。</p>}
        </section>
      )}

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
          {showPasscodeInput && passcode.trim() !== ''
            ? `暗号キーで隠密侵入 (R${balanceConfig.breach.resource})`
            : `侵入 (R${balanceConfig.breach.resource})`}
        </button>

        <button
          type="button"
          disabled={!canExtract}
          onClick={() => onAction('dataExtract')}
        >
          データ回収 (R{extractResourceCost})
        </button>

        <button
          type="button"
          className="node-detail__info-button"
          onClick={() => setIsInfoOpen(true)}
        >
          情報確認
        </button>
      </div>

      {isInfoOpen && (
        <div
          className="node-info-modal__backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="node-info-modal-title"
          onClick={() => setIsInfoOpen(false)}
        >
          <div
            className="node-info-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="node-info-modal__header">
              <div>
                <div className="node-info-modal__eyebrow">
                  NODE INTELLIGENCE // {node.id}
                </div>
                <h3 id="node-info-modal-title" className="node-info-modal__title">
                  {isUnscanned ? '不明ノード' : node.name}
                </h3>
              </div>
              <button
                type="button"
                className="node-info-modal__close"
                aria-label="閉じる"
                onClick={() => setIsInfoOpen(false)}
              >
                ×
              </button>
            </header>

            <div className="node-info-modal__badges">
              <span className="node-info-modal__badge">
                階層: {node.layer}（必要権限: {privileges[layers.indexOf(node.layer)] ?? 'GUEST'}）
              </span>
              <span className={`node-info-modal__badge node-info-modal__badge--${node.status}`}>
                状態: {node.status === 'hacked' ? 'HACKED (侵入済み)' : node.status === 'scanned' ? 'SCANNED (スキャン済み)' : 'UNKNOWN (未スキャン)'}
              </span>
              {stage.entryNodeIds.includes(node.id) && (
                <span className="node-info-modal__badge node-info-modal__badge--highlight">
                  初期侵入口
                </span>
              )}
              {isExtractTarget(node, stageId) && (
                <span className="node-info-modal__badge node-info-modal__badge--target">
                  最終目標（データ回収対象）
                </span>
              )}
            </div>

            <div className="node-info-modal__body">
              <section className="node-info-modal__section">
                <h4>詳細情報 (INFO)</h4>
                <p className="node-info-modal__text">
                  {isUnscanned
                    ? '未スキャン（スキャンを実行するとノードの詳細情報が開示されます）'
                    : node.info ?? '詳細情報なし'}
                </p>
              </section>

              <section className="node-info-modal__section">
                <h4>脆弱性 (VULNERABILITY)</h4>
                <p className="node-info-modal__code">
                  {isUnscanned
                    ? '未スキャン（スキャンを実行すると脆弱性情報が開示されます）'
                    : node.vulnerability ?? '検出された脆弱性なし'}
                </p>
              </section>

              {(!isUnscanned && effect) || (monitored && monitor) || required ? (
                <section className="node-info-modal__section">
                  <h4>ギミック・侵入効果 (MECHANICS &amp; EFFECTS)</h4>
                  {!isUnscanned && effect && (
                    <div className="node-info-modal__item">
                      <strong>初回侵入効果：</strong>
                      資源 {effect.resourceBonus >= 0 ? '+' : ''}{effect.resourceBonus}（上限{MAX_ANALYSIS_RESOURCE}） ／ 警戒度 {effect.alertDelta >= 0 ? '+' : ''}{effect.alertDelta}%
                    </div>
                  )}
                  {monitored && monitor && (
                    <div className="node-info-modal__item">
                      <strong>{isMonitoringActive(nodes, stage) ? '監視対象（有効）' : '監視対象（解除済み）'}：</strong>
                      侵入時の追加警戒度 +{extraAlert}%（解除条件：{monitor.disabledByNodeId}攻略）
                      {node.status !== 'hacked' && (
                        <div>
                          侵入時の予測警戒度：{detectionAlert.toFixed(2)}%
                          {detectionAlert >= 100 ? '（検知され敗北します）' : ''}
                        </div>
                      )}
                    </div>
                  )}
                  {required && (
                    <div className="node-info-modal__item">
                      <strong>ゲート条件（{node.status === 'hacked' ? '攻略済み' : locked ? 'ロック中' : '解除済み'}）：</strong>
                      侵入には {required.join('・')} の攻略が必要
                      {locked && <div>未達成：{missing.join('・')}</div>}
                    </div>
                  )}
                </section>
              ) : null}

              {stage.keyFragmentNodeIds.length > 0 && (
                <section className="node-info-modal__section">
                  <h4>暗号鍵の断片 (CIPHER FRAGMENTS)</h4>
                  <div className="node-info-modal__cipher-grid">
                    <div>断片A: <strong>{fragA ?? '未入手'}</strong></div>
                    <div>断片B: <strong>{fragB ?? '未入手'}</strong></div>
                    <div className="node-info-modal__cipher-combined">
                      結合暗号キー: <strong>{fragA && fragB ? `${fragA}${fragB}` : '未完成（A・B両方を入手してください）'}</strong>
                    </div>
                  </div>
                </section>
              )}
            </div>

            <footer className="node-info-modal__footer">
              <button
                type="button"
                className="node-info-modal__close-btn"
                onClick={() => setIsInfoOpen(false)}
              >
                閉じる
              </button>
            </footer>
          </div>
        </div>
      )}

      {playing &&
        isExtractTarget(node, stageId) &&
        node.status === 'hacked' &&
        analysisResource < extractResourceCost && (
          <p className="node-detail__notice" role="status">
            データ回収には解析資源が {extractResourceCost} 必要です（現在: {analysisResource}）。上部の「回復 +5」または補給ノードから資源を確保してください。
          </p>
        )}

      {notice && (
        <p className="node-detail__notice" role="alert">
          {notice}
        </p>
      )}
    </aside>
  );
}
