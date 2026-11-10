import { useState } from 'react';
import { useGameClient } from './game/hooks/useGameClient';
import { balanceConfig } from './game/data/balanceConfig';
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
  const [pendingNodeId, setPendingNodeId] = useState<string | null>(null);

  if (!state) {
    return <div className="app-loading">接続中...</div>;
  }

  const selectedNode = state.nodes.find((n) => n.id === selectedNodeId) ?? null;

  const handleAction = async (type: TimedActionType) => {
    if (!selectedNode || pendingNodeId) return;
    const result = await sendAction({ type, nodeId: selectedNode.id });
    if (result.accepted) {
      setPendingNodeId(selectedNode.id);
      window.setTimeout(() => setPendingNodeId(null), balanceConfig[type].time * 1000);
    }
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
      <div className="app-body">
        <MapView
          nodes={state.nodes}
          edges={state.edges}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
        />
        <NodeDetailPanel
          node={selectedNode}
          pending={pendingNodeId === selectedNode?.id}
          onAction={handleAction}
        />
      </div>
      <EventLog entries={state.log} />
    </div>
  );
}

export default App;
