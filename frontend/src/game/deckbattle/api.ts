// バックエンド(backend/main.py)とのやり取り。データの形は docs/api-contract.md で取り決めている。
// 接続先(base)と fetch は呼ぶ側から渡す(テストでは偽物の fetch を渡す)。
import type { DeckProfile } from './profile';

export const MAX_PLAYER_NAME_LENGTH = 20;

export interface ApiOptions {
  base: string;
  fetchImpl?: typeof fetch;
}

export interface PlayerResponse {
  playerId: string;
  name: string;
  profile: DeckProfile;
}

/** サーバーが返したエラー(status はHTTPのステータス。つながらないときは 0) */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(`API error ${status}: ${detail}`);
    this.status = status;
    this.detail = detail;
  }
}

/** サーバーが受け付ける項目だけを送る(古い形で保存されていた余分な項目を落とす) */
export function toProfileBody(profile: DeckProfile): DeckProfile {
  const ids = (values: unknown): string[] => (Array.isArray(values) ? values.filter((v): v is string => typeof v === 'string' && v.length > 0) : []);
  const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);
  return {
    seenCardIds: ids(profile.seenCardIds),
    unlockedBranches: ids(profile.unlockedBranches),
    seenEnemyIds: ids(profile.seenEnemyIds),
    wrongQuestionIds: ids(profile.wrongQuestionIds),
    bonusStartCoins: Math.min(3, count(profile.bonusStartCoins)),
    stats: {
      runsPlayed: count(profile.stats?.runsPlayed),
      runsWon: count(profile.stats?.runsWon),
      elitesDefeated: count(profile.stats?.elitesDefeated),
      maxEventStreak: count(profile.stats?.maxEventStreak),
      totalQuizCorrect: count(profile.stats?.totalQuizCorrect),
      reviewsCleared: count(profile.stats?.reviewsCleared),
    },
    achievements: ids(profile.achievements),
  };
}

async function request<T>(options: ApiOptions, path: string, init?: RequestInit): Promise<T> {
  const doFetch = options.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${options.base}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, 'network_error');
  }
  if (!res.ok) {
    let detail = 'request_failed';
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === 'string') detail = body.detail;
    } catch {
      // 本文が JSON でなければ、そのまま request_failed にする
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

/** 名前でプレイヤーを登録する。ブラウザで遊んでいた分のカード基地も一緒に送る */
export function createPlayer(options: ApiOptions, name: string, profile: DeckProfile): Promise<PlayerResponse> {
  return request(options, '/api/players', {
    method: 'POST',
    body: JSON.stringify({ name, profile: toProfileBody(profile) }),
  });
}

export function getPlayer(options: ApiOptions, playerId: string): Promise<PlayerResponse> {
  return request(options, `/api/players/${encodeURIComponent(playerId)}`);
}

/** カード基地を丸ごと保存する(サーバー側は送った内容で置き換える) */
export function saveProfile(options: ApiOptions, playerId: string, profile: DeckProfile): Promise<PlayerResponse> {
  return request(options, `/api/players/${encodeURIComponent(playerId)}/profile`, {
    method: 'PUT',
    body: JSON.stringify({ profile: toProfileBody(profile) }),
  });
}
