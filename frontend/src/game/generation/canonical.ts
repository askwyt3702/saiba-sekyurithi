import { STAGE1_INTERNAL_KEYS, STAGE1_EFFECT_KEYS } from '../data/stageData';
import type { GameMapDefinition } from '../model/mapDefinition';
import { sha256 } from './random';

/** Python canonical_json normalization; generation values are finite JSON data. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite canonical number');
    if (Number.isInteger(value)) return BigInt(value).toString();
    if (Math.abs(value) < 0.0001) {
      const [mantissa, exponent] = value.toExponential().split('e');
      const exp = Number(exponent);
      return `${mantissa}e${exp < 0 ? '-' : '+'}${Math.abs(exp).toString().padStart(2,'0')}`;
    }
    return value.toString();
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value instanceof Set) return canonicalJson([...value].sort());
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
  }
  throw new Error('Unsupported canonical value');
}
export const digest = (value: unknown): string => sha256(canonicalJson(value));

/** Convert the TS map into exactly the Python internal hash payload, not public DTO. */
export function internalDefinition(map: GameMapDefinition): Record<string, unknown> {
  const r = map.rules, monitor = map.conditionalBreachAlert;
  const effects = Object.fromEntries(Object.entries(map.nodeEffects).map(([id,e]) => {
    const values: Record<string, unknown> = {resource_bonus:e.resourceBonus,alert_delta:e.alertDelta,log:e.log};
    const keys = (STAGE1_EFFECT_KEYS as Record<string,string[]>)[id];
    return [id, Object.fromEntries(keys.map(key => [key,values[key]]))];
  }));
  const all: Record<string, unknown> = {
    id:map.id,name:map.name,difficulty:map.difficulty,start_message:map.startMessage,prototype_notice:map.prototypeNotice,
    nodes:map.nodes.map(n => ({id:n.id,name:n.name,layer:n.layer,pos_x:n.position.x,pos_y:n.position.y,
      info:n.info,vulnerability:map.vulnerabilities[n.id] ?? null})), edges:map.edges,
    entry_layers:[...map.entryLayers].sort(),entry_node_ids:[...map.entryNodeIds].sort(),target_node_ids:[...map.targetNodeIds].sort(),
    key_fragment_node_ids:[...map.keyFragmentNodeIds].sort(),important_node_ids:[...map.importantNodeIds].sort(),node_effects:effects,
    security_rules:map.securityRules,seed:map.seed,generator_version:map.generatorVersion,rules_version:map.rulesVersion,
    conditional_breach_alert:monitor ? {disabled_by_node_id:monitor.disabledByNodeId,target_node_ids:monitor.targetNodeIds,alert_delta:monitor.alertDelta}:null,
    breach_requirements:map.breachRequirements,
    initial_state:{game_time:map.initialState.elapsedSeconds,alert_level:map.initialState.alertLevel,analysis_resource:map.initialState.analysisResource,
      current_privilege:map.initialState.privilege,game_status:map.initialState.status},
    action_costs:Object.fromEntries(Object.entries(r.costs).map(([id,c])=>[id,{time:c.time,resource:c.resource,alert_delta:c.alertDelta}])),
    alert_decay_per_second:r.alertDecayPerSecond,max_analysis_resource:r.maxAnalysisResource,resource_recovery_amount:r.resourceRecoveryAmount,
    alert_game_over_threshold:r.alertGameOverThreshold,privilege_ladder:r.privilegeLadder,layer_order:r.layerOrder,
    evaluation_config:r.evaluation,resource_rewards:r.resourceRewards,
  };
  return Object.fromEntries(STAGE1_INTERNAL_KEYS.map(key=>[key,all[key]]));
}
