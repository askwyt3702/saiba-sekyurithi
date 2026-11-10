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

// リロードしても同じゲームを続けられるよう、作成したゲームのIDを保存しておく。
const GAME_ID_STORAGE_KEY = 'nullroute.gameId';

function readStoredGameId(): string | null {
  try {
    return localStorage.getItem(GAME_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeGameId(gameId: string): void {
  try {
    localStorage.setItem(GAME_ID_STORAGE_KEY, gameId);
  } catch {
    // 保存できない環境(プライベートモード等)では、リロード時に新しいゲームになるだけ
  }
}

// 開発時はReactのStrictModeでeffectが2回走り、ゲーム作成リクエストが同時に2回飛ぶ。
// 進行中の作成リクエストを共有して、ゲームが2つ作られないようにする。
let pendingCreate: Promise<ApiGameState> | null = null;

function createGameOnce(apiBase: string): Promise<ApiGameState> {
  if (!pendingCreate) {
    pendingCreate = fetch(`${apiBase}/api/games`, { method: 'POST' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to create game: ${res.status}`);
        return (await res.json()) as ApiGameState;
      })
      .finally(() => {
        pendingCreate = null;
      });
  }
  return pendingCreate;
}

// ターン制（v0.4決定）に合わせて REST API のみでバックエンドと通信するクライアント。
export class HttpGameClient implements GameClient {
  private readonly apiBase: string;
  private gameId: string | null = null;
  private onEvent: ((event: ServerEvent) => void) | null = null;

  constructor(apiBase = 'http://localhost:8000') {
    this.apiBase = apiBase.replace(/\/$/, '');
  }

  async connect(onEvent: (event: ServerEvent) => void): Promise<GameState> {
    this.onEvent = onEvent;
    const initialState = await this.ensureGame();
    this.gameId = initialState.gameId;
    this.onEvent?.({ type: 'state_snapshot', state: initialState });
    return initialState;
  }

  async sendAction(action: ActionRequest): Promise<ActionResult> {
    if (!this.gameId) {
      return { accepted: false, reason: 'invalid_state' };
    }
    const res = await fetch(`${this.apiBase}/api/games/${this.gameId}/actions`, {
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
      this.onEvent?.({ type: 'state_snapshot', state: toGameState(data.state) });
    }
    return { accepted: data.accepted, reason: data.reason };
  }

  async reset(): Promise<void> {
    if (!this.gameId) return;
    const res = await fetch(`${this.apiBase}/api/games/${this.gameId}/reset`, { method: 'POST' });
    if (!res.ok) throw new Error(`Failed to reset game: ${res.status}`);
    const raw = (await res.json()) as ApiGameState;
    this.onEvent?.({ type: 'state_snapshot', state: toGameState(raw) });
  }

  disconnect(): void {
    this.onEvent = null;
  }

  private async ensureGame(): Promise<GameState> {
    const storedId = readStoredGameId();
    if (storedId) {
      const res = await fetch(`${this.apiBase}/api/games/${storedId}`);
      if (res.ok) return toGameState((await res.json()) as ApiGameState);
      // 404 はDBが作り直された等で保存済みのゲームが無いだけなので、新規作成に進む
      if (res.status !== 404) throw new Error(`Failed to load game: ${res.status}`);
    }
    const raw = await createGameOnce(this.apiBase);
    storeGameId(raw.gameId);
    return toGameState(raw);
  }
}
