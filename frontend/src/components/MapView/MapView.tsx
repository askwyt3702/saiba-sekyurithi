import { useMemo } from 'react';
import { Background, Controls, ReactFlow, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { ApiNetworkEdge, NetworkNode } from '../../game/model/types';
import { NetworkNodeView, type NetworkFlowNode } from './NetworkNodeView';
import './MapView.css';

const nodeTypes = { networkNode: NetworkNodeView };

interface MapViewProps {
  nodes: NetworkNode[];
  edges: ApiNetworkEdge[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

export function MapView({ nodes, edges, selectedNodeId, onSelectNode }: MapViewProps) {
  const flowNodes: NetworkFlowNode[] = useMemo(
    () =>
      nodes.map((node) => ({
        id: node.id,
        type: 'networkNode',
        position: node.position,
        data: { node, selected: node.id === selectedNodeId },
        draggable: false,
      })),
    [nodes, selectedNodeId],
  );

  const flowEdges: Edge[] = useMemo(
    () =>
      edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        animated: edge.animated,
      })),
    [edges],
  );

  return (
    <div className="map-view">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#2a2e38" gap={24} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
