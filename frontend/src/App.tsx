import { useState } from 'react';
import { useGameClient } from './game/hooks/useGameClient';
import type { ActionType } from './game/model/types';
import { MapView } from './components/MapView/MapView';
import { StatusBar } from './components/StatusBar/StatusBar';
import { NodeDetailPanel } from './components/NodeDetailPanel/NodeDetailPanel';
import { EventLog } from './components/EventLog/EventLog';
import './App.css';

type TimedActionType = Exclude<ActionType, 'pause' | 'resume'>;

function App() {
  const { state, sendAction } = useGameClient('prototype-1');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  if (!state) {
    return <div className="app-loading">接続中...</div>;
  }

  const selectedNode = state.nodes.find((n) => n.id === selectedNodeId) ?? null;

  // ターン制: アクションは即座に確定するので、結果は次のstate_snapshotで反映されるのを待つだけでよい。
  const handleAction = (type: TimedActionType) => {
    if (!selectedNode) return;
    void sendAction({ type, nodeId: selectedNode.id });
  };

  return (
    <div className="app-shell">
      <StatusBar
        elapsedSeconds={state.elapsedSeconds}
        alertLevel={state.alertLevel}
        analysisResource={state.analysisResource}
        privilege={state.privilege}
      />
      {state.status === 'won' && <div className="app-banner app-banner--won">目的達成：データ回収に成功しました。</div>}
      {state.status === 'lost' && <div className="app-banner app-banner--lost">作戦失敗：警戒度が限界に達しました。</div>}
      <div className="app-body">
        <MapView
          nodes={state.nodes}
          edges={state.edges}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
        />
        <NodeDetailPanel node={selectedNode} onAction={handleAction} />
      </div>
      <EventLog entries={state.log} />
    </div>
  );
}

export default App;
