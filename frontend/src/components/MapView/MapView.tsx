
import { useMemo } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  PanOnScrollMode,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type {
  ApiNetworkEdge,
  NetworkNode,
} from '../../game/model/types';

import {
  NetworkNodeView,
  type NetworkFlowNode,
} from './NetworkNodeView';

import './MapView.css';

const nodeTypes = {
  networkNode: NetworkNodeView,
};

interface MapViewProps {
  nodes: NetworkNode[];
  edges: ApiNetworkEdge[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

export function MapView({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
}: MapViewProps) {
  const flowNodes: NetworkFlowNode[] = useMemo(
    () =>
      nodes.map((node) => ({
        id: node.id,
        type: 'networkNode',
        position: node.position,
        data: {
          node,
          selected: node.id === selectedNodeId,
        },
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

        // 全ノードを一画面に収めない
        fitView={false}

        // 初期ズーム倍率
       defaultViewport={{
           x: 80,
           y: 80,
           zoom: 1,
         }}

        // ズーム倍率を固定
        minZoom={1}
        maxZoom={1}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}

        // ホイールで上下、Shift+ホイール/トラックパッドで左右にスクロール。
        // ノードは横にも広がっている(x≒1000まで)ため、縦だけだと狭い画面で右側に届かない。
        panOnScroll={true}
        panOnScrollMode={PanOnScrollMode.Free}

        // ドラッグでマップを動かさない
        panOnDrag={false}

        // ノード位置は固定
        nodesDraggable={false}
        nodesConnectable={false}

        // 表示設定
        proOptions={{
          hideAttribution: true,
        }}
      >
        <Background
          color="#2a2e38"
          gap={24}
        />

        <Controls
          showInteractive={false}
          showZoom={false}
          showFitView={false}
        />
      </ReactFlow>
    </div>
  );
}
