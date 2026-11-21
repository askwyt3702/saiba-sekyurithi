// 分岐マップの画面。マスを終えるたびに出て、線でつながった次のマスを選ぶ。
// 上のバーの「マップ」ボタンからは、選べない状態(見るだけ)で開く。
// マップの作り方は game/deckbattle/map.ts、進み方は run.ts の moveToNode。
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { describeEnemyGroup } from '../../game/deckbattle/enemies';
import type { GameIconName } from '../../game/deckbattle/icons';
import { floorName, MAP_COLUMNS, MAP_TOTAL_FLOORS } from '../../game/deckbattle/map';
import { getCurrentFloor, getCurrentNode } from '../../game/deckbattle/run';
import type { RunNode, RunNodeKind, RunState } from '../../game/deckbattle/types';
import { GameIcon } from '../GameIcon/GameIcon';
import './RunMap.css';

const NODE_INFO: Record<RunNodeKind, { icon: GameIconName; label: string; description: string }> = {
  start: { icon: 'start', label: '起動', description: 'スタート地点。出発前の強化を1つ選ぶ。' },
  battle: { icon: 'battle', label: '戦闘', description: 'ふつうの敵と戦う。勝つとカード報酬。' },
  elite: { icon: 'elite', label: '強敵', description: '強い敵。勝つと経験値2倍・レアカード確定・解析コイン。' },
  event: { icon: 'quiz', label: 'クイズ', description: 'セキュリティの3択クイズ。正解するほど報酬が良くなる。' },
  mystery: { icon: 'mystery', label: 'ハプニング', description: 'ランダムな出来事。HPを払って見返りを狙うか選ぶ。' },
  shop: { icon: 'shop', label: '闇市', description: '解析コインで回復・ツール・カード削除・常駐ツール。' },
  rest: { icon: 'rest', label: '休憩', description: 'HPを回復するか、カードを強化・削除する。' },
  boss: { icon: 'boss', label: 'ボス', description: '監視AI ARGUS。倒せばクリア。' },
};

/** マスの説明(敵の名前やクイズの種類まで) */
function describeMapNode(node: RunNode): string {
  const info = NODE_INFO[node.kind];
  if ((node.kind === 'battle' || node.kind === 'elite' || node.kind === 'boss') && node.enemyIds) {
    return `${info.label}:${describeEnemyGroup(node.enemyIds)}`;
  }
  if (node.kind === 'event') return `${info.label}:${node.eventId === 'patch' ? 'パッチ適用' : '脆弱性診断'}`;
  return info.label;
}

const CW = 78;
const RH = 64;
const PAD_X = 92;
const PAD_Y = 40;

interface RunMapViewProps {
  run: RunState;
  /** 次のマスを選んだとき(省略すると見るだけ) */
  onChoose?: (nodeId: string) => void;
  /** 見るだけで開いたときの「閉じる」 */
  onClose?: () => void;
  /** 右の欄に出す中身(起動ノードの強化など) */
  side?: ReactNode;
}

export function RunMapView({ run, onChoose, onClose, side }: RunMapViewProps) {
  const { map } = run;
  const current = getCurrentNode(run);
  const canChoose = Boolean(onChoose) && run.status === 'playing' && run.startBonusChoices.length === 0;
  const reachable = new Set(canChoose ? current.next : []);
  const visited = new Set(run.visitedNodeIds);
  const taken = new Set(run.visitedNodeIds.slice(1).map((id, i) => `${run.visitedNodeIds[i]}>${id}`));
  const [focusId, setFocusId] = useState<string | null>(null);
  const focus = focusId ? map.nodes[focusId] : null;
  const boxRef = useRef<HTMLDivElement>(null);

  // 今いるマスが見えるように、マップの縦の位置を合わせる
  const height = PAD_Y * 2 + (MAP_TOTAL_FLOORS - 1) * RH;
  const width = PAD_X + (MAP_COLUMNS - 1) * CW + 44;
  const y = (n: RunNode) => PAD_Y + (MAP_TOTAL_FLOORS - 1 - n.floor) * RH;
  const x = (n: RunNode) => PAD_X + n.col * CW;
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ratio = y(current) / height;
    box.scrollTop = Math.max(0, ratio * box.scrollHeight - box.clientHeight * 0.65);
    // 今いるマスが変わったときだけ合わせる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id]);

  // 今いるマスから行けなくなったマスは暗くする
  const alive = new Set<string>();
  const stack = [current.id];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (alive.has(id)) continue;
    alive.add(id);
    stack.push(...map.nodes[id].next);
  }

  const nodes = Object.values(map.nodes);
  return (
    <main className="rm-wrap" aria-label="分岐マップ">
      <section className="rm-panel rm-map-panel">
        <div className="rm-head">
          <span className="rm-label">NETWORK MAP</span>
          <span className="rm-floor">
            FLOOR {String(getCurrentFloor(run)).padStart(2, '0')} / {MAP_TOTAL_FLOORS}
          </span>
          {onClose && (
            <button type="button" className="db-btn db-btn--ghost" onClick={onClose}>
              閉じる
            </button>
          )}
        </div>
        <div className="rm-box" ref={boxRef}>
          <svg className="rm-svg" viewBox={`0 0 ${width} ${height}`} role="group" aria-label="ルートのマップ">
            {Array.from({ length: MAP_TOTAL_FLOORS }, (_, f) => {
              const by = PAD_Y + (MAP_TOTAL_FLOORS - 1 - f) * RH;
              return (
                <g key={`band-${f}`}>
                  <rect className={`rm-band${f % 2 ? ' rm-band--alt' : ''}`} x={0} y={by - RH / 2} width={width} height={RH} />
                  <text className="rm-band-label" x={10} y={by + 4}>
                    {String(f + 1).padStart(2, '0')} {floorName(f)}
                  </text>
                </g>
              );
            })}
            {nodes.flatMap((n) =>
              n.next.map((nextId) => {
                const m = map.nodes[nextId];
                const cls = taken.has(`${n.id}>${nextId}`)
                  ? 'rm-edge rm-edge--taken'
                  : n.id === current.id && reachable.has(nextId)
                    ? 'rm-edge rm-edge--next'
                    : 'rm-edge';
                return <line key={`${n.id}>${nextId}`} className={cls} x1={x(n)} y1={y(n)} x2={x(m)} y2={y(m)} />;
              }),
            )}
            {nodes.map((n) => {
              const info = NODE_INFO[n.kind];
              const big = n.kind === 'boss' ? 26 : n.kind === 'start' ? 22 : 18;
              const icon = big * 0.95;
              const canGo = reachable.has(n.id);
              const cls = [
                'rm-node',
                `rm-node--${n.kind}`,
                visited.has(n.id) ? 'rm-node--visited' : '',
                n.id === current.id ? 'rm-node--current' : '',
                canGo ? 'rm-node--reach' : '',
                !alive.has(n.id) && !visited.has(n.id) ? 'rm-node--dead' : '',
              ]
                .filter(Boolean)
                .join(' ');
              const label = `${n.floor + 1}段目 ${describeMapNode(n)}${canGo ? '(選べる)' : ''}`;
              return (
                <g
                  key={n.id}
                  className={cls}
                  role={canGo ? 'button' : undefined}
                  tabIndex={canGo ? 0 : undefined}
                  aria-label={label}
                  onClick={canGo ? () => onChoose?.(n.id) : undefined}
                  onKeyDown={
                    canGo
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onChoose?.(n.id);
                          }
                        }
                      : undefined
                  }
                  onMouseEnter={() => setFocusId(n.id)}
                  onMouseLeave={() => setFocusId((prev) => (prev === n.id ? null : prev))}
                  onFocus={() => setFocusId(n.id)}
                >
                  <title>{label}</title>
                  <rect className="rm-ring" x={x(n) - big} y={y(n) - big} width={big * 2} height={big * 2} />
                  <foreignObject x={x(n) - icon / 2} y={y(n) - icon / 2} width={icon} height={icon} className="rm-icon">
                    <GameIcon name={info.icon} />
                  </foreignObject>
                </g>
              );
            })}
          </svg>
        </div>
        <p className="rm-hint" role="status">
          {run.startBonusChoices.length > 0
            ? '起動ノードで、出発前の強化を1つ選ぶ。'
            : canChoose
              ? '光っているマスから、次に進む先を選ぶ。'
              : 'マップを見ているだけ。閉じると元の画面に戻る。'}
        </p>
      </section>

      <aside className="rm-side">
        {side}
        <section className="rm-panel">
          <span className="rm-label">NODE INFO</span>
          {focus ? (
            <div className="rm-focus">
              <div className="rm-focus__name">
                <GameIcon name={NODE_INFO[focus.kind].icon} /> {focus.floor + 1}段目 {describeMapNode(focus)}
              </div>
              <p className="rm-focus__desc">{NODE_INFO[focus.kind].description}</p>
            </div>
          ) : (
            <p className="rm-focus__desc">マスにカーソルを合わせると、中身が出る。</p>
          )}
        </section>
        <section className="rm-panel">
          <span className="rm-label">NODE TYPES</span>
          <ul className="rm-legend">
            {(Object.keys(NODE_INFO) as RunNodeKind[]).map((kind) => (
              <li key={kind} className={`rm-legend__item rm-node--${kind}`}>
                <span className="rm-legend__icon">
                  <GameIcon name={NODE_INFO[kind].icon} />
                </span>
                <span>{NODE_INFO[kind].label}</span>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </main>
  );
}
