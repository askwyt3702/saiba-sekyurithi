import { CARD_DEFINITIONS } from './cards';
import { ENEMY_DEFINITIONS } from './enemies';
import { RELIC_DEFINITIONS } from './relics';
import type { BattleState, RunState } from './types';

const KEY = 'deck-breach:active-run';
const VERSION = 1;
const PHASES = new Set(['start_bonus', 'map', 'battle', 'post_battle', 'reward', 'evolve', 'event',
  'mystery', 'rest', 'shop', 'act_clear', 'echo', 'run_result']);

export interface RunCheckpoint<View> {
  run: RunState;
  battle: BattleState;
  view: View;
}

export function readRunCheckpoint<View>(storage?: Pick<Storage, 'getItem'>): RunCheckpoint<View> | null {
  try {
    const raw = JSON.parse((storage ?? localStorage).getItem(KEY) ?? 'null');
    const data = raw?.data;
    const run: RunState = data?.run;
    const battle: BattleState = data?.battle;
    if (raw?.version !== VERSION || !PHASES.has(data?.view?.phase) || !run || !battle ||
      ![1, 2].includes(run.act ?? 1) || !['playing', 'won', 'lost'].includes(run.status) ||
      !run.map?.nodes?.[run.currentNodeId] || !Number.isFinite(run.hp) || !Number.isFinite(run.maxHp) ||
      !Array.isArray(run.deck) || run.deck.length === 0 || !run.deck.every((card) => CARD_DEFINITIONS[card.defId]) ||
      !Array.isArray(run.relics) || !run.relics.every((id) => RELIC_DEFINITIONS[id]) ||
      !Array.isArray(run.pendingEvolutions) || !Array.isArray(run.tools) || !Array.isArray(run.askedQuestionIds) ||
      !Array.isArray(run.startBonusChoices) || !Array.isArray(run.seenMysteryIds) ||
      !Array.isArray(run.visitedNodeIds) || !Array.isArray(battle.enemies) ||
      !battle.enemies.every((enemy) => ENEMY_DEFINITIONS[enemy.defId]) ||
      !battle.player || !battle.cards || !Array.isArray(battle.hand) ||
      (data.view.phase === 'echo' && !['echo', 'accepted'].includes(run.intermission?.step ?? '')) ||
      (data.view.phase === 'echo' && (!Array.isArray(run.intermission?.choices) ||
        run.intermission.choices.length !== 3 || new Set(run.intermission.choices).size !== 3 ||
        !run.intermission.choices.every((id) => id.startsWith('echo_') && RELIC_DEFINITIONS[id]))) ||
      (data.view.phase === 'event' && !data.view.eventView) ||
      (data.view.phase === 'mystery' && !data.view.mysteryView) ||
      (['post_battle', 'reward'].includes(data.view.phase) && !data.view.postBattle)) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * 自動保存を残すか。準備画面にいるときと、終わったラン(勝ち・負け)は残さない。
 * 終わったランを残すと、次に開いたときにタイトルを飛ばして古い結果画面が出たり、
 * ミッション選択から入り直しても結果画面に戻ったりする(戦績は保存より先に記録している)
 */
export function shouldKeepRunCheckpoint(phase: string, run: Pick<RunState, 'status'>): boolean {
  return phase !== 'setup' && run.status === 'playing';
}

export function saveRunCheckpoint<View>(data: RunCheckpoint<View> | null, storage?: Pick<Storage, 'setItem' | 'removeItem'>): void {
  try {
    const target = storage ?? localStorage;
    if (data) target.setItem(KEY, JSON.stringify({ version: VERSION, data }));
    else target.removeItem(KEY);
  } catch {
    // ストレージが無効でも、現在のタブではプレイを続けられる。
  }
}
