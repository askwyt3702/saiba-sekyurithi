import { useState } from 'react';
import type { LogEntry, NetworkNode } from '../../game/model/types';
import './TutorialBanner.css';

interface TutorialBannerProps {
  stageId: number;
  nodes: NetworkNode[];
  logs: LogEntry[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

interface TutorialStepInfo {
  step: number;
  totalSteps: number;
  phaseLabel: string;
  title: string;
  description: string;
  hint: string;
  quickTargets: Array<{ nodeId: string; label: string }>;
}

function resolveTutorialStep(
  nodes: NetworkNode[],
  logs: LogEntry[],
  selectedNodeId: string | null,
): TutorialStepInfo {
  const getNode = (id: string) => nodes.find((n) => n.id === id);
  const ext1 = getNode('external-1');
  const dmz1 = getNode('dmz-1');
  const dmz2 = getNode('dmz-2');
  const int1 = getNode('internal-1');
  const core1 = getNode('core-1');

  const isInfoConfirmed = (nodeName?: string) =>
    Boolean(
      nodeName &&
        logs.some(
          (entry) =>
            entry.message.includes('【事前調査完了】') && entry.message.includes(nodeName),
        ),
    );

  // STEP 1: external-1 未スキャン & 未選択
  if (!ext1 || ext1.status === 'unscanned') {
    if (selectedNodeId !== 'external-1') {
      return {
        step: 1,
        totalSteps: 7,
        phaseLabel: 'RECONNAISSANCE // 初期偵察',
        title: 'STEP 1 / 7：初期侵入口「external-1 (公開サーバー)」を選択しよう',
        description:
          'マップ一番上のノード「External (公開サーバー)」をクリックするか、右のショートカットボタンで選択してください。',
        hint: '最初は External 層の入口ノードからのみ作戦を開始できます。',
        quickTargets: [{ nodeId: 'external-1', label: '🎯 external-1 を選択' }],
      };
    }

    // STEP 2: external-1 未スキャン & 選択中
    return {
      step: 2,
      totalSteps: 7,
      phaseLabel: 'PORT & VULN SCAN // 脆弱性スキャン',
      title: 'STEP 2 / 7：右パネルの「通常スキャン」を実行しよう',
      description:
        '画面右側の詳細パネルにある「通常スキャン」ボタンを押して、公開サーバーの稼働サービスと脆弱性を特定しましょう。',
      hint: 'スキャンを行うことで、閉ざされていた脆弱性情報と推奨攻撃カテゴリが開示されます。',
      quickTargets: [],
    };
  }

  // STEP 3: external-1 スキャン済み（未侵入）
  if (ext1.status === 'scanned') {
    const confirmed = isInfoConfirmed(ext1.name);
    return {
      step: 3,
      totalSteps: 7,
      phaseLabel: 'INITIAL BREACH // 事前調査と初期侵入',
      title: confirmed
        ? 'STEP 3 / 7：「侵入」から適切な攻撃手法を選んで突破しよう'
        : 'STEP 3 / 7：「情報確認」でダミーを除外し、「侵入」を実行しよう',
      description: confirmed
        ? '事前調査が完了しました！右パネルの「侵入」ボタンを押し、「弱いSSHパスワード」に対応する攻撃手法を選択して実行しましょう。'
        : '先に右パネルの「情報確認」を押して事前調査を行うと、攻撃時のダミー選択肢が1つ除外され警戒度上昇も抑えられます。その後「侵入」を実行しましょう！',
      hint: '左パネルの「脆弱性診断」タブでも、検知された脆弱性の対策・攻撃ヒントを確認できます。',
      quickTargets:
        selectedNodeId !== 'external-1'
          ? [{ nodeId: 'external-1', label: '🎯 external-1 を選択' }]
          : [],
    };
  }

  // STEP 4: external-1 侵入済み & DMZ 未突破
  const dmzHacked = dmz1?.status === 'hacked' || dmz2?.status === 'hacked';
  if (!dmzHacked) {
    const scannedDmz =
      dmz1?.status === 'scanned' ? dmz1 : dmz2?.status === 'scanned' ? dmz2 : null;
    if (!scannedDmz) {
      return {
        step: 4,
        totalSteps: 7,
        phaseLabel: 'LATERAL MOVEMENT // DMZ層のルート選択',
        title: 'STEP 4 / 7：DMZ層（Webサーバー または メールサーバー）をスキャンしよう',
        description:
          '権限が「USER」に昇格し、隣接するDMZ層へ進めるようになりました！「dmz-1 (Webサーバー)」または「dmz-2 (メールサーバー：警戒度-10% / 資源+5の補給効果あり)」を選択して通常スキャンを実行しましょう。',
        hint: '安全に進みたい場合は、補給・痕跡消去効果のある「dmz-2 (メールサーバー)」ルートがおすすめです。',
        quickTargets: [
          { nodeId: 'dmz-1', label: '🎯 dmz-1 (Web) を選択' },
          { nodeId: 'dmz-2', label: '🎯 dmz-2 (メール・補給) を選択' },
        ],
      };
    }

    const confirmed = isInfoConfirmed(scannedDmz.name);
    return {
      step: 4,
      totalSteps: 7,
      phaseLabel: 'LATERAL MOVEMENT // DMZ層の突破',
      title: `STEP 4 / 7：スキャンした「${scannedDmz.id}」へ侵入して ADMIN 権限を獲得しよう`,
      description: confirmed
        ? `事前調査完了！右パネルの「侵入」から「${scannedDmz.vulnerability}」に有効なエクスプロイトを選択してDMZ層を突破しましょう。`
        : `「${scannedDmz.name}」の脆弱性が判明しました！右パネルの「情報確認」でダミー選択肢を除外してから、「侵入」を実行しましょう。`,
      hint: 'DMZ層のノードを1つ制圧すると、Internal層へ進むための「ADMIN」権限に昇格します。',
      quickTargets:
        selectedNodeId !== scannedDmz.id
          ? [{ nodeId: scannedDmz.id, label: `🎯 ${scannedDmz.id} を選択` }]
          : [],
    };
  }

  // STEP 5: DMZ 突破済み & internal-1 未突破
  if (!int1 || int1.status !== 'hacked') {
    if (!int1 || int1.status === 'unscanned') {
      return {
        step: 5,
        totalSteps: 7,
        phaseLabel: 'PRIVILEGE ESCALATION // 社内網の調査',
        title: 'STEP 5 / 7：Internal層「internal-1 (社内網)」を選択してスキャンしよう',
        description:
          '権限が「ADMIN」に昇格しました！社内網の中枢である「internal-1 (Active Directoryサーバー)」を選択し、「通常スキャン」を実行しましょう。',
        hint: 'Internal層を制圧すると、最深部Core層へアクセスできる最高権限「ROOT」を獲得できます。',
        quickTargets:
          selectedNodeId !== 'internal-1'
            ? [{ nodeId: 'internal-1', label: '🎯 internal-1 を選択' }]
            : [],
      };
    }

    const confirmed = isInfoConfirmed(int1.name);
    return {
      step: 5,
      totalSteps: 7,
      phaseLabel: 'PRIVILEGE ESCALATION // ROOT権限の奪取',
      title: 'STEP 5 / 7：「internal-1 (社内網)」へ侵入して ROOT 権限を奪取しよう',
      description: confirmed
        ? '事前調査完了！「侵入」ボタンから「Active Directoryの権限設定ミス」に対応する攻撃手法を選択して突破しましょう。'
        : '右パネルの「情報確認」で事前調査を行ってから、「侵入」でActive Directoryの権限不備を突いてROOT権限を奪取しましょう。',
      hint: '誤った攻撃手法を選ぶとIDSに検知され警戒度が大幅に上昇するため、事前調査のヒントを活用しましょう。',
      quickTargets:
        selectedNodeId !== 'internal-1'
          ? [{ nodeId: 'internal-1', label: '🎯 internal-1 を選択' }]
          : [],
    };
  }

  // STEP 6: internal-1 突破済み & core-1 未突破
  if (!core1 || core1.status !== 'hacked') {
    if (!core1 || core1.status === 'unscanned') {
      return {
        step: 6,
        totalSteps: 7,
        phaseLabel: 'CORE TARGET // 最終目標のスキャン',
        title: 'STEP 6 / 7：最終目標「core-1 (Core 機密DB)」をスキャンしよう',
        description:
          '最高権限「ROOT」を獲得しました！最深部のターゲット「core-1 (Core 機密DB)」を選択して「通常スキャン」を実行しましょう。',
        hint: '最終目標ノードでも、まずはスキャンで脆弱性を特定する必要があります。',
        quickTargets:
          selectedNodeId !== 'core-1'
            ? [{ nodeId: 'core-1', label: '🎯 core-1 を選択' }]
            : [],
      };
    }

    const confirmed = isInfoConfirmed(core1.name);
    return {
      step: 6,
      totalSteps: 7,
      phaseLabel: 'CORE TARGET // 最終目標の制圧',
      title: 'STEP 6 / 7：最終目標「core-1 (Core 機密DB)」へ侵入しよう',
      description: confirmed
        ? '事前調査完了！「侵入」ボタンから「SQLインジェクション」に対応する攻撃手法を選択して機密DBを制圧しましょう！'
        : '「core-1」の脆弱性（SQLインジェクション）を特定しました！「情報確認」でダミーを除外してから「侵入」を実行しましょう。',
      hint: 'Core層は誤攻撃時のペナルティが大きいため、SQL構文を不正注入するペイロードを慎重に選んでください。',
      quickTargets:
        selectedNodeId !== 'core-1'
          ? [{ nodeId: 'core-1', label: '🎯 core-1 を選択' }]
          : [],
    };
  }

  // STEP 7: core-1 制圧済み → データ回収
  return {
    step: 7,
    totalSteps: 7,
    phaseLabel: 'EXFILTRATION // 機密データの回収',
    title: 'STEP 7 / 7：右パネル一番下の「データ回収」を実行して訓練完了！',
    description:
      'ターゲット「core-1 (Core 機密DB)」の制圧に成功しました！右パネル一番下の「データ回収」ボタンを押すとミッションクリアです！',
    hint: 'お疲れ様でした！データ回収完了後、クリアランクとセキュリティ診断レポートが表示されます。',
    quickTargets:
      selectedNodeId !== 'core-1'
        ? [{ nodeId: 'core-1', label: '🎯 core-1 を選択' }]
        : [],
  };
}

export function TutorialBanner({
  stageId,
  nodes,
  logs,
  selectedNodeId,
  onSelectNode,
}: TutorialBannerProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (stageId !== 0) {
    return null;
  }

  const info = resolveTutorialStep(nodes, logs, selectedNodeId);

  return (
    <section className="tutorial-banner" aria-label="チュートリアルナビゲーション">
      <div className="tutorial-banner__header">
        <div className="tutorial-banner__badge-group">
          <span className="tutorial-banner__badge">TRAINING NAVI</span>
          <span className="tutorial-banner__phase">{info.phaseLabel}</span>
          <div className="tutorial-banner__dots" aria-hidden="true">
            {Array.from({ length: info.totalSteps }, (_, idx) => {
              const stepNum = idx + 1;
              const statusClass =
                stepNum < info.step
                  ? 'tutorial-banner__dot--done'
                  : stepNum === info.step
                    ? 'tutorial-banner__dot--active'
                    : '';
              return (
                <span
                  key={stepNum}
                  className={`tutorial-banner__dot ${statusClass}`}
                />
              );
            })}
          </div>
        </div>

        <button
          type="button"
          className="tutorial-banner__toggle"
          onClick={() => setCollapsed((prev) => !prev)}
        >
          {collapsed ? '▼ ガイドを展開' : '▲ 最小化'}
        </button>
      </div>

      {!collapsed && (
        <div className="tutorial-banner__body">
          <div className="tutorial-banner__content">
            <div className="tutorial-banner__title">{info.title}</div>
            <p className="tutorial-banner__desc">{info.description}</p>
            <div className="tutorial-banner__hint">💡 HINT: {info.hint}</div>
          </div>

          {info.quickTargets.length > 0 && (
            <div className="tutorial-banner__actions">
              {info.quickTargets.map((target) => (
                <button
                  key={target.nodeId}
                  type="button"
                  className="tutorial-banner__action-btn"
                  onClick={() => onSelectNode(target.nodeId)}
                >
                  {target.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
