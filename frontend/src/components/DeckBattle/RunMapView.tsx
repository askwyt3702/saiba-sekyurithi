// 分岐マップの表示。ノード間の接続と進行条件は run.ts のルールを参照する。
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { describeEnemyGroup } from '../../game/deckbattle/enemies';
import type { GameIconName } from '../../game/deckbattle/icons';
import { floorName, MAP_TOTAL_FLOORS } from '../../game/deckbattle/map';
import { getCurrentNode, getNextNodes, START_BONUS_CHOICES } from '../../game/deckbattle/run';
import type { RunMap, RunNode, RunNodeKind, RunState } from '../../game/deckbattle/types';
import { GameIcon } from '../GameIcon/GameIcon';
import './RunMap.css';

const NODE_INFO: Record<RunNodeKind, { icon: GameIconName; label: string; detail: string; reward: string }> = {
  start: { icon: 'start', label: '起動', detail: '出発前の準備をする。', reward: `${START_BONUS_CHOICES}つの候補から、ランの開始時に受け取る強化を1つ選ぶ。` },
  battle: { icon: 'battle', label: '戦闘', detail: '通常の敵とカードで戦う。', reward: '勝利するとカード報酬と、使ったカードの経験値を獲得。解析コインが落ちることもある。' },
  elite: { icon: 'elite', label: '強敵', detail: '通常より手強い敵と戦う。', reward: '勝利すると経験値2倍、レアカードを含む報酬候補、解析コイン1枚。' },
  event: { icon: 'quiz', label: 'クイズ', detail: 'セキュリティに関する3択問題に答える。', reward: 'カードの経験値など。正解を重ねるほど報酬が増える。' },
  mystery: { icon: 'mystery', label: 'ハプニング', detail: '予期せぬ出来事が起こる。内容を見て行動を選ぶ。', reward: 'カードやコインなど、出来事と選択によって変わる。' },
  shop: { icon: 'shop', label: '闇市', detail: '解析コインを使って補給する。', reward: 'HP回復、ツール、カード削除、常駐ツールなどと交換できる。' },
  rest: { icon: 'rest', label: '休憩', detail: '戦闘を休んで、回線やデッキを整える。', reward: 'HP回復・カード強化・カード削除から1つ選ぶ。' },
  boss: { icon: 'boss', label: 'ボス', detail: '最上階で監視AI「ARGUS」に挑む。', reward: '撃破するとランをクリア。' },
};

const FLOOR_LABELS: Record<string, string> = {
  BOOT: '起動', EARLY: '序盤', MID: '中盤', SUPPLY: '補給',
  LATE: '終盤', REST: '休憩', BOSS: '最終戦',
};
const FLOORS = Array.from({ length: MAP_TOTAL_FLOORS }, (_, floor) => floor);
const GRAPH_WIDTH = 1000;
const ROW_HEIGHT = 102;
const NODE_HALF_HEIGHT = 29;
const GRAPH_HEIGHT = ROW_HEIGHT * MAP_TOTAL_FLOORS;
const MOVE_MS = 180;
const x = (node: RunNode) => 152 + node.col * 125;
const y = (floor: number) => GRAPH_HEIGHT - (floor + .5) * ROW_HEIGHT;

const STATUS = {
  current: '現在地', next: '選択可能', visited: '通過済み', future: '未到達',
} as const;
type NodeStatus = keyof typeof STATUS;

// 同じラン・現在地で開き直したときだけ、直前のスクロール位置を復元する。
const scrollPositions = new WeakMap<RunMap, Map<string, number>>();

function nodeDetail(node: RunNode) {
  if (node.enemyIds?.length) return describeEnemyGroup(node.enemyIds);
  if (node.kind === 'event') return node.eventId === 'patch' ? 'パッチ適用（修正プログラム）' : '脆弱性診断（弱点の見つけ方）';
  return '';
}

function revealFloor(box: HTMLDivElement, floor: number, smooth = false) {
  const top = y(floor) - box.clientHeight * .69;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  box.scrollTo({ top, behavior: smooth && !reduceMotion ? 'smooth' : 'instant' });
}

interface RunMapViewProps {
  run: RunState;
  onChoose?: (nodeId: string) => void;
  onClose?: () => void;
}

export function RunMapView({ run, onChoose, onClose }: RunMapViewProps) {
  const { map } = run;
  const current = getCurrentNode(run);
  const canChoose = Boolean(onChoose) && run.status === 'playing' &&
    run.startBonusChoices.length === 0 && run.pendingEvolutions.length === 0;
  const reachable = new Set(canChoose ? getNextNodes(run).map(({ id }) => id) : []);
  const visited = new Set(run.visitedNodeIds);
  const taken = new Set(run.visitedNodeIds.slice(1).map((id, i) => `${run.visitedNodeIds[i]}>${id}`));
  const statusOf = (id: string): NodeStatus => id === current.id ? 'current'
    : reachable.has(id) ? 'next' : visited.has(id) ? 'visited' : 'future';

  const [selectedId, setSelectedId] = useState(current.id);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(true);
  const [inspectOnly, setInspectOnly] = useState(false);
  const [moving, setMoving] = useState<{ id: string; deadline: number } | null>(null);
  const [moveError, setMoveError] = useState(false);
  const moveLocked = useRef(false);
  const selected = map.nodes[selectedId] ?? current;
  const inspected = hoveredId ? map.nodes[hoveredId] ?? selected : selected;
  const info = NODE_INFO[inspected.kind];
  const detail = nodeDetail(inspected);
  const infoId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const readOnly = Boolean(onClose);
  const scrollKey = `${readOnly ? 'view' : 'route'}:${current.id}`;

  useLayoutEffect(() => {
    if (!readOnly) return;
    const opener = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      if (opener instanceof HTMLElement) opener.focus({ preventScroll: true });
    };
  }, [readOnly]);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let positions = scrollPositions.get(map);
    if (!positions) {
      positions = new Map();
      scrollPositions.set(map, positions);
    }
    const saved = positions.get(scrollKey);
    if (saved === undefined) revealFloor(box, current.floor);
    else box.scrollTop = saved;
    return () => { positions.set(scrollKey, box.scrollTop); };
  }, [map, scrollKey, current.floor]);

  const reveal = (floor: number) => {
    if (boxRef.current) revealFloor(boxRef.current, floor, true);
  };

  const finishMove = useCallback((nodeId: string) => {
    try {
      onChoose?.(nodeId);
    } catch {
      moveLocked.current = false;
      setMoving(null);
      setMoveError(true);
    }
  }, [onChoose]);

  useEffect(() => {
    if (!moving) return;
    const timer = window.setTimeout(() => finishMove(moving.id), Math.max(0, moving.deadline - performance.now()));
    return () => window.clearTimeout(timer);
  }, [moving, finishMove]);

  const activateNode = (nodeId: string) => {
    if (moveLocked.current) return;
    setSelectedId(nodeId);
    setHoveredId(null);
    if (inspectOnly || !reachable.has(nodeId)) {
      setInfoOpen(true);
      return;
    }
    moveLocked.current = true;
    setMoveError(false);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) finishMove(nodeId);
    else setMoving({ id: nodeId, deadline: performance.now() + MOVE_MS });
  };

  const nodes = Object.values(map.nodes).sort((a, b) => a.floor - b.floor || a.col - b.col);
  const edges = nodes.flatMap((from) => from.next.map((nextId) => {
    const to = map.nodes[nextId];
    const id = `${from.id}>${to.id}`;
    const style = taken.has(id) ? 'taken' : from.id === current.id && reachable.has(nextId) ? 'next' : 'future';
    const start = y(from.floor) - NODE_HALF_HEIGHT;
    const end = y(to.floor) + NODE_HALF_HEIGHT;
    const mid = (start + end) / 2;
    return { id, style, moving: from.id === current.id && moving?.id === to.id,
      d: `M ${x(from)} ${start} C ${x(from)} ${mid}, ${x(to)} ${mid}, ${x(to)} ${end}` };
  }));

  return (
    <main className={`rm-wrap${infoOpen ? ' rm-wrap--sidebar' : ''}`} aria-label="分岐マップ"
      onKeyDown={(event) => {
        if (!onClose) return;
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
        if (event.key === 'Tab') {
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
            .filter((button) => !button.closest('[hidden]'));
          const first = buttons[0];
          const last = buttons.at(-1);
          if (event.shiftKey ? event.target === first : event.target === last) {
            event.preventDefault();
            (event.shiftKey ? last : first)?.focus();
          }
        }
      }}>
      {Object.entries(NODE_INFO).map(([kind, content]) => (
        <span hidden key={kind} id={`${infoId}-${kind}`}>{content.detail} {content.reward}</span>
      ))}
      <section className="rm-panel rm-map-panel">
        <header className="rm-head">
          <h2 className="rm-label">ルートマップ</h2>
          <strong className="rm-floor">{current.floor + 1} / {MAP_TOTAL_FLOORS} 階層</strong>
          <button type="button" className="db-btn db-btn--ghost" onClick={() => reveal(current.floor)}>
            <GameIcon name="target" /> 現在地へ戻る
          </button>
          <button type="button" className="db-btn db-btn--ghost" aria-expanded={infoOpen} aria-controls={infoId}
            onClick={() => setInfoOpen(!infoOpen)}>
            {infoOpen ? '詳細をたたむ' : '詳細を開く'}
          </button>
          {canChoose && (
            <button type="button" className="db-btn db-btn--ghost rm-inspect-toggle"
              aria-pressed={inspectOnly} disabled={moving !== null}
              onClick={() => {
                setInspectOnly(!inspectOnly);
                if (!inspectOnly) setInfoOpen(true);
              }}>
              詳細モード
            </button>
          )}
          {onClose && <button ref={closeRef} type="button" className="db-btn db-btn--ghost" onClick={onClose}>閉じる</button>}
        </header>
        <div className="rm-overview">
          <ol className="rm-progress" aria-label="全階層の進捗">
            {FLOORS.map((floor) => (
              <li key={floor}>
                <button type="button" aria-current={floor === current.floor ? 'step' : undefined}
                  className={floor < current.floor ? 'rm-progress__passed' : undefined}
                  aria-label={`${floor + 1}階層 ${FLOOR_LABELS[floorName(floor)]}を表示`}
                  onClick={() => reveal(floor)}>{floor + 1}</button>
              </li>
            ))}
          </ol>
          <span className="rm-direction">↑ 上へスクロール · 上がボス</span>
        </div>

        <div className="rm-box" ref={boxRef} aria-label="階層マップ">
          <div className="rm-graph" style={{ height: GRAPH_HEIGHT }}>
            {FLOORS.map((floor) => (
              <div key={floor} className={`rm-band${floor === current.floor ? ' rm-band--current' : ''}`}
                style={{ top: y(floor) - ROW_HEIGHT / 2, height: ROW_HEIGHT }} aria-hidden="true">
                <span><strong>{String(floor + 1).padStart(2, '0')}</strong>{FLOOR_LABELS[floorName(floor)]}</span>
              </div>
            ))}
            <svg className="rm-edges" viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
              {(['future', 'taken', 'next'] as const).map((style) => (
                <g key={style} className={`rm-edge--${style}`}>
                  {edges.filter((edge) => edge.style === style).map(({ id, d, moving: active }) => (
                    <path key={id} className={active ? 'rm-edge--moving' : undefined} d={d} vectorEffect="non-scaling-stroke" />
                  ))}
                </g>
              ))}
            </svg>
            {nodes.map((node) => {
              const status = statusOf(node.id);
              const { icon, label } = NODE_INFO[node.kind];
              const specifics = nodeDetail(node);
              return (
                <button key={node.id} type="button"
                  className={`rm-node rm-node--${node.kind} rm-node--${status}${selected.id === node.id ? ' rm-node--inspected' : ''}${moving?.id === node.id ? ' rm-node--moving' : ''}`}
                  style={{ left: `${x(node) / GRAPH_WIDTH * 100}%`, top: y(node.floor) }}
                  aria-current={status === 'current' ? 'location' : undefined}
                  aria-disabled={moving ? true : undefined}
                  aria-label={`${node.floor + 1}階層 ${label} ${STATUS[status]} ${specifics}${inspectOnly ? ' · 詳細を表示' : ''}`.trim()}
                  aria-describedby={`${infoId}-${node.kind}`}
                  onPointerEnter={(event) => {
                    if (event.pointerType !== 'mouse' || moveLocked.current) return;
                    setHoveredId(node.id);
                    setSelectedId(node.id);
                  }}
                  onPointerLeave={() => setHoveredId(null)}
                  onFocus={() => {
                    if (moveLocked.current) return;
                    setHoveredId(node.id);
                    setSelectedId(node.id);
                  }}
                  onBlur={() => setHoveredId(null)}
                  onClick={() => activateNode(node.id)}>
                  <span className="rm-node__type"><GameIcon name={icon} />{label}</span>
                  <span className="rm-node__status">
                    {status === 'current' && <GameIcon name="target" />}
                    {status === 'visited' && <GameIcon name="check" />}
                    {status === 'next' && <span aria-hidden="true">↑</span>}
                    {STATUS[status]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {!infoOpen && hoveredId && (
          <div className="rm-peek">
            <strong>{inspected.floor + 1}階層 · {info.label}{detail ? ` · ${detail}` : ''}</strong>
            <span>{info.detail} {info.reward}</span>
          </div>
        )}
        <footer className="rm-footer">
          {moveError ? (
            <span className="rm-move-error" role="alert">移動できませんでした。選択可能なマスをもう一度選んでください。</span>
          ) : (
            <span role="status">{moving ? '接続中…' : inspectOnly ? '詳細モード中 · タップで確認。移動するにはモードを解除' :
              canChoose ? '選択可能なマスを1回選ぶと移動' : onClose ? '閲覧モード' : 'ノードにカーソルを合わせると詳細を表示'}</span>
          )}
          <ul className="rm-legend" aria-label="マップの凡例">
            <li><GameIcon name="target" /> 現在地</li>
            <li className="rm-legend--next">選択可能</li>
            <li className="rm-legend--taken"><GameIcon name="check" /> 通過済み</li>
            <li className="rm-legend--future">未到達</li>
          </ul>
        </footer>
      </section>

      <aside className="rm-side" hidden={!infoOpen}>
        <section className="rm-panel rm-info" id={infoId} hidden={!infoOpen} aria-label="ノード詳細">
          <h2 className="rm-label">ノード詳細</h2>
          <div className="rm-focus">
            <span className={`rm-badge rm-badge--${statusOf(inspected.id)}`}>{STATUS[statusOf(inspected.id)]} · {inspected.floor + 1}階層</span>
            <h3 className="rm-focus__name"><GameIcon name={info.icon} />{info.label}</h3>
            {detail && <p className="rm-focus__detail">{detail}</p>}
            <p>{info.detail}</p>
            <h4>報酬・メリット</h4>
            <p>{info.reward}</p>
          </div>
        </section>
      </aside>
    </main>
  );
}
