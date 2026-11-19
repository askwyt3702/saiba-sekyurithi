import { useSyncExternalStore } from 'react';
import { playerSync } from '../../game/deckbattle/defaultPlayerSync';
import type { SyncState } from '../../game/deckbattle/playerSync';

/** プレイヤー登録とサーバーへの保存の状態。変わると再描画される */
export function usePlayerSync(): SyncState {
  return useSyncExternalStore(playerSync.subscribe, playerSync.getState);
}
