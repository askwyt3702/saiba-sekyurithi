import type {
  ActionRejectReason,
  ActionRequest,
  ActionResult,
  GameClient,
  GameState,
  NetworkLayer,
  NetworkNode,
  ServerEvent,
} from '../model/types';
import { balanceConfig } from '../data/balanceConfig';
import { createMockGameState } from '../data/mockGameState';

function nextId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clampAlert(value: number): number {
  return Math.min(100, Math.max(0, value));
}

// 権限の値一覧は backend でまだ定義されていない(確認できているのは "GUEST" のみ)ため、
// プロトタイプとして layer の並びに対応させた仮の序列を置いている。backendが決まり次第差し替える。
const PRIVILEGE_LADDER = ['GUEST', 'USER', 'ADMIN', 'ROOT'] as const;
const LAYER_ORDER: NetworkLayer[] = ['External', 'DMZ', 'Internal', 'Core'];

function privilegeIndex(privilege: string): number {
  const index = PRIVILEGE_LADDER.indexOf(privilege as (typeof PRIVILEGE_LADDER)[number]);
  return index === -1 ? 0 : index;
}

function layerRequirement(layer: NetworkLayer): number {
  return LAYER_ORDER.indexOf(layer);
}

type TimedActionType = 'scan' | 'breach' | 'dataExtract';

// ターン制なので各アクションはリアルタイムの遅延なしに即座に確定する。
// 「time」コストはゲーム内時間を進める量として扱うだけで、実際の待ち時間ではない
// (backend/game_logic.py の apply_action / _advance_time と同じ考え方)。
// バックエンド未完成の間、UIをそのまま開発・動作確認できるようにするための
// GameClient のダミー実装。WebSocketGameClient と同じインターフェースを満たす。
export class MockGameClient implements GameClient {
  private state: GameState;
  private onEvent: ((event: ServerEvent) => void) | null = null;

  constructor(gameId: string) {
    this.state = createMockGameState(gameId);
  }

  connect(onEvent: (event: ServerEvent) => void): Promise<GameState> {
    this.onEvent = onEvent;
    this.emit({ type: 'state_snapshot', state: this.cloneState() });
    return Promise.resolve(this.cloneState());
  }

  disconnect(): void {
    this.onEvent = null;
  }

  sendAction(action: ActionRequest): Promise<ActionResult> {
    switch (action.type) {
      case 'pause':
        if (this.state.status !== 'playing') return Promise.resolve({ accepted: false, reason: 'invalid_state' });
        this.state.status = 'paused';
        this.log('info', '作戦を一時停止しました。');
        this.emit({ type: 'state_snapshot', state: this.cloneState() });
        return Promise.resolve({ accepted: true });
      case 'resume':
        if (this.state.status !== 'paused') return Promise.resolve({ accepted: false, reason: 'invalid_state' });
        this.state.status = 'playing';
        this.log('info', '作戦を再開しました。');
        this.emit({ type: 'state_snapshot', state: this.cloneState() });
        return Promise.resolve({ accepted: true });
      case 'scan':
      case 'breach':
      case 'dataExtract':
        return Promise.resolve(this.applyTimedAction(action, action.type));
      default:
        return Promise.resolve({ accepted: false, reason: 'invalid_state' });
    }
  }

  private applyTimedAction(action: ActionRequest, type: TimedActionType): ActionResult {
    if (this.state.status !== 'playing') return { accepted: false, reason: 'invalid_state' };

    const node = this.state.nodes.find((n) => n.id === action.nodeId);
    if (!node) return { accepted: false, reason: 'invalid_state' };

    const rejection = this.validate(type, node);
    if (rejection) return { accepted: false, reason: rejection };

    const cost = balanceConfig[type];
    this.state.analysisResource -= cost.resource;
    this.advanceTime(cost.time, cost.alertDelta);
    this.resolveAction(type, node);
    this.checkGameOver();

    this.emit({ type: 'state_snapshot', state: this.cloneState() });
    return { accepted: true };
  }

  private validate(
    type: TimedActionType,
    node: NetworkNode,
  ): ActionRejectReason | undefined {
    const cost = balanceConfig[type];
    if (this.state.analysisResource < cost.resource) return 'insufficient_resource';

    if (type === 'scan') {
      if (node.status !== 'unscanned') return 'invalid_state';
    } else if (type === 'breach') {
      if (node.status !== 'scanned') return 'node_not_scanned';
      if (privilegeIndex(this.state.privilege) < layerRequirement(node.layer)) {
        return 'insufficient_privilege';
      }
    } else {
      if (node.layer !== 'Core' || node.status !== 'hacked') return 'invalid_state';
    }
    return undefined;
  }

  // backend/game_logic.py の _advance_time と同じ式: 消費した時間ぶんの自然減衰を
  // 差し引いてからアクション分のalertDeltaを足す。
  private advanceTime(seconds: number, alertDelta: number): void {
    this.state.elapsedSeconds += seconds;
    this.state.alertLevel = clampAlert(
      this.state.alertLevel - balanceConfig.alertDecayPerSecond * seconds + alertDelta,
    );
  }

  private resolveAction(type: TimedActionType, node: NetworkNode): void {
    if (type === 'scan') {
      node.status = 'scanned';
      node.vulnerability = '未パッチの脆弱性(詳細診断で判明予定)';
      this.log('success', `${node.name} のスキャンが完了しました。`);
    } else if (type === 'breach') {
      node.status = 'hacked';
      const nextIndex = Math.min(privilegeIndex(this.state.privilege) + 1, PRIVILEGE_LADDER.length - 1);
      if (nextIndex > privilegeIndex(this.state.privilege)) {
        this.state.privilege = PRIVILEGE_LADDER[nextIndex];
        this.log('success', `${node.name} への侵入に成功。権限が ${this.state.privilege} に昇格しました。`);
      } else {
        this.log('success', `${node.name} への侵入に成功しました。`);
      }
    } else {
      this.state.status = 'won';
      this.log('success', `${node.name} からデータを回収しました。目的達成。`);
      this.emit({ type: 'game_over', result: 'won' });
    }
  }

  private checkGameOver(): void {
    if (this.state.status === 'playing' && this.state.alertLevel >= 100) {
      this.state.status = 'lost';
      this.log('danger', '警戒度が限界に達しました。侵入が検知され、作戦は失敗です。');
      this.emit({ type: 'game_over', result: 'lost' });
    }
  }

  private log(severity: 'info' | 'success' | 'warning' | 'danger', message: string): void {
    const entry = {
      id: nextId(),
      timestamp: this.state.elapsedSeconds,
      message,
      severity,
    };
    this.state.log.push(entry);
    this.emit({ type: 'log', entry });
  }

  private emit(event: ServerEvent): void {
    this.onEvent?.(event);
  }

  private cloneState(): GameState {
    return {
      ...this.state,
      nodes: this.state.nodes.map((n) => ({ ...n, position: { ...n.position } })),
      edges: this.state.edges.map((e) => ({ ...e })),
      log: [...this.state.log],
    };
  }
}
