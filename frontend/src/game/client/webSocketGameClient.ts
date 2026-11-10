import {
  fromApiNode,
  type ActionRejectReason,
  type ActionRequest,
  type ActionResult,
  type ApiNetworkEdge,
  type ApiNetworkNode,
  type GameClient,
  type GameState,
  type GameStatus,
  type LogEntry,
  type ServerEvent,
} from '../model/types';

// バックエンドが返す GameState（nodes が ApiNetworkNode[] の形）
interface ApiGameState {
  gameId: string;
  status: GameStatus;
  elapsedSeconds: number;
  alertLevel: number;
  analysisResource: number;
  privilege: string;
  nodes: ApiNetworkNode[];
  edges: ApiNetworkEdge[];
  log: LogEntry[];
}

function toGameState(raw: ApiGameState): GameState {
  return {
    ...raw,
    nodes: raw.nodes.map(fromApiNode),
  };
}

// ターン制（v0.4決定）に合わせて REST API のみでバックエンドと通信するクライアント。
// 既存のインターフェース名に合わせてクラス名は WebSocketGameClient のままにしてある。
export class WebSocketGameClient implements GameClient {
  private readonly apiBase: string;
  private requestedGameId: string;
  private resolvedGameId: string | null = null;
  private onEvent: ((event: ServerEvent) => void) | null = null;

  constructor(gameId: string, apiBase = 'http://localhost:8000') {
    this.requestedGameId = gameId;
    this.apiBase = apiBase.replace(/\/$/, '');
  }

  async connect(onEvent: (event: ServerEvent) => void): Promise<GameState> {
    this.onEvent = onEvent;
    const initialState = await this.ensureGame();
    this.resolvedGameId = initialState.gameId;
    this.onEvent?.({ type: 'state_snapshot', state: initialState });
    return initialState;
  }

  async sendAction(action: ActionRequest): Promise<ActionResult> {
    if (!this.resolvedGameId) {
      return { accepted: false, reason: 'invalid_state' };
    }
    const res = await fetch(`${this.apiBase}/api/games/${this.resolvedGameId}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action),
    });
    if (!res.ok) {
      return { accepted: false, reason: 'invalid_state' };
    }
    const data = (await res.json()) as {
      accepted: boolean;
      reason?: ActionRejectReason;
      state: ApiGameState;
    };
    if (data.state) {
      const nextState = toGameState(data.state);
      this.onEvent?.({ type: 'state_snapshot', state: nextState });
    }
    return { accepted: data.accepted, reason: data.reason };
  }

  async resetGame(): Promise<GameState | null> {
    if (!this.resolvedGameId) return null;
    const res = await fetch(`${this.apiBase}/api/games/${this.resolvedGameId}/reset`, {
      method: 'POST',
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as ApiGameState;
    const nextState = toGameState(raw);
    this.onEvent?.({ type: 'state_snapshot', state: nextState });
    return nextState;
  }

  disconnect(): void {
    this.onEvent = null;
  }

  private async ensureGame(): Promise<GameState> {
    // 数値の gameId が指定されていればまず取得を試みる
    if (/^\d+$/.test(this.requestedGameId)) {
      const getRes = await fetch(`${this.apiBase}/api/games/${this.requestedGameId}`);
      if (getRes.ok) {
        const raw = (await getRes.json()) as ApiGameState;
        return toGameState(raw);
      }
    }
    // それ以外（"prototype-1" など）や未作成の場合は新規ゲームを作成する
    const createRes = await fetch(`${this.apiBase}/api/games`, { method: 'POST' });
    if (!createRes.ok) {
      throw new Error(`Failed to create game: ${createRes.status}`);
    }
    const raw = (await createRes.json()) as ApiGameState;
    return toGameState(raw);
  }
}
