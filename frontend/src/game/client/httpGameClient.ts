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
  type KeyFragments,
  type LogEntry,
  type MissionEvaluation,
  type ServerEvent,
} from '../model/types';
import { DEFAULT_STAGE_ID } from '../data/stageData';

export class HttpGameError extends Error {
  readonly status?: number;
  readonly code?: string;
  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
  get isSnapshotInvalid(): boolean {
    return this.status === 409 && this.code === 'map_snapshot_invalid';
  }
}

async function responseError(res: Response, message: string): Promise<HttpGameError> {
  let code: string | undefined;
  try {
    const body = await res.json();
    if (typeof body?.detail === 'string') code = body.detail;
  } catch { /* Proxies may return a non-JSON error page. */ }
  return new HttpGameError(`${message}: ${res.status}`, res.status, code);
}

// バックエンドが返す GameState（nodes が ApiNetworkNode[] の形）
interface ApiGameState {
  mapSnapshot?: GameState['mapSnapshot'];
  securityEvents?: GameState['securityEvents'];
  gameId: string;
  stageId?: number;
  evaluation: MissionEvaluation | null;
  keyFragments?: KeyFragments;
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
  if (raw.mapSnapshot && (raw.mapSnapshot.schemaVersion !== 1 || raw.mapSnapshot.definition.id !== raw.stageId)) {
    throw new HttpGameError('Unsupported or inconsistent saved map', 409, 'map_snapshot_invalid');
  }
  return {
    ...raw,
    nodes: raw.nodes.map(fromApiNode),
  };
}

// リロードしても同じゲームを続けられるよう、作成したゲームのIDを保存しておく。
const GAME_ID_STORAGE_KEY = 'nullroute.gameId';

function stageStorageKey(stageId: number): string {
  return `${GAME_ID_STORAGE_KEY}.${stageId}`;
}

function readStoredGameId(stageId: number): string | null {
  try {
    return localStorage.getItem(stageStorageKey(stageId)) ?? localStorage.getItem(GAME_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeGameId(gameId: string, stageId: number, onlyIfEmpty = false): void {
  try {
    const key = stageStorageKey(stageId);
    if (!onlyIfEmpty || localStorage.getItem(key) === null) localStorage.setItem(key, gameId);
  } catch {
    // 保存できない環境(プライベートモード等)では、リロード時に新しいゲームになるだけ
  }
}

// 開発時はReactのStrictModeでeffectが2回走り、ゲーム作成リクエストが同時に2回飛ぶ。
// 進行中の作成リクエストを共有して、ゲームが2つ作られないようにする。
const pendingCreates = new Map<string, Promise<ApiGameState>>();

function createGameOnce(apiBase: string, stageId: number): Promise<ApiGameState> {
  const key = `${apiBase}:${stageId}`;
  let pendingCreate = pendingCreates.get(key);
  if (!pendingCreate) {
    pendingCreate = fetch(`${apiBase}/api/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageId }),
    })
      .then(async (res) => {
        if (!res.ok) throw await responseError(res, 'Failed to create game');
        return (await res.json()) as ApiGameState;
      })
      .finally(() => {
        pendingCreates.delete(key);
      });
    pendingCreates.set(key, pendingCreate);
  }
  return pendingCreate;
}

// ターン制（v0.4決定）に合わせて REST API のみでバックエンドと通信するクライアント。
export class HttpGameClient implements GameClient {
  get hasSavedGame(): boolean { return readStoredGameId(this.stageId) !== null; }
  private readonly apiBase: string;
  private readonly stageId: number;
  private gameId: string | null = null;
  private onEvent: ((event: ServerEvent) => void) | null = null;

  constructor(apiBase = 'http://localhost:8000', stageId = DEFAULT_STAGE_ID) {
    this.apiBase = apiBase.replace(/\/$/, '');
    this.stageId = stageId;
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
      const error = await responseError(res, 'Failed to perform action');
      if (error.isSnapshotInvalid) throw error;
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
    const res = await fetch(`${this.apiBase}/api/games/${this.gameId}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageId: this.stageId }),
    });
    if (!res.ok) throw await responseError(res, 'Failed to reset game');
    const raw = (await res.json()) as ApiGameState;
    if (raw.stageId !== this.stageId) throw new Error('リセット先のステージが一致しません。');
    this.onEvent?.({ type: 'state_snapshot', state: toGameState(raw) });
  }

  disconnect(): void {
    this.onEvent = null;
  }

  private async ensureGame(): Promise<GameState> {
    const storedId = readStoredGameId(this.stageId);
    if (storedId) {
      const res = await fetch(`${this.apiBase}/api/games/${storedId}`);
      if (res.ok) {
        const raw = (await res.json()) as ApiGameState;
        if (raw.stageId === this.stageId) {
          storeGameId(raw.gameId, this.stageId);
          return toGameState(raw);
        }
        // 旧共有キーが別ミッションを指していても、その進行をリセットしない。
        if (raw.stageId !== undefined) storeGameId(raw.gameId, raw.stageId, true);
      }
      // 404 はDBが作り直された等で保存済みのゲームが無いだけなので、新規作成に進む
      if (!res.ok && res.status !== 404) throw await responseError(res, 'Failed to load game');
    }
    const raw = await createGameOnce(this.apiBase, this.stageId);
    if (raw.stageId !== this.stageId) throw new Error('指定ステージを開始できません。バックエンドの更新を確認してください。');
    storeGameId(raw.gameId, this.stageId);
    return toGameState(raw);
  }
}
