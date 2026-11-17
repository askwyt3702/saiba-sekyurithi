import { getBezierPath, type Edge, type EdgeProps } from '@xyflow/react';

export interface ThreatEdgeData {
  /** intent: 次のターンの攻撃予告(赤い点線の矢印) / attack: 今まさに攻撃中(パケットが飛ぶ) */
  mode: 'intent' | 'attack';
  /** 線の向き(source→target)と、攻撃の向きが逆なら true。矢印とパケットを攻撃の向きに合わせる */
  reverse: boolean;
  /** 同じ線で攻撃が続いても、パケットのアニメーションを最初から再生し直すためのキー */
  playKey?: string;
  [key: string]: unknown;
}

export type ThreatFlowEdge = Edge<ThreatEdgeData, 'threat'>;

// ARGUS の攻撃を線の上に見せる線。攻撃する側 → される側の向きで描く。
export function TerritoryThreatEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps<ThreatFlowEdge>) {
  const reverse = Boolean(data?.reverse);
  const [path] = getBezierPath(
    reverse
      ? { sourceX: targetX, sourceY: targetY, sourcePosition: targetPosition, targetX: sourceX, targetY: sourceY, targetPosition: sourcePosition }
      : { sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition },
  );
  const mode = data?.mode ?? 'intent';

  return (
    <>
      <path
        id={id}
        d={path}
        fill="none"
        className={`react-flow__edge-path tw-threat-edge tw-threat-edge--${mode}`}
        markerEnd={markerEnd}
      />
      {mode === 'attack' && (
        // 先頭の大きな光と、少し遅れて続く小さな光で「パケット群」に見せる
        <g key={data?.playKey} className="tw-packets">
          {[0, 0.08, 0.16].map((delay, i) => (
            <circle key={i} r={i === 0 ? 7 : 4} className={i === 0 ? 'tw-packet tw-packet--lead' : 'tw-packet'} opacity={0}>
              <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.85;1" dur="0.62s" begin={`${delay}s`} fill="freeze" />
              <animateMotion dur="0.62s" begin={`${delay}s`} fill="freeze" path={path} />
            </circle>
          ))}
        </g>
      )}
    </>
  );
}
