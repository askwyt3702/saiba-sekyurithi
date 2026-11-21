// 画面で使うカード基地の保存の仕組み(1つだけ作る)。接続先は環境変数 VITE_API_BASE で変えられる。
import { createPlayerSync } from './playerSync';
import { setProfileSaveListener } from './profile';

export const API_BASE: string = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

function browserStorage() {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export const playerSync = createPlayerSync({ api: { base: API_BASE }, storage: browserStorage() });

/** 起動時に1回呼ぶ。カード基地を保存するたびにサーバーへも送るようにし、サーバーの内容を読み込む */
export function startPlayerSync(): void {
  setProfileSaveListener((profile) => playerSync.onProfileSaved(profile));
  void playerSync.start();
}
