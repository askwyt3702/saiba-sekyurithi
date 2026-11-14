import { mapForState } from './game/model/mapDefinition';

import { useEffect, useRef, useState } from 'react';
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
import { MissionFailure } from './components/MissionFailure/MissionFailure';
import { StageMechanicsStatus } from './components/StageMechanics/StageMechanicsStatus';
import { TutorialBanner } from './components/TutorialBanner/TutorialBanner';
import { ToolPanel } from './components/ToolPanel/ToolPanel';
import { DEFAULT_STAGE_ID, MAX_ANALYSIS_RESOURCE } from './game/data/stageData';
import { gameStart, type GameStart } from './game/model/gameStart';
import './App.css';

type TimedActionType = Exclude<ActionType, 'pause' | 'resume'>;

const REJECT_MESSAGES: Record<ActionRejectReason, string> = {
  question_required: '問題を選択してください。',
  invalid_question: '問題IDが無効です。',
  exploit_required: '攻撃手法を選択してください。',
  security_requirements_unmet: '侵入前に情報確認が必要です。ノード詳細の情報確認を完了してください。',
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

function App() {
  // タイトル画面・ミッション選択画面
  const [screen, setScreen] = useState<Screen>('title');
  const [stageId, setStageId] = useState<number>(DEFAULT_STAGE_ID);

  // ゲーム画面のときだけゲームデータを取得

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [idsAlertActive, setIdsAlertActive] = useState(false);
  const idsLogs = useRef<{ gameId: string | null; seen: Set<string> }>({ gameId: null, seen: new Set() });
  const idsAlertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [start,setStart]=useState<GameStart>({mode:'resume'});
  const { state, connectionMode, sendAction, reset, connectionError } = useGameClient(screen === 'game', stageId,start);

  const triggerIdsAlert = () => {
    if (idsAlertTimer.current) clearTimeout(idsAlertTimer.current);
    setIdsAlertActive(true);
    idsAlertTimer.current = setTimeout(() => {
      setIdsAlertActive(false);
    }, 900);
  };

  useEffect(() => {
    if (!state?.log) return;
    const cursor = idsLogs.current;
    if (cursor.gameId !== state.gameId) {
      idsLogs.current = { gameId: state.gameId, seen: new Set(state.log.map((entry) => entry.id)) };
      return;
    }
    const newLogs = state.log.filter((entry) => !cursor.seen.has(entry.id));
    for (const entry of newLogs) cursor.seen.add(entry.id);
    if (newLogs.some((entry) => entry.message.includes('【IDS検知警告】'))) triggerIdsAlert();
  }, [state?.gameId, state?.log]);

  useEffect(() => () => { if (idsAlertTimer.current) clearTimeout(idsAlertTimer.current); }, []);

  // 選択中のノード
  const selectedNode =
    state?.nodes.find((node) => node.id === selectedNodeId) ?? null;

  // RESOURCE回復可能か
  const canRecover =
    state?.status === 'playing' &&
    state.analysisResource < (state.mapSnapshot?.definition.rules.maxAnalysisResource ?? MAX_ANALYSIS_RESOURCE) &&
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
    questionId?: string,
  ) => {
    if (!selectedNode) return;

    const nodeId = selectedNode.id;
    setNotice(null);

    try {
      const result = await sendAction({ type, nodeId, passcode, exploitMismatch, exploitId, questionId });

      if (!result.accepted) {
        setNotice({
          nodeId,
          message: REJECT_MESSAGES[result.reason ?? 'invalid_state'],
        });
      }
      return result;
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
            setStart(gameStart('resume'));
            setStageId(id);
            setSelectedNodeId(null);
            setNotice(null);
            setScreen('game');
          }
        }}
        onNewGame={(id)=>{
          if(![0,1,2].includes(id)||!window.confirm('新しいゲームを始めますか？成功後に再開先が切り替わります。RETRYは現在のマップを維持します。'))return;
          setStart(gameStart('new'));setStageId(id);setSelectedNodeId(null);setNotice(null);setScreen('game');
        }}
        onBack={() => setScreen('title')}
      />
    );
  }

  if (connectionError) {
    return (
      <div className="app-loading app-loading--error" role="alert">
        <p>{connectionError}</p>
        <button type="button" onClick={() => {
          setSelectedNodeId(null);
          setNotice(null);
          setIsRecovering(false);
          setIdsAlertActive(false);
          setScreen('mission');
        }}>ミッション選択へ戻る</button>
      </div>
    );
  }

  // ゲームデータ読み込み中
  if (!state || (state.stageId ?? DEFAULT_STAGE_ID) !== stageId) {
    return <div className="app-loading" role="status">マップを準備しています...</div>;
  }

  // ゲーム画面
  const map = mapForState(state);
  return (
    <div className={`app-shell ${idsAlertActive ? 'app-shell--ids-alert' : ''}`}>
      {idsAlertActive && (
        <div className="ids-alert-banner" role="alert">
          ⚠ [CRITICAL IDS ALERT] 侵入検知センサー作動 // 不正エクスプロイト遮断
        </div>
      )}
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
      {map.prototypeNotice && (
        <div className="app-banner" role="note">{map.prototypeNotice}</div>
      )}
      <StageMechanicsStatus mapDefinition={map} stageId={state.stageId ?? stageId} nodes={state.nodes} />
      <TutorialBanner
        stageId={state.stageId ?? stageId}
        nodes={state.nodes}
        logs={state.log}
        selectedNodeId={selectedNodeId}
        onSelectNode={handleSelectNode}
      />
      {state.status === 'won' && (
        <MissionResult state={state} onRetry={restartMission} onTitle={returnToTitle} />
      )}
      {state.status === 'lost' && (
        <>
          <div className="app-banner app-banner--lost">
            {state.alertLevel < 100
              ? '作戦失敗：解析資源が不足し、これ以上の作戦継続は不可能です。'
              : '作戦失敗：警戒度が限界に達しました。'}
          </div>
          <MissionFailure state={state} onRetry={restartMission} onTitle={returnToTitle} />
        </>
      )}
      <div className="app-body">
        <ToolPanel
          mapDefinition={map}
          securityEvents={state.securityEvents}
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
        key={state.gameId}
          mapDefinition={map}
          stageId={state.stageId ?? stageId}
          nodes={state.nodes}
          edges={state.edges}
          selectedNodeId={selectedNodeId}
          onSelectNode={handleSelectNode}
        />

        <NodeDetailPanel
          mapDefinition={map}
          securityEvents={state.securityEvents}
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
          logs={state.log}
          onAction={handleAction}
        />
      </div>

      <EventLog entries={state.log} />
    </div>
  );
}

export default App;
