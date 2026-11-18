// 1回のラン(docs/deckbattle-plan-v0.2.md の3章)。M1 ではランの作成とマスの並び、戦闘の作り方だけ。
// レベルアップ・進化(M2)と、マスを進める流れ・イベント・結果(M3)はここに足していく。
import { createBattle } from './battle';
import { STARTER_DECK_IDS } from './cards';
import type { BattleState, CardInstance, RunNode, RunState } from './types';

export const PLAYER_MAX_HP = 65;

/** 1回のランのマスの並び(分岐マップを足すときは、この一覧の形を変える) */
export const DEFAULT_RUN_NODES: RunNode[] = [
  { kind: 'battle', enemyIds: ['scanner_bot'] },
  { kind: 'event', eventId: 'vuln_check' },
  { kind: 'battle', enemyIds: ['ids_sensor', 'ids_sensor'] },
  { kind: 'event', eventId: 'patch' },
  { kind: 'battle', enemyIds: ['firewall_ai'] },
  { kind: 'boss', enemyIds: ['argus'] },
];

export function createCardInstance(defId: string, uid: string): CardInstance {
  return { uid, defId, level: 1, xp: 0 };
}

export function createRun(): RunState {
  const deck = STARTER_DECK_IDS.map((defId, i) => createCardInstance(defId, `c${i + 1}`));
  return {
    status: 'playing',
    deck,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    nodes: DEFAULT_RUN_NODES.map((n) => ({ ...n })),
    nodeIndex: 0,
    pendingEvolutions: [],
    askedQuestionIds: [],
    nextUid: deck.length + 1,
  };
}

/** 今のマスが戦闘(またはボス)なら、その戦闘を作る */
export function createBattleForCurrentNode(run: RunState, seed: number): BattleState {
  const node = run.nodes[run.nodeIndex];
  if (!node || node.kind === 'event') throw new Error('current node is not a battle');
  return createBattle({ deck: run.deck, playerHp: run.hp, playerMaxHp: run.maxHp, enemyIds: node.enemyIds, seed });
}
