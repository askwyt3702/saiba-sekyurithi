import { getStageData, type StageDefinition } from '../data/stageData';
import type { DynamicMapInfo } from './types';

/** 動的マップ(Stage 4)があればその構造を、なければ固定ステージ定義を返す */
export function resolveStageView(
  stageId: number,
  dynamicMap?: DynamicMapInfo,
): StageDefinition {
  const base = getStageData(stageId);
  if (!dynamicMap) return base;
  return {
    ...base,
    entryNodeIds: dynamicMap.entryNodeIds,
    targetNodeIds: dynamicMap.targetNodeIds,
    keyFragmentNodeIds: dynamicMap.keyFragmentNodeIds,
    nodeEffects: dynamicMap.nodeEffects,
    breachRequirements: dynamicMap.breachRequirements,
    conditionalBreachAlert: dynamicMap.conditionalBreachAlert ?? undefined,
  };
}
