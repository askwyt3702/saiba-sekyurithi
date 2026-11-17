
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
import { DEFAULT_STAGE_ID } from '../../game/data/stageData';
import { resolveStageView } from '../../game/model/dynamicStageHelper';
import { useUiScale } from '../../useUiScale';
import { missingGateRequirements, monitoringExtra } from '../../game/model/actionRules';

import type {
  ApiNetworkEdge,
  DynamicMapInfo,
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
  dynamicMap?: DynamicMapInfo;
  nodes: NetworkNode[];
  edges: ApiNetworkEdge[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

function MapContent({
  stageId = DEFAULT_STAGE_ID,
  dynamicMap,
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
}: MapViewProps) {
  const stage = resolveStageView(stageId, dynamicMap);
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
      nodes.map((node) => {
        const isEntry = stage.entryNodeIds.includes(node.id);
        const trapState = dynamicMap?.triggeredTraps.includes(node.id)
          ? 'triggered'
          : dynamicMap?.flaggedTraps.includes(node.id)
            ? 'flagged'
            : undefined;
        const argusReinforced = Boolean(
          dynamicMap && !dynamicMap.argusDisabled && dynamicMap.argusReinforced.includes(node.id),
        );
        const reachable =
          !trapState && node.status !== 'hacked' && (reachableNodeIds.has(node.id) || isEntry);
        return {
          id: node.id,
          type: 'networkNode',
          position: node.position,
          data: {
            node,
            selected: node.id === selectedNodeId,
            isEntry,
            reachable,
            trapState,
            argusReinforced,
            isMonitored: stage.conditionalBreachAlert?.targetNodeIds.includes(node.id),
            monitoringExtra: monitoringExtra(node.id, nodes, stage),
            gateState: stage.breachRequirements[node.id]
              ? node.status === 'hacked' ? 'hacked' : missingGateRequirements(node.id, nodes, stage).length ? 'locked' : 'unlocked'
              : undefined,
            effect: stage.nodeEffects[node.id],
            isKeyFragment: stage.keyFragmentNodeIds.includes(node.id),
          },
          draggable: false,
          className: reachable ? 'map-node--reachable' : '',
        };
      }),
    [nodes, selectedNodeId, reachableNodeIds, stage, dynamicMap],
  );

  // 接続線
  const flowEdges: Edge[] = useMemo(
    () =>
      edges.map((edge) => {
        const sourceStatus = nodeStatusMap.get(edge.source);
        const targetStatus = nodeStatusMap.get(edge.target);

        const sourceHacked = sourceStatus === 'hacked';
        const targetHacked = targetStatus === 'hacked';
        const bothHacked = sourceHacked && targetHacked;
        const frontierEdge = sourceHacked !== targetHacked;

        const connectedToSelected =
          selectedNodeId !== null &&
          (edge.source === selectedNodeId ||
            edge.target === selectedNodeId);

        let stroke = '#3c6e63';
        let strokeWidth = 1.8;
        let opacity = 0.72;
        let strokeDasharray: string | undefined;

        if (frontierEdge) {
          stroke = '#fbbf24';
          strokeWidth = 2.1;
          opacity = 0.88;
          strokeDasharray = '6 4';
        }

        if (bothHacked) {
          stroke = '#00ff64';
          strokeWidth = 2.5;
          opacity = 0.92;
          strokeDasharray = undefined;
        }

        if (connectedToSelected) {
          stroke = '#22f2d0';
          strokeWidth = 2.8;
          opacity = 1;
        }

        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: 'default',
          animated: bothHacked,
          style: {
            stroke,
            strokeWidth,
            strokeDasharray,
            opacity,
          },
          zIndex: connectedToSelected ? 10 : bothHacked ? 5 : 0,
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
        <Background color="#164e63" gap={28} />

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
