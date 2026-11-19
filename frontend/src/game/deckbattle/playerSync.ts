// カード基地をバックエンドに保存する仕組み。
// - ブラウザ(localStorage)にも今までどおり保存し、サーバーにつながらないときはブラウザの分だけで遊べる
// - プレイヤー登録済みなら、カード基地を保存するたびにサーバーへも送る(送る順番は守り、最後の内容が残る)
// - 起動時はサーバーの内容を読み込む。ただし送れていない変更が残っていれば、先にそれを送る
import { ApiError, createPlayer, getPlayer, saveProfile, type ApiOptions } from './api';
import { loadDeckProfile, saveDeckProfile, type DeckProfile, type StorageLike } from './profile';

export const PLAYER_STORAGE_KEY = 'cyber_mystery_deck_player_v1';
/** サーバーに送れていない変更があるときの印 */
export const SYNC_PENDING_KEY = 'cyber_mystery_deck_sync_pending_v1';

export interface RegisteredPlayer {
  playerId: string;
  name: string;
}

/**
 * - unregistered: 名前をまだ登録していない(ブラウザだけに保存)
 * - connecting: 起動時にサーバーと照らし合わせている
 * - synced: サーバーに保存済み
 * - saving: サーバーへ送っている途中
 * - offline: 登録済みだがサーバーにつながらない(ブラウザに保存し、つながったら送る)
 */
export type SyncStatus = 'unregistered' | 'connecting' | 'synced' | 'saving' | 'offline';

export interface SyncState {
  player: RegisteredPlayer | null;
  status: SyncStatus;
}

export interface PlayerSyncDeps {
  api: ApiOptions;
  storage: StorageLike | null;
}

export interface PlayerSync {
  getState(): SyncState;
  subscribe(listener: () => void): () => void;
  /** 起動時に1回呼ぶ(2回目以降は何もしない) */
  start(): Promise<void>;
  /** 名前を登録する。失敗したら ApiError を投げる */
  register(name: string): Promise<void>;
  /** カード基地が保存されたときに呼ぶ(profile.ts の保存の通知から呼ばれる) */
  onProfileSaved(profile: DeckProfile): void;
  /** 送っている途中の分が終わるまで待つ(テスト用) */
  idle(): Promise<void>;
}

function readPlayer(storage: StorageLike | null): RegisteredPlayer | null {
  try {
    const raw = storage?.getItem(PLAYER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RegisteredPlayer>;
    if (typeof parsed.playerId === 'string' && parsed.playerId && typeof parsed.name === 'string') {
      return { playerId: parsed.playerId, name: parsed.name };
    }
  } catch {
    // 壊れていたら未登録として扱う
  }
  return null;
}

function writeItem(storage: StorageLike | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // 保存できない環境では無視する
  }
}

export function createPlayerSync({ api, storage }: PlayerSyncDeps): PlayerSync {
  let state: SyncState = { player: readPlayer(storage), status: 'unregistered' };
  state = { ...state, status: state.player ? 'connecting' : 'unregistered' };
  const listeners = new Set<() => void>();
  let started = false;
  let sending: Promise<void> | null = null;
  let queued: DeckProfile | null = null;

  const setState = (next: Partial<SyncState>) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };
  const isPending = () => {
    try {
      return storage?.getItem(SYNC_PENDING_KEY) === '1';
    } catch {
      return false;
    }
  };
  const setPending = (pending: boolean) => writeItem(storage, SYNC_PENDING_KEY, pending ? '1' : '0');

  const forgetPlayer = () => {
    writeItem(storage, PLAYER_STORAGE_KEY, '');
    setPending(false);
    setState({ player: null, status: 'unregistered' });
  };

  /** 最後に保存された内容を、1件ずつ順番にサーバーへ送る */
  const flush = (): Promise<void> => {
    if (sending) return sending;
    sending = (async () => {
      while (queued && state.player) {
        const profile = queued;
        queued = null;
        setState({ status: 'saving' });
        try {
          await saveProfile(api, state.player.playerId, profile);
          if (!queued) {
            setPending(false);
            setState({ status: 'synced' });
          }
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) {
            // サーバーのデータが消えていた(DB を作り直したなど)。ブラウザの分は残して未登録に戻す
            forgetPlayer();
          } else {
            setState({ status: 'offline' });
          }
          queued = null;
          break;
        }
      }
    })().finally(() => {
      sending = null;
    });
    return sending;
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async start() {
      if (started) return;
      started = true;
      const player = state.player;
      if (!player) return;
      setState({ status: 'connecting' });
      if (isPending()) {
        // つながらなかった間の変更を先に送る(サーバーの古い内容で上書きしない)
        queued = loadDeckProfile(storage);
        await flush();
        return;
      }
      try {
        const remote = await getPlayer(api, player.playerId);
        // サーバーの内容をブラウザに写す。サーバーへ送り返す必要はないので通知しない
        saveDeckProfile(remote.profile, storage, { silent: true });
        setState({ player: { playerId: remote.playerId, name: remote.name }, status: 'synced' });
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) forgetPlayer();
        else setState({ status: 'offline' });
      }
    },
    async register(name) {
      const created = await createPlayer(api, name, loadDeckProfile(storage));
      const player = { playerId: created.playerId, name: created.name };
      writeItem(storage, PLAYER_STORAGE_KEY, JSON.stringify(player));
      saveDeckProfile(created.profile, storage, { silent: true });
      setPending(false);
      setState({ player, status: 'synced' });
    },
    onProfileSaved(profile) {
      if (!state.player) return;
      setPending(true);
      queued = profile;
      void flush();
    },
    async idle() {
      while (sending) await sending;
    },
  };
}
