import { useEffect, useRef, useState } from 'react';
import { DEFAULT_STAGE_ID, MAX_ANALYSIS_RESOURCE, SECURITY_RULES, getStageData, isExtractTarget } from '../../game/data/stageData';
import type { SecurityRule } from '../../game/model/mapDefinition';
import { securityRequirementsMet } from '../../game/model/actionRules';
import { getSecurityChallenge } from '../../game/data/securityLearningData';
import { canReachNode, canRemoteScanNode, isMonitoringActive, missingGateRequirements, monitoringExtra } from '../../game/model/actionRules';

import type {
  ActionType,
  ActionResult,
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
  securityEvents?: Record<string, string[]>;
  notice: string | null;
  onAction: (
    type: TimedActionType,
    passcode?: string,
    exploitMismatch?: boolean,
    exploitId?: string,
    questionId?: string,
  ) => void | Promise<ActionResult | void>;
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
  securityEvents = {},
  notice,
  onAction,
}: NodeDetailPanelProps) {
  const stage = getStageData(stageId);
  const [passcode, setPasscode] = useState('');
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isExploitOpen, setIsExploitOpen] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedExploitId, setSelectedExploitId] = useState<string | null>(null);
  const [penalizedChoiceIds, setPenalizedChoiceIds] = useState<string[]>([]);
  const answerPending = useRef(false);

  useEffect(() => {
    setPasscode('');
    setIsExploitOpen(false);
    setQuestionIndex(0);
    setSelectedExploitId(null);
    setPenalizedChoiceIds([]);
  }, [node?.id, stageId]);

  useEffect(() => {
    if (gameStatus !== 'playing') {
      setIsExploitOpen(false);
    }
  }, [gameStatus]);

  useEffect(() => {
    if (!isInfoOpen && !isExploitOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsInfoOpen(false);
        setIsExploitOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isInfoOpen, isExploitOpen]);

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
  const securityRule = (SECURITY_RULES as Record<string, SecurityRule>)[node.id];
  const confirmed = securityEvents[node.id]?.includes('INFO_CONFIRMED') ?? false;
  const analyzed = securityEvents[node.id]?.includes('ANALYSIS_COMPLETED') ?? false;
  const securityReady = securityRequirementsMet(securityRule, securityEvents[node.id]);
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
    (securityRule?.allowed_scan_types?.includes('scan') ?? true) &&
    isUnscanned &&
    playing && reachable &&
    analysisResource >= balanceConfig.scan.resource;

  // リモートスキャンは未スキャンならどこでも可能
  const canRemoteScan =
    (securityRule?.allowed_scan_types?.includes('remoteScan') ?? true) &&
    isUnscanned &&
    playing && canRemoteScanNode(node.id, nodes, stage) &&
    analysisResource >= balanceConfig.remoteScan.resource;

  const canBreach =
    node.status === 'scanned' &&
    !locked &&
    !(securityRule?.failure_mode === 'reject' && !securityReady) &&
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
  const challenge = getSecurityChallenge(node.id, node.vulnerability, node.info);
  const currentQuestion =
    challenge.questions[questionIndex % challenge.questions.length] ?? challenge.questions[0];
  const selectedChoice =
    currentQuestion.choices.find((c) => c.id === selectedExploitId) ?? null;
  const wrongAlert = securityRule?.exploit_failure_alert ?? 8;
  const wrongResource = securityRule?.failure_resource ?? 0;

  const handleSelectExploitChoice = async (choiceId: string, isCorrect: boolean) => {
    if (!canBreach || answerPending.current) return;
    if (!isCorrect && securityRule?.correct_exploits?.length && !securityReady) return;
    if (isCorrect || penalizedChoiceIds.includes(choiceId)) {
      setSelectedExploitId(choiceId);
      return;
    }
    answerPending.current = true;
    try {
      const result = await onAction('breach', undefined, true, choiceId, currentQuestion.id);
      if (result && result.accepted) {
        setPenalizedChoiceIds((prev) => [...prev, choiceId]);
        setSelectedExploitId(choiceId);
      } else setSelectedExploitId(null);
    } finally {
      answerPending.current = false;
    }
  };

  return (
    <aside className="node-detail">
      <h2>{isUnscanned ? '不明ノード' : node.name}</h2>
      {stage.entryNodeIds.includes(node.id) && <p>初期侵入口：{node.id}</p>}
      {securityRule && node.status !== 'hacked' && (
        <section className="node-detail__mechanics" aria-label="侵入前の確認条件">
          {securityRule.allowed_scan_types?.length === 1 && securityRule.allowed_scan_types[0] === 'scan' && <p>このノードは通常スキャンのみ使用できます。</p>}
          <p>情報確認：{confirmed ? '完了' : '未完了'}{securityRule.required_analysis && ` ／ 解析：${analyzed ? '完了' : '未完了'}`}</p>
          {!securityReady && <p role="status">{securityRule.failure_mode === 'consume'
            ? `条件未達で侵入を実行すると、資源${balanceConfig.breach.resource}・${balanceConfig.breach.time}秒・警戒度実増${securityRule.failure_alert - balanceConfig.alertDecayPerSecond * balanceConfig.breach.time}%を消費し、侵入は未完了になります。`
            : '情報未確認の侵入は無消費で拒否されます。情報確認を完了してください。'}</p>}
          <p>情報確認ボタンから説明を読み、確認操作を完了してください。</p>
        </section>
      )}
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
          onClick={() => {
            setSelectedExploitId(null);
            setIsExploitOpen(true);
          }}
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
          onClick={() => {
            setIsInfoOpen(true);
          }}
        >
          情報確認
        </button>
      </div>

      {isExploitOpen && (
        <div
          className="node-info-modal__backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exploit-modal-title"
          onClick={() => setIsExploitOpen(false)}
        >
          <div
            className="node-info-modal exploit-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="node-info-modal__header exploit-modal__header">
              <div>
                <div className="node-info-modal__eyebrow">
                  EXPLOIT TERMINAL // root@null-route:~# target {node.id}
                </div>
                <h3 id="exploit-modal-title" className="node-info-modal__title">
                  攻撃手法（エクスプロイト）の選択：{node.name}
                </h3>
              </div>
              <button
                type="button"
                className="node-info-modal__close"
                aria-label="閉じる"
                onClick={() => setIsExploitOpen(false)}
              >
                ×
              </button>
            </header>

            <div className="node-info-modal__body">
              {notice && <p role="alert">{notice}</p>}
              {securityRule?.correct_exploits?.length && !securityReady ? <p role="status">先に情報確認・必要な解析を完了してください。確認条件不足の実行は従来の失敗ペナルティになります。</p> : null}
              <div className="exploit-terminal-box">
                <div className="exploit-terminal-box__line">
                  <span className="exploit-terminal-box__tag">[TARGET]</span> {node.id} ({node.name}) ／ 階層: {node.layer} ／ 現在の警戒度: <strong>{alertLevel.toFixed(1)}%</strong>
                </div>
                <div className="exploit-terminal-box__line">
                  <span className="exploit-terminal-box__tag exploit-terminal-box__tag--vuln">[VULN]</span>{' '}
                  <strong>{node.vulnerability ?? '不明'}</strong>（{challenge.category}）
                </div>
                <div className="exploit-terminal-box__log">
                  {challenge.scanTerminalLog}
                </div>
                <div className="exploit-terminal-box__qhead">
                  <span className="exploit-terminal-box__qtype">
                    {currentQuestion.questionType}（{questionIndex + 1} / {challenge.questions.length}）
                  </span>
                  {challenge.questions.length > 1 && (
                    <button
                      type="button"
                      className="exploit-terminal-box__qswitch"
                      onClick={() => {
                        setQuestionIndex((prev) => (prev + 1) % challenge.questions.length);
                        setSelectedExploitId(null);
                      }}
                    >
                      別の問題に切り替え ↻
                    </button>
                  )}
                </div>
                <div className="exploit-terminal-box__prompt">
                  &gt; {currentQuestion.prompt}
                  <span className="exploit-terminal-box__penalty-note">
                    {`（不正解：警戒度 +${wrongAlert}%、資源 -${wrongResource}、時間消費なし）`}
                  </span>
                </div>
                {currentQuestion.codeSnippet && (
                  <pre className="exploit-terminal-box__snippet">
                    <code>{currentQuestion.codeSnippet}</code>
                  </pre>
                )}
              </div>

              <div className="exploit-choices" role="radiogroup" aria-label="攻撃手法の選択肢">
                {currentQuestion.choices.map((choice, idx) => {
                  const isSelected = selectedExploitId === choice.id;
                  const wasPenalized = penalizedChoiceIds.includes(choice.id);
                  const stateClass = isSelected
                    ? choice.isCorrect
                      ? 'exploit-choice--correct'
                      : 'exploit-choice--wrong'
                    : wasPenalized
                      ? 'exploit-choice--wrong'
                      : '';
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      className={`exploit-choice ${stateClass}`}
                      disabled={!canBreach}
                      onClick={() => handleSelectExploitChoice(choice.id, choice.isCorrect)}
                    >
                      <div className="exploit-choice__head">
                        <span className="exploit-choice__title">
                          [{idx + 1}] {choice.title}
                        </span>
                        {(isSelected || wasPenalized) && (
                          <span className={`exploit-choice__badge ${choice.isCorrect ? 'exploit-choice__badge--ok' : 'exploit-choice__badge--ng'}`}>
                            {choice.isCorrect ? '有効 (MATCH)' : `IDS検知 (警戒度 +${wrongAlert}% / 資源 -${wrongResource})`}
                          </span>
                        )}
                      </div>
                      <code className="exploit-choice__cmd">{choice.command}</code>
                      <p className="exploit-choice__desc">{choice.description}</p>
                    </button>
                  );
                })}
              </div>

              {selectedChoice && (
                <div
                  className={`exploit-feedback ${selectedChoice.isCorrect ? 'exploit-feedback--ok' : 'exploit-feedback--ng'}`}
                  role="status"
                >
                  <div className="exploit-feedback__title">
                    {selectedChoice.isCorrect
                      ? '[+] EXPLOIT READY — 脆弱性に合致する解答を確認しました！'
                      : `🚨 [!] IDS ALERT — 警戒度 +${wrongAlert}%、資源 -${wrongResource}（現在: ${alertLevel.toFixed(1)}%）`}
                  </div>
                  <p className="exploit-feedback__text">{selectedChoice.feedback}</p>
                  {selectedChoice.isCorrect && (
                    <p className="exploit-feedback__defense">{challenge.defenseMeasure}</p>
                  )}
                </div>
              )}

              {showPasscodeInput && (
                <div className="exploit-passcode-box">
                  <div className="exploit-passcode-box__head">
                    <span>最終目標 暗号キー入力（断片A+Bで侵入時の警戒度上昇を0%に抑制）</span>
                    {fragA && fragB && (
                      <button
                        type="button"
                        className="exploit-passcode-box__autofill"
                        onClick={() => setPasscode(`${fragA}${fragB}`)}
                      >
                        入手済みの暗号キー({fragA}{fragB})を自動入力
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    className="node-detail__cipher-input"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="断片A+Bを入力（空欄のままでも強行突破可能）"
                  />
                </div>
              )}
            </div>

            <footer className="node-info-modal__footer exploit-modal__footer">
              <button
                type="button"
                className="node-info-modal__close-btn"
                onClick={() => {
                  setIsExploitOpen(false);
                  setIsInfoOpen(true);
                }}
              >
                情報確認・解説を見る
              </button>
              <div className="exploit-modal__footer-right">
                <button
                  type="button"
                  className="node-info-modal__close-btn"
                  onClick={() => setIsExploitOpen(false)}
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  className="exploit-modal__execute-btn"
                  disabled={!selectedChoice?.isCorrect || !canBreach}
                  onClick={async () => {
                    if (answerPending.current) return;
                    answerPending.current = true;
                    try {
                      const result = await onAction(
                        'breach',
                        showPasscodeInput ? passcode : undefined,
                        false,
                        selectedExploitId ?? undefined,
                        currentQuestion.id,
                      );
                      if (result && result.accepted) setIsExploitOpen(false);
                    } finally { answerPending.current = false; }
                  }}
                >
                  {showPasscodeInput && passcode.trim() !== ''
                    ? `暗号キーで隠密侵入実行 (R${balanceConfig.breach.resource})`
                    : `侵入を実行する (R${balanceConfig.breach.resource})`}
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

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
                <h4>脆弱性 &amp; スキャン解析ログ (VULNERABILITY &amp; SCAN LOG)</h4>
                <p className="node-info-modal__code">
                  {isUnscanned
                    ? '未スキャン（スキャンを実行すると脆弱性情報が開示されます）'
                    : node.vulnerability ?? '検出された脆弱性なし'}
                </p>
                {!isUnscanned && (
                  <p className="node-info-modal__scanlog">
                    {challenge.scanTerminalLog}
                  </p>
                )}
              </section>

              {!isUnscanned && (
                <section className="node-info-modal__section node-info-modal__section--security">
                  <h4>サイバーセキュリティ解説 (SECURITY BRIEFING)</h4>
                  <div className="node-info-modal__item">
                    <strong>分類：</strong>{challenge.category}
                  </div>
                  <div className="node-info-modal__item">
                    <strong>なぜ危険なのか（攻撃の仕組み）：</strong>
                    <div>{challenge.whyDangerous}</div>
                  </div>
                  <div className="node-info-modal__item node-info-modal__item--defense">
                    <strong>現実のセキュリティ対策（防衛側の視点）：</strong>
                    <div>{challenge.defenseMeasure}</div>
                  </div>
                </section>
              )}

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
              {securityRule && node.status === 'scanned' && (
                <>
                  <button type="button" className="node-info-modal__close-btn" disabled={!playing || confirmed} onClick={() => onAction('confirmInfo')}>
                    {confirmed ? '情報確認済み' : '情報を確認した'}
                  </button>
                  {securityRule.required_analysis && <button type="button" className="node-info-modal__close-btn" disabled={!playing || !confirmed || analyzed} onClick={() => onAction('completeAnalysis')}>
                    {analyzed ? '解析完了済み' : '解析を完了する'}
                  </button>}
                </>
              )}
              {canBreach && (
                <button
                  type="button"
                  className="exploit-modal__execute-btn"
                  onClick={() => {
                    setIsInfoOpen(false);
                    setSelectedExploitId(null);
                    setIsExploitOpen(true);
                  }}
                >
                  ハッキング端末（侵入）へ進む →
                </button>
              )}
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
