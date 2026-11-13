
import { useEffect, useState } from 'react';
import { useGameClient } from './game/hooks/useGameClient';
import type {
  ActionRejectReason,
  ActionType,
} from './game/model/types';
import { MapView } from './components/MapView/MapView';
import { StatusBar } from './components/StatusBar/StatusBar';
import { NodeDetailPanel } from './components/NodeDetailPanel/NodeDetailPanel';
import { EventLog } from './components/EventLog/EventLog';
import { TitleScreen } from './components/TitleScreen/TitleScreen';
import { MissionScreen } from './components/MissionScreen/MissionScreen';
import { MissionResult } from './components/MissionResult/MissionResult';
import { StageMechanicsStatus } from './components/StageMechanics/StageMechanicsStatus';
import { ToolPanel } from './components/ToolPanel/ToolPanel';
import { DEFAULT_STAGE_ID, MAX_ANALYSIS_RESOURCE, getStageData } from './game/data/stageData';
import './App.css';

type TimedActionType = Exclude<ActionType, 'pause' | 'resume'>;

const REJECT_MESSAGES: Record<ActionRejectReason, string> = {
  insufficient_resource: '解析資源が足りません。',
  insufficient_privilege:
    '権限が足りません。より手前の階層のノードに侵入して権限を上げてください。',
  node_not_scanned: '先にスキャンが必要です。',
  node_unreachable:
    '隣接するノードを先に侵入済みにする必要があります。',
  node_locked: 'ゲートがロックされています。詳細に表示された前提ノードを先に攻略してください。',
  invalid_passcode:
    '暗号キーが一致しません（断片A+Bが未入手か入力ミスです。空欄のまま侵入すると強行突破になります）。',
  invalid_state: '現在この操作は実行できません。',
};

interface Notice {
  nodeId: string;
  message: string;
}

type Screen = 'title' | 'mission' | 'game';

// game.htmlからの遷移に対応
function hasAutostartParam(): boolean {
  return (
    new URLSearchParams(window.location.search).get('autostart') === '1'
  );
}

function App() {
  // タイトル画面・ミッション選択画面
  const [screen, setScreen] = useState<Screen>(() =>
    hasAutostartParam() ? 'mission' : 'title'
  );
  const [stageId, setStageId] = useState<number>(DEFAULT_STAGE_ID);

  // ゲーム画面のときだけゲームデータを取得
  const { state, connectionMode, sendAction, reset } = useGameClient(screen === 'game', stageId);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);

  useEffect(() => {
    if (hasAutostartParam()) {
      window.history.replaceState({}, '', '/');
    }
  }, []);

  // 選択中のノード
  const selectedNode =
    state?.nodes.find((node) => node.id === selectedNodeId) ?? null;

  // RESOURCE回復可能か
  const canRecover =
    state?.status === 'playing' &&
    state.analysisResource < MAX_ANALYSIS_RESOURCE &&
    state.nodes.some((node) => node.status === 'hacked') &&
    !isRecovering;

  const handleSelectNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setNotice(null);
  };

  // ノードに対するアクション
  const handleAction = async (
    type: TimedActionType,
    passcode?: string,
    exploitMismatch?: boolean,
    exploitId?: string,
  ) => {
    if (!selectedNode) return;

    const nodeId = selectedNode.id;
    setNotice(null);

    try {
      if (type === 'breach' && !exploitMismatch && (nodeId === 'E01' || nodeId === 'E02' || nodeId === 'E03')) {
        await sendAction({ type: 'confirmInfo' as ActionType, nodeId }).catch(() => {});
      }
      const result = await sendAction({ type, nodeId, passcode, exploitMismatch, exploitId });

      if (!result.accepted) {
        setNotice({
          nodeId,
          message: REJECT_MESSAGES[result.reason ?? 'invalid_state'],
        });
      }
    } catch (err) {
      console.error('[App] アクション送信に失敗しました:', err);

      setNotice({
        nodeId,
        message: 'サーバーと通信できませんでした。',
      });
    }
  };

  // RESOURCE回復（ノード選択不要）
  const handleRecover = async () => {
    if (!canRecover) return;

    setNotice(null);
    setIsRecovering(true);

    try {
      const result = await sendAction({ type: 'recover' });

      if (!result.accepted) {
        window.alert(
          REJECT_MESSAGES[result.reason ?? 'invalid_state']
        );
      }
    } catch (err) {
      console.error('[App] RESOURCE回復に失敗しました:', err);
      window.alert('サーバーと通信できませんでした。');
    } finally {
      setIsRecovering(false);
    }
  };

  // ゲームのリセット
  const handleReset = () => {
    if (!window.confirm('作戦をリセットして最初からやり直しますか？')) {
      return;
    }

    setSelectedNodeId(null);
    setNotice(null);

    reset().catch((err) =>
      console.error('[App] リセットに失敗しました:', err)
    );
  };

  // クリア後も既存のリセット処理で同じミッションを最初から開始する
  const restartMission = async () => {
    await reset();
    setSelectedNodeId(null);
    setNotice(null);
  };

  const returnToTitle = async () => {
    await restartMission();
    setScreen('title');
  };

  // タイトル画面
  if (screen === 'title') {
    return (
      <TitleScreen
        onStart={() => setScreen('mission')}
      />
    );
  }

  // ミッション選択画面
  if (screen === 'mission') {
    return (
      <MissionScreen
        onSelectMission={(id) => {
          if (id === 0 || id === 1 || id === 2) {
            setStageId(id);
            setSelectedNodeId(null);
            setNotice(null);
            setScreen('game');
          }
        }}
        onBack={() => setScreen('title')}
      />
    );
  }

  // ゲームデータ読み込み中
  if (!state || (state.stageId ?? DEFAULT_STAGE_ID) !== stageId) {
    return <div className="app-loading">接続中...</div>;
  }

  // ゲーム画面
  return (
    <div className="app-shell">
      <StatusBar
        elapsedSeconds={state.elapsedSeconds}
        alertLevel={state.alertLevel}
        analysisResource={state.analysisResource}
        privilege={state.privilege}
        offline={connectionMode === 'mock'}
        canRecover={canRecover}
        onRecover={handleRecover}
        onReset={handleReset}
        onSelectMission={() => {
          setSelectedNodeId(null);
          setNotice(null);
          setScreen('mission');
        }}
      />
      {getStageData(state.stageId ?? stageId).prototypeNotice && (
        <div className="app-banner" role="note">{getStageData(state.stageId ?? stageId).prototypeNotice}</div>
      )}
      <StageMechanicsStatus stageId={state.stageId ?? stageId} nodes={state.nodes} />
      {state.status === 'won' && (
        <MissionResult state={state} onRetry={restartMission} onTitle={returnToTitle} />
      )}
      {state.status === 'lost' && (
        <div className="app-banner app-banner--lost">
          {state.alertLevel < 100
            ? '作戦失敗：解析資源が不足し、これ以上の作戦継続は不可能です。'
            : '作戦失敗：警戒度が限界に達しました。'}
        </div>
      )}
      <div className="app-body">
        <ToolPanel
          stageId={state.stageId ?? stageId}
          nodes={state.nodes}
          edges={state.edges}
          privilege={state.privilege}
          keyFragments={state.keyFragments}
          log={state.log}
          selectedNodeId={selectedNodeId}
          onSelectNode={handleSelectNode}
        />

        <MapView
          stageId={state.stageId ?? stageId}
          nodes={state.nodes}
          edges={state.edges}
          selectedNodeId={selectedNodeId}
          onSelectNode={handleSelectNode}
        />

        <NodeDetailPanel
          alertLevel={state.alertLevel}
          stageId={state.stageId ?? stageId}
          gameStatus={state.status}
          privilege={state.privilege}
          keyFragments={state.keyFragments}
          node={selectedNode}
          nodes={state.nodes}
          edges={state.edges}
          analysisResource={state.analysisResource}
          notice={
            notice && notice.nodeId === selectedNodeId
              ? notice.message
              : null
          }
          onAction={handleAction}
        />
      </div>

      <EventLog entries={state.log} />
    </div>
  );
}

export default App;
