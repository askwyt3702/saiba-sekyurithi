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
  type PendingAction,
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
  pendingActions?: PendingAction[];
  log: LogEntry[];
}

type RawServerEvent =
  | { type: 'state_snapshot'; state: ApiGameState }
  | { type: 'tick'; elapsedSeconds: number; alertLevel: number }
  | { type: 'node_update'; node: ApiNetworkNode }
  | { type: 'log'; entry: LogEntry }
  | { type: 'game_over'; result: 'won' | 'lost' };

function toGameState(raw: ApiGameState): GameState {
  return {
    ...raw,
    nodes: raw.nodes.map(fromApiNode),
  };
}

function toServerEvent(raw: RawServerEvent): ServerEvent {
  if (raw.type === 'state_snapshot') {
    return { type: 'state_snapshot', state: toGameState(raw.state) };
  }
  if (raw.type === 'node_update') {
    return { type: 'node_update', node: fromApiNode(raw.node) };
  }
  return raw;
}

export class WebSocketGameClient implements GameClient {
  private readonly apiBase: string;
  private readonly wsBase: string;
  private requestedGameId: string;
  private resolvedGameId: string | null = null;
  private ws: WebSocket | null = null;

  constructor(gameId: string, apiBase = 'http://localhost:8000') {
    this.requestedGameId = gameId;
    this.apiBase = apiBase.replace(/\/$/, '');
    this.wsBase = this.apiBase.replace(/^http/, 'ws');
  }

  async connect(onEvent: (event: ServerEvent) => void): Promise<GameState> {
    const initialState = await this.ensureGame();
    this.resolvedGameId = initialState.gameId;

    const ws = new WebSocket(`${this.wsBase}/ws/games/${this.resolvedGameId}`);
    this.ws = ws;

    ws.onmessage = (msg) => {
      try {
        const raw = JSON.parse(msg.data as string) as RawServerEvent;
        onEvent(toServerEvent(raw));
      } catch (err) {
        console.error('[WebSocketGameClient] failed to parse event:', err);
      }
    };

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
    };
    return { accepted: data.accepted, reason: data.reason };
  }

  async resetGame(): Promise<GameState | null> {
    if (!this.resolvedGameId) return null;
    const res = await fetch(`${this.apiBase}/api/games/${this.resolvedGameId}/reset`, {
      method: 'POST',
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as ApiGameState;
    return toGameState(raw);
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
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
