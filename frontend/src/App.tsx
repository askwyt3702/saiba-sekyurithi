import { useEffect, useState } from 'react';
import { useGameClient } from './game/hooks/useGameClient';
import type { ActionRejectReason, ActionType } from './game/model/types';
import { MapView } from './components/MapView/MapView';
import { StatusBar } from './components/StatusBar/StatusBar';
import { NodeDetailPanel } from './components/NodeDetailPanel/NodeDetailPanel';
import { EventLog } from './components/EventLog/EventLog';
import { TitleScreen } from './components/TitleScreen/TitleScreen';
import { MissionScreen } from './components/MissionScreen/MissionScreen';
import './App.css';

type TimedActionType = Exclude<ActionType, 'pause' | 'resume'>;

const REJECT_MESSAGES: Record<ActionRejectReason, string> = {
  insufficient_resource: '解析資源が足りません。',
  insufficient_privilege: '権限が足りません。より手前の階層のノードに侵入して権限を上げてください。',
  node_not_scanned: '先にスキャンが必要です。',
  node_unreachable: '隣接するノードを先に侵入済みにする必要があります。',
  invalid_state: '現在この操作は実行できません。',
};

interface Notice {
  nodeId: string;
  message: string;
}

type Screen = 'title' | 'mission' | 'game';

// game.html の START GAME ボタンから ?autostart=1 付きで遷移した場合はミッション選択を直接表示する
function hasAutostartParam(): boolean {
  return new URLSearchParams(window.location.search).get('autostart') === '1';
}

function App() {
  // 初期値の計算は副作用なしにする(開発時のStrictModeは初期化関数を2回呼ぶため、
  // ここでURLを書き換えると2回目で ?autostart=1 が消えてタイトルに戻ってしまう)
  const [screen, setScreen] = useState<Screen>(() => (hasAutostartParam() ? 'mission' : 'title'));
  const { state, sendAction, reset } = useGameClient(screen === 'game');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    // URLを綺麗にする（履歴を汚さないようにreplaceState）
    if (hasAutostartParam()) window.history.replaceState({}, '', '/');
  }, []);

  const selectedNode = state?.nodes.find((n) => n.id === selectedNodeId) ?? null;

  const handleSelectNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setNotice(null);
  };

  // ターン制: アクションは即座に確定し、結果は state_snapshot で反映される。却下時だけ理由を表示する。
  const handleAction = async (type: TimedActionType) => {
    if (!selectedNode) return;
    const nodeId = selectedNode.id;
    setNotice(null);
    try {
      const result = await sendAction({ type, nodeId });
      if (!result.accepted) {
        setNotice({ nodeId, message: REJECT_MESSAGES[result.reason ?? 'invalid_state'] });
      }
    } catch (err) {
      console.error('[App] アクション送信に失敗しました:', err);
      setNotice({ nodeId, message: 'サーバーと通信できませんでした。' });
    }
  };

  const handleReset = () => {
    if (!window.confirm('作戦をリセットして最初からやり直しますか？')) return;
    setSelectedNodeId(null);
    setNotice(null);
    reset().catch((err) => console.error('[App] リセットに失敗しました:', err));
  };

  // タイトル画面
  if (screen === 'title') {
    return <TitleScreen onStart={() => setScreen('mission')} />;
  }

  // ミッション選択画面
  if (screen === 'mission') {
    return (
      <MissionScreen
        onSelectMission={(id) => {
          if (id === 1) setScreen('game');
        }}
        onBack={() => setScreen('title')}
      />
    );
  }

  // ゲーム本体
  if (!state) {
    return <div className="app-loading">接続中...</div>;
  }

  return (
    <div className="app-shell">
      <StatusBar
        elapsedSeconds={state.elapsedSeconds}
        alertLevel={state.alertLevel}
        analysisResource={state.analysisResource}
        privilege={state.privilege}
        onReset={handleReset}
      />
      {state.status === 'won' && <div className="app-banner app-banner--won">目的達成：データ回収に成功しました。</div>}
      {state.status === 'lost' && <div className="app-banner app-banner--lost">作戦失敗：警戒度が限界に達しました。</div>}
      <div className="app-body">
        <MapView
          nodes={state.nodes}
          edges={state.edges}
          selectedNodeId={selectedNodeId}
          onSelectNode={handleSelectNode}
        />
        <NodeDetailPanel
          node={selectedNode}
          notice={notice && notice.nodeId === selectedNodeId ? notice.message : null}
          onAction={handleAction}
        />
      </div>
      <EventLog entries={state.log} />
    </div>
  );
}

export default App;
