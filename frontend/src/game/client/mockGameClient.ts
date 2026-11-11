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
import {
  isExtractTarget,
  MAX_ANALYSIS_RESOURCE,
  RESOURCE_RECOVERY_AMOUNT,
  RECOVERY_COST,
  RESOURCE_REWARDS,
  ENTRY_LAYERS,
  KEY_FRAGMENT_NODE_IDS,
  NODE_EFFECTS,
  STAGE_VULNERABILITIES,
} from '../data/stageData';

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

type TimedActionType = 'scan' | 'remoteScan' | 'breach' | 'dataExtract';

// ターン制なので各アクションはリアルタイムの遅延なしに即座に確定する。
// 「time」コストはゲーム内時間を進める量として扱うだけで、実際の待ち時間ではない。
// ルールは backend/game_logic.py の apply_action に合わせてある(変更時は両方を更新すること)。
// バックエンド未起動時でもUIを開発・動作確認できるようにするための
// GameClient のダミー実装。HttpGameClient と同じインターフェースを満たす。
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

  reset(): Promise<void> {
    this.state = createMockGameState(this.state.gameId);
    this.emit({ type: 'state_snapshot', state: this.cloneState() });
    return Promise.resolve();
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
      case 'recover':
        if (this.state.status !== 'playing' || this.state.analysisResource >= MAX_ANALYSIS_RESOURCE) {
          return Promise.resolve({ accepted: false, reason: 'invalid_state' });
        }
        if (!this.state.nodes.some((node) => node.status === 'hacked')) {
          return Promise.resolve({ accepted: false, reason: 'node_unreachable' });
        }
        this.state.analysisResource = Math.min(MAX_ANALYSIS_RESOURCE, this.state.analysisResource + RESOURCE_RECOVERY_AMOUNT);
        this.advanceTime(RECOVERY_COST.time, RECOVERY_COST.alertDelta);
        this.log('success', '\u89e3\u6790\u8cc7\u6e90\u3092\u56de\u5fa9\u3057\u307e\u3057\u305f\u3002RESOURCE: ' + this.state.analysisResource);
        this.checkGameOver();
        this.emit({ type: 'state_snapshot', state: this.cloneState() });
        return Promise.resolve({ accepted: true });
      case 'remoteScan':
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
    // 暗号鍵の断片がすべて揃っていれば、データ回収時の警戒度上昇を0に抑える
    const silentExtract = type === 'dataExtract' && this.hasAllKeyFragments();
    this.advanceTime(cost.time, silentExtract ? 0 : cost.alertDelta);
    this.resolveAction(type, node, silentExtract);
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

    if (type === 'scan' || type === 'remoteScan') {
      if (node.status !== 'unscanned') return 'invalid_state';
      if (type === 'scan' && node.layer !== 'External' && !this.hasHackedNeighbor(node.id)) return 'node_unreachable';
    } else if (type === 'breach') {
      if (node.status === 'hacked') return 'invalid_state';

      // 入口(External)以外は、隣接ノードのどれかを侵入済みにしていないと届かない
      if (!ENTRY_LAYERS.includes(node.layer) && !this.hasHackedNeighbor(node.id)) return 'node_unreachable';
      if (node.status !== 'scanned') return 'node_not_scanned';
      if (privilegeIndex(this.state.privilege) < layerRequirement(node.layer)) {
        return 'insufficient_privilege';
      }
    } else {
      if (node.layer !== 'Core' || node.status !== 'hacked') return 'invalid_state';
      if (!isExtractTarget(node)) return 'invalid_state';
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

  private resolveAction(type: TimedActionType, node: NetworkNode, silentExtract: boolean): void {
    if (type === 'scan' || type === 'remoteScan') {
      node.status = 'scanned';
      node.vulnerability = STAGE_VULNERABILITIES[node.id] ?? null;
      this.log('success', `${node.name} のスキャンが完了しました。脆弱性: ${node.vulnerability ?? '不明'}`);
    } else if (type === 'breach') {
      node.status = 'hacked';
      // 侵入したlayerの1段上まで権限を昇格(下がることはない)
      const granted = Math.min(layerRequirement(node.layer) + 1, PRIVILEGE_LADDER.length - 1);
      if (granted > privilegeIndex(this.state.privilege)) {
        this.state.privilege = PRIVILEGE_LADDER[granted];
        this.log('success', `${node.name} への侵入に成功。権限が ${this.state.privilege} に昇格しました。`);
      } else {
        this.log('success', `${node.name} への侵入に成功しました。`);
      }
      this.applyNodeEffect(node);
    } else {
      this.state.status = 'won';
      if (silentExtract) {
        this.log('success', `復元した暗号鍵を使用し、${node.name} から極秘研究データを隠密回収しました。目的達成！`);
      } else {
        this.log('success', `${node.name} から機密データを回収しました。目的達成！`);
      }
      this.emit({ type: 'game_over', result: 'won' });
    }
  }

  // backend/game_logic.py の _apply_node_effect と同じ: 侵入成功時のステージ固有の効果
  private applyNodeEffect(node: NetworkNode): void {
    const effect = NODE_EFFECTS[node.id];
    if (!effect) {
      const reward = RESOURCE_REWARDS[node.id] ?? 0;
      this.state.analysisResource = Math.min(MAX_ANALYSIS_RESOURCE, this.state.analysisResource + reward);
      return;
    }

    if (effect.resourceBonus) {
      this.state.analysisResource = Math.min(MAX_ANALYSIS_RESOURCE, Math.max(0, this.state.analysisResource + effect.resourceBonus));
    }
    if (effect.alertDelta) {
      this.state.alertLevel = clampAlert(this.state.alertLevel + effect.alertDelta);
    }
    if (effect.log) this.log('info', effect.log);

    if (KEY_FRAGMENT_NODE_IDS.includes(node.id) && this.hasAllKeyFragments()) {
      this.log('success', 'すべての暗号鍵断片が揃いました！最終目標のデータ回収時に警戒度上昇を完全に抑えられます。');
    }
  }

  private hasAllKeyFragments(): boolean {
    return (
      KEY_FRAGMENT_NODE_IDS.length > 0 &&
      KEY_FRAGMENT_NODE_IDS.every((id) => this.state.nodes.some((n) => n.id === id && n.status === 'hacked'))
    );
  }

  private hasHackedNeighbor(nodeId: string): boolean {
    return this.state.edges.some((edge) => {
      const neighborId =
        edge.source === nodeId ? edge.target : edge.target === nodeId ? edge.source : null;
      return neighborId !== null && this.state.nodes.some((n) => n.id === neighborId && n.status === 'hacked');
    });
  }

  private hasAnyAffordableAction(): boolean {
    if (this.state.analysisResource < MAX_ANALYSIS_RESOURCE && this.state.nodes.some((node) => node.status === 'hacked')) return true;
    for (const node of this.state.nodes) {
      for (const type of ['scan', 'remoteScan', 'breach', 'dataExtract'] as const) {
        if (this.validate(type, node) === undefined) return true;
      }
    }
    return false;
  }

  private checkGameOver(): void {
    if (this.state.status !== 'playing') return;
    if (this.state.alertLevel >= 100) {
      this.state.status = 'lost';
      this.log('danger', '警戒度が限界に達しました。侵入が検知され、作戦は失敗です。');
      this.emit({ type: 'game_over', result: 'lost' });
    } else if (!this.hasAnyAffordableAction()) {
      this.state.status = 'lost';
      this.log('danger', '解析資源が枯渇しました。これ以上の作戦継続は不可能です。');
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
