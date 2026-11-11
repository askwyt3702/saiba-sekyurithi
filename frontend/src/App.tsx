
import { useState } from 'react';
import { useGameClient } from './game/hooks/useGameClient';
import type {
  ActionRejectReason,
  ActionType,
} from './game/model/types';
import { MapView } from './components/MapView/MapView';
import { StatusBar } from './components/StatusBar/StatusBar';
import { NodeDetailPanel } from './components/NodeDetailPanel/NodeDetailPanel';
import { EventLog } from './components/EventLog/EventLog';
import './App.css';

type TimedActionType = Exclude<ActionType, 'pause' | 'resume'>;

const REJECT_MESSAGES: Record<ActionRejectReason, string> = {
  insufficient_resource: '解析資源が足りません。',
  insufficient_privilege:
    '権限が足りません。より手前の階層のノードに侵入して権限を上げてください。',
  node_not_scanned: '先にスキャンが必要です。',
  node_unreachable:
    '隣接するノードを先に侵入済みにする必要があります。',
  invalid_state: '現在この操作は実行できません。',
};

interface Notice {
  nodeId: string;
  message: string;
}

function App() {
  const { state, sendAction, reset } = useGameClient();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);

  if (!state) {
    return <div className="app-loading">接続中...</div>;
  }

  const selectedNode =
    state.nodes.find((n) => n.id === selectedNodeId) ?? null;

  const canRecover =
    state.status === 'playing' &&
    state.analysisResource < 30 &&
    state.nodes.some((node) => node.status === 'hacked') &&
    !isRecovering;

  const handleSelectNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setNotice(null);
  };

  // ノードに対するアクション
  const handleAction = async (type: TimedActionType) => {
    if (!selectedNode) return;

    const nodeId = selectedNode.id;
    setNotice(null);

    try {
      const result = await sendAction({ type, nodeId });

      if (!result.accepted) {
        setNotice({
          nodeId,
          message:
            REJECT_MESSAGES[result.reason ?? 'invalid_state'],
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
        console.warn(
          '[App] RESOURCE回復が拒否されました:',
          result.reason
        );

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

  const handleReset = () => {
    if (
      !window.confirm(
        '作戦をリセットして最初からやり直しますか？'
      )
    ) {
      return;
    }

    setSelectedNodeId(null);
    setNotice(null);

    reset().catch((err) =>
      console.error('[App] リセットに失敗しました:', err)
    );
  };

  return (
    <div className="app-shell">
      <StatusBar
        elapsedSeconds={state.elapsedSeconds}
        alertLevel={state.alertLevel}
        analysisResource={state.analysisResource}
        privilege={state.privilege}
        canRecover={canRecover}
        onRecover={handleRecover}
        onReset={handleReset}
      />

      {state.status === 'won' && (
        <div className="app-banner app-banner--won">
          目的達成：データ回収に成功しました。
        </div>
      )}

      {state.status === 'lost' && (
        <div className="app-banner app-banner--lost">
          作戦失敗：警戒度が限界に達しました。
        </div>
      )}

      <div className="app-body">
        <MapView
          nodes={state.nodes}
          edges={state.edges}
          selectedNodeId={selectedNodeId}
          onSelectNode={handleSelectNode}
        />

        <NodeDetailPanel
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
