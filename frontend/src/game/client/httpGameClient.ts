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

// バックエンドが返す GameState（nodes が ApiNetworkNode[] の形）
interface ApiGameState {
  securityEvents?: GameState['securityEvents'];
  dynamicMap?: GameState['dynamicMap'];
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

function createGameOnce(
  apiBase: string,
  stageId: number,
  options?: { hardcore?: boolean; seed?: string },
): Promise<ApiGameState> {
  const key = `${apiBase}:${stageId}:${Boolean(options?.hardcore)}:${options?.seed ?? ''}`;
  let pendingCreate = pendingCreates.get(key);
  if (!pendingCreate) {
    pendingCreate = fetch(`${apiBase}/api/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stageId,
        ...(options?.hardcore ? { hardcore: true } : {}),
        ...(options?.seed ? { seed: options.seed } : {}),
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to create game: ${res.status}`);
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
  private readonly apiBase: string;
  private readonly stageId: number;
  private readonly hardcore: boolean;
  private readonly seed?: string;
  private gameId: string | null = null;
  private onEvent: ((event: ServerEvent) => void) | null = null;

  constructor(
    apiBase = 'http://localhost:8000',
    stageId = DEFAULT_STAGE_ID,
    options?: { hardcore?: boolean; seed?: string },
  ) {
    this.apiBase = apiBase.replace(/\/$/, '');
    this.stageId = stageId;
    this.hardcore = Boolean(options?.hardcore);
    this.seed = options?.seed;
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
    const res = await fetch(`${this.apiBase}/api/games/${this.gameId}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stageId: this.stageId,
        ...(this.hardcore ? { hardcore: true } : {}),
        ...(this.seed ? { seed: this.seed } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Failed to reset game: ${res.status}`);
    const raw = (await res.json()) as ApiGameState;
    if (raw.stageId !== this.stageId) throw new Error('リセット先のステージが一致しません。');
    this.onEvent?.({ type: 'state_snapshot', state: toGameState(raw) });
  }

  disconnect(): void {
    this.onEvent = null;
  }

  private async ensureGame(): Promise<GameState> {
    const storedId = !this.hardcore && !this.seed ? readStoredGameId(this.stageId) : null;
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
      if (!res.ok && res.status !== 404) throw new Error(`Failed to load game: ${res.status}`);
    }
    const raw = await createGameOnce(this.apiBase, this.stageId, {
      hardcore: this.hardcore,
      seed: this.seed,
    });
    if (raw.stageId !== this.stageId) throw new Error('指定ステージを開始できません。バックエンドの更新を確認してください。');
    if (!this.hardcore && !this.seed) storeGameId(raw.gameId, this.stageId);
    return toGameState(raw);
  }
}
