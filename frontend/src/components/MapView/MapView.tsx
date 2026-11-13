
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  PanOnScrollMode,
  useReactFlow,
  ReactFlowProvider,
  type Edge,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';
import { DEFAULT_STAGE_ID, getStageData } from '../../game/data/stageData';
import { useUiScale } from '../../useUiScale';
import { missingGateRequirements, monitoringExtra } from '../../game/model/actionRules';

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

// マップ移動範囲
const MAP_BOUNDS: [[number, number], [number, number]] = [
  [-200, -100],
  [1600, 3650],
];

interface MapViewProps {
  stageId?: number;
  nodes: NetworkNode[];
  edges: ApiNetworkEdge[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

function MapContent({
  stageId = DEFAULT_STAGE_ID,
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
}: MapViewProps) {
  const stage = getStageData(stageId);
  const { setViewport, getViewport } = useReactFlow();
  // 画面全体の拡大(#root の zoom)はマップには効かせず(MapView.css)、React Flow 自身のズームで同じ大きさに見せる。
  // 外側の zoom が残っていると、ドラッグでマップがマウスより速く動いてしまうため。
  const uiScale = useUiScale();
  const appliedScale = useRef(uiScale);

  const containerRef = useRef<HTMLDivElement>(null);
  const initializedEntryId = useRef<string | null>(null);
  // React Flow の準備ができる前に setViewport しても無視されるため、onInit を待つ
  const [flowReady, setFlowReady] = useState(false);

  // ノードの状態
  const nodeStatusMap = useMemo(
    () => new Map(nodes.map((node) => [node.id, node.status])),
    [nodes],
  );

  // 侵入済みノードと隣接するノード
  const reachableNodeIds = useMemo(() => {
    const reachable = new Set<string>();

    for (const edge of edges) {
      const sourceHacked =
        nodeStatusMap.get(edge.source) === 'hacked';

      const targetHacked =
        nodeStatusMap.get(edge.target) === 'hacked';

      if (sourceHacked && !targetHacked) {
        reachable.add(edge.target);
      }

      if (targetHacked && !sourceHacked) {
        reachable.add(edge.source);
      }
    }

    return reachable;
  }, [edges, nodeStatusMap]);

  // React Flow用ノード
  const flowNodes: NetworkFlowNode[] = useMemo(
    () =>
      nodes.map((node) => ({
        id: node.id,
        type: 'networkNode',
        position: node.position,
        data: {
          node,
          selected: node.id === selectedNodeId,
          isEntry: stage.entryNodeIds.includes(node.id),
          isMonitored: stage.conditionalBreachAlert?.targetNodeIds.includes(node.id),
          monitoringExtra: monitoringExtra(node.id, nodes, stage),
          gateState: stage.breachRequirements[node.id]
            ? node.status === 'hacked' ? 'hacked' : missingGateRequirements(node.id, nodes, stage).length ? 'locked' : 'unlocked'
            : undefined,
        },
        draggable: false,
        className:
          node.status !== 'hacked' &&
          reachableNodeIds.has(node.id)
            ? 'map-node--reachable'
            : '',
      })),
    [nodes, selectedNodeId, reachableNodeIds, stage],
  );

  // 接続線
  const flowEdges: Edge[] = useMemo(
    () =>
      edges.map((edge) => {
        const sourceStatus = nodeStatusMap.get(edge.source);
        const targetStatus = nodeStatusMap.get(edge.target);

        const bothHacked =
          sourceStatus === 'hacked' &&
          targetStatus === 'hacked';

        const connectedToSelected =
          selectedNodeId !== null &&
          (edge.source === selectedNodeId ||
            edge.target === selectedNodeId);

        let stroke = '#8392a8';
        let strokeWidth = 1.5;

        if (bothHacked) {
          stroke = '#22c55e';
          strokeWidth = 2;
        }

        if (connectedToSelected) {
          stroke = '#60a5fa';
          strokeWidth = 2.5;
        }

        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: 'default',
          animated: false,
          style: {
            stroke,
            strokeWidth,
            opacity: connectedToSelected
              ? 1
              : bothHacked
                ? 0.9
                : 0.55,
          },
          zIndex: connectedToSelected ? 10 : 0,
        };
      }),
    [edges, nodeStatusMap, selectedNodeId],
  );

  // 初期表示を入口ノード（E01 または External階層の先頭ノード）付近に設定
  useEffect(() => {
    if (!flowReady || nodes.length === 0) return;

    const entryNode =
      nodes.find((node) => stage.entryNodeIds.includes(node.id)) ??
      nodes.find((node) => node.layer === 'External') ??
      nodes[0];
    const container = containerRef.current;

    if (!entryNode || !container || initializedEntryId.current === entryNode.id) return;

    // マップの中は実際の画面ピクセルで動くので、デザイン上の幅に倍率を掛ける
    const width = container.clientWidth * uiScale;
    if (width === 0) return;

    const nodeWidth = 180;
    const initialZoom = uiScale;

    setViewport(
      {
        x:
          width / 2 -
          (entryNode.position.x + nodeWidth / 2) *
            initialZoom,
        y: 65 * uiScale - entryNode.position.y * initialZoom,
        zoom: initialZoom,
      },
      { duration: 0 },
    );

    initializedEntryId.current = entryNode.id;
    appliedScale.current = uiScale;
  }, [flowReady, nodes, setViewport, stage, uiScale]);

  // ウィンドウの大きさが変わって倍率が変わったら、見えている範囲を保ったままズームを合わせ直す
  useEffect(() => {
    const ratio = uiScale / appliedScale.current;
    if (ratio === 1) return;
    const { x, y, zoom } = getViewport();
    setViewport({ x: x * ratio, y: y * ratio, zoom: zoom * ratio }, { duration: 0 });
    appliedScale.current = uiScale;
  }, [uiScale, getViewport, setViewport]);

  return (
    <div className="map-view" ref={containerRef}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        translateExtent={MAP_BOUNDS}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onInit={() => setFlowReady(true)}
        fitView={false}
        minZoom={0.45 * uiScale}
        maxZoom={1.6 * uiScale}
        zoomOnScroll={false}
        zoomOnPinch={true}
        zoomOnDoubleClick={false}
        panOnScroll={true}
        panOnScrollMode={PanOnScrollMode.Vertical}
        panOnDrag={true}
        nodesDraggable={false}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#2a2e38" gap={24} />

        <Controls
          showInteractive={false}
          position="bottom-left"
        />
      </ReactFlow>
    </div>
  );
}

export function MapView(props: MapViewProps) {
  return (
    <ReactFlowProvider>
      <MapContent {...props} />
    </ReactFlowProvider>
  );
}
